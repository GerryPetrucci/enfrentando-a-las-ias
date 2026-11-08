using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading;

namespace PuenteWorldBox
{
    /// <summary>
    /// Trabajo que corre en el hilo principal. Puede terminar en el mismo cuadro o en uno posterior:
    /// quien lo ejecuta debe llamar exactamente una vez a Completar o Fallar (las demas llamadas se ignoran).
    /// El finalizador corre en el hilo que termina la tarea, ANTES de despertar a quien espera.
    /// </summary>
    public sealed class TareaPrincipal
    {
        private const int EPendiente = 0, EIniciada = 1, ECerrando = 2, ETerminada = 3, ECancelada = 4;

        private readonly object cerrojo = new object();
        private readonly Action<TareaPrincipal> inicio;
        private readonly Action<TareaPrincipal> finalizador;
        private int estado;
        private bool cancelada;
        private object resultado;
        private Exception error;
        private long abandonadaDesdeMs = -1;

        internal TareaPrincipal(Action<TareaPrincipal> inicio, Action<TareaPrincipal> finalizador)
        {
            this.inicio = inicio;
            this.finalizador = finalizador;
        }

        /// <summary>Datos que el protocolo cuelga de la tarea (la respuesta ya serializada).</summary>
        internal object Respuesta;

        public object Resultado { get { lock (cerrojo) { return resultado; } } }
        public Exception Error { get { lock (cerrojo) { return error; } } }
        public bool Cancelada { get { lock (cerrojo) { return cancelada; } } }
        internal long AbandonadaDesdeMs { get { lock (cerrojo) { return abandonadaDesdeMs; } } }
        internal bool EnCurso { get { lock (cerrojo) { return estado == EIniciada || estado == ECerrando; } } }

        public void Completar(object r) { Cerrar(EIniciada, r, null, ETerminada); }
        public void Fallar(Exception e) { Cerrar(EIniciada, null, e, ETerminada); }

        internal bool Cancelar() { return Cerrar(EPendiente, null, null, ECancelada); }

        internal bool Iniciar()
        {
            lock (cerrojo)
            {
                if (estado != EPendiente) return false;
                estado = EIniciada;
                return true;
            }
        }

        internal void EjecutarInicio() { inicio(this); }

        internal void Abandonar()
        {
            lock (cerrojo)
            {
                if (abandonadaDesdeMs < 0) abandonadaDesdeMs = ColaPrincipal.Reloj.ElapsedMilliseconds;
            }
        }

        private bool Cerrar(int desde, object r, Exception e, int hasta)
        {
            lock (cerrojo)
            {
                if (estado != desde) return false;
                estado = ECerrando;
                resultado = r;
                error = e;
                cancelada = (hasta == ECancelada);
            }
            try { if (finalizador != null) finalizador(this); }
            catch (Exception) { /* el finalizador del protocolo ya registra sus propios fallos */ }
            lock (cerrojo)
            {
                estado = hasta;
                Monitor.PulseAll(cerrojo);
            }
            return true;
        }

        /// <summary>Espera hasta ms milisegundos. True solo si la tarea termino (no si se cancelo ni si vencio el plazo).</summary>
        internal bool Esperar(int ms)
        {
            long limite = ColaPrincipal.Reloj.ElapsedMilliseconds + ms;
            lock (cerrojo)
            {
                while (estado != ETerminada && estado != ECancelada)
                {
                    long resto = limite - ColaPrincipal.Reloj.ElapsedMilliseconds;
                    if (resto <= 0) return false;
                    Monitor.Wait(cerrojo, (int)Math.Min(resto, 1000));
                }
                return estado == ETerminada;
            }
        }
    }

    /// <summary>
    /// Puente entre los hilos de red y el hilo principal del juego. Los hilos de red encolan trabajo
    /// y esperan; SOLO el hilo que llama a Bombear() ejecuta ese trabajo, con un presupuesto de tiempo
    /// por llamada (una tarea siempre se ejecuta entera: el presupuesto reparte tareas entre cuadros,
    /// no corta una a la mitad).
    /// </summary>
    public sealed class ColaPrincipal
    {
        internal static readonly Stopwatch Reloj = Stopwatch.StartNew();

        private readonly object cerrojo = new object();
        private readonly List<TareaPrincipal> pendientes = new List<TareaPrincipal>();
        private readonly int presupuestoMs;
        private readonly int maxPendientes;
        private readonly int toleranciaMs;
        private long ultimoBombeoMs = -1;
        private volatile int hiloPrincipalId;
        private volatile bool detenida;

        public ColaPrincipal(int presupuestoMs, int maxPendientes, int toleranciaMs)
        {
            this.presupuestoMs = presupuestoMs < 1 ? 1 : presupuestoMs;
            this.maxPendientes = maxPendientes < 1 ? 1 : maxPendientes;
            this.toleranciaMs = toleranciaMs;
        }

        public bool Detenida { get { return detenida; } }

        /// <summary>Id gestionado del ultimo hilo que bombeo (0 si nunca).</summary>
        public int HiloPrincipalId { get { return hiloPrincipalId; } }

        public bool EsHiloPrincipal { get { return hiloPrincipalId != 0 && hiloPrincipalId == Thread.CurrentThread.ManagedThreadId; } }

        /// <summary>El hilo principal esta llamando a Bombear con regularidad (si no, el juego esta cargando o congelado).</summary>
        public bool Viva
        {
            get
            {
                long u = Interlocked.Read(ref ultimoBombeoMs);
                return u >= 0 && Reloj.ElapsedMilliseconds - u < toleranciaMs;
            }
        }

        public int Pendientes { get { lock (cerrojo) { return pendientes.Count; } } }

        internal TareaPrincipal Encolar(Action<TareaPrincipal> inicio, Action<TareaPrincipal> finalizador)
        {
            lock (cerrojo)
            {
                if (detenida) throw new ErrorPuente(Codigos.NoListo, "El puente se esta deteniendo.");
                if (pendientes.Count >= maxPendientes) throw new ErrorPuente(Codigos.JuegoOcupado, "La cola de trabajo esta llena.");
                TareaPrincipal t = new TareaPrincipal(inicio, finalizador);
                pendientes.Add(t);
                return t;
            }
        }

        /// <summary>Encola una funcion sincrona; su valor de retorno es el resultado de la tarea.</summary>
        public TareaPrincipal Encolar(Func<object> funcion, Action<TareaPrincipal> finalizador)
        {
            return Encolar(delegate(TareaPrincipal t) { t.Completar(funcion()); }, finalizador);
        }

        /// <summary>
        /// Espera a la tarea. Si vence el plazo: una tarea que aun no empezo se cancela (nunca se
        /// ejecutara) y una que ya empezo se marca como abandonada (terminara sola y su finalizador
        /// seguira corriendo). Devuelve true solo si termino.
        /// </summary>
        public bool Esperar(TareaPrincipal t, int ms)
        {
            if (t.Esperar(ms)) return true;
            if (t.Cancelar())
            {
                lock (cerrojo) { pendientes.Remove(t); }
            }
            else
            {
                t.Abandonar();
            }
            return false;
        }

        /// <summary>LLAMAR SOLO DESDE EL HILO PRINCIPAL (Update de Unity). Devuelve cuantas tareas inicio.</summary>
        public int Bombear()
        {
            hiloPrincipalId = Thread.CurrentThread.ManagedThreadId;
            Interlocked.Exchange(ref ultimoBombeoMs, Reloj.ElapsedMilliseconds);
            int n = 0;
            long t0 = Reloj.ElapsedMilliseconds;
            while (true)
            {
                TareaPrincipal t = null;
                lock (cerrojo)
                {
                    if (pendientes.Count > 0)
                    {
                        t = pendientes[0];
                        pendientes.RemoveAt(0);
                    }
                }
                if (t == null) break;
                if (!t.Iniciar()) continue; // la cancelaron mientras esperaba
                n++;
                try { t.EjecutarInicio(); }
                catch (Exception e) { t.Fallar(e); }
                Interlocked.Exchange(ref ultimoBombeoMs, Reloj.ElapsedMilliseconds);
                if (Reloj.ElapsedMilliseconds - t0 >= presupuestoMs) break;
            }
            return n;
        }

        /// <summary>Cancela lo pendiente y rechaza trabajo nuevo. Despierta a los hilos de red que esperan.</summary>
        public void Detener()
        {
            List<TareaPrincipal> copia;
            lock (cerrojo)
            {
                detenida = true;
                copia = new List<TareaPrincipal>(pendientes);
                pendientes.Clear();
            }
            foreach (TareaPrincipal t in copia) t.Cancelar();
        }
    }
}
