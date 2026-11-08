// Punto de entrada del puente DENTRO de WorldBox 0.51.2 (cargador oficial de mods):
// worldbox_Data\StreamingAssets\mods\PuenteWorldBox.dll  ->  clase PuenteWorldBox.WorldBoxMod : MonoBehaviour.
// Un solo ensamblado: la biblioteca de W4 (src\*.cs) + esta integracion (integracion\*.cs).
// Todo acceso al juego ocurre en Update() (hilo principal de Unity); los hilos de red solo encolan.
using System;
using System.IO;
using UnityEngine;

namespace PuenteWorldBox
{
    public class WorldBoxMod : MonoBehaviour
    {
        private ServidorPuente servidor;
        private MundoWorldBox mundo;
        private string carpeta;
        private bool fallo;
        private int cuadrosSinMundo;

        private void Awake()
        {
            try
            {
                Application.runInBackground = true; // sin esto, al perder el foco Update() se detiene y la cola no avanza
                carpeta = Application.persistentDataPath;
                ConfiguracionPuente cfg = new ConfiguracionPuente();
                cfg.CarpetaToken = carpeta;
                cfg.NombrePuente = "puente-worldbox-integracion";
                cfg.VersionPuente = "0.2.0";
                cfg.Log = delegate(string s) { Debug.Log("[PuenteWorldBox] " + s); };
                cfg.TiempoAvanceMs = 180000;
                LeerArchivoConfiguracion(cfg);
                servidor = new ServidorPuente(cfg);
                servidor.Iniciar();
                Debug.Log("[PuenteWorldBox] Awake: servidor en 127.0.0.1:" + servidor.Puerto + " (token en " + servidor.RutaArchivoToken + "), hilo=" + System.Threading.Thread.CurrentThread.ManagedThreadId);
            }
            catch (Exception e)
            {
                fallo = true;
                Debug.Log("[PuenteWorldBox] Awake FALLO: " + e.GetType().Name + ": " + e.Message);
            }
        }

        // puente-config.txt (opcional, en persistentDataPath): lineas clave=valor. Claves: puerto.
        private void LeerArchivoConfiguracion(ConfiguracionPuente cfg)
        {
            string ruta = Path.Combine(carpeta, "puente-config.txt");
            if (!File.Exists(ruta)) return;
            foreach (string linea in File.ReadAllLines(ruta))
            {
                string l = linea.Trim();
                if (l.Length == 0 || l[0] == '#') continue;
                int ig = l.IndexOf('=');
                if (ig <= 0) continue;
                string k = l.Substring(0, ig).Trim().ToLowerInvariant();
                string v = l.Substring(ig + 1).Trim();
                int n;
                if (k == "puerto" && int.TryParse(v, out n) && n >= 1024 && n <= 65535) cfg.Puerto = n;
            }
        }

        private void Update()
        {
            if (servidor == null || fallo) return;
            try
            {
                if (mundo == null && Juego.Cargado)
                {
                    cuadrosSinMundo++;
                    if (cuadrosSinMundo > 30) // unos cuadros de margen tras terminar la carga
                    {
                        mundo = new MundoWorldBox(carpeta);
                        servidor.Mundo = mundo;
                        Debug.Log("[PuenteWorldBox] Mundo listo: " + MapBox.width + "x" + MapBox.height + ", " + mundo.Acciones.Todas.Count + " acciones anunciadas.");
                    }
                }
                servidor.Bombear();
                if (mundo != null) mundo.Tick();
            }
            catch (Exception e)
            {
                Debug.Log("[PuenteWorldBox] Update: " + e.GetType().Name + ": " + e.Message);
            }
        }

        private void OnApplicationQuit()
        {
            Cerrar();
        }

        private void OnDestroy()
        {
            Cerrar();
        }

        private void Cerrar()
        {
            try
            {
                if (servidor != null) { servidor.Detener(); servidor = null; }
            }
            catch (Exception) { }
        }
    }
}
