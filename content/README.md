# Contenido de los clubes

Aquí vive el contenido real que un club carga en su biblioteca de ejercicios: no es código ni datos de ejemplo. Cada carpeta es un **paquete**, y `pnpm content:import` lo escribe en el club que se le indique.

```
content/
  <club>/
    <paquete>/
      pack.json        los ejercicios
      diagrams/        las pizarras que nombra pack.json
```

`<club>/<paquete>` solo ordena las carpetas. El comando recibe la ruta del paquete y el slug del club por separado y no deduce uno del otro.

## Importar un paquete

```bash
pnpm content:import content/<club>/<paquete> --club <slug del club>
```

- **Solo crea lo que falta.** Un ejercicio que ya existe no se toca: lo editado en la app manda.
- **`--update` sobrescribe.** Cada ejercicio del paquete vuelve a lo que dice el paquete: ficha, estado, puntos, variantes, objetivos de trabajo, principios y pizarra. Lo que el formato no lleva se conserva: los Standards enlazados, el resumen y el vídeo. El resto de lo retocado en la app en esos ejercicios se pierde.
- **Nunca borra** un ejercicio que el paquete ya no trae.
- **Si una ejecución se corta a mitad**, repetir el comando completa el ejercicio que se quedó sin puntos ni objetivos de trabajo.
- **Solo escribe en un Supabase local**, salvo `ALLOW_REMOTE_IMPORT=true` puesta desde la shell para esa orden.
- Antes de escribir valida el paquete entero y comprueba que el club tiene los objetivos de trabajo y los principios que el paquete nombra. Si algo falla, lo dice todo de una vez y no escribe nada.

Más detalle en el README del repositorio, «Contenido de un club».

## `pack.json`

```json
{
  "id": "mi-paquete",
  "title": "Nombre del paquete",
  "drills": [
    {
      "key": "rueda-de-pases",
      "title": "Rueda de pases",
      "age": [10, null],
      "players": [5, 12],
      "minutes": [8, 10],
      "focus": ["tecnica"],
      "principles": [],
      "equipment": ["Balones"],
      "objective": "Qué se busca con el ejercicio.",
      "setupMd": "**Montaje.** Cómo se coloca.\n\n**Secuencia.** Qué pasa.",
      "points": [{ "text": "Un punto clave", "key": true }, { "text": "Otro punto" }],
      "variants": [{ "title": "Progresión", "description": "Cómo se complica." }],
      "diagram": "diagrams/rueda-de-pases.png",
      "status": "published"
    }
  ]
}
```

### El paquete

| Campo | Obligatorio | Qué es |
|---|---|---|
| `id` | Sí | Identifica el paquete: minúsculas, cifras y guiones, hasta 60 caracteres. Entra en los ids de sus filas: **no se cambia una vez importado**, o la siguiente importación lo duplicaría todo. |
| `title` | Sí | Nombre del paquete, de 1 a 120 caracteres. Solo sale en el informe del comando. |
| `drills` | Sí | Los ejercicios. Al menos uno. |

### Cada ejercicio

| Campo | Obligatorio | Por defecto | Qué es y sus límites |
|---|---|---|---|
| `key` | Sí | | Identifica el ejercicio dentro del paquete: minúsculas, cifras y guiones, hasta 60 caracteres, sin repetir. De ella sale su id: cambiar el título no lo cambia, cambiar la `key` crea otro ejercicio. |
| `title` | Sí | | De 3 a 80 caracteres. |
| `age` | Sí | | `[mínima, máxima]` con el número de la categoría (la «U»), de 8 a 18. Máxima `null`: sin tope. |
| `players` | Sí | | `[mínimo, máximo]`, de 1 a 40. |
| `minutes` | Sí | | `[mínimo, máximo]`, de 1 a 120. |
| `focus` | Sí | | Slugs de objetivos de trabajo del club de destino. Al menos uno, sin repetir. |
| `principles` | No | `[]` | Slugs de principios de juego del club de destino, sin repetir. |
| `equipment` | No | `[]` | Material, hasta 12 elementos. |
| `objective` | No | `null` | Hasta 500 caracteres. |
| `setupMd` | No | `null` | El desarrollo, en Markdown corto, hasta 5.000 caracteres. |
| `points` | No | `[]` | Puntos de coaching: `text` de 1 a 140 caracteres y `key` (`true` si es clave; por defecto, no). Hasta 8, y 3 clave como mucho. |
| `variants` | No | `[]` | Variantes: `title` de 1 a 80 caracteres y `description` opcional de hasta 500. Hasta 5. |
| `diagram` | No | `null` | Ruta de la pizarra, relativa al paquete y con «/». Un `.png`, `.jpg` o `.webp` de hasta 2 MB cuyo contenido sea de ese tipo. |
| `status` | No | `published` | `published` o `draft`. Un borrador importado no tiene autor: solo lo ve dirección. |

Los límites de un ejercicio son los del formulario de la app: todo lo que se importa se puede abrir y guardar en ella. Una propiedad que no esté en estas tablas es un error, para que una errata en un nombre no se pierda en silencio.

El formato no lleva Standards, resumen ni vídeo. Se añaden en la app, y `--update` no los toca.

## Qué hay

- `arcangel/biblioteca-entrenador-2026/`: los 44 ejercicios comunes del manual de pista del club, con su pizarra. Cómo se tradujo cada ficha y de dónde salen la edad y el rango de jugadores está en `docs/superpowers/specs/2026-10-10-importador-de-contenido-design.md`.
