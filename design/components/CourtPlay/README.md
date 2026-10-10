# CourtPlay

La pizarra: media pista con una jugada que se dibuja sola. Es la portada del acceso, donde todavía no hay club ni fotografía que enseñar.

**Qué aporta quien lo usa:** nada de contenido. Solo la fase de la jugada, que marca el paso en curso de la pantalla.

- El dibujo es el diagrama de pista del producto: líneas en `ink-3`, atacantes como círculos en `ink`, defensores como X y movimientos en `brand-accent`. Línea continua para el corte de un jugador, discontinua para el pase. Fuera de un club, el acento es el de plataforma.
- Trazos: 1.2 la pista, 1.6 atacantes y movimientos, 1.8 las X. Fondo `surface-1`, proporción 375:268.
- La jugada es una puerta atrás en tres fases. Al cargar: la pista, los seis jugadores y el corte. Al pedir el código: el pase. Mientras se comprueba el código: el aro en `ink`.
- Movimiento, una sola vez al cargar: cada línea se traza en 800 ms y las marcas aparecen en 240 ms, escalonadas, todo en menos de 2 s. El pase se traza en 500 ms. Con «reducir movimiento», la jugada está dibujada desde el principio y las fases cambian sin transición.
- Es decorativa: no dice nada que no diga el título, y se esconde a los lectores de pantalla.
- En el móvil va a sangre, arriba, con una línea `line` debajo. Desde 640px es una card (`radius-lg`, borde `line`); desde 1024px se queda a la izquierda, con el formulario a la derecha.
- Una sola pizarra por pantalla, y solo como portada. No sustituye al diagrama de un ejercicio ni lleva texto encima.
