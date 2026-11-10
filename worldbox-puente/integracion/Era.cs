// Formato «era» (E2): constructor de escenario simetrico, muro, biomas, minerales, rasgos de facciones, leyes y edades.
// SOLO desde el hilo principal (ServidorPuente.Bombear). Cada nombre del juego sale del binario y se comprobo en vivo con la sonda de
// desarrollo (privado/worldbox/era-fase0/e2/). Todo es ADITIVO: sin `opciones.era` ni las rutas /v1/era/* el puente se comporta como antes.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Reflection;
using System.Text;
using UnityEngine;

namespace PuenteWorldBox
{
    internal sealed class MineralPedido
    {
        public string Faccion;
        public string Mineral;
        public int Cantidad;
        public int Radio;
    }

    /// <summary>Lo que pide `opciones.era` (validado en la forma; los ids se validan contra las listas de EraJuego).</summary>
    internal sealed class EraConfig
    {
        public bool Espejo;
        public int MuroAncho;                       // 0 = sin muro
        public string MuroTipo = "mountains";
        public bool LimpiarFauna = true;
        public bool IgualarArranque = true;
        public bool ContarDerivados = true;
        public bool UnicoReino = true;               // E9: un solo reino por civilizacion (reune de inmediato los derivados). `unico_reino:false` lo apaga (pruebas)
        public bool Vigilante = true;                // E9: vigilante del muro (devuelve/elimina las unidades que quedan del lado contrario o sobre el muro)
        public string VigilanteModo = "devolver";    // devolver | eliminar | observar (solo cuenta)
        public float VigilanteIntervalo = 0.25f;     // segundos reales entre revisiones (0.1 a 10)
        public Dictionary<string, string> Biomas = new Dictionary<string, string>();   // faccion -> biome_*
        public List<MineralPedido> Minerales = new List<MineralPedido>();
        public Dictionary<string, bool> Leyes = new Dictionary<string, bool>();
        public Dictionary<string, PresentacionFaccion> Presentacion = new Dictionary<string, PresentacionFaccion>();   // E10: faccion -> color y nombre del reino (opciones.era.facciones)
        public bool MapaReinos = true;               // E10: con color/nombre de reino, enciende la capa de mapa «reinos» del juego (si no, el mapa muestra ciudades y el color no se ve)
        public string Edad;                        // age_*
        public bool PausarEdades;
        public int MaxRasgosPorTipo = EraJuego.MaxRasgosPorTipoPorDefecto;

        private static ErrorPuente Mal(string m) { return new ErrorPuente(Codigos.SolicitudInvalida, m); }

        private static bool Booleano(IDictionary<string, object> d, string clave, bool porDefecto)
        {
            object v;
            if (!d.TryGetValue(clave, out v) || v == null) return porDefecto;
            if (!(v is bool)) throw Mal("'opciones.era." + clave + "' debe ser booleano.");
            return (bool)v;
        }

        private static int Entero(IDictionary<string, object> d, string clave, int porDefecto, int min, int max)
        {
            object v;
            if (!d.TryGetValue(clave, out v) || v == null) return porDefecto;
            if (!(v is long)) throw Mal("'" + clave + "' debe ser un entero.");
            long n = (long)v;
            if (n < min || n > max) throw Mal("'" + clave + "' fuera de rango " + min + ".." + max + ".");
            return (int)n;
        }

        private static string Texto(IDictionary<string, object> d, string clave)
        {
            object v;
            if (!d.TryGetValue(clave, out v) || v == null) return null;
            string t = v as string;
            if (t == null || t.Length == 0 || t.Length > 60) throw Mal("'" + clave + "' debe ser texto de 1 a 60 caracteres.");
            return t;
        }

        public static EraConfig Leer(IDictionary<string, object> d, IList<string> idsFaccion)
        {
            EraConfig c = new EraConfig();
            c.Espejo = Booleano(d, "espejo", false);
            c.LimpiarFauna = Booleano(d, "limpiar_fauna", true);
            c.IgualarArranque = Booleano(d, "igualar_arranque", true);
            c.ContarDerivados = Booleano(d, "contar_derivados", true);
            ControlEraConfig ctl = ControlEraConfig.Leer(d);
            c.UnicoReino = ctl.UnicoReino; c.Vigilante = ctl.Vigilante; c.VigilanteModo = ctl.Modo; c.VigilanteIntervalo = ctl.Intervalo;
            c.PausarEdades = Booleano(d, "pausar_edades", false);
            c.MaxRasgosPorTipo = Entero(d, "max_rasgos_por_tipo", EraJuego.MaxRasgosPorTipoPorDefecto, 1, EraJuego.MaxRasgosPorTipoAbsoluto);
            object v;
            if (d.TryGetValue("muro", out v) && v != null)
            {
                Dictionary<string, object> m = v as Dictionary<string, object>;
                if (m == null) throw Mal("'opciones.era.muro' debe ser un objeto {ancho}.");
                c.MuroAncho = Entero(m, "ancho", 4, 2, EraJuego.MuroAnchoMaximo);
                string tipo = Texto(m, "tipo");
                if (tipo != null)
                {
                    if (Array.IndexOf(EraJuego.TiposDeMuro, tipo) < 0) throw Mal("'opciones.era.muro.tipo' debe ser uno de: " + string.Join(", ", EraJuego.TiposDeMuro) + ".");
                    c.MuroTipo = tipo;
                }
            }
            if (d.TryGetValue("biomas", out v) && v != null)
            {
                Dictionary<string, object> b = v as Dictionary<string, object>;
                if (b == null) throw Mal("'opciones.era.biomas' debe ser un objeto {faccion: bioma}.");
                foreach (KeyValuePair<string, object> kv in b)
                {
                    if (idsFaccion.IndexOf(kv.Key) < 0) throw Mal("'opciones.era.biomas': faccion desconocida '" + kv.Key + "'.");
                    string id = kv.Value as string;
                    if (id == null || Array.IndexOf(EraJuego.BiomasPermitidos, id) < 0) throw Mal("'opciones.era.biomas." + kv.Key + "' no es un bioma ofrecido (ver /v1/era/catalogo).");
                    c.Biomas[kv.Key] = id;
                }
            }
            if (d.TryGetValue("minerales", out v) && v != null)
            {
                List<object> l = v as List<object>;
                if (l == null || l.Count > 8) throw Mal("'opciones.era.minerales' debe ser un arreglo de 0 a 8 objetos.");
                foreach (object o in l)
                {
                    Dictionary<string, object> m = o as Dictionary<string, object>;
                    if (m == null) throw Mal("Cada entrada de 'opciones.era.minerales' debe ser un objeto.");
                    MineralPedido p = new MineralPedido();
                    p.Faccion = Texto(m, "faccion");
                    p.Mineral = Texto(m, "mineral");
                    if (p.Faccion == null || idsFaccion.IndexOf(p.Faccion) < 0) throw Mal("'opciones.era.minerales[].faccion' desconocida.");
                    if (p.Mineral == null || Array.IndexOf(EraJuego.MineralesPermitidos, p.Mineral) < 0) throw Mal("'opciones.era.minerales[].mineral' debe ser uno de: " + string.Join(", ", EraJuego.MineralesPermitidos) + ".");
                    p.Cantidad = Entero(m, "cantidad", 4, 1, EraJuego.MaxDepositosPorPedido);
                    p.Radio = Entero(m, "radio", 12, 4, 30);
                    c.Minerales.Add(p);
                }
            }
            if (d.TryGetValue("leyes", out v) && v != null)
            {
                Dictionary<string, object> l = v as Dictionary<string, object>;
                if (l == null) throw Mal("'opciones.era.leyes' debe ser un objeto {ley: booleano}.");
                foreach (KeyValuePair<string, object> kv in l)
                {
                    if (Array.IndexOf(EraJuego.LeyesPermitidas, kv.Key) < 0) throw Mal("'opciones.era.leyes': ley no permitida '" + kv.Key + "'.");
                    if (!(kv.Value is bool)) throw Mal("'opciones.era.leyes." + kv.Key + "' debe ser booleano.");
                    c.Leyes[kv.Key] = (bool)kv.Value;
                }
            }
            if (d.TryGetValue("facciones", out v) && v != null) c.Presentacion = PresentacionEra.Leer(v, idsFaccion);
            c.MapaReinos = Booleano(d, "mapa_reinos", true);
            c.Edad = Texto(d, "edad");
            if (c.Edad != null && Array.IndexOf(EraJuego.EdadesPermitidas, c.Edad) < 0) throw Mal("'opciones.era.edad' debe ser una de: " + string.Join(", ", EraJuego.EdadesPermitidas) + ".");
            if ((c.Biomas.Count > 0 || c.MuroAncho > 0 || c.Minerales.Count > 0) && !c.Espejo)
                throw Mal("'opciones.era' con biomas, muro o minerales exige espejo:true (mundo simetrico).");
            if (c.Espejo && idsFaccion.Count != 2) throw Mal("'opciones.era.espejo' exige exactamente 2 facciones.");
            return c;
        }
    }

    /// <summary>Reflexion con cache: varios miembros del juego no son publicos en el ensamblado (se encontraron con la sonda).</summary>
    internal static class R
    {
        private const BindingFlags Todo = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.FlattenHierarchy;

        public static object Get(object o, string nombre)
        {
            if (o == null) return null;
            for (Type t = o.GetType(); t != null; t = t.BaseType)
            {
                FieldInfo f = t.GetField(nombre, Todo | BindingFlags.DeclaredOnly);
                if (f != null) return f.GetValue(f.IsStatic ? null : o);
                PropertyInfo p = t.GetProperty(nombre, Todo | BindingFlags.DeclaredOnly);
                if (p != null && p.GetIndexParameters().Length == 0) return p.GetGetMethod(true).Invoke(p.GetGetMethod(true).IsStatic ? null : o, null);
            }
            throw new MissingMemberException(o.GetType().Name + "." + nombre);
        }

        public static void Set(object o, string nombre, object valor)
        {
            for (Type t = o.GetType(); t != null; t = t.BaseType)
            {
                FieldInfo f = t.GetField(nombre, Todo | BindingFlags.DeclaredOnly);
                if (f != null) { f.SetValue(f.IsStatic ? null : o, valor); return; }
                PropertyInfo p = t.GetProperty(nombre, Todo | BindingFlags.DeclaredOnly);
                if (p != null) { p.GetSetMethod(true).Invoke(p.GetSetMethod(true).IsStatic ? null : o, new object[] { valor }); return; }
            }
            throw new MissingMemberException(o.GetType().Name + "." + nombre);
        }

        public static object Call(object o, string nombre, params object[] args)
        {
            for (Type t = o.GetType(); t != null; t = t.BaseType)
            {
                foreach (MethodInfo m in t.GetMethods(Todo | BindingFlags.DeclaredOnly))
                {
                    if (m.Name != nombre || m.IsGenericMethodDefinition) continue;
                    ParameterInfo[] ps = m.GetParameters();
                    if (ps.Length != args.Length) continue;
                    bool ok = true;
                    for (int i = 0; i < ps.Length && ok; i++)
                    {
                        if (args[i] == null) { if (ps[i].ParameterType.IsValueType) ok = false; }
                        else if (!ps[i].ParameterType.IsInstanceOfType(args[i])) ok = false;
                    }
                    if (!ok) continue;
                    try { return m.Invoke(m.IsStatic ? null : o, args); }
                    catch (TargetInvocationException e) { throw e.InnerException ?? e; }
                }
            }
            throw new MissingMethodException(o.GetType().Name + "." + nombre + "/" + args.Length);
        }
    }

    internal sealed class ItemFlora
    {
        public string Asset;
        public string Tipo;     // type_tree | type_mineral | ...
        public int X, Y;
    }

    internal static class EraJuego
    {
        public const int MaxRasgosPorTipoPorDefecto = 6;
        public const int MaxRasgosPorTipoAbsoluto = 12;
        public const int MaxRasgosPorLlamada = 12;
        public const int MuroAnchoMaximo = 16;
        public const int MaxDepositosPorPedido = 24;

        public static readonly string[] TiposDeMuro = new string[] { "mountains" };
        public static readonly string[] MineralesPermitidos = new string[] { "mineral_stone", "mineral_metals", "mineral_silver", "mineral_gold", "mineral_gems", "mineral_mythril", "mineral_adamantine", "mineral_bones" };

        // Biomas que el catalogo ofrece: los 21 que un jugador puede pintar y que no son criaturas que se propagan solas
        // (se excluyen biomass, tumor, pumpkin, cybertile; singularity y paradox son biomas de eventos).
        public static readonly string[] BiomasPermitidos = new string[] {
            "biome_grass", "biome_savanna", "biome_jungle", "biome_desert", "biome_lemon", "biome_permafrost", "biome_swamp", "biome_crystal",
            "biome_enchanted", "biome_corrupted", "biome_infernal", "biome_candy", "biome_mushroom", "biome_wasteland", "biome_birch", "biome_maple",
            "biome_rocklands", "biome_garlic", "biome_flower", "biome_celestial", "biome_clover" };

        // Leyes del mundo que el formato puede fijar (las 13 probadas en E1 + las que cambian el arranque).
        public static readonly string[] LeyesPermitidas = new string[] {
            "world_law_rebellions", "world_law_diplomacy", "world_law_disasters_nature", "world_law_disasters_other", "world_law_civ_army",
            "world_law_kingdom_expansion", "world_law_hunger", "world_law_old_age", "world_law_civ_migrants", "world_law_civ_babies",
            "world_law_border_stealing", "world_law_evolution_events", "world_law_animals_spawn", "world_law_grow_minerals", "world_law_rites",
            "world_law_biome_overgrowth", "world_law_grow_grass", "world_law_terramorphing", "world_law_erosion", "world_law_angry_civilians" };

        public static readonly string[] EdadesPermitidas = new string[] {
            "age_hope", "age_sun", "age_dark", "age_tears", "age_moon", "age_chaos", "age_wonders", "age_ice", "age_ash", "age_despair" };

        // Grupos de rasgos que NO se ofrecen a un modelo: cambian la especie o rompen la comparacion (E2-entrega, seccion 3).
        public static bool GrupoOfrecible(string tipo, string grupo)
        {
            if (grupo == "special" || grupo == "fate" || grupo == "chaos") return false;
            if (tipo == "subespecie" && (grupo == "rebirth" || grupo == "mutations" || grupo == "reproductive_methods" || grupo == "reproduction_strategy")) return false;
            if (tipo == "religion" && (grupo == "destruction" || grupo == "the_void" || grupo == "necromancy")) return false;
            return true;
        }

        // Rasgos que el juego NO acepto al aplicarlos en vivo (E2: addTrait no los dejo en la cultura aunque el catalogo los da por asignables).
        public static bool RechazadoPorElJuego(string tipo, string id)
        {
            if (tipo != "cultura") return false;
            return id == "bow_lovers" || id == "axe_lovers" || id == "attentive_readers" || id == "armorsmith_mastery" || id == "animal_whisperers" || id == "ancestors_knowledge";
        }

        public static readonly string[] Tipos = new string[] { "reino", "cultura", "idioma", "clan", "subespecie", "religion" };

        // ------------------------------------------------------------------------------- terreno
        private static long Clave(int x, int y) { return (long)x * 100000 + y; }

        public static bool EsSuelo(WorldTile t)
        {
            return t != null && t.Type.ground && !t.Type.liquid && !t.Type.block && !t.Type.mountains;
        }

        /// <summary>Copia el terreno (tipo principal y superior) de la mitad izquierda sobre la derecha. Devuelve cuantas casillas se cambiaron.</summary>
        public static int EspejarTerreno()
        {
            int w = MapBox.width, h = MapBox.height, n = 0;
            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w / 2; x++)
                {
                    WorldTile a = World.world.GetTile(x, y), b = World.world.GetTile(w - 1 - x, y);
                    if (a == null || b == null) continue;
                    if (b.main_type != a.main_type) { MapAction.terraformMain(b, a.main_type, false); n++; }
                    if (b.top_type != a.top_type)
                    {
                        if (a.top_type != null) MapAction.terraformTop(b, a.top_type, false);
                        else { try { b.setTopTileType(null, true); } catch (Exception) { } }
                    }
                }
            }
            return n;
        }

        public static int DiferenciasEspejo()
        {
            int w = MapBox.width, h = MapBox.height, d = 0;
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w / 2; x++)
                {
                    WorldTile a = World.world.GetTile(x, y), b = World.world.GetTile(w - 1 - x, y);
                    if (a.main_type != b.main_type || a.top_type != b.top_type) d++;
                }
            return d;
        }

        /// <summary>Pinta con un bioma las casillas de suelo (soil_low/soil_high) de las columnas x0..x1. Devuelve cuantas casillas se pintaron.</summary>
        public static int PintarBioma(int x0, int x1, string biomaId)
        {
            BiomeAsset b = AssetManager.biome_library.get(biomaId);
            if (b == null) throw new ErrorPuente(Codigos.SolicitudInvalida, "Bioma desconocido: " + biomaId + ".");
            TopTileType bajo = AssetManager.top_tiles.get(b.tile_low), alto = AssetManager.top_tiles.get(b.tile_high);
            if (bajo == null || alto == null) throw new ErrorPuente(Codigos.NoSoportado, "El bioma " + biomaId + " no tiene casillas de suelo propias.");
            int h = MapBox.height, n = 0;
            for (int x = Math.Max(0, x0); x <= Math.Min(MapBox.width - 1, x1); x++)
            {
                for (int y = 0; y < h; y++)
                {
                    WorldTile t = World.world.GetTile(x, y);
                    if (t == null) continue;
                    string id = t.main_type == null ? "" : t.main_type.id;
                    if (id == "soil_low") { if (t.top_type != bajo) MapAction.terraformTop(t, bajo, false); n++; }
                    else if (id == "soil_high") { if (t.top_type != alto) MapAction.terraformTop(t, alto, false); n++; }
                }
            }
            return n;
        }

        /// <summary>
        /// Compatibilidad especie x bioma medida con el propio juego: pinta una zona de suelo con cada bioma y pregunta a TileZone.isGoodForNewCity
        /// (y checkCanSettleInThisBiomes) con un habitante de cada especie civilizada. Restaura la zona al terminar.
        /// Devuelve especie -> {fundar:[biomas], asentar:[biomas]}.
        /// </summary>
        public static Dictionary<string, object> Compatibilidad()
        {
            Dictionary<string, object> res = new Dictionary<string, object>();
            // zona de prueba: la zona con mas suelo plano (soil) de la mitad izquierda, lejos del muro
            TileZone mejor = null; int mejorN = -1;
            for (int zx = 1; zx < Juego.ZonasX / 2 - 3; zx++)
                for (int zy = 1; zy < Juego.ZonasY - 1; zy++)
                {
                    TileZone z = Juego.Zona(zx, zy);
                    if (z == null) continue;
                    int n = 0;
                    for (int dx = 0; dx < Juego.LadoZona; dx++) for (int dy = 0; dy < Juego.LadoZona; dy++)
                    { WorldTile t = World.world.GetTile(zx * Juego.LadoZona + dx, zy * Juego.LadoZona + dy); if (t != null && t.main_type != null && (t.main_type.id == "soil_low" || t.main_type.id == "soil_high") && t.building == null) n++; }
                    if (n > mejorN) { mejorN = n; mejor = z; }
                }
            if (mejor == null) throw new ErrorPuente(Codigos.NoListo, "No hay una zona de suelo para medir.");
            int cx = mejor.x * Juego.LadoZona, cy = mejor.y * Juego.LadoZona;
            List<WorldTile> tiles = new List<WorldTile>();
            for (int dx = 0; dx < Juego.LadoZona; dx++) for (int dy = 0; dy < Juego.LadoZona; dy++) tiles.Add(World.world.GetTile(cx + dx, cy + dy));
            List<TopTileType> original = new List<TopTileType>();
            foreach (WorldTile t in tiles) original.Add(t.top_type);
            List<Actor> muestras = new List<Actor>();
            List<string> ids = new List<string>();
            WorldTile lejos = World.world.GetTile(MapBox.width / 2, MapBox.height / 2);
            foreach (ActorAsset a in AssetManager.actor_library.list)
            {
                if (!a.civ) continue;
                Actor u = null;
                try { u = Juego.Crear(a.id, lejos); } catch (Exception) { }
                if (u == null) continue;
                muestras.Add(u); ids.Add(a.id);
            }
            Dictionary<string, List<object>> fundar = new Dictionary<string, List<object>>(), asentar = new Dictionary<string, List<object>>();
            foreach (string id in ids) { fundar[id] = new List<object>(); asentar[id] = new List<object>(); }
            try
            {
                foreach (string bio in BiomasPermitidos)
                {
                    BiomeAsset b = AssetManager.biome_library.get(bio);
                    TopTileType bajo = AssetManager.top_tiles.get(b.tile_low), alto = AssetManager.top_tiles.get(b.tile_high);
                    foreach (WorldTile t in tiles)
                    {
                        string mid = t.main_type == null ? "" : t.main_type.id;
                        if (mid == "soil_low") MapAction.terraformTop(t, bajo, false);
                        else if (mid == "soil_high") MapAction.terraformTop(t, alto, false);
                    }
                    for (int i = 0; i < muestras.Count; i++)
                    {
                        Subspecies sub = muestras[i].subspecies;
                        if (sub != null && mejor.checkCanSettleInThisBiomes(sub)) asentar[ids[i]].Add(bio);
                        if (mejor.isGoodForNewCity(muestras[i])) fundar[ids[i]].Add(bio);
                    }
                }
            }
            finally
            {
                for (int i = 0; i < tiles.Count; i++)
                {
                    if (original[i] != null) MapAction.terraformTop(tiles[i], original[i], false);
                    else { try { tiles[i].setTopTileType(null, true); } catch (Exception) { } }
                }
                foreach (Actor u in muestras) { try { u.dieSimpleNone(); } catch (Exception) { } }
            }
            foreach (string id in ids) res[id] = Json.Objeto("fundar", fundar[id], "asentar", asentar[id]);
            return res;
        }

        // ------------------------------------------------------------------------------- muro
        private static readonly Dictionary<long, TileType> muroMain = new Dictionary<long, TileType>();
        private static readonly Dictionary<long, TopTileType> muroTop = new Dictionary<long, TopTileType>();
        public static int MuroX0 = -1, MuroX1 = -1;
        private static TileType muroTipoPuesto;
        public static bool MuroPuesto { get { return muroMain.Count > 0; } }

        /// <summary>Huella del terreno (tipo principal y superior de cada casilla) de las columnas FUERA de x0..x1; prueba que quitar el muro no toca el resto del mapa.</summary>
        public static string HuellaFuera(int x0, int x1)
        {
            StringBuilder sb = new StringBuilder();
            for (int y = 0; y < MapBox.height; y++)
                for (int x = 0; x < MapBox.width; x++)
                {
                    if (x >= x0 && x <= x1) continue;
                    WorldTile t = World.world.GetTile(x, y);
                    sb.Append(t.main_type == null ? "-" : t.main_type.id).Append('/').Append(t.top_type == null ? "-" : t.top_type.id).Append(',');
                }
            return Juego.Sha256Hex(sb.ToString());
        }

        public static string HuellaDelMuro { get; private set; }

        public static int PonerMuro(int ancho, string tipo)
        {
            if (MuroPuesto) QuitarMuro();
            int w = MapBox.width;
            if ((w - ancho) % 2 != 0) throw new ErrorPuente(Codigos.SolicitudInvalida, "El ancho del muro debe tener la misma paridad que el ancho del mapa (" + w + ") para quedar centrado.");
            int x0 = (w - ancho) / 2, x1 = x0 + ancho - 1;
            TileType tt = AssetManager.tiles.get(tipo);
            if (tt == null) throw new ErrorPuente(Codigos.SolicitudInvalida, "Tipo de muro desconocido: " + tipo + ".");
            int n = 0;
            for (int x = x0; x <= x1; x++)
                for (int y = 0; y < MapBox.height; y++)
                {
                    WorldTile t = World.world.GetTile(x, y);
                    if (t == null) continue;
                    long k = Clave(x, y);
                    if (!muroMain.ContainsKey(k)) { muroMain[k] = t.main_type; muroTop[k] = t.top_type; }
                    MapAction.terraformMain(t, tt, false);
                    n++;
                }
            MuroX0 = x0; MuroX1 = x1; muroTipoPuesto = tt;
            return n;
        }

        /// <summary>E9: vuelve a poner el tipo del muro en toda casilla que lo haya perdido (tipo principal distinto o superior encima) y devuelve cuantas arreglo. No altera lo que QuitarMuro restaura.</summary>
        public static int MuroReparar()
        {
            if (!MuroPuesto || muroTipoPuesto == null) return 0;
            int n = 0;
            foreach (KeyValuePair<long, TileType> kv in muroMain)
            {
                WorldTile t = World.world.GetTile((int)(kv.Key / 100000), (int)(kv.Key % 100000));
                if (t == null) continue;
                bool mal = t.main_type != muroTipoPuesto;
                if (mal) { try { MapAction.terraformMain(t, muroTipoPuesto, false); } catch (Exception) { } }
                if (t.top_type != null) { mal = true; try { t.setTopTileType(null, true); } catch (Exception) { } }
                if (mal) n++;
            }
            return n;
        }

        /// <summary>Casillas del muro cuyo tipo efectivo ya no bloquea (para el estado y las pruebas).</summary>
        public static int MuroCasillasRotas()
        {
            if (!MuroPuesto) return 0;
            int n = 0;
            foreach (KeyValuePair<long, TileType> kv in muroMain)
            {
                WorldTile t = World.world.GetTile((int)(kv.Key / 100000), (int)(kv.Key % 100000));
                if (t == null || t.main_type != muroTipoPuesto || t.top_type != null) n++;
            }
            return n;
        }

        /// <summary>Olvida el muro sin tocar el terreno (al generar o cargar un mapa nuevo las casillas ya no son las guardadas).</summary>
        public static void OlvidarMuro()
        {
            muroMain.Clear(); muroTop.Clear(); MuroX0 = -1; MuroX1 = -1; muroTipoPuesto = null;
        }

        /// <summary>Restaura el tipo principal y superior de cada casilla del muro. No devuelve la vegetacion que el muro haya borrado.</summary>
        public static int QuitarMuro()
        {
            string antes = MuroPuesto ? HuellaFuera(MuroX0, MuroX1) : null;
            int x0q = MuroX0, x1q = MuroX1;
            int n = 0;
            foreach (KeyValuePair<long, TileType> kv in muroMain)
            {
                WorldTile t = World.world.GetTile((int)(kv.Key / 100000), (int)(kv.Key % 100000));
                if (t == null) continue;
                MapAction.terraformMain(t, kv.Value, false);
                TopTileType tp;
                if (muroTop.TryGetValue(kv.Key, out tp) && tp != null) MapAction.terraformTop(t, tp, false);
                n++;
            }
            muroMain.Clear(); muroTop.Clear();
            MuroX0 = -1; MuroX1 = -1; muroTipoPuesto = null;
            HuellaDelMuro = antes == null ? null : (antes == HuellaFuera(x0q, x1q) ? "identica" : "distinta");
            return n;
        }

        // ------------------------------------------------------------------------------- flora, minerales, fauna
        public static BuildingAsset AssetDe(Building b)
        {
            return b == null ? null : R.Get(b, "asset") as BuildingAsset;
        }

        public static bool Quitandose(Building b)
        {
            return (bool)R.Call(b, "isRemoved") || (bool)R.Call(b, "isOnRemove");
        }

        public static bool EsNatural(Building b)
        {
            BuildingAsset a = AssetDe(b);
            if (a == null) return false;
            if (a.type == "type_mineral") return true;
            return a.is_vegetation;
        }

        public static List<ItemFlora> InstantaneaFlora()
        {
            List<ItemFlora> l = new List<ItemFlora>();
            List<Building> todos = World.world.buildings.getSimpleList();
            for (int i = 0; i < todos.Count; i++)
            {
                Building b = todos[i];
                if (!EsNatural(b) || b.current_tile == null || Quitandose(b)) continue;
                BuildingAsset ba = AssetDe(b);
                ItemFlora f = new ItemFlora();
                f.Asset = ba.id; f.Tipo = ba.type; f.X = b.current_tile.x; f.Y = b.current_tile.y;
                l.Add(f);
            }
            return l;
        }

        public static void QuitarFlora()
        {
            List<Building> todos = new List<Building>(World.world.buildings.getSimpleList());
            for (int i = 0; i < todos.Count; i++)
            {
                Building b = todos[i];
                if (!EsNatural(b) || Quitandose(b)) continue;
                try { R.Call(b, "startRemove"); } catch (Exception) { }
            }
        }

        private static List<string> Pot(BiomeAsset b, string tipoEdificio)
        {
            if (b == null) return null;
            if (tipoEdificio == "type_mineral") return b.pot_minerals_spawn;
            if (tipoEdificio == "type_tree") return b.pot_trees_spawn;
            return b.pot_plants_spawn;
        }

        private static int Mezcla(int x, int y)
        {
            unchecked
            {
                uint h = (uint)(x * 73856093) ^ (uint)(y * 19349663);
                h ^= h >> 13; h *= 0x5bd1e995; h ^= h >> 15;
                return (int)(h & 0x7fffffff);
            }
        }

        public static Building PonerEdificio(string asset, WorldTile t)
        {
            if (t == null || t.building != null) return null;
            try { return R.Call(World.world.buildings, "addBuilding", asset, t, false, false, BuildPlacingType.New) as Building; }
            catch (Exception) { return null; }
        }

        /// <summary>
        /// Rehace la flora natural de forma simetrica: mismas posiciones en las dos mitades (espejadas). Si hay bioma por mitad, cada posicion
        /// toma el mismo indice del conjunto del bioma de su lado (arboles / plantas / minerales); si no, copia el mismo edificio.
        /// Devuelve {colocados, descartados}.
        /// </summary>
        public static int[] RehacerFloraSimetrica(List<ItemFlora> izquierda, string biomaIzq, string biomaDer)
        {
            int w = MapBox.width, puestos = 0, descartados = 0;
            BiomeAsset bi = biomaIzq == null ? null : AssetManager.biome_library.get(biomaIzq);
            BiomeAsset bd = biomaDer == null ? null : AssetManager.biome_library.get(biomaDer);
            foreach (ItemFlora f in izquierda)
            {
                if (f.X >= w / 2) continue;
                string aI = f.Asset, aD = f.Asset;
                int h = Mezcla(f.X, f.Y);
                List<string> pi = Pot(bi, f.Tipo), pd = Pot(bd, f.Tipo);
                if (pi != null && pi.Count > 0) aI = pi[h % pi.Count];
                if (pd != null && pd.Count > 0) aD = pd[h % pd.Count];
                if (PonerEdificio(aI, World.world.GetTile(f.X, f.Y)) != null) puestos++; else descartados++;
                if (PonerEdificio(aD, World.world.GetTile(w - 1 - f.X, f.Y)) != null) puestos++; else descartados++;
            }
            return new int[] { puestos, descartados };
        }

        public static int LimpiarFauna()
        {
            int n = 0;
            List<Actor> todas = new List<Actor>(World.world.units.units_only_alive);
            for (int i = 0; i < todas.Count; i++)
            {
                Actor a = todas[i];
                if (a == null || !a.isAlive()) continue;
                if (a.kingdom != null && a.kingdom.isCiv()) continue;
                try { a.dieSimpleNone(); n++; } catch (Exception) { }
            }
            return n;
        }

        /// <summary>Posiciones (en la mitad izquierda) para depositos alrededor de un centro: suelo libre, a distancia creciente, a lo sumo uno por zona de 8x8.</summary>
        public static List<WorldTile> PosicionesDepositos(WorldTile centro, int cantidad, int radio, HashSet<long> zonasUsadas, bool izquierda)
        {
            List<WorldTile> cand = new List<WorldTile>();
            int w = MapBox.width;
            for (int dy = -radio; dy <= radio; dy++)
                for (int dx = -radio; dx <= radio; dx++)
                {
                    int x = centro.x + dx, y = centro.y + dy;
                    if (y < 2 || y >= MapBox.height - 2) continue;
                    if (izquierda ? (x < 2 || x >= w / 2 - 2) : (x < w / 2 + 2 || x >= w - 2)) continue;
                    if (dx * dx + dy * dy < 9) continue; // no encima de la ciudad
                    WorldTile t = World.world.GetTile(x, y);
                    if (!EsSuelo(t) || t.building != null) continue;
                    WorldTile e = World.world.GetTile(w - 1 - x, y);
                    if (!EsSuelo(e) || e.building != null) continue;
                    if (!t.isSameIsland(centro)) continue;
                    cand.Add(t);
                }
            cand.Sort(delegate(WorldTile a, WorldTile b)
            {
                int da = (a.x - centro.x) * (a.x - centro.x) + (a.y - centro.y) * (a.y - centro.y);
                int db = (b.x - centro.x) * (b.x - centro.x) + (b.y - centro.y) * (b.y - centro.y);
                if (da != db) return da.CompareTo(db);
                if (a.y != b.y) return a.y.CompareTo(b.y);
                return a.x.CompareTo(b.x);
            });
            List<WorldTile> res = new List<WorldTile>();
            foreach (WorldTile t in cand)
            {
                if (res.Count >= cantidad) break;
                long zona = Clave(t.x / Juego.LadoZona, t.y / Juego.LadoZona);
                if (zonasUsadas.Contains(zona)) continue;
                bool cerca = false;
                foreach (WorldTile u in res) { if (Math.Max(Math.Abs(u.x - t.x), Math.Abs(u.y - t.y)) < 3) { cerca = true; break; } }
                if (cerca) continue;
                res.Add(t); zonasUsadas.Add(zona);
            }
            return res;
        }

        // ------------------------------------------------------------------------------- leyes y edades
        private static readonly Dictionary<string, bool> leyesOriginales = new Dictionary<string, bool>();

        public static void RestaurarLeyes()
        {
            foreach (KeyValuePair<string, bool> kv in leyesOriginales)
            {
                try { R.Set(LeyDe(kv.Key), "boolVal", kv.Value); } catch (Exception) { }
            }
            leyesOriginales.Clear();
        }

        private static object LeyDe(string id)
        {
            object leyes = R.Get(World.world, "world_laws");
            IDictionary dict = R.Get(leyes, "dict") as IDictionary;
            return dict != null && dict.Contains(id) ? dict[id] : null;
        }

        public static bool LeyActiva(string id)
        {
            object leyes = R.Get(World.world, "world_laws");
            return (bool)R.Call(leyes, "isEnabled", id);
        }

        public static bool FijarLey(string id, bool valor)
        {
            object op = LeyDe(id);
            if (op == null) return false;
            if (!leyesOriginales.ContainsKey(id)) leyesOriginales[id] = (bool)R.Get(op, "boolVal");
            R.Set(op, "boolVal", valor);
            return LeyActiva(id) == valor;
        }

        private static object GestorEdades() { return R.Get(World.world, "era_manager"); }

        public static string EdadActual()
        {
            try { object a = R.Call(GestorEdades(), "getCurrentAge"); return a == null ? null : (string)R.Get(a, "id"); } catch (Exception) { return null; }
        }

        public static bool EdadPausada()
        {
            try { return (bool)R.Call(GestorEdades(), "isPaused"); } catch (Exception) { return false; }
        }

        public static bool FijarEdad(string id, bool pausar)
        {
            WorldAgeAsset a = AssetManager.era_library.get(id);
            if (a == null) return false;
            object g = GestorEdades();
            R.Call(g, "setCurrentAge", a, true);
            R.Call(g, "togglePlay", !pausar);
            return EdadActual() == id && EdadPausada() == pausar;
        }

        public static void ReanudarEdades()
        {
            try { R.Call(GestorEdades(), "togglePlay", true); } catch (Exception) { }
        }

        // ------------------------------------------------------------------------------- rasgos
        internal static string TipoDeRasgo(string tipo) { return tipo; }

        public static object Biblioteca(string tipo)
        {
            switch (tipo)
            {
                case "reino": return AssetManager.kingdoms_traits;
                case "cultura": return AssetManager.culture_traits;
                case "idioma": return AssetManager.language_traits;
                case "clan": return AssetManager.clan_traits;
                case "subespecie": return AssetManager.subspecies_traits;
                case "religion": return AssetManager.religion_traits;
            }
            return null;
        }

        public static IEnumerable ListaDe(object biblioteca)
        {
            FieldInfo f = biblioteca.GetType().GetField("list", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance);
            return f == null ? null : f.GetValue(biblioteca) as IEnumerable;
        }

        private static object Miembro(object o, string nombre)
        {
            if (o == null) return null;
            Type t = o.GetType();
            for (Type c = t; c != null; c = c.BaseType)
            {
                FieldInfo f = c.GetField(nombre, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly);
                if (f != null) return f.GetValue(o);
                PropertyInfo p = c.GetProperty(nombre, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.DeclaredOnly);
                if (p != null && p.GetIndexParameters().Length == 0) { try { return p.GetValue(o, null); } catch (Exception) { return null; } }
            }
            return null;
        }

        private static string Llamar(object o, string metodo)
        {
            try
            {
                MethodInfo m = o.GetType().GetMethod(metodo, BindingFlags.Public | BindingFlags.Instance, null, Type.EmptyTypes, null);
                if (m == null) return null;
                object r = m.Invoke(o, null);
                return r == null ? null : r.ToString();
            }
            catch (Exception) { return null; }
        }

        public static Dictionary<string, object> EfectosDe(object rasgo)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            object stats = Miembro(rasgo, "base_stats");
            if (stats == null) return r;
            try
            {
                MethodInfo gl = stats.GetType().GetMethod("getList", BindingFlags.Public | BindingFlags.Instance);
                IEnumerable lista = gl == null ? null : gl.Invoke(stats, null) as IEnumerable;
                if (lista == null) return r;
                foreach (object e in lista)
                {
                    object id = Miembro(e, "id"), val = Miembro(e, "value");
                    if (id == null || val == null) continue;
                    double d = Convert.ToDouble(val, CultureInfo.InvariantCulture);
                    if (d != 0) r[(string)id] = Math.Round(d, 3);
                }
            }
            catch (Exception) { }
            return r;
        }

        public static string Texto(object o, string metodo, string porDefecto)
        {
            string t = Llamar(o, metodo);
            return string.IsNullOrEmpty(t) ? porDefecto : t;
        }

        /// <summary>Descripcion neutral de un rasgo para el catalogo del prompt.</summary>
        public static Dictionary<string, object> Describir(string tipo, object rasgo)
        {
            string id = (string)Miembro(rasgo, "id");
            string grupo = (string)Miembro(rasgo, "group_id");
            bool dar = Miembro(rasgo, "can_be_given") is bool && (bool)Miembro(rasgo, "can_be_given");
            bool quitar = Miembro(rasgo, "can_be_removed") is bool && (bool)Miembro(rasgo, "can_be_removed");
            bool logro = Miembro(rasgo, "unlocked_with_achievement") is bool && (bool)Miembro(rasgo, "unlocked_with_achievement");
            object rareza = Miembro(rasgo, "rarity");
            List<object> opuestos = new List<object>();
            IEnumerable op = Miembro(rasgo, "opposite_list") as IEnumerable;
            if (op != null) foreach (object o in op) opuestos.Add(o.ToString());
            Dictionary<string, object> efectos = EfectosDe(rasgo);
            bool ofrecible = dar && GrupoOfrecible(tipo, grupo) && !RechazadoPorElJuego(tipo, id);
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["id"] = id;
            d["nombre"] = Texto(rasgo, "getTranslatedName", id);
            d["descripcion"] = Texto(rasgo, "getTranslatedDescription", "");
            d["grupo"] = grupo;
            d["rareza"] = rareza == null ? "" : rareza.ToString();
            d["efectos"] = efectos;
            d["efecto_numerico"] = efectos.Count > 0;
            d["opuestos"] = opuestos;
            d["requiere_logro"] = logro;
            d["se_puede_quitar"] = quitar;
            d["ofrecible"] = ofrecible;
            return d;
        }

        public static Dictionary<string, Dictionary<string, object>> IndiceOfrecible(string tipo)
        {
            Dictionary<string, Dictionary<string, object>> r = new Dictionary<string, Dictionary<string, object>>();
            IEnumerable l = ListaDe(Biblioteca(tipo));
            if (l == null) return r;
            foreach (object t in l)
            {
                Dictionary<string, object> d = Describir(tipo, t);
                r[(string)d["id"]] = d;
            }
            return r;
        }

        public static IEnumerable<string> RasgosActuales(string tipo, Kingdom k)
        {
            List<string> r = new List<string>();
            switch (tipo)
            {
                case "reino": r.AddRange(k.getTraitsAsStrings()); break;
                case "cultura": { Culture c = k.getCulture(); if (c != null) r.AddRange(c.getTraitsAsStrings()); break; }
                case "idioma": { Language c = k.getLanguage(); if (c != null) r.AddRange(c.getTraitsAsStrings()); break; }
                case "clan": { Clan c = k.getKingClan(); if (c != null) r.AddRange(c.getTraitsAsStrings()); break; }
                case "subespecie": { Subspecies c = k.getMainSubspecies(); if (c != null) r.AddRange(c.getTraitsAsStrings()); break; }
                case "religion": { Religion c = k.getReligion(); if (c != null) r.AddRange(c.getTraitsAsStrings()); break; }
            }
            return r;
        }

        /// <summary>E5: true si el objeto del reino que lleva ese tipo de rasgos existe ahora (cultura, idioma y clan pueden faltar en los primeros anios o tras un
        /// cambio; la religion se puede crear mientras el rey viva).</summary>
        public static bool ObjetoExiste(string tipo, Kingdom k)
        {
            if (k == null) return false;
            switch (tipo)
            {
                case "reino": return true;
                case "cultura": return k.getCulture() != null;
                case "idioma": return k.getLanguage() != null;
                case "clan": return k.getKingClan() != null;
                case "subespecie": return k.getMainSubspecies() != null;
                case "religion": return k.getReligion() != null || (k.king != null && k.king.isAlive());
            }
            return false;
        }

        public static bool Tiene(string tipo, Kingdom k, string id)
        {
            foreach (string x in RasgosActuales(tipo, k)) { if (x == id) return true; }
            return false;
        }

        /// <summary>Agrega un rasgo; true si despues el objeto lo tiene. La religion se crea si hace falta (los reinos humanos empiezan sin religion).</summary>
        public static bool Agregar(string tipo, Kingdom k, string id, out bool creoReligion)
        {
            creoReligion = false;
            switch (tipo)
            {
                case "reino": k.addTrait(id, false); break;
                case "cultura": { Culture c = k.getCulture(); if (c == null) return false; c.addTrait(id, false); break; }
                case "idioma": { Language c = k.getLanguage(); if (c == null) return false; c.addTrait(id, false); break; }
                case "clan": { Clan c = k.getKingClan(); if (c == null) return false; c.addTrait(id, false); break; }
                case "subespecie": { Subspecies c = k.getMainSubspecies(); if (c == null) return false; c.addTrait(id, false); break; }
                case "religion":
                    {
                        Religion r = k.getReligion();
                        if (r == null)
                        {
                            if (k.king == null || !k.king.isAlive()) return false;
                            r = World.world.religions.newReligion(k.king, false);
                            if (r == null) return false;
                            k.king.setReligion(r);
                            k.setReligion(r);
                            creoReligion = true;
                        }
                        r.addTrait(id, false);
                        break;
                    }
                default: return false;
            }
            return Tiene(tipo, k, id);
        }

        public static bool Quitar(string tipo, Kingdom k, string id)
        {
            switch (tipo)
            {
                case "reino": k.removeTrait(id); break;
                case "cultura": { Culture c = k.getCulture(); if (c == null) return false; c.removeTrait(id); break; }
                case "idioma": { Language c = k.getLanguage(); if (c == null) return false; c.removeTrait(id); break; }
                case "clan": { Clan c = k.getKingClan(); if (c == null) return false; c.removeTrait(id); break; }
                case "subespecie": { Subspecies c = k.getMainSubspecies(); if (c == null) return false; c.removeTrait(id); break; }
                case "religion": { Religion c = k.getReligion(); if (c == null) return false; c.removeTrait(id); break; }
                default: return false;
            }
            return !Tiene(tipo, k, id);
        }

        public static void QuitarTodos(string tipo, Kingdom k)
        {
            foreach (string id in new List<string>(RasgosActuales(tipo, k))) { try { Quitar(tipo, k, id); } catch (Exception) { } }
        }

        // ------------------------------------------------------------------------------- estadisticas del lider (para medir el efecto de un rasgo)
        public static Dictionary<string, object> EstadisticasRey(Kingdom k)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            if (k == null || k.king == null || !k.king.isAlive()) return r;
            string[] ids = new string[] { "damage", "armor", "health", "intelligence", "diplomacy", "warfare", "stewardship", "lifespan", "birth_rate", "offspring", "speed", "mana", "stamina" };
            try { r["rey_id"] = k.king.getID(); r["rey_nombre"] = k.king.name; } catch (Exception) { }
            try { r["impuesto_local"] = Math.Round((double)k.getTaxRateLocal(), 3); r["impuesto_tributo"] = Math.Round((double)k.getTaxRateTribute(), 3); } catch (Exception) { }
            foreach (string s in ids)
            {
                try { object st = R.Get(k.king, "stats"); r[s] = Math.Round(Convert.ToDouble(R.Call(st, "get", s), CultureInfo.InvariantCulture), 3); } catch (Exception) { }
            }
            return r;
        }
    }
}
