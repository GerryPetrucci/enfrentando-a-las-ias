using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace PuenteWorldBox
{
    public sealed class JsonExcepcion : Exception
    {
        public JsonExcepcion(string mensaje) : base(mensaje) { }
    }

    /// <summary>
    /// Objeto JSON que conserva el orden de insercion al escribirse. Se usa donde el orden de las
    /// claves es parte del contrato visible (p. ej. los parametros de cada accion en /v1/info).
    /// </summary>
    public sealed class ObjetoOrdenado : IEnumerable<KeyValuePair<string, object>>
    {
        private readonly List<KeyValuePair<string, object>> pares = new List<KeyValuePair<string, object>>();

        public ObjetoOrdenado Con(string clave, object valor)
        {
            pares.Add(new KeyValuePair<string, object>(clave, valor));
            return this;
        }

        public IEnumerator<KeyValuePair<string, object>> GetEnumerator() { return pares.GetEnumerator(); }
        IEnumerator IEnumerable.GetEnumerator() { return pares.GetEnumerator(); }
    }

    /// <summary>
    /// Lector y escritor JSON minimos, estrictos y acotados (sin dependencias).
    /// Leer devuelve: Dictionary&lt;string,object&gt;, List&lt;object&gt;, string, long, double, bool o null.
    /// Es estricto a proposito (es una superficie de red): sin comas finales, sin comentarios,
    /// sin ceros a la izquierda, sin claves repetidas, sin controles sin escapar en cadenas.
    /// </summary>
    public static class Json
    {
        public const int ProfundidadMaxima = 32;

        public static object Leer(string texto, int maxCaracteres)
        {
            if (texto == null) throw new JsonExcepcion("Texto nulo.");
            if (texto.Length > maxCaracteres) throw new JsonExcepcion("El JSON excede el tamano permitido.");
            LectorJson lector = new LectorJson(texto);
            return lector.LeerDocumento();
        }

        public static string Escribir(object valor)
        {
            StringBuilder sb = new StringBuilder(256);
            EscribirValor(sb, valor, 0);
            return sb.ToString();
        }

        /// <summary>Atajo: Json.Objeto("a", 1, "b", "x") -> {"a":1,"b":"x"}.</summary>
        public static Dictionary<string, object> Objeto(params object[] paresClaveValor)
        {
            if (paresClaveValor.Length % 2 != 0) throw new ArgumentException("Se esperaban pares clave/valor.");
            Dictionary<string, object> d = new Dictionary<string, object>();
            for (int i = 0; i < paresClaveValor.Length; i += 2)
            {
                d[(string)paresClaveValor[i]] = paresClaveValor[i + 1];
            }
            return d;
        }

        private static void EscribirValor(StringBuilder sb, object v, int profundidad)
        {
            if (profundidad > ProfundidadMaxima)
                throw new InvalidOperationException("Estructura demasiado profunda o ciclica.");
            if (v == null) { sb.Append("null"); return; }

            string s = v as string;
            if (s != null) { EscribirCadena(sb, s); return; }
            if (v is bool) { sb.Append((bool)v ? "true" : "false"); return; }

            if (v is int || v is long || v is short || v is byte || v is sbyte || v is uint || v is ushort || v is ulong)
            {
                sb.Append(Convert.ToString(v, CultureInfo.InvariantCulture));
                return;
            }
            if (v is double || v is float)
            {
                double d = Convert.ToDouble(v, CultureInfo.InvariantCulture);
                if (double.IsNaN(d) || double.IsInfinity(d)) { sb.Append("null"); return; }
                sb.Append(d.ToString("R", CultureInfo.InvariantCulture));
                return;
            }
            if (v is decimal)
            {
                sb.Append(((decimal)v).ToString(CultureInfo.InvariantCulture));
                return;
            }

            ObjetoOrdenado ordenado = v as ObjetoOrdenado;
            if (ordenado != null)
            {
                sb.Append('{');
                bool primero = true;
                foreach (KeyValuePair<string, object> par in ordenado)
                {
                    if (!primero) sb.Append(',');
                    primero = false;
                    EscribirCadena(sb, par.Key);
                    sb.Append(':');
                    EscribirValor(sb, par.Value, profundidad + 1);
                }
                sb.Append('}');
                return;
            }

            IDictionary dic = v as IDictionary;
            if (dic != null)
            {
                sb.Append('{');
                bool primero = true;
                foreach (DictionaryEntry e in dic)
                {
                    string clave = e.Key as string;
                    if (clave == null) throw new InvalidOperationException("Las claves de objeto deben ser cadenas.");
                    if (!primero) sb.Append(',');
                    primero = false;
                    EscribirCadena(sb, clave);
                    sb.Append(':');
                    EscribirValor(sb, e.Value, profundidad + 1);
                }
                sb.Append('}');
                return;
            }

            IEnumerable lista = v as IEnumerable;
            if (lista != null)
            {
                sb.Append('[');
                bool primero = true;
                foreach (object item in lista)
                {
                    if (!primero) sb.Append(',');
                    primero = false;
                    EscribirValor(sb, item, profundidad + 1);
                }
                sb.Append(']');
                return;
            }

            throw new InvalidOperationException("Tipo no serializable: " + v.GetType().Name);
        }

        private static void EscribirCadena(StringBuilder sb, string s)
        {
            sb.Append('"');
            for (int i = 0; i < s.Length; i++)
            {
                char c = s[i];
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20 || c == (char)0x2028 || c == (char)0x2029) // se escapan por prudencia (rompen scripts viejos)
                        {
                            sb.Append("\\u");
                            sb.Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                        }
                        else
                        {
                            sb.Append(c);
                        }
                        break;
                }
            }
            sb.Append('"');
        }
    }

    internal sealed class LectorJson
    {
        private readonly string t;
        private int i;

        public LectorJson(string texto)
        {
            t = texto;
        }

        public object LeerDocumento()
        {
            object v = LeerValor(1);
            SaltarEspacios();
            if (i < t.Length) throw Error("Texto sobrante tras el valor.");
            return v;
        }

        private JsonExcepcion Error(string mensaje)
        {
            return new JsonExcepcion(mensaje + " (posicion " + i + ")");
        }

        private void SaltarEspacios()
        {
            while (i < t.Length)
            {
                char c = t[i];
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
                else break;
            }
        }

        private object LeerValor(int profundidad)
        {
            SaltarEspacios();
            if (i >= t.Length) throw Error("Fin inesperado del texto.");
            char c = t[i];
            switch (c)
            {
                case '{': return LeerObjeto(profundidad);
                case '[': return LeerArreglo(profundidad);
                case '"': return LeerCadena();
                case 't': Literal("true"); return true;
                case 'f': Literal("false"); return false;
                case 'n': Literal("null"); return null;
                default:
                    if (c == '-' || (c >= '0' && c <= '9')) return LeerNumero();
                    throw Error("Caracter inesperado '" + (c < 0x20 ? "?" : c.ToString()) + "'.");
            }
        }

        private void Literal(string palabra)
        {
            if (string.CompareOrdinal(t, i, palabra, 0, palabra.Length) != 0) throw Error("Literal invalido.");
            i += palabra.Length;
            // Evita aceptar "truex": tras el literal debe venir un delimitador.
            if (i < t.Length)
            {
                char c = t[i];
                if (!(c == ',' || c == '}' || c == ']' || c == ' ' || c == '\t' || c == '\n' || c == '\r'))
                    throw Error("Literal invalido.");
            }
        }

        private Dictionary<string, object> LeerObjeto(int profundidad)
        {
            if (profundidad > Json.ProfundidadMaxima) throw Error("Profundidad maxima excedida.");
            i++; // {
            Dictionary<string, object> d = new Dictionary<string, object>();
            SaltarEspacios();
            if (i < t.Length && t[i] == '}') { i++; return d; }
            while (true)
            {
                SaltarEspacios();
                if (i >= t.Length || t[i] != '"') throw Error("Se esperaba una clave entre comillas.");
                string clave = LeerCadena();
                if (d.ContainsKey(clave)) throw Error("Clave repetida '" + Corto(clave) + "'.");
                SaltarEspacios();
                if (i >= t.Length || t[i] != ':') throw Error("Se esperaba ':'.");
                i++;
                d[clave] = LeerValor(profundidad + 1);
                SaltarEspacios();
                if (i >= t.Length) throw Error("Objeto sin cerrar.");
                if (t[i] == ',') { i++; continue; }
                if (t[i] == '}') { i++; return d; }
                throw Error("Se esperaba ',' o '}'.");
            }
        }

        private List<object> LeerArreglo(int profundidad)
        {
            if (profundidad > Json.ProfundidadMaxima) throw Error("Profundidad maxima excedida.");
            i++; // [
            List<object> l = new List<object>();
            SaltarEspacios();
            if (i < t.Length && t[i] == ']') { i++; return l; }
            while (true)
            {
                l.Add(LeerValor(profundidad + 1));
                SaltarEspacios();
                if (i >= t.Length) throw Error("Arreglo sin cerrar.");
                if (t[i] == ',') { i++; continue; }
                if (t[i] == ']') { i++; return l; }
                throw Error("Se esperaba ',' o ']'.");
            }
        }

        private string LeerCadena()
        {
            i++; // comilla de apertura
            StringBuilder sb = null;
            int inicio = i;
            while (true)
            {
                if (i >= t.Length) throw Error("Cadena sin cerrar.");
                char c = t[i];
                if (c == '"')
                {
                    string resultado;
                    if (sb == null) resultado = t.Substring(inicio, i - inicio);
                    else { sb.Append(t, inicio, i - inicio); resultado = sb.ToString(); }
                    i++;
                    return resultado;
                }
                if (c < 0x20) throw Error("Caracter de control sin escapar en una cadena.");
                if (c != '\\') { i++; continue; }

                if (sb == null) sb = new StringBuilder();
                sb.Append(t, inicio, i - inicio);
                i++;
                if (i >= t.Length) throw Error("Escape incompleto.");
                char e = t[i];
                i++;
                switch (e)
                {
                    case '"': sb.Append('"'); break;
                    case '\\': sb.Append('\\'); break;
                    case '/': sb.Append('/'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'n': sb.Append('\n'); break;
                    case 'r': sb.Append('\r'); break;
                    case 't': sb.Append('\t'); break;
                    case 'u':
                        if (i + 4 > t.Length) throw Error("Escape \\u incompleto.");
                        int cod = 0;
                        for (int k = 0; k < 4; k++)
                        {
                            int h = Hex(t[i + k]);
                            if (h < 0) throw Error("Escape \\u invalido.");
                            cod = (cod << 4) | h;
                        }
                        i += 4;
                        sb.Append((char)cod);
                        break;
                    default:
                        throw Error("Escape invalido.");
                }
                inicio = i;
            }
        }

        private static int Hex(char c)
        {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            return -1;
        }

        private object LeerNumero()
        {
            int inicio = i;
            bool entero = true;
            if (t[i] == '-') i++;
            if (i >= t.Length) throw Error("Numero incompleto.");
            if (t[i] == '0')
            {
                i++;
                if (i < t.Length && t[i] >= '0' && t[i] <= '9') throw Error("Cero a la izquierda no permitido.");
            }
            else if (t[i] >= '1' && t[i] <= '9')
            {
                while (i < t.Length && t[i] >= '0' && t[i] <= '9') i++;
            }
            else throw Error("Numero invalido.");

            if (i < t.Length && t[i] == '.')
            {
                entero = false;
                i++;
                int d0 = i;
                while (i < t.Length && t[i] >= '0' && t[i] <= '9') i++;
                if (i == d0) throw Error("Fraccion sin digitos.");
            }
            if (i < t.Length && (t[i] == 'e' || t[i] == 'E'))
            {
                entero = false;
                i++;
                if (i < t.Length && (t[i] == '+' || t[i] == '-')) i++;
                int d0 = i;
                while (i < t.Length && t[i] >= '0' && t[i] <= '9') i++;
                if (i == d0) throw Error("Exponente sin digitos.");
            }

            string s = t.Substring(inicio, i - inicio);
            if (entero)
            {
                long l;
                if (long.TryParse(s, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out l)) return l;
            }
            double d;
            if (!double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out d) ||
                double.IsInfinity(d) || double.IsNaN(d))
                throw Error("Numero fuera de rango.");
            return d;
        }

        private static string Corto(string s)
        {
            return s.Length <= 40 ? s : s.Substring(0, 40) + "...";
        }
    }
}
