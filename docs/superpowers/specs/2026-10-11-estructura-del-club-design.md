# Estructura del club · Diseño

Fecha: 11 oct 2026. Estado: alcance aprobado por el propietario en conversación el 11 oct 2026 («Temporada, equipos y personas»). Es la pieza 5 de la «Propuesta de evolución para CLUB OS» (P0 plataforma y §6, fila «Administración»); la tabla de las diez piezas está en `2026-10-10-uso-diario-design.md`. Va encima de la pieza 4 (Dkalds/Club-OS#19).

## Propósito

Hoy las temporadas, las categorías, los equipos y las personas de un club solo existen si alguien los siembra con un script. Esta pieza los pone en manos de la dirección, desde Gestión:

- Crear y editar temporadas, y decir cuál es la actual.
- Crear y editar categorías y equipos.
- Dar de alta personas (de un menor, solo el año de nacimiento) y archivarlas.
- Montar cada equipo: su cuerpo técnico y su plantilla, con dorsal y posición.

Con esto, un club nuevo llega a tener su agenda y sus sesiones sin pasar por el seed. No cambia la especificación aprobada: su tabla de permisos ya dice que la dirección gestiona temporadas, categorías y equipos (`docs/spec/club-os-primera-entrega.md`, §permisos), y dejaba «duplicar estructura a la nueva temporada» para una fase posterior, que es esta.

## Decisiones tomadas

Con el propietario, el 11 oct 2026: esta entrega es **temporada, equipos y personas**. Quedan para la siguiente (5b) las invitaciones por email, el vínculo entre familias y jugadores y los roles de coordinación y tesorería.

Las demás las toma este diseño; las que el propietario podría querer distintas están en «Decisiones a confirmar».

## Dónde está

Gestión gana dos apartados, delante de los de la metodología: **Temporada** y **Personas**. La raíz de Gestión (`/c/{club}/admin`) lleva a Temporada.

| Ruta | Qué es |
|---|---|
| `/admin/season` | La temporada actual (si no hay, la más reciente; si no hay ninguna, el alta de la primera). |
| `/admin/season/{seasonId}` | Una temporada cualquiera: sus datos y sus equipos. |
| `/admin/season/categories` | Las categorías del club. |
| `/admin/teams/{teamId}` | Un equipo: nombre y categoría, cuerpo técnico y plantilla. |
| `/admin/people` | Las personas del club, con buscador. |
| `/admin/people/{personId}` | Una persona: sus datos, sus equipos y archivarla. |

Las URL llevan uuid, nunca nombres. Solo entra la dirección; el resto recibe el 404 de siempre (`adminPage`).

## Temporada

- **Qué se ve.** El nombre y las fechas de la temporada, una etiqueta «Actual» si lo es, y sus equipos agrupados por categoría. Cada equipo dice cuántas personas tiene en la plantilla y enlaza a su página. Arriba, las demás temporadas del club, para cambiar de una a otra.
- **Nueva temporada.** Nombre («2027/28»), inicio y fin. Opción «Copiar los equipos de {temporada}»: crea los mismos equipos (nombre y categoría), vacíos. La primera temporada de un club nace actual; las demás, no.
- **Editar.** Nombre y fechas. El fin va después del inicio.
- **Marcar como actual.** Con confirmación: la agenda, las sesiones y los equipos que ve todo el club pasan a ser los de esa temporada. La anterior deja de ser la actual; nada se borra.
- **Borrar.** Solo una temporada sin equipos, y nunca la actual.
- **Nuevo equipo.** Nombre y categoría. Dos equipos de una temporada no comparten nombre.

## Categorías

Una lista editable: nombre («Alevín»), edad («Sub 12», que se guarda como `U12`) y orden. Se borra la que ningún equipo usa. Dos categorías no comparten nombre.

## Equipo

- **Datos.** Nombre y categoría. La temporada no se cambia.
- **Cuerpo técnico.** Se añade una persona del club como «Entrenador principal» o «Ayudante»; se cambia su papel; se quita.
- **Plantilla.** Se añade una persona del club, o se da de alta una nueva ahí mismo (nombre, apellidos y año de nacimiento), con dorsal (0 a 99, único en el equipo) y posición, los dos opcionales. Se editan dorsal y posición; se quita del equipo.
- **Borrar el equipo.** Con confirmación. Solo si no tiene actividad (sesiones, partidos, objetivos o notas): se va con su cuerpo técnico y su plantilla, no con las personas. Con actividad, no se borra, y se dice.

Quien se añade se elige en un buscador sobre las personas sin archivar del club, sin las que ya están en esa lista.

## Personas

- **La lista.** Apellidos y nombre, año de nacimiento si lo tiene y en qué equipos de la temporada actual está. Un buscador filtra por nombre (sin distinguir tildes ni mayúsculas) y un conmutador enseña las archivadas.
- **Nueva persona.** Nombre, apellidos y año de nacimiento (opcional; entre 1900 y el año en curso). Nunca la fecha completa.
- **Una persona.** Editar sus datos; ver sus equipos (de cualquier temporada, la actual primero) y si tiene acceso a la app y con qué rol; archivarla o recuperarla.
- **Archivar** es decir que ya no está en el club: sale de la lista y de los buscadores, y no se borra nada. No se archiva a quien sigue en un equipo de la temporada actual: antes se la quita de él.

Quién tiene cuenta y con qué rol se lee, no se cambia: las invitaciones son la entrega siguiente.

## Base de datos

Una migración, `20270302000100_club_structure.sql`. Las tablas ya existen (`people`, `seasons`, `categories`, `teams`, `team_staff`, `team_players`), con RLS, `organization_id` y claves compuestas; hasta ahora solo se leían.

- **Escritura para la dirección.** En cada una de las seis tablas, políticas de alta, cambio y borrado con `private.has_org_role(organization_id, array['admin'])`, y los `grant` por columnas de lo que la app escribe (C17, C27). `people` no se borra: se archiva (`archived_at`).
- **Lo que la base garantiza.** `seasons`: el fin después del inicio. Nombres sin repetir, sin distinguir mayúsculas: temporadas y categorías por club, equipos por temporada. Nombres y apellidos de 1 a 60 caracteres; posición, hasta 30.
- **Funciones** (`security invoker`), para lo que toca varias filas a la vez:
  - `create_season(p_org, p_name, p_starts_on, p_ends_on, p_copy_teams_from default null) returns uuid`: la temporada, actual si el club no tenía ninguna, y la copia de equipos si se pide (`NOT_FOUND` si esa temporada no es del club).
  - `set_current_season(p_season) returns void`: quita la marca a la anterior y se la pone a esta, en una transacción. `NOT_FOUND` si no es de un club que el usuario dirige.
  - `delete_team(p_team) returns void`: quita cuerpo técnico, plantilla y equipo; `IN_USE` si algo lo referencia. `NOT_FOUND` como arriba.
  - `add_new_player(p_team, p_first_name, p_last_name, p_birth_year, p_jersey_number, p_position) returns uuid`: la persona y su sitio en la plantilla, o ninguna de las dos.
- **Errores** (C26): `NOT_FOUND` primero; `IN_USE` (nuevo, `P0001`) cuando algo no se puede borrar porque se usa; lo demás, los códigos de siempre (`23505` marca el campo repetido).
- **pgTAP** (`club_structure.test.sql`): por cada tabla, quién escribe (la dirección de su club) y quién no (quien entrena, también en su equipo; un jugador; la dirección de otro club); las restricciones nuevas; las cuatro funciones, con su orden de errores; que nada apunta a otro club. `posture.test.sql` al día.

Lo que leen quien entrena y los jugadores no cambia: «mis equipos» sigue siendo la temporada actual.

## Qué no cambia

- El aislamiento entre clubes y las reglas de `CLAUDE.md`. La clave de servicio sigue fuera de `src/`.
- Las pantallas de la app (Inicio, Agenda, Sesiones, Equipo). Cuando la dirección no tiene equipos, su aviso lleva ahora a Temporada.
- La metodología en Gestión.

## Pruebas

- **Unidad:** esquemas (nombres, fechas, año, dorsal, edad), acciones (permiso, club, validación, cada error), lecturas, páginas y formularios.
- **pgTAP:** lo de arriba.
- **E2E (375×812, proyecto `admin`):** la dirección crea una categoría y un equipo, le da de alta un jugador nuevo y le añade un entrenador; edita y archiva a una persona; crea una temporada copiando equipos y la borra; quien entrena y la dirección de otro club reciben el 404.
- **Cierre:** la suite entera desde una base vacía, repaso visual y revisión de la rama.

## Fuera de esta pieza

- Invitar por email y dar o quitar acceso; cambiar roles (5b).
- Familias: vincular a un jugador con sus tutores (5b), y lo que ven (pieza 9).
- Roles de coordinación y tesorería (5b y pieza 8).
- Importar personas o equipos desde un fichero (pieza 10).
- Pistas e instalaciones, y horarios recurrentes (pieza 6).
- Marca y terminología del club («Configuración»).
- Pasar jugadores de una temporada a la siguiente en bloque.

## Decisiones a confirmar

- Copiar equipos a una temporada nueva copia nombre y categoría, no cuerpos técnicos ni plantillas.
- La plantilla y el cuerpo técnico los monta solo la dirección; quien entrena los lee.
- No se archiva a quien sigue en un equipo de la temporada actual.
- Un equipo con actividad no se borra; tampoco se archiva: se queda en su temporada.
- La raíz de Gestión lleva a Temporada, no a la metodología.
- El copy nuevo no lo ha validado producto.
