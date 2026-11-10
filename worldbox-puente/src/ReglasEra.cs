// Reglas del formato «era» que NO dependen del juego: validacion de una solicitud de rasgos contra el catalogo ofrecido, los topes y los
// opuestos. Viven en la biblioteca (como ReglasAccion) para probarlas con Anfitrion.exe --autoprueba sin abrir WorldBox.
using System;
using System.Collections.Generic;

namespace PuenteWorldBox
{
    /// <summary>Lo que el catalogo sabe de un rasgo para decidir si se puede agregar o quitar.</summary>
    public sealed class RasgoInfo
    {
        public bool Ofrecible;
        public bool SePuedeQuitar = true;
        public IList<string> Opuestos = new string[0];
    }

    public sealed class RechazoRasgo
    {
        public string Id;
        public string Codigo;
        public string Mensaje;
        public RechazoRasgo(string id, string codigo, string mensaje) { Id = id; Codigo = codigo; Mensaje = mensaje; }
    }

    /// <summary>Resultado de planificar una solicitud: que se agrega, que se quita y que se rechaza (con codigo estable).</summary>
    public sealed class PlanRasgos
    {
        public readonly List<string> Agregar = new List<string>();
        public readonly List<string> Quitar = new List<string>();
        public readonly List<RechazoRasgo> Rechazados = new List<RechazoRasgo>();
        /// <summary>Atomico (por defecto): si algo se rechaza no se aplica nada. Con parcial se aplica lo valido.</summary>
        public bool SeAplica(bool parcial) { return Rechazados.Count == 0 || (parcial && Agregar.Count + Quitar.Count > 0); }
    }

    public static class ReglasEra
    {
        public const string RasgoDesconocido = "rasgo_desconocido";
        public const string RasgoNoOfrecido = "rasgo_no_ofrecido";
        public const string Repetido = "repetido";
        public const string YaPresente = "ya_presente";
        public const string RasgoOpuesto = "rasgo_opuesto";
        public const string TopeRasgos = "tope_rasgos";
        public const string NoPresente = "no_presente";
        public const string NoSePuedeQuitar = "no_se_puede_quitar";

        /// <param name="catalogo">id -> informacion del rasgo (solo los de este tipo).</param>
        /// <param name="actuales">rasgos que el objeto del juego tiene ahora.</param>
        /// <param name="propios">rasgos que ESTA API agrego antes a este objeto (cuentan para el tope).</param>
        /// <param name="tope">maximo de rasgos propios por tipo y faccion.</param>
        public static PlanRasgos Planear(IDictionary<string, RasgoInfo> catalogo, ICollection<string> actuales, IList<string> propios, int tope,
            IList<string> agregar, IList<string> quitar, bool reemplazar)
        {
            PlanRasgos plan = new PlanRasgos();
            List<string> aQuitar = new List<string>(quitar);
            if (reemplazar) { foreach (string p in propios) { if (!aQuitar.Contains(p)) aQuitar.Add(p); } }
            HashSet<string> tiene = new HashSet<string>(actuales);
            foreach (string id in aQuitar)
            {
                RasgoInfo info;
                if (!tiene.Contains(id))
                {
                    if (!reemplazar || quitar.Contains(id)) plan.Rechazados.Add(new RechazoRasgo(id, NoPresente, "El rasgo no esta en la faccion."));
                    continue;
                }
                if (catalogo.TryGetValue(id, out info) && !info.SePuedeQuitar)
                {
                    plan.Rechazados.Add(new RechazoRasgo(id, NoSePuedeQuitar, "El juego no permite quitar este rasgo."));
                    continue;
                }
                plan.Quitar.Add(id);
            }
            HashSet<string> despues = new HashSet<string>(tiene);
            foreach (string id in plan.Quitar) despues.Remove(id);
            int propiosDespues = propios.Count;
            foreach (string id in plan.Quitar) { if (propios.Contains(id)) propiosDespues--; }
            foreach (string id in agregar)
            {
                RasgoInfo info;
                if (!catalogo.TryGetValue(id, out info)) { plan.Rechazados.Add(new RechazoRasgo(id, RasgoDesconocido, "No existe en el catalogo de este tipo.")); continue; }
                if (!info.Ofrecible) { plan.Rechazados.Add(new RechazoRasgo(id, RasgoNoOfrecido, "El rasgo existe pero no se ofrece a los modelos.")); continue; }
                if (plan.Agregar.Contains(id)) { plan.Rechazados.Add(new RechazoRasgo(id, Repetido, "El rasgo esta repetido en la solicitud.")); continue; }
                if (despues.Contains(id)) { plan.Rechazados.Add(new RechazoRasgo(id, YaPresente, "La faccion ya tiene este rasgo.")); continue; }
                string choque = null;
                foreach (string o in info.Opuestos) { if (despues.Contains(o) || plan.Agregar.Contains(o)) { choque = o; break; } }
                if (choque != null) { plan.Rechazados.Add(new RechazoRasgo(id, RasgoOpuesto, "Es opuesto a " + choque + ".")); continue; }
                if (propiosDespues + plan.Agregar.Count + 1 > tope) { plan.Rechazados.Add(new RechazoRasgo(id, TopeRasgos, "Se superaria el tope de " + tope + " rasgos propios de este tipo por faccion.")); continue; }
                plan.Agregar.Add(id);
            }
            return plan;
        }
    }
}
