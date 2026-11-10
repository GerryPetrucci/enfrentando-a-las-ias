// IEra sobre WorldBox 0.51.2 real (formato «era», E2). Mismas reglas de hilo que MundoWorldBox: solo desde Bombear().
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;

namespace PuenteWorldBox
{
    public sealed partial class MundoWorldBox
    {
        // ---------------------------------------------------------------- estado de la era
        private bool eraActiva;
        private EraConfig eraCfg;
        private readonly List<Dictionary<string, object>> eventos = new List<Dictionary<string, object>>();
        private readonly Dictionary<long, int> reinoCiv = new Dictionary<long, int>();       // id de reino -> indice de faccion (-1 sin origen)
        private readonly Dictionary<long, int> ciudadCiv = new Dictionary<long, int>();      // id de ciudad -> indice de faccion
        private readonly Dictionary<long, int> culturaCiv = new Dictionary<long, int>();     // id de cultura -> indice de faccion (respaldo)
        private readonly HashSet<long> reinosVivosVistos = new HashSet<long>();
        private readonly HashSet<string> guerrasVistas = new HashSet<string>();
        private readonly Dictionary<string, Dictionary<string, List<string>>> rasgosEra = new Dictionary<string, Dictionary<string, List<string>>>();
        // Un reino destruido ya no responde a getID()/name (NullReferenceException): se guardan al registrarlo.
        private readonly Dictionary<Kingdom, long> idReino = new Dictionary<Kingdom, long>();
        private readonly Dictionary<Kingdom, string> nombreReino = new Dictionary<Kingdom, string>();
        private void RecordarReino(Kingdom k)
        {
            try { idReino[k] = k.getID(); nombreReino[k] = k.name; } catch (Exception) { }
        }
        private long IdDe(Kingdom k) { long v; return idReino.TryGetValue(k, out v) ? v : -1; }
        private string NombreDe(Kingdom k) { string v; return nombreReino.TryGetValue(k, out v) ? v : "?"; }
        private float eraProximo;
        private float eraReloj0;
        private string eraEdadVista;
        private sealed class Deposito { public string Faccion, Mineral; public int X, Y; public bool Colocado; }
        private readonly List<Deposito> eraDepositos = new List<Deposito>();
        private static readonly string[] RecursosEstado = new string[] { "wood", "stone", "gold", "common_metals", "silver", "mythril", "adamantine", "gems", "bones", "leather" };

        public bool EraVerificada { get { return true; } }

        private int AnioDe(double tRel) { return 1 + (int)Math.Floor(Math.Max(0.0, tRel) / 60.0); }

        private void Evento(string tipo, params object[] pares)
        {
            double t = Math.Max(0.0, Juego.TiempoMundo() - t0Escenario);
            Dictionary<string, object> e = new Dictionary<string, object>();
            e["i"] = eventos.Count;
            e["tipo"] = tipo;
            e["anio"] = AnioDe(t);
            e["t_juego_s"] = Math.Round(t, 1);
            e["t_real_s"] = Math.Round(Time.realtimeSinceStartup - eraReloj0, 1);
            for (int i = 0; i + 1 < pares.Length; i += 2) e[(string)pares[i]] = pares[i + 1];
            eventos.Add(e);
            if (eventos.Count > 20000) eventos.RemoveRange(0, 1000);
        }

        private void EraReiniciarEstado()
        {
            eraActiva = false; eraCfg = null;
            eventos.Clear(); reinoCiv.Clear(); ciudadCiv.Clear(); culturaCiv.Clear(); reinosVivosVistos.Clear(); guerrasVistas.Clear();
            rasgosEra.Clear(); eraDepositos.Clear(); eraEdadVista = null; idReino.Clear(); nombreReino.Clear();
            mant.Limpiar(); eventosMantenimiento = 0; presAplicados = 0; presReaplicados = 0; presFallos = 0; presError.Clear();
            VigilanciaReiniciar();
        }

        // ---------------------------------------------------------------- vivos / metricas por civilizacion
        private Kingdom ReinoPrincipal(Faccion f)
        {
            if (Juego.Vivo(f.Reino)) return f.Reino;
            foreach (Kingdom k in f.Reinos) { if (Juego.Vivo(k)) return k; }
            return null;
        }

        private bool FaccionViva(Faccion f)
        {
            if (Juego.Vivo(f.Reino)) return true;
            if (!eraActiva || eraCfg == null || !eraCfg.ContarDerivados) return false;
            foreach (Kingdom k in f.Reinos) { if (Juego.Vivo(k)) return true; }
            return false;
        }

        private List<Kingdom> ReinosVivos(Faccion f)
        {
            List<Kingdom> r = new List<Kingdom>();
            if (!eraActiva || eraCfg == null || !eraCfg.ContarDerivados) { if (Juego.Vivo(f.Reino)) r.Add(f.Reino); return r; }
            foreach (Kingdom k in f.Reinos) { if (Juego.Vivo(k)) r.Add(k); }
            return r;
        }

        // ---------------------------------------------------------------- seguimiento de linaje y eventos (cada 0.25 s reales)
        private void EraTick()
        {
            if (!eraActiva || !hayEscenario) return;
            float ahora = Time.unscaledTime;
            if (ahora < eraProximo) return;
            eraProximo = ahora + 0.25f;
            try { EraSeguimiento(); } catch (Exception e) { Medir("ERA_TICK error " + e.GetType().Name + ": " + e.Message); }
            try { EraUnificar(); } catch (Exception e) { Medir("ERA_UNIFICAR error " + e.GetType().Name + ": " + e.Message); }
            try { EraVigilar(); } catch (Exception e) { Medir("ERA_VIGILAR error " + e.GetType().Name + ": " + e.Message); }
            try { EraPresentacionMantener(); } catch (Exception e) { Medir("ERA_PRESENTACION error " + e.GetType().Name + ": " + e.Message); }
            try { EraMantener(); } catch (Exception e) { Medir("ERA_MANTENER error " + e.GetType().Name + ": " + e.Message); }
        }

        private void EraSeguimiento()
        {
            List<Kingdom> lista = new List<Kingdom>(World.world.kingdoms.list);
            HashSet<long> vivosAhora = new HashSet<long>();
            foreach (Kingdom k in lista)
            {
                if (k == null || !k.isAlive() || k.wild || !k.isCiv()) continue;
                if (k.getPopulationPeople() <= 0 && k.countCities() <= 0) continue;
                long id = k.getID();
                vivosAhora.Add(id);
                if (!reinoCiv.ContainsKey(id))
                {
                    int civ = -1;
                    foreach (City c in k.cities) { int i; if (ciudadCiv.TryGetValue(c.getID(), out i)) { civ = i; break; } }
                    if (civ < 0)
                    {
                        Culture cu = k.getCulture();
                        int i2;
                        if (cu != null && culturaCiv.TryGetValue(cu.getID(), out i2)) civ = i2;
                    }
                    reinoCiv[id] = civ;
                    RecordarReino(k);
                    if (civ >= 0 && !facciones[civ].Reinos.Contains(k)) facciones[civ].Reinos.Add(k);
                    Evento("reino_nuevo", "reino", k.name, "reino_id", id, "faccion", civ >= 0 ? facciones[civ].Id : null, "origen", civ >= 0 ? "escision" : "independiente",
                        "ciudades", k.countCities(), "poblacion", k.getPopulationPeople());
                }
            }
            foreach (long id in new List<long>(reinosVivosVistos))
            {
                if (vivosAhora.Contains(id)) continue;
                int civ; reinoCiv.TryGetValue(id, out civ);
                Evento("reino_eliminado", "reino_id", id, "faccion", civ >= 0 ? facciones[civ].Id : null);
                if (civ >= 0 && !FaccionVivaPorIds(civ, vivosAhora)) Evento("civilizacion_eliminada", "faccion", facciones[civ].Id);
            }
            reinosVivosVistos.Clear();
            foreach (long id in vivosAhora) reinosVivosVistos.Add(id);

            // ciudades: fundadas, destruidas, conquistadas
            Dictionary<long, int> ciudadesAhora = new Dictionary<long, int>();
            foreach (Kingdom k in lista)
            {
                long kid = k == null ? 0 : k.getID();
                if (k == null || !vivosAhora.Contains(kid)) continue;
                int civ; if (!reinoCiv.TryGetValue(kid, out civ)) civ = -1;
                foreach (City c in k.cities)
                {
                    if (c == null || !c.isAlive()) continue;
                    long cid = c.getID();
                    ciudadesAhora[cid] = civ;
                    int previo;
                    if (!ciudadCiv.TryGetValue(cid, out previo))
                    {
                        if (ciudadCiv.Count > 0 || eventos.Count > 0) Evento("ciudad_fundada", "ciudad", c.name, "reino", k.name, "faccion", civ >= 0 ? facciones[civ].Id : null);
                    }
                    else if (previo != civ && previo >= 0 && civ >= 0)
                    {
                        Evento("ciudad_conquistada", "ciudad", c.name, "de", facciones[previo].Id, "a", facciones[civ].Id);
                    }
                    if (k.getCulture() != null && civ >= 0) culturaCiv[k.getCulture().getID()] = civ;
                }
            }
            foreach (KeyValuePair<long, int> kv in ciudadCiv)
            {
                if (!ciudadesAhora.ContainsKey(kv.Key)) Evento("ciudad_destruida", "ciudad_id", kv.Key, "faccion", kv.Value >= 0 ? facciones[kv.Value].Id : null);
            }
            ciudadCiv.Clear();
            foreach (KeyValuePair<long, int> kv in ciudadesAhora) ciudadCiv[kv.Key] = kv.Value;

            // guerras entre pares de reinos vivos
            HashSet<string> guerrasAhora = new HashSet<string>();
            List<Kingdom> vivosLista = new List<Kingdom>();
            foreach (Kingdom k in lista) { if (k != null && vivosAhora.Contains(k.getID())) vivosLista.Add(k); }
            for (int i = 0; i < vivosLista.Count; i++)
                for (int j = i + 1; j < vivosLista.Count; j++)
                {
                    Kingdom a = vivosLista[i], b = vivosLista[j];
                    bool guerra = false;
                    try { guerra = World.world.wars.isInWarWith(a, b); } catch (Exception) { }
                    if (!guerra) continue;
                    string clave = a.getID() + "-" + b.getID();
                    guerrasAhora.Add(clave);
                    if (!guerrasVistas.Contains(clave))
                    {
                        int ca = reinoCiv[a.getID()], cb = reinoCiv[b.getID()];
                        Evento("guerra_declarada", "reino_a", a.name, "reino_b", b.name, "faccion_a", ca >= 0 ? facciones[ca].Id : null, "faccion_b", cb >= 0 ? facciones[cb].Id : null,
                            "guerra_civil", ca >= 0 && ca == cb);
                    }
                }
            foreach (string clave in guerrasVistas) { if (!guerrasAhora.Contains(clave)) Evento("guerra_terminada", "clave", clave); }
            guerrasVistas.Clear();
            foreach (string clave in guerrasAhora) guerrasVistas.Add(clave);

            string edad = EraJuego.EdadActual();
            if (edad != null && edad != eraEdadVista)
            {
                if (eraEdadVista != null) Evento("edad_cambiada", "edad", edad, "anterior", eraEdadVista);
                eraEdadVista = edad;
            }
        }

        private bool FaccionVivaPorIds(int civ, HashSet<long> vivos)
        {
            foreach (KeyValuePair<long, int> kv in reinoCiv) { if (kv.Value == civ && vivos.Contains(kv.Key)) return true; }
            return false;
        }

        // ---------------------------------------------------------------- preparacion del escenario (se llama desde Reiniciar)
        private int IndiceFaccion(IList<string> ids, string id) { return ids.IndexOf(id); }

        private Dictionary<string, object> EraPreparar(EraConfig cfg, IList<string> ids)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            List<ItemFlora> flora = EraJuego.InstantaneaFlora();
            int fauna = cfg.LimpiarFauna ? EraJuego.LimpiarFauna() : 0;
            r["fauna_eliminada"] = fauna;
            if (cfg.Espejo)
            {
                int cambiadas = EraJuego.EspejarTerreno();
                int resto = EraJuego.DiferenciasEspejo();
                r["espejo"] = Json.Objeto("casillas_cambiadas", cambiadas, "diferencias_restantes", resto);
            }
            string bioIzq = null, bioDer = null;
            if (cfg.Biomas.Count > 0)
            {
                int w = MapBox.width;
                string b0, b1;
                cfg.Biomas.TryGetValue(ids[0], out b0); cfg.Biomas.TryGetValue(ids[1], out b1);
                int p0 = 0, p1 = 0;
                if (b0 != null) { p0 = EraJuego.PintarBioma(0, w / 2 - 1, b0); bioIzq = b0; }
                if (b1 != null) { p1 = EraJuego.PintarBioma(w / 2, w - 1, b1); bioDer = b1; }
                r["biomas"] = Json.Objeto("izquierda", b0, "derecha", b1, "casillas_izquierda", p0, "casillas_derecha", p1);
            }
            if (cfg.Espejo)
            {
                EraJuego.QuitarFlora();
                int[] f = EraJuego.RehacerFloraSimetrica(flora, bioIzq, bioDer);
                r["flora"] = Json.Objeto("colocados", f[0], "descartados", f[1], "origen_izquierda", flora.Count);
            }
            Juego.Estabilizar();
            if (cfg.MuroAncho > 0)
            {
                int n = EraJuego.PonerMuro(cfg.MuroAncho, cfg.MuroTipo);
                r["muro"] = Json.Objeto("x0", EraJuego.MuroX0, "x1", EraJuego.MuroX1, "ancho", cfg.MuroAncho, "tipo", cfg.MuroTipo, "casillas", n);
            }
            return r;
        }

        /// <summary>Despues de fundar: minerales, arranque igual, leyes, edad y seguimiento de linaje.</summary>
        private Dictionary<string, object> EraDespues(EraConfig cfg, List<Faccion> fs, Sitio[] sitios)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            List<string> ids = new List<string>();
            foreach (Faccion f in fs) ids.Add(f.Id);

            // minerales
            eraDepositos.Clear();
            if (cfg.Minerales.Count > 0)
            {
                List<MineralPedido>[] por = new List<MineralPedido>[2];
                por[0] = new List<MineralPedido>(); por[1] = new List<MineralPedido>();
                foreach (MineralPedido p in cfg.Minerales) por[ids.IndexOf(p.Faccion)].Add(p);
                HashSet<long> zonas = new HashSet<long>();
                int rondas = Math.Max(por[0].Count, por[1].Count);
                for (int ronda = 0; ronda < rondas; ronda++)
                {
                    MineralPedido p0 = ronda < por[0].Count ? por[0][ronda] : null, p1 = ronda < por[1].Count ? por[1][ronda] : null;
                    int n = Math.Max(p0 == null ? 0 : p0.Cantidad, p1 == null ? 0 : p1.Cantidad);
                    int radio = Math.Max(p0 == null ? 0 : p0.Radio, p1 == null ? 0 : p1.Radio);
                    List<WorldTile> pos = EraJuego.PosicionesDepositos(sitios[0].Centro, n, radio, zonas, true);
                    for (int k = 0; k < pos.Count; k++)
                    {
                        if (p0 != null && k < p0.Cantidad) ColocarDeposito(fs[0], p0.Mineral, pos[k]);
                        if (p1 != null && k < p1.Cantidad) ColocarDeposito(fs[1], p1.Mineral, World.world.GetTile(MapBox.width - 1 - pos[k].x, pos[k].y));
                    }
                }
            }
            r["depositos"] = DepositosPorFaccion();

            // arranque igual: sin rasgos iniciales de cultura, idioma ni clan en ninguna faccion
            if (cfg.IgualarArranque)
            {
                List<object> antes = new List<object>();
                foreach (Faccion f in fs)
                {
                    Dictionary<string, object> d = new Dictionary<string, object>();
                    foreach (string tipo in new string[] { "cultura", "idioma", "clan" })
                    {
                        List<string> previos = new List<string>(EraJuego.RasgosActuales(tipo, f.Reino));
                        d[tipo] = previos.Count;
                        EraJuego.QuitarTodos(tipo, f.Reino);
                    }
                    antes.Add(Json.Objeto("faccion", f.Id, "rasgos_iniciales_quitados", d));
                }
                r["arranque_igual"] = antes;
            }
            r["arranque"] = RasgosIniciales(fs);

            // leyes y edad
            List<object> leyes = new List<object>();
            foreach (KeyValuePair<string, bool> kv in cfg.Leyes)
                leyes.Add(Json.Objeto("ley", kv.Key, "valor", kv.Value, "aplicada", EraJuego.FijarLey(kv.Key, kv.Value)));
            r["leyes"] = leyes;
            if (cfg.Edad != null)
                r["edad"] = Json.Objeto("id", cfg.Edad, "fijada", EraJuego.FijarEdad(cfg.Edad, cfg.PausarEdades), "pausada", EraJuego.EdadPausada());
            else if (cfg.PausarEdades)
                r["edad"] = Json.Objeto("id", EraJuego.EdadActual(), "fijada", EraJuego.FijarEdad(EraJuego.EdadActual(), true), "pausada", EraJuego.EdadPausada());

            // seguimiento
            foreach (Faccion f in fs)
            {
                f.Reinos.Clear(); f.Reinos.Add(f.Reino);
                reinoCiv[f.Reino.getID()] = f.Indice;
                RecordarReino(f.Reino);
                reinosVivosVistos.Add(f.Reino.getID());
                foreach (City c in f.Reino.cities) ciudadCiv[c.getID()] = f.Indice;
                if (f.Reino.getCulture() != null) culturaCiv[f.Reino.getCulture().getID()] = f.Indice;
            }
            eraReloj0 = Time.realtimeSinceStartup;
            eraEdadVista = EraJuego.EdadActual();
            eraProximo = 0f;
            eraCfg = cfg;
            eraActiva = true;
            r["presentacion"] = EraPresentacionInicial(fs);
            Evento("era_iniciada", "facciones", ids.Count, "muro", EraJuego.MuroPuesto, "espejo", cfg.Espejo, "vigilante", cfg.Vigilante && EraJuego.MuroPuesto, "unico_reino", cfg.UnicoReino);
            if (EraJuego.MuroPuesto) Evento("muro_puesto", "x0", EraJuego.MuroX0, "x1", EraJuego.MuroX1);
            return r;
        }

        private object RasgosIniciales(List<Faccion> fs)
        {
            List<object> l = new List<object>();
            foreach (Faccion f in fs)
            {
                Dictionary<string, object> d = new Dictionary<string, object>();
                d["faccion"] = f.Id;
                foreach (string tipo in EraJuego.Tipos) d[tipo] = new List<string>(EraJuego.RasgosActuales(tipo, f.Reino));
                l.Add(d);
            }
            return l;
        }

        private void ColocarDeposito(Faccion f, string mineral, WorldTile t)
        {
            Building b = EraJuego.PonerEdificio(mineral, t);
            Deposito d = new Deposito(); d.Faccion = f.Id; d.Mineral = mineral; d.X = t == null ? -1 : t.x; d.Y = t == null ? -1 : t.y; d.Colocado = b != null;
            eraDepositos.Add(d);
        }

        /// <summary>Depositos colocados por la era y si cada uno sigue en pie (los depositos son de un solo uso: la ciudad los agota).</summary>
        private List<object> DepositosPorFaccion()
        {
            List<object> l = new List<object>();
            foreach (Deposito d in eraDepositos)
            {
                bool presente = false;
                if (d.Colocado && d.X >= 0)
                {
                    WorldTile t = World.world.GetTile(d.X, d.Y);
                    BuildingAsset a = t == null ? null : EraJuego.AssetDe(t.building);
                    presente = a != null && a.id == d.Mineral;
                }
                l.Add(Json.Objeto("faccion", d.Faccion, "mineral", d.Mineral, "x", d.X, "y", d.Y, "colocado", d.Colocado, "presente", presente));
            }
            return l;
        }

        private Dictionary<string, object> AlmacenDe(List<Kingdom> reinos)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            foreach (string id in RecursosEstado)
            {
                int total = 0;
                foreach (Kingdom k in reinos)
                {
                    try { foreach (City c in k.cities) total += c.getResourcesAmount(id); } catch (Exception) { }
                }
                r[id] = total;
            }
            return r;
        }

        /// <summary>Elige los sitios de las dos facciones como espejo exacto una de la otra (calidad igual). Devuelve null en la posicion si no hay sitio.</summary>
        private Sitio[] ElegirSitiosEspejo(Actor[] muestras, int calidadMinima, int margenMuro)
        {
            int zxN = Juego.ZonasX, zyN = Juego.ZonasY, w = MapBox.width;
            double[][] anclas = Juego.Anclas(2);
            int ax = (int)Math.Round(anclas[0][0] * zxN - 0.5), ay = (int)Math.Round(anclas[0][1] * zyN - 0.5);
            int radioMax = Math.Max(zxN, zyN) / 3;
            int sepMin = Math.Max(4, Math.Min(zxN, zyN) / 4);
            Sitio[] res = new Sitio[2];
            for (int r = 0; r <= radioMax; r++)
            {
                Sitio mejor = null, mejorEspejo = null; int mejorQ = -1;
                for (int dy = -r; dy <= r; dy++)
                    for (int dx = -r; dx <= r; dx++)
                    {
                        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
                        int zx = ax + dx, zy = ay + dy;
                        if (zx < 1 || zx >= zxN / 2 - margenMuro) continue;
                        TileZone z = Juego.Zona(zx, zy);
                        TileZone zm = Juego.Zona(zxN - 1 - zx, zy);
                        if (z == null || zm == null || z.centerTile == null) continue;
                        // distancia entre sitios (zonas) >= sepMin
                        if ((zxN - 1 - zx) - zx < sepMin) continue;
                        if (!z.isGoodForNewCity(muestras[0])) continue;
                        WorldTile centroEspejo = World.world.GetTile(w - 1 - z.centerTile.x, z.centerTile.y);
                        if (centroEspejo == null || !EraJuego.EsSuelo(centroEspejo)) continue;
                        if (centroEspejo.zone == null || !centroEspejo.zone.isGoodForNewCity(muestras[1])) continue;
                        int q0 = Juego.CalidadSitio(zx, zy), q1 = Juego.CalidadSitio(centroEspejo.zone.x, centroEspejo.zone.y);
                        int q = Math.Min(q0, q1);
                        if (q < calidadMinima) continue;
                        if (q > mejorQ)
                        {
                            mejorQ = q;
                            mejor = new Sitio(); mejor.Zx = zx; mejor.Zy = zy; mejor.Centro = z.centerTile; mejor.Calidad = q0; mejor.Distancia = Math.Sqrt(dx * dx + dy * dy);
                            mejorEspejo = new Sitio(); mejorEspejo.Zx = centroEspejo.zone.x; mejorEspejo.Zy = centroEspejo.zone.y; mejorEspejo.Centro = centroEspejo; mejorEspejo.Calidad = q1;
                        }
                    }
                if (mejor != null) { res[0] = mejor; res[1] = mejorEspejo; return res; }
            }
            return res;
        }

        // ---------------------------------------------------------------- IEra: catalogo
        private static Dictionary<string, object> GrupoOfrecibleInfo(string tipo, Dictionary<string, Dictionary<string, object>> indice)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            foreach (Dictionary<string, object> d in indice.Values)
            {
                string g = (string)d["grupo"];
                Dictionary<string, object> go;
                object o;
                if (!r.TryGetValue(g, out o)) { go = Json.Objeto("total", 0, "ofrecibles", 0, "con_efecto_numerico", 0); r[g] = go; } else go = (Dictionary<string, object>)o;
                go["total"] = (int)go["total"] + 1;
                if ((bool)d["ofrecible"]) go["ofrecibles"] = (int)go["ofrecibles"] + 1;
                if ((bool)d["ofrecible"] && (bool)d["efecto_numerico"]) go["con_efecto_numerico"] = (int)go["con_efecto_numerico"] + 1;
            }
            return r;
        }

        // Mapa de categorias del formato era sobre los grupos del juego (acordado con el usuario en el encargo E2).
        private static readonly string[][] CategoriasEra = new string[][] {
            new string[] { "cognitivo", "subespecie", "advanced_brain", "talents" },
            new string[] { "mente", "clan", "mind" },
            new string[] { "mente", "subespecie", "mind" },
            new string[] { "espiritu", "idioma", "spirit" },
            new string[] { "espiritu", "clan", "spirit" },
            new string[] { "espiritu", "religion", "*" },
            new string[] { "fisico", "clan", "body" },
            new string[] { "fisico", "subespecie", "body" },
            new string[] { "apariencia", "subespecie", "phenotypes" },
            new string[] { "infraestructura", "cultura", "architecture", "town_plan", "buildings" },
            new string[] { "politicas", "cultura", "kingdom", "succession", "warfare" },
            new string[] { "politicas", "reino", "*" },
        };

        private List<object> CategoriasEraInfo()
        {
            List<object> l = new List<object>();
            Dictionary<string, Dictionary<string, Dictionary<string, object>>> indices = new Dictionary<string, Dictionary<string, Dictionary<string, object>>>();
            foreach (string[] c in CategoriasEra)
            {
                string tipo = c[1];
                Dictionary<string, Dictionary<string, object>> ind;
                if (!indices.TryGetValue(tipo, out ind)) { ind = EraJuego.IndiceOfrecible(tipo); indices[tipo] = ind; }
                List<object> grupos = new List<object>();
                int total = 0, ofrecibles = 0, numericos = 0;
                for (int i = 2; i < c.Length; i++) grupos.Add(c[i]);
                foreach (Dictionary<string, object> d in ind.Values)
                {
                    bool coincide = c[2] == "*";
                    for (int i = 2; i < c.Length && !coincide; i++) { if ((string)d["grupo"] == c[i]) coincide = true; }
                    if (!coincide) continue;
                    total++;
                    if ((bool)d["ofrecible"]) { ofrecibles++; if ((bool)d["efecto_numerico"]) numericos++; }
                }
                l.Add(Json.Objeto("categoria", c[0], "tipo", tipo, "grupos", grupos, "total", total, "ofrecibles", ofrecibles, "con_efecto_numerico", numericos));
            }
            return l;
        }

        private List<object> CatalogoMinerales()
        {
            List<object> l = new List<object>();
            foreach (string id in EraJuego.MineralesPermitidos)
            {
                BuildingAsset a = AssetManager.buildings.get(id);
                List<object> da = new List<object>();
                if (a != null && a.resources_given != null)
                    foreach (ResourceContainer rc in a.resources_given) da.Add(Json.Objeto("recurso", rc.id, "cantidad", rc.amount));
                l.Add(Json.Objeto("id", id, "da", da, "un_solo_uso", true, "limite_por_zona", a == null ? 1 : a.limit_per_zone));
            }
            return l;
        }

        private List<object> CatalogoBiomas()
        {
            List<object> l = new List<object>();
            foreach (string id in EraJuego.BiomasPermitidos)
            {
                BiomeAsset b = AssetManager.biome_library.get(id);
                if (b == null) continue;
                TopTileType bajo = AssetManager.top_tiles.get(b.tile_low);
                List<object> min = new List<object>(); HashSet<string> vistos = new HashSet<string>();
                if (b.pot_minerals_spawn != null) foreach (string m in b.pot_minerals_spawn) { if (vistos.Add(m)) min.Add(m); }
                l.Add(Json.Objeto("id", id, "suelo_bajo", b.tile_low, "suelo_alto", b.tile_high, "minerales_naturales", min,
                    "arboles", b.pot_trees_spawn == null ? 0 : b.pot_trees_spawn.Count, "plantas", b.pot_plants_spawn == null ? 0 : b.pot_plants_spawn.Count,
                    "frio", b.cold_biome, "se_propaga", b.spread_biome,
                    "comida", bajo == null ? null : bajo.food_resource, "paso", bajo == null ? 1.0 : Math.Round((double)bajo.walk_multiplier, 2)));
            }
            return l;
        }

        private List<object> CatalogoLeyes()
        {
            List<object> l = new List<object>();
            foreach (string id in EraJuego.LeyesPermitidas)
            {
                bool act = false; try { act = EraJuego.LeyActiva(id); } catch (Exception) { }
                l.Add(Json.Objeto("id", id, "activa_ahora", act));
            }
            return l;
        }

        private List<object> CatalogoEspecies()
        {
            List<object> l = new List<object>();
            foreach (ActorAsset a in AssetManager.actor_library.list)
            {
                if (!a.civ) continue;
                l.Add(Json.Objeto("id", a.id, "nombre", EraJuego.Texto(a, "getTranslatedName", a.id)));
            }
            return l;
        }

        public IDictionary<string, object> EraCatalogo(string tipo)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["version"] = 1;
            r["juego"] = info.Version;
            if (tipo == null)
            {
                Dictionary<string, object> tipos = new Dictionary<string, object>();
                foreach (string t in EraJuego.Tipos)
                {
                    Dictionary<string, Dictionary<string, object>> ind = EraJuego.IndiceOfrecible(t);
                    int of = 0, num = 0;
                    foreach (Dictionary<string, object> d in ind.Values) { if ((bool)d["ofrecible"]) { of++; if ((bool)d["efecto_numerico"]) num++; } }
                    tipos[t] = Json.Objeto("total", ind.Count, "ofrecibles", of, "con_efecto_numerico", num, "grupos", GrupoOfrecibleInfo(t, ind));
                }
                r["rasgos"] = tipos;
                r["categorias_era"] = CategoriasEraInfo();
                r["minerales"] = CatalogoMinerales();
                r["biomas"] = CatalogoBiomas();
                List<object> edades = new List<object>(); foreach (string e in EraJuego.EdadesPermitidas) edades.Add(e);
                r["edades"] = edades;
                r["leyes"] = CatalogoLeyes();
                r["limites"] = Json.Objeto("max_rasgos_por_tipo", EraJuego.MaxRasgosPorTipoPorDefecto, "max_rasgos_por_tipo_absoluto", EraJuego.MaxRasgosPorTipoAbsoluto, "max_rasgos_por_llamada", EraJuego.MaxRasgosPorLlamada,
                    "muro_ancho_maximo", EraJuego.MuroAnchoMaximo, "max_depositos_por_pedido", EraJuego.MaxDepositosPorPedido);
                return r;
            }
            if (Array.IndexOf(EraJuego.Tipos, tipo) >= 0)
            {
                Dictionary<string, Dictionary<string, object>> ind = EraJuego.IndiceOfrecible(tipo);
                List<object> l = new List<object>();
                foreach (Dictionary<string, object> d in ind.Values) l.Add(d);
                r["tipo"] = tipo;
                r["rasgos"] = l;
                r["grupos"] = GrupoOfrecibleInfo(tipo, ind);
                return r;
            }
            if (tipo == "minerales") { r["minerales"] = CatalogoMinerales(); return r; }
            if (tipo == "biomas") { r["biomas"] = CatalogoBiomas(); return r; }
            if (tipo == "leyes") { r["leyes"] = CatalogoLeyes(); return r; }
            if (tipo == "especies") { r["especies"] = CatalogoEspecies(); return r; }
            if (tipo == "compatibilidad")
            {
                if (avance != null) throw new ErrorPuente(Codigos.JuegoOcupado, "Hay un avance en curso.");
                r["compatibilidad"] = EraJuego.Compatibilidad();
                return r;
            }
            if (tipo == "categorias") { r["categorias_era"] = CategoriasEraInfo(); return r; }
            throw new ErrorPuente(Codigos.SolicitudInvalida, "tipo de catalogo desconocido: " + tipo + ".");
        }

        // ---------------------------------------------------------------- IEra: estado
        public IDictionary<string, object> EraEstado(int desdeEvento)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["version"] = 1;
            r["hay_era"] = eraActiva;
            if (!hayEscenario) return r;
            double t = Math.Max(0.0, Juego.TiempoMundo() - t0Escenario);
            r["tiempo_juego_s"] = Math.Round(t, 2);
            r["anio"] = AnioDe(t);
            r["tiempo_real_s"] = Math.Round(Time.realtimeSinceStartup - eraReloj0, 1);
            r["edad"] = Json.Objeto("id", EraJuego.EdadActual(), "pausada", EraJuego.EdadPausada());
            r["muro"] = Json.Objeto("puesto", EraJuego.MuroPuesto, "x0", EraJuego.MuroX0, "x1", EraJuego.MuroX1);
            r["vigilante"] = VigilanteEstado();
            r["unico_reino"] = UnicoReinoEstado();
            r["presentacion"] = PresentacionEstado();
            List<object> civs = new List<object>();
            foreach (Faccion f in facciones)
            {
                List<object> reinos = new List<object>();
                int pob = 0, ciu = 0, ter = 0, ej = 0, edi = 0;
                bool derivados = eraActiva && eraCfg != null && eraCfg.ContarDerivados;
                List<Kingdom> todos = new List<Kingdom>(); todos.Add(f.Reino);
                if (derivados) foreach (Kingdom k in f.Reinos) { if (!todos.Contains(k)) todos.Add(k); }
                foreach (Kingdom k in todos)
                {
                    bool vivo = false;
                    try { vivo = Juego.Vivo(k); } catch (Exception) { }
                    int p = 0, c = 0, z = 0, e = 0, b = 0;
                    if (vivo) { try { p = k.getPopulationPeople(); c = k.countCities(); z = k.countZones(); e = k.countTotalWarriors(); b = k.countBuildings(); } catch (Exception) { vivo = false; p = 0; c = 0; z = 0; e = 0; b = 0; } }
                    reinos.Add(Json.Objeto("nombre", NombreDe(k), "id", IdDe(k), "vivo", vivo, "original", k == f.Reino, "poblacion", p, "ciudades", c, "territorio", z, "ejercito", e));
                    if (vivo) { pob += p; ciu += c; ter += z; ej += e; edi += b; }
                }
                List<Kingdom> vivosDeF = ReinosVivos(f);
                civs.Add(Json.Objeto("faccion", f.Id, "especie", f.Especie, "vivo", FaccionViva(f), "poblacion", pob, "ciudades", ciu, "territorio", ter, "ejercito", ej, "edificios", edi,
                    "almacen", AlmacenDe(vivosDeF), "rey", EraJuego.EstadisticasRey(ReinoPrincipal(f)), "reinos", reinos, "rasgos_era", rasgosEraDe(f.Id), "rasgos_mantenidos", mant.EstadoDe(f.Id)));
            }
            r["civilizaciones"] = civs;
            List<object> externos = new List<object>();
            foreach (KeyValuePair<long, int> kv in reinoCiv)
            {
                if (kv.Value >= 0 || !reinosVivosVistos.Contains(kv.Key)) continue;
                try
                {
                    Kingdom k = World.world.kingdoms.get(kv.Key);
                    if (k != null && k.isAlive()) externos.Add(Json.Objeto("nombre", k.name, "id", kv.Key, "poblacion", k.getPopulationPeople(), "ciudades", k.countCities()));
                }
                catch (Exception) { }
            }
            r["reinos_sin_origen"] = externos;
            Dictionary<string, object> leyes = new Dictionary<string, object>();
            foreach (string id in EraJuego.LeyesPermitidas) { try { leyes[id] = EraJuego.LeyActiva(id); } catch (Exception) { } }
            r["leyes"] = leyes;
            List<object> ev = new List<object>();
            int inicio = Math.Max(0, desdeEvento);
            for (int i = 0; i < eventos.Count; i++) { if ((int)eventos[i]["i"] >= inicio) ev.Add(eventos[i]); }
            r["eventos"] = ev;
            r["siguiente_evento"] = eventos.Count == 0 ? 0 : (int)eventos[eventos.Count - 1]["i"] + 1;
            r["depositos"] = DepositosPorFaccion();
            r["mantenimiento"] = mant.Resumen();
            return r;
        }

        private Dictionary<string, object> rasgosEraDe(string faccion)
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            Dictionary<string, List<string>> por;
            if (rasgosEra.TryGetValue(faccion, out por)) foreach (KeyValuePair<string, List<string>> kv in por) d[kv.Key] = new List<string>(kv.Value);
            return d;
        }

        // ---------------------------------------------------------------- IEra: rasgos
        private static Dictionary<string, object> Rechazo(string id, string codigo, string mensaje)
        {
            return Json.Objeto("id", id, "codigo", codigo, "mensaje", mensaje);
        }

        public IDictionary<string, object> EraRasgos(string faccion, string tipo, IList<string> agregar, IList<string> quitar, bool reemplazar, bool parcial)
        {
            return EraRasgosInterno(faccion, tipo, agregar, quitar, new string[0], reemplazar, parcial, false);
        }

        /// <summary>E5 (aditivo): igual que EraRasgos, pero lo aplicado (y lo que aun no se puede aplicar) queda como «deseado» y el puente lo mantiene.</summary>
        public IDictionary<string, object> EraRasgosMantenidos(string faccion, string tipo, IList<string> agregar, IList<string> quitar, IList<string> soltar, bool reemplazar, bool parcial)
        {
            return EraRasgosInterno(faccion, tipo, agregar, quitar, soltar, reemplazar, parcial, true);
        }

        // Las bibliotecas de rasgos del juego no cambian durante la sesion: se construye una vez por tipo (recorre cientos de rasgos por reflexion, ~5 ms).
        private readonly Dictionary<string, Dictionary<string, RasgoInfo>> cacheRasgoInfo = new Dictionary<string, Dictionary<string, RasgoInfo>>();
        private Dictionary<string, RasgoInfo> CatalogoRasgoInfo(string tipo)
        {
            Dictionary<string, RasgoInfo> cache;
            if (cacheRasgoInfo.TryGetValue(tipo, out cache)) return cache;
            Dictionary<string, RasgoInfo> cat = new Dictionary<string, RasgoInfo>();
            foreach (KeyValuePair<string, Dictionary<string, object>> kv in EraJuego.IndiceOfrecible(tipo))
            {
                RasgoInfo ri = new RasgoInfo();
                ri.Ofrecible = (bool)kv.Value["ofrecible"];
                ri.SePuedeQuitar = (bool)kv.Value["se_puede_quitar"];
                List<string> op = new List<string>();
                foreach (object o in (List<object>)kv.Value["opuestos"]) op.Add((string)o);
                ri.Opuestos = op;
                cat[kv.Key] = ri;
            }
            cacheRasgoInfo[tipo] = cat;
            return cat;
        }

        private IDictionary<string, object> EraRasgosInterno(string faccion, string tipo, IList<string> agregar, IList<string> quitar, IList<string> soltar, bool reemplazar, bool parcial, bool mantener)
        {
            ExigirEscenario();
            if (Array.IndexOf(EraJuego.Tipos, tipo) < 0) throw new ErrorPuente(Codigos.SolicitudInvalida, "tipo debe ser uno de: " + string.Join(", ", EraJuego.Tipos) + ".");
            Faccion f = Buscar(faccion);
            if (agregar.Count + quitar.Count > EraJuego.MaxRasgosPorLlamada) throw new ErrorPuente(Codigos.SolicitudInvalida, "Demasiados rasgos en una llamada (maximo " + EraJuego.MaxRasgosPorLlamada + ").");
            Kingdom k = ReinoPrincipal(f);
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["tipo"] = tipo; r["faccion"] = f.Id;
            if (k == null)
            {
                r["resultado"] = "rechazada"; r["codigo"] = "faccion_eliminada"; r["aplicados"] = new List<object>(); r["quitados"] = new List<object>();
                r["rechazados"] = new List<object>(); r["rasgos_actuales"] = new List<object>();
                return r;
            }
            r["reino"] = k.name;

            Dictionary<string, List<string>> porTipo;
            if (!rasgosEra.TryGetValue(f.Id, out porTipo)) { porTipo = new Dictionary<string, List<string>>(); rasgosEra[f.Id] = porTipo; }
            List<string> propios;
            if (!porTipo.TryGetValue(tipo, out propios)) { propios = new List<string>(); porTipo[tipo] = propios; }
            int tope = eraCfg != null ? eraCfg.MaxRasgosPorTipo : EraJuego.MaxRasgosPorTipoPorDefecto;

            // E5: dejar de mantener lo que se pide soltar (no se quita del juego).
            List<object> soltados = new List<object>();
            foreach (string id in soltar) { if (mant.Soltar(f.Id, tipo, id)) soltados.Add(id); }

            HashSet<string> actuales = new HashSet<string>(EraJuego.RasgosActuales(tipo, k));
            Dictionary<string, RasgoInfo> cat = CatalogoRasgoInfo(tipo);
            // Los rasgos pendientes (deseados pero aun sin poder aplicarse) tambien cuentan para el tope.
            List<string> propiosTope = new List<string>(propios);
            foreach (RasgoDeseado d in mant.De(f.Id, tipo)) { if (!propiosTope.Contains(d.Id)) propiosTope.Add(d.Id); }
            // E5: con mantener, la eleccion gana a un opuesto que el juego puso por azar (p. ej. otro plano de ciudad en una cultura nueva): se quita si el juego lo permite.
            List<string> quitarAuto = new List<string>();
            if (mantener)
            {
                foreach (string id in agregar)
                {
                    RasgoInfo info;
                    if (!cat.TryGetValue(id, out info) || !info.Ofrecible) continue;
                    foreach (string o in info.Opuestos)
                    {
                        RasgoInfo oi;
                        if (!actuales.Contains(o) || agregar.Contains(o) || quitar.Contains(o) || quitarAuto.Contains(o) || mant.Buscar(f.Id, tipo, o) != null) continue;
                        if (cat.TryGetValue(o, out oi) && !oi.SePuedeQuitar) continue;
                        quitarAuto.Add(o);
                    }
                }
            }
            List<string> quitarTodo = new List<string>(quitar);
            quitarTodo.AddRange(quitarAuto);
            PlanRasgos plan = ReglasEra.Planear(cat, actuales, propiosTope, tope, agregar, quitarTodo, reemplazar);
            List<object> rechazados = new List<object>(), pendientes = new List<object>();
            // E5: con mantener, un rasgo pedido que el objeto YA tiene (el juego lo puso por azar o ya estaba) cuenta como aplicado y queda mantenido: si el juego reemplaza el objeto, se reaplica.
            List<string> deSerie = new List<string>();
            foreach (RechazoRasgo rr in plan.Rechazados)
            {
                if (mantener && rr.Codigo == ReglasEra.YaPresente) { deSerie.Add(rr.Id); continue; }
                rechazados.Add(Rechazo(rr.Id, rr.Codigo, rr.Mensaje));
            }
            List<string> validosQuitar = plan.Quitar, validosAgregar = plan.Agregar;
            List<object> aplicados = new List<object>(), quitados = new List<object>();
            bool creo = false;
            string resultado;
            bool seAplica = rechazados.Count == 0 || (parcial && plan.Agregar.Count + plan.Quitar.Count + deSerie.Count > 0);
            if (!seAplica)
            {
                resultado = "rechazada";
            }
            else
            {
                foreach (string id in validosQuitar)
                {
                    bool ok = false;
                    try { ok = EraJuego.Quitar(tipo, k, id); } catch (Exception) { }
                    if (ok) { quitados.Add(id); propios.Remove(id); mant.Soltar(f.Id, tipo, id); } else rechazados.Add(Rechazo(id, "no_quitado", "El juego no quito el rasgo."));
                }
                foreach (string id in validosAgregar)
                {
                    bool ok = false, c = false;
                    try { ok = EraJuego.Agregar(tipo, k, id, out c); } catch (Exception) { }
                    if (c) creo = true;
                    if (ok) { aplicados.Add(id); propios.Add(id); if (mantener) mant.Desear(f.Id, tipo, id, true, null); }
                    else if (mantener && !EraJuego.ObjetoExiste(tipo, k))
                    {
                        // El reino aun no tiene cultura/idioma/clan: el rasgo queda pendiente y el puente lo aplica en cuanto exista.
                        mant.Desear(f.Id, tipo, id, false, "objeto_ausente");
                        pendientes.Add(Rechazo(id, "objeto_ausente", "El reino aun no tiene este objeto; el puente aplicara el rasgo en cuanto exista."));
                    }
                    else rechazados.Add(Rechazo(id, "no_aplicado", "El juego no aplico el rasgo."));
                }
                foreach (string id in deSerie)
                {
                    aplicados.Add(id);
                    if (!propios.Contains(id)) propios.Add(id);
                    mant.Desear(f.Id, tipo, id, true, null);
                }
                bool todoBien = rechazados.Count == 0 && pendientes.Count == 0;
                resultado = todoBien ? "ejecutada" : (aplicados.Count + quitados.Count + pendientes.Count > 0 ? "parcial" : "rechazada");
                if (aplicados.Count + quitados.Count > 0) Evento("rasgos_aplicados", "faccion", f.Id, "categoria", tipo, "agregados", aplicados.Count, "quitados", quitados.Count);
                if (pendientes.Count > 0) Evento("rasgos_pendientes", "faccion", f.Id, "categoria", tipo, "pendientes", pendientes.Count);
            }
            r["resultado"] = resultado;
            r["aplicados"] = aplicados;
            r["quitados"] = quitados;
            r["rechazados"] = rechazados;
            if (mantener || soltados.Count > 0)
            {
                r["mantener"] = mantener;
                r["pendientes"] = pendientes;
                r["soltados"] = soltados;
                List<object> opq = new List<object>();
                foreach (object q in quitados) { if (quitarAuto.Contains((string)q)) opq.Add(q); }
                r["opuestos_quitados"] = opq;
                r["de_serie"] = deSerie;
            }
            r["creo_religion"] = creo;
            r["tope"] = tope;
            r["rasgos_actuales"] = new List<string>(EraJuego.RasgosActuales(tipo, k));
            r["rasgos_era"] = new List<string>(propios);
            r["rey"] = EraJuego.EstadisticasRey(k);
            return r;
        }

        // ---------------------------------------------------------------- E5: mantenimiento de rasgos (cultura, idioma, religion... que el juego reemplaza)
        private readonly MantenimientoRasgos mant = new MantenimientoRasgos();
        private RasgosMundoReal rasgosReal;
        private int eventosMantenimiento;
        private const int MaxEventosMantenimiento = 400;

        private void EraMantener()
        {
            if (mant.Vacio) return;
            if (rasgosReal == null) rasgosReal = new RasgosMundoReal(this);
            List<CambioMantenimiento> cambios = mant.Revisar(rasgosReal, Time.unscaledTime);
            foreach (CambioMantenimiento c in cambios)
            {
                if (eventosMantenimiento++ >= MaxEventosMantenimiento) break;
                Evento(c.Tipo, "faccion", c.Faccion, "categoria", c.Categoria, "id", c.Id, "codigo", c.Codigo, "creo_religion", c.CreoReligion);
            }
        }

        /// <summary>El mantenimiento sobre el mundo real: busca el reino principal de la faccion y usa EraJuego.</summary>
        private sealed class RasgosMundoReal : IRasgosMundo
        {
            private readonly MundoWorldBox m;
            public RasgosMundoReal(MundoWorldBox mundo) { m = mundo; }
            private Kingdom Reino(string faccion)
            {
                foreach (Faccion f in m.facciones) { if (f.Id == faccion) return m.ReinoPrincipal(f); }
                return null;
            }
            public bool ObjetoExiste(string faccion, string tipo) { return EraJuego.ObjetoExiste(tipo, Reino(faccion)); }
            public ICollection<string> Actuales(string faccion, string tipo)
            {
                Kingdom k = Reino(faccion);
                return k == null ? new List<string>() : new List<string>(EraJuego.RasgosActuales(tipo, k));
            }
            public bool Agregar(string faccion, string tipo, string id, out bool creoReligion)
            {
                creoReligion = false;
                Kingdom k = Reino(faccion);
                if (k == null) return false;
                return EraJuego.Agregar(tipo, k, id, out creoReligion);
            }
            public bool Quitar(string faccion, string tipo, string id)
            {
                Kingdom k = Reino(faccion);
                return k != null && EraJuego.Quitar(tipo, k, id);
            }
            public IDictionary<string, RasgoInfo> Catalogo(string tipo) { return m.CatalogoRasgoInfo(tipo); }
            public int Tope { get { return m.eraCfg != null ? m.eraCfg.MaxRasgosPorTipo : EraJuego.MaxRasgosPorTipoPorDefecto; } }
        }

        // ---------------------------------------------------------------- IEra: muro y minerales
        public IDictionary<string, object> EraMuro(string operacion, int ancho)
        {
            ExigirEscenario();
            Dictionary<string, object> r = new Dictionary<string, object>();
            if (operacion == "quitar")
            {
                bool habia = EraJuego.MuroPuesto;
                int x0 = EraJuego.MuroX0, x1 = EraJuego.MuroX1;
                int n = EraJuego.QuitarMuro();
                if (habia) Evento("muro_quitado", "x0", x0, "x1", x1, "casillas", n);
                r["casillas_restauradas"] = n;
                r["resto_del_mapa"] = EraJuego.HuellaDelMuro;
            }
            else
            {
                int a = ancho > 0 ? ancho : (eraCfg != null && eraCfg.MuroAncho > 0 ? eraCfg.MuroAncho : 4);
                int n = EraJuego.PonerMuro(a, eraCfg != null ? eraCfg.MuroTipo : "mountains");
                Evento("muro_puesto", "x0", EraJuego.MuroX0, "x1", EraJuego.MuroX1, "casillas", n);
                r["casillas_puestas"] = n;
            }
            Juego.Estabilizar();
            r["muro_puesto"] = EraJuego.MuroPuesto;
            r["x0"] = EraJuego.MuroX0; r["x1"] = EraJuego.MuroX1;
            return r;
        }

        /// <summary>E4 (aditivo): cambia la velocidad del juego entre dos avances (el avance siguiente la usa). No toca nada mas.</summary>
        public IDictionary<string, object> EraVelocidad(string vel)
        {
            ExigirEscenario();
            if (avance != null) throw new ErrorPuente(Codigos.JuegoOcupado, "Hay un avance en curso.");
            if (Array.IndexOf(Velocidades, vel) < 0) throw new ErrorPuente(Codigos.SolicitudInvalida, "velocidad debe ser x1, x2, x3, x4, x5, x10, x15, x20 o x40.");
            string antes = velocidad;
            Config.setWorldSpeed(vel, false);
            velocidad = vel;
            Evento("velocidad_cambiada", "de", antes, "a", vel);
            return Json.Objeto("velocidad", vel, "anterior", antes);
        }

        public IDictionary<string, object> EraMinerales(string faccion, string mineral, int cantidad, int radio, bool espejo)
        {
            ExigirEscenario();
            if (Array.IndexOf(EraJuego.MineralesPermitidos, mineral) < 0) throw new ErrorPuente(Codigos.SolicitudInvalida, "mineral debe ser uno de: " + string.Join(", ", EraJuego.MineralesPermitidos) + ".");
            Faccion f = Buscar(faccion);
            City c = CiudadDe(f);
            if (c == null) throw new ErrorPuente(Codigos.SolicitudInvalida, "La faccion no tiene ciudad.");
            WorldTile centro = c.getTile(false);
            bool izq = centro.x < MapBox.width / 2;
            HashSet<long> zonas = new HashSet<long>();
            List<WorldTile> pos = EraJuego.PosicionesDepositos(centro, cantidad, radio, zonas, izq);
            int puestos = 0, espejados = 0;
            List<object> lista = new List<object>();
            foreach (WorldTile t in pos)
            {
                Building b = EraJuego.PonerEdificio(mineral, t);
                if (b != null) puestos++;
                List<object> par = new List<object>(); par.Add(t.x); par.Add(t.y); lista.Add(par);
                if (espejo)
                {
                    WorldTile e = World.world.GetTile(MapBox.width - 1 - t.x, t.y);
                    if (EraJuego.PonerEdificio(mineral, e) != null) espejados++;
                }
            }
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["faccion"] = f.Id; r["mineral"] = mineral;
            r["pedidos"] = cantidad; r["colocados"] = puestos; r["espejados"] = espejados;
            r["posiciones"] = lista;
            Evento("minerales_colocados", "faccion", f.Id, "mineral", mineral, "colocados", puestos, "espejados", espejados);
            return r;
        }
    }
}
