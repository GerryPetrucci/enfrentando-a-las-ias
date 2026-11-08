using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace PuenteWorldBox
{
    // ---------------------------------------------------------------------------------------
    // Acciones anunciadas
    // ---------------------------------------------------------------------------------------

    /// <summary>Tipos de parametro. Los nombres que viajan en /v1/info son entero|numero|cadena|booleano.</summary>
    public enum TipoParametro { Entero, Numero, Cadena, Booleano }

    /// <summary>
    /// Parametro de una accion. Todos los parametros declarados son obligatorios (el protocolo v1 no
    /// tiene opcionales) y los no declarados se rechazan.
    /// Minimo/Maximo acotan el valor; en una Cadena acotan su LONGITUD.
    /// </summary>
    public sealed class ParametroAccion
    {
        public string Nombre { get; private set; }
        public TipoParametro Tipo { get; private set; }
        public double? Minimo { get; private set; }
        public double? Maximo { get; private set; }
        /// <summary>Valores permitidos (cadenas, enteros o booleanos); null = sin lista cerrada.</summary>
        public object[] Valores { get; private set; }

        private ParametroAccion() { }

        public static ParametroAccion Entero(string nombre, long minimo, long maximo)
        {
            return Crear(nombre, TipoParametro.Entero, minimo, maximo, null);
        }

        public static ParametroAccion Numero(string nombre, double minimo, double maximo)
        {
            return Crear(nombre, TipoParametro.Numero, minimo, maximo, null);
        }

        public static ParametroAccion Booleano(string nombre)
        {
            return Crear(nombre, TipoParametro.Booleano, null, null, null);
        }

        /// <summary>Cadena de longitud minLong..maxLong (maxLong &lt;= 200).</summary>
        public static ParametroAccion Cadena(string nombre, int minLong, int maxLong)
        {
            return Crear(nombre, TipoParametro.Cadena, minLong, maxLong, null);
        }

        /// <summary>Cadena restringida a una lista cerrada de valores.</summary>
        public static ParametroAccion CadenaEnum(string nombre, params string[] valores)
        {
            if (valores == null || valores.Length == 0) throw new ArgumentException("Falta la lista de valores.");
            int max = 0;
            foreach (string v in valores) { if (v == null) throw new ArgumentException("Valor nulo."); max = Math.Max(max, v.Length); }
            return Crear(nombre, TipoParametro.Cadena, 0, max, (object[])valores.Clone());
        }

        public static ParametroAccion EntEnum(string nombre, params long[] valores)
        {
            if (valores == null || valores.Length == 0) throw new ArgumentException("Falta la lista de valores.");
            object[] o = new object[valores.Length];
            long min = long.MaxValue, max = long.MinValue;
            for (int k = 0; k < valores.Length; k++) { o[k] = valores[k]; min = Math.Min(min, valores[k]); max = Math.Max(max, valores[k]); }
            return Crear(nombre, TipoParametro.Entero, min, max, o);
        }

        private static ParametroAccion Crear(string nombre, TipoParametro tipo, double? min, double? max, object[] valores)
        {
            if (!RegistroAcciones.NombreValido(nombre)) throw new ArgumentException("Nombre de parametro invalido: " + nombre);
            if (tipo != TipoParametro.Booleano)
            {
                if (min == null || max == null || min.Value > max.Value) throw new ArgumentException("Rango invalido en " + nombre);
                if (tipo == TipoParametro.Cadena && (min.Value < 0 || max.Value > RegistroAcciones.MaxLongitudCadena))
                    throw new ArgumentException("Longitud de cadena fuera de 0.." + RegistroAcciones.MaxLongitudCadena + " en " + nombre);
            }
            ParametroAccion p = new ParametroAccion();
            p.Nombre = nombre;
            p.Tipo = tipo;
            p.Minimo = min;
            p.Maximo = max;
            p.Valores = valores;
            return p;
        }

        public string NombreTipo
        {
            get
            {
                switch (Tipo)
                {
                    case TipoParametro.Entero: return "entero";
                    case TipoParametro.Numero: return "numero";
                    case TipoParametro.Cadena: return "cadena";
                    default: return "booleano";
                }
            }
        }
    }

    /// <summary>
    /// Accion que el puente anuncia en /v1/info.
    /// Verificada = true significa "se implemento Y se comprobo contra el juego real". El protocolo
    /// obliga a anunciar solo acciones verificadas, asi que RegistroAcciones rechaza las que no lo esten.
    /// </summary>
    public sealed class DescripcionAccion
    {
        public string Nombre { get; private set; }
        public string Descripcion { get; private set; }
        public bool Verificada { get; private set; }
        public IList<ParametroAccion> Parametros { get; private set; }

        /// <summary>
        /// Costo en puntos de accion que el REGLAMENTO asigna a esta accion (opcional; null = no se anuncia).
        /// Es solo informacion para el cliente: el puente NO cobra puntos.
        /// </summary>
        public int? Puntos { get; private set; }

        /// <summary>
        /// Enfriamiento en turnos que el reglamento asigna (opcional). El puente NO lo aplica: ni cooldowns ni
        /// "desde_turno" se hacen cumplir aqui; lo hace el orquestador Node (ver README, "Que garantiza cada capa").
        /// </summary>
        public int? Cooldown { get; private set; }

        public DescripcionAccion(string nombre, string descripcion, bool verificada, params ParametroAccion[] parametros)
        {
            Nombre = nombre;
            Descripcion = descripcion;
            Verificada = verificada;
            Parametros = new List<ParametroAccion>(parametros ?? new ParametroAccion[0]).AsReadOnly();
        }

        /// <summary>
        /// Anuncia puntos (0..100) y cooldown (0..1000) en /v1/info como campos OPCIONALES de la accion. Solo informacion:
        /// el puente no los aplica. Devuelve this para encadenar.
        /// </summary>
        public DescripcionAccion ConCosto(int puntos, int cooldown)
        {
            if (puntos < 0 || puntos > 100) throw new ArgumentException("puntos fuera de 0..100.");
            if (cooldown < 0 || cooldown > 1000) throw new ArgumentException("cooldown fuera de 0..1000.");
            Puntos = puntos;
            Cooldown = cooldown;
            return this;
        }
    }

    /// <summary>
    /// Reglas de accion que NO dependen del juego y que comparten el mundo real y el simulado, para poder probarlas sin
    /// abrir WorldBox. Todo lo que el MODELO puede equivocar (un objetivo que no existe, pedir mas de lo que cabe) se
    /// responde con un rechazo estructurado (HTTP 200, resultado "rechazada"), nunca con un error HTTP.
    /// </summary>
    public static class ReglasAccion
    {
        public const string CodigoObjetivoInvalido = "objetivo_invalido";
        public const string CodigoObjetivoPropio = "objetivo_propio";
        public const string CodigoSinEspacio = "sin_espacio";
        public const string CodigoTopeUnidades = "tope_unidades";

        /// <summary>
        /// null si el objetivo es una faccion DISTINTA del actor que existe en el escenario; si no, el rechazo:
        /// objetivo_invalido (no existe o falta) u objetivo_propio (es el propio actor).
        /// </summary>
        public static ResultadoAccion ValidarObjetivo(string actor, string objetivo, IEnumerable<string> idsFacciones)
        {
            if (string.IsNullOrEmpty(objetivo))
                return ResultadoAccion.De(ResultadoAccion.Rechazada, CodigoObjetivoInvalido, "Falta el objetivo.", null);
            bool existe = false;
            foreach (string id in idsFacciones) { if (id == objetivo) { existe = true; break; } }
            if (!existe)
                return ResultadoAccion.De(ResultadoAccion.Rechazada, CodigoObjetivoInvalido,
                    "La faccion '" + Texto.Limpiar(objetivo, 40) + "' no existe en este escenario.", null);
            if (objetivo == actor)
                return ResultadoAccion.De(ResultadoAccion.Rechazada, CodigoObjetivoPropio, "El objetivo no puede ser la propia faccion.", null);
            return null;
        }

        /// <summary>
        /// Crear unidades es TODO O NADA: si las casillas aptas no alcanzan para lo pedido, o se superaria el tope por
        /// faccion y partida, se rechaza sin tocar el mundo ni el cupo. null = se puede crear exactamente `pedidas`.
        /// </summary>
        public static ResultadoAccion ValidarCreacion(int pedidas, int casillasLibres, int creadasAntes, int tope)
        {
            if (creadasAntes + pedidas > tope)
                return ResultadoAccion.De(ResultadoAccion.Rechazada, CodigoTopeUnidades,
                    "Superaria el tope de " + tope + " unidades creadas por faccion y partida.", null);
            if (casillasLibres < pedidas)
                return ResultadoAccion.De(ResultadoAccion.Rechazada, CodigoSinEspacio,
                    "Hay " + casillasLibres + " casillas libres y se pidieron " + pedidas + "; no se crea ninguna.", null);
            return null;
        }
    }

    public sealed class ResultadoValidacion
    {
        public bool Valido { get; private set; }
        public string Codigo { get; private set; }
        public string Mensaje { get; private set; }
        public Dictionary<string, object> Parametros { get; private set; }

        public static ResultadoValidacion Bueno(Dictionary<string, object> parametros)
        {
            ResultadoValidacion r = new ResultadoValidacion();
            r.Valido = true;
            r.Parametros = parametros;
            return r;
        }

        public static ResultadoValidacion Malo(string codigo, string mensaje)
        {
            ResultadoValidacion r = new ResultadoValidacion();
            r.Valido = false;
            r.Codigo = codigo;
            r.Mensaje = mensaje;
            return r;
        }
    }

    /// <summary>Registro inmutable de acciones anunciadas; legible desde cualquier hilo.</summary>
    public sealed class RegistroAcciones
    {
        public const int MaxLongitudCadena = 200;
        private static readonly Regex PatronNombre = new Regex("^[a-z_]{1,40}$", RegexOptions.CultureInvariant);

        private readonly List<DescripcionAccion> ordenadas;
        private readonly Dictionary<string, DescripcionAccion> porNombre;

        public RegistroAcciones(IEnumerable<DescripcionAccion> acciones)
        {
            ordenadas = new List<DescripcionAccion>();
            porNombre = new Dictionary<string, DescripcionAccion>();
            foreach (DescripcionAccion a in acciones)
            {
                if (a == null) throw new ArgumentException("Accion nula.");
                if (!NombreValido(a.Nombre)) throw new ArgumentException("Nombre de accion invalido: " + a.Nombre);
                if (!a.Verificada)
                    throw new ArgumentException("La accion '" + a.Nombre + "' no esta verificada: solo se anuncian acciones implementadas y comprobadas.");
                if (porNombre.ContainsKey(a.Nombre)) throw new ArgumentException("Accion repetida: " + a.Nombre);
                HashSet<string> vistos = new HashSet<string>();
                foreach (ParametroAccion p in a.Parametros)
                {
                    if (!vistos.Add(p.Nombre)) throw new ArgumentException("Parametro repetido en " + a.Nombre + ": " + p.Nombre);
                }
                ordenadas.Add(a);
                porNombre[a.Nombre] = a;
            }
        }

        public static bool NombreValido(string nombre)
        {
            return nombre != null && PatronNombre.IsMatch(nombre);
        }

        public IList<DescripcionAccion> Todas { get { return ordenadas.AsReadOnly(); } }

        public bool Contiene(string nombre)
        {
            return nombre != null && porNombre.ContainsKey(nombre);
        }

        /// <summary>
        /// Valida nombre y parametros contra lo anunciado (lista blanca, tipos, rangos, valores).
        /// No toca el juego: es seguro llamarla desde el hilo de red. IMundo.Ejecutar revalida lo suyo
        /// (existencia de la faccion, recursos, cooldowns).
        /// </summary>
        public ResultadoValidacion Validar(string accion, IDictionary<string, object> parametros)
        {
            DescripcionAccion a;
            if (accion == null || !porNombre.TryGetValue(accion, out a))
                return ResultadoValidacion.Malo("accion_desconocida", "La accion '" + Cortar(accion) + "' no esta anunciada.");

            Dictionary<string, object> limpios = new Dictionary<string, object>();
            IDictionary<string, object> dado = parametros ?? new Dictionary<string, object>();

            foreach (string k in dado.Keys)
            {
                bool declarado = false;
                foreach (ParametroAccion p in a.Parametros) { if (p.Nombre == k) { declarado = true; break; } }
                if (!declarado) return ResultadoValidacion.Malo("parametro_invalido", "Parametro no declarado: '" + Cortar(k) + "'.");
            }

            foreach (ParametroAccion p in a.Parametros)
            {
                object v;
                if (!dado.TryGetValue(p.Nombre, out v) || v == null)
                    return ResultadoValidacion.Malo("parametro_invalido", "Falta el parametro '" + p.Nombre + "'.");
                string error = ValidarValor(p, v);
                if (error != null) return ResultadoValidacion.Malo("parametro_invalido", "Parametro '" + p.Nombre + "': " + error);
                limpios[p.Nombre] = v;
            }
            return ResultadoValidacion.Bueno(limpios);
        }

        private static string ValidarValor(ParametroAccion p, object v)
        {
            switch (p.Tipo)
            {
                case TipoParametro.Booleano:
                    return v is bool ? null : "debe ser booleano.";
                case TipoParametro.Entero:
                    {
                        if (!(v is long)) return "debe ser un entero.";
                        long n = (long)v;
                        if (n < p.Minimo.Value || n > p.Maximo.Value) return "fuera de rango " + Num(p.Minimo.Value) + ".." + Num(p.Maximo.Value) + ".";
                        if (p.Valores != null && !EnLista(p.Valores, v)) return "valor no permitido.";
                        return null;
                    }
                case TipoParametro.Numero:
                    {
                        double d;
                        if (v is long) d = (long)v;
                        else if (v is double) d = (double)v;
                        else return "debe ser un numero.";
                        if (d < p.Minimo.Value || d > p.Maximo.Value) return "fuera de rango " + Num(p.Minimo.Value) + ".." + Num(p.Maximo.Value) + ".";
                        return null;
                    }
                default:
                    {
                        string s = v as string;
                        if (s == null) return "debe ser una cadena.";
                        if (s.Length < p.Minimo.Value || s.Length > p.Maximo.Value) return "longitud fuera de " + Num(p.Minimo.Value) + ".." + Num(p.Maximo.Value) + ".";
                        for (int i = 0; i < s.Length; i++) { if (s[i] < 0x20 || s[i] == 0x7f) return "caracteres de control no permitidos."; }
                        if (p.Valores != null && !EnLista(p.Valores, v)) return "valor no permitido.";
                        return null;
                    }
            }
        }

        private static bool EnLista(object[] lista, object v)
        {
            foreach (object o in lista)
            {
                if (o is long && v is long) { if ((long)o == (long)v) return true; }
                else if (o is string && v is string) { if ((string)o == (string)v) return true; }
            }
            return false;
        }

        private static string Num(double d)
        {
            return d.ToString("R", CultureInfo.InvariantCulture);
        }

        private static string Cortar(string s)
        {
            return Texto.Limpiar(s, 48);
        }
    }

    /// <summary>Recorta y retira controles de texto ajeno antes de repetirlo en mensajes o logs.</summary>
    internal static class Texto
    {
        public static string Limpiar(string s, int max)
        {
            if (s == null) return "";
            System.Text.StringBuilder sb = new System.Text.StringBuilder();
            for (int i = 0; i < s.Length && sb.Length < max; i++)
            {
                char c = s[i];
                sb.Append(c < 0x20 || c == 0x7f ? '?' : c);
            }
            if (s.Length > max) sb.Append("...");
            return sb.ToString();
        }
    }

    // ---------------------------------------------------------------------------------------
    // DTOs
    // ---------------------------------------------------------------------------------------

    public sealed class InfoJuego
    {
        public string Nombre;
        public string Version;
        public string BuildSteam;
        public string Unity;
        /// <summary>Si es "simulado" se anuncia como origen:"simulado" (solo el anfitrion de pruebas; el mod real lo deja en null).</summary>
        public string Origen;
    }

    public sealed class CapacidadesMundo
    {
        public bool Reiniciar;
        public bool Semilla;
        public bool Avanzar;
        public bool Terminal;
        public bool MultiFaccion;
        /// <summary>Tope de segundos_juego por llamada a /v1/avanzar (el puente lo aplica antes de molestar al juego).</summary>
        public double MaxSegundosAvance = 1;
        public int? MaxAccionesPorTurno;
    }

    public sealed class FaccionSolicitada
    {
        public string Id;
        public string Especie;
        public string Reino;
    }

    public sealed class SolicitudReinicio
    {
        public long Semilla;
        /// <summary>Cadena o numero tal como llego; el mundo decide si lo acepta (puede ser null).</summary>
        public object TamanoMapa;
        public IList<FaccionSolicitada> Facciones;
        public IDictionary<string, object> Opciones;
    }

    public sealed class ResultadoAccion
    {
        public const string Ejecutada = "ejecutada";
        public const string Rechazada = "rechazada";
        public const string SinEfecto = "sin_efecto";

        public string Resultado;
        public string Codigo;
        public string Mensaje;
        public IDictionary<string, object> Efecto;

        public static ResultadoAccion De(string resultado, string codigo, string mensaje, IDictionary<string, object> efecto)
        {
            ResultadoAccion r = new ResultadoAccion();
            r.Resultado = resultado;
            r.Codigo = codigo;
            r.Mensaje = mensaje;
            r.Efecto = efecto;
            return r;
        }
    }

    public sealed class ResultadoAvance
    {
        public double TiempoJuegoS;
        public bool Terminal;
        /// <summary>Si no es null el avance fallo (se responde error_interno y se registra el motivo).</summary>
        public string Error;
    }

    // ---------------------------------------------------------------------------------------
    // Interfaz con el juego
    // ---------------------------------------------------------------------------------------

    /// <summary>
    /// Lo que la integracion real con WorldBox implementara. No se confirmo que el juego sea monohilo:
    /// NADA del API del juego se lee ni se toca fuera de ServidorPuente.Bombear(). REGLAS DE HILO:
    ///  - Las propiedades Info, Capacidades y Acciones son inmutables y se leen desde el hilo de red:
    ///    no pueden tocar el API del juego (calcularlas una vez, en el constructor).
    ///  - Todos los metodos se invocan SOLO desde el hilo que llama a ServidorPuente.Bombear()
    ///    (el hilo principal de Unity). Nunca se ejecutan dos a la vez.
    ///  - Los errores esperables se lanzan como ErrorPuente; NotSupportedException se traduce a
    ///    no_soportado; cualquier otra excepcion es error_interno.
    /// Los diccionarios devueltos son DTOs sencillos (Dictionary&lt;string,object&gt;, List&lt;object&gt;,
    /// string, numeros, bool, null); el puente los serializa EN el hilo principal, asi que no importa
    /// si el mundo reutiliza colecciones despues.
    /// </summary>
    public interface IMundo
    {
        InfoJuego Info { get; }
        CapacidadesMundo Capacidades { get; }
        RegistroAcciones Acciones { get; }

        /// <summary>Devuelve escenario_id, hash_mundo y facciones[] (el puente agrega ok y protocolo).</summary>
        IDictionary<string, object> Reiniciar(SolicitudReinicio solicitud);

        /// <summary>Devuelve tiempo_juego_s, turno_juego, faccion, rivales[], mundo. Mismos campos para toda faccion.</summary>
        IDictionary<string, object> Observar(string faccion);

        /// <summary>Los parametros ya pasaron la validacion del registro; aqui se revalida lo que depende del estado del juego.</summary>
        ResultadoAccion Ejecutar(string faccion, string accion, IDictionary<string, object> parametros);

        /// <summary>
        /// Corre la simulacion segundos de juego y la vuelve a pausar. Puede terminar en cuadros
        /// posteriores: hay que invocar alTerminar exactamente una vez, desde el hilo principal.
        /// </summary>
        void Avanzar(double segundos, Action<ResultadoAvance> alTerminar);

        /// <summary>Devuelve terminal, razon y resumen_por_faccion[].</summary>
        IDictionary<string, object> EstadoTerminal();

        /// <summary>Libera el escenario (no cierra el juego).</summary>
        void Cerrar();
    }
}
