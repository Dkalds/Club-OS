# ListRow

Fila navegable dentro de una card `flush`: agenda semanal, secciones de The Way, menús de gestión.

**Intentional addition:** no está en la lista del brief; la usan Inicio, The Way, Dirección y Partidos, y sin ella cada pantalla inventaría su propia fila.

**Qué aporta quien lo usa:** un elemento inicial (fecha `cos-date`, número de sección en `numeral` o avatar), nombre, una línea de apoyo y el destino.

- En código pinta un `<li>`: va como hija directa de `<Card variant="flush" as="ul">`, que es la lista.
- Altura mínima 56px; separadores `line`; trailing en `ink-3` con chevron.
- La fila entera es el área táctil.
