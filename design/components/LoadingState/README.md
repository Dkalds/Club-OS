# LoadingState

Esqueleto con la forma del contenido que va a llegar.

**Qué aporta quien lo usa:** la forma (filas de lista, card destacada) y cuántas repeticiones.

- Bloques `surface-2` con el radio del elemento real; pulso suave que se desactiva con `prefers-reduced-motion`.
- Nunca un spinner a pantalla completa. Si tarda más de 10 s, pasa a `ErrorState`.
