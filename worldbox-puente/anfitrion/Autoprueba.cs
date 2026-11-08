using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace PuenteWorldBox.Anfitrion
{
    /// <summary>
    /// Pruebas de la biblioteca en C# (sin NUnit: no hay SDK). Se ejecutan con  Anfitrion.exe --autoprueba
    /// y la prueba de Node las lanza. Imprime "OK nombre" / "FALLO nombre: motivo" y, al final,
    /// "AUTOPRUEBA total=N fallos=M". Cubre lo que desde fuera no se puede provocar: JSON hostil,
    /// cola de hilo principal, analizador HTTP y un servidor con mundos defectuosos.
    /// </summary>
    internal static class Autoprueba
    {
        private static int total;
        private static int fallos;

        private static void Prueba(string nombre, Action a)
        {
            total++;
            try
            {
                a();
                Console.WriteLine("OK " + nombre);
            }
            catch (Exception e)
            {
                fallos++;
                Console.WriteLine("FALLO " + nombre + ": " + e.GetType().Name + ": " + e.Message);
            }
        }

        private static void Verdad(bool condicion, string que)
        {
            if (!condicion) throw new Exception("se esperaba: " + que);
        }

        private static void Igual(object esperado, object real, string que)
        {
            if (!object.Equals(esperado, real))
                throw new Exception(que + ": esperado <" + esperado + "> real <" + real + ">");
        }

        private static void Lanza<T>(Action a, string que) where T : Exception
        {
            try { a(); }
            catch (T) { return; }
            catch (Exception e) { throw new Exception(que + ": se esperaba " + typeof(T).Name + " y llego " + e.GetType().Name); }
            throw new Exception(que + ": se esperaba " + typeof(T).Name + " y no hubo excepcion");
        }

        public static int Ejecutar()
        {
            PruebasJson();
            PruebasSeguridad();
            PruebasRegistro();
            PruebasCache();
            PruebasCola();
            PruebasHttp();
            PruebasServidor();
            PruebasReglasAccion();
            PruebasServidorX2();
            Console.WriteLine("AUTOPRUEBA total=" + total + " fallos=" + fallos);
            return fallos == 0 ? 0 : 1;
        }

        // ---------------------------------------------------------------------------------
        // JSON
        // ---------------------------------------------------------------------------------

        private static object L(string t) { return Json.Leer(t, 1 << 20); }

        private static void PruebasJson()
        {
            Prueba("json: objeto anidado con todos los tipos", delegate()
            {
                Dictionary<string, object> d = (Dictionary<string, object>)L(" {\"a\": [1, -2, 3.5, 1e3, true, false, null, \"x\"], \"b\": {\"c\": {}}} ");
                List<object> a = (List<object>)d["a"];
                Igual(1L, a[0], "entero"); Igual(-2L, a[1], "negativo"); Igual(3.5, a[2], "fraccion");
                Igual(1000.0, a[3], "exponente"); Igual(true, a[4], "true"); Igual(false, a[5], "false");
                Verdad(a[6] == null, "null"); Igual("x", a[7], "cadena");
                Verdad(((Dictionary<string, object>)((Dictionary<string, object>)d["b"])["c"]).Count == 0, "objeto vacio");
            });
            Prueba("json: escapes y unicode", delegate()
            {
                Igual("a\"b\\c/\b\f\n\r\tz", L("\"a\\\"b\\\\c\\/\\b\\f\\n\\r\\tz\""), "escapes");
                Igual("\u00e9", L("\"\\u00e9\""), "\\u00e9");
                Igual("\ud83d\ude00", L("\"\\ud83d\\ude00\""), "par sustituto");
                Igual("\u00e9\u4e2d", L("\"\u00e9\u4e2d\""), "no ASCII directo");
            });
            Prueba("json: numeros grandes", delegate()
            {
                Igual(9223372036854775807L, L("9223372036854775807"), "long maximo");
                Verdad(L("9223372036854775808") is double, "desborda a double");
                Igual(0L, L("-0"), "menos cero");
            });

            string[] malos = new string[]
            {
                "", "   ", "{", "[", "{\"a\":1,}", "[1,]", "[1 2]", "{\"a\" 1}", "{a:1}", "{'a':1}", "[01]", "[1.]", "[.5]", "[+1]", "[-]",
                "[1e]", "[1e+]", "[NaN]", "[Infinity]", "[1e999]", "\"\\x\"", "\"\\u12\"", "\"\\u12G4\"", "\"sin cerrar", "\"tab\there\"",
                "tru", "truex", "nullx", "[true false]", "{} {}", "{}x", "[1]]", "{\"a\":1,\"a\":2}", "// c\n1", "/*c*/1", "\ufeff{}", "{\"a\":}", "[,1]"
            };
            foreach (string m in malos)
            {
                string malo = m;
                Prueba("json: rechaza " + Texto.Limpiar(malo, 30), delegate() { Lanza<JsonExcepcion>(delegate() { L(malo); }, "JSON invalido"); });
            }

            Prueba("json: profundidad 32 si, 33 no", delegate()
            {
                L(new string('[', 32) + new string(']', 32));
                Lanza<JsonExcepcion>(delegate() { L(new string('[', 33) + new string(']', 33)); }, "profundidad 33");
                Lanza<JsonExcepcion>(delegate() { L(new string('[', 100000)); }, "100000 corchetes sin cerrar");
            });
            Prueba("json: limite de tamano", delegate()
            {
                Json.Leer("[" + new string('1', 10) + "]", 12);
                Lanza<JsonExcepcion>(delegate() { Json.Leer("[" + new string('1', 20) + "]", 12); }, "tamano");
            });
            Prueba("json: escribir escapa y respeta el orden", delegate()
            {
                Igual("\"a\\\"\\\\\\n\\u0001\u00e9\"", Json.Escribir("a\"\\\n\u0001\u00e9"), "cadena");
                ObjetoOrdenado o = new ObjetoOrdenado().Con("z", 1).Con("a", 2.5).Con("m", new List<object> { true, null, "x" });
                Igual("{\"z\":1,\"a\":2.5,\"m\":[true,null,\"x\"]}", Json.Escribir(o), "orden");
                Igual("null", Json.Escribir(double.NaN), "NaN");
                Igual("3", Json.Escribir(3.0), "double entero");
                Igual("1E-05", Json.Escribir(0.00001), "exponente");
            });
            Prueba("json: escribir rechaza ciclos y tipos raros", delegate()
            {
                Dictionary<string, object> a = new Dictionary<string, object>();
                a["yo"] = a;
                Lanza<InvalidOperationException>(delegate() { Json.Escribir(a); }, "ciclo");
                Lanza<InvalidOperationException>(delegate() { Json.Escribir(new object()); }, "tipo desconocido");
            });
            Prueba("json: ida y vuelta", delegate()
            {
                string t = "{\"k\":[1,2,{\"x\":\"y\\n\"}],\"b\":false,\"n\":null,\"f\":-1.25}";
                Igual(t, Json.Escribir(L(t)), "ida y vuelta");
            });
        }

        // ---------------------------------------------------------------------------------
        // Seguridad
        // ---------------------------------------------------------------------------------

        private static void PruebasSeguridad()
        {
            Prueba("seguridad: token de 32 bytes en hex, distinto cada vez", delegate()
            {
                string a = Seguridad.GenerarToken(), b = Seguridad.GenerarToken();
                Igual(64, a.Length, "largo");
                foreach (char c in a) Verdad("0123456789abcdef".IndexOf(c) >= 0, "solo hex");
                Verdad(a != b, "tokens distintos");
            });
            Prueba("seguridad: comparacion de tokens", delegate()
            {
                Verdad(Seguridad.IgualesTiempoConstante("abc", "abc"), "iguales");
                Verdad(!Seguridad.IgualesTiempoConstante("abc", "abd"), "distinto ultimo");
                Verdad(!Seguridad.IgualesTiempoConstante("abc", "ab"), "mas corto");
                Verdad(!Seguridad.IgualesTiempoConstante("abc", "abcd"), "mas largo");
                Verdad(!Seguridad.IgualesTiempoConstante("abc", ""), "vacio");
                Verdad(!Seguridad.IgualesTiempoConstante("", ""), "esperado vacio nunca coincide");
                Verdad(!Seguridad.IgualesTiempoConstante("abc", null), "nulo");
            });
        }

        // ---------------------------------------------------------------------------------
        // Registro de acciones
        // ---------------------------------------------------------------------------------

        private static RegistroAcciones RegistroDePrueba()
        {
            return new RegistroAcciones(new DescripcionAccion[]
            {
                new DescripcionAccion("esperar", "nada", true),
                new DescripcionAccion("atacar", "ataca", true,
                    ParametroAccion.Cadena("objetivo", 1, 8),
                    ParametroAccion.Entero("fuerza", 1, 3),
                    ParametroAccion.Numero("factor", 0.5, 2.5),
                    ParametroAccion.Booleano("fuerte"),
                    ParametroAccion.CadenaEnum("modo", "a", "b")),
            });
        }

        private static Dictionary<string, object> Params(params object[] pares) { return Json.Objeto(pares); }

        private static void PruebasRegistro()
        {
            Prueba("registro: solo se anuncian acciones verificadas", delegate()
            {
                Lanza<ArgumentException>(delegate() { new RegistroAcciones(new DescripcionAccion[] { new DescripcionAccion("x", "d", false) }); }, "no verificada");
                Lanza<ArgumentException>(delegate() { new RegistroAcciones(new DescripcionAccion[] { new DescripcionAccion("X1", "d", true) }); }, "nombre invalido");
                Lanza<ArgumentException>(delegate() { new RegistroAcciones(new DescripcionAccion[] { new DescripcionAccion("a", "d", true), new DescripcionAccion("a", "d", true) }); }, "repetida");
                Lanza<ArgumentException>(delegate() { ParametroAccion.Entero("n", 5, 1); }, "rango invertido");
                Lanza<ArgumentException>(delegate() { ParametroAccion.Cadena("c", 0, 500); }, "cadena demasiado larga");
                Lanza<ArgumentException>(delegate() { ParametroAccion.CadenaEnum("c"); }, "enum vacio");
            });
            Prueba("registro: validacion de parametros", delegate()
            {
                RegistroAcciones r = RegistroDePrueba();
                object[] bueno = new object[] { "objetivo", "ab", "fuerza", 2L, "factor", 1L, "fuerte", true, "modo", "a" };
                ResultadoValidacion v = r.Validar("atacar", Params(bueno));
                Verdad(v.Valido, "valida: " + v.Mensaje);
                Verdad(r.Validar("esperar", Params()).Valido, "sin parametros");
                Verdad(r.Validar("esperar", null).Valido, "parametros nulos");

                Igual("accion_desconocida", r.Validar("volar", Params()).Codigo, "desconocida");
                Igual("accion_desconocida", r.Validar(null, Params()).Codigo, "nula");
                Verdad(!r.Validar("esperar", Params("x", 1L)).Valido, "parametro extra");

                Func<string, object, bool> con = delegate(string k, object val)
                {
                    Dictionary<string, object> p = Params(bueno);
                    p[k] = val;
                    return r.Validar("atacar", p).Valido;
                };
                Verdad(!con("fuerza", 4L), "fuera de rango");
                Verdad(!con("fuerza", 0L), "bajo rango");
                Verdad(!con("fuerza", 2.0), "entero con decimal");
                Verdad(!con("fuerza", "2"), "entero como texto");
                Verdad(!con("factor", 3L), "numero fuera de rango");
                Verdad(con("factor", 2.5), "numero en el borde");
                Verdad(!con("fuerte", "true"), "booleano como texto");
                Verdad(!con("modo", "c"), "fuera de la lista");
                Verdad(!con("objetivo", ""), "cadena vacia");
                Verdad(!con("objetivo", "123456789"), "cadena larga");
                Verdad(!con("objetivo", "a\u0001"), "caracter de control");
                Verdad(!con("objetivo", null), "nulo");
                Dictionary<string, object> faltante = Params(bueno);
                faltante.Remove("modo");
                Verdad(!r.Validar("atacar", faltante).Valido, "falta un parametro");
            });
        }

        // ---------------------------------------------------------------------------------
        // Cache de idempotencia
        // ---------------------------------------------------------------------------------

        private static void PruebasCache()
        {
            Prueba("cache: tope FIFO y reemplazo", delegate()
            {
                CacheIdempotencia c = new CacheIdempotencia(3);
                for (int i = 0; i < 5; i++)
                {
                    RespuestaGuardada g = new RespuestaGuardada();
                    g.Cuerpo = "r" + i;
                    c.Guardar("k" + i, g);
                }
                Igual(3, c.Cuenta, "tamano acotado");
                Verdad(c.Obtener("k0") == null && c.Obtener("k1") == null, "salen los mas viejos");
                Igual("r4", c.Obtener("k4").Cuerpo, "queda el ultimo");
                RespuestaGuardada n = new RespuestaGuardada();
                n.Cuerpo = "nuevo";
                c.Guardar("k4", n);
                Igual(3, c.Cuenta, "reemplazar no crece");
                Igual("nuevo", c.Obtener("k4").Cuerpo, "reemplazado");
            });
        }

        // ---------------------------------------------------------------------------------
        // Cola del hilo principal
        // ---------------------------------------------------------------------------------

        private static void PruebasCola()
        {
            Prueba("cola: el trabajo corre en el hilo que bombea, no en el que espera", delegate()
            {
                ColaPrincipal cola = new ColaPrincipal(8, 16, 3000);
                int hiloBombeo = Thread.CurrentThread.ManagedThreadId;
                int hiloTarea = -1, hiloEspera = -1;
                bool termino = false;
                object resultado = null;
                Thread red = new Thread(delegate()
                {
                    hiloEspera = Thread.CurrentThread.ManagedThreadId;
                    TareaPrincipal t = cola.Encolar(delegate() { hiloTarea = Thread.CurrentThread.ManagedThreadId; return 42; }, null);
                    termino = cola.Esperar(t, 3000);
                    resultado = t.Resultado;
                });
                red.Start();
                while (red.IsAlive) { cola.Bombear(); Thread.Sleep(1); }
                Verdad(termino, "termino");
                Igual(42, resultado, "resultado");
                Igual(hiloBombeo, hiloTarea, "hilo de la tarea = hilo que bombea");
                Verdad(hiloEspera != hiloTarea, "el hilo de red no ejecuta la tarea");
                Verdad(cola.EsHiloPrincipal, "EsHiloPrincipal");
            });
            Prueba("cola: una tarea vencida sin empezar se cancela y nunca corre", delegate()
            {
                ColaPrincipal cola = new ColaPrincipal(8, 16, 3000);
                int corrio = 0, finalizadores = 0;
                bool cancelada = false;
                TareaPrincipal t = cola.Encolar(delegate() { corrio++; return null; }, delegate(TareaPrincipal x) { finalizadores++; cancelada = x.Cancelada; });
                Verdad(!cola.Esperar(t, 50), "vence el plazo");
                Verdad(t.Cancelada, "cancelada");
                cola.Bombear();
                Igual(0, corrio, "no se ejecuto");
                Igual(1, finalizadores, "finalizador una vez");
                Verdad(cancelada, "el finalizador ve la cancelacion");
                Igual(0, cola.Pendientes, "cola vacia");
            });
            Prueba("cola: una excepcion de la tarea llega como Error", delegate()
            {
                ColaPrincipal cola = new ColaPrincipal(8, 16, 3000);
                TareaPrincipal t = cola.Encolar(delegate() { throw new InvalidOperationException("boom"); }, null);
                cola.Bombear();
                Verdad(t.Esperar(100), "termino");
                Verdad(t.Error is InvalidOperationException, "error propagado");
            });
            Prueba("cola: tarea asincrona que termina en un cuadro posterior", delegate()
            {
                ColaPrincipal cola = new ColaPrincipal(8, 16, 3000);
                TareaPrincipal pendiente = null;
                int finalizadores = 0;
                TareaPrincipal t = cola.Encolar(delegate(TareaPrincipal x) { pendiente = x; }, delegate(TareaPrincipal x) { finalizadores++; });
                cola.Bombear();
                Verdad(pendiente != null && t.EnCurso, "empezo y sigue en curso");
                Verdad(!cola.Esperar(t, 30), "plazo vencido con la tarea en curso");
                Verdad(!t.Cancelada && t.AbandonadaDesdeMs >= 0, "abandonada, no cancelada");
                Igual(0, finalizadores, "aun no finaliza");
                pendiente.Completar("tarde");
                pendiente.Completar("otra vez");
                Igual(1, finalizadores, "finaliza una sola vez aunque ya nadie espera");
                Igual("tarde", t.Resultado, "gana la primera");
            });
            Prueba("cola: presupuesto de tiempo por cuadro", delegate()
            {
                ColaPrincipal cola = new ColaPrincipal(1, 16, 3000);
                for (int i = 0; i < 4; i++) cola.Encolar(delegate() { Thread.Sleep(15); return null; }, null);
                int n = cola.Bombear();
                Verdad(n >= 1 && n < 4, "ejecuto " + n + " de 4 y dejo el resto para el cuadro siguiente");
                Igual(4 - n, cola.Pendientes, "pendientes");
                while (cola.Pendientes > 0) cola.Bombear();
            });
            Prueba("cola: tope de pendientes y Detener", delegate()
            {
                ColaPrincipal cola = new ColaPrincipal(8, 2, 3000);
                TareaPrincipal a = cola.Encolar(delegate() { return null; }, null);
                cola.Encolar(delegate() { return null; }, null);
                Lanza<ErrorPuente>(delegate() { cola.Encolar(delegate() { return null; }, null); }, "cola llena");
                cola.Detener();
                Verdad(a.Cancelada, "pendiente cancelada al detener");
                Lanza<ErrorPuente>(delegate() { cola.Encolar(delegate() { return null; }, null); }, "no admite tras detener");
            });
            Prueba("cola: Viva depende de que se bombee", delegate()
            {
                ColaPrincipal cola = new ColaPrincipal(8, 16, 100);
                Verdad(!cola.Viva, "no viva antes del primer bombeo");
                cola.Bombear();
                Verdad(cola.Viva, "viva tras bombear");
                Thread.Sleep(150);
                Verdad(!cola.Viva, "deja de estar viva si no se bombea");
            });
        }

        // ---------------------------------------------------------------------------------
        // Analizador HTTP
        // ---------------------------------------------------------------------------------

        private static SolicitudHttp Cab(string texto)
        {
            byte[] b = Encoding.ASCII.GetBytes(texto);
            return AnalizadorHttp.Analizar(b, b.Length);
        }

        private static void PruebasHttp()
        {
            Prueba("http: cabecera valida, consulta y minusculas", delegate()
            {
                SolicitudHttp s = Cab("GET /v1/observacion?faccion=a%20b&x=1+2 HTTP/1.1\r\nHost: 127.0.0.1:1\r\nX-Puente-Token:  abc \r\nContent-Length: 12");
                Igual("GET", s.Metodo, "metodo");
                Igual("/v1/observacion", s.Ruta, "ruta");
                Igual("a b", s.Consulta["faccion"], "porcentaje");
                Igual("1 2", s.Consulta["x"], "mas = espacio");
                Igual("abc", s.Cabeceras["x-puente-token"], "valor recortado");
                Igual(12L, s.ContentLength, "content-length");
            });
            Prueba("http: UTF-8 en la consulta", delegate()
            {
                Igual("\u00e9", Cab("GET /a?f=%C3%A9 HTTP/1.1").Consulta["f"], "e con acento");
                Lanza<ErrorPuente>(delegate() { Cab("GET /a?f=%C3 HTTP/1.1"); }, "UTF-8 truncado");
            });

            string[] malas = new string[]
            {
                "GET /a HTTP/2.0", "GET /a", "GET  /a HTTP/1.1", "get /a HTTP/1.1", "GET a HTTP/1.1", "GET /a#x HTTP/1.1", "GET /a b HTTP/1.1",
                "GET /a HTTP/1.1\r\n folded: x", "GET /a HTTP/1.1\r\nSinDosPuntos", "GET /a HTTP/1.1\r\n: vacio", "GET /a HTTP/1.1\r\nMal Nombre: x",
                "GET /a HTTP/1.1\r\nContent-Length: 1\r\nContent-Length: 1", "GET /a HTTP/1.1\r\nContent-Length: -1", "GET /a HTTP/1.1\r\nContent-Length: 1x",
                "GET /a HTTP/1.1\r\nContent-Length: 99999999999", "GET /a HTTP/1.1\r\nTransfer-Encoding: chunked",
                "GET /a HTTP/1.1\r\nHost: a\r\nHost: b", "GET /a HTTP/1.1\r\nX-Puente-Token: a\r\nx-puente-token: b",
                "GET /a?x=1&x=2 HTTP/1.1", "GET /a?x=%zz HTTP/1.1", "GET /a?x=% HTTP/1.1", "GET /a?=1 HTTP/1.1", "GET /a HTTP/1.1\nHost: x",
            };
            foreach (string m in malas)
            {
                string mala = m;
                Prueba("http: rechaza " + Texto.Limpiar(mala.Replace("\r", "\\r").Replace("\n", "\\n"), 50), delegate() { Lanza<ErrorPuente>(delegate() { Cab(mala); }, "cabecera mala"); });
            }
            Prueba("http: rechaza bytes no ASCII, NUL y exceso de cabeceras", delegate()
            {
                byte[] raro = new byte[] { (byte)'G', (byte)'E', (byte)'T', (byte)' ', (byte)'/', 0xC3, 0xA9, (byte)' ', (byte)'H', (byte)'T', (byte)'T', (byte)'P', (byte)'/', (byte)'1', (byte)'.', (byte)'1' };
                Lanza<ErrorPuente>(delegate() { AnalizadorHttp.Analizar(raro, raro.Length); }, "no ASCII");
                byte[] nul = Encoding.ASCII.GetBytes("GET /a HTTP/1.1\r\nX: a\0b");
                Lanza<ErrorPuente>(delegate() { AnalizadorHttp.Analizar(nul, nul.Length); }, "NUL");
                StringBuilder sb = new StringBuilder("GET /a HTTP/1.1");
                for (int i = 0; i < 70; i++) sb.Append("\r\nH").Append(i).Append(": v");
                Lanza<ErrorPuente>(delegate() { Cab(sb.ToString()); }, "70 cabeceras");
                Lanza<ErrorPuente>(delegate() { Cab("GET /" + new string('a', 3000) + " HTTP/1.1"); }, "objetivo de 3000");
            });
            Prueba("http: BuscarFinCabecera", delegate()
            {
                byte[] b = Encoding.ASCII.GetBytes("GET / HTTP/1.1\r\nA: b\r\n\r\ncuerpo");
                Igual(20, AnalizadorHttp.BuscarFinCabecera(b, 0, b.Length), "posicion");
                Igual(-1, AnalizadorHttp.BuscarFinCabecera(b, 0, 23), "incompleta");
                Igual(20, AnalizadorHttp.BuscarFinCabecera(b, 18, b.Length), "desde mitad");
            });
        }

        // ---------------------------------------------------------------------------------
        // Servidor con mundos defectuosos
        // ---------------------------------------------------------------------------------

        private sealed class MundoFalso : IMundo, IPresentacion
        {
            public bool PresentacionActiva;
            public string UltimaCamara = "";
            public bool UltimaInterfaz;
            public bool CamaraVerificada { get { return PresentacionActiva; } }
            public bool InterfazVerificada { get { return PresentacionActiva; } }
            public IDictionary<string, object> Camara(string faccion, double? zoom, bool liberar, string modo)
            {
                UltimaCamara = faccion + "|" + (zoom.HasValue ? zoom.Value.ToString(CultureInfo.InvariantCulture) : "-") + "|" + liberar + "|" + modo;
                return Json.Objeto("liberada", liberar, "zoom", zoom.HasValue ? zoom.Value : 100.0);
            }
            public IDictionary<string, object> Interfaz(bool visible) { UltimaInterfaz = visible; return Json.Objeto("visible", visible); }

            private readonly InfoJuego info = new InfoJuego();
            private readonly CapacidadesMundo cap = new CapacidadesMundo();
            private readonly RegistroAcciones acciones;
            public Func<IDictionary<string, object>> OnObservar;
            public Func<ResultadoAccion> OnEjecutar;
            public Action<double, Action<ResultadoAvance>> OnAvanzar;
            public int Ejecuciones;

            public MundoFalso()
            {
                info.Nombre = "falso";
                info.Version = "0";
                cap.Reiniciar = true; cap.Semilla = true; cap.Avanzar = true; cap.Terminal = true; cap.MultiFaccion = true;
                cap.MaxSegundosAvance = 10;
                acciones = new RegistroAcciones(new DescripcionAccion[] { new DescripcionAccion("probar", "prueba", true).ConCosto(2, 3), new DescripcionAccion("sin_costo", "sin costo anunciado", true) });
            }

            public InfoJuego Info { get { return info; } }
            public CapacidadesMundo Capacidades { get { return cap; } }
            public RegistroAcciones Acciones { get { return acciones; } }
            public IDictionary<string, object> Reiniciar(SolicitudReinicio s) { return Json.Objeto("escenario_id", "e", "hash_mundo", "h", "facciones", new List<object>()); }
            public IDictionary<string, object> Observar(string faccion) { return OnObservar(); }
            public ResultadoAccion Ejecutar(string faccion, string accion, IDictionary<string, object> p) { Ejecuciones++; return OnEjecutar(); }
            public void Avanzar(double segundos, Action<ResultadoAvance> fin) { OnAvanzar(segundos, fin); }
            public IDictionary<string, object> EstadoTerminal() { return Json.Objeto("terminal", false, "razon", "ninguna", "resumen_por_faccion", new List<object>()); }
            public void Cerrar() { }
        }

        private sealed class Resp
        {
            public int Estado;
            public string Cuerpo;
            public string Cabecera;
        }

        private static Resp Http(int puerto, string token, string metodo, string ruta, string cuerpo)
        {
            using (TcpClient c = new TcpClient())
            {
                c.Connect(IPAddress.Loopback, puerto);
                c.ReceiveTimeout = 8000;
                NetworkStream ns = c.GetStream();
                StringBuilder sb = new StringBuilder();
                sb.Append(metodo).Append(' ').Append(ruta).Append(" HTTP/1.1\r\nHost: 127.0.0.1:").Append(puerto).Append("\r\n");
                if (token != null) sb.Append("X-Puente-Token: ").Append(token).Append("\r\n");
                if (cuerpo != null) sb.Append("Content-Type: application/json\r\nContent-Length: ").Append(Encoding.UTF8.GetByteCount(cuerpo)).Append("\r\n");
                sb.Append("\r\n");
                if (cuerpo != null) sb.Append(cuerpo);
                byte[] req = Encoding.UTF8.GetBytes(sb.ToString());
                ns.Write(req, 0, req.Length);
                return Leer(ns);
            }
        }

        private static Resp Leer(NetworkStream ns)
        {
            MemoryStream ms = new MemoryStream();
            byte[] b = new byte[4096];
            int n;
            while ((n = ns.Read(b, 0, b.Length)) > 0) ms.Write(b, 0, n);
            string todo = Encoding.UTF8.GetString(ms.ToArray());
            int fin = todo.IndexOf("\r\n\r\n", StringComparison.Ordinal);
            Resp r = new Resp();
            if (fin < 0) { r.Estado = -1; r.Cuerpo = todo; return r; }
            r.Cabecera = todo.Substring(0, fin);
            r.Cuerpo = todo.Substring(fin + 4);
            r.Estado = int.Parse(r.Cabecera.Substring(9, 3), CultureInfo.InvariantCulture);
            return r;
        }

        /// <summary>Corre f en otro hilo mientras ESTE hilo hace de "hilo principal" bombeando la cola.</summary>
        private static T Bombeando<T>(ServidorPuente s, Func<T> f)
        {
            T resultado = default(T);
            Exception error = null;
            Thread t = new Thread(delegate()
            {
                try { resultado = f(); }
                catch (Exception e) { error = e; }
            });
            t.Start();
            while (t.IsAlive) { s.Bombear(); Thread.Sleep(1); }
            t.Join();
            if (error != null) throw new Exception("el cliente fallo: " + error.Message);
            return resultado;
        }

        private static string Cuerpo(string ruta, string extra)
        {
            return "{\"protocolo\":1,\"id_solicitud\":\"" + Guid.NewGuid().ToString("N") + "\"" + (extra.Length > 0 ? "," + extra : "") + "}";
        }

        private static string CarpetaTemporal()
        {
            string d = Path.Combine(Path.GetTempPath(), "puente-autoprueba-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(d);
            return d;
        }

        private static ServidorPuente Levantar(MundoFalso mundo, Action<ConfiguracionPuente> ajustar, out string carpeta)
        {
            carpeta = CarpetaTemporal();
            ConfiguracionPuente cfg = new ConfiguracionPuente();
            cfg.Puerto = 0;
            cfg.CarpetaToken = carpeta;
            cfg.TiempoOperacionMs = 800;
            cfg.TiempoAvanceMs = 400;
            cfg.GraciaAbandonoMs = 300;
            cfg.TiempoLecturaMs = 600;
            if (ajustar != null) ajustar(cfg);
            ServidorPuente s = new ServidorPuente(cfg);
            s.Mundo = mundo;
            s.Iniciar();
            s.Bombear();
            return s;
        }

        private static void PruebasServidor()
        {
            Prueba("servidor: el token vive en un archivo de 64 hex y desaparece al detener", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                ServidorPuente s = Levantar(m, null, out carpeta);
                string ruta = s.RutaArchivoToken;
                try
                {
                    string token = File.ReadAllText(ruta);
                    Igual(64, token.Length, "largo del token");
                    Igual(Path.Combine(carpeta, "puente-token.txt"), ruta, "ruta");
                    Verdad(s.Puerto > 0, "puerto efimero asignado");
                    Igual("127.0.0.1:" + s.Puerto, s.Escucha, "el socket de escucha esta ligado solo a 127.0.0.1");
                }
                finally { s.Detener(); }
                Verdad(!File.Exists(ruta), "token borrado al detener");
                Directory.Delete(carpeta, true);
            });

            Prueba("servidor: errores del mundo no se filtran y se traducen", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                ServidorPuente s = Levantar(m, null, out carpeta);
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    string accion = "\"faccion\":\"a\",\"accion\":\"probar\",\"parametros\":{}";

                    m.OnEjecutar = delegate() { throw new Exception("secreto-C:\\ruta\\interna"); };
                    Resp r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", Cuerpo("", accion)); });
                    Igual(500, r.Estado, "error_interno -> 500");
                    Verdad(r.Cuerpo.Contains("\"codigo\":\"error_interno\""), "codigo error_interno");
                    Verdad(!r.Cuerpo.Contains("secreto"), "el mensaje de la excepcion no llega al cliente");

                    m.OnEjecutar = delegate() { throw new NotSupportedException("x"); };
                    r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", Cuerpo("", accion)); });
                    Igual(501, r.Estado, "no_soportado -> 501");
                    Verdad(r.Cuerpo.Contains("no_soportado"), "codigo no_soportado");

                    m.OnEjecutar = delegate() { throw new ErrorPuente(Codigos.SolicitudInvalida, "faccion rara"); };
                    r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", Cuerpo("", accion)); });
                    Igual(400, r.Estado, "ErrorPuente tipado");
                    Verdad(r.Cuerpo.Contains("faccion rara"), "mensaje tipado");

                    m.OnEjecutar = delegate() { return ResultadoAccion.De("explotar", "ok", "", null); };
                    r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", Cuerpo("", accion)); });
                    Igual(500, r.Estado, "resultado fuera de contrato");

                    m.OnEjecutar = delegate() { return ResultadoAccion.De("ejecutada", "Codigo Con Espacios", "", null); };
                    r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", Cuerpo("", accion)); });
                    Igual(500, r.Estado, "codigo fuera de contrato");

                    m.OnObservar = delegate() { return Json.Objeto("tiempo_juego_s", 0); };
                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/observacion?faccion=a", null); });
                    Igual(500, r.Estado, "observacion sin campos del contrato");
                    Verdad(r.Cuerpo.Contains("Contrato roto"), "mensaje de contrato");

                    m.OnObservar = delegate() { return Json.Objeto("tiempo_juego_s", 0, "turno_juego", 0, "faccion", new object(), "rivales", 1, "mundo", 2); };
                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/observacion?faccion=a", null); });
                    Igual(500, r.Estado, "datos no serializables");

                    m.OnObservar = delegate() { return null; };
                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/observacion?faccion=a", null); });
                    Igual(500, r.Estado, "mundo devuelve null");

                    // Tras tanto fallo el puente sigue sano y libre.
                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/info", null); });
                    Igual(200, r.Estado, "info tras los fallos");
                    Verdad(r.Cuerpo.Contains("\"estado\":\"listo\""), "estado listo");
                }
                finally { s.Detener(); Directory.Delete(carpeta, true); }
            });

            Prueba("servidor: un avance que no termina vence, ocupa el juego y el vigilante lo libera", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                Action<ResultadoAvance> guardada = null;
                m.OnAvanzar = delegate(double seg, Action<ResultadoAvance> fin) { guardada = fin; };
                ServidorPuente s = Levantar(m, null, out carpeta);
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    string cuerpo = Cuerpo("", "\"segundos_juego\":1");
                    Resp r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/avanzar", cuerpo); });
                    Igual(504, r.Estado, "tiempo_agotado");
                    Verdad(r.Cuerpo.Contains("tiempo_agotado"), "codigo");

                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/observacion?faccion=a", null); });
                    Igual(409, r.Estado, "juego_ocupado mientras sigue abandonado dentro de la gracia");
                    Verdad(r.Cuerpo.Contains("juego_ocupado"), "codigo juego_ocupado");

                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/info", null); });
                    Verdad(r.Cuerpo.Contains("\"estado\":\"ejecutando\""), "info dice ejecutando");

                    Thread.Sleep(350); // pasa la gracia de 300 ms
                    m.OnObservar = delegate() { return Json.Objeto("tiempo_juego_s", 0, "turno_juego", 0, "faccion", Json.Objeto(), "rivales", new List<object>(), "mundo", Json.Objeto()); };
                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/observacion?faccion=a", null); });
                    Igual(200, r.Estado, "el vigilante libero el juego");

                    // Terminar tarde el avance abandonado no rompe nada.
                    guardada(new ResultadoAvance());
                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/info", null); });
                    Verdad(r.Cuerpo.Contains("\"estado\":\"listo\""), "listo otra vez");
                }
                finally { s.Detener(); Directory.Delete(carpeta, true); }
            });

            Prueba("servidor: sin bombeo la solicitud se cancela y no se ejecuta despues", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                m.OnEjecutar = delegate() { return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "", null); };
                ServidorPuente s = Levantar(m, delegate(ConfiguracionPuente c) { c.ToleranciaBombeoMs = 60000; c.TiempoOperacionMs = 300; }, out carpeta);
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    Resp r = Http(p, tk, "POST", "/v1/accion", Cuerpo("", "\"faccion\":\"a\",\"accion\":\"probar\",\"parametros\":{}")); // nadie bombea
                    Igual(504, r.Estado, "tiempo_agotado");
                    Verdad(r.Cuerpo.Contains("no se ejecuto"), "se avisa de que no se ejecuto");
                    for (int i = 0; i < 5; i++) { s.Bombear(); Thread.Sleep(5); }
                    Igual(0, m.Ejecuciones, "la accion cancelada nunca se ejecuto");
                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/info", null); });
                    Verdad(r.Cuerpo.Contains("\"estado\":\"listo\""), "el cerrojo se libero");
                }
                finally { s.Detener(); Directory.Delete(carpeta, true); }
            });

            Prueba("servidor: la repeticion con el mismo id devuelve lo guardado, aun tras un vencimiento", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                int veces = 0;
                m.OnEjecutar = delegate() { veces++; Thread.Sleep(500); return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "hecho", null); };
                ServidorPuente s = Levantar(m, delegate(ConfiguracionPuente c) { c.TiempoOperacionMs = 150; }, out carpeta);
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    string cuerpo = Cuerpo("", "\"faccion\":\"a\",\"accion\":\"probar\",\"parametros\":{}");
                    Resp r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", cuerpo); });
                    Igual(504, r.Estado, "vence mientras la accion duerme");
                    Thread.Sleep(10);
                    r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", cuerpo); });
                    Igual(200, r.Estado, "la repeticion recibe el resultado real");
                    Verdad(r.Cabecera.Contains("X-Puente-Idempotente: repetida"), "marcada como repetida");
                    Verdad(r.Cuerpo.Contains("hecho"), "mismo contenido");
                    Igual(1, veces, "la accion se ejecuto una sola vez");

                    string otro = cuerpo.Replace("\"parametros\":{}", "\"parametros\":{\"x\":1}");
                    r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", otro); });
                    Igual(400, r.Estado, "mismo id con otro cuerpo");
                    Igual(1, veces, "no se ejecuto de nuevo");
                }
                finally { s.Detener(); Directory.Delete(carpeta, true); }
            });

            Prueba("servidor: conexiones colgadas vencen y el tope de conexiones se respeta", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                ServidorPuente s = Levantar(m, delegate(ConfiguracionPuente c) { c.MaxConexiones = 3; c.TiempoLecturaMs = 500; }, out carpeta);
                List<TcpClient> colgados = new List<TcpClient>();
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    for (int i = 0; i < 3; i++)
                    {
                        TcpClient c = new TcpClient();
                        c.Connect(IPAddress.Loopback, p);
                        byte[] parcial = Encoding.ASCII.GetBytes("GET /v1/info HTTP/1.1\r\nHost: 127.0"); // cabecera a medias
                        c.GetStream().Write(parcial, 0, parcial.Length);
                        colgados.Add(c);
                    }
                    Thread.Sleep(100);
                    // Con los 3 cupos ocupados, una cuarta conexion se cierra sin respuesta.
                    Resp r = null;
                    try { r = Http(p, tk, "GET", "/v1/info", null); } catch (Exception) { }
                    Verdad(r == null || r.Estado == -1 || r.Estado == 0, "cuarta conexion rechazada");
                    // Los colgados reciben 408 al vencer el plazo y liberan sus cupos.
                    colgados[0].ReceiveTimeout = 3000;
                    Resp r408 = Leer(colgados[0].GetStream());
                    Igual(408, r408.Estado, "408 por cabecera incompleta");
                    Thread.Sleep(600);
                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/info", null); });
                    Igual(200, r.Estado, "vuelve a atender tras liberar los cupos");
                }
                finally
                {
                    foreach (TcpClient c in colgados) { try { c.Close(); } catch (Exception) { } }
                    s.Detener();
                    Directory.Delete(carpeta, true);
                }
            });

            Prueba("servidor: Detener cierra conexiones abiertas y libera el puerto", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                ServidorPuente s = Levantar(m, delegate(ConfiguracionPuente c) { c.TiempoLecturaMs = 20000; }, out carpeta);
                int p = s.Puerto;
                TcpClient c1 = new TcpClient();
                c1.Connect(IPAddress.Loopback, p);
                Thread.Sleep(50);
                s.Detener();
                c1.ReceiveTimeout = 3000;
                int leido;
                try { leido = c1.GetStream().Read(new byte[10], 0, 10); } catch (IOException) { leido = 0; }
                Igual(0, leido, "el servidor cerro la conexion colgada");
                c1.Close();
                bool abierto = false;
                for (int intento = 0; intento < 10 && !abierto; intento++)
                {
                    TcpListener libre = new TcpListener(IPAddress.Loopback, p);
                    try { libre.Start(); libre.Stop(); abierto = true; }
                    catch (SocketException) { Thread.Sleep(100); }
                }
                Verdad(abierto, "el puerto queda libre tras Detener");
                Directory.Delete(carpeta, true);
            });
        }

        // ---------------------------------------------------------------------------------
        // X2: reglas de accion compartidas (objetivos, creacion todo o nada) y costos anunciados
        // ---------------------------------------------------------------------------------

        private static void PruebasReglasAccion()
        {
            Prueba("reglas: un objetivo inexistente, vacio u hostil es objetivo_invalido; el propio, objetivo_propio; uno valido pasa", delegate()
            {
                string[] ids = new string[] { "a", "b", "c" };
                Verdad(ReglasAccion.ValidarObjetivo("a", "b", ids) == null, "objetivo valido");
                Verdad(ReglasAccion.ValidarObjetivo("a", "c", ids) == null, "otro objetivo valido");
                foreach (string malo in new string[] { "fantasma", "", null, "B", "a b", "b\u0001", new string(Convert.ToChar(120), 500), "../../x" })
                {
                    ResultadoAccion r = ReglasAccion.ValidarObjetivo("a", malo, ids);
                    Verdad(r != null, "rechaza " + (malo == null ? "null" : malo.Length.ToString()));
                    Igual(ResultadoAccion.Rechazada, r.Resultado, "es una rechazada, no una excepcion");
                    Igual("objetivo_invalido", r.Codigo, "codigo");
                    Verdad(r.Mensaje.Length < 200 && r.Mensaje.IndexOf((char)1) < 0, "el mensaje no repite texto hostil entero");
                }
                ResultadoAccion propio = ReglasAccion.ValidarObjetivo("a", "a", ids);
                Igual("objetivo_propio", propio.Codigo, "el propio actor");
                Igual(ResultadoAccion.Rechazada, propio.Resultado, "rechazada");
            });

            Prueba("reglas: crear unidades es todo o nada (sin espacio y tope se deciden antes de tocar nada)", delegate()
            {
                Verdad(ReglasAccion.ValidarCreacion(5, 5, 0, 10) == null, "caben justo");
                ResultadoAccion r = ReglasAccion.ValidarCreacion(5, 1, 0, 10);
                Igual("sin_espacio", r.Codigo, "una casilla para cinco");
                Igual(ResultadoAccion.Rechazada, r.Resultado, "rechazada");
                Verdad(r.Efecto == null, "un rechazo no trae efecto");
                Igual("sin_espacio", ReglasAccion.ValidarCreacion(1, 0, 0, 10).Codigo, "cero casillas");
                Igual("tope_unidades", ReglasAccion.ValidarCreacion(5, 99, 6, 10).Codigo, "6 + 5 supera el tope de 10");
                Verdad(ReglasAccion.ValidarCreacion(4, 99, 6, 10) == null, "6 + 4 llega justo al tope");
                Igual("tope_unidades", ReglasAccion.ValidarCreacion(5, 0, 6, 10).Codigo, "con tope y sin espacio manda el tope");
            });

            Prueba("contrato: ConCosto valida 0..100 y 0..1000; sin costo no se anuncia nada", delegate()
            {
                DescripcionAccion a = new DescripcionAccion("x", "y", true);
                Verdad(!a.Puntos.HasValue && !a.Cooldown.HasValue, "por defecto no hay costo");
                a.ConCosto(3, 5);
                Igual(3, a.Puntos.Value, "puntos"); Igual(5, a.Cooldown.Value, "cooldown");
                a.ConCosto(0, 0); a.ConCosto(100, 1000);
                Lanza<ArgumentException>(delegate() { a.ConCosto(-1, 0); }, "puntos negativos");
                Lanza<ArgumentException>(delegate() { a.ConCosto(101, 0); }, "puntos > 100");
                Lanza<ArgumentException>(delegate() { a.ConCosto(1, -1); }, "cooldown negativo");
                Lanza<ArgumentException>(delegate() { a.ConCosto(1, 1001); }, "cooldown > 1000");
            });
        }

        private static void PruebasServidorX2()
        {
            Prueba("servidor: /v1/info anuncia puntos y cooldown solo en las acciones que los declaran", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                ServidorPuente s = Levantar(m, null, out carpeta);
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    Resp r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/info", null); });
                    Igual(200, r.Estado, "info");
                    Dictionary<string, object> j = (Dictionary<string, object>)L(r.Cuerpo.Trim());
                    List<object> acc = (List<object>)j["acciones"];
                    Dictionary<string, object> con = (Dictionary<string, object>)acc[0];
                    Dictionary<string, object> sin = (Dictionary<string, object>)acc[1];
                    Igual("probar", con["nombre"], "primera accion");
                    Igual(2L, con["puntos"], "puntos anunciados");
                    Igual(3L, con["cooldown"], "cooldown anunciado");
                    Igual("sin_costo", sin["nombre"], "segunda accion");
                    Verdad(!sin.ContainsKey("puntos") && !sin.ContainsKey("cooldown"), "sin costo declarado no se inventa ninguno");
                }
                finally { s.Detener(); Directory.Delete(carpeta, true); }
            });

            Prueba("servidor: un nombre de accion vacio, enorme o con controles es accion_desconocida (200), no un 400", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                m.OnEjecutar = delegate() { return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "", null); };
                ServidorPuente s = Levantar(m, null, out carpeta);
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    string[] nombres = new string[] { "", new string(Convert.ToChar(97), 81), new string(Convert.ToChar(97), 5000), "probar\\u0001", "probar\\n", "pro\\u007f" };
                    foreach (string nombre in nombres)
                    {
                        string cuerpo = Cuerpo("", "\"faccion\":\"a\",\"accion\":\"" + nombre + "\",\"parametros\":{}");
                        Resp r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", cuerpo); });
                        Igual(200, r.Estado, "estado para nombre de largo " + nombre.Length);
                        Verdad(r.Cuerpo.Contains("\"resultado\":\"rechazada\"") && r.Cuerpo.Contains("\"codigo\":\"accion_desconocida\""), "rechazada/accion_desconocida: " + r.Cuerpo);
                    }
                    Igual(0, m.Ejecuciones, "el mundo nunca se toco");
                    // Lo que sigue siendo una solicitud ROTA: la accion no es texto o falta.
                    Resp roto = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", Cuerpo("", "\"faccion\":\"a\",\"accion\":5,\"parametros\":{}")); });
                    Igual(400, roto.Estado, "accion que no es texto");
                    roto = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", Cuerpo("", "\"faccion\":\"a\",\"parametros\":{}")); });
                    Igual(400, roto.Estado, "falta accion");
                }
                finally { s.Detener(); Directory.Delete(carpeta, true); }
            });

            Prueba("servidor: semilla entera de 0 a 2147483647; negativa, mayor o no entera es 400", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                ServidorPuente s = Levantar(m, null, out carpeta);
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    string[] buenas = new string[] { "0", "1", "2147483647" };
                    foreach (string sem in buenas)
                    {
                        string c = Cuerpo("", "\"semilla\":" + sem + ",\"facciones\":[{\"id\":\"a\"},{\"id\":\"b\"}]");
                        Resp r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/escenario/reiniciar", c); });
                        Igual(200, r.Estado, "semilla " + sem);
                    }
                    string[] malas = new string[] { "-1", "-2147483648", "2147483648", "4294967295", "1.5", "\"7\"", "1e3", "null" };
                    foreach (string sem in malas)
                    {
                        string c = Cuerpo("", "\"semilla\":" + sem + ",\"facciones\":[{\"id\":\"a\"},{\"id\":\"b\"}]");
                        Resp r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/escenario/reiniciar", c); });
                        Igual(400, r.Estado, "semilla " + sem);
                        Verdad(r.Cuerpo.Contains("solicitud_invalida") && r.Cuerpo.Contains("semilla"), "mensaje nombra la semilla: " + r.Cuerpo);
                    }
                    Verdad(Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/escenario/reiniciar", Cuerpo("", "\"semilla\":-1,\"facciones\":[{\"id\":\"a\"},{\"id\":\"b\"}]")); }).Cuerpo.Contains("0..2147483647"), "el mensaje dice el rango");
                }
                finally { s.Detener(); Directory.Delete(carpeta, true); }
            });

            Prueba("presentacion: capacidades.camara/interfaz solo son true si el mundo las verifico; sin ellas 501", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                ServidorPuente s = Levantar(m, null, out carpeta);
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    Resp r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/info", null); });
                    Verdad(r.Cuerpo.Contains("\"camara\":false") && r.Cuerpo.Contains("\"interfaz\":false"), "capacidades en false: " + r.Cuerpo);
                    r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/camara", Cuerpo("", "\"faccion\":\"a\"")); });
                    Igual(501, r.Estado, "camara sin soporte");
                    r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/interfaz", Cuerpo("", "\"visible\":false")); });
                    Igual(501, r.Estado, "interfaz sin soporte");
                    m.PresentacionActiva = true;
                    r = Bombeando(s, delegate() { return Http(p, tk, "GET", "/v1/info", null); });
                    Verdad(r.Cuerpo.Contains("\"camara\":true") && r.Cuerpo.Contains("\"interfaz\":true"), "capacidades en true: " + r.Cuerpo);
                }
                finally { s.Detener(); Directory.Delete(carpeta, true); }
            });

            Prueba("presentacion: /v1/camara y /v1/interfaz validan la solicitud y se ejecutan en el hilo principal", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                m.PresentacionActiva = true;
                ServidorPuente s = Levantar(m, null, out carpeta);
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    string[] malos = new string[] { "", "\"zoom\":40", "\"faccion\":\"a\",\"zoom\":0", "\"faccion\":\"a\",\"zoom\":1001", "\"faccion\":\"a\",\"zoom\":\"x\"", "\"faccion\":\"a b\"", "\"liberar\":\"si\"", "\"faccion\":7", "\"faccion\":\"a\",\"modo\":\"x\"", "\"faccion\":\"a\",\"modo\":3" };
                    foreach (string mal in malos)
                    {
                        Resp r = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/camara", Cuerpo("", mal)); });
                        Igual(400, r.Estado, "camara invalida <" + mal + ">");
                    }
                    Igual("", m.UltimaCamara, "nada invalido llego al mundo");
                    Resp ok = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/camara", Cuerpo("", "\"faccion\":\"a\",\"zoom\":40.5")); });
                    Igual(200, ok.Estado, "camara valida: " + ok.Cuerpo);
                    Igual("a|40.5|False|juego", m.UltimaCamara, "parametros entregados al mundo (modo por defecto: juego)");
                    ok = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/camara", Cuerpo("", "\"faccion\":\"b\",\"modo\":\"limpio\"")); });
                    Igual(200, ok.Estado, "modo limpio");
                    Igual("b|-|False|limpio", m.UltimaCamara, "modo limpio entregado al mundo");
                    ok = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/camara", Cuerpo("", "\"liberar\":true")); });
                    Igual(200, ok.Estado, "liberar");
                    Igual("|-|True|juego", m.UltimaCamara, "liberar sin faccion");
                    Resp malI = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/interfaz", Cuerpo("", "\"visible\":\"no\"")); });
                    Igual(400, malI.Estado, "visible no booleano");
                    malI = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/interfaz", Cuerpo("", "")); });
                    Igual(400, malI.Estado, "falta visible");
                    m.UltimaInterfaz = true;
                    Resp okI = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/interfaz", Cuerpo("", "\"visible\":false")); });
                    Igual(200, okI.Estado, "interfaz");
                    Verdad(okI.Cuerpo.Contains("\"visible\":false") && !m.UltimaInterfaz, "se oculto");
                    Resp sinTk = Http(p, "malo", "POST", "/v1/camara", Cuerpo("", "\"faccion\":\"a\""));
                    Igual(401, sinTk.Estado, "sin token valido");
                }
                finally { s.Detener(); Directory.Delete(carpeta, true); }
            });

            Prueba("servidor: carrera de idempotencia: la segunda solicitud igual, que ya miro la cache vacia, no ejecuta de nuevo", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                int veces = 0;
                m.OnEjecutar = delegate() { Interlocked.Increment(ref veces); return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "hecho", null); };
                ServidorPuente s = Levantar(m, delegate(ConfiguracionPuente c) { c.TiempoOperacionMs = 3000; }, out carpeta);
                ManualResetEvent bEnGancho = new ManualResetEvent(false);
                ManualResetEvent aTermino = new ManualResetEvent(false);
                int llamadas = 0;
                // La PRIMERA solicitud que llegue al gancho (B) se queda esperando justo despues de haber visto la cache vacia
                // y antes de adquirir el turno; mientras tanto la otra (A) entra, ejecuta y guarda su respuesta.
                s.AntesDeAdquirirEjecucion = delegate()
                {
                    if (Interlocked.Increment(ref llamadas) == 1) { bEnGancho.Set(); aTermino.WaitOne(8000); }
                };
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    string cuerpo = Cuerpo("", "\"faccion\":\"a\",\"accion\":\"probar\",\"parametros\":{}");
                    Resp rB = null;
                    Thread tb = new Thread(delegate() { rB = Http(p, tk, "POST", "/v1/accion", cuerpo); });
                    tb.Start();
                    Verdad(bEnGancho.WaitOne(4000), "B llego al gancho con la cache vacia");
                    Resp rA = Bombeando(s, delegate() { return Http(p, tk, "POST", "/v1/accion", cuerpo); });
                    Igual(200, rA.Estado, "A");
                    aTermino.Set();
                    while (tb.IsAlive) { s.Bombear(); Thread.Sleep(1); }
                    tb.Join();
                    Igual(200, rB.Estado, "B");
                    Igual(1, veces, "la accion se ejecuto UNA sola vez");
                    Verdad(rB.Cabecera.Contains("X-Puente-Idempotente: repetida"), "B recibio la respuesta guardada, marcada como repetida");
                    Igual(rA.Cuerpo, rB.Cuerpo, "mismo contenido");
                }
                finally { aTermino.Set(); s.Detener(); Directory.Delete(carpeta, true); }
            });

            Prueba("servidor: seis solicitudes identicas a la vez ejecutan una vez y todas reciben la misma respuesta", delegate()
            {
                string carpeta;
                MundoFalso m = new MundoFalso();
                int veces = 0;
                m.OnEjecutar = delegate() { Interlocked.Increment(ref veces); Thread.Sleep(300); return ResultadoAccion.De(ResultadoAccion.Ejecutada, "ok", "hecho", null); };
                ServidorPuente s = Levantar(m, delegate(ConfiguracionPuente c) { c.TiempoOperacionMs = 3000; }, out carpeta);
                try
                {
                    string tk = File.ReadAllText(s.RutaArchivoToken);
                    int p = s.Puerto;
                    string cuerpo = Cuerpo("", "\"faccion\":\"a\",\"accion\":\"probar\",\"parametros\":{}");
                    Resp[] rs = new Resp[6];
                    Thread[] hilos = new Thread[6];
                    for (int i = 0; i < 6; i++)
                    {
                        int k = i;
                        hilos[i] = new Thread(delegate() { rs[k] = Http(p, tk, "POST", "/v1/accion", cuerpo); });
                        hilos[i].Start();
                    }
                    bool vivos = true;
                    while (vivos)
                    {
                        s.Bombear(); Thread.Sleep(1);
                        vivos = false;
                        foreach (Thread h in hilos) { if (h.IsAlive) vivos = true; }
                    }
                    int repetidas = 0;
                    for (int i = 0; i < 6; i++)
                    {
                        Igual(200, rs[i].Estado, "estado de la solicitud " + i + ": " + rs[i].Cuerpo);
                        Igual(rs[0].Cuerpo, rs[i].Cuerpo, "mismo contenido " + i);
                        if (rs[i].Cabecera.Contains("X-Puente-Idempotente: repetida")) repetidas++;
                    }
                    Igual(1, veces, "una sola ejecucion");
                    Igual(5, repetidas, "las otras cinco son repeticiones");
                }
                finally { s.Detener(); Directory.Delete(carpeta, true); }
            });
        }    }
}
