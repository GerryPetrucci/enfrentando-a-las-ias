// E10 (aditivo): color y nombre de cada reino del formato «era». Lectura y validacion de `opciones.era.facciones`: lista de {faccion, color, nombre_reino}.
// No depende del juego: la integracion (MundoWorldBoxEraPresentacion.cs) la aplica al reino, y la autoprueba la ejerce sin abrirlo.
using System;
using System.Collections.Generic;

namespace PuenteWorldBox
{
    /// <summary>Lo pedido para una faccion. `Color` es "#RRGGBB" en mayusculas o null (el juego elige); `NombreReino` es texto validado o null.</summary>
    public sealed class PresentacionFaccion
    {
        public string Faccion;
        public string Color;
        public string NombreReino;
    }

    public static class PresentacionEra
    {
        public const int NombreMaximo = 24;

        private static ErrorPuente Mal(string m) { return new ErrorPuente(Codigos.SolicitudInvalida, m); }

        /// <summary>"#RRGGBB" (acepta minusculas y mayusculas; la barra es obligatoria).</summary>
        public static bool EsHex(string s)
        {
            if (s == null || s.Length != 7 || s[0] != '#') return false;
            for (int i = 1; i < 7; i++)
            {
                char c = s[i];
                bool ok = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
                if (!ok) return false;
            }
            return true;
        }

        /// <summary>Letras (con acentos), digitos, espacio, guion, apostrofo y punto; sin espacios al borde ni dobles; 1 a 24 caracteres.</summary>
        public static bool EsNombreSeguro(string s)
        {
            if (s == null || s.Length == 0 || s.Length > NombreMaximo) return false;
            if (s[0] == ' ' || s[s.Length - 1] == ' ' || s.IndexOf("  ", StringComparison.Ordinal) >= 0) return false;
            foreach (char c in s)
            {
                if (!(char.IsLetterOrDigit(c) || c == ' ' || c == '-' || c == '\'' || c == '.')) return false;
            }
            return true;
        }

        /// <summary>Lee `opciones.era.facciones`. Devuelve faccion -> pedido (solo las que traen color o nombre). Errores: faccion desconocida o repetida, color mal escrito o repetido, nombre inseguro o repetido.</summary>
        public static Dictionary<string, PresentacionFaccion> Leer(object valor, IList<string> idsFaccion)
        {
            Dictionary<string, PresentacionFaccion> res = new Dictionary<string, PresentacionFaccion>();
            List<object> lista = valor as List<object>;
            if (lista == null || lista.Count > 16) throw Mal("'opciones.era.facciones' debe ser un arreglo de 0 a 16 objetos {faccion, color, nombre_reino}.");
            HashSet<string> colores = new HashSet<string>(), nombres = new HashSet<string>();
            foreach (object o in lista)
            {
                Dictionary<string, object> d = o as Dictionary<string, object>;
                if (d == null) throw Mal("Cada entrada de 'opciones.era.facciones' debe ser un objeto.");
                object v;
                string id = d.TryGetValue("faccion", out v) ? v as string : null;
                if (id == null || idsFaccion.IndexOf(id) < 0) throw Mal("'opciones.era.facciones[].faccion' desconocida.");
                if (res.ContainsKey(id)) throw Mal("'opciones.era.facciones': faccion repetida '" + id + "'.");
                PresentacionFaccion p = new PresentacionFaccion();
                p.Faccion = id;
                if (d.TryGetValue("color", out v) && v != null)
                {
                    string c = v as string;
                    if (!EsHex(c)) throw Mal("'opciones.era.facciones[" + id + "].color' debe ser \"#RRGGBB\".");
                    p.Color = c.ToUpperInvariant();
                    if (!colores.Add(p.Color)) throw Mal("'opciones.era.facciones': dos facciones piden el mismo color " + p.Color + ".");
                }
                if (d.TryGetValue("nombre_reino", out v) && v != null)
                {
                    string n = v as string;
                    if (!EsNombreSeguro(n)) throw Mal("'opciones.era.facciones[" + id + "].nombre_reino' debe tener 1 a " + NombreMaximo + " caracteres (letras, digitos, espacio, guion, apostrofo o punto).");
                    p.NombreReino = n;
                    if (!nombres.Add(n.ToLowerInvariant())) throw Mal("'opciones.era.facciones': dos facciones piden el mismo nombre de reino '" + n + "'.");
                }
                if (p.Color != null || p.NombreReino != null) res[id] = p;
            }
            return res;
        }
    }
}
