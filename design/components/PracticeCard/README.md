# PracticeCard

Una sesión de entrenamiento: destacada en Inicio, compacta en las listas de Entrenar.

**Qué aporta quien lo usa:** fecha y franja horaria (en la zona horaria del club), título u objetivo principal, duración total (suma de ítems), número de ejercicios, lugar, objetivos (`focus_areas`) y estado (planificada, hecha).

- Destacada: `Card` `spotlight` con kicker, cuándo, título `display-m`, metadatos, etiquetas y el CTA `on-spotlight` «Abrir entrenamiento». Se entiende en 3 segundos: cuándo, qué y cuánto.
- Compacta: `ListRow` con fecha a la izquierda; «Hecho» en `success` y siempre con la palabra.
- Sin sesión próxima: `EmptyState` con «+ Nueva sesión».
