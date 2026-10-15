# TopNavigation

Cabecera de pantalla en dos variantes: inicio de sección y detalle.

**Qué aporta quien lo usa:** en `home`, el nombre del club y su subtítulo (de `organization_branding`, nunca escritos en código), el avatar del usuario y los avisos; en `detail`, el título y hasta una acción.

- `home`: marca del club en `font-display` (logo si el club lo ha subido; si no, el nombre en texto plano) a la izquierda, acciones a la derecha.
- `home`, con más de un equipo: entre la marca y el avatar, el selector del equipo activo. Es una píldora como los chips de `Filter` (36px, con el área táctil de `target-min`) con el nombre del equipo que se está viendo, o «Todos», y un chevron. Abre una hoja inferior con «Todos mis equipos» y cada equipo; el elegido lleva una marca. Lo elegido vale para toda la app (Inicio, Agenda, Sesiones y Equipo). Con un solo equipo no se pinta. Un nombre largo se trunca: es la marca la que cede el sitio.
- `detail`: volver (44×44) a la izquierda, título centrado en mayúsculas, una acción o menú a la derecha.
- Fondo `bg`, sin borde; al desplazar, añade una línea `line` inferior.
