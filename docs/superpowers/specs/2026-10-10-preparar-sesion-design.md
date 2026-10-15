# Preparar sesión · Diseño

Fecha: 10 oct 2026. Estado: diseño aprobado por el propietario en conversación el 10 oct 2026. Es la pieza 2 de la «Propuesta de evolución para CLUB OS» (§3 y parte de §10); la tabla de las diez piezas está en `2026-10-10-uso-diario-design.md`. Va encima de la pieza 1 (Dkalds/Club-OS#15).

## Propósito

Que preparar una sesión cueste menos que el papel sin quitarle el criterio a quien entrena:

- Al pulsar «Preparar sesión» hay dos caminos: **proponer entrenamiento** o **empezar desde cero**.
- La propuesta es un borrador con ejercicios de la biblioteca del club, que se revisa y se cambia antes de guardar.
- Una sesión que ha salido bien se guarda como **plantilla** y se vuelve a usar.
- El constructor dice si lo montado encaja con el tiempo de pista.

## Cómo está hoy

- «Preparar sesión» abre un formulario (equipo, fecha, hora, duración, objetivos, lugar, notas). Al enviarlo se crea la sesión, vacía, y se abre el constructor.
- El constructor añade ejercicios de la biblioteca (`findDrills`) y bloques libres, los ordena y los cronometra. Nada se guarda hasta «Guardar sesión». Enseña el total, pero no lo compara con la franja.
- Las plantillas existen en la base (`practice_plans.is_template`, y un plan sin equipo lo lee solo su autor), pero ningún usuario puede crear, editar ni borrar un plan sin equipo: no hay política, ni función, ni pantalla.
- El formulario propone siempre las 18:00, 75 minutos y sin lugar, sea cual sea el equipo.

## Decisiones tomadas

Con el propietario, el 10 oct 2026:

1. **La propuesta se genera con reglas sobre la biblioteca**, sin IA: predecible, gratis, sin datos saliendo del club y probada entera.
2. **Las plantillas son de quien las guarda.** Compartirlas con el club llega con la pieza 5, cuando existan los roles de coordinación.

Las demás las toma este diseño; las que el propietario podría querer distintas están en «Decisiones a confirmar».

## Dos caminos

El formulario de «Preparar sesión» acaba con dos botones:

- **«Proponer entrenamiento»** (principal): crea la sesión y abre el constructor con una propuesta cargada.
- **«Empezar desde cero»** (secundario): crea la sesión y abre el constructor vacío, como hoy.

Los dos crean la sesión (su fecha, su franja y sus objetivos quedan guardados): lo que no se guarda es la lista de ejercicios. La propuesta llega al constructor como cambios sin guardar, con un aviso encima («Propuesta sin guardar. Revísala, cámbiala y guarda.»); salir sin guardar pregunta, como con cualquier otro cambio. Si no se guarda, la sesión queda sin ejercicios.

El constructor de una sesión que aún no tiene ejercicios ofrece también «Proponer entrenamiento», encima de «Añadir ejercicio»: sirve a quien empezó desde cero y cambia de idea, y a quien volvió sin guardar.

## La propuesta

Acción de solo lectura `proposePracticeItems(clubSlug, { eventId })`, con el permiso `practice.manage`. Lee, con la sesión del usuario y acotado al club:

- la sesión: equipo, franja y objetivos principal y secundario;
- del equipo: la edad de su categoría (`categories.age_band`, «U12» → 12) y cuántos jugadores tiene su plantilla;
- los ejercicios **publicados** de la biblioteca (los que el usuario ve) con sus rangos y sus objetivos;
- los ejercicios usados en las tres últimas sesiones de ese equipo anteriores a esta.

Con eso, `buildProposal` (pura) arma la lista:

| Fase | Parte del tiempo | Qué busca |
| --- | --- | --- |
| Activación | 15 % | el ejercicio más corto que valga |
| Objetivo principal (con su nombre) | 45 % | dos ejercicios de ese objetivo; uno si la sesión dura menos de 60 min |
| Objetivo secundario (con su nombre) | 20 % | un ejercicio de ese objetivo; sin secundario, otro del principal |
| Competición | 20 % | el ejercicio que más jugadores admite |

- **Qué ejercicios valen.** La edad del equipo cabe en el rango del ejercicio y, si se conoce el tamaño de la plantilla, cabe en su rango de jugadores. Ninguno se repite dentro de la propuesta. Se prefieren los que no se han usado en las tres últimas sesiones. Entre los que quedan, por título: con los mismos datos, la misma propuesta.
El motor no conoce los objetivos de ningún club (regla 3): recibe los de la sesión y los de cada ejercicio, y solo los compara.

- **Si no hay candidato para un hueco**, se relaja por este orden: se admite lo usado hace poco, se deja de mirar el número de jugadores y, por último, vale cualquier objetivo (y entre esos se vuelve a preferir lo que cabe y no se ha usado hace poco). La edad no se relaja nunca. Si ni así hay ejercicio, ese hueco se queda sin cubrir.
- **Minutos.** Cada bloque recibe su parte en pasos de 5 minutos, dentro del rango del ejercicio (uno cuyo rango no contiene ningún múltiplo de 5 dura lo más que admite). Lo que falte o sobre para llegar a la duración de la sesión se reparte entre los bloques que aún admiten, del principal hacia fuera. Si ni con los mínimos caben todos (una sesión de 15 min), se quitan huecos: el secundario, la competición, el segundo del principal y la activación, por ese orden.
- **Si los huecos no llenan la franja.** Los ejercicios de una biblioteca tienen rangos estrechos (10–15 min), y cinco no siempre dan 75. Mientras quede tiempo para otro, se añade uno más del principal y uno del secundario, por turnos, hasta ocho ejercicios.
- **Lo que devuelve.** Los ítems (ejercicio, título, fase, minutos) con, para cada uno, por qué está ahí: sus objetivos, cuántos puntos de corrección clave tiene y cuántas variantes. Y los minutos que no ha podido cubrir. Con la biblioteca vacía, una lista vacía.

La propuesta no escribe nada. Sin objetivo principal en la sesión, las fases principales toman los objetivos con más ejercicios válidos.

## Empezar desde cero y el encaje

El constructor es el de hoy, con dos añadidos:

- **Encaje con la franja.** Junto al total: «Te sobran 10 min» si lo montado dura menos que la franja, «Te pasas 10 min» si dura más, y nada si coincide o la lista está vacía. Solo avisa: se puede guardar igual.
- **Por qué está cada bloque.** Una fila de un ejercicio de la biblioteca que llega de la propuesta lleva una línea con sus objetivos, sus puntos clave y sus variantes («Transición · 2 puntos clave · 1 variante»). No se guarda: es una ayuda mientras se revisa.

## Plantillas

Una plantilla es un plan sin equipo ni evento, con `is_template`, de su autor.

- **Guardar.** En la ficha de una sesión (programada, hecha o cancelada) con ejercicios, «Guardar como plantilla». Copia el título, los objetivos y los ejercicios con sus fases y minutos. Las notas, de la sesión y de cada ejercicio, no se copian: son texto libre de aquel día y de aquel equipo, pueden hablar de jugadores, y la plantilla es personal. Tope de 50 plantillas por persona y club.
- **Ver.** Tercera pestaña en Sesiones, «Plantillas» (`?scope=templates`): las mías, por título, con lo que duran, cuántos ejercicios tienen y sus objetivos.
- **Usar.** Una plantilla abre `/train/new?template={id}`: el mismo formulario, con su título y sus objetivos puestos, un aviso de qué plantilla es y un solo botón, «Crear sesión», que la crea con los ejercicios de la plantilla ya guardados y abre su ficha.
- **Borrar.** En esa misma pantalla, «Borrar plantilla», con confirmación. Las sesiones creadas con ella no cambian.

No se editan: se corrige la sesión y se guarda otra.

### Base de datos

Una migración, sin tablas nuevas:

- Políticas nuevas en `practice_plans`: alta de una plantilla (`team_id` y `event_id` nulos, `is_template`, de quien la crea, con membresía activa de cuerpo técnico o dirección en ese club) y borrado de una plantilla propia. `grant insert (is_template)` y `grant delete` para `authenticated`. La de lectura ya deja ver un plan sin equipo solo a su autor (y a dirección).
- Con `is_template` concedida, dos cierres: un `check` (una plantilla no tiene evento) y la política de alta de un plan de equipo, que rechaza el que venga marcado como plantilla.
- Política nueva en `practice_items`: alta de ítems en una plantilla propia. Borrarlos va con el plan (`on delete cascade`).
- `save_practice_as_template(p_event uuid) returns uuid`: `NOT_FOUND` si el evento no es un entreno con plan de un equipo que se gestiona; `INVALID` si no tiene ejercicios; `TEMPLATE_LIMIT` con 50.
- `create_practice_from_template(p_template uuid, p_team uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_title text, p_primary_focus uuid default null, p_secondary_focus uuid default null, p_location text default null) returns uuid`: `NOT_FOUND` si la plantilla no es mía o es de otro club que el equipo, o si no gestiono el equipo. Crea evento, plan e ítems en una transacción; la sesión nace sin notas.
- Las dos, `security invoker`, con `execute` solo para `authenticated`, y el orden de comprobaciones de C26.
- `posture.test.sql` al día y pgTAP propio: aislamiento por club, por autor (otro entrenador del mismo club no ve ni usa ni borra mi plantilla) y por equipo.

## Valores por defecto del equipo

El formulario de una sesión nueva propone la hora, la duración y el lugar de la última sesión de ese equipo (las 18:00, 75 minutos y sin lugar si no tiene ninguna). «Última» es la más reciente que ya ha empezado; si el equipo aún no ha entrenado, la más próxima de las programadas. Al cambiar de equipo en el formulario, los tres se ponen al día mientras no se hayan tocado, y con la hora, el día que le toca (hoy, o mañana si esa hora ya ha pasado).

## Qué no cambia

- El aislamiento entre clubes y entre equipos, y las reglas de `CLAUDE.md`.
- Guardar, duplicar, cancelar y dirigir una sesión.
- La biblioteca: la propuesta solo lee lo publicado que el usuario ya ve.

## Pruebas

- **Unidad:** `buildProposal` (reparto por fases, rangos de minutos, pasos de 5, relajaciones en su orden, edad que no se relaja, sin repetidos, mismo resultado con los mismos datos, biblioteca vacía o corta, sesión de 15 y de 180 min, sin objetivos); el encaje; las acciones (permiso, club, errores); el formulario con sus dos botones y con plantilla; la pestaña de plantillas.
- **pgTAP:** las dos funciones y las políticas nuevas, con aislamiento por club, por autor y por equipo; el tope; `posture`.
- **E2E (375×812):** proponer → revisar → cambiar → guardar; salir sin guardar deja la sesión vacía; desde cero con el aviso de encaje; guardar como plantilla → usarla → la sesión nace con sus ejercicios → borrarla; otra entrenadora del club no ve la plantilla.
- **Cierre:** la suite entera desde una base vacía, repaso visual y revisión de la rama.

## Fuera de esta pieza

- IA, y cualquier propuesta que no salga de reglas.
- Plantillas compartidas con el club, o por fase de temporada (pieza 5).
- Material del club como criterio: los ejercicios dicen qué material piden, pero el club no tiene inventario.
- Compartir el plan con el segundo entrenador: el cuerpo técnico del equipo ya ve y edita la misma sesión.

## Decisiones a confirmar

- Los dos caminos crean la sesión antes de montar los ejercicios; lo que no se guarda sola es la lista.
- El reparto por fases (15 / 45 / 20 / 20) y las relajaciones, en ese orden.
- «Reciente» son las tres últimas sesiones del equipo.
- Una plantilla no se edita ni se renombra: se guarda otra. Tope de 50.
- Las notas no viajan a la plantilla.
- Dirección puede leer en la base las plantillas de cualquiera de su club (ya era así para los planes sin equipo); la pantalla solo enseña las propias.
