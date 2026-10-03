# AppShell

El marco de toda pantalla móvil: cabecera, contenido desplazable y navegación inferior. La vista muestra Inicio del entrenador como composición de referencia.

**Qué aporta quien lo usa:** la cabecera adecuada (`TopNavigation`), el contenido y la pestaña activa. El layout de `/c/[club]` inyecta el branding del club como variables CSS antes de pintar.

- Ancho de contenido hasta `content-max`; margen lateral `space-4`; separación entre bloques `space-6`.
- Orden de Inicio: saludo, próximo entrenamiento (la card `spotlight`), próximo partido, esta semana. Lo primero se entiende en 3 segundos.
- Respeta las áreas seguras (notch y barra de gestos).
