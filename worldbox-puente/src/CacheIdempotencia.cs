using System.Collections.Generic;

namespace PuenteWorldBox
{
    internal sealed class RespuestaGuardada
    {
        public int Estado;
        public string Cuerpo;
        /// <summary>Huella del cuerpo de la solicitud original: un id repetido con otro cuerpo es un error del cliente.</summary>
        public string Huella;
    }

    /// <summary>Cache acotada (FIFO) de respuestas por clave "ruta|id_solicitud".</summary>
    internal sealed class CacheIdempotencia
    {
        private readonly object cerrojo = new object();
        private readonly Dictionary<string, RespuestaGuardada> mapa = new Dictionary<string, RespuestaGuardada>();
        private readonly Queue<string> orden = new Queue<string>();
        private readonly int capacidad;

        public CacheIdempotencia(int capacidad)
        {
            this.capacidad = capacidad < 1 ? 1 : capacidad;
        }

        public int Cuenta
        {
            get { lock (cerrojo) { return mapa.Count; } }
        }

        public RespuestaGuardada Obtener(string clave)
        {
            lock (cerrojo)
            {
                RespuestaGuardada r;
                return mapa.TryGetValue(clave, out r) ? r : null;
            }
        }

        public void Guardar(string clave, RespuestaGuardada r)
        {
            lock (cerrojo)
            {
                if (!mapa.ContainsKey(clave))
                {
                    orden.Enqueue(clave);
                    while (orden.Count > capacidad)
                    {
                        mapa.Remove(orden.Dequeue());
                    }
                }
                mapa[clave] = r;
            }
        }
    }
}
