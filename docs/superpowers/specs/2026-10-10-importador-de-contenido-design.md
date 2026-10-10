# Importador de contenido y paquete «Biblioteca del entrenador» · Diseño

Fecha: 10 oct 2026. Estado: pendiente de revisión del propietario.

## Propósito

El club piloto tiene un manual de pista («Biblioteca del entrenador · Manual de pista 2026», documento de Word) con 44 ejercicios comunes, cada uno con su pizarra. Hoy la biblioteca de CLUB OS solo tiene los ejercicios ficticios del seed, sin diagrama.

Esta entrega lleva esos 44 ejercicios a la biblioteca del club como contenido real, por un camino propio que no toca el seed: un **paquete de contenido** versionado en el repositorio y un **comando de importación** repetible.

Sale bien si, tras importar en local, un entrenador del club abre la biblioteca, filtra por objetivo, edad o jugadores, y encuentra los 44 ejercicios publicados, cada uno con su pizarra, su desarrollo, sus puntos de coaching y su progresión; y si repetir el comando no cambia nada.

## Decisiones tomadas

Con el propietario, el 10 oct 2026:

1. **Contenido real, aparte del seed.** El seed y sus tests no cambian. Donde se importe, los ejercicios del manual conviven con los de ejemplo.
2. **Solo los 44 ejercicios comunes** (capítulo 05). Los 24 por categoría (capítulo 06) quedan fuera: comparten el mismo texto de montaje, secuencia, corrección y progresión, y varios son versiones de uno común.
3. **El paquete se guarda en el repositorio**, que es público: el contenido del manual queda publicado con el código.
4. **Edad y rango de jugadores los propone esta especificación** (tabla de más abajo) y los revisa el propietario antes de cargar nada.
5. **Enfoque:** importador por línea de comandos en `scripts/`. No se amplía el seed ni se añade una pantalla de importación.

## Supuestos

- No cambia el esquema ni la interfaz: sin migraciones, sin pgTAP nuevo, sin e2e nuevo.
- Los ejercicios entran publicados y sin autor (`created_by` a null): los ve todo el cuerpo técnico y los edita dirección.
- Cargar el paquete en un Supabase remoto es un paso aparte, que decide el propietario. Esta entrega solo lo importa en local.

## El paquete

### Ubicación

```
content/
  README.md                         formato del paquete y cómo importarlo
  arcangel/
    biblioteca-entrenador-2026/
      pack.json
      diagrams/
        01-sellar-al-tirador.png
        …
        44-lectura-de-ayudas-2x2.png
```

`content/<club>/<paquete>/` es una convención para ordenar; el importador recibe la ruta y el slug del club por separado y no deduce uno del otro.

### Formato de `pack.json`

```json
{
  "id": "biblioteca-entrenador-2026",
  "title": "Biblioteca del entrenador · Manual de pista 2026",
  "drills": [
    {
      "key": "sellar-al-tirador",
      "title": "Sellar al tirador",
      "age": [12, null],
      "players": [4, 12],
      "minutes": [5, 8],
      "focus": ["rebote"],
      "principles": ["rebote"],
      "equipment": ["Balones"],
      "objective": "Impedir segunda opción tras tiro frontal.",
      "setupMd": "**Montaje.** 2x2, dos exteriores y un entrenador tirador.\n\n**Secuencia.** Tiro del entrenador; defensores encuentran pareja, sellan y capturan; salida con pase.\n\n**Indicador.** Rebotes defensivos / tiros fallados.",
      "points": [
        { "text": "Mirar hombre antes de balón", "key": true },
        { "text": "Pies activos", "key": true },
        { "text": "Error frecuente: saltar directamente sin contactar" }
      ],
      "variants": [
        { "title": "Progresión", "description": "Añadir tercer atacante desde esquina." }
      ],
      "diagram": "diagrams/01-sellar-al-tirador.png"
    }
  ]
}
```

- `id` identifica el paquete y entra en los ids de sus filas. No se cambia una vez importado.
- `key` identifica el ejercicio dentro del paquete (minúsculas, cifras y guiones). Es explícita para que cambiar un título en una edición posterior no cambie el id.
- `age` es `[mínima, máxima | null]` con el número de la categoría (la «U»); `players` y `minutes`, `[mínimo, máximo]`.
- `focus` y `principles` son slugs de objetivos de trabajo y de principios **del club de destino**.
- `diagram` es una ruta relativa al paquete, opcional. Admite `.png`, `.jpg` y `.webp`.
- `status` es opcional: `published` (por defecto) o `draft`.
- El formato no lleva Standards. El manual no los nombra por ejercicio; si un paquete futuro los necesita, se añaden entonces.

### Validación

Al leer el paquete se valida todo y se informa de todos los errores a la vez, antes de tocar la base:

- los límites de un ejercicio: título de 3 a 80 caracteres, objetivo hasta 500, desarrollo hasta 5.000, punto de coaching de 1 a 140, variante con título de 1 a 80 y descripción hasta 500, hasta 12 elementos de material, jugadores de 1 a 40, minutos de 1 a 120, edad de 8 a 18, y mínimos que no superan a sus máximos;
- los que pone el formulario de la app y la base no: hasta 8 puntos de coaching, 3 de ellos clave como mucho, hasta 5 variantes y al menos un objetivo de trabajo;
- `key` con la forma correcta y sin repetir; `id` del paquete con la misma forma;
- cada `diagram` existe, tiene una extensión admitida, pesa entre 1 byte y 2 MB y su ruta no sale de la carpeta del paquete.

Los límites de un ejercicio no se copian: cada uno se pasa por el esquema con el que la app valida su formulario (`drillInputSchema`, en `src/modules/drills/schema.ts`). Así, todo lo que se importa es un ejercicio que dirección puede abrir y guardar en la app sin que el formulario lo rechace.

## Traducción del manual a la ficha

| Campo de la ficha | De dónde sale |
|---|---|
| Título | El del manual, sin el número. |
| Objetivo | OBJETIVO. |
| Desarrollo (`setup_md`) | Tres párrafos: **Montaje.**, **Secuencia.** e **Indicador.**, con el texto de MONTAJE, SECUENCIA e INDICADOR. El indicador, con mayúscula inicial y punto final. |
| Puntos de coaching | OBSERVAR Y CORREGIR, partido por el punto y coma: cada parte es un punto clave, con mayúscula inicial y sin punto final. Después, un punto no clave: «Error frecuente: …», con ERROR FRECUENTE en minúscula y sin punto final. Ningún ejercicio pasa de tres puntos ni de dos clave. |
| Variante | Una, con título «Progresión» y el texto de PROGRESIÓN. |
| Duración | 5–8 minutos, la del manual. |
| Jugadores | Mínimo, «Participantes» del manual. Máximo, una plantilla: 12, o 15 cuando el ejercicio pide 10. |
| Edad | Propuesta de esta especificación (tabla siguiente). |
| Objetivo de trabajo | El bloque: rebote defensivo y ofensivo → `rebote`; defensa activa → `defensa`; transición → `transicion`; ataque posicional → `ataque`; técnica individual → `tecnica`. Uno por ejercicio. |
| Principio | El mismo slug que el objetivo de trabajo, salvo técnica individual, que no lleva principio (como en el seed). |
| Standards | Ninguno. |
| Material | «Balones», más lo que el texto nombra o implica: conos, cronómetro, almohadilla de contacto. |
| Diagrama | El PNG del documento, tal cual (1000×540, entre 10 y 17 KB). Lleva dentro el número y el título del manual. |
| Resumen, vídeo | Vacíos. |

Con la regla 8 (qué/por qué): cada ejercicio enseña su objetivo de trabajo y, salvo los de técnica, su principio.

## Edad, jugadores y material de los 44

**Para revisar.** La edad es la categoría mínima; ninguno lleva máxima. Criterio:

- **Ancla en el capítulo 06:** cuando ese capítulo coloca el mismo ejercicio, o su versión directa, en una categoría, esa es la mínima. La columna dice el apartado (por ejemplo, 5.1 es «4x4 presión tras canasta», en Cadete).
- **Formato:** si no hay ancla, la categoría en la que el capítulo 06 introduce ese formato. Técnica sin oposición, U8; 1x1, 2x1 y colectivos sin oposición, U10; 2x2, 3x2 y 3x3, U12; cambios defensivos, 2x1 lateral y 4x3, U14; 4x4, presión tras canasta y 5x4, U16; 5x5, U18.
- **Presión a toda pista** (ejercicio 19): U14, la primera categoría por encima de las edades para las que el capítulo 03 recoge restricciones.

| N.º | Ejercicio | Objetivo | Edad | Criterio | Jugadores | Material |
|---|---|---|---|---|---|---|
| 01 | Sellar al tirador | rebote | U12+ | formato 2x2 | 4–12 | Balones |
| 02 | Cierre desde lado débil | rebote | U12+ | formato 2x2 | 4–12 | Balones |
| 03 | Espalda contra espalda | rebote | U10+ | formato 1x1 | 2–12 | Balones |
| 04 | Rebote largo y primer pase | rebote | U12+ | cap. 06, 3.3 | 6–12 | Balones |
| 05 | Cierre más segundo esfuerzo | rebote | U12+ | formato 2x2 | 4–12 | Balones |
| 06 | 3x3 con salida obligatoria | rebote | U12+ | cap. 06, 3.3 | 6–12 | Balones, Conos |
| 07 | Carrera exterior al aro | rebote | U12+ | formato 2x2 | 4–12 | Balones |
| 08 | Dos cargan, uno equilibra | rebote | U12+ | formato 3x3 | 6–12 | Balones |
| 09 | Toque ofensivo dirigido | rebote | U10+ | formato 1x1 con apoyo | 3–12 | Balones |
| 10 | Rebote tras penetración | rebote | U12+ | formato 3x3 | 6–12 | Balones |
| 11 | Segunda acción en 4 segundos | rebote | U12+ | formato 2x2 | 4–12 | Balones |
| 12 | 4x4 decisión de carga | rebote | U16+ | cap. 06, 5.3 | 8–12 | Balones |
| 13 | 1x1 orientar a banda | defensa | U10+ | cap. 06, 2.1 | 2–12 | Balones, Conos |
| 14 | 1x1 recuperar tras ventaja | defensa | U12+ | cap. 06, 3.4 | 2–12 | Balones |
| 15 | Negación de primera línea | defensa | U12+ | formato 2x2 | 4–12 | Balones |
| 16 | Salto al balón | defensa | U12+ | formato 3x3 | 6–12 | Balones |
| 17 | Cambio defensivo comunicado | defensa | U14+ | cap. 06, 4.2 | 4–12 | Balones |
| 18 | 2x1 lateral de aprendizaje | defensa | U14+ | cap. 06, 4.1 | 3–12 | Balones |
| 19 | Presión 3x3 toda pista | defensa | U14+ | cap. 03, presión | 6–12 | Balones |
| 20 | 4x4 presión tras canasta | defensa | U16+ | cap. 06, 5.1 | 8–12 | Balones |
| 21 | Primer pase a banda | transicion | U10+ | cap. 06, 2.4 | 3–12 | Balones |
| 22 | Carriles 3x0 con decisiones | transicion | U10+ | formato 3x0 | 3–12 | Balones |
| 23 | 2x1 leer al defensor | transicion | U10+ | cap. 06, 2.2 | 3–12 | Balones |
| 24 | 3x2 continuo | transicion | U12+ | cap. 06, 3.2 | 7–12 | Balones |
| 25 | Rebote a transición 4x3 | transicion | U14+ | cap. 06, 4.3 | 7–12 | Balones |
| 26 | 8 segundos con lectura | transicion | U16+ | formato 4x4 | 8–12 | Balones, Cronómetro |
| 27 | Contra-contraataque | transicion | U12+ | formato 3x3 | 6–12 | Balones |
| 28 | Oleadas 5x4 a 5x5 | transicion | U16+ | cap. 06, 5.2 | 10–15 | Balones |
| 29 | Pasar y cortar 2x2 | ataque | U12+ | cap. 06, 3.1 | 4–12 | Balones |
| 30 | Puerta atrás por negación | ataque | U12+ | formato 2x2 | 4–12 | Balones |
| 31 | Penetrar y doblar 3x3 | ataque | U14+ | cap. 06, 4.4 | 6–12 | Balones |
| 32 | 1x1 con espacio real | ataque | U10+ | formato 1x1 | 3–12 | Balones |
| 33 | Corte y reemplazo 3x3 | ataque | U12+ | cap. 06, 3.1 | 6–12 | Balones |
| 34 | Atacar closeout 3x3 | ataque | U12+ | formato 3x3 | 6–12 | Balones |
| 35 | Juego libre con 0,5 segundos | ataque | U16+ | formato 4x4 | 8–12 | Balones |
| 36 | 5x5 ventaja antes que sistema | ataque | U18+ | cap. 06, Júnior | 10–15 | Balones |
| 37 | Bote con mirada periférica | tecnica | U8+ | sin oposición | 2–12 | Balones |
| 38 | Paradas y pivotes bajo presión | tecnica | U10+ | formato 1x1 | 2–12 | Balones, Conos |
| 39 | Finalización mano no dominante | tecnica | U8+ | sin oposición | 2–12 | Balones |
| 40 | Cambio de ritmo contra rival | tecnica | U10+ | formato 1x1 | 2–12 | Balones, Conos |
| 41 | Pase bajo presión 2x1 | tecnica | U10+ | formato 2x1 | 3–12 | Balones |
| 42 | Tiro desde recepción | tecnica | U8+ | sin oposición | 4–12 | Balones |
| 43 | Finalizar con contacto controlado | tecnica | U10+ | formato 1x1 | 2–12 | Balones, Almohadilla de contacto |
| 44 | Lectura de ayudas 2x2 | tecnica | U12+ | formato 2x2 | 4–12 | Balones |

Reparto: 3 desde U8, 11 desde U10, 19 desde U12, 5 desde U14, 5 desde U16 y 1 desde U18. Por objetivo: 12 de rebote y 8 de cada uno de los otros cuatro.

Dos lecturas discutibles, por si quieres cambiarlas: con la regla del formato, los 4x4 quedan en U16 y el único 5x5 en U18, que es donde el capítulo 06 los introduce, aunque el capítulo 02 habla de 4x4 y 5x5 como transferencia en cualquier sesión; y los conos de los ejercicios 06 y 38 no los nombra el texto, los implican «carriles marcados» y «cuadrado 4x4 m».

## El importador

### Comando

```bash
pnpm content:import content/arcangel/biblioteca-entrenador-2026 --club arcangel
```

Con `--update` sobrescribe lo que ya existe (ver «Crear y actualizar»).

### Pasos

1. Lee y valida el paquete. Con errores, los lista todos y termina sin escribir.
2. Comprueba el destino: solo escribe en un Supabase local, salvo `ALLOW_REMOTE_IMPORT=true` puesto desde la shell. Es la barrera del seed, con variable propia: permitir sembrar no permite importar, ni al revés.
3. Busca el club por slug y, en él, los objetivos de trabajo y los principios que el paquete nombra. Si el club no existe o falta alguna referencia, lo dice (todas las que falten) y termina sin escribir.
4. Calcula las filas y decide, ejercicio a ejercicio, si lo crea, lo deja o lo actualiza.
5. Escribe, en este orden: objetos de Storage, fichas de `media_assets`, ejercicios (ya enlazados a su diagrama) y, al final, puntos, variantes y vínculos.
6. Imprime el informe: cuántos creados, cuántos ya existían y cuántos actualizados, con el club y el host de destino. Si algo falla, el código de salida es distinto de cero.

Escribe con la clave de servicio, desde `scripts/`; nada de esto entra en `src/` (regla 2).

### Ids

Deterministas (uuid v5) a partir del id del club, el id del paquete y la clave del ejercicio, con un espacio de nombres propio, distinto del del seed. Consecuencias:

- repetir el comando encuentra las mismas filas y no duplica;
- un ejercicio importado no puede tener el id de uno del seed, aunque se llamen igual;
- el mismo paquete importado en dos clubes da filas distintas.

De la misma raíz salen el id de cada punto y de cada variante (por su posición) y el de la ficha del diagrama. El objeto de Storage se llama `org/<club>/drills/<ejercicio>/<id de la ficha>.<ext>`, que es la forma que exigen las políticas de lectura.

### Crear y actualizar

- **Por defecto solo crea.** Un ejercicio que ya existe (por id) no se toca: ni su ficha, ni sus puntos, ni su diagrama. Lo editado en la app manda.
- **Con `--update`** cada ejercicio del paquete vuelve a lo que dice el paquete: ficha, estado, puntos, variantes, objetivos de trabajo, principios y diagrama. Los puntos y variantes que sobran se borran. Los Standards enlazados no se tocan: el paquete no opina sobre ellos.
- Ninguno de los dos modos borra un ejercicio que el paquete ya no trae.

### Fallos a mitad

Las escrituras van por la API y no comparten transacción. Si una falla, el importador deshace lo que **creó** en esa ejecución (ejercicios, que arrastran a sus hijos; fichas de medios; objetos de Storage) y termina con error. Lo que `--update` ya había sobrescrito no se puede deshacer: se repara volviendo a ejecutar con `--update`.

### Estructura

```
scripts/
  content-import.ts          CLI: argumentos, destino, informe, código de salida
  content/
    pack.ts                  esquema del paquete; leerlo de disco y validarlo
    rows.ts                  puro: paquete + referencias del club → filas e ids
    guard.ts                 barrera de destino
    import.ts                escritura: decide crear/dejar/actualizar, escribe y deshace
    fixtures/pack-ejemplo/   paquete ficticio pequeño para los tests
```

`rows.ts` no toca disco ni red, como los constructores del seed. `import.ts` solo hace entrada y salida. El código no nombra ningún club: el único contenido de un club es su paquete.

## Tests

TDD, como el resto del proyecto.

- **Unidad** (`pnpm test`):
  - `pack`: acepta el paquete de ejemplo; rechaza, con todos los errores a la vez, límites superados, claves repetidas o mal formadas, una pizarra que falta, una extensión no admitida, una de más de 2 MB y una ruta que sale del paquete.
  - `rows`: ids estables, distintos por club y por paquete, y nunca iguales a los del seed para el mismo título; la traducción de cada campo; referencia a un objetivo o principio que el club no tiene.
  - `guard`: local pasa; remoto solo con la variable.
  - Paquetes del repositorio: todo `content/*/*/pack.json` valida. El de la biblioteca del entrenador tiene 44 ejercicios, 44 pizarras distintas y el reparto 12, 8, 8, 8 y 8 por objetivo.
- **Integración** (`pnpm test:int`, Supabase local sembrado, con el paquete de ejemplo):
  - crea los ejercicios con sus puntos, su variante, sus vínculos y su diagrama;
  - un entrenador del club, con su sesión, ve el ejercicio y firma la URL del diagrama; uno de otro club, no;
  - repetir no cambia nada (ni `updated_at`);
  - tras editar un ejercicio, repetir sin `--update` lo respeta y con `--update` lo sobrescribe;
  - una referencia rota no escribe nada;
  - un fallo provocado a mitad no deja ejercicios, fichas ni objetos.
  - Limpia lo que crea, también si falla, para no alterar los recuentos del resto de tests de integración.
- **Sin pgTAP ni e2e nuevos**: no hay tablas, políticas ni pantallas nuevas.

## Verificación de cierre

Desde una base vacía: `supabase db reset`, `pnpm seed`, importar el paquete real, y:

- `lint`, `typecheck`, `check:guards`, `pnpm test` (también con `TZ=UTC`) y `pnpm test:int` en verde;
- repetir la importación: 0 creados, 44 ya existentes;
- en el navegador, a 375×812 y con usuarios del seed: la biblioteca lista los ejercicios, los filtros de objetivo, edad y jugadores los encuentran, la ficha enseña pizarra, desarrollo, puntos y progresión, la consola no tiene errores, y un usuario del otro club no ve ninguno;
- `pnpm test:e2e` sigue en verde con la base recién sembrada (sin el paquete).

## Fuera de alcance

- Los 24 ejercicios por categoría del capítulo 06.
- Campos nuevos en la ficha (error frecuente, indicador), sesiones modelo como plantillas y cuadro de mando del entrenador.
- Una pantalla de importación en Gestión. El formato del paquete queda como contrato para cuando llegue.
- Un conversor de Word en el repositorio. La conversión del manual se hace una vez, para esta entrega; desde entonces la fuente es `pack.json`.
- Cargar el paquete en el Supabase remoto.

## Consecuencias conocidas

- **El manual queda público** en el repositorio (decisión 3).
- **Dos «3x2 continuo»** donde el paquete conviva con el seed: el de ejemplo y el del manual.
- **Los e2e en local borran lo importado**: restauran el seed y quitan de sus dos clubes lo que no es suyo. Después de pasarlos hay que importar otra vez. En remoto no ocurre: los e2e nunca siembran un destino remoto.
- **`pnpm test:int` falla con un paquete importado en local**: el test del seed cuenta los ejercicios del club y el seed no se toca. Se vuelve a una base limpia con `pnpm supabase db reset` y `pnpm seed`.
- **`--update` pierde lo retocado en la app** en los ejercicios del paquete. Es su propósito, y por eso no es el modo por defecto.
- **Producción es hoy una demo con acceso público.** Importar allí enseña el contenido a cualquiera que abra la URL; no añade exposición, porque el repositorio ya es público, pero mezcla contenido real con datos de ejemplo.
