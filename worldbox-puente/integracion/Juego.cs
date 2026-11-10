// Acceso al juego (WorldBox 0.51.2). SOLO desde el hilo principal. Cada nombre usado sale del binario
// (herramientas/worldbox-ensamblado.mjs) y se comprobo en vivo con la sonda (privado/worldbox/pruebas-vivas/).
using System;
using System.Collections.Generic;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace PuenteWorldBox
{
    internal sealed class Sitio
    {
        public int Zx, Zy;
        public WorldTile Centro;
        public int Calidad;      // suma de tiles de suelo de la zona y sus 8 vecinas (max 576)
        public double Distancia; // en zonas, al ancla pedida
    }

    internal static class Juego
    {
        public const int LadoZona = 8; // tiles por lado de una TileZone (Config.CITY_ZONE_SIZE)
        private static MethodInfo actualizarContenedores;

        /// <summary>El mundo existe y no esta cargando ni generando.</summary>
        public static bool Cargado
        {
            get
            {
                return Config.game_loaded && World.world != null && !Config.worldLoading && !SmoothLoader.isLoading() && MapBox.width > 0;
            }
        }

        public static bool Pausado { get { return Config.paused; } }

        public static void Pausar(bool pausa)
        {
            Config.paused = pausa;
        }

        public static double TiempoMundo()
        {
            return World.world.getCurWorldTime();
        }

        public static int ZonasX { get { return MapBox.width / LadoZona; } }
        public static int ZonasY { get { return MapBox.height / LadoZona; } }

        public static TileZone Zona(int zx, int zy)
        {
            if (zx < 0 || zy < 0 || zx >= ZonasX || zy >= ZonasY) return null;
            WorldTile t = World.world.GetTile(zx * LadoZona + LadoZona / 2, zy * LadoZona + LadoZona / 2);
            return t == null ? null : t.zone;
        }

        /// <summary>
        /// Con el juego pausado, reinos/ciudades/poblacion recien creados no aparecen en las listas hasta el
        /// siguiente cuadro de simulacion. Este metodo (privado del juego, comprobado en vivo) actualiza los
        /// contenedores sin dejar correr el tiempo. Si no existe, se lanza NotSupportedException.
        /// </summary>
        public static void Estabilizar()
        {
            if (actualizarContenedores == null)
                actualizarContenedores = typeof(MapBox).GetMethod("updateDirtyMetaContainersAndCleanup",
                    BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            if (actualizarContenedores == null) throw new NotSupportedException("MapBox.updateDirtyMetaContainersAndCleanup no existe en esta version del juego.");
            actualizarContenedores.Invoke(World.world, null);
        }

        // ------------------------------------------------------------------ mapas guardados (fase 0 del formato era)

        /// <summary>
        /// Carpeta de un mapa guardado. Solo dos formas, sin rutas libres: "slotN" (la ranura N de la interfaz del juego,
        /// saves\saveN\) o un nombre [a-z0-9_-]{1,40} (carpeta era-mapas\NOMBRE\ junto a los datos del juego).
        /// Devuelve null si el nombre no tiene esa forma.
        /// </summary>
        public static string RutaMapa(string nombre)
        {
            if (string.IsNullOrEmpty(nombre) || nombre.Length > 40) return null;
            foreach (char c in nombre) { if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-')) return null; }
            string raiz = Application.persistentDataPath;
            if (nombre.StartsWith("slot") && nombre.Length > 4)
            {
                int n;
                if (!int.TryParse(nombre.Substring(4), out n) || n < 1 || n > 9999) return null;
                return System.IO.Path.Combine(System.IO.Path.Combine(raiz, "saves"), "save" + n) + "/";
            }
            return System.IO.Path.Combine(System.IO.Path.Combine(raiz, "era-mapas"), nombre) + "/";
        }

        public static bool MapaExiste(string ruta)
        {
            return System.IO.File.Exists(ruta + "map.wbox") || System.IO.File.Exists(ruta + "map.wbax");
        }

        /// <summary>Carga un mapa guardado con el cargador del propio juego y lo avanza (como Reiniciar con generateNewMap) hasta terminar.</summary>
        public static int CargarMapa(string ruta)
        {
            // MapBox.save_manager es internal: se lee por reflexion; SaveManager.loadWorld(string, bool) es publico.
            FieldInfo campo = typeof(MapBox).GetField("save_manager", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public);
            SaveManager sm = campo == null ? null : campo.GetValue(World.world) as SaveManager;
            if (sm == null) throw new NotSupportedException("MapBox.save_manager no existe en esta version del juego.");
            MethodInfo cargar = typeof(SaveManager).GetMethod("loadWorld", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public, null, new Type[] { typeof(string), typeof(bool) }, null);
            if (cargar == null) throw new NotSupportedException("SaveManager.loadWorld(string,bool) no existe en esta version del juego.");
            try { cargar.Invoke(sm, new object[] { ruta, false }); }
            catch (TargetInvocationException e) { throw new InvalidOperationException("loadWorld fallo: " + (e.InnerException == null ? e.Message : e.InnerException.Message)); }
            int v = 0;
            while ((SmoothLoader.isLoading() || Config.worldLoading) && v < 50000) { SmoothLoader.update(0.5f); v++; }
            if (SmoothLoader.isLoading() || Config.worldLoading) throw new InvalidOperationException("La carga del mapa no termino tras " + v + " pasos del cargador.");
            return v;
        }

        /// <summary>Un mapa guardado puede traer reinos, ciudades y sus habitantes: se quitan para fundar las facciones en terreno limpio.</summary>
        public static void LimpiarCivilizaciones()
        {
            foreach (Kingdom k in new List<Kingdom>(World.world.kingdoms.list))
            {
                foreach (Actor a in new List<Actor>(World.world.units.units_only_alive)) { if (a.kingdom == k) a.dieSimpleNone(); }
                foreach (City c in new List<City>(k.cities)) c.destroyCity();
            }
            Estabilizar();
        }

        public static string Sha256Hex(string texto)
        {
            using (SHA256 h = SHA256.Create())
            {
                byte[] d = h.ComputeHash(Encoding.UTF8.GetBytes(texto));
                StringBuilder sb = new StringBuilder();
                foreach (byte b in d) sb.Append(b.ToString("x2"));
                return sb.ToString();
            }
        }

        public static bool EspecieValida(string id)
        {
            // Fase 0 del formato era: cualquier especie civilizada del juego (ActorAsset.civ, 39 en 0.51.2), no solo las cuatro clasicas.
            if (string.IsNullOrEmpty(id)) return false;
            ActorAsset a = AssetManager.actor_library.dict.ContainsKey(id) ? AssetManager.actor_library.get(id) : null;
            return a != null && a.civ;
        }

        public static Actor Crear(string especie, WorldTile tile)
        {
            // adulto y sapiente: cuenta como poblacion civil y puede fundar una ciudad.
            return World.world.units.createNewUnit(especie, tile, false, 0f, null, null, true, true, false, true);
        }

        /// <summary>Tile transitable de suelo mas cercano al centro (orden determinista), en la misma isla.</summary>
        public static List<WorldTile> TilesLibresAlrededor(WorldTile centro, int cuantos, int radioMax)
        {
            List<WorldTile> res = new List<WorldTile>();
            for (int r = 1; r <= radioMax && res.Count < cuantos; r++)
            {
                for (int dy = -r; dy <= r && res.Count < cuantos; dy++)
                {
                    for (int dx = -r; dx <= r && res.Count < cuantos; dx++)
                    {
                        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
                        WorldTile t = World.world.GetTile(centro.x + dx, centro.y + dy);
                        if (t == null) continue;
                        if (!t.Type.ground || t.Type.liquid || t.Type.mountains || t.Type.block) continue;
                        if (t.building != null) continue;
                        if (!t.isSameIsland(centro)) continue;
                        res.Add(t);
                    }
                }
            }
            return res;
        }

        public static int CalidadSitio(int zx, int zy)
        {
            int suma = 0;
            for (int dx = -1; dx <= 1; dx++)
            {
                for (int dy = -1; dy <= 1; dy++)
                {
                    TileZone z = Zona(zx + dx, zy + dy);
                    if (z != null) suma += z.tiles_with_ground;
                }
            }
            return suma;
        }

        /// <summary>Anclas simetricas (fracciones del mapa) para 2, 3 o 4 facciones.</summary>
        public static double[][] Anclas(int n)
        {
            if (n == 2) return new double[][] { new double[] { 0.25, 0.5 }, new double[] { 0.75, 0.5 } };
            if (n == 3) return new double[][] { new double[] { 0.5, 0.25 }, new double[] { 0.25, 0.75 }, new double[] { 0.75, 0.75 } };
            return new double[][] { new double[] { 0.25, 0.25 }, new double[] { 0.75, 0.25 }, new double[] { 0.25, 0.75 }, new double[] { 0.75, 0.75 } };
        }

        /// <summary>
        /// Para cada ancla, la zona mas cercana que el propio juego considera buena para fundar una ciudad
        /// (TileZone.isGoodForNewCity(actor muestra de esa especie)), con calidad minima y en la misma isla.
        /// Devuelve null en la posicion i si no hay sitio para esa faccion.
        /// </summary>
        public static Sitio[] ElegirSitios(Actor[] muestras, int calidadMinima)
        {
            int n = muestras.Length;
            double[][] anclas = Anclas(n);
            Sitio[] sitios = new Sitio[n];
            int zxN = ZonasX, zyN = ZonasY;
            int radioMax = Math.Max(zxN, zyN) / 3;
            int sepMin = Math.Max(4, Math.Min(zxN, zyN) / 4);
            for (int i = 0; i < n; i++)
            {
                int ax = (int)Math.Round(anclas[i][0] * zxN - 0.5);
                int ay = (int)Math.Round(anclas[i][1] * zyN - 0.5);
                for (int r = 0; r <= radioMax && sitios[i] == null; r++)
                {
                    Sitio mejor = null;
                    for (int dy = -r; dy <= r; dy++)
                    {
                        for (int dx = -r; dx <= r; dx++)
                        {
                            if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
                            int zx = ax + dx, zy = ay + dy;
                            TileZone z = Zona(zx, zy);
                            if (z == null || z.centerTile == null) continue;
                            if (!z.isGoodForNewCity(muestras[i])) continue;
                            int q = CalidadSitio(zx, zy);
                            if (q < calidadMinima) continue;
                            bool ok = true;
                            for (int j = 0; j < i && ok; j++)
                            {
                                if (sitios[j] == null) continue;
                                if (Math.Max(Math.Abs(sitios[j].Zx - zx), Math.Abs(sitios[j].Zy - zy)) < sepMin) ok = false;
                                else if (!sitios[j].Centro.isSameIsland(z.centerTile)) ok = false;
                            }
                            if (!ok) continue;
                            if (mejor == null || q > mejor.Calidad)
                            {
                                mejor = new Sitio();
                                mejor.Zx = zx; mejor.Zy = zy; mejor.Centro = z.centerTile; mejor.Calidad = q;
                                mejor.Distancia = Math.Sqrt((double)(dx * dx + dy * dy));
                            }
                        }
                    }
                    sitios[i] = mejor;
                }
            }
            return sitios;
        }

        // ------------------------------------------------------------------ metricas de un reino

        public static readonly string[] RecursosContados = new string[] { "wood", "stone", "gold", "common_metals" };

        public static int Recursos(Kingdom k)
        {
            int total = 0;
            foreach (City c in k.cities)
            {
                foreach (string id in RecursosContados) total += c.getResourcesAmount(id);
            }
            return total;
        }

        public static bool TieneEstado(Actor a, string id)
        {
            foreach (object o in (System.Collections.IEnumerable)a.getStatusesIds()) { if ((string)o == id) return true; }
            return false;
        }

        public static bool Vivo(Kingdom k)
        {
            return k != null && k.isAlive() && k.getPopulationPeople() > 0;
        }

        /// <summary>Salud media (0..100) de las unidades vivas del reino; 0 si no tiene.</summary>
        public static int SaludMediaPct(Kingdom k)
        {
            double suma = 0; int n = 0;
            List<Actor> todas = World.world.units.units_only_alive;
            for (int i = 0; i < todas.Count; i++)
            {
                Actor a = todas[i];
                if (a.kingdom != k) continue;
                suma += a.getHealthRatio();
                n++;
            }
            return n == 0 ? 0 : (int)Math.Round(100.0 * suma / n);
        }
    }
}

