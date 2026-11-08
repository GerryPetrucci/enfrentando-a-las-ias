using System;
using System.Collections.Generic;
using System.Text;

namespace PuenteWorldBox
{
    internal sealed class SolicitudHttp
    {
        public string Metodo;
        public string Ruta;
        public Dictionary<string, string> Consulta = new Dictionary<string, string>();
        /// <summary>Claves en minusculas.</summary>
        public Dictionary<string, string> Cabeceras = new Dictionary<string, string>();
        public long ContentLength = -1;
        public string Cuerpo = "";
    }

    internal sealed class RespuestaHttp
    {
        public int Estado;
        public string Cuerpo;
        public string Allow;
        public bool Repetida;
    }

    /// <summary>
    /// Analisis estricto de la cabecera HTTP/1.1. Es una funcion pura sobre bytes para poder probarla
    /// sin sockets. Rechaza todo lo ambiguo (plegado de lineas, cabeceras repetidas que importan,
    /// saltos de linea sueltos, bytes no ASCII) en vez de intentar interpretarlo.
    /// </summary>
    internal static class AnalizadorHttp
    {
        public const int MaxCabeceraBytes = 16 * 1024;
        private const int MaxObjetivo = 2048;
        private const int MaxCabeceras = 64;

        private static ErrorPuente Mala(string mensaje)
        {
            return new ErrorPuente(Codigos.SolicitudInvalida, mensaje, 400);
        }

        /// <summary>Posicion del primer \r\n\r\n en buf[0..largo), o -1.</summary>
        public static int BuscarFinCabecera(byte[] buf, int desde, int largo)
        {
            for (int i = Math.Max(0, desde); i + 3 < largo; i++)
            {
                if (buf[i] == 13 && buf[i + 1] == 10 && buf[i + 2] == 13 && buf[i + 3] == 10) return i;
            }
            return -1;
        }

        /// <summary>Analiza buf[0..largo) (la cabecera SIN el \r\n\r\n final).</summary>
        public static SolicitudHttp Analizar(byte[] buf, int largo)
        {
            for (int i = 0; i < largo; i++)
            {
                if (buf[i] >= 0x80 || buf[i] == 0) throw Mala("La cabecera contiene bytes no validos.");
            }
            string texto = Encoding.ASCII.GetString(buf, 0, largo);
            string[] lineas = texto.Split(new string[] { "\r\n" }, StringSplitOptions.None);
            foreach (string l in lineas)
            {
                if (l.IndexOf('\r') >= 0 || l.IndexOf('\n') >= 0) throw Mala("Salto de linea suelto en la cabecera.");
            }

            string[] partes = lineas[0].Split(' ');
            if (partes.Length != 3) throw Mala("Linea de solicitud invalida.");
            string metodo = partes[0];
            if (metodo.Length < 1 || metodo.Length > 10) throw Mala("Metodo invalido.");
            foreach (char c in metodo) { if (c < 'A' || c > 'Z') throw Mala("Metodo invalido."); }
            if (partes[2] != "HTTP/1.1" && partes[2] != "HTTP/1.0") throw Mala("Version HTTP no soportada.");

            string objetivo = partes[1];
            if (objetivo.Length < 1 || objetivo.Length > MaxObjetivo || objetivo[0] != '/') throw Mala("Objetivo de solicitud invalido.");
            foreach (char c in objetivo) { if (c <= ' ' || c == 0x7f || c == '#') throw Mala("Objetivo de solicitud invalido."); }

            SolicitudHttp s = new SolicitudHttp();
            s.Metodo = metodo;
            int q = objetivo.IndexOf('?');
            s.Ruta = q < 0 ? objetivo : objetivo.Substring(0, q);
            if (q >= 0) AnalizarConsulta(objetivo.Substring(q + 1), s.Consulta);

            if (lineas.Length - 1 > MaxCabeceras) throw Mala("Demasiadas cabeceras.");
            for (int i = 1; i < lineas.Length; i++)
            {
                string l = lineas[i];
                if (l.Length == 0 || l[0] == ' ' || l[0] == '\t') throw Mala("Cabecera mal formada.");
                int dp = l.IndexOf(':');
                if (dp < 1) throw Mala("Cabecera mal formada.");
                string nombre = l.Substring(0, dp);
                foreach (char c in nombre) { if (!CaracterToken(c)) throw Mala("Nombre de cabecera invalido."); }
                string valor = l.Substring(dp + 1).Trim(' ', '\t');
                foreach (char c in valor) { if ((c < 0x20 && c != '\t') || c == 0x7f) throw Mala("Valor de cabecera invalido."); }
                nombre = nombre.ToLowerInvariant();
                if (s.Cabeceras.ContainsKey(nombre) &&
                    (nombre == "content-length" || nombre == "x-puente-token" || nombre == "host" || nombre == "transfer-encoding"))
                    throw Mala("Cabecera repetida: " + nombre + ".");
                s.Cabeceras[nombre] = valor;
            }

            if (s.Cabeceras.ContainsKey("transfer-encoding"))
                throw Mala("Transfer-Encoding no esta soportado; use Content-Length.");

            string cl;
            if (s.Cabeceras.TryGetValue("content-length", out cl))
            {
                if (cl.Length < 1 || cl.Length > 10) throw Mala("Content-Length invalido.");
                foreach (char c in cl) { if (c < '0' || c > '9') throw Mala("Content-Length invalido."); }
                s.ContentLength = long.Parse(cl, System.Globalization.CultureInfo.InvariantCulture);
            }
            return s;
        }

        private static bool CaracterToken(char c)
        {
            if (c >= 'a' && c <= 'z') return true;
            if (c >= 'A' && c <= 'Z') return true;
            if (c >= '0' && c <= '9') return true;
            return "!#$%&'*+-.^_`|~".IndexOf(c) >= 0;
        }

        private static void AnalizarConsulta(string consulta, Dictionary<string, string> destino)
        {
            if (consulta.Length == 0) return;
            foreach (string par in consulta.Split('&'))
            {
                if (par.Length == 0) continue;
                int ig = par.IndexOf('=');
                string k = DecodificarPorcentaje(ig < 0 ? par : par.Substring(0, ig));
                string v = ig < 0 ? "" : DecodificarPorcentaje(par.Substring(ig + 1));
                if (k.Length == 0) throw Mala("Parametro de consulta sin nombre.");
                if (destino.ContainsKey(k)) throw Mala("Parametro de consulta repetido: " + Texto.Limpiar(k, 40) + ".");
                destino[k] = v;
            }
        }

        public static string DecodificarPorcentaje(string s)
        {
            if (s.IndexOf('%') < 0 && s.IndexOf('+') < 0) return s;
            List<byte> bytes = new List<byte>(s.Length);
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                if (c == '%')
                {
                    if (i + 2 >= s.Length) throw Mala("Codificacion de porcentaje incompleta.");
                    int h1 = Hex(s[i + 1]), h2 = Hex(s[i + 2]);
                    if (h1 < 0 || h2 < 0) throw Mala("Codificacion de porcentaje invalida.");
                    bytes.Add((byte)((h1 << 4) | h2));
                    i += 2;
                }
                else if (c == '+') bytes.Add((byte)' ');
                else bytes.Add((byte)c);
            }
            try
            {
                return new UTF8Encoding(false, true).GetString(bytes.ToArray());
            }
            catch (DecoderFallbackException)
            {
                throw Mala("La consulta no es UTF-8 valido.");
            }
        }

        private static int Hex(char c)
        {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            return -1;
        }

        public static string Frase(int estado)
        {
            switch (estado)
            {
                case 200: return "OK";
                case 400: return "Bad Request";
                case 401: return "Unauthorized";
                case 403: return "Forbidden";
                case 404: return "Not Found";
                case 405: return "Method Not Allowed";
                case 408: return "Request Timeout";
                case 409: return "Conflict";
                case 411: return "Length Required";
                case 413: return "Payload Too Large";
                case 431: return "Request Header Fields Too Large";
                case 501: return "Not Implemented";
                case 503: return "Service Unavailable";
                case 504: return "Gateway Timeout";
                default: return "Internal Server Error";
            }
        }
    }
}
