// E10: color y nombre de cada reino del formato «era» (`opciones.era.facciones[{faccion, color, nombre_reino}]`). Aditivo y opcional: sin esa opcion no se toca nada.
// Color: el juego deja colores personalizados (ColorAsset.tryMakeNewColorAsset crea uno con el hex EXACTO); Kingdom.updateColor solo acepta uno que este en la
// biblioteca de colores de reinos (KingdomColorsLibrary), asi que se anade ahi. Las ciudades, el territorio, el borde y la etiqueta salen del color del reino:
// una ciudad conquistada o reunificada toma el del reino que la tiene. Nombre: Kingdom.data.name + custom_name (el juego no regenera un nombre «propio»).
// Cada pulso (0,25 s reales) se comprueba que el reino principal de cada civilizacion siga con su color y su nombre (por si el fundador cae y otro reino hereda).
using System;
using System.Collections.Generic;
using UnityEngine;

namespace PuenteWorldBox
{
    public sealed partial class MundoWorldBox
    {
        private int presAplicados, presReaplicados, presFallos;
        private readonly Dictionary<string, string> presError = new Dictionary<string, string>();

        private static string HexDe(Color32 c)
        {
            return "#" + c.r.ToString("X2") + c.g.ToString("X2") + c.b.ToString("X2");
        }

        /// <summary>Color efectivo del reino segun el juego ("#RRGGBB" del relleno) o null.</summary>
        private static string ColorDeReino(Kingdom k)
        {
            try { ColorAsset ca = k.getColor(); return ca == null ? null : HexDe(ca.getColorMain32()); } catch (Exception) { return null; }
        }

        private static ColorAsset ColorPersonalizado(string hex)
        {
            // Se construye a mano: ColorAsset.tryMakeNewColorAsset deja un LogError («already exists in global list») que abre la consola de errores del juego sobre el mapa.
            ColorAsset ca;
            string clave = hex.ToUpperInvariant();
            if (coloresPropios.TryGetValue(clave, out ca) && AssetManager.kingdom_colors_library.list.Contains(ca)) return ca;
            ca = new ColorAsset();
            ca.id = "era_color_" + clave.Substring(1);
            ca.color_main = clave; ca.color_main_2 = clave; ca.color_banner = clave; ca.color_text = clave;
            ca.initColor(); // sin esto los colores derivados (getColorMain32...) quedan en negro
            AssetManager.kingdom_colors_library.add(ca);
            coloresPropios[clave] = ca;
            return ca;
        }
        private static readonly Dictionary<string, ColorAsset> coloresPropios = new Dictionary<string, ColorAsset>();

        /// <summary>Aplica color y nombre al reino `k` de la faccion `f`. Devuelve true si cambio algo. `conNombre`: false para los reinos derivados (solo color).</summary>
        private bool EraAplicarPresentacion(Faccion f, Kingdom k, bool conNombre)
        {
            PresentacionFaccion p;
            if (eraCfg == null || k == null || !eraCfg.Presentacion.TryGetValue(f.Id, out p)) return false;
            bool cambio = false;
            try
            {
                if (p.Color != null && !string.Equals(ColorDeReino(k), p.Color, StringComparison.OrdinalIgnoreCase))
                {
                    ColorAsset ca = ColorPersonalizado(p.Color);
                    k.updateColor(ca);
                    cambio = true;
                    try { R.Call(R.Get(World.world, "zone_calculator"), "setDrawnZonesDirty"); } catch (Exception) { }
                }
                if (conNombre && p.NombreReino != null && k.name != p.NombreReino)
                {
                    k.data.name = p.NombreReino;
                    k.data.custom_name = true;
                    nombreReino[k] = p.NombreReino;
                    cambio = true;
                }
                presError.Remove(f.Id);
            }
            catch (Exception e)
            {
                presFallos++;
                presError[f.Id] = e.GetType().Name + ": " + e.Message;
                Medir("PRESENTACION error " + f.Id + " " + e.GetType().Name + ": " + e.Message);
            }
            return cambio;
        }

        private string capaReinosEstado;

        /// <summary>Capa de mapa «reinos»: territorio y etiquetas con el color y el nombre del reino. Cada capa de meta tiene su opcion de jugador (MetaTypeAsset.option_id: map_kingdom_layer, map_city_layer...); queda solo la de reinos.</summary>
        private string EraCapaReinos()
        {
            try
            {
                List<string> activas = new List<string>();
                foreach (MetaTypeAsset a in AssetManager.meta_type_library.list)
                {
                    if (string.IsNullOrEmpty(a.option_id)) continue;
                    bool quiero = a.map_mode == MetaType.Kingdom;
                    PlayerConfig.setOptionBool(a.option_id, quiero);
                    if (quiero) activas.Add(a.option_id);
                }
                try { R.Call(R.Get(World.world, "zone_calculator"), "setDrawnZonesDirty"); } catch (Exception) { }
                capaReinosEstado = activas.Count > 0 ? "reinos" : "sin_opcion";
            }
            catch (Exception e) { capaReinosEstado = "error: " + e.GetType().Name + ": " + e.Message; Medir("CAPA_REINOS " + capaReinosEstado); }
            return capaReinosEstado;
        }

        /// <summary>Despues de fundar. Registra cuanto se aplico.</summary>
        private List<object> EraPresentacionInicial(List<Faccion> fs)
        {
            List<object> res = new List<object>();
            if (eraCfg.Presentacion.Count > 0 && eraCfg.MapaReinos) EraCapaReinos();
            foreach (Faccion f in fs)
            {
                PresentacionFaccion p;
                if (!eraCfg.Presentacion.TryGetValue(f.Id, out p)) continue;
                bool c = EraAplicarPresentacion(f, f.Reino, true);
                if (c) presAplicados++;
                res.Add(Json.Objeto("faccion", f.Id, "color_pedido", p.Color, "color_aplicado", ColorDeReino(f.Reino), "nombre_pedido", p.NombreReino, "nombre_aplicado", f.Reino.name,
                    "ok", (p.Color == null || string.Equals(ColorDeReino(f.Reino), p.Color, StringComparison.OrdinalIgnoreCase)) && (p.NombreReino == null || f.Reino.name == p.NombreReino),
                    "error", presError.ContainsKey(f.Id) ? presError[f.Id] : null));
            }
            return res;
        }

        // Cada pulso: el reino principal (y, con unico_reino apagado, los derivados vivos en color) conserva color y nombre.
        private void EraPresentacionMantener()
        {
            if (!eraActiva || eraCfg == null || eraCfg.Presentacion.Count == 0) return;
            foreach (Faccion f in facciones)
            {
                if (!eraCfg.Presentacion.ContainsKey(f.Id)) continue;
                Kingdom principal = ReinoPrincipal(f);
                if (principal == null) continue;
                if (EraAplicarPresentacion(f, principal, true)) presReaplicados++;
                foreach (Kingdom k in f.Reinos)
                {
                    if (k == principal || !Juego.Vivo(k)) continue;
                    if (EraAplicarPresentacion(f, k, false)) presReaplicados++;
                }
            }
        }

        private Dictionary<string, object> PresentacionEstado()
        {
            List<object> actual = new List<object>();
            if (eraCfg != null && eraActiva)
            {
                foreach (Faccion f in facciones)
                {
                    PresentacionFaccion p;
                    if (!eraCfg.Presentacion.TryGetValue(f.Id, out p)) continue;
                    Kingdom k = ReinoPrincipal(f);
                    actual.Add(Json.Objeto("faccion", f.Id, "color_pedido", p.Color, "color_actual", k == null ? null : ColorDeReino(k), "nombre_pedido", p.NombreReino, "nombre_actual", k == null ? null : k.name));
                }
            }
            return Json.Objeto("activo", eraCfg != null && eraCfg.Presentacion.Count > 0, "capa_reinos", capaReinosEstado, "reaplicados", presReaplicados, "fallos", presFallos, "facciones", actual);
        }
    }
}
