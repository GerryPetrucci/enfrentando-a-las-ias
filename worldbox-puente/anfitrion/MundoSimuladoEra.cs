using System;
using System.Collections.Generic;

namespace PuenteWorldBox.Anfitrion
{
    /// <summary>
    /// IEra del mundo SIMULADO: catalogo pequeno con ids reales del juego, rasgos validados con las mismas ReglasEra que usa la integracion real,
    /// muro y minerales como contadores. No es WorldBox: solo ejerce el protocolo /v1/era/* sin abrir el juego.
    /// </summary>
    public sealed partial class MundoSimulado : IEra, IEraVelocidad, IEraMantenimiento
    {
        private string velocidadSim = "x5";
        private static readonly string[] VelocidadesSim = new string[] { "x1", "x2", "x3", "x4", "x5", "x10", "x15", "x20", "x40" };

        /// <summary>E4 (aditivo): cambio de velocidad entre avances; el simulado solo la recuerda y deja un evento.</summary>
        public IDictionary<string, object> EraVelocidad(string vel)
        {
            Principal();
            ExigirEscenario();
            if (Array.IndexOf(VelocidadesSim, vel) < 0) throw new ErrorPuente(Codigos.SolicitudInvalida, "velocidad debe ser x1, x2, x3, x4, x5, x10, x15, x20 o x40.");
            string antes = velocidadSim;
            velocidadSim = vel;
            EventoSim("velocidad_cambiada");
            return Json.Objeto("velocidad", vel, "anterior", antes);
        }

        private sealed class RasgoSim
        {
            public string Id, Grupo; public bool Ofrecible = true; public string[] Opuestos = new string[0];
            public RasgoSim(string id, string grupo, bool ofrecible, params string[] opuestos) { Id = id; Grupo = grupo; Ofrecible = ofrecible; Opuestos = opuestos; }
        }

        private static readonly Dictionary<string, RasgoSim[]> CatalogoSim = new Dictionary<string, RasgoSim[]>
        {
            { "cultura", new RasgoSim[] { new RasgoSim("roads", "architecture", true), new RasgoSim("city_layout_a", "town_plan", true), new RasgoSim("tiny_legends", "kingdom", true), new RasgoSim("grin_mark", "fate", false) } },
            { "idioma", new RasgoSim[] { new RasgoSim("elegant_words", "harmony", true), new RasgoSim("powerful_words", "spirit", true), new RasgoSim("foolish_glyphs", "knowledge", true, "enlightening_script"), new RasgoSim("enlightening_script", "knowledge", true, "foolish_glyphs") } },
            { "clan", new RasgoSim[] { new RasgoSim("stonefists", "body", true), new RasgoSim("iron_will", "mind", true), new RasgoSim("magic_blood", "spirit", true), new RasgoSim("cursed_blood", "chaos", false) } },
            { "subespecie", new RasgoSim[] { new RasgoSim("hyper_intelligence", "advanced_brain", true), new RasgoSim("high_fecundity", "body", true), new RasgoSim("phenotype_skin_a", "phenotypes", true), new RasgoSim("metamorphosis_wolf", "rebirth", false) } },
            { "religion", new RasgoSim[] { new RasgoSim("zeal_of_conquest", "harmony", true), new RasgoSim("path_of_unity", "harmony", true), new RasgoSim("summon_tornado", "destruction", false) } },
            { "reino", new RasgoSim[] { new RasgoSim("tax_rate_tribute_low", "tribute", true, "tax_rate_tribute_high"), new RasgoSim("tax_rate_tribute_high", "tribute", true, "tax_rate_tribute_low") } },
        };

        private readonly Dictionary<string, HashSet<string>> rasgosSim = new Dictionary<string, HashSet<string>>();   // faccion|tipo -> ids
        private readonly Dictionary<string, List<string>> rasgosEraSim = new Dictionary<string, List<string>>();
        private bool muroSim = true;
        private int depositosSim;
        private readonly List<Dictionary<string, object>> eventosSim = new List<Dictionary<string, object>>();

        public bool EraVerificada { get { return true; } }

        private static Dictionary<string, RasgoInfo> InfoSim(string tipo)
        {
            Dictionary<string, RasgoInfo> d = new Dictionary<string, RasgoInfo>();
            foreach (RasgoSim r in CatalogoSim[tipo]) { RasgoInfo i = new RasgoInfo(); i.Ofrecible = r.Ofrecible; i.Opuestos = r.Opuestos; d[r.Id] = i; }
            return d;
        }

        public IDictionary<string, object> EraCatalogo(string tipo)
        {
            Principal();
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["version"] = 1;
            if (tipo == null)
            {
                Dictionary<string, object> t = new Dictionary<string, object>();
                foreach (KeyValuePair<string, RasgoSim[]> kv in CatalogoSim)
                {
                    int of = 0; foreach (RasgoSim x in kv.Value) { if (x.Ofrecible) of++; }
                    t[kv.Key] = Json.Objeto("total", kv.Value.Length, "ofrecibles", of);
                }
                r["rasgos"] = t;
                r["limites"] = Json.Objeto("max_rasgos_por_tipo", 6, "max_rasgos_por_llamada", 12);
                return r;
            }
            RasgoSim[] lista;
            if (CatalogoSim.TryGetValue(tipo, out lista))
            {
                List<object> l = new List<object>();
                foreach (RasgoSim x in lista) l.Add(Json.Objeto("id", x.Id, "grupo", x.Grupo, "ofrecible", x.Ofrecible, "opuestos", new List<object>(x.Opuestos)));
                r["tipo"] = tipo; r["rasgos"] = l;
                return r;
            }
            if (tipo == "minerales") { r["minerales"] = new List<object> { Json.Objeto("id", "mineral_gold", "da", new List<object>(), "un_solo_uso", true) }; return r; }
            throw new ErrorPuente(Codigos.SolicitudInvalida, "tipo de catalogo desconocido: " + tipo + ".");
        }

        public IDictionary<string, object> EraEstado(int desdeEvento)
        {
            Principal();
            Dictionary<string, object> r = new Dictionary<string, object>();
            r["version"] = 1;
            r["hay_era"] = hayEscenario;
            r["muro"] = Json.Objeto("puesto", muroSim);
            List<object> ev = new List<object>();
            foreach (Dictionary<string, object> e in eventosSim) { if ((int)e["i"] >= desdeEvento) ev.Add(e); }
            r["eventos"] = ev;
            r["siguiente_evento"] = eventosSim.Count;
            r["depositos"] = depositosSim;
            r["mantenimiento"] = mantSim.Resumen();
            r["rasgos_mantenidos"] = mantSim.EstadoDe("a");
            return r;
        }

        private void EventoSim(string tipo)
        {
            Dictionary<string, object> e = Json.Objeto("i", eventosSim.Count, "tipo", tipo, "anio", 1);
            eventosSim.Add(e);
        }

        // ------------------------------------------------------------------ E5: mantenimiento de rasgos (cultura/idioma/religion que el juego reemplaza)
        private readonly MantenimientoRasgos mantSim = new MantenimientoRasgos();
        private readonly HashSet<string> objetosAusentesSim = new HashSet<string>();   // "faccion|tipo": el objeto (cultura, idioma...) aun no existe
        private RasgosSimulados rasgosMundoSim;

        /// <summary>Solo pruebas: el juego aun no tiene (o ya tiene) el objeto de ese tipo en esa faccion.</summary>
        public void SimularObjetoAusente(string faccion, string tipo, bool ausente)
        {
            if (ausente) objetosAusentesSim.Add(faccion + "|" + tipo); else objetosAusentesSim.Remove(faccion + "|" + tipo);
        }

        /// <summary>Solo pruebas: el juego reemplaza el objeto y los rasgos del tipo se pierden (E3).</summary>
        public void SimularReemplazo(string faccion, string tipo)
        {
            HashSet<string> tiene;
            if (rasgosSim.TryGetValue(faccion + "|" + tipo, out tiene)) tiene.Clear();
        }

        /// <summary>Un paso del mantenimiento (las pruebas lo llaman a mano). `ahora` = segundos.</summary>
        public List<CambioMantenimiento> MantenerSim(double ahora)
        {
            if (rasgosMundoSim == null) rasgosMundoSim = new RasgosSimulados(this);
            List<CambioMantenimiento> c = mantSim.Revisar(rasgosMundoSim, ahora);
            foreach (CambioMantenimiento x in c) EventoSim(x.Tipo);
            return c;
        }

        public MantenimientoRasgos MantenimientoSim { get { return mantSim; } }

        private sealed class RasgosSimulados : IRasgosMundo
        {
            private readonly MundoSimulado m;
            public RasgosSimulados(MundoSimulado mundo) { m = mundo; }
            public bool ObjetoExiste(string faccion, string tipo) { return !m.objetosAusentesSim.Contains(faccion + "|" + tipo); }
            public ICollection<string> Actuales(string faccion, string tipo)
            {
                HashSet<string> t;
                return m.rasgosSim.TryGetValue(faccion + "|" + tipo, out t) ? new List<string>(t) : new List<string>();
            }
            public bool Agregar(string faccion, string tipo, string id, out bool creoReligion)
            {
                creoReligion = false;
                if (!ObjetoExiste(faccion, tipo)) return false;
                string k = faccion + "|" + tipo;
                HashSet<string> t;
                if (!m.rasgosSim.TryGetValue(k, out t)) { t = new HashSet<string>(); m.rasgosSim[k] = t; }
                t.Add(id);
                return true;
            }
            public bool Quitar(string faccion, string tipo, string id)
            {
                HashSet<string> t;
                if (m.rasgosSim.TryGetValue(faccion + "|" + tipo, out t)) t.Remove(id);
                return true;
            }
            public IDictionary<string, RasgoInfo> Catalogo(string tipo) { return InfoSim(tipo); }
            public int Tope { get { return 3; } }
        }

        public IDictionary<string, object> EraRasgos(string faccion, string tipo, IList<string> agregar, IList<string> quitar, bool reemplazar, bool parcial)
        {
            return EraRasgosInterno(faccion, tipo, agregar, quitar, new string[0], reemplazar, parcial, false);
        }

        public IDictionary<string, object> EraRasgosMantenidos(string faccion, string tipo, IList<string> agregar, IList<string> quitar, IList<string> soltar, bool reemplazar, bool parcial)
        {
            return EraRasgosInterno(faccion, tipo, agregar, quitar, soltar, reemplazar, parcial, true);
        }

        private IDictionary<string, object> EraRasgosInterno(string faccion, string tipo, IList<string> agregar, IList<string> quitar, IList<string> soltar, bool reemplazar, bool parcial, bool mantener)
        {
            Principal();
            Buscar(faccion);
            if (!CatalogoSim.ContainsKey(tipo)) throw new ErrorPuente(Codigos.SolicitudInvalida, "tipo desconocido: " + tipo + ".");
            string clave = faccion + "|" + tipo;
            HashSet<string> tiene;
            if (!rasgosSim.TryGetValue(clave, out tiene)) { tiene = new HashSet<string>(); rasgosSim[clave] = tiene; }
            List<string> propios;
            if (!rasgosEraSim.TryGetValue(clave, out propios)) { propios = new List<string>(); rasgosEraSim[clave] = propios; }
            List<object> soltados = new List<object>();
            foreach (string id in soltar) { if (mantSim.Soltar(faccion, tipo, id)) soltados.Add(id); }
            List<string> propiosTope = new List<string>(propios);
            foreach (RasgoDeseado d in mantSim.De(faccion, tipo)) { if (!propiosTope.Contains(d.Id)) propiosTope.Add(d.Id); }
            PlanRasgos plan = ReglasEra.Planear(InfoSim(tipo), tiene, propiosTope, 3, agregar, quitar, reemplazar);
            List<object> rechazados = new List<object>(), pendientes = new List<object>();
            List<string> deSerie = new List<string>();
            foreach (RechazoRasgo rr in plan.Rechazados)
            {
                if (mantener && rr.Codigo == ReglasEra.YaPresente) { deSerie.Add(rr.Id); continue; }
                rechazados.Add(Json.Objeto("id", rr.Id, "codigo", rr.Codigo, "mensaje", rr.Mensaje));
            }
            List<object> aplicados = new List<object>(), quitados = new List<object>();
            string resultado;
            bool existe = !objetosAusentesSim.Contains(clave);
            if (!(rechazados.Count == 0 || (parcial && plan.Agregar.Count + plan.Quitar.Count + deSerie.Count > 0))) resultado = "rechazada";
            else
            {
                foreach (string id in deSerie) { aplicados.Add(id); if (!propios.Contains(id)) propios.Add(id); mantSim.Desear(faccion, tipo, id, true, null); }
                foreach (string id in plan.Quitar) { tiene.Remove(id); propios.Remove(id); mantSim.Soltar(faccion, tipo, id); quitados.Add(id); }
                foreach (string id in plan.Agregar)
                {
                    if (existe) { tiene.Add(id); propios.Add(id); aplicados.Add(id); if (mantener) mantSim.Desear(faccion, tipo, id, true, null); }
                    else if (mantener) { mantSim.Desear(faccion, tipo, id, false, "objeto_ausente"); pendientes.Add(Json.Objeto("id", id, "codigo", "objeto_ausente", "mensaje", "El reino aun no tiene este objeto.")); }
                    else rechazados.Add(Json.Objeto("id", id, "codigo", "no_aplicado", "mensaje", "El juego no aplico el rasgo."));
                }
                bool todo = rechazados.Count == 0 && pendientes.Count == 0;
                resultado = todo ? "ejecutada" : (aplicados.Count + quitados.Count + pendientes.Count > 0 ? "parcial" : "rechazada");
                if (aplicados.Count + quitados.Count > 0) EventoSim("rasgos_aplicados");
            }
            Dictionary<string, object> r = Json.Objeto("resultado", resultado, "tipo", tipo, "faccion", faccion, "aplicados", aplicados, "quitados", quitados, "rechazados", rechazados,
                "rasgos_actuales", new List<string>(tiene), "tope", 3);
            if (mantener || soltados.Count > 0) { r["mantener"] = mantener; r["pendientes"] = pendientes; r["soltados"] = soltados; }
            return r;
        }

        public IDictionary<string, object> EraMuro(string operacion, int ancho)
        {
            Principal();
            ExigirEscenario();
            muroSim = operacion == "poner";
            EventoSim(muroSim ? "muro_puesto" : "muro_quitado");
            return Json.Objeto("muro_puesto", muroSim, "ancho", ancho);
        }

        public IDictionary<string, object> EraMinerales(string faccion, string mineral, int cantidad, int radio, bool espejo)
        {
            Principal();
            Buscar(faccion);
            if (mineral != "mineral_gold") throw new ErrorPuente(Codigos.SolicitudInvalida, "mineral desconocido: " + mineral + ".");
            depositosSim += cantidad * (espejo ? 2 : 1);
            return Json.Objeto("colocados", cantidad, "espejados", espejo ? cantidad : 0);
        }
    }
}
