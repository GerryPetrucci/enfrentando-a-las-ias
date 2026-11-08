using System;
using System.Security.Cryptography;
using System.Text;

namespace PuenteWorldBox
{
    public static class Seguridad
    {
        /// <summary>32 bytes aleatorios del generador criptografico del sistema, en hexadecimal (64 caracteres).</summary>
        public static string GenerarToken()
        {
            byte[] bytes = new byte[32];
            using (RNGCryptoServiceProvider rng = new RNGCryptoServiceProvider())
            {
                rng.GetBytes(bytes);
            }
            return Hex(bytes);
        }

        public static string Hex(byte[] bytes)
        {
            char[] c = new char[bytes.Length * 2];
            const string d = "0123456789abcdef";
            for (int i = 0; i < bytes.Length; i++)
            {
                c[2 * i] = d[bytes[i] >> 4];
                c[2 * i + 1] = d[bytes[i] & 15];
            }
            return new string(c);
        }

        /// <summary>
        /// Comparacion de tiempo constante respecto al contenido (recorre siempre la longitud del
        /// valor esperado). La longitud del token no es secreta.
        /// </summary>
        public static bool IgualesTiempoConstante(string esperado, string recibido)
        {
            if (esperado == null || recibido == null) return false;
            byte[] a = Encoding.UTF8.GetBytes(esperado);
            byte[] b = Encoding.UTF8.GetBytes(recibido);
            int diff = a.Length ^ b.Length;
            for (int i = 0; i < a.Length; i++)
            {
                int y = i < b.Length ? b[i] : 0;
                diff |= a[i] ^ y;
            }
            return diff == 0 && a.Length > 0;
        }

        internal static string Sha256Hex(byte[] datos)
        {
            using (SHA256 sha = SHA256.Create())
            {
                return Hex(sha.ComputeHash(datos));
            }
        }
    }
}
