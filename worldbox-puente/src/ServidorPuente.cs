using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace PuenteWorldBox
{
    /// <summary>
    /// Servidor HTTP/1.1 minimo sobre TcpListener, solo en 127.0.0.1. Un hilo aceptador y un hilo
    /// corto por conexion (con tope); cada conexion atiende UNA solicitud y se cierra. Ningun hilo de
    /// red toca el juego: todo el trabajo pasa por la ColaPrincipal que vacia Bombear().
    /// </summary>
    public sealed class ServidorPuente : IDisposable
    {
        /// <summary>Se cierra la conexion sin responder (el cliente ya se fue o no hablaba HTTP).</summary>
        private sealed class CierreSilencioso : Exception { }

        private readonly ConfiguracionPuente cfg;
        private readonly Registro log;
        private readonly ColaPrincipal cola;
        private readonly Protocolo protocolo;
        private readonly string token;
        private readonly HashSet<Socket> conexiones = new HashSet<Socket>();
        private TcpListener oyente;
        private Thread aceptador;
        private volatile bool detenido;
        private int activas;
        private string rutaToken;

        public ServidorPuente(ConfiguracionPuente configuracion)
        {
            if (configuracion == null) throw new ArgumentNullException("configuracion");
            configuracion.Validar();
            cfg = configuracion;
            log = new Registro(cfg.Log);
            cola = new ColaPrincipal(cfg.PresupuestoCuadroMs, cfg.MaxPendientes, cfg.ToleranciaBombeoMs);
            token = Seguridad.GenerarToken();
            protocolo = new Protocolo(cfg, cola, log, token);
        }

        /// <summary>Integracion con el juego. Puede asignarse antes o despues de Iniciar; null = el juego aun carga.</summary>
        public IMundo Mundo
        {
            get { return protocolo.Mundo; }
            set { protocolo.Mundo = value; }
        }

        /// <summary>Solo para pruebas (internals visibles al anfitrion): gancho entre la consulta a la cache y la adquisicion del turno.</summary>
        internal Action AntesDeAdquirirEjecucion
        {
            set { protocolo.AntesDeAdquirirEjecucion = value; }
        }

        public int Puerto { get; private set; }

        /// <summary>Direccion real del socket de escucha ("127.0.0.1:puerto"), para auditarla en las pruebas.</summary>
        public string Escucha
        {
            get
            {
                TcpListener l = oyente;
                return l == null ? null : l.LocalEndpoint.ToString();
            }
        }

        /// <summary>Ruta del archivo con el token (el token mismo nunca se expone ni se registra).</summary>
        public string RutaArchivoToken { get { return rutaToken; } }

        public bool Escuchando { get { return oyente != null && !detenido; } }

        /// <summary>LLAMAR DESDE EL HILO PRINCIPAL (Update). Ejecuta el trabajo que los hilos de red dejaron en la cola.</summary>
        public int Bombear()
        {
            return cola.Bombear();
        }

        public void Iniciar()
        {
            if (oyente != null || detenido) throw new InvalidOperationException("El servidor ya se inicio.");

            TcpListener l = new TcpListener(IPAddress.Loopback, cfg.Puerto);
            // Impide que otro proceso se cuele en el mismo puerto (Windows). Si el runtime no lo admite, se sigue.
            try { l.ExclusiveAddressUse = true; } catch (Exception) { }
            try
            {
                l.Start(16);
            }
            catch (SocketException e)
            {
                throw new InvalidOperationException("No se pudo abrir 127.0.0.1:" + cfg.Puerto + " (" + e.SocketErrorCode + ").", e);
            }
            oyente = l;
            Puerto = ((IPEndPoint)l.LocalEndpoint).Port;
            protocolo.PuertoEscucha = Puerto;

            try
            {
                EscribirToken();
            }
            catch (Exception)
            {
                try { l.Stop(); } catch (Exception) { }
                oyente = null;
                throw;
            }

            aceptador = new Thread(BucleAceptar);
            aceptador.IsBackground = true;
            aceptador.Name = "puente-aceptador";
            aceptador.Start();
            log.Escribir("Escuchando en 127.0.0.1:" + Puerto + ".");
        }

        public void Detener()
        {
            if (detenido) return;
            detenido = true;
            cola.Detener();
            TcpListener l = oyente;
            if (l != null)
            {
                try { l.Stop(); } catch (Exception) { }
            }
            Socket[] abiertas;
            lock (conexiones) { abiertas = new Socket[conexiones.Count]; conexiones.CopyTo(abiertas); }
            foreach (Socket s in abiertas)
            {
                try { s.Close(); } catch (Exception) { }
            }
            Thread a = aceptador;
            if (a != null && Thread.CurrentThread != a) a.Join(2000);
            if (rutaToken != null)
            {
                try { if (File.Exists(rutaToken)) File.Delete(rutaToken); } catch (Exception) { }
            }
            log.Escribir("Servidor detenido.");
        }

        public void Dispose()
        {
            Detener();
        }

        private void EscribirToken()
        {
            Directory.CreateDirectory(cfg.CarpetaToken);
            string ruta = Path.GetFullPath(Path.Combine(cfg.CarpetaToken, ConfiguracionPuente.NombreArchivoToken));
            string tmp = ruta + ".tmp";
            File.WriteAllText(tmp, token, new UTF8Encoding(false));
            if (File.Exists(ruta)) File.Delete(ruta);
            File.Move(tmp, ruta);
            rutaToken = ruta;
        }

        // ---------------------------------------------------------------------------------
        // Aceptar conexiones
        // ---------------------------------------------------------------------------------

        private void BucleAceptar()
        {
            while (!detenido)
            {
                Socket s;
                try
                {
                    s = oyente.AcceptSocket();
                }
                catch (SocketException)
                {
                    if (detenido) break;
                    Thread.Sleep(50);
                    continue;
                }
                catch (ObjectDisposedException) { break; }
                catch (InvalidOperationException) { break; }
                catch (Exception e)
                {
                    log.Escribir("Fallo al aceptar una conexion: " + e.GetType().Name);
                    Thread.Sleep(50);
                    continue;
                }

                bool contada = false;
                try
                {
                    IPEndPoint remoto = s.RemoteEndPoint as IPEndPoint;
                    // El oyente ya es solo de bucle local; esto es defensa en profundidad.
                    if (remoto == null || !IPAddress.IsLoopback(remoto.Address))
                    {
                        Cerrar(s);
                        continue;
                    }
                    if (Interlocked.Increment(ref activas) > cfg.MaxConexiones)
                    {
                        Interlocked.Decrement(ref activas);
                        log.Escribir("Conexion rechazada: demasiadas simultaneas.");
                        Cerrar(s);
                        continue;
                    }
                    contada = true;
                    lock (conexiones) { conexiones.Add(s); }
                    Socket mia = s;
                    Thread h = new Thread(delegate() { Atender(mia); });
                    h.IsBackground = true;
                    h.Name = "puente-conexion";
                    h.Start();
                }
                catch (Exception e)
                {
                    log.Escribir("No se pudo atender una conexion: " + e.GetType().Name);
                    if (contada) Liberar(s);
                    else Cerrar(s);
                }
            }
        }

        private void Atender(Socket s)
        {
            Stopwatch reloj = Stopwatch.StartNew();
            string que = "?";
            int estado = 0;
            try
            {
                s.NoDelay = true;
                s.SendTimeout = cfg.TiempoEscrituraMs;
                long limite = ColaPrincipal.Reloj.ElapsedMilliseconds + cfg.TiempoLecturaMs;
                RespuestaHttp respuesta;
                try
                {
                    byte[] sobrante;
                    int nSobrante;
                    SolicitudHttp sol = LeerCabecera(s, limite, out sobrante, out nSobrante);
                    que = sol.Metodo + " " + Texto.Limpiar(sol.Ruta, 60);
                    RutaPuente ruta = protocolo.Prevalidar(sol);
                    sol.Cuerpo = LeerCuerpo(s, sol, sobrante, nSobrante, limite);
                    respuesta = protocolo.Procesar(sol, ruta);
                }
                catch (ErrorPuente e)
                {
                    respuesta = protocolo.RespuestaError(e);
                }
                estado = respuesta.Estado;
                Enviar(s, respuesta);
            }
            catch (CierreSilencioso)
            {
            }
            catch (Exception e)
            {
                log.Escribir("Conexion descartada (" + e.GetType().Name + ").");
            }
            finally
            {
                if (estado != 0) log.Escribir(que + " -> " + estado + " (" + reloj.ElapsedMilliseconds + " ms)");
                Liberar(s);
            }
        }

        private SolicitudHttp LeerCabecera(Socket s, long limite, out byte[] buffer, out int largo)
        {
            buffer = new byte[AnalizadorHttp.MaxCabeceraBytes];
            largo = 0;
            int fin = -1;
            while (fin < 0)
            {
                if (largo >= buffer.Length)
                    throw new ErrorPuente(Codigos.SolicitudInvalida, "Cabecera demasiado grande.", 431);
                int n = Recibir(s, buffer, largo, buffer.Length - largo, limite);
                if (n <= 0) throw new CierreSilencioso();
                int desde = Math.Max(0, largo - 3);
                largo += n;
                fin = AnalizadorHttp.BuscarFinCabecera(buffer, desde, largo);
            }
            SolicitudHttp sol = AnalizadorHttp.Analizar(buffer, fin);
            // Lo leido de mas tras la cabecera es el comienzo del cuerpo.
            int inicioCuerpo = fin + 4;
            int resto = largo - inicioCuerpo;
            byte[] sobrante = new byte[resto];
            Buffer.BlockCopy(buffer, inicioCuerpo, sobrante, 0, resto);
            buffer = sobrante;
            largo = resto;
            return sol;
        }

        private string LeerCuerpo(Socket s, SolicitudHttp sol, byte[] sobrante, int nSobrante, long limite)
        {
            if (sol.ContentLength <= 0) return "";
            int total = (int)sol.ContentLength; // ya validado contra MaxCuerpoBytes
            byte[] cuerpo = new byte[total];
            int leidos = Math.Min(nSobrante, total);
            Buffer.BlockCopy(sobrante, 0, cuerpo, 0, leidos);
            while (leidos < total)
            {
                int n = Recibir(s, cuerpo, leidos, total - leidos, limite);
                if (n <= 0) throw new CierreSilencioso();
                leidos += n;
            }
            try
            {
                return new UTF8Encoding(false, true).GetString(cuerpo);
            }
            catch (DecoderFallbackException)
            {
                throw new ErrorPuente(Codigos.SolicitudInvalida, "El cuerpo no es UTF-8 valido.", 400);
            }
        }

        /// <summary>Recibe con plazo total (Poll no deja el socket en estado dudoso como un Receive vencido).</summary>
        private static int Recibir(Socket s, byte[] buffer, int desplazamiento, int cantidad, long limite)
        {
            long resto = limite - ColaPrincipal.Reloj.ElapsedMilliseconds;
            if (resto <= 0) throw new ErrorPuente(Codigos.SolicitudInvalida, "Tiempo de lectura agotado.", 408);
            try
            {
                int micro = (int)Math.Min(resto * 1000L, 2000000000L);
                if (!s.Poll(micro, SelectMode.SelectRead))
                    throw new ErrorPuente(Codigos.SolicitudInvalida, "Tiempo de lectura agotado.", 408);
                return s.Receive(buffer, desplazamiento, cantidad, SocketFlags.None);
            }
            catch (SocketException)
            {
                throw new CierreSilencioso();
            }
            catch (ObjectDisposedException)
            {
                throw new CierreSilencioso();
            }
        }

        private void Enviar(Socket s, RespuestaHttp r)
        {
            byte[] cuerpo = Encoding.UTF8.GetBytes(r.Cuerpo ?? "");
            StringBuilder sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(r.Estado).Append(' ').Append(AnalizadorHttp.Frase(r.Estado)).Append("\r\n");
            sb.Append("Content-Type: application/json; charset=utf-8\r\n");
            sb.Append("Content-Length: ").Append(cuerpo.Length).Append("\r\n");
            sb.Append("Connection: close\r\n");
            sb.Append("Cache-Control: no-store\r\n");
            sb.Append("X-Content-Type-Options: nosniff\r\n");
            if (r.Allow != null) sb.Append("Allow: ").Append(r.Allow).Append("\r\n");
            if (r.Repetida) sb.Append("X-Puente-Idempotente: repetida\r\n");
            sb.Append("\r\n");
            byte[] cabecera = Encoding.ASCII.GetBytes(sb.ToString());

            byte[] todo = new byte[cabecera.Length + cuerpo.Length];
            Buffer.BlockCopy(cabecera, 0, todo, 0, cabecera.Length);
            Buffer.BlockCopy(cuerpo, 0, todo, cabecera.Length, cuerpo.Length);
            int enviados = 0;
            while (enviados < todo.Length)
            {
                int n = s.Send(todo, enviados, todo.Length - enviados, SocketFlags.None);
                if (n <= 0) break;
                enviados += n;
            }
        }

        private void Liberar(Socket s)
        {
            lock (conexiones) { conexiones.Remove(s); }
            Interlocked.Decrement(ref activas);
            CerrarElegante(s);
        }

        private static void Cerrar(Socket s)
        {
            try { s.Close(); } catch (Exception) { }
        }

        /// <summary>
        /// Cierre ordenado: avisa fin de envio y descarta brevemente lo que el cliente siga mandando.
        /// Cerrar de golpe con datos sin leer provoca un RST que puede borrar la respuesta en vuelo.
        /// </summary>
        private static void CerrarElegante(Socket s)
        {
            try { s.Shutdown(SocketShutdown.Send); } catch (Exception) { }
            try
            {
                byte[] basura = new byte[4096];
                long limite = ColaPrincipal.Reloj.ElapsedMilliseconds + 300;
                int total = 0;
                while (total < 262144)
                {
                    long resto = limite - ColaPrincipal.Reloj.ElapsedMilliseconds;
                    if (resto <= 0 || !s.Poll((int)resto * 1000, SelectMode.SelectRead)) break;
                    int n = s.Receive(basura);
                    if (n <= 0) break;
                    total += n;
                }
            }
            catch (Exception) { }
            Cerrar(s);
        }
    }
}
