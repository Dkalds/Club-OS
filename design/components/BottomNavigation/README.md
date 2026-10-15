# BottomNavigation

La navegación principal móvil. Qué pestañas lleva lo decide el rol de quien entra, no el club:

| Rol | Pestañas |
| --- | --- |
| Quien entrena y la dirección | Inicio · Agenda · Sesiones · Biblioteca · Equipo |
| Jugador y familia | Inicio · Identidad |

**Qué aporta quien lo usa:** las pestañas del rol y la ruta, de la que sale la activa.

- Altura `nav-height` + área segura del dispositivo; fondo `surface-1`, línea superior `line`.
- Activa: icono y etiqueta `brand-accent`, trazo más grueso, `aria-current="page"`. Inactivas: `ink-3`.
- Siempre con icono + texto; nunca solo iconos. Las pestañas se reparten el ancho a partes iguales, sean dos o cinco.
- Siempre hay una pestaña activa, y solo una: en una pantalla sin pestaña en esa barra (la identidad del club, para quien entrena) es Inicio, que es desde donde se llega.
- Los partidos no tienen pestaña: viven en la Agenda, y su ficha la marca.
- «Identidad» es un término de plataforma, el mismo en todos los clubes. El nombre que el club da a su metodología se lee dentro, en sus pantallas.
- Se oculta en el Live Mode y en el Practice Builder a pantalla completa.
