# Filter

Chips para filtrar listas: objetivo, edad, jugadores, duración.

**Qué aporta quien lo usa:** las opciones (vienen de la taxonomía del club, `focus_areas`, nunca fijas en código), la selección actual y el callback de cambio.

- Fila superior: selección única con «Todos» primero; `aria-pressed` marca el chip activo (`brand-accent-soft` + borde y texto `brand-accent`).
- Fila de desplegables: abre una hoja inferior con las opciones; el chip queda activo mientras el filtro tenga valor y muestra el valor elegido.
- Desplazamiento horizontal sin barra; nunca dos filas de chips de selección única.
- Variante `tag` (no interactiva, `radius-xs`): etiquetas de objetivo en cards.

**No:** usar `brand-accent` relleno para chips (reservado al CTA principal); más de 6 chips visibles en la fila superior.
