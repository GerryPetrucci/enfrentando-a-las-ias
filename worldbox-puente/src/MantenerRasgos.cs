// Mantenimiento de rasgos del formato «era» (E5, aditivo). El juego REEMPLAZA por su cuenta los objetos cultura, idioma y religion de un reino
// (E3: aplicados en el anio 0 se pierden en 2-3 anios; aplicados con el reino aun sin cultura/idioma/religion el juego los rechaza). Este mecanismo
// recuerda los rasgos «deseados» por faccion y tipo y los vuelve a aplicar cuando el objeto fue reemplazado, o cuando por fin existe. No depende del
// juego: opera sobre IRasgosMundo, de modo que la autoprueba lo ejerce con un mundo falso sin abrir WorldBox.
using System;
using System.Collections.Generic;
using System.Diagnostics;

namespace PuenteWorldBox
{
    /// <summary>Lo que el mantenimiento necesita del mundo, por faccion y tipo de rasgo.</summary>
    public interface IRasgosMundo
    {
        /// <summary>false si el objeto (cultura, idioma...) todavia no existe. La religion se puede crear: existe mientras el rey viva.</summary>
        bool ObjetoExiste(string faccion, string tipo);
        /// <summary>Rasgos que el objeto tiene ahora.</summary>
        ICollection<string> Actuales(string faccion, string tipo);
        /// <summary>Intenta agregar el rasgo; true si despues el objeto lo tiene. Crea la religion si hace falta.</summary>
        bool Agregar(string faccion, string tipo, string id, out bool creoReligion);
        /// <summary>Quita un rasgo del objeto (para dejar sitio a uno elegido cuando el juego puso por azar uno opuesto); true si ya no esta.</summary>
        bool Quitar(string faccion, string tipo, string id);
        /// <summary>Catalogo de un tipo (se pide solo cuando hay algo que reaplicar).</summary>
        IDictionary<string, RasgoInfo> Catalogo(string tipo);
        /// <summary>Tope de rasgos propios por tipo y faccion.</summary>
        int Tope { get; }
    }

    /// <summary>Un rasgo que la faccion quiere conservar.</summary>
    public sealed class RasgoDeseado
    {
        public const string Activo = "activo";
        public const string Pendiente = "pendiente";
        public string Id;
        public string Estado = Pendiente;
        public int Perdidas;          // veces que se detecto que el juego lo habia perdido
        public int Reaplicaciones;    // veces que se volvio a aplicar con exito tras perderlo
        public int Intentos;          // intentos de aplicacion fallidos desde el ultimo exito
        public string Motivo;         // por que no esta aplicado (objeto_ausente, rasgo_opuesto, tope_rasgos, no_aplicado...)
        public double ProximoIntento; // tiempo real (s) antes del cual no se vuelve a intentar
    }

    /// <summary>Un cambio que el mantenimiento hizo o detecto (el mundo lo convierte en evento de la era).</summary>
    public sealed class CambioMantenimiento
    {
        public string Tipo;      // rasgo_perdido | rasgo_reaplicado | rasgo_aplicado_tarde | rasgo_pendiente
        public string Faccion, Categoria, Id, Codigo;
        public bool CreoReligion;
    }

    public sealed class MantenimientoRasgos
    {
        public const string Perdido = "rasgo_perdido";
        public const string Reaplicado = "rasgo_reaplicado";
        public const string AplicadoTarde = "rasgo_aplicado_tarde";
        public const string OpuestoQuitado = "rasgo_opuesto_quitado";
        public const double EsperaTrasFallo = 1.0;   // segundos reales entre intentos fallidos del mismo rasgo

        private readonly Dictionary<string, List<RasgoDeseado>> deseados = new Dictionary<string, List<RasgoDeseado>>();
        private readonly List<string> orden = new List<string>();
        public long Comprobaciones, Reaplicados, Perdidas, AplicadosTarde, OpuestosQuitados;
        public double MsTotal, MsMax;
        private readonly Stopwatch reloj = new Stopwatch();

        private static string Clave(string faccion, string tipo) { return faccion + "|" + tipo; }

        public void Limpiar()
        {
            deseados.Clear(); orden.Clear();
            Comprobaciones = 0; Reaplicados = 0; Perdidas = 0; AplicadosTarde = 0; OpuestosQuitados = 0; MsTotal = 0; MsMax = 0;
        }

        public bool Vacio { get { return deseados.Count == 0; } }

        public IList<RasgoDeseado> De(string faccion, string tipo)
        {
            List<RasgoDeseado> l;
            return deseados.TryGetValue(Clave(faccion, tipo), out l) ? l : new List<RasgoDeseado>();
        }

        public RasgoDeseado Buscar(string faccion, string tipo, string id)
        {
            foreach (RasgoDeseado d in De(faccion, tipo)) { if (d.Id == id) return d; }
            return null;
        }

        /// <summary>Anota un rasgo como deseado. Si ya estaba, solo actualiza su estado. Devuelve el registro.</summary>
        public RasgoDeseado Desear(string faccion, string tipo, string id, bool aplicado, string motivo)
        {
            string k = Clave(faccion, tipo);
            List<RasgoDeseado> l;
            if (!deseados.TryGetValue(k, out l)) { l = new List<RasgoDeseado>(); deseados[k] = l; orden.Add(k); }
            RasgoDeseado d = null;
            foreach (RasgoDeseado x in l) { if (x.Id == id) { d = x; break; } }
            if (d == null) { d = new RasgoDeseado(); d.Id = id; l.Add(d); }
            d.Estado = aplicado ? RasgoDeseado.Activo : RasgoDeseado.Pendiente;
            d.Motivo = aplicado ? null : motivo;
            d.Intentos = 0;
            return d;
        }

        /// <summary>Deja de mantener el rasgo (no lo quita del juego). true si estaba.</summary>
        public bool Soltar(string faccion, string tipo, string id)
        {
            List<RasgoDeseado> l;
            if (!deseados.TryGetValue(Clave(faccion, tipo), out l)) return false;
            for (int i = 0; i < l.Count; i++) { if (l[i].Id == id) { l.RemoveAt(i); return true; } }
            return false;
        }

        /// <summary>Cuantos rasgos de este tipo y faccion se mantienen (cuentan para el tope).</summary>
        public int Cuenta(string faccion, string tipo) { return De(faccion, tipo).Count; }

        /// <summary>
        /// Comprueba todo lo deseado y reaplica lo que falte. `ahora` = segundos reales (reloj no escalado). Barato cuando nada falta: una consulta de
        /// rasgos por faccion y tipo con deseados. Devuelve los cambios para registrarlos como eventos.
        /// </summary>
        public List<CambioMantenimiento> Revisar(IRasgosMundo mundo, double ahora)
        {
            List<CambioMantenimiento> cambios = new List<CambioMantenimiento>();
            if (deseados.Count == 0) return cambios;
            reloj.Reset(); reloj.Start();
            Comprobaciones++;
            foreach (string k in orden)
            {
                List<RasgoDeseado> l = deseados[k];
                if (l.Count == 0) continue;
                int sep = k.IndexOf('|');
                string faccion = k.Substring(0, sep), tipo = k.Substring(sep + 1);
                bool existe = mundo.ObjetoExiste(faccion, tipo);
                HashSet<string> actuales = existe ? new HashSet<string>(mundo.Actuales(faccion, tipo)) : new HashSet<string>();
                List<RasgoDeseado> faltan = new List<RasgoDeseado>();
                foreach (RasgoDeseado d in l)
                {
                    if (actuales.Contains(d.Id))
                    {
                        if (d.Estado != RasgoDeseado.Activo) { d.Estado = RasgoDeseado.Activo; d.Motivo = null; d.Intentos = 0; }
                        continue;
                    }
                    // Si el objeto no existe ahora (p. ej. el reino se quedo sin rey un momento: el clan es el del rey) no se puede saber si el rasgo sigue: no se da por perdido.
                    // Cuando el objeto vuelve, o conserva el rasgo (nada que hacer) o no (perdido y se reaplica).
                    if (!existe) { if (d.Estado != RasgoDeseado.Activo) d.Motivo = "objeto_ausente"; continue; }
                    if (d.Estado == RasgoDeseado.Activo)
                    {
                        d.Estado = RasgoDeseado.Pendiente; d.Perdidas++; d.Motivo = "perdido"; d.ProximoIntento = 0; Perdidas++;
                        cambios.Add(Cambio(Perdido, faccion, tipo, d.Id, d.Motivo));
                    }
                    if (ahora < d.ProximoIntento) continue;
                    faltan.Add(d);
                }
                if (faltan.Count == 0) continue;
                // Si el juego puso por azar un rasgo OPUESTO al elegido (p. ej. otro plano de ciudad en una cultura nueva), la eleccion gana: se quita ese opuesto
                // (solo si el juego deja quitarlo y no es otro rasgo deseado).
                IDictionary<string, RasgoInfo> cat = mundo.Catalogo(tipo);
                foreach (RasgoDeseado d in faltan)
                {
                    RasgoInfo info;
                    if (!cat.TryGetValue(d.Id, out info) || !info.Ofrecible) continue;
                    foreach (string o in info.Opuestos)
                    {
                        RasgoInfo oi;
                        if (!actuales.Contains(o) || Buscar(faccion, tipo, o) != null) continue;
                        if (cat.TryGetValue(o, out oi) && !oi.SePuedeQuitar) continue;
                        bool quitado = false;
                        try { quitado = mundo.Quitar(faccion, tipo, o); } catch (Exception) { quitado = false; }
                        if (quitado) { actuales.Remove(o); OpuestosQuitados++; cambios.Add(Cambio(OpuestoQuitado, faccion, tipo, o, d.Id)); }
                    }
                }
                // Los que ya estan puestos cuentan para el tope; los que faltan se vuelven a planear con las mismas reglas (opuestos, tope).
                List<string> propiosPresentes = new List<string>();
                foreach (RasgoDeseado d in l) { if (actuales.Contains(d.Id)) propiosPresentes.Add(d.Id); }
                List<string> ids = new List<string>();
                foreach (RasgoDeseado d in faltan) ids.Add(d.Id);
                PlanRasgos plan = ReglasEra.Planear(cat, actuales, propiosPresentes, mundo.Tope, ids, new string[0], false);
                foreach (RechazoRasgo rr in plan.Rechazados)
                {
                    RasgoDeseado d = Buscar(faccion, tipo, rr.Id);
                    if (d == null) continue;
                    d.Motivo = rr.Codigo; d.Intentos++; d.ProximoIntento = ahora + EsperaTrasFallo;
                }
                foreach (string id in plan.Agregar)
                {
                    RasgoDeseado d = Buscar(faccion, tipo, id);
                    if (d == null) continue;
                    bool creo = false, ok = false;
                    try { ok = mundo.Agregar(faccion, tipo, id, out creo); } catch (Exception) { ok = false; }
                    if (ok)
                    {
                        bool eraPerdido = d.Perdidas > d.Reaplicaciones;
                        d.Estado = RasgoDeseado.Activo; d.Motivo = null; d.Intentos = 0;
                        if (eraPerdido) { d.Reaplicaciones++; Reaplicados++; CambioMantenimiento c = Cambio(Reaplicado, faccion, tipo, id, null); c.CreoReligion = creo; cambios.Add(c); }
                        else { AplicadosTarde++; CambioMantenimiento c = Cambio(AplicadoTarde, faccion, tipo, id, null); c.CreoReligion = creo; cambios.Add(c); }
                    }
                    else { d.Motivo = mundo.ObjetoExiste(faccion, tipo) ? "no_aplicado" : "objeto_ausente"; d.Intentos++; d.ProximoIntento = ahora + EsperaTrasFallo; }
                }
            }
            reloj.Stop();
            double ms = reloj.Elapsed.TotalMilliseconds;
            MsTotal += ms; if (ms > MsMax) MsMax = ms;
            return cambios;
        }

        private static CambioMantenimiento Cambio(string tipo, string faccion, string categoria, string id, string codigo)
        {
            CambioMantenimiento c = new CambioMantenimiento();
            c.Tipo = tipo; c.Faccion = faccion; c.Categoria = categoria; c.Id = id; c.Codigo = codigo;
            return c;
        }

        /// <summary>Estado para /v1/era/estado: {tipo: [{id, estado, perdidas, reaplicaciones, motivo?}]} de una faccion.</summary>
        public Dictionary<string, object> EstadoDe(string faccion)
        {
            Dictionary<string, object> r = new Dictionary<string, object>();
            foreach (string k in orden)
            {
                int sep = k.IndexOf('|');
                if (k.Substring(0, sep) != faccion) continue;
                List<object> l = new List<object>();
                foreach (RasgoDeseado d in deseados[k])
                {
                    Dictionary<string, object> o = Json.Objeto("id", d.Id, "estado", d.Estado, "perdidas", d.Perdidas, "reaplicaciones", d.Reaplicaciones);
                    if (d.Motivo != null) o["motivo"] = d.Motivo;
                    l.Add(o);
                }
                if (l.Count > 0) r[k.Substring(sep + 1)] = l;
            }
            return r;
        }

        /// <summary>Contadores y costo de rendimiento para /v1/era/estado.</summary>
        public Dictionary<string, object> Resumen()
        {
            int pend = 0, act = 0;
            foreach (KeyValuePair<string, List<RasgoDeseado>> kv in deseados)
                foreach (RasgoDeseado d in kv.Value) { if (d.Estado == RasgoDeseado.Activo) act++; else pend++; }
            return Json.Objeto("deseados_activos", act, "deseados_pendientes", pend, "comprobaciones", Comprobaciones, "perdidas", Perdidas, "reaplicaciones", Reaplicados,
                "aplicados_tarde", AplicadosTarde, "opuestos_quitados", OpuestosQuitados, "ms_total", Math.Round(MsTotal, 2), "ms_max", Math.Round(MsMax, 3), "ms_medio", Comprobaciones == 0 ? 0.0 : Math.Round(MsTotal / Comprobaciones, 4));
        }
    }
}
