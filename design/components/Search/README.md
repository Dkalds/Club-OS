# Search

Campo de búsqueda textual, siempre encima de los filtros de la biblioteca.

**Qué aporta quien lo usa:** placeholder con el objeto («Buscar ejercicios…»), el valor y el callback (con debounce de ~250 ms; la búsqueda se resuelve en servidor, dentro del club).

- Altura `target-min`, fondo `surface-2`, borde `line-strong` (3.2:1), icono `ink-3`, texto `ink`.
- Foco: anillo `focus-ring`.
- Sin resultados: muestra `EmptyState` con la búsqueda y la opción de limpiar filtros.
