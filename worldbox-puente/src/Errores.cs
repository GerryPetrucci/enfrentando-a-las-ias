using System;

namespace PuenteWorldBox
{
    /// <summary>Codigos de error estables del protocolo v1 (privado/worldbox/protocolo-puente-v1.md).</summary>
    public static class Codigos
    {
        public const string NoAutorizado = "no_autorizado";
        public const string ProtocoloIncompatible = "protocolo_incompatible";
        public const string NoListo = "no_listo";
        public const string SolicitudInvalida = "solicitud_invalida";
        public const string NoSoportado = "no_soportado";
        public const string JuegoOcupado = "juego_ocupado";
        public const string TiempoAgotado = "tiempo_agotado";
        public const string ErrorInterno = "error_interno";

        /// <summary>401 sin token o con token malo; 403 (mismo codigo) por Origin/Host de una pagina web.</summary>
        public static int EstadoHttp(string codigo)
        {
            switch (codigo)
            {
                case NoAutorizado: return 401;
                case ProtocoloIncompatible: return 400;
                case NoListo: return 503;
                case SolicitudInvalida: return 400;
                case NoSoportado: return 501;
                case JuegoOcupado: return 409;
                case TiempoAgotado: return 504;
                default: return 500;
            }
        }
    }

    /// <summary>
    /// Error que el puente convierte tal cual en una respuesta {ok:false, error:{codigo, mensaje}}.
    /// Una implementacion de IMundo puede lanzarlo para devolver un error tipado; cualquier otra
    /// excepcion se registra y el cliente solo ve error_interno (sin trazas ni rutas).
    /// </summary>
    public sealed class ErrorPuente : Exception
    {
        public string Codigo { get; private set; }
        public int EstadoHttp { get; private set; }
        /// <summary>Valor de la cabecera Allow en un 405.</summary>
        public string Allow { get; set; }

        public ErrorPuente(string codigo, string mensaje)
            : this(codigo, mensaje, Codigos.EstadoHttp(codigo))
        {
        }

        public ErrorPuente(string codigo, string mensaje, int estadoHttp)
            : base(mensaje)
        {
            Codigo = codigo;
            EstadoHttp = estadoHttp;
        }
    }
}
