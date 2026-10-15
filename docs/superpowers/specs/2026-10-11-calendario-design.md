# Calendario · Diseño

Fecha: 11 oct 2026. Estado: alcance aprobado por el propietario en conversación el 11 oct 2026 («Horarios, pistas y cambios» y «Solo dirección»). Es la pieza 6 de la «Propuesta de evolución para CLUB OS» (§6, «Calendario y responsabilidades»); la tabla de las diez piezas está en `2026-10-10-uso-diario-design.md`. Va encima de la pieza 5 (Dkalds/Club-OS#20).

## Propósito

Hoy cada entrenamiento se crea a mano, el lugar es un texto libre y un cambio de hora o una cancelación no dejan rastro. Esta pieza hace tres cosas:

- **Horarios semanales.** La dirección dice que un equipo entrena los martes a las 18:00 en el Pabellón 2, y la app crea los entrenamientos de la temporada. Quien entrena los encuentra en su Agenda, listos para preparar.
- **Pistas.** El club tiene su lista de pistas. Un evento cuyo lugar es una de ellas queda vinculado a esa pista.
- **Qué ha cambiado.** Cuando un entrenamiento o un partido cambia de hora, de lugar o se cancela, queda registrado y se enseña al equipo: en Inicio, en la Agenda y en su ficha.

## Decisiones tomadas

Con el propietario, el 11 oct 2026:

1. Entran horarios semanales, pistas y registro de cambios. Importar el calendario de competición desde un fichero queda para la pieza 10.
2. Los horarios y las pistas los define solo la dirección, en Gestión. Quien entrena sigue moviendo o cancelando un entrenamiento suelto de su equipo, como hoy, y eso queda registrado.

Las demás las toma este diseño; las que el propietario podría querer distintas están en «Decisiones a confirmar».

## Pistas

- Una pista es un nombre («Pabellón 2»), único en el club sin distinguir mayúsculas. La dirección las crea, les cambia el nombre y borra las que ningún horario usa, en **Gestión → Calendario**.
- El lugar de un evento sigue siendo un texto: un partido fuera se juega donde sea. Cuando ese texto es el nombre de una pista del club, el evento queda vinculado a ella (`events.venue_id`), lo escriba quien lo escriba. Lo mantiene la base, no la app.
- En los formularios de sesión y de partido, «Lugar» sugiere las pistas del club al escribir.
- Cambiar el nombre de una pista se lo cambia a sus eventos programados que aún no han empezado. No cuenta como un cambio de lugar.
- Borrar una pista no toca los eventos: conservan su lugar como texto.

## Horarios semanales

Un horario es: un equipo, un día de la semana, una hora, una duración y, si se quiere, una pista. Se gestionan en la página del equipo en Gestión (**Horario semanal**), y Gestión → Calendario los enseña todos juntos.

- **Añadir un horario** crea los entrenamientos de ese equipo, uno por semana, desde hoy hasta el final de su temporada. Cada uno nace como una sesión normal (programada, con su plan en borrador y el título «Entrenamiento»): quien entrena la abre y la prepara. Al acabar dice cuántos ha creado.
  - La hora es la del reloj del club (`organizations.timezone`), también al cruzar el cambio de hora.
  - Donde el equipo ya tiene un entrenamiento a esa misma hora no se crea otro.
- **Cambiar un horario** (día, hora, duración o pista) mueve sus entrenamientos futuros que siguen en su sitio. El que alguien movió a mano se queda donde lo dejó, y de cada uno solo cambia lo que seguía siendo del horario: una sesión que alguien alargó conserva lo que dura. Tampoco se mueve el que caería donde el equipo ya tiene otro entrenamiento, en el pasado o después del final de la temporada. Cada entrenamiento movido queda registrado como un cambio.
- **Quitar un horario** borra sus entrenamientos futuros que nadie ha tocado (sin ejercicios, sin notas, sin empezar y en su sitio: el que alguien movió a mano se queda) y deja los demás como sesiones sueltas. Es la única vía por la que se borra un evento: una sesión preparada o ya hecha no se borra nunca.
- Un equipo no tiene dos horarios el mismo día a la misma hora. Como mucho, 14 por equipo.
- Solo en equipos de una temporada que no ha acabado.

## Qué ha cambiado

- Queda registrado cada cambio de **hora** (inicio o fin), de **lugar** y cada **cancelación** de un entrenamiento o un partido programado, con lo que había antes y cuándo se cambió. Lo registra la base, venga el cambio de donde venga. No se registra quién.
- **Agenda.** Un evento cancelado que aún no ha pasado sigue en «Próximos», marcado como cancelado, hasta que pasa su fecha. Encima de la lista, «Cambios recientes»: los de los últimos 7 días en eventos que aún no han pasado.
- **Inicio.** El mismo aviso de «Cambios recientes», con los tres últimos.
- **Ficha de la sesión o del partido.** «Cambios», con todos los de ese evento: «Cambio de hora: antes, martes 6 oct · 18:00–19:15». Y quién lo puede cambiar: «Lo pueden cambiar o cancelar el cuerpo técnico de Alevín A y la dirección».
- Lo ve quien ve el evento: el cuerpo técnico del equipo y la dirección.

## Dónde está

| Ruta | Qué es |
|---|---|
| `/admin/calendar` | Las pistas del club y, por equipo de la temporada actual, sus horarios semanales. |
| `/admin/teams/{teamId}` | Gana «Horario semanal»: añadir, cambiar y quitar horarios del equipo. |

Gestión gana el apartado **Calendario**, entre Temporada y Personas.

## Base de datos

Una migración, `20270316000100_calendar.sql`.

- **`venues`**: `id`, `organization_id`, `name`, `created_at`. Único `(organization_id, lower(btrim(name)))`. La lee cualquier miembro del club; la escribe la dirección (`grant` por columnas, C17).
- **`team_schedules`**: `id`, `organization_id`, `team_id`, `weekday` (1 lunes a 7 domingo), `start_time time`, `duration_minutes` (15 a 240), `venue_id`. Único `(team_id, weekday, start_time)`. La lee quien ve el equipo. No se escribe por la tabla: solo con las funciones de abajo.
- **`events`**: `venue_id` y `schedule_id`, las dos opcionales y con clave compuesta por club. Ninguna se concede. `venue_id` la pone un trigger a partir de `location`. `schedule_id` la ponen las funciones.
- **`event_changes`**: `id`, `organization_id`, `event_id`, `team_id`, `what` (`time`, `location`, `cancelled`), `old_starts_at`, `old_ends_at`, `old_location`, `changed_at`. La escribe un trigger de `events`; nadie más. La lee quien ve el evento. No se registra lo que escribe el seed (sin usuario).
- **Funciones** (`security definer`, con la comprobación de dirección dentro: escriben columnas que nadie tiene concedidas y, la última, borra eventos):
  - `create_team_schedule(p_team, p_weekday, p_start_time, p_duration_minutes, p_venue default null) returns jsonb` (`{ id, created }`).
  - `update_team_schedule(p_schedule, p_weekday, p_start_time, p_duration_minutes, p_venue default null) returns integer` (los entrenamientos movidos).
  - `delete_team_schedule(p_schedule) returns integer` (los entrenamientos borrados).
- **Errores** (C26): `NOT_FOUND` primero; `INVALID` (`22023`) para un día, una hora o una duración fuera de rango, un equipo de una temporada acabada o el tope de horarios; `23505` para el horario repetido.
- **pgTAP** (`team_schedules.test.sql`): quién escribe pistas y horarios y quién no (quien entrena, también en su equipo; un jugador; la dirección de otro club; anon); el vínculo automático con la pista y el cambio de nombre; la generación (cuántos, a qué hora a cada lado del cambio de hora, sin duplicar, sin pasar del final de la temporada); cambiar y quitar un horario (qué se mueve, qué se borra y qué se queda); el registro de cambios (qué se registra, qué no, quién lo lee); nada apunta a otro club. `posture.test.sql` al día.

## Qué no cambia

- El aislamiento entre clubes y las reglas de `CLAUDE.md`. Las horas se guardan en `timestamptz` y se enseñan en la zona del club.
- Quién crea, mueve y cancela un entrenamiento o un partido suelto: el cuerpo técnico del equipo y la dirección, con las funciones de siempre.
- Una sesión con contenido no se borra: se cancela.

## Pruebas

- **Unidad:** esquemas, acciones (permiso, club, validación, errores), lecturas, el texto de cada cambio, páginas y formularios.
- **pgTAP:** lo de arriba.
- **E2E (375×812, proyecto `admin`):** la dirección crea una pista y un horario y ve cuántos entrenamientos se crean; quien entrena los ve en su Agenda; la dirección cambia la hora del horario y quien entrena ve el cambio; quien entrena cancela una sesión y sigue en «Próximos» como cancelada, con su cambio en la ficha; quitar el horario borra los que nadie tocó y deja el preparado; quien entrena no entra en Gestión → Calendario.
- **Cierre:** la suite entera desde una base vacía, repaso visual y revisión de la rama.

## Fuera de esta pieza

- Importar el calendario de competición desde un fichero, con revisión antes de publicar (pieza 10).
- El rol de coordinación (5b).
- Avisos fuera de la app (correo, notificaciones) y marcar un cambio como visto.
- Ocupación de pistas: avisar de que dos equipos coinciden en la misma pista a la misma hora.
- Festivos y vacaciones: semanas en las que no se entrena.
- Jugadores y familias: no ven el calendario todavía (pieza 9).

## Decisiones a confirmar

- Los entrenamientos de un horario nacen con el título «Entrenamiento» y sin contenido.
- Quitar un horario borra sus entrenamientos futuros sin tocar; los preparados se quedan.
- Cambiar un horario no mueve el entrenamiento que alguien cambió a mano.
- No se registra quién hizo cada cambio, solo qué y cuándo.
- «Cambios recientes» son los de los últimos 7 días.
- Un cancelado sigue en «Próximos» hasta que pasa su fecha.
- El copy nuevo no lo ha validado producto.
