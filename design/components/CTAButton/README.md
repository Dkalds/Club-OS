# CTAButton

La acción principal de una pantalla, y sus variantes secundarias.

**Qué aporta quien lo usa:** la etiqueta (verbo en infinitivo, 1–3 palabras: «Nueva sesión», «Añadir a sesión»), la variante y, opcionalmente, un icono a la izquierda.

- `primary`: relleno `brand-accent`, texto `brand-on-accent`. **Uno por pantalla.** Es el único sitio donde el acento del club ocupa una superficie grande.
- `secondary`: borde `line-strong`, texto `ink`. Acciones alternativas (Duplicar, Cancelar).
- `ghost`: solo texto `brand-accent`. Enlaces de sección («Ver todo»).
- `on-spotlight`: dentro de la card destacada. Relleno `on-spotlight`, texto `brand-accent` (el dorado sobre `spotlight` queda en 1.9:1).
- `live`: altura `target-live` (72px), radio `radius-lg`. Solo en el Live Mode y en «Iniciar entrenamiento».
- `block`: ancho completo; es el caso por defecto en móvil para la acción principal.

Altura mínima `target-min`. Etiqueta en `font-display`, mayúsculas. Deshabilitado: `surface-2` + `ink-3`, nunca opacidad sobre el dorado.

**No:** dos botones `primary` en la misma vista; iconos sin etiqueta en acciones principales; texto blanco puro sobre el acento.
