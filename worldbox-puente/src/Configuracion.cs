using System;

namespace PuenteWorldBox
{
    /// <summary>Parametros del puente. Los valores por defecto son los del protocolo v1.</summary>
    public sealed class ConfiguracionPuente
    {
        public const int PuertoPorDefecto = 47600;
        public const string NombreArchivoToken = "puente-token.txt";

        /// <summary>0 = puerto efimero (lo elige el sistema; util en pruebas).</summary>
        public int Puerto = PuertoPorDefecto;

        /// <summary>Carpeta donde se escribe puente-token.txt (junto al mod). Obligatoria.</summary>
        public string CarpetaToken;

        public string NombrePuente = "puente-worldbox";
        public string VersionPuente = "0.1.0";

        /// <summary>Tope de Content-Length aceptado.</summary>
        public int MaxCuerpoBytes = 64 * 1024;

        /// <summary>Plazo total para recibir cabecera y cuerpo de una solicitud (anti conexiones colgadas).</summary>
        public int TiempoLecturaMs = 5000;

        public int TiempoEscrituraMs = 5000;

        /// <summary>Plazo para operaciones normales del juego (reiniciar, observar, accion...).</summary>
        public int TiempoOperacionMs = 15000;

        /// <summary>Plazo para /v1/avanzar (la simulacion corre en tiempo real del juego).</summary>
        public int TiempoAvanceMs = 120000;

        /// <summary>
        /// Si una operacion ya empezada se abandona por tiempo y no termina en este margen, el puente la
        /// da por fallida para no quedar en juego_ocupado para siempre.
        /// </summary>
        public int GraciaAbandonoMs = 60000;

        public int MaxConexiones = 8;
        public int PresupuestoCuadroMs = 8;
        public int MaxPendientes = 16;

        /// <summary>Si Bombear no se llama en este tiempo el puente se anuncia como "cargando" y rechaza con no_listo.</summary>
        public int ToleranciaBombeoMs = 3000;

        public int CapacidadCacheIdempotencia = 256;
        public int MaxRespuestaCaracteres = 2 * 1024 * 1024;

        /// <summary>Destino del log (p. ej. UnityEngine.Debug.Log). Nunca recibe el token.</summary>
        public Action<string> Log;

        internal void Validar()
        {
            if (string.IsNullOrEmpty(CarpetaToken)) throw new ArgumentException("CarpetaToken es obligatoria.");
            if (Puerto < 0 || Puerto > 65535) throw new ArgumentException("Puerto fuera de rango.");
            if (MaxCuerpoBytes < 1024 || MaxCuerpoBytes > 4 * 1024 * 1024) throw new ArgumentException("MaxCuerpoBytes fuera de rango.");
            if (TiempoLecturaMs < 100 || TiempoEscrituraMs < 100) throw new ArgumentException("Plazos de red demasiado cortos.");
            if (TiempoOperacionMs < 50 || TiempoAvanceMs < 50 || GraciaAbandonoMs < 0) throw new ArgumentException("Plazos de operacion invalidos.");
            if (MaxConexiones < 1 || MaxConexiones > 256) throw new ArgumentException("MaxConexiones fuera de rango.");
            if (ToleranciaBombeoMs < 100) throw new ArgumentException("ToleranciaBombeoMs demasiado corta.");
        }
    }
}
