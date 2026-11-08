using System.Reflection;
using System.Runtime.CompilerServices;

[assembly: AssemblyTitle("PuenteWorldBox")]
[assembly: AssemblyDescription("Puente HTTP de bucle local entre un orquestador y WorldBox (protocolo v1).")]
[assembly: AssemblyVersion("0.1.0.0")]

// El anfitrion de pruebas ejercita internos (cola, analizador HTTP, cache) en su --autoprueba.
[assembly: InternalsVisibleTo("Anfitrion")]
