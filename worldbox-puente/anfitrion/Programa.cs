using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;

namespace PuenteWorldBox.Anfitrion
{
    /// <summary>
    /// Anfitrion.exe: levanta el MISMO servidor del puente con un MundoSimulado y bombea la cola desde su
    /// hilo principal, como lo hara el cargador desde Update(). Sirve para probar el protocolo contra
    /// codigo C# real sin abrir WorldBox.
    ///
    ///   Anfitrion.exe [--puerto=0] [--carpeta=RUTA] [--ms-por-segundo=2] [--verboso] [--vigilar-stdin]
    ///                 [--tiempo-operacion-ms=N] [--tiempo-avance-ms=N] [--tiempo-lectura-ms=N]
    ///                 [--gracia-ms=N] [--tolerancia-ms=N] [--max-conexiones=N]
    ///                 [--retraso-mundo-ms=N] [--retraso-bombeo-ms=N]
    ///   Anfitrion.exe --autoprueba
    ///
    /// Imprime en stdout UNA linea al estar escuchando:  LISTO puerto=N token_archivo=RUTA
    /// (los logs, si se piden con --verboso, van a stderr). Termina con Ctrl+C, al leer "salir" por stdin
    /// o, con --vigilar-stdin, cuando stdin se cierra (el proceso padre murio).
    /// </summary>
    public static class Programa
    {
        private static volatile bool parar;

        public static int Main(string[] args)
        {
            Dictionary<string, string> opc = new Dictionary<string, string>();
            foreach (string a in args)
            {
                if (!a.StartsWith("--", StringComparison.Ordinal)) { Console.Error.WriteLine("Argumento no reconocido: " + a); return 2; }
                int ig = a.IndexOf('=');
                if (ig < 0) opc[a.Substring(2)] = "";
                else opc[a.Substring(2, ig - 2)] = a.Substring(ig + 1);
            }

            if (opc.ContainsKey("autoprueba")) return Autoprueba.Ejecutar();

            try
            {
                return Servir(opc);
            }
            catch (Exception e)
            {
                Console.Error.WriteLine("ERROR " + e.GetType().Name + ": " + e.Message);
                return 2;
            }
        }

        private static int Entero(Dictionary<string, string> opc, string clave, int defecto)
        {
            string v;
            if (!opc.TryGetValue(clave, out v)) return defecto;
            int n;
            if (!int.TryParse(v, NumberStyles.Integer, CultureInfo.InvariantCulture, out n))
                throw new ArgumentException("--" + clave + " debe ser un entero.");
            return n;
        }

        private static int Servir(Dictionary<string, string> opc)
        {
            string carpeta;
            bool carpetaPropia = false;
            if (!opc.TryGetValue("carpeta", out carpeta) || carpeta.Length == 0)
            {
                carpeta = Path.Combine(Path.GetTempPath(), "puente-anfitrion-" + Process.GetCurrentProcess().Id);
                carpetaPropia = true;
            }

            ConfiguracionPuente cfg = new ConfiguracionPuente();
            cfg.Puerto = Entero(opc, "puerto", 0);
            cfg.CarpetaToken = carpeta;
            cfg.NombrePuente = "anfitrion-simulado";
            cfg.TiempoLecturaMs = Entero(opc, "tiempo-lectura-ms", cfg.TiempoLecturaMs);
            cfg.MaxConexiones = Entero(opc, "max-conexiones", cfg.MaxConexiones);
            cfg.TiempoOperacionMs = Entero(opc, "tiempo-operacion-ms", cfg.TiempoOperacionMs);
            cfg.TiempoAvanceMs = Entero(opc, "tiempo-avance-ms", cfg.TiempoAvanceMs);
            cfg.GraciaAbandonoMs = Entero(opc, "gracia-ms", cfg.GraciaAbandonoMs);
            cfg.ToleranciaBombeoMs = Entero(opc, "tolerancia-ms", cfg.ToleranciaBombeoMs);
            if (opc.ContainsKey("verboso"))
            {
                cfg.Log = delegate(string linea) { Console.Error.WriteLine(linea); };
            }

            int msPorSegundo = Entero(opc, "ms-por-segundo", 2);
            int retrasoMundo = Entero(opc, "retraso-mundo-ms", 0);
            int retrasoBombeo = Entero(opc, "retraso-bombeo-ms", 0);

            Console.CancelKeyPress += delegate(object o, ConsoleCancelEventArgs e) { e.Cancel = true; parar = true; };
            if (opc.ContainsKey("vigilar-stdin") || opc.ContainsKey("salir-con-stdin"))
            {
                Thread vigia = new Thread(VigilarStdin);
                vigia.IsBackground = true;
                vigia.Start();
            }

            // Este hilo es el "hilo principal": construye el mundo y bombea la cola.
            MundoSimulado mundo = new MundoSimulado(msPorSegundo);
            ServidorPuente servidor = new ServidorPuente(cfg);
            try
            {
                if (retrasoMundo <= 0) servidor.Mundo = mundo;
                servidor.Iniciar();

                // UTF-8 sin BOM pase lo que pase con la consola redirigida.
                StreamWriter salida = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
                salida.AutoFlush = true;
                salida.WriteLine("LISTO puerto=" + servidor.Puerto + " token_archivo=" + servidor.RutaArchivoToken);

                Stopwatch crono = Stopwatch.StartNew();
                bool mundoPuesto = retrasoMundo <= 0;
                while (!parar)
                {
                    long t = crono.ElapsedMilliseconds;
                    if (!mundoPuesto && t >= retrasoMundo) { servidor.Mundo = mundo; mundoPuesto = true; }
                    if (t >= retrasoBombeo)
                    {
                        servidor.Bombear();
                        mundo.Actualizar();
                    }
                    Thread.Sleep(2);
                }
            }
            finally
            {
                servidor.Detener();
                if (carpetaPropia)
                {
                    try { Directory.Delete(carpeta, true); } catch (Exception) { }
                }
            }
            return 0;
        }

        private static void VigilarStdin()
        {
            try
            {
                string linea;
                while ((linea = Console.In.ReadLine()) != null)
                {
                    if (linea.Trim() == "salir") break;
                }
            }
            catch (Exception) { }
            parar = true;
        }
    }
}
