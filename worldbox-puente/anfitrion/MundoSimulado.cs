using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;
using System.Threading;

namespace PuenteWorldBox.Anfitrion
{
    /// <summary>
    /// Mundo falso para probar el protocolo contra codigo C# real sin abrir WorldBox. NO es WorldBox:
    /// sus acciones se marcan verificada:true solo porque aqui SI estan implementadas y probadas; la
    /// integracion real no puede copiar esa marca sin comprobarlas contra el juego (ver README).
    /// Usa el mismo dialecto de datos que src/worldbox/adaptador-simulado.js (campos enteros de faccion,
    /// mundo.tamano_mapa/libres) para que el cliente Node funcione igual contra ambos.
    /// Verifica en cada llamada que corre en el hilo que lo construyo (el "hilo principal" del anfitrion).
    /// </summary>
    public sealed class MundoSimulado : IMundo
    {
        private sealed class Faccion
        {
            public string Id;
            public bool Vivo = true;
            public int Poblacion = 20;
            public int Ciudades = 1;
            public int Territorio = 3;
            public int Recursos = 20;
            public int Objetivos = 0;
            public int Creadas = 0;
        }

        private sealed class Avance
        {
            public double Total;
            public double InicioTiempo;
            public Stopwatch Crono;
            public Action<ResultadoAvance> Termina;
        }

        private readonly int hiloPrincipal;
        private readonly double msPorSegundo;
        private readonly InfoJuego info = new InfoJuego();
        private readonly CapacidadesMundo capacidades = new CapacidadesMundo();
        private readonly RegistroAcciones acciones;
        private int fueraDeHilo;
        private int contadorEscenarios;

        private bool hayEscenario;
        private long semilla;
        private int tamanoMapa;
        private int casillas;      // casillas aptas para nuevas unidades (opciones.casillas, por defecto 1000)
        private int topeUnidades;  // tope de unidades creadas por faccion y partida (opciones.tope_unidades, por defecto 1000)
        private double duracion;
        private double tiempo;
        private double siguientePaso;
        private int turno;
        private List<Faccion> facciones;
        private Random rng;
        private Avance avance;

        /// <summary>Debe construirse en el hilo que luego llamara a Bombear (el hilo principal).</summary>
        public MundoSimulado(double msPorSegundoJuego)
        {
            hiloPrincipal = Thread.CurrentThread.ManagedThreadId;
            msPorSegundo = msPorSegundoJuego;

            info.Nombre = "WorldBox (simulado)";
            info.Version = "anfitrion-0.1";
            info.BuildSteam = "0";
            info.Unity = "n/a";
            info.Origen = "simulado";

            capacidades.Reiniciar = true;
            capacidades.Semilla = true;
            capacidades.Avanzar = true;
            capacidades.Terminal = true;
            capacidades.MultiFaccion = true;
            capacidades.MaxSegundosAvance = 600;
            capacidades.MaxAccionesPorTurno = 10;

            acciones = new RegistroAcciones(new DescripcionAccion[]
            {
                new DescripcionAccion("esperar", "No cambia el mundo.", true).ConCosto(0, 0),
                new DescripcionAccion("crear_unidad",
                    "Gasta 5 recursos por unidad y suma esa cantidad de pobladores. Todo o nada: si no caben (opciones.casillas) o se supera el tope (opciones.tope_unidades) se rechaza sin cambios.", true,
                    ParametroAccion.CadenaEnum("tipo", "aldeano", "soldado"),
                    ParametroAccion.Entero("cantidad", 1, 5)).ConCosto(2, 1),
                new DescripcionAccion("fundar_ciudad",
                    "Gasta 15 recursos; requiere territorio > ciudades; suma 1 ciudad y 1 objetivo.", true,
                    ParametroAccion.Entero("x", 0, 63),
                    ParametroAccion.Entero("y", 0, 63)),
                new DescripcionAccion("dormir",
                    "SOLO PRUEBAS: bloquea el hilo principal esa cantidad de milisegundos.", true,
                    ParametroAccion.Entero("ms", 0, 10000)).ConCosto(1, 0),
                new DescripcionAccion("atacar",
                    "Gasta 8 recursos; objetivo es el id de OTRA faccion viva del escenario; el rival pierde 2 pobladores. Objetivo inexistente: rechazada/objetivo_invalido.", true,
                    ParametroAccion.Cadena("objetivo", 1, 40)).ConCosto(3, 5),
            });
        }

        public int LlamadasFueraDeHilo { get { return Thread.VolatileRead(ref fueraDeHilo); } }

        public InfoJuego Info { get { return info; } }
        public CapacidadesMundo Capacidades { get { return capacidades; } }
        public RegistroAcciones Acciones { get { return acciones; } }

        private void Principal()
        {
            if (Thread.CurrentThread.ManagedThreadId != hiloPrincipal)
            {
                Interlocked.Increment(ref fueraDeHilo);
                throw new InvalidOperationException("IMundo se invoco fuera del hilo principal.");
            }
        }

        private void ExigirEscenario()
        {
            if (!hayEscenario)
                throw new ErrorPuente(Codigos.NoListo, "No hay escenario: llame primero a /v1/escenario/reiniciar.");
        }

        private Faccion Buscar(string id)
        {
            ExigirEscenario();
            foreach (Faccion f in facciones) { if (f.Id == id) return f; }
            throw new ErrorPuente(Codigos.SolicitudInvalida, "Faccion desconocida: " + id + ".");
        }

        // -------------------------------------------------------------------------------

        public IDictionary<string, object> Reiniciar(SolicitudReinicio s)
        {
            Principal();
            if (avance != null) throw new ErrorPuente(Codigos.JuegoOcupado, "Hay un avance en curso.");
            if (s.Facciones.Count < 2 || s.Facciones.Count > 4)
                throw new ErrorPuente(Codigos.SolicitudInvalida, "El mundo simulado admite de 2 a 4 facciones.");

            int tam = 64;
            if (s.TamanoMapa != null)
            {
                if (!(s.TamanoMapa is long) || (long)s.TamanoMapa < 12 || (long)s.TamanoMapa > 10000)
                    throw new ErrorPuente(Codigos.SolicitudInvalida, "'tamano_mapa' debe ser un entero de 12 a 10000.");
                tam = (int)(long)s.TamanoMapa;
            }
            double dur = 120;
            object d;
            if (s.Opciones.TryGetValue("duracion_s", out d))
            {
                if (d is long) dur = (long)d;
                else if (d is double) dur = (double)d;
                else throw new ErrorPuente(Codigos.SolicitudInvalida, "'opciones.duracion_s' debe ser un numero.");
                if (!(dur >= 5 && dur <= 3600)) throw new ErrorPuente(Codigos.SolicitudInvalida, "'opciones.duracion_s' debe estar entre 5 y 3600.");
            }

            casillas = OpcionEntera(s, "casillas", 1000, 0, 100000);
            topeUnidades = OpcionEntera(s, "tope_unidades", 1000, 0, 100000);
            semilla = s.Semilla;
            tamanoMapa = tam;
            duracion = dur;
            tiempo = 0;
            siguientePaso = 1;
            turno = 0;
            rng = new Random((int)semilla);
            facciones = new List<Faccion>();
            StringBuilder huella = new StringBuilder();
            huella.Append(semilla).Append('|').Append(tam).Append('|').Append(dur);
            foreach (FaccionSolicitada fs in s.Facciones)
            {
                Faccion f = new Faccion();
                f.Id = fs.Id;
                f.Poblacion = 20 + rng.Next(0, 3); // el azar sale del RNG con semilla: mismo seed, mismo mundo
                facciones.Add(f);
                huella.Append('|').Append(f.Id).Append(':').Append(f.Poblacion);
            }
            hayEscenario = true;
            contadorEscenarios++;

            Dictionary<string, object> r = new Dictionary<string, object>();
            r["escenario_id"] = "anfitrion-" + semilla + "-" + contadorEscenarios;
            r["hash_mundo"] = Seguridad.Sha256Hex(Encoding.UTF8.GetBytes(huella.ToString()));
            r["semilla_usada"] = semilla;
            r["facciones"] = ListaFacciones();
            return r;
        }

        private static int OpcionEntera(SolicitudReinicio s, string clave, int porDefecto, int min, int max)
        {
            object v;
            if (!s.Opciones.TryGetValue(clave, out v)) return porDefecto;
            if (!(v is long) || (long)v < min || (long)v > max)
                throw new ErrorPuente(Codigos.SolicitudInvalida, "opciones." + clave + " debe ser un entero de " + min + " a " + max + ".");
            return (int)(long)v;
        }

        private List<object> ListaFacciones()
        {
            List<object> l = new List<object>();
            foreach (Faccion f in facciones) l.Add(Vista(f));
            return l;
        }

        private static Dictionary<string, object> Vista(Faccion f)
        {
            return Json.Objeto(
                "id", f.Id, "vivo", f.Vivo, "poblacion", f.Poblacion, "ciudades", f.Ciudades,
                "territorio", f.Territorio, "recursos", f.Recursos, "objetivos", f.Objetivos,
                "cooldowns", new Dictionary<string, object>());
        }

        private int Libres()
        {
            int usados = 0;
            foreach (Faccion f in facciones) usados += f.Territorio;
            return tamanoMapa - usados;
        }

        public IDictionary<string, object> Observar(string faccion)
        {
            Principal();
            Faccion yo = Buscar(faccion);
            List<object> rivales = new List<object>();
            foreach (Faccion f in facciones) { if (f != yo) rivales.Add(Vista(f)); }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["origen"] = "simulado";
            r["tiempo_juego_s"] = tiempo;
            r["turno_juego"] = turno;
            r["faccion"] = Vista(yo);
            r["rivales"] = rivales;
            r["mundo"] = Json.Objeto(
                "tamano_mapa", tamanoMapa, "libres", Libres(), "casillas", casillas,
                // Diagnostico de la prueba de hilos: quien ejecuta esta llamada y cuantas se desviaron.
                "hilo_llamada", Thread.CurrentThread.ManagedThreadId,
                "hilo_principal", hiloPrincipal,
                "llamadas_fuera_de_hilo", LlamadasFueraDeHilo);
            return r;
        }

        public ResultadoAccion Ejecutar(string faccion, string accion, IDictionary<string, object> p)
        {
            Principal();
            Faccion f = Buscar(faccion);
            if (EsTerminal()) return Rechazo("partida_terminada", "La partida ya termino.");
            if (!f.Vivo) return Rechazo("eliminado", "La faccion esta eliminada.");

            switch (accion)
            {
                case "esperar":
                    return ResultadoAccion.De(ResultadoAccion.SinEfecto, "ok", "No se hizo nada.", null);

                case "crear_unidad":
                    {
                        int n = (int)(long)p["cantidad"];
                        int costo = 5 * n;
                        // Todo o nada (regla compartida con el mundo real): se decide ANTES de tocar nada.
                        ResultadoAccion no = ReglasAccion.ValidarCreacion(n, casillas, f.Creadas, topeUnidades);
                        if (no != null) return no;
                        if (f.Recursos < costo) return Rechazo("recursos_insuficientes", "Faltan recursos.");
                        f.Recursos -= costo;
                        f.Poblacion += n;
                        f.Creadas += n;
                        casillas -= n;
                        return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "Unidades creadas.",
                            Json.Objeto("tipo", (string)p["tipo"], "cantidad", n, "poblacion", f.Poblacion, "recursos", f.Recursos));
                    }

                case "fundar_ciudad":
                    {
                        if (f.Recursos < 15) return Rechazo("recursos_insuficientes", "Faltan recursos.");
                        if (f.Territorio <= f.Ciudades) return Rechazo("sin_territorio", "Se necesita mas territorio que ciudades.");
                        f.Recursos -= 15;
                        f.Ciudades++;
                        f.Objetivos++;
                        return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "Ciudad fundada.",
                            Json.Objeto("ciudades", f.Ciudades, "recursos", f.Recursos));
                    }

                case "atacar":
                    {
                        List<string> ids = new List<string>();
                        foreach (Faccion x in facciones) ids.Add(x.Id);
                        ResultadoAccion no = ReglasAccion.ValidarObjetivo(f.Id, (string)p["objetivo"], ids);
                        if (no != null) return no;
                        Faccion rival = Buscar((string)p["objetivo"]);
                        if (!rival.Vivo) return Rechazo("objetivo_eliminado", "El rival ya esta eliminado.");
                        if (f.Recursos < 8) return Rechazo("recursos_insuficientes", "Faltan recursos.");
                        f.Recursos -= 8;
                        rival.Poblacion = Math.Max(0, rival.Poblacion - 2);
                        return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "Ataque.", Json.Objeto("objetivo", rival.Id, "poblacion_rival", rival.Poblacion));
                    }

                case "dormir":
                    Thread.Sleep((int)(long)p["ms"]);
                    return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "Dormi.", null);

                default:
                    // El registro ya filtro nombres desconocidos: llegar aqui es un fallo de programacion.
                    throw new InvalidOperationException("Accion sin implementar: " + accion);
            }
        }

        private static ResultadoAccion Rechazo(string codigo, string mensaje)
        {
            return ResultadoAccion.De(ResultadoAccion.Rechazada, codigo, mensaje, null);
        }

        // -------------------------------------------------------------------------------

        public void Avanzar(double segundos, Action<ResultadoAvance> alTerminar)
        {
            Principal();
            ExigirEscenario();
            if (avance != null) throw new ErrorPuente(Codigos.JuegoOcupado, "Hay un avance en curso.");
            double efectivo = Math.Max(0, Math.Min(segundos, duracion - tiempo));
            turno++;
            if (msPorSegundo <= 0 || efectivo <= 0)
            {
                SimularHasta(tiempo + efectivo);
                alTerminar(Resultado());
                return;
            }
            Avance a = new Avance();
            a.Total = efectivo;
            a.InicioTiempo = tiempo;
            a.Crono = Stopwatch.StartNew();
            a.Termina = alTerminar;
            avance = a;
        }

        /// <summary>Lo llama el bucle del anfitrion en cada cuadro: hace avanzar el tiempo simulado en tiempo real.</summary>
        public void Actualizar()
        {
            Principal();
            Avance a = avance;
            if (a == null) return;
            double hecho = Math.Min(a.Total, a.Crono.ElapsedMilliseconds / msPorSegundo);
            SimularHasta(a.InicioTiempo + hecho);
            if (hecho >= a.Total)
            {
                avance = null;
                a.Termina(Resultado());
            }
        }

        private void SimularHasta(double nuevoTiempo)
        {
            tiempo = nuevoTiempo;
            while (siguientePaso <= tiempo + 1e-9)
            {
                foreach (Faccion f in facciones)
                {
                    if (!f.Vivo) continue;
                    f.Recursos += 1 + f.Ciudades;
                    if (rng.Next(100) < 10) f.Poblacion++;
                }
                siguientePaso += 1;
            }
        }

        private bool EsTerminal()
        {
            return hayEscenario && tiempo >= duracion - 1e-9;
        }

        private ResultadoAvance Resultado()
        {
            ResultadoAvance r = new ResultadoAvance();
            r.TiempoJuegoS = tiempo;
            r.Terminal = EsTerminal();
            return r;
        }

        public IDictionary<string, object> EstadoTerminal()
        {
            Principal();
            ExigirEscenario();
            bool terminal = EsTerminal();
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["terminal"] = terminal;
            r["razon"] = terminal ? "turnos" : "ninguna";
            r["resumen_por_faccion"] = ListaFacciones();
            return r;
        }

        public void Cerrar()
        {
            Principal();
            hayEscenario = false;
            avance = null;
            facciones = null;
        }
    }
}
