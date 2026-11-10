// Control del 1 vs 1 en el formato «era» (E9, aditivo): lectura de `opciones.era.vigilante` / `unico_reino` y las decisiones puras del vigilante del muro y de la unidad de reino.
// No depende del juego: la integracion con WorldBox (MundoWorldBoxEraVigilancia.cs) las usa, y la autoprueba las ejerce sin abrirlo.
using System;
using System.Collections.Generic;

namespace PuenteWorldBox
{
    /// <summary>Configuracion del control del 1 vs 1. Por omision todo esta ACTIVO: `unico_reino:false` y `vigilante:false` son para pruebas.</summary>
    public sealed class ControlEraConfig
    {
        public bool UnicoReino = true;
        public bool Vigilante = true;
        public string Modo = "devolver";          // devolver | eliminar | observar (solo cuenta)
        public float Intervalo = 0.25f;           // segundos reales entre revisiones (0.1 a 10)

        public static readonly string[] Modos = new string[] { "devolver", "eliminar", "observar" };

        private static ErrorPuente Mal(string m) { return new ErrorPuente(Codigos.SolicitudInvalida, m); }

        public static ControlEraConfig Leer(IDictionary<string, object> era)
        {
            ControlEraConfig c = new ControlEraConfig();
            object v;
            if (era.TryGetValue("unico_reino", out v) && v != null)
            {
                if (!(v is bool)) throw Mal("'opciones.era.unico_reino' debe ser booleano.");
                c.UnicoReino = (bool)v;
            }
            if (era.TryGetValue("vigilante", out v) && v != null)
            {
                if (v is bool) c.Vigilante = (bool)v;
                else
                {
                    IDictionary<string, object> d = v as IDictionary<string, object>;
                    if (d == null) throw Mal("'opciones.era.vigilante' debe ser booleano u objeto {activo, modo, intervalo_s}.");
                    object o;
                    if (d.TryGetValue("activo", out o) && o != null)
                    {
                        if (!(o is bool)) throw Mal("'opciones.era.vigilante.activo' debe ser booleano.");
                        c.Vigilante = (bool)o;
                    }
                    if (d.TryGetValue("modo", out o) && o != null)
                    {
                        string m = o as string;
                        if (m == null || Array.IndexOf(Modos, m) < 0) throw Mal("'opciones.era.vigilante.modo' debe ser devolver, eliminar u observar.");
                        c.Modo = m;
                    }
                    if (d.TryGetValue("intervalo_s", out o) && o != null)
                    {
                        double dv = o is long ? (double)(long)o : (o is double ? (double)o : -1.0);
                        if (dv < 0.1 || dv > 10.0) throw Mal("'opciones.era.vigilante.intervalo_s' debe estar entre 0.1 y 10.");
                        c.Intervalo = (float)dv;
                    }
                }
            }
            return c;
        }
    }

    public enum LadoMuro { Correcto, SobreElMuro, LadoContrario }

    public static class VigilanteMuro
    {
        /// <summary>Faccion 0 = izquierda (x &lt; x0), faccion 1 = derecha (x &gt; x1). Una casilla del muro (x0..x1) nunca es correcta.</summary>
        public static LadoMuro Evaluar(int faccion, int x, int x0, int x1)
        {
            if (x >= x0 && x <= x1) return LadoMuro.SobreElMuro;
            bool izquierda = x < x0;
            return (faccion == 0) == izquierda ? LadoMuro.Correcto : LadoMuro.LadoContrario;
        }

        /// <summary>Causa registrada del cruce; el orden importa (un barco que vuela, o esta en el agua, cuenta como barco).</summary>
        public static string Causa(bool barco, bool volador, bool sobreElMuro, bool enAgua)
        {
            if (barco) return "barco";
            if (volador) return "volador";
            if (sobreElMuro) return "sobre_el_muro";
            if (enAgua) return "agua";
            return "tierra";
        }

        /// <summary>Que hacer con un infractor: "observar" solo cuenta; los barcos (no se pueden dejar en tierra) y las unidades sin ciudad a donde volver se eliminan.</summary>
        public static string Accion(string modo, bool esBarco, bool hayDestino)
        {
            if (modo == "observar") return "observar";
            if (modo == "devolver" && !esBarco && hayDestino) return "devolver";
            return "eliminar";
        }
    }

    public static class UnicoReino
    {
        /// <summary>Reino principal de una civilizacion: el fundador si vive, y si no el primer derivado vivo (orden de aparicion). -1 si ninguno vive.</summary>
        public static int Principal(IList<bool> vivosEnOrden)
        {
            for (int i = 0; i < vivosEnOrden.Count; i++) if (vivosEnOrden[i]) return i;
            return -1;
        }

        /// <summary>Indices de los reinos vivos que se reunen al principal (todos los demas vivos de la misma civilizacion).</summary>
        public static List<int> ARecoger(IList<bool> vivosEnOrden)
        {
            List<int> r = new List<int>();
            int p = Principal(vivosEnOrden);
            if (p < 0) return r;
            for (int i = 0; i < vivosEnOrden.Count; i++) if (i != p && vivosEnOrden[i]) r.Add(i);
            return r;
        }
    }
}
