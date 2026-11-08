// IMundo sobre WorldBox 0.51.2 real. Cada llamada llega SOLO desde el hilo principal (ServidorPuente.Bombear).
// Lo que no se comprobo en vivo NO se anuncia: ver Verificadas y privado/revisiones/W5-entrega.md.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using UnityEngine;

namespace PuenteWorldBox
{
    public sealed class MundoWorldBox : IMundo, IPresentacion
    {
        // ---------------------------------------------------------------- tipos internos
        private sealed class Faccion
        {
            public string Id;
            public string Especie;
            public Kingdom Reino;
            public City CiudadInicial;
            public int SitioX, SitioY, CalidadSitio;
            public int UnidadesCreadas;
            public int PoderesUsados;
            public int Donado;
        }

        private sealed class AvanceEnCurso
        {
            public double T0, Objetivo, Pedido;
            public Stopwatch Reloj;
            public int Cuadro0;
            public Action<ResultadoAvance> Termina;
            public string Velocidad;
        }

        private sealed class Def
        {
            public string Nombre, Descripcion;
            public ParametroAccion[] Parametros;
            public Func<Faccion, IDictionary<string, object>, ResultadoAccion> Ejecuta;
            public int Puntos, Cooldown; // costo del REGLAMENTO, solo informativo (ver abajo)
        }

        // Acciones comprobadas EN VIVO dos veces (evidencia en W5-entrega.md). Solo estas se anuncian por defecto.
        private static readonly string[] Verificadas = new string[] { "crear_unidades", "bendecir", "maldecir", "incendiar", "donar_recursos", "declarar_guerra", "pedir_paz" };

        // Topes de SEGURIDAD de este mod por faccion y partida (alineados con el reglamento): 10 unidades creadas, 10 poderes,
        // 100 recursos donados. Son lo unico que el puente hace cumplir ademas de la validacion de forma y de las reglas del juego.
        //
        // QUE GARANTIZA CADA CAPA: el puente anuncia `puntos` y `cooldown` por accion en /v1/info como INFORMACION para el
        // cliente, pero NO cobra puntos, NO hace cumplir cooldowns y NO aplica "desde_turno" (p. ej. declarar_guerra desde el
        // turno 6). Eso lo hace el orquestador Node (contrato-acciones.js); un cliente autenticado que se salte el orquestador
        // no queda limitado por esas reglas. Ver worldbox-puente/README.md.
        public const int MaxUnidadesCreadasPorFaccion = 10;
        public const int MaxCrearPorAccion = 5;
        public const int RadioCreacionPorDefecto = 6;
        private static readonly string[] Velocidades = new string[] { "x1", "x2", "x3", "x4", "x5", "x10", "x15", "x20" };
        private static readonly string[] Plantillas = new string[] { "continent", "boring_plains", "pancake" };

        // ---------------------------------------------------------------- estado
        private readonly string carpeta;
        private readonly InfoJuego info = new InfoJuego();
        private readonly CapacidadesMundo capacidades = new CapacidadesMundo();
        private readonly RegistroAcciones acciones;
        private readonly Dictionary<string, Def> defs = new Dictionary<string, Def>();

        private bool hayEscenario;
        private List<Faccion> facciones = new List<Faccion>();
        private AvanceEnCurso avance;
        private int turno;
        private double t0Escenario;
        private double objetivoEscenario; // tiempo de mundo al que "deberia" ir el escenario: el sobrepaso de un cuadro no se acumula entre turnos
        private int contadorEscenarios;
        private string tamano = "standard", plantilla = "continent", velocidad = "x5";
        private int zonasTotales;
        private int radioCreacion = RadioCreacionPorDefecto; // tiles alrededor de la ciudad donde pueden aparecer unidades creadas
        // Topes vigentes del escenario. Por defecto los de seguridad (10 y 100); opciones.tope_poderes / opciones.tope_donado solo
        // pueden BAJARLOS (pruebas rapidas del mecanismo), nunca subirlos.
        private int topePoderes = MaxPoderesPorFaccion, topeDonado = MaxDonadoPorFaccion;

        public MundoWorldBox(string carpetaDatos)
        {
            carpeta = carpetaDatos;
            info.Nombre = "WorldBox";
            info.Version = Application.version;
            info.BuildSteam = (Config.versionCodeText ?? "") + (string.IsNullOrEmpty(Config.gitCodeText) ? "" : "@" + Config.gitCodeText);
            info.Unity = Application.unityVersion;
            info.Origen = null;

            capacidades.Reiniciar = true;
            capacidades.Semilla = false;   // el binario muestra que la semilla no controla el mundo (api-ensamblado.md, e)
            capacidades.Avanzar = true;
            capacidades.Terminal = true;
            capacidades.MultiFaccion = true;
            capacidades.MaxSegundosAvance = 120;
            capacidades.MaxAccionesPorTurno = 3;

            RegistrarDefs();
            List<DescripcionAccion> anunciadas = new List<DescripcionAccion>();
            HashSet<string> enPrueba = LeerEnPrueba();
            foreach (KeyValuePair<string, Def> kv in defs)
            {
                bool verificada = Array.IndexOf(Verificadas, kv.Key) >= 0;
                if (!verificada && !enPrueba.Contains(kv.Key)) continue;
                anunciadas.Add(new DescripcionAccion(kv.Key, (verificada ? "" : "EN PRUEBA (NO verificada): ") + kv.Value.Descripcion, true, kv.Value.Parametros).ConCosto(kv.Value.Puntos, kv.Value.Cooldown));
            }
            acciones = new RegistroAcciones(anunciadas);
        }

        // puente-config.txt, clave en_prueba=a,b : habilita acciones aun no verificadas SOLO para pruebas locales.
        private HashSet<string> LeerEnPrueba()
        {
            HashSet<string> r = new HashSet<string>();
            try
            {
                string ruta = Path.Combine(carpeta, "puente-config.txt");
                if (!File.Exists(ruta)) return r;
                foreach (string l in File.ReadAllLines(ruta))
                {
                    string t = l.Trim();
                    if (!t.StartsWith("en_prueba=")) continue;
                    foreach (string n in t.Substring(10).Split(',')) { string x = n.Trim(); if (x.Length > 0) r.Add(x); }
                }
            }
            catch (Exception) { }
            return r;
        }

        public InfoJuego Info { get { return info; } }
        public CapacidadesMundo Capacidades { get { return capacidades; } }
        public RegistroAcciones Acciones { get { return acciones; } }

        // ---------------------------------------------------------------- utilidades
        private void Medir(string linea)
        {
            try { File.AppendAllText(Path.Combine(carpeta, "puente-mediciones.txt"), DateTime.Now.ToString("HH:mm:ss.fff") + " " + linea + Environment.NewLine); }
            catch (Exception) { }
        }

        private void ExigirEscenario()
        {
            if (!hayEscenario) throw new ErrorPuente(Codigos.NoListo, "No hay escenario: llame primero a /v1/escenario/reiniciar.");
            if (!Juego.Cargado) throw new ErrorPuente(Codigos.NoListo, "El mundo del juego aun no esta listo.");
        }

        private Faccion Buscar(string id)
        {
            foreach (Faccion f in facciones) { if (f.Id == id) return f; }
            throw new ErrorPuente(Codigos.SolicitudInvalida, "Faccion desconocida: " + id + ".");
        }

        private static string OpcionTexto(SolicitudReinicio s, string clave, string porDefecto)
        {
            object v;
            if (s.Opciones == null || !s.Opciones.TryGetValue(clave, out v) || v == null) return porDefecto;
            string t = v as string;
            if (t == null) throw new ErrorPuente(Codigos.SolicitudInvalida, "'opciones." + clave + "' debe ser texto.");
            return t;
        }

        private static long OpcionEntero(SolicitudReinicio s, string clave, long porDefecto, long min, long max)
        {
            object v;
            if (s.Opciones == null || !s.Opciones.TryGetValue(clave, out v) || v == null) return porDefecto;
            if (!(v is long)) throw new ErrorPuente(Codigos.SolicitudInvalida, "'opciones." + clave + "' debe ser un entero.");
            long n = (long)v;
            if (n < min || n > max) throw new ErrorPuente(Codigos.SolicitudInvalida, "'opciones." + clave + "' fuera de rango " + min + ".." + max + ".");
            return n;
        }

        // tamano_mapa: id del juego (tiny|small|standard|large|huge) o entero. Un entero 2..8 es el indice de tamano del
        // juego (zonas de 64 tiles por lado); uno >= 12 es el ancho aproximado en tiles y se redondea al tamano mas cercano.
        private static string ResolverTamano(object pedido)
        {
            string[] permitidos = new string[] { "tiny", "small", "standard", "large", "huge" };
            if (pedido == null) return "standard";
            string t = pedido as string;
            if (t != null)
            {
                if (Array.IndexOf(permitidos, t) < 0) throw new ErrorPuente(Codigos.SolicitudInvalida, "tamano_mapa debe ser uno de: tiny, small, standard, large, huge.");
                return t;
            }
            double d = pedido is long ? (long)pedido : (double)pedido;
            int indice = d >= 12 ? (int)Math.Round(d / 64.0) : (int)d;
            if (indice < 2) indice = 2;
            if (indice > 6) indice = 6;
            return permitidos[indice - 2];
        }

        // ---------------------------------------------------------------- reiniciar
        public IDictionary<string, object> Reiniciar(SolicitudReinicio s)
        {
            if (avance != null) throw new ErrorPuente(Codigos.JuegoOcupado, "Hay un avance en curso.");
            if (!Juego.Cargado) throw new ErrorPuente(Codigos.NoListo, "El juego aun carga.");
            int n = s.Facciones.Count;
            if (n < 2 || n > 4) throw new ErrorPuente(Codigos.SolicitudInvalida, "Se admiten de 2 a 4 facciones.");
            string[] especies = new string[n];
            for (int i = 0; i < n; i++)
            {
                string e = s.Facciones[i].Especie ?? "human";
                if (!Juego.EspecieValida(e)) throw new ErrorPuente(Codigos.SolicitudInvalida, "especie debe ser human, elf, orc o dwarf.");
                especies[i] = e;
            }
            string tam = ResolverTamano(s.TamanoMapa);
            string plant = OpcionTexto(s, "plantilla", "continent");
            if (Array.IndexOf(Plantillas, plant) < 0) throw new ErrorPuente(Codigos.SolicitudInvalida, "opciones.plantilla debe ser continent, boring_plains o pancake.");
            string vel = OpcionTexto(s, "velocidad", "x5");
            if (Array.IndexOf(Velocidades, vel) < 0) throw new ErrorPuente(Codigos.SolicitudInvalida, "opciones.velocidad debe ser x1, x2, x3, x4, x5, x10, x15 o x20.");
            int inicial = (int)OpcionEntero(s, "unidades_iniciales", 4, 1, 8);
            int radio = (int)OpcionEntero(s, "radio_creacion", RadioCreacionPorDefecto, 0, 8);
            int tPoderes = (int)OpcionEntero(s, "tope_poderes", MaxPoderesPorFaccion, 0, MaxPoderesPorFaccion);
            int tDonado = (int)OpcionEntero(s, "tope_donado", MaxDonadoPorFaccion, 0, MaxDonadoPorFaccion);

            Stopwatch total = Stopwatch.StartNew();
            hayEscenario = false;
            inicioGuerra.Clear();
            facciones = new List<Faccion>();
            Juego.Pausar(true);

            // 1+2. Mundo nuevo y sitios. generateNewMap() es asincrono (SmoothLoader, un paso por cuadro); aqui se avanza el
            //    cargador del propio juego en este mismo hilo hasta que termina (medido: 0.4 a 1.0 s segun el tamano). Las anclas
            //    son simetricas; cada sitio es la zona que el juego da por buena para esa especie. Si el mapa no ofrece sitio
            //    para alguna faccion (medido: ~1 de cada 20 mapas), se genera otro (hasta 4 intentos).
            Sitio[] sitios = null;
            int vueltas = 0, intentosMapa = 0;
            long msGenerar = 0;
            while (sitios == null && intentosMapa < 4)
            {
                intentosMapa++;
                Config.customMapSize = tam;
                Config.current_map_template = plant;
                World.world.generateNewMap();
                int v = 0;
                while (SmoothLoader.isLoading() && v < 50000) { SmoothLoader.update(0.5f); v++; }
                vueltas += v;
                if (SmoothLoader.isLoading() || Config.worldLoading)
                    throw new ErrorPuente(Codigos.ErrorInterno, "La generacion del mapa no termino tras " + v + " pasos del cargador.");
                Juego.Pausar(true); // generar el mapa deja el juego sin pausa
                msGenerar = total.ElapsedMilliseconds;

                Actor[] muestras = new Actor[n];
                WorldTile centroMapa = World.world.GetTile(MapBox.width / 2, MapBox.height / 2);
                for (int i = 0; i < n; i++) muestras[i] = Juego.Crear(especies[i], centroMapa);
                Sitio[] cand = Juego.ElegirSitios(muestras, 400);
                bool completo = true;
                foreach (Sitio st in cand) { if (st == null) completo = false; }
                if (!completo)
                {
                    cand = Juego.ElegirSitios(muestras, 250);
                    completo = true;
                    foreach (Sitio st in cand) { if (st == null) completo = false; }
                }
                for (int i = 0; i < n; i++) { try { muestras[i].dieSimpleNone(); } catch (Exception) { } }
                if (completo) sitios = cand;
            }
            if (sitios == null) throw new ErrorPuente(Codigos.ErrorInterno, "No se encontraron sitios validos para todas las facciones en " + intentosMapa + " mapas generados; reintente.");
            Config.setWorldSpeed(vel, false);
            tamano = tam; plantilla = plant; velocidad = vel; radioCreacion = radio; topePoderes = tPoderes; topeDonado = tDonado;            long msSitios = total.ElapsedMilliseconds;

            // 3. Fundadores: un adulto funda ciudad y reino; el resto de la dotacion inicial se une a la ciudad.
            List<Faccion> nuevas = new List<Faccion>();
            for (int i = 0; i < n; i++)
            {
                Faccion f = new Faccion();
                f.Id = s.Facciones[i].Id;
                f.Especie = especies[i];
                f.SitioX = sitios[i].Centro.x; f.SitioY = sitios[i].Centro.y; f.CalidadSitio = sitios[i].Calidad;
                Actor fundador = Juego.Crear(especies[i], sitios[i].Centro);
                if (!fundador.buildCityAndStartCivilization())
                    throw new ErrorPuente(Codigos.ErrorInterno, "El juego rechazo fundar la ciudad de " + f.Id + " en (" + f.SitioX + "," + f.SitioY + ").");
                f.Reino = fundador.kingdom;
                f.CiudadInicial = fundador.city;
                List<WorldTile> libres = Juego.TilesLibresAlrededor(sitios[i].Centro, inicial - 1, 4);
                foreach (WorldTile t in libres)
                {
                    Actor u = Juego.Crear(especies[i], t);
                    u.joinCity(f.CiudadInicial);
                }
                nuevas.Add(f);
            }
            Juego.Estabilizar();
            foreach (Faccion f in nuevas)
            {
                if (!Juego.Vivo(f.Reino)) throw new ErrorPuente(Codigos.ErrorInterno, "El reino de " + f.Id + " no quedo vivo tras fundarlo.");
            }
            facciones = nuevas;
            t0Escenario = Juego.TiempoMundo();
            objetivoEscenario = t0Escenario;
            turno = 0;
            hayEscenario = true;
            contadorEscenarios++;
            zonasTotales = Juego.ZonasX * Juego.ZonasY;
            long msTotal = total.ElapsedMilliseconds;

            StringBuilder huella = new StringBuilder();
            huella.Append(tam).Append('|').Append(plant).Append('|').Append(MapBox.width).Append('x').Append(MapBox.height).Append('|').Append(inicial);
            for (int y = 0; y < MapBox.height; y += 4)
                for (int x = 0; x < MapBox.width; x += 4) huella.Append(World.world.GetTile(x, y).Type.index_id).Append(',');
            foreach (Faccion f in facciones) huella.Append('|').Append(f.Id).Append(':').Append(f.Especie).Append(':').Append(f.SitioX).Append(':').Append(f.SitioY);
            string hash = Juego.Sha256Hex(huella.ToString());

            Medir("REINICIO escenario=" + contadorEscenarios + " tam=" + tam + " plantilla=" + plant + " vel=" + vel + " facciones=" + n
                + " ms_generar=" + msGenerar + " ms_sitios=" + (msSitios - msGenerar) + " ms_total=" + msTotal + " vueltas_cargador=" + vueltas);

            Dictionary<string, object> r = new Dictionary<string, object>();
            r["escenario_id"] = "wb-" + contadorEscenarios + "-" + hash.Substring(0, 8);
            r["hash_mundo"] = hash;
            r["semilla_controlada"] = false;
            r["mundo"] = Json.Objeto("ancho", MapBox.width, "alto", MapBox.height, "plantilla", plant, "tamano", tam, "velocidad", vel, "unidades_iniciales", inicial, "radio_creacion", radio,
                "ms_generar", msGenerar, "ms_total", msTotal, "intentos_mapa", intentosMapa);
            List<object> lista = new List<object>();
            foreach (Faccion f in facciones)
                lista.Add(Json.Objeto("id", f.Id, "especie", f.Especie, "nombre", f.Reino.name, "sitio_x", f.SitioX, "sitio_y", f.SitioY, "calidad_sitio", f.CalidadSitio));
            r["facciones"] = lista;
            return r;
        }

        // ---------------------------------------------------------------- observacion
        private Dictionary<string, object> Vista(Faccion f, bool propia)
        {
            bool vivo = Juego.Vivo(f.Reino);
            Kingdom k = f.Reino;
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["id"] = f.Id;
            d["vivo"] = vivo;
            d["especie"] = f.Especie;
            d["poblacion"] = vivo ? k.getPopulationPeople() : 0;
            d["ciudades"] = vivo ? k.countCities() : 0;
            d["territorio"] = vivo ? k.countZones() : 0;
            d["recursos"] = vivo ? Juego.Recursos(k) : 0;
            d["objetivos"] = vivo ? k.countCities() : 0;
            d["ejercito"] = vivo ? k.countTotalWarriors() : 0;
            d["edificios"] = vivo ? k.countBuildings() : 0;
            d["comida"] = vivo ? k.countTotalFood() : 0;
            d["salud_media_pct"] = vivo ? Juego.SaludMediaPct(k) : 0;
            d["rey_vivo"] = vivo && k.king != null && k.king.isAlive();
            d["cooldowns"] = new Dictionary<string, object>();
            if (propia)
            {
                d["unidades_creadas"] = f.UnidadesCreadas;
                d["unidades_creables_restantes"] = Math.Max(0, MaxUnidadesCreadasPorFaccion - f.UnidadesCreadas);
                d["poderes_restantes"] = Math.Max(0, topePoderes - f.PoderesUsados);
                d["donacion_restante"] = Math.Max(0, topeDonado - f.Donado);
            }
            return d;
        }

        public IDictionary<string, object> Observar(string faccion)
        {
            ExigirEscenario();
            Stopwatch sw = Stopwatch.StartNew();
            Faccion yo = Buscar(faccion);
            List<object> rivales = new List<object>();
            foreach (Faccion f in facciones) { if (f != yo) rivales.Add(Vista(f, false)); }
            int libres = 0;
            for (int zx = 0; zx < Juego.ZonasX; zx++)
            {
                for (int zy = 0; zy < Juego.ZonasY; zy++)
                {
                    TileZone z = Juego.Zona(zx, zy);
                    if (z != null && z.tiles_with_ground > 0 && z.city == null) libres++;
                }
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["tiempo_juego_s"] = Math.Max(0.0, Juego.TiempoMundo() - t0Escenario);
            r["turno_juego"] = turno;
            r["faccion"] = Vista(yo, true);
            r["rivales"] = rivales;
            r["mundo"] = Json.Objeto("tamano_mapa", zonasTotales, "libres", Math.Min(libres, zonasTotales), "ancho", MapBox.width, "alto", MapBox.height, "velocidad", velocidad);
            Medir("OBSERVAR ms=" + sw.Elapsed.TotalMilliseconds.ToString("F2", System.Globalization.CultureInfo.InvariantCulture) + " unidades_vivas=" + World.world.units.units_only_alive.Count);
            return r;
        }

        // ---------------------------------------------------------------- acciones
        public ResultadoAccion Ejecutar(string faccion, string accion, IDictionary<string, object> parametros)
        {
            ExigirEscenario();
            Faccion f = Buscar(faccion);
            if (avance != null) throw new ErrorPuente(Codigos.JuegoOcupado, "Hay un avance en curso.");
            Def d;
            if (!defs.TryGetValue(accion, out d) || !acciones.Contiene(accion))
                return ResultadoAccion.De(ResultadoAccion.Rechazada, "accion_desconocida", "La accion no esta disponible.", null);
            if (EsTerminal()) return ResultadoAccion.De(ResultadoAccion.Rechazada, "partida_terminada", "La partida ya termino.", null);
            if (!Juego.Vivo(f.Reino)) return ResultadoAccion.De(ResultadoAccion.Rechazada, "eliminado", "La faccion esta eliminada.", null);
            return d.Ejecuta(f, parametros);
        }

        private void RegistrarDefs()
        {
            AgregarDef("crear_unidades", "Crea de 1 a " + MaxCrearPorAccion + " adultos de la especie propia junto a la ciudad inicial y los une a ella. Todo o nada: si no hay casillas aptas para todos, se rechaza (sin_espacio) sin crear ninguno. Tope " + MaxUnidadesCreadasPorFaccion + " por faccion y partida.",
                new ParametroAccion[] { ParametroAccion.Entero("cantidad", 1, MaxCrearPorAccion) }, CrearUnidades, 2, 1);

            AgregarDef("bendecir", "Suelta de 1 a 3 gotas de bendicion sobre tus propias unidades aun no bendecidas (rasgo blessed: mas salud maxima). Tope " + MaxPoderesPorFaccion + " poderes por faccion y partida.",
                new ParametroAccion[] { ParametroAccion.Entero("gotas", 1, 3) }, delegate(Faccion f, IDictionary<string, object> p) { return Poder(f, null, "blessing", "blessed", true, (int)(long)p["gotas"]); }, 1, 1);
            AgregarDef("maldecir", "Suelta de 1 a 3 gotas de maldicion sobre unidades de una faccion rival (estado cursed: pierde salud). Tope " + MaxPoderesPorFaccion + " poderes por faccion y partida.",
                new ParametroAccion[] { ParametroAccion.Cadena("objetivo", 1, 40), ParametroAccion.Entero("gotas", 1, 3) },
                delegate(Faccion f, IDictionary<string, object> p) { return Poder(f, (string)p["objetivo"], "curse", "cursed", false, (int)(long)p["gotas"]); }, 2, 2);
            AgregarDef("incendiar", "Suelta de 1 a 3 gotas de fuego sobre unidades de una faccion rival (estado burning: pierde salud). Tope " + MaxPoderesPorFaccion + " poderes por faccion y partida.",
                new ParametroAccion[] { ParametroAccion.Cadena("objetivo", 1, 40), ParametroAccion.Entero("gotas", 1, 3) },
                delegate(Faccion f, IDictionary<string, object> p) { return Poder(f, (string)p["objetivo"], "fire", "burning", false, (int)(long)p["gotas"]); }, 2, 2);
            AgregarDef("donar_recursos", "Agrega de 1 a 10 unidades de un recurso al almacen de tu ciudad (tope " + MaxDonadoPorFaccion + " en total por faccion y partida).",
                new ParametroAccion[] { ParametroAccion.CadenaEnum("recurso", Juego.RecursosContados), ParametroAccion.Entero("cantidad", 1, 10) }, DonarRecursos, 1, 0);
            AgregarDef("declarar_guerra", "Declara la guerra de tipo normal a una faccion rival viva con la que no estes en guerra.",
                new ParametroAccion[] { ParametroAccion.Cadena("objetivo", 1, 40) }, DeclararGuerra, 3, 5);
            AgregarDef("pedir_paz", "Termina una guerra con un rival (solo si lleva al menos " + MinSegundosGuerra + " s de juego).",
                new ParametroAccion[] { ParametroAccion.Cadena("objetivo", 1, 40) }, PedirPaz, 1, 0);
        }

        public const int MaxPoderesPorFaccion = 10;
        public const int MaxDonadoPorFaccion = 100;
        public const int MinSegundosGuerra = 30;
        private readonly Dictionary<string, double> inicioGuerra = new Dictionary<string, double>();

        private void AgregarDef(string nombre, string descripcion, ParametroAccion[] parametros, Func<Faccion, IDictionary<string, object>, ResultadoAccion> ejecuta, int puntos, int cooldown)
        {
            Def d = new Def();
            d.Nombre = nombre; d.Descripcion = descripcion; d.Parametros = parametros; d.Ejecuta = ejecuta;
            d.Puntos = puntos; d.Cooldown = cooldown;
            defs[nombre] = d;
        }

        /// <summary>
        /// El objetivo de una accion lo escribe un modelo: uno que no existe en el escenario (o el propio actor) NO es una
        /// solicitud rota sino una jugada invalida, asi que se responde con un rechazo estructurado (HTTP 200,
        /// objetivo_invalido / objetivo_propio) y no con un 400 que el cliente tomaria por una averia del puente.
        /// Devuelve null y el objetivo en `blanco` si es valido.
        /// </summary>
        private ResultadoAccion ResolverObjetivo(Faccion actor, string objetivo, out Faccion blanco)
        {
            blanco = null;
            List<string> ids = new List<string>();
            foreach (Faccion x in facciones) ids.Add(x.Id);
            ResultadoAccion no = ReglasAccion.ValidarObjetivo(actor.Id, objetivo, ids);
            if (no != null) return no;
            foreach (Faccion x in facciones) { if (x.Id == objetivo) blanco = x; }
            return null;
        }

        private static ResultadoAccion Rechazo(string codigo, string mensaje)
        {
            return ResultadoAccion.De(ResultadoAccion.Rechazada, codigo, mensaje, null);
        }

        // Poderes divinos: DropManager.spawn(tile, dropId) (publico, comprobado en vivo) sobre el tile de unidades concretas.
        // El efecto llega cuando la gota cae y aterriza (unos segundos de juego): por eso se mide en la observacion posterior.
        private ResultadoAccion Poder(Faccion f, string objetivo, string dropId, string marca, bool propio, int gotas)
        {
            Faccion blanco = f;
            if (!propio)
            {
                ResultadoAccion no = ResolverObjetivo(f, objetivo, out blanco);
                if (no != null) return no;
                if (!Juego.Vivo(blanco.Reino)) return Rechazo("objetivo_eliminado", "El rival ya esta eliminado.");
            }
            if (f.PoderesUsados + 1 > topePoderes) return Rechazo("tope_poderes", "Se alcanzo el tope de " + topePoderes + " poderes por faccion.");
            Juego.Estabilizar();
            List<Actor> objetivos = new List<Actor>();
            List<Actor> todas = World.world.units.units_only_alive;
            for (int i = 0; i < todas.Count && objetivos.Count < gotas; i++)
            {
                Actor a = todas[i];
                if (a.kingdom != blanco.Reino || !a.isAlive() || a.current_tile == null) continue;
                if (dropId == "blessing" ? a.hasTrait(marca) : Juego.TieneEstado(a, marca)) continue;
                objetivos.Add(a);
            }
            if (objetivos.Count == 0) return ResultadoAccion.De(ResultadoAccion.SinEfecto, "sin_objetivos", "No hay unidades a las que afecte.", Json.Objeto("objetivo", blanco.Id));
            int saludAntes = Juego.SaludMediaPct(blanco.Reino);
            int soltadas = 0;
            foreach (Actor a in objetivos)
            {
                if (World.world.drop_manager.spawn(a.current_tile, dropId, -1f, -1f, -1L) != null) soltadas++;
            }
            if (soltadas > 0) f.PoderesUsados++;
            Dictionary<string, object> efecto = Json.Objeto("objetivo", blanco.Id, "gotas", soltadas, "poder", dropId, "diferido", true, "salud_media_antes_pct", saludAntes,
                "poderes_usados", f.PoderesUsados);
            if (soltadas == 0) return ResultadoAccion.De(ResultadoAccion.SinEfecto, "sin_efecto", "El juego no creo ninguna gota.", efecto);
            return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "Gotas soltadas; el efecto llega al caer.", efecto);
        }

        private ResultadoAccion DonarRecursos(Faccion f, IDictionary<string, object> p)
        {
            string recurso = (string)p["recurso"];
            int cantidad = (int)(long)p["cantidad"];
            City ciudad = CiudadDe(f);
            if (ciudad == null) return Rechazo("sin_ciudad", "La faccion no tiene ciudad.");
            if (f.Donado + cantidad > topeDonado) return Rechazo("tope_donacion", "Superaria el tope de " + topeDonado + " recursos donados.");
            int antes = ciudad.getResourcesAmount(recurso);
            // OJO: el valor que devuelve addResourcesToRandomStockpile NO es lo agregado sino el total acumulado (medido en vivo:
            // 10, 20, 30...). Lo agregado de verdad es la diferencia medida antes/despues.
            ciudad.addResourcesToRandomStockpile(recurso, cantidad);
            int despues = ciudad.getResourcesAmount(recurso);
            int agregado = Math.Max(0, despues - antes);
            f.Donado += Math.Max(0, despues - antes);
            Dictionary<string, object> efecto = Json.Objeto("recurso", recurso, "pedidos", cantidad, "agregados", agregado, "antes", antes, "despues", despues, "donado_total", f.Donado);
            if (despues <= antes) return ResultadoAccion.De(ResultadoAccion.SinEfecto, "sin_almacen", "La ciudad no tiene almacen donde guardarlo.", efecto);
            return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "Recursos agregados.", efecto);
        }

        private static string ClaveGuerra(Faccion a, Faccion b)
        {
            return string.CompareOrdinal(a.Id, b.Id) < 0 ? a.Id + "|" + b.Id : b.Id + "|" + a.Id;
        }

        private ResultadoAccion DeclararGuerra(Faccion f, IDictionary<string, object> p)
        {
            Faccion d;
            ResultadoAccion no = ResolverObjetivo(f, (string)p["objetivo"], out d);
            if (no != null) return no;
            if (!Juego.Vivo(d.Reino)) return Rechazo("objetivo_eliminado", "El rival ya esta eliminado.");
            if (World.world.wars.isInWarWith(f.Reino, d.Reino)) return Rechazo("ya_en_guerra", "Ya estas en guerra con ese rival.");
            WarTypeAsset tipo = AssetManager.war_types_library.get("normal");
            War guerra = World.world.wars.newWar(f.Reino, d.Reino, tipo);
            Juego.Estabilizar();
            bool en = World.world.wars.isInWarWith(f.Reino, d.Reino);
            Dictionary<string, object> efecto = Json.Objeto("objetivo", d.Id, "en_guerra_antes", false, "en_guerra_despues", en);
            if (guerra == null || !en) return ResultadoAccion.De(ResultadoAccion.SinEfecto, "sin_efecto", "El juego no abrio la guerra.", efecto);
            inicioGuerra[ClaveGuerra(f, d)] = Juego.TiempoMundo();
            return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "Guerra declarada.", efecto);
        }

        private ResultadoAccion PedirPaz(Faccion f, IDictionary<string, object> p)
        {
            Faccion d;
            ResultadoAccion no = ResolverObjetivo(f, (string)p["objetivo"], out d);
            if (no != null) return no;
            War guerra = World.world.wars.getWar(f.Reino, d.Reino, false) ?? World.world.wars.getWar(d.Reino, f.Reino, false);
            if (guerra == null || !World.world.wars.isInWarWith(f.Reino, d.Reino)) return Rechazo("sin_guerra", "No estas en guerra con ese rival.");
            double inicio;
            if (inicioGuerra.TryGetValue(ClaveGuerra(f, d), out inicio) && Juego.TiempoMundo() - inicio < MinSegundosGuerra)
                return Rechazo("guerra_reciente", "La guerra lleva menos de " + MinSegundosGuerra + " s de juego.");
            World.world.wars.endWar(guerra, WarWinner.Peace);
            Juego.Estabilizar();
            bool en = World.world.wars.isInWarWith(f.Reino, d.Reino);
            Dictionary<string, object> efecto = Json.Objeto("objetivo", d.Id, "en_guerra_antes", true, "en_guerra_despues", en);
            if (en) return ResultadoAccion.De(ResultadoAccion.SinEfecto, "sin_efecto", "La guerra sigue abierta.", efecto);
            return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "Paz firmada.", efecto);
        }

        private ResultadoAccion CrearUnidades(Faccion f, IDictionary<string, object> p)
        {
            int cantidad = (int)(long)p["cantidad"];
            City ciudad = CiudadDe(f);
            if (ciudad == null) return Rechazo("sin_ciudad", "La faccion no tiene ciudad.");
            WorldTile centro = ciudad.getTile(false);
            if (centro == null) return Rechazo("sin_ciudad", "La ciudad no tiene tile.");
            // TODO O NADA: antes de crear nada se cuentan las casillas aptas (suelo transitable, sin edificio, misma isla,
            // a radioCreacion tiles de la ciudad). Si no alcanzan para `cantidad` (o se superaria el tope) se rechaza sin
            // tocar el mundo ni el cupo; no hay ejecucion parcial por falta de espacio.
            List<WorldTile> libres = Juego.TilesLibresAlrededor(centro, cantidad, radioCreacion);
            ResultadoAccion no = ReglasAccion.ValidarCreacion(cantidad, libres.Count, f.UnidadesCreadas, MaxUnidadesCreadasPorFaccion);
            if (no != null) return no;
            Juego.Estabilizar();
            int antes = f.Reino.getPopulationPeople();
            int creadas = 0;
            foreach (WorldTile t in libres)
            {
                Actor u = Juego.Crear(f.Especie, t);
                if (u == null) continue; // residual: el juego se nego a crearla; `efecto` dice exactamente cuantas hubo
                u.joinCity(ciudad);
                creadas++;
            }
            Juego.Estabilizar();
            int despues = f.Reino.getPopulationPeople();
            f.UnidadesCreadas += creadas; // se cuenta lo REALMENTE creado, nunca lo pedido
            Dictionary<string, object> efecto = Json.Objeto("pedidas", cantidad, "creadas", creadas, "poblacion_antes", antes, "poblacion_despues", despues,
                "unidades_creadas_total", f.UnidadesCreadas);
            if (creadas == 0) return ResultadoAccion.De(ResultadoAccion.SinEfecto, "sin_efecto", "No se creo ninguna unidad.", efecto);
            if (despues <= antes) return ResultadoAccion.De(ResultadoAccion.SinEfecto, "sin_efecto", "Se crearon unidades pero la poblacion no aumento.", efecto);
            if (creadas < cantidad) return ResultadoAccion.De(ResultadoAccion.Ejecutada, "parcial", "El juego creo " + creadas + " de las " + cantidad + " pedidas.", efecto);
            return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "Unidades creadas.", efecto);
        }
        private City CiudadDe(Faccion f)
        {
            if (f.Reino == null) return null;
            if (f.CiudadInicial != null && f.CiudadInicial.isAlive() && f.Reino.cities.Contains(f.CiudadInicial)) return f.CiudadInicial;
            foreach (City c in f.Reino.cities) { if (c != null && c.isAlive()) return c; }
            return null;
        }

        // ---------------------------------------------------------------- avanzar
        public void Avanzar(double segundos, Action<ResultadoAvance> alTerminar)
        {
            ExigirEscenario();
            if (avance != null) throw new ErrorPuente(Codigos.JuegoOcupado, "Ya hay un avance en curso.");
            AvanceEnCurso a = new AvanceEnCurso();
            a.T0 = Juego.TiempoMundo();
            a.Pedido = segundos;
            a.Objetivo = objetivoEscenario + segundos;
            objetivoEscenario = a.Objetivo;
            a.Reloj = Stopwatch.StartNew();
            a.Cuadro0 = Time.frameCount;
            a.Termina = alTerminar;
            a.Velocidad = velocidad;
            avance = a;
            Juego.Pausar(false);
        }

        /// <summary>Se llama cada cuadro desde Update(), despues de Bombear.</summary>
        public void Tick()
        {
            if (!hayEscenario || !Juego.Cargado) return;
            AvanceEnCurso a = avance;
            if (a == null)
            {
                // Entre turnos la simulacion queda pausada (protocolo v1): si alguien la reanuda, se vuelve a pausar.
                if (!Juego.Pausado) Juego.Pausar(true);
                return;
            }
            double t = Juego.TiempoMundo();
            bool fin = t >= a.Objetivo - 1e-9;
            bool unicoVivo = !fin && VivasCount() <= 1;
            bool vencido = a.Reloj.ElapsedMilliseconds > 170000;
            if (!fin && !unicoVivo && !vencido) return;
            Juego.Pausar(true);
            avance = null;
            turno++;
            try { Juego.Estabilizar(); } catch (Exception) { }
            double real = Juego.TiempoMundo() - a.T0;
            Medir("AVANCE pedido=" + a.Pedido.ToString("R", System.Globalization.CultureInfo.InvariantCulture) + " real=" + real.ToString("R", System.Globalization.CultureInfo.InvariantCulture)
                + " desviacion=" + (real - a.Pedido).ToString("R", System.Globalization.CultureInfo.InvariantCulture) + " deriva_acumulada=" + (Juego.TiempoMundo() - a.Objetivo).ToString("R", System.Globalization.CultureInfo.InvariantCulture) + " cuadros=" + (Time.frameCount - a.Cuadro0)
                + " ms_reloj=" + a.Reloj.ElapsedMilliseconds + " vel=" + a.Velocidad + " motivo=" + (fin ? "tiempo" : unicoVivo ? "unico_vivo" : "vencido"));
            ResultadoAvance ra = new ResultadoAvance();
            ra.TiempoJuegoS = Math.Max(0.0, Juego.TiempoMundo() - t0Escenario);
            ra.Terminal = EsTerminal();
            if (vencido && !fin && !unicoVivo) ra.Error = "El avance excedio 170 s de reloj real.";
            a.Termina(ra);
        }

        // ---------------------------------------------------------------- presentacion (video)
        // Controles para GRABAR: no son acciones del juego, no pasan por la lista blanca y el modelo no los ve nunca.
        // Verificados en vivo (ver V1-entrega.md): la camara de verdad sigue a la unidad y la interfaz desaparece y vuelve.
        public bool CamaraVerificada { get { return true; } }
        public bool InterfazVerificada { get { return true; } }

        private static MoveCamera CamaraDelJuego()
        {
            // MoveCamera.instance es internal: se lee por reflexion; sus metodos de zoom son publicos.
            System.Reflection.FieldInfo campo = typeof(MoveCamera).GetField("instance", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Public);
            MoveCamera c = campo == null ? null : campo.GetValue(null) as MoveCamera;
            if (c == null) throw new ErrorPuente(Codigos.NoListo, "La camara del juego aun no existe.");
            return c;
        }

        // Rey (o lider) vivo si hay; si no, la primera unidad viva de la ciudad capital; si no, cualquier unidad viva del reino.
        private Actor ElegirFoco(Faccion f)
        {
            Kingdom k = f.Reino;
            if (k == null || !k.isAlive()) return null;
            if (k.king != null && k.king.isAlive() && k.king.current_tile != null) return k.king;
            City ciudad = CiudadDe(f);
            List<Actor> todas = World.world.units.units_only_alive;
            Actor cualquiera = null;
            for (int i = 0; i < todas.Count; i++)
            {
                Actor a = todas[i];
                if (a.kingdom != k || !a.isAlive() || a.current_tile == null) continue;
                if (ciudad != null && a.city == ciudad) return a;
                if (cualquiera == null) cualquiera = a;
            }
            return cualquiera;
        }

                private Actor seguido; // modo "limpio": unidad a la que la camara sigue sin usar el seguimiento (ni el panel) del juego

        /// <summary>Cada cuadro, tras la logica del juego (LateUpdate): mueve la camara hacia la unidad seguida en modo limpio.</summary>
        public void SeguirCamara()
        {
            Actor a = seguido;
            if (a == null) return;
            if (!Juego.Cargado || !a.isAlive() || a.current_tile == null) { seguido = null; return; }
            Camera cam = Camera.main;
            if (cam == null) return;
            Vector3 p = cam.transform.position;
            Vector2 u = a.current_position;
            float k = 1f - Mathf.Exp(-10f * Time.unscaledDeltaTime); // suavizado independiente de la velocidad del juego
            cam.transform.position = new Vector3(Mathf.Lerp(p.x, u.x, k), Mathf.Lerp(p.y, u.y, k), p.z);
        }

        public IDictionary<string, object> Camara(string faccion, double? zoom, bool liberar, string modo)
        {
            if (!Juego.Cargado) throw new ErrorPuente(Codigos.NoListo, "El mundo del juego aun no esta listo.");
            MoveCamera cam = CamaraDelJuego();
            if (liberar)
            {
                seguido = null;
                MoveCamera.clearFocusUnitOnly();
                if (zoom.HasValue) cam.setTargetZoom((float)zoom.Value);
                return Json.Objeto("liberada", true, "enfocada", null, "zoom", cam.getTargetZoom());
            }
            ExigirEscenario();
            Faccion f = Buscar(faccion);
            Juego.Estabilizar();
            Actor foco = ElegirFoco(f);
            if (foco == null) throw new ErrorPuente(Codigos.SolicitudInvalida, "La faccion '" + f.Id + "' no tiene ninguna unidad viva que enfocar.");
            if (modo == "limpio")
            {
                MoveCamera.clearFocusUnitOnly();
                seguido = foco;
                Vector3 p0 = Camera.main.transform.position;
                Camera.main.transform.position = new Vector3(foco.current_position.x, foco.current_position.y, p0.z);
            }
            else
            {
                seguido = null;
                MoveCamera.setFocusUnit(foco);
            }
            if (zoom.HasValue) cam.setTargetZoom((float)zoom.Value);
            bool esRey = f.Reino.king == foco;
            return Json.Objeto("liberada", false, "faccion", f.Id, "modo", modo, "zoom", cam.getTargetZoom(),
                "enfocada", Json.Objeto("id", foco.getID(), "nombre", foco.name, "rol", esRey ? "rey" : "habitante", "x", foco.current_tile.x, "y", foco.current_tile.y));
        }

        public IDictionary<string, object> Interfaz(bool visible)
        {
            if (!Juego.Cargado) throw new ErrorPuente(Codigos.NoListo, "El mundo del juego aun no esta listo.");
            // Es la misma bandera que activa el poder hide_ui del juego (PowerLibrary.clickHideUI) y que desactiva ButtonEvent.clickUnHideUI.
            Config.ui_main_hidden = !visible;
            return Json.Objeto("visible", !Config.ui_main_hidden);
        }

        // ---------------------------------------------------------------- terminal
        private int VivasCount()
        {
            int vivas = 0;
            foreach (Faccion f in facciones) { if (Juego.Vivo(f.Reino)) vivas++; }
            return vivas;
        }

        private bool EsTerminal()
        {
            return hayEscenario && facciones.Count >= 2 && VivasCount() <= 1;
        }

        public IDictionary<string, object> EstadoTerminal()
        {
            ExigirEscenario();
            bool terminal = EsTerminal();
            List<object> resumen = new List<object>();
            string ganador = null;
            foreach (Faccion f in facciones)
            {
                resumen.Add(Vista(f, false));
                if (Juego.Vivo(f.Reino)) ganador = f.Id;
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["terminal"] = terminal;
            r["razon"] = terminal ? "supervivencia" : "ninguna";
            r["resumen_por_faccion"] = resumen;
            r["ganador"] = terminal ? ganador : null;
            r["tiempo_juego_s"] = Math.Max(0.0, Juego.TiempoMundo() - t0Escenario);
            return r;
        }

        public void Cerrar()
        {
            if (avance != null)
            {
                Juego.Pausar(true);
                AvanceEnCurso a = avance;
                avance = null;
                ResultadoAvance ra = new ResultadoAvance();
                ra.Error = "El escenario se cerro durante el avance.";
                a.Termina(ra);
            }
            hayEscenario = false;
            inicioGuerra.Clear();
            facciones = new List<Faccion>();
        }
    }
}

