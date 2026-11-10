// E9: vigilante del muro y unidad de reino del formato «era». Aditivo: se activa desde `opciones.era` (vigilante, unico_reino; ambos activos por omision)
// y se ejecuta en el mismo pulso de 0,25 s reales del seguimiento de linaje (EraTick). Mismas reglas de hilo que MundoWorldBox: solo desde Bombear().
using System;
using System.Collections.Generic;
using System.Diagnostics;
using UnityEngine;

namespace PuenteWorldBox
{
    public sealed partial class MundoWorldBox
    {
        // ---------------------------------------------------------------- vigilante del muro
        private float vigProximo, vigRepararProximo;
        private int vigRevisiones, vigDetectadas, vigDevueltas, vigEliminadas, vigReparadas, vigFueraMax, vigFueraAhora, vigErrores;
        private double vigMsTotal, vigMsMax;
        private readonly Dictionary<string, int> vigCausas = new Dictionary<string, int>();
        private readonly HashSet<long> vigVistos = new HashSet<long>();
        private readonly List<object> vigMuestras = new List<object>();
        // posicion (x*100000+y) de cada unidad de civilizacion en la revision anterior: dice si un infractor "salto" (fuerza, teletransporte) o llego andando
        private Dictionary<long, long> vigPrev = new Dictionary<long, long>(), vigPrevNuevo = new Dictionary<long, long>();

        // ---------------------------------------------------------------- unidad de reino
        private int urReunificados, urCiudades, urFallos, urMaxReinosVivos;
        private double urMsTotal, urMsMax;

        private void VigilanciaReiniciar()
        {
            vigProximo = 0f; vigRepararProximo = 0f;
            vigRevisiones = 0; vigDetectadas = 0; vigDevueltas = 0; vigEliminadas = 0; vigReparadas = 0; vigFueraMax = 0; vigFueraAhora = 0; vigErrores = 0;
            vigMsTotal = 0; vigMsMax = 0;
            vigCausas.Clear(); vigVistos.Clear(); vigMuestras.Clear(); vigPrev.Clear(); vigPrevNuevo.Clear();
            urReunificados = 0; urCiudades = 0; urFallos = 0; urMaxReinosVivos = 0; urMsTotal = 0; urMsMax = 0;
        }

        private static string CausaDeCruce(Actor a, WorldTile t, bool enMuro)
        {
            bool barco = false, vuela = false, agua = false;
            try
            {
                string id = a.asset != null ? a.asset.id : "";
                barco = id != null && id.IndexOf("boat", StringComparison.OrdinalIgnoreCase) >= 0;
                vuela = (bool)R.Call(a, "isFlying");
                agua = t.Type != null && (t.Type.ocean || t.Type.liquid);
            }
            catch (Exception) { }
            return VigilanteMuro.Causa(barco, vuela, enMuro, agua);
        }

        private WorldTile TileLibreCerca(WorldTile centro, int lado)
        {
            if (centro == null) return null;
            int x0 = EraJuego.MuroX0, x1 = EraJuego.MuroX1;
            for (int r = 0; r <= 8; r++)
                for (int dx = -r; dx <= r; dx++)
                    for (int dy = -r; dy <= r; dy++)
                    {
                        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;
                        int x = centro.x + dx, y = centro.y + dy;
                        if (x < 0 || y < 0 || x >= MapBox.width || y >= MapBox.height) continue;
                        if (lado == 0 ? x >= x0 : x <= x1) continue;
                        WorldTile t = World.world.GetTile(x, y);
                        if (t == null || t.Type == null || t.Type.block || !t.Type.ground) continue;
                        return t;
                    }
            return null;
        }

        /// <summary>Ciudad viva de la civilizacion `civ` mas cercana (en x) a la unidad, siempre del lado correcto.</summary>
        private WorldTile DestinoDeVuelta(Actor a, int civ, int xActual)
        {
            City mejor = null; int mejorD = int.MaxValue;
            Faccion f = facciones[civ];
            foreach (Kingdom k in f.Reinos)
            {
                if (!Juego.Vivo(k)) continue;
                foreach (City c in k.cities)
                {
                    if (c == null || !c.isAlive()) continue;
                    WorldTile ct = null;
                    try { ct = c.getTile(false); } catch (Exception) { }
                    if (ct == null) continue;
                    if (civ == 0 ? ct.x >= EraJuego.MuroX0 : ct.x <= EraJuego.MuroX1) continue;
                    int d = Math.Abs(ct.x - xActual);
                    if (d < mejorD) { mejorD = d; mejor = c; }
                }
            }
            if (mejor == null) return null;
            return TileLibreCerca(mejor.getTile(false), civ);
        }

        private void EraVigilar()
        {
            if (eraCfg == null || !eraCfg.Vigilante || !EraJuego.MuroPuesto) return;
            float ahora = Time.unscaledTime;
            if (ahora < vigProximo) return;
            vigProximo = ahora + eraCfg.VigilanteIntervalo;
            Stopwatch sw = Stopwatch.StartNew();
            int x0 = EraJuego.MuroX0, x1 = EraJuego.MuroX1;
            if (ahora >= vigRepararProximo)
            {
                vigRepararProximo = ahora + 5f;
                int rep = EraJuego.MuroReparar();
                if (rep > 0) { vigReparadas += rep; Evento("muro_reparado", "casillas", rep); }
            }
            List<Actor> todas = World.world.units.units_only_alive;
            List<Actor> infractores = new List<Actor>();
            List<int> civs = new List<int>();
            List<long> antes = new List<long>();
            vigPrevNuevo.Clear();
            for (int i = 0; i < todas.Count; i++)
            {
                Actor a = todas[i];
                try
                {
                    if (a == null) continue;
                    Kingdom k = a.kingdom;
                    if (k == null) continue;
                    int civ;
                    if (!reinoCiv.TryGetValue(k.getID(), out civ) || civ < 0 || civ > 1) continue;
                    WorldTile t = a.current_tile;
                    if (t == null) continue;
                    long idu = a.getID();
                    long previa; if (!vigPrev.TryGetValue(idu, out previa)) previa = -1;
                    vigPrevNuevo[idu] = (long)t.x * 100000L + t.y;
                    if (VigilanteMuro.Evaluar(civ, t.x, x0, x1) != LadoMuro.Correcto) { infractores.Add(a); civs.Add(civ); antes.Add(previa); }
                }
                catch (Exception) { vigErrores++; }
            }
            Dictionary<long, long> tmp = vigPrev; vigPrev = vigPrevNuevo; vigPrevNuevo = tmp;
            vigRevisiones++;
            vigFueraAhora = infractores.Count;
            if (infractores.Count > vigFueraMax) vigFueraMax = infractores.Count;
            if (infractores.Count > 0)
            {
                string modo = eraCfg.VigilanteModo;
                int devueltas = 0, eliminadas = 0;
                Dictionary<string, object> causasLote = new Dictionary<string, object>();
                for (int j = 0; j < infractores.Count; j++)
                {
                    Actor a = infractores[j];
                    int civ = civs[j];
                    try
                    {
                        WorldTile t = a.current_tile;
                        bool enMuro = t.x >= x0 && t.x <= x1;
                        string causa = CausaDeCruce(a, t, enMuro);
                        int n; vigCausas.TryGetValue(causa, out n); vigCausas[causa] = n + 1;
                        int nl; object ol; causasLote.TryGetValue(causa, out ol); nl = ol == null ? 0 : (int)ol; causasLote[causa] = nl + 1;
                        long id = a.getID();
                        bool nueva = vigVistos.Add(id);
                        if (nueva) vigDetectadas++;
                        if (nueva && vigMuestras.Count < 40)
                        {
                            string idAsset = a.asset != null ? a.asset.id : "?";
                            string tipoCasilla = t.Type != null ? t.Type.id : "?";
                            long pv = antes[j];
                            int salto = pv < 0 ? -1 : Math.Max(Math.Abs((int)(pv / 100000L) - t.x), Math.Abs((int)(pv % 100000L) - t.y));
                            bool enBarco = false; try { enBarco = (bool)R.Get(a, "is_inside_boat"); } catch (Exception) { }
                            bool conCiudad = false; try { conCiudad = a.city != null; } catch (Exception) { }
                            vigMuestras.Add(Json.Objeto("anio", AnioDe(Math.Max(0.0, Juego.TiempoMundo() - t0Escenario)), "faccion", facciones[civ].Id, "asset", idAsset, "causa", causa,
                                "x", t.x, "y", t.y, "casilla", tipoCasilla, "salto_desde_revision_anterior", salto, "antes_en", pv < 0 ? "?" : VigilanteMuro.Evaluar(civ, (int)(pv / 100000L), x0, x1).ToString(), "en_barco", enBarco, "con_ciudad", conCiudad));
                        }
                        if (modo == "observar") continue;
                        WorldTile destino = null;
                        bool esBarco = causa == "barco";
                        if (modo == "devolver" && !esBarco) destino = DestinoDeVuelta(a, civ, t.x);
                        if (VigilanteMuro.Accion(modo, esBarco, destino != null) == "devolver")
                        {
                            a.cancelAllBeh();
                            R.Call(a, "spawnOn", destino, 0f);
                            devueltas++; vigDevueltas++;
                        }
                        else
                        {
                            a.dieSimpleNone();
                            eliminadas++; vigEliminadas++;
                        }
                    }
                    catch (Exception e) { vigErrores++; Medir("VIGILANTE error " + e.GetType().Name + ": " + e.Message); }
                }
                if (vigVistos.Count > 20000) vigVistos.Clear();
                Evento("muro_vigilante", "detectadas", infractores.Count, "devueltas", devueltas, "eliminadas", eliminadas, "modo", modo, "causas", causasLote);
            }
            sw.Stop();
            double ms = sw.Elapsed.TotalMilliseconds;
            vigMsTotal += ms; if (ms > vigMsMax) vigMsMax = ms;
        }

        private Dictionary<string, object> VigilanteEstado()
        {
            bool activo = eraCfg != null && eraCfg.Vigilante;
            Dictionary<string, object> causas = new Dictionary<string, object>();
            foreach (KeyValuePair<string, int> kv in vigCausas) causas[kv.Key] = kv.Value;
            return Json.Objeto("activo", activo, "modo", eraCfg != null ? eraCfg.VigilanteModo : "devolver", "intervalo_s", eraCfg != null ? (double)eraCfg.VigilanteIntervalo : 0.25,
                "revisiones", vigRevisiones, "unidades_detectadas", vigDetectadas, "devueltas", vigDevueltas, "eliminadas", vigEliminadas, "fuera_ahora", vigFueraAhora, "fuera_max", vigFueraMax,
                "casillas_reparadas", vigReparadas, "casillas_rotas_ahora", EraJuego.MuroCasillasRotas(), "errores", vigErrores, "causas", causas, "muestras", vigMuestras,
                "ms_total", Math.Round(vigMsTotal, 1), "ms_max", Math.Round(vigMsMax, 2), "ms_medio", Math.Round(vigRevisiones > 0 ? vigMsTotal / vigRevisiones : 0.0, 3));
        }

        // ---------------------------------------------------------------- unidad de reino (un reino por civilizacion)
        private void EraUnificar()
        {
            if (eraCfg == null || !eraCfg.UnicoReino || !eraActiva) return;
            Stopwatch sw = Stopwatch.StartNew();
            foreach (Faccion f in facciones)
            {
                Kingdom principal = ReinoPrincipal(f);
                if (principal == null) continue;
                List<Kingdom> otros = new List<Kingdom>();
                List<bool> vivos = new List<bool>();
                foreach (Kingdom k in f.Reinos) vivos.Add(Juego.Vivo(k));
                foreach (int ix in UnicoReino.ARecoger(vivos)) otros.Add(f.Reinos[ix]);
                if (otros.Count + 1 > urMaxReinosVivos) urMaxReinosVivos = otros.Count + 1;
                foreach (Kingdom k in otros)
                {
                    int movidas = 0, pob = 0;
                    string nombre = NombreDe(k); long idk = IdDe(k);
                    try
                    {
                        pob = k.getPopulationPeople();
                        List<City> cs = new List<City>(k.cities);
                        foreach (City c in cs)
                        {
                            if (c == null || !c.isAlive()) continue;
                            try { c.joinAnotherKingdom(principal, false, false); movidas++; }
                            catch (Exception e) { urFallos++; Medir("UNICO_REINO error " + e.GetType().Name + ": " + e.Message); }
                        }
                    }
                    catch (Exception e) { urFallos++; Medir("UNICO_REINO error " + e.GetType().Name + ": " + e.Message); }
                    urReunificados++; urCiudades += movidas;
                    Evento("reino_reunificado", "faccion", f.Id, "reino", nombre, "reino_id", idk, "en", NombreDe(principal), "en_id", IdDe(principal), "ciudades", movidas, "poblacion", pob);
                }
            }
            sw.Stop();
            double ms = sw.Elapsed.TotalMilliseconds;
            urMsTotal += ms; if (ms > urMsMax) urMsMax = ms;
        }

        private Dictionary<string, object> UnicoReinoEstado()
        {
            return Json.Objeto("activo", eraCfg != null && eraCfg.UnicoReino, "reunificados", urReunificados, "ciudades_movidas", urCiudades, "fallos", urFallos, "reinos_vivos_max_por_civilizacion", urMaxReinosVivos,
                "ms_total", Math.Round(urMsTotal, 1), "ms_max", Math.Round(urMsMax, 2));
        }
    }
}
