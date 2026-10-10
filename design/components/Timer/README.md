# Timer

El cronómetro del Live Practice Mode y la pantalla que lo rodea, pensada para usarse en pista con una mano.

**Qué aporta quien lo usa:** el plan de la sesión (ítems con ejercicio, minutos, diagrama y coaching points marcados como clave), el índice actual y los callbacks de anterior, pausa y siguiente.

- Cifras en el estilo `timer` (112px, tabulares); cuenta atrás calculada desde marcas de tiempo, no acumulando intervalos, para que sobreviva a un bloqueo de pantalla.
- Pausado: cifras en `ink-3` y el botón central pasa a «Reanudar».
- Progreso de la sesión en barra `brand-accent` y «3 / 5»; el punto EN DIRECTO usa `danger` siempre con la palabra.
- Solo 3 coaching points (los marcados como clave). El diagrama, a ancho completo.
- Controles abajo, al alcance del pulgar: altura `target-live`, el central es el único `primary`. En el último ejercicio el de la derecha ya no pasa al siguiente: termina el entrenamiento, con su icono y su nombre, y pregunta antes.
- Bajo los controles, cuál viene después («Siguiente: 3x2 continuo · 20 min») y si lo último está guardado.
- Si el ejercicio tiene vídeo, un enlace `ghost` rotulado «Vídeo», bajo la pizarra, que abre otra pestaña. La pizarra no se sustituye.
- Tres caras: sin iniciar (el título de la sesión, lo que dura y «Iniciar»), en curso y terminada. Una sesión sin empezar abre siempre en el primer ejercicio; una empezada, en el que guarda el servidor.
- Pantalla siempre encendida (Wake Lock) y sin navegación inferior. Al llegar a 0: vibración corta si el dispositivo lo permite y paso al siguiente con confirmación.
- Cada «Siguiente» registra el ejercicio como completado con sus minutos reales; uno saltado queda como no completado. Es lo que alimenta la vista de cobertura y la futura IA.
