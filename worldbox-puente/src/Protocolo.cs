using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace PuenteWorldBox
{
    internal delegate RespuestaHttp Manejador(SolicitudHttp solicitud, Dictionary<string, object> cuerpo);

    internal sealed class RutaPuente
    {
        public string Metodo;
        public string Camino;
        public bool CuerpoObligatorio;
        public string[] ConsultaPermitida = new string[0];
        public Manejador Manejador;
    }

    /// <summary>Lectura estricta de campos de un cuerpo JSON ya analizado. Todo fallo es solicitud_invalida.</summary>
    internal static class Campos
    {
        private static readonly Regex PatronId = new Regex("^[A-Za-z0-9_-]{1,40}$", RegexOptions.CultureInvariant);
        private static readonly Regex PatronIdSolicitud = new Regex("^[\\x21-\\x7e]{1,128}$", RegexOptions.CultureInvariant);

        public static ErrorPuente Invalido(string mensaje)
        {
            return new ErrorPuente(Codigos.SolicitudInvalida, mensaje);
        }

        public static string IdSolicitud(Dictionary<string, object> c, bool obligatorio)
        {
            object v;
            if (!c.TryGetValue("id_solicitud", out v) || v == null)
            {
                if (obligatorio) throw Invalido("Falta id_solicitud.");
                return null;
            }
            string s = v as string;
            if (s == null || !PatronIdSolicitud.IsMatch(s)) throw Invalido("id_solicitud debe ser texto ASCII visible de 1 a 128 caracteres.");
            return s;
        }

        public static string Id(Dictionary<string, object> c, string campo)
        {
            object v;
            string s = c.TryGetValue(campo, out v) ? v as string : null;
            if (s == null || !PatronId.IsMatch(s)) throw Invalido("'" + campo + "' debe ser un id de 1 a 40 caracteres [A-Za-z0-9_-].");
            return s;
        }

        public static string IdTexto(string valor, string campo)
        {
            if (valor == null || !PatronId.IsMatch(valor)) throw Invalido("'" + campo + "' debe ser un id de 1 a 40 caracteres [A-Za-z0-9_-].");
            return valor;
        }

        public static string Cadena(Dictionary<string, object> c, string campo, int maxLong, bool obligatorio)
        {
            object v;
            if (!c.TryGetValue(campo, out v) || v == null)
            {
                if (obligatorio) throw Invalido("Falta '" + campo + "'.");
                return null;
            }
            string s = v as string;
            if (s == null || s.Length == 0 || s.Length > maxLong) throw Invalido("'" + campo + "' debe ser texto de 1 a " + maxLong + " caracteres.");
            for (int i = 0; i < s.Length; i++) { if (s[i] < 0x20 || s[i] == 0x7f) throw Invalido("'" + campo + "' contiene caracteres de control."); }
            return s;
        }

        public static long Entero(Dictionary<string, object> c, string campo, long min, long max)
        {
            object v;
            if (!c.TryGetValue(campo, out v) || !(v is long)) throw Invalido("'" + campo + "' debe ser un entero.");
            long n = (long)v;
            if (n < min || n > max) throw Invalido("'" + campo + "' fuera de rango " + min + ".." + max + ".");
            return n;
        }

        public static double Numero(Dictionary<string, object> c, string campo)
        {
            object v;
            if (!c.TryGetValue(campo, out v)) throw Invalido("Falta '" + campo + "'.");
            if (v is long) return (long)v;
            if (v is double) return (double)v;
            throw Invalido("'" + campo + "' debe ser un numero.");
        }

        public static Dictionary<string, object> Objeto(Dictionary<string, object> c, string campo, bool obligatorio)
        {
            object v;
            if (!c.TryGetValue(campo, out v) || v == null)
            {
                if (obligatorio) throw Invalido("Falta '" + campo + "'.");
                return null;
            }
            Dictionary<string, object> d = v as Dictionary<string, object>;
            if (d == null) throw Invalido("'" + campo + "' debe ser un objeto.");
            return d;
        }

        public static List<object> Arreglo(Dictionary<string, object> c, string campo, int min, int max)
        {
            object v;
            List<object> l = c.TryGetValue(campo, out v) ? v as List<object> : null;
            if (l == null || l.Count < min || l.Count > max) throw Invalido("'" + campo + "' debe ser un arreglo de " + min + " a " + max + " elementos.");
            return l;
        }
    }

    /// <summary>
    /// Logica del protocolo v1 sin sockets: autenticacion, enrutado, validacion, idempotencia y
    /// traslado del trabajo al hilo principal. Nada de lo que hace toca el juego en el hilo de red:
    /// solo lee datos inmutables de IMundo (Info/Capacidades/Acciones) y encola el resto.
    /// </summary>
    internal sealed class Protocolo
    {
        public const int Version = 1;

        private readonly ConfiguracionPuente cfg;
        private readonly ColaPrincipal cola;
        private readonly Registro log;
        private readonly string token;
        private readonly CacheIdempotencia cache;
        private readonly Dictionary<string, RutaPuente> rutas = new Dictionary<string, RutaPuente>();
        private volatile IMundo mundo;
        private volatile TareaPrincipal tareaActual;
        private int ocupado;

        public int PuertoEscucha;

        public Protocolo(ConfiguracionPuente cfg, ColaPrincipal cola, Registro log, string token)
        {
            this.cfg = cfg;
            this.cola = cola;
            this.log = log;
            this.token = token;
            this.cache = new CacheIdempotencia(cfg.CapacidadCacheIdempotencia);

            Agregar("GET", "/v1/info", false, new string[0], ManejarInfo);
            Agregar("POST", "/v1/escenario/reiniciar", true, new string[0], ManejarReiniciar);
            Agregar("GET", "/v1/observacion", false, new string[] { "faccion" }, ManejarObservacion);
            Agregar("POST", "/v1/accion", true, new string[0], ManejarAccion);
            Agregar("POST", "/v1/avanzar", true, new string[0], ManejarAvanzar);
            Agregar("GET", "/v1/estado-terminal", false, new string[0], ManejarEstadoTerminal);
            Agregar("POST", "/v1/cerrar", false, new string[0], ManejarCerrar);
        }

        private void Agregar(string metodo, string camino, bool cuerpoObligatorio, string[] consulta, Manejador m)
        {
            RutaPuente r = new RutaPuente();
            r.Metodo = metodo;
            r.Camino = camino;
            r.CuerpoObligatorio = cuerpoObligatorio;
            r.ConsultaPermitida = consulta;
            r.Manejador = m;
            rutas[camino] = r;
        }

        public IMundo Mundo
        {
            get { return mundo; }
            set { mundo = value; }
        }

        public bool Ocupado { get { return Thread.VolatileRead(ref ocupado) == 1; } }

        // -----------------------------------------------------------------------------------
        // Fase 1: con la cabecera leida, antes de pedir el cuerpo.
        // -----------------------------------------------------------------------------------

        public RutaPuente Prevalidar(SolicitudHttp s)
        {
            // Una pagina web puede pegarle a loopback. Un navegador siempre manda Origin en las peticiones
            // entre origenes (el orquestador Node no), y con DNS rebinding el Host seria otro nombre: 403.
            if (s.Cabeceras.ContainsKey("origin"))
                throw new ErrorPuente(Codigos.NoAutorizado, "Se rechazan las solicitudes con cabecera Origin (paginas web).", 403);
            string host;
            s.Cabeceras.TryGetValue("host", out host);
            if (!HostPermitido(host)) throw new ErrorPuente(Codigos.NoAutorizado, "Host no permitido.", 403);

            // La autenticacion va antes que el enrutado: sin token no se revela ni que rutas existen.
            string recibido;
            s.Cabeceras.TryGetValue("x-puente-token", out recibido);
            if (recibido == null || recibido.Length > 256 || !Seguridad.IgualesTiempoConstante(token, recibido))
                throw new ErrorPuente(Codigos.NoAutorizado, "Falta la cabecera X-Puente-Token o es incorrecta.");

            RutaPuente r;
            if (!rutas.TryGetValue(s.Ruta, out r))
                throw new ErrorPuente(Codigos.SolicitudInvalida, "Ruta desconocida.", 404);
            if (r.Metodo != s.Metodo)
            {
                ErrorPuente e = new ErrorPuente(Codigos.SolicitudInvalida, "Metodo no permitido en esta ruta; use " + r.Metodo + ".", 405);
                e.Allow = r.Metodo;
                throw e;
            }

            if (r.Metodo == "GET")
            {
                if (s.ContentLength > 0) throw Campos.Invalido("Las solicitudes GET no admiten cuerpo.");
            }
            else
            {
                if (s.ContentLength < 0 && r.CuerpoObligatorio)
                    throw new ErrorPuente(Codigos.SolicitudInvalida, "Falta Content-Length.", 411);
                if (s.ContentLength > cfg.MaxCuerpoBytes)
                    throw new ErrorPuente(Codigos.SolicitudInvalida, "Cuerpo demasiado grande (maximo " + cfg.MaxCuerpoBytes + " bytes).", 413);
            }
            return r;
        }

        private bool HostPermitido(string host)
        {
            if (host == null) return false;
            int dp = host.LastIndexOf(':');
            if (dp < 0 || dp == host.Length - 1) return false;
            string nombre = host.Substring(0, dp).ToLowerInvariant();
            int puerto;
            if (!int.TryParse(host.Substring(dp + 1), out puerto) || puerto != PuertoEscucha) return false;
            return nombre == "127.0.0.1" || nombre == "localhost";
        }

        // -----------------------------------------------------------------------------------
        // Fase 2: con el cuerpo completo.
        // -----------------------------------------------------------------------------------

        public RespuestaHttp Procesar(SolicitudHttp s, RutaPuente r)
        {
            try
            {
                Dictionary<string, object> cuerpo = null;
                if (r.Metodo == "POST") cuerpo = AnalizarCuerpo(s, r);
                else ValidarConsulta(s, r);
                return r.Manejador(s, cuerpo);
            }
            catch (ErrorPuente e)
            {
                return RespuestaError(e);
            }
            catch (Exception e)
            {
                log.Escribir("Error inesperado en " + r.Camino + ": " + e.GetType().Name + ": " + e.Message);
                return RespuestaError(new ErrorPuente(Codigos.ErrorInterno, "Error interno del puente."));
            }
        }

        private void ValidarConsulta(SolicitudHttp s, RutaPuente r)
        {
            foreach (KeyValuePair<string, string> kv in s.Consulta)
            {
                if (kv.Key == "protocolo")
                {
                    if (kv.Value != "1") throw new ErrorPuente(Codigos.ProtocoloIncompatible, "Este puente habla el protocolo 1.");
                    continue;
                }
                if (Array.IndexOf(r.ConsultaPermitida, kv.Key) < 0)
                    throw Campos.Invalido("Parametro de consulta no admitido: '" + Texto.Limpiar(kv.Key, 40) + "'.");
            }
        }

        private Dictionary<string, object> AnalizarCuerpo(SolicitudHttp s, RutaPuente r)
        {
            ValidarConsulta(s, r);
            if (s.Cuerpo.Length == 0)
            {
                if (r.CuerpoObligatorio) throw Campos.Invalido("El cuerpo esta vacio.");
                return new Dictionary<string, object>();
            }
            object raiz;
            try
            {
                raiz = Json.Leer(s.Cuerpo, cfg.MaxCuerpoBytes);
            }
            catch (JsonExcepcion e)
            {
                throw Campos.Invalido("JSON invalido: " + e.Message);
            }
            Dictionary<string, object> d = raiz as Dictionary<string, object>;
            if (d == null) throw Campos.Invalido("El cuerpo debe ser un objeto JSON.");

            object p;
            if (!d.TryGetValue("protocolo", out p) || !(p is long)) throw Campos.Invalido("Falta 'protocolo' (entero).");
            if ((long)p != Version) throw new ErrorPuente(Codigos.ProtocoloIncompatible, "Este puente habla el protocolo 1.");
            return d;
        }

        // -----------------------------------------------------------------------------------
        // Respuestas
        // -----------------------------------------------------------------------------------

        public RespuestaHttp RespuestaError(ErrorPuente e)
        {
            RespuestaHttp r = new RespuestaHttp();
            r.Estado = e.EstadoHttp;
            r.Allow = e.Allow;
            r.Cuerpo = Json.Escribir(Json.Objeto(
                "ok", false,
                "protocolo", Version,
                "error", Json.Objeto("codigo", e.Codigo, "mensaje", Texto.Limpiar(e.Message, 300))));
            return r;
        }

        private RespuestaHttp Ok(IDictionary<string, object> cuerpo)
        {
            RespuestaHttp r = new RespuestaHttp();
            r.Estado = 200;
            r.Cuerpo = Json.Escribir(Unir(cuerpo));
            return r;
        }

        private static Dictionary<string, object> Unir(IDictionary<string, object> cuerpo)
        {
            Dictionary<string, object> salida = new Dictionary<string, object>();
            salida["ok"] = true;
            salida["protocolo"] = Version;
            foreach (KeyValuePair<string, object> kv in cuerpo)
            {
                if (kv.Key == "ok" || kv.Key == "protocolo") continue;
                salida[kv.Key] = kv.Value;
            }
            return salida;
        }

        // -----------------------------------------------------------------------------------
        // Endpoints
        // -----------------------------------------------------------------------------------

        private RespuestaHttp ManejarInfo(SolicitudHttp s, Dictionary<string, object> c)
        {
            IMundo m = mundo;
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["puente"] = Json.Objeto("nombre", cfg.NombrePuente, "version", cfg.VersionPuente);

            string estado;
            if (m == null) estado = "cargando";
            else if (Ocupado) estado = "ejecutando";
            else estado = cola.Viva ? "listo" : "cargando";

            if (m != null)
            {
                InfoJuego j = m.Info;
                CapacidadesMundo cap = m.Capacidades;
                if (j.Origen != null) d["origen"] = j.Origen;
                d["juego"] = Json.Objeto("nombre", j.Nombre, "version", j.Version, "build_steam", j.BuildSteam, "unity", j.Unity);
                d["estado"] = estado;
                d["capacidades"] = Json.Objeto(
                    "reiniciar", cap.Reiniciar, "semilla", cap.Semilla, "avanzar", cap.Avanzar,
                    "terminal", cap.Terminal, "multi_faccion", cap.MultiFaccion);
                List<object> acciones = new List<object>();
                foreach (DescripcionAccion a in m.Acciones.Todas) acciones.Add(Anunciar(a));
                d["acciones"] = acciones;
                ObjetoOrdenado limites = new ObjetoOrdenado().Con("max_segundos_avance", cap.MaxSegundosAvance);
                if (cap.MaxAccionesPorTurno.HasValue) limites.Con("max_acciones_por_turno", cap.MaxAccionesPorTurno.Value);
                d["limites"] = limites;
            }
            else
            {
                d["estado"] = estado;
            }
            return Ok(d);
        }

        private static object Anunciar(DescripcionAccion a)
        {
            ObjetoOrdenado parametros = new ObjetoOrdenado();
            foreach (ParametroAccion p in a.Parametros)
            {
                ObjetoOrdenado spec = new ObjetoOrdenado().Con("tipo", p.NombreTipo);
                if (p.Minimo.HasValue) spec.Con("minimo", p.Tipo == TipoParametro.Numero ? (object)p.Minimo.Value : (object)(long)p.Minimo.Value);
                if (p.Maximo.HasValue) spec.Con("maximo", p.Tipo == TipoParametro.Numero ? (object)p.Maximo.Value : (object)(long)p.Maximo.Value);
                if (p.Valores != null) spec.Con("valores", new List<object>(p.Valores));
                parametros.Con(p.Nombre, spec);
            }
            ObjetoOrdenado accion = new ObjetoOrdenado()
                .Con("nombre", a.Nombre)
                .Con("descripcion", a.Descripcion)
                .Con("verificada", true)
                .Con("parametros", parametros);
            // Opcionales y solo informativos: el cliente (orquestador Node) los aplica; este servidor no cobra puntos
            // ni hace cumplir cooldowns ni "desde_turno".
            if (a.Puntos.HasValue) accion.Con("puntos", a.Puntos.Value);
            if (a.Cooldown.HasValue) accion.Con("cooldown", a.Cooldown.Value);
            return accion;
        }

        private RespuestaHttp ManejarReiniciar(SolicitudHttp s, Dictionary<string, object> c)
        {
            string id = Campos.IdSolicitud(c, true);
            SolicitudReinicio sol = new SolicitudReinicio();
            // Rango unico del protocolo (el cliente Node usa el mismo): entero 0..2147483647 (32 bits con signo, sin negativos).
            sol.Semilla = Campos.Entero(c, "semilla", 0, int.MaxValue);

            object tam;
            if (c.TryGetValue("tamano_mapa", out tam) && tam != null)
            {
                string ts = tam as string;
                if (ts != null)
                {
                    if (ts.Length == 0 || ts.Length > 40) throw Campos.Invalido("'tamano_mapa' debe ser texto de 1 a 40 caracteres o un numero.");
                    sol.TamanoMapa = ts;
                }
                else if (tam is long || tam is double) sol.TamanoMapa = tam;
                else throw Campos.Invalido("'tamano_mapa' debe ser texto o numero.");
            }

            List<object> lista = Campos.Arreglo(c, "facciones", 1, 16);
            List<FaccionSolicitada> facciones = new List<FaccionSolicitada>();
            HashSet<string> vistos = new HashSet<string>();
            foreach (object o in lista)
            {
                Dictionary<string, object> f = o as Dictionary<string, object>;
                if (f == null) throw Campos.Invalido("Cada faccion debe ser un objeto.");
                FaccionSolicitada fs = new FaccionSolicitada();
                fs.Id = Campos.Id(f, "id");
                if (!vistos.Add(fs.Id)) throw Campos.Invalido("Id de faccion repetido: " + fs.Id + ".");
                fs.Especie = Campos.Cadena(f, "especie", 40, false);
                fs.Reino = Campos.Cadena(f, "reino", 40, false);
                facciones.Add(fs);
            }
            sol.Facciones = facciones;
            sol.Opciones = Campos.Objeto(c, "opciones", false) ?? new Dictionary<string, object>();

            IMundo m = ExigirMundo();
            if (!m.Capacidades.Reiniciar) throw new ErrorPuente(Codigos.NoSoportado, "El mundo no puede reiniciar escenarios.");
            RespuestaHttp previa = Repetida("reiniciar", id, s.Cuerpo);
            if (previa != null) return previa;

            return Correr("reiniciar|" + id, Huella(s.Cuerpo), cfg.TiempoOperacionMs, delegate(IMundo mu, TareaPrincipal t)
            {
                t.Completar(Contrato(mu.Reiniciar(sol), "reiniciar", "escenario_id", "hash_mundo", "facciones"));
            });
        }

        private RespuestaHttp ManejarObservacion(SolicitudHttp s, Dictionary<string, object> c)
        {
            string faccion;
            if (!s.Consulta.TryGetValue("faccion", out faccion)) throw Campos.Invalido("Falta el parametro de consulta 'faccion'.");
            Campos.IdTexto(faccion, "faccion");
            ExigirMundo();
            return Correr(null, null, cfg.TiempoOperacionMs, delegate(IMundo mu, TareaPrincipal t)
            {
                t.Completar(Contrato(mu.Observar(faccion), "observar", "tiempo_juego_s", "turno_juego", "faccion", "rivales", "mundo"));
            });
        }

        private RespuestaHttp ManejarAccion(SolicitudHttp s, Dictionary<string, object> c)
        {
            string id = Campos.IdSolicitud(c, true);
            string faccion = Campos.Id(c, "faccion");
            object crudaAccion;
            if (!c.TryGetValue("accion", out crudaAccion) || !(crudaAccion is string))
                throw Campos.Invalido("Falta 'accion' (texto).");
            // El NOMBRE de la accion es contenido que puede proponer un modelo: un texto vacio, demasiado largo o con
            // caracteres de control es una accion desconocida (rechazo estructurado), no una solicitud rota (400).
            string accion = (string)crudaAccion;
            bool nombreRaro = accion.Length == 0 || accion.Length > 80;
            for (int i = 0; i < accion.Length && !nombreRaro; i++) { if (accion[i] < 0x20 || accion[i] == 0x7f) nombreRaro = true; }
            Dictionary<string, object> parametros = Campos.Objeto(c, "parametros", false) ?? new Dictionary<string, object>();

            IMundo m = ExigirMundo();
            RespuestaHttp previa = Repetida("accion", id, s.Cuerpo);
            if (previa != null) return previa;
            if (nombreRaro)
            {
                return Ok(Json.Objeto(
                    "resultado", ResultadoAccion.Rechazada, "codigo", "accion_desconocida",
                    "mensaje", "El nombre de la accion no es valido.", "efecto", new Dictionary<string, object>()));
            }

            // Lista blanca y rangos: datos inmutables, se comprueban aqui sin molestar al juego.
            ResultadoValidacion v = m.Acciones.Validar(accion, parametros);
            if (!v.Valido)
            {
                return Ok(Json.Objeto(
                    "resultado", ResultadoAccion.Rechazada, "codigo", v.Codigo,
                    "mensaje", v.Mensaje, "efecto", new Dictionary<string, object>()));
            }
            Dictionary<string, object> limpios = v.Parametros;

            return Correr("accion|" + id, Huella(s.Cuerpo), cfg.TiempoOperacionMs, delegate(IMundo mu, TareaPrincipal t)
            {
                t.Completar(DeResultado(mu.Ejecutar(faccion, accion, limpios)));
            });
        }

        private RespuestaHttp ManejarAvanzar(SolicitudHttp s, Dictionary<string, object> c)
        {
            string id = Campos.IdSolicitud(c, true);
            double seg = Campos.Numero(c, "segundos_juego");
            IMundo m = ExigirMundo();
            if (!m.Capacidades.Avanzar) throw new ErrorPuente(Codigos.NoSoportado, "El mundo no puede avanzar el tiempo.");
            if (!(seg > 0) || double.IsInfinity(seg)) throw Campos.Invalido("'segundos_juego' debe ser mayor que 0.");
            if (seg > m.Capacidades.MaxSegundosAvance)
                throw Campos.Invalido("'segundos_juego' excede el maximo permitido (" + m.Capacidades.MaxSegundosAvance.ToString("R", System.Globalization.CultureInfo.InvariantCulture) + ").");
            RespuestaHttp previa = Repetida("avanzar", id, s.Cuerpo);
            if (previa != null) return previa;

            return Correr("avanzar|" + id, Huella(s.Cuerpo), cfg.TiempoAvanceMs, delegate(IMundo mu, TareaPrincipal t)
            {
                mu.Avanzar(seg, delegate(ResultadoAvance ra)
                {
                    if (ra == null) t.Fallar(new InvalidOperationException("Avanzar devolvio un resultado nulo."));
                    else if (ra.Error != null) t.Fallar(new InvalidOperationException("Avanzar fallo: " + ra.Error));
                    else t.Completar(Json.Objeto("tiempo_juego_s", ra.TiempoJuegoS, "terminal", ra.Terminal));
                });
            });
        }

        private RespuestaHttp ManejarEstadoTerminal(SolicitudHttp s, Dictionary<string, object> c)
        {
            IMundo m = ExigirMundo();
            if (!m.Capacidades.Terminal) throw new ErrorPuente(Codigos.NoSoportado, "El mundo no informa estado terminal.");
            return Correr(null, null, cfg.TiempoOperacionMs, delegate(IMundo mu, TareaPrincipal t)
            {
                t.Completar(Contrato(mu.EstadoTerminal(), "estado-terminal", "terminal", "razon", "resumen_por_faccion"));
            });
        }

        private RespuestaHttp ManejarCerrar(SolicitudHttp s, Dictionary<string, object> c)
        {
            string id = Campos.IdSolicitud(c, false);
            ExigirMundo();
            RespuestaHttp previa = Repetida("cerrar", id, s.Cuerpo);
            if (previa != null) return previa;
            return Correr(id == null ? null : "cerrar|" + id, Huella(s.Cuerpo), cfg.TiempoOperacionMs, delegate(IMundo mu, TareaPrincipal t)
            {
                mu.Cerrar();
                t.Completar(new Dictionary<string, object>());
            });
        }

        // -----------------------------------------------------------------------------------
        // Maquinaria comun
        // -----------------------------------------------------------------------------------

        private IMundo ExigirMundo()
        {
            IMundo m = mundo;
            if (m == null) throw new ErrorPuente(Codigos.NoListo, "El juego aun esta cargando.");
            if (!cola.Viva) throw new ErrorPuente(Codigos.NoListo, "El hilo principal del juego no esta atendiendo al puente (cargando o en pausa).");
            return m;
        }

        private static string Huella(string cuerpo)
        {
            return Seguridad.Sha256Hex(Encoding.UTF8.GetBytes(cuerpo ?? ""));
        }

        private RespuestaHttp Repetida(string ruta, string id, string cuerpo)
        {
            if (id == null) return null;
            RespuestaGuardada g = cache.Obtener(ruta + "|" + id);
            if (g == null) return null;
            if (g.Huella != Huella(cuerpo))
                throw Campos.Invalido("id_solicitud ya se uso con otro cuerpo; use un id nuevo para una solicitud distinta.");
            RespuestaHttp r = new RespuestaHttp();
            r.Estado = g.Estado;
            r.Cuerpo = g.Cuerpo;
            r.Repetida = true;
            return r;
        }

        private static IDictionary<string, object> Contrato(IDictionary<string, object> d, string operacion, params string[] requeridos)
        {
            if (d == null) throw new ErrorPuente(Codigos.ErrorInterno, "Contrato roto: '" + operacion + "' no devolvio datos.");
            foreach (string k in requeridos)
            {
                if (!d.ContainsKey(k)) throw new ErrorPuente(Codigos.ErrorInterno, "Contrato roto: '" + operacion + "' no devolvio el campo '" + k + "'.");
            }
            return d;
        }

        private static readonly Regex PatronCodigo = new Regex("^[a-z_]{1,60}$", RegexOptions.CultureInvariant);

        private static IDictionary<string, object> DeResultado(ResultadoAccion r)
        {
            if (r == null) throw new ErrorPuente(Codigos.ErrorInterno, "Contrato roto: Ejecutar devolvio null.");
            if (r.Resultado != ResultadoAccion.Ejecutada && r.Resultado != ResultadoAccion.Rechazada && r.Resultado != ResultadoAccion.SinEfecto)
                throw new ErrorPuente(Codigos.ErrorInterno, "Contrato roto: resultado de accion invalido.");
            if (r.Codigo == null || !PatronCodigo.IsMatch(r.Codigo))
                throw new ErrorPuente(Codigos.ErrorInterno, "Contrato roto: el codigo de la accion debe ser [a-z_]{1,60}.");
            return Json.Objeto(
                "resultado", r.Resultado, "codigo", r.Codigo,
                "mensaje", r.Mensaje ?? "", "efecto", r.Efecto ?? new Dictionary<string, object>());
        }

        /// <summary>
        /// Ejecuta trabajo en el hilo principal con exclusion mutua: un solo trabajo de juego a la vez
        /// (juego_ocupado para el resto). El cerrojo lo suelta el finalizador cuando el trabajo termina
        /// de verdad, aunque quien esperaba ya se haya rendido por tiempo.
        /// </summary>
        private sealed class EnVuelo
        {
            public TareaPrincipal Tarea;
            public string Huella;
        }

        // Solicitudes con id_solicitud que se estan ejecutando ahora mismo (clave -> tarea). Se consulta y se modifica
        // SIEMPRE dentro de cerrojoEjecucion, el mismo cerrojo bajo el que se mira la cache y se adquiere el turno.
        private readonly object cerrojoEjecucion = new object();
        private readonly Dictionary<string, EnVuelo> enVuelo = new Dictionary<string, EnVuelo>();

        /// <summary>Solo para pruebas: se invoca tras el primer vistazo a la cache y ANTES de adquirir el turno de ejecucion.</summary>
        internal Action AntesDeAdquirirEjecucion;

        private static RespuestaHttp Copia(RespuestaHttp origen, bool repetida)
        {
            RespuestaHttp r = new RespuestaHttp();
            r.Estado = origen.Estado;
            r.Cuerpo = origen.Cuerpo;
            r.Allow = origen.Allow;
            r.Repetida = repetida;
            return r;
        }

        private RespuestaHttp Correr(string claveCache, string huella, int tiempoMs, Action<IMundo, TareaPrincipal> trabajo)
        {
            IMundo m = ExigirMundo();
            LiberarSiAtascado();
            Action gancho = AntesDeAdquirirEjecucion;
            if (gancho != null) gancho();

            TareaPrincipal t = null;
            EnVuelo identica = null;
            // Mirar la cache, mirar lo que ya esta en vuelo y adquirir el turno de ejecucion es UN solo paso atomico:
            // dos solicitudes con el mismo id_solicitud nunca se ejecutan dos veces. La segunda recibe la respuesta
            // guardada (si la primera ya termino) o espera a la primera (si sigue en vuelo).
            lock (cerrojoEjecucion)
            {
                if (claveCache != null)
                {
                    RespuestaGuardada g = cache.Obtener(claveCache);
                    if (g != null)
                    {
                        if (g.Huella != huella)
                            throw Campos.Invalido("id_solicitud ya se uso con otro cuerpo; use un id nuevo para una solicitud distinta.");
                        RespuestaHttp guardada = new RespuestaHttp();
                        guardada.Estado = g.Estado;
                        guardada.Cuerpo = g.Cuerpo;
                        guardada.Repetida = true;
                        return guardada;
                    }
                    enVuelo.TryGetValue(claveCache, out identica);
                }
                if (identica == null)
                {
                    if (Interlocked.CompareExchange(ref ocupado, 1, 0) != 0)
                        throw new ErrorPuente(Codigos.JuegoOcupado, "El juego esta ocupado con otra solicitud; reintente.");
                    try
                    {
                        t = cola.Encolar(
                            delegate(TareaPrincipal tarea) { trabajo(m, tarea); },
                            delegate(TareaPrincipal tarea) { Finalizar(tarea, claveCache, huella); });
                    }
                    catch (Exception)
                    {
                        Interlocked.Exchange(ref ocupado, 0);
                        throw;
                    }
                    tareaActual = t;
                    if (claveCache != null) { EnVuelo ev = new EnVuelo(); ev.Tarea = t; ev.Huella = huella; enVuelo[claveCache] = ev; }
                }
            }

            if (identica != null)
            {
                if (identica.Huella != huella)
                    throw Campos.Invalido("id_solicitud ya se uso con otro cuerpo; use un id nuevo para una solicitud distinta.");
                // No se llama a cola.Esperar: cancelaria la tarea de la otra solicitud si aun no empezo.
                if (identica.Tarea.Esperar(tiempoMs) && identica.Tarea.Respuesta != null)
                    return Copia((RespuestaHttp)identica.Tarea.Respuesta, true);
                throw new ErrorPuente(Codigos.TiempoAgotado,
                    "La operacion identica sigue en curso o no llego a ejecutarse; reintente con el mismo id_solicitud.");
            }

            if (!cola.Esperar(t, tiempoMs))
            {
                if (t.Cancelada)
                {
                    if (cola.Detenida) throw new ErrorPuente(Codigos.NoListo, "El puente se esta deteniendo.");
                    throw new ErrorPuente(Codigos.TiempoAgotado, "El juego no atendio la solicitud a tiempo; no se ejecuto.");
                }
                throw new ErrorPuente(Codigos.TiempoAgotado,
                    "La operacion sigue en curso; reintente con el mismo id_solicitud para obtener su resultado.");
            }
            return (RespuestaHttp)t.Respuesta;
        }

        private void LiberarSiAtascado()
        {
            TareaPrincipal t = tareaActual;
            if (t == null || !Ocupado) return;
            long desde = t.AbandonadaDesdeMs;
            if (desde >= 0 && t.EnCurso && ColaPrincipal.Reloj.ElapsedMilliseconds - desde > cfg.GraciaAbandonoMs)
            {
                log.Escribir("Una operacion abandonada no termino en " + cfg.GraciaAbandonoMs + " ms: se da por fallida.");
                t.Fallar(new TimeoutException("La operacion no termino dentro del margen."));
            }
        }

        /// <summary>
        /// Corre en el hilo que termina la tarea (normalmente el principal): serializa alli, asi el
        /// mundo puede reutilizar sus colecciones sin carreras con el hilo de red. Solo se guardan
        /// para idempotencia las respuestas de exito: un error transitorio debe poder reintentarse.
        /// </summary>
        private void Finalizar(TareaPrincipal t, string claveCache, string huella)
        {
            try
            {
                if (t.Cancelada) return;
                RespuestaHttp r = Construir(t);
                t.Respuesta = r;
                if (claveCache != null && t.Error == null && r.Estado == 200)
                {
                    RespuestaGuardada g = new RespuestaGuardada();
                    g.Estado = r.Estado;
                    g.Cuerpo = r.Cuerpo;
                    g.Huella = huella;
                    cache.Guardar(claveCache, g);
                }
            }
            catch (Exception e)
            {
                log.Escribir("Fallo al cerrar una operacion: " + e.GetType().Name + ": " + e.Message);
                t.Respuesta = RespuestaError(new ErrorPuente(Codigos.ErrorInterno, "Error interno del puente."));
            }
            finally
            {
                // Primero se quita de "en vuelo" (la cache ya tiene la respuesta si fue exitosa) y luego se libera el
                // turno: quien llegue entre ambos pasos encuentra la cache o espera a esta tarea, nunca la repite.
                if (claveCache != null)
                {
                    lock (cerrojoEjecucion) { enVuelo.Remove(claveCache); }
                }
                Interlocked.Exchange(ref ocupado, 0);
            }
        }

        private RespuestaHttp Construir(TareaPrincipal t)
        {
            Exception e = t.Error;
            if (e != null) return RespuestaError(Traducir(e));
            IDictionary<string, object> cuerpo = t.Resultado as IDictionary<string, object>;
            if (cuerpo == null) return RespuestaError(new ErrorPuente(Codigos.ErrorInterno, "El mundo no devolvio un objeto."));
            string texto;
            try
            {
                texto = Json.Escribir(Unir(cuerpo));
            }
            catch (InvalidOperationException ex)
            {
                log.Escribir("El mundo devolvio datos no serializables: " + ex.Message);
                return RespuestaError(new ErrorPuente(Codigos.ErrorInterno, "El mundo devolvio datos no serializables."));
            }
            if (texto.Length > cfg.MaxRespuestaCaracteres)
                return RespuestaError(new ErrorPuente(Codigos.ErrorInterno, "La respuesta del mundo excede el tamano permitido."));
            RespuestaHttp r = new RespuestaHttp();
            r.Estado = 200;
            r.Cuerpo = texto;
            return r;
        }

        private ErrorPuente Traducir(Exception e)
        {
            ErrorPuente ep = e as ErrorPuente;
            if (ep != null) return ep;
            if (e is NotSupportedException) return new ErrorPuente(Codigos.NoSoportado, "Operacion no soportada por el mundo.");
            if (e is TimeoutException) return new ErrorPuente(Codigos.TiempoAgotado, "La operacion no termino a tiempo.");
            log.Escribir("Excepcion en el hilo principal: " + e.GetType().Name + ": " + e.Message);
            return new ErrorPuente(Codigos.ErrorInterno, "Error interno del puente.");
        }
    }
}
