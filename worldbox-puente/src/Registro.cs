using System;
using System.Diagnostics;

namespace PuenteWorldBox
{
    /// <summary>
    /// Log del puente hacia un delegado inyectable (el cargador lo conectara a UnityEngine.Debug.Log).
    /// Nunca recibe el token. Acota la frecuencia para que un cliente hostil no llene el log del juego,
    /// y traga las excepciones del delegado (un log roto no puede tumbar un hilo de red).
    /// </summary>
    internal sealed class Registro
    {
        private const int MaxPorSegundo = 50;
        private readonly Action<string> destino;
        private readonly object cerrojo = new object();
        private readonly Stopwatch reloj = Stopwatch.StartNew();
        private long ventanaInicioMs;
        private int enVentana;
        private int omitidos;

        public Registro(Action<string> destino)
        {
            this.destino = destino;
        }

        public void Escribir(string mensaje)
        {
            if (destino == null) return;
            string salida = null;
            string aviso = null;
            lock (cerrojo)
            {
                long ahora = reloj.ElapsedMilliseconds;
                if (ahora - ventanaInicioMs >= 1000)
                {
                    if (omitidos > 0) aviso = "[puente] (" + omitidos + " mensajes omitidos por frecuencia)";
                    ventanaInicioMs = ahora;
                    enVentana = 0;
                    omitidos = 0;
                }
                if (enVentana < MaxPorSegundo)
                {
                    enVentana++;
                    salida = "[puente] " + Texto.Limpiar(mensaje, 400);
                }
                else
                {
                    omitidos++;
                }
            }
            Emitir(aviso);
            Emitir(salida);
        }

        private void Emitir(string linea)
        {
            if (linea == null) return;
            try { destino(linea); }
            catch (Exception) { }
        }
    }
}
