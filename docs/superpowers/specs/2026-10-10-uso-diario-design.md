# Uso diario del entrenador · Diseño

Fecha: 10 oct 2026. Estado: diseño aprobado por el propietario en conversación el 10 oct 2026 («Sí, impleméntalo todo»). Es la pieza 1 de la propuesta «Propuesta de evolución para CLUB OS» (documento de Word del propietario, 10 oct 2026).

## De dónde sale

La propuesta recorre el perfil de entrenador y pide convertir CLUB OS en una plataforma para gestionar el club entero. Son unas diez piezas independientes; se acordó hacerlas de una en una, cada una con su especificación, su plan y su PR:

| # | Pieza | Apartados de la propuesta |
| --- | --- | --- |
| 1 | **Uso diario del entrenador** (este documento) | §2, §5 |
| 2 | Preparar sesión: proponer o desde cero, plantillas | §3 |
| 3 | Pizarra visual: diagrama estructurado y por pasos | §4 |
| 4 | Editor de jugadas propias | §4 |
| 5 | Estructura del club en Gestión: temporadas, equipos, personas, familias, invitaciones, roles de coordinación y tesorería | P0 plataforma, §6 |
| 6 | Calendario: recurrentes, importación, aviso de cambios | §6 |
| 7 | Expediente documental y vencimientos | §8 |
| 8 | Tesorería | §7 |
| 9 | Vistas de jugador y familia | §2 |
| 10 | Integraciones (FBM, SWISH, contabilidad) | §9 |

Dos avisos que quedan para cuando lleguen sus piezas, no para esta:

- **Las piezas 7 y 8 cambian la especificación aprobada** (`docs/spec/club-os-primera-entrega.md`, §1: «No gestiona el club», «Ni ERP», y la fila de Clupik: «No competir en gestión administrativa»). Habrá que enmendarla antes de construirlas.
- **Los reconocimientos médicos (pieza 7) no se activan solo con código.** La propia propuesta exige revisión legal previa, y producción es hoy una demo con acceso público.

## Propósito

Que cada rol encuentre rápido lo suyo y que el directo sea fiable:

- La barra inferior sale del rol. El entrenador tiene Inicio, Agenda, Sesiones, Biblioteca y Equipo.
- Sesiones (planificación e histórico) y Biblioteca (búsqueda de ejercicios) son dos espacios distintos.
- Quien lleva más de un equipo elige uno, y la elección vale para toda la app.
- Una sesión sin empezar se inicia en el ejercicio 1; una empezada se continúa donde iba, y se sabe cuál es antes de entrar; una terminada se revisa.

## Hallazgos que corrige

Comprobados en el código al preparar este diseño:

- `navItems` devuelve las mismas cinco pestañas a cualquier rol. Un jugador o una familia ven Entrenar, Partidos y Equipo, que para ellos están vacíos.
- Entrenar mezcla las sesiones con la entrada a la biblioteca.
- El progreso del directo vive solo en `localStorage`. El servidor no sabe si una sesión está empezada ni por dónde va: Inicio dice siempre «Iniciar entrenamiento», y la ficha solo dice «Continuar» en el dispositivo que la empezó. Un estado viejo guardado en el dispositivo hace que una sesión se abra en el ejercicio 2.
- Abrir la pantalla de directo ya envía progreso al servidor, antes de pulsar «Iniciar»: marca todos los ejercicios como no completados y mueve la copia de la sesión.
- `live-screen.tsx` usa clases que no existen en la app (`p-space-4`, `gap-space-6`, `cos-btn`, `cos-iconbtn`…; solo están en `design/components/bundle.css`): márgenes que no se aplican y botones sin estilo.
- Entrar a `/live` de una sesión terminada da un 404.

## Decisiones tomadas

Con el propietario, el 10 oct 2026:

1. **Barra del entrenador:** Inicio · Agenda · Sesiones · Biblioteca · Equipo. Los partidos pasan a Agenda. La identidad sale de la barra: fila fija en Inicio y entrada en el menú de cuenta.
2. **Equipo activo en toda la app**, con selector en la cabecera, y no un filtro en cada pantalla.

Las demás las toma este diseño; las que el propietario podría querer distintas están en «Decisiones a confirmar».

## Navegación por rol

`navItems(clubSlug, role)` (`src/modules/tenancy/navigation.ts`):

| Rol | Pestañas |
| --- | --- |
| `coach`, `admin` | Inicio · Agenda · Sesiones · Biblioteca · Equipo |
| `player`, `guardian` | Inicio · Identidad |

- Dirección conserva «Gestión» en el menú de cuenta. Su barra propia (Temporada, Calendario, Personas y roles, Configuración) llega con la pieza 5, cuando existan esas pantallas. El rol de coordinación no existe todavía (pieza 5).
- Jugador y familia se quedan con dos pestañas: hoy RLS no les deja leer su equipo ni su calendario, y una Agenda vacía no es una opción «que pueden utilizar». Sus menús completos son la pieza 9.
- **Las URL no cambian**: `/train` (Sesiones), `/drills` (Biblioteca), `/way` (Identidad), `/team`, `/games/…`. Solo se añade `/agenda`.
- Pestaña activa: `/agenda` y `/games/…` → Agenda; `/train/…` → Sesiones; `/drills/…` → Biblioteca; `/team/…` → Equipo; `/way/…` → Identidad si el rol la tiene en la barra y, si no, Inicio (que es donde está su entrada).
- La barra reparte el ancho entre las pestañas que haya (dos o cinco).
- Las páginas no cambian su protección: quien entra por URL a una pantalla que su barra no ofrece ve lo mismo que hoy (RLS no le da datos).

## Identidad

- La entrada de navegación se llama siempre «Identidad» (término de plataforma). Como subtítulo lleva el nombre que el club da a su metodología (`branding.wayName`).
- Dónde está: pestaña para jugador y familia; para entrenador y dirección, una fila fija al final de Inicio y un enlace en el menú de cuenta.
- Dentro, las pantallas conservan el título que el club haya puesto en su terminología (`wayLabel`). Cuando el club no ha puesto ninguno, el título por defecto pasa de «The Way» a «Identidad», y el nombre por defecto de la metodología también.
- Los enlaces de los Standards y de los principios siguen igual (regla qué/por qué).

## Equipo activo

- **Qué es.** De «mis equipos» (`listMyTeams`: todos los del club para dirección, los de su cuerpo técnico para el resto, siempre de la temporada actual), uno elegido o «Todos mis equipos». Por defecto, todos: es lo que se ve hoy.
- **Dónde se guarda.** Una cookie `active-team` con el uuid del equipo, con `path=/c/{slug}` (así es por club sin llevar el club en el nombre), `SameSite=Lax`, `HttpOnly` y un año de vida. La escribe la acción `setActiveTeam(clubSlug, { teamId })`; `teamId: null` la borra.
- **Nunca se confía en ella.** `getTeamScope(ctx)` (`src/modules/team/scope.ts`, con `cache()`) lee «mis equipos» con la sesión del usuario y solo acepta la cookie si su valor es uno de ellos; si no, es como si no estuviera. Devuelve `{ teams, active, scoped }`: todos los míos, el elegido o `null`, y los que hay que enseñar.
- **A qué afecta.** Inicio, Agenda, Sesiones y Equipo leen `scoped`. Con un equipo elegido, Equipo abre su plantilla directamente, y «Preparar sesión» y «Nuevo partido» lo traen preseleccionado. Inicio pasa a usar «mis equipos» como las demás (hoy solo cuenta los que la persona entrena): dirección ve en Inicio lo próximo del club o del equipo que elija.
- **Selector.** En la cabecera de sección, entre la marca y el avatar, solo con más de un equipo: un botón con el nombre del equipo activo (o «Todos») que abre una hoja inferior con los equipos y «Todos mis equipos». Al elegir, la pantalla se vuelve a pedir. Las pantallas con cabecera de detalle no lo enseñan.

## Agenda

Ruta `/c/[club]/agenda`. Módulo nuevo `src/modules/schedule/` (el nombre que le reserva la especificación).

- Entrenos y partidos de los equipos de `scoped`, agrupados por semana en la zona del club: «Esta semana», «Semana que viene» y después «Semana del 19 oct».
- Pestañas en la URL, como las de Sesiones: «Próximos» (por defecto; lo que no ha terminado, ascendente) y «Anteriores» (`?scope=past`; descendente).
- Chips en la URL: Todo · Entrenos · Partidos (`?kind=practice|game`).
- Cada fila lleva a su pantalla (`/train/{id}` o `/games/{id}`) y dice lo mismo que dicen hoy las listas de Sesiones y de Partidos: día, título o rival, equipo si hay más de uno, lugar, hora y, si no está programado, cómo acabó (hecho, cancelado, resultado).
- Un solo botón principal, «Añadir», que abre una hoja con «Sesión de entrenamiento» y «Partido». Solo para quien puede gestionar alguno de los dos.
- Corta en 50 filas y lo dice, como las otras listas.
- `/games` (la lista) redirige a `/agenda?kind=game`. La ficha, el alta y la edición de un partido no cambian; sus enlaces de vuelta apuntan a Agenda.

## Sesiones y Biblioteca

- **Sesiones** es el `/train` de hoy con otro título y sin el bloque «Biblioteca». El botón de crear se llama «Preparar sesión» y abre el formulario actual; los dos caminos (proponer o desde cero) y las plantillas son la pieza 2. Todo lo que decía «Entrenar» (enlaces de vuelta, avisos) dice «Sesiones».
- **Biblioteca** es `/drills` como inicio de sección: cabecera de marca, título visible y su botón de crear, en vez de la cabecera de detalle con vuelta a Entrenar. La ficha de un ejercicio vuelve a Biblioteca.

## Directo: iniciar, continuar, revisar

### Lo que el servidor sabe

Dos columnas nuevas en `practice_plans`:

- `live_started_at timestamptz`: cuándo se pulsó «Iniciar». `null` = sin empezar.
- `live_position smallint`: índice (desde 0) del ejercicio en curso. `check (live_position is null or (live_position between 0 and 29 and live_started_at is not null))`.

Se guarda la posición y no el id del ítem: no hay clave foránea circular entre el plan y sus ítems, y quien lo lee la acota al número de ejercicios.

Las escribe `record_live_progress`, que gana dos parámetros opcionales al final (`p_started_at timestamptz default null`, `p_position int default null`): la primera vez que llega un `p_started_at` se guarda y ya no cambia; `p_position` sustituye a la anterior. Como cambia la lista de argumentos, la función se borra y se crea de nuevo.

`reset_live_progress(p_event uuid) returns timestamptz` (nueva, `security invoker`, por la puerta `private.open_session`): deja `live_started_at` y `live_position` a `null` en el plan y `completed` y `actual_minutes` a `null` en sus ítems. `NOT_FOUND` y `SESSION_CLOSED` como las demás (C26).

Privilegios (C27): `update (live_started_at, live_position)` para `authenticated` en `practice_plans`, apuntado en `posture.test.sql`.

### Los tres estados

| Estado | Cómo se sabe | Acción principal | Qué hace |
| --- | --- | --- | --- |
| Sin iniciar | evento `scheduled`, `live_started_at` nulo | «Iniciar entrenamiento» | Abre el ejercicio 1; el reloj arranca al pulsar «Iniciar» dentro |
| En curso | evento `scheduled`, `live_started_at` con valor | «Continuar entrenamiento», con «Ejercicio 3 de 5» debajo | Retoma el ejercicio guardado |
| Finalizada | evento `done` | Ninguna: la ficha es el resumen | — |

Lo dicen igual la card de Inicio y la ficha de la sesión, en cualquier dispositivo.

### Reconciliar el móvil con el servidor

El estado del dispositivo pasa a la versión 2 y guarda, además, si lo último se envió (`synced`). Los estados de la versión 1 se descartan. Al abrir el directo:

1. Si el móvil tiene progreso **sin enviar**, manda el móvil (pabellón sin cobertura).
2. Si no, manda el servidor:
   - sin empezar → estado nuevo, ejercicio 1, aunque el móvil guardara otra cosa;
   - en curso y el móvil está en el mismo ejercicio → el estado del móvil, con su tiempo exacto;
   - en curso y el móvil no tiene estado o va por otro ejercicio → el ejercicio del servidor, con su tiempo entero y el reloj en marcha.

El tiempo exacto de un ejercicio solo se retoma en el dispositivo que lo cronometró.

No se envía nada al servidor antes de «Iniciar».

### Empezar de nuevo y revisar

- «Empezar de nuevo» es una acción secundaria de la ficha, solo con la sesión en curso, con confirmación («¿Empezar de nuevo?» / «Se borra el progreso de esta sesión. No se puede deshacer.»). Llama a `reset_live_progress` y borra el estado del dispositivo.
- Una sesión terminada no se reinicia: sigue siendo de solo lectura y se reutiliza duplicándola (decisión de la Fase 4, para proteger el histórico).
- La ficha de una sesión hecha enseña, por ejercicio, si se completó y sus minutos reales junto a los previstos, y el total real.
- `/live` de una sesión hecha redirige a su ficha. Cancelada o ajena, el 404 de siempre.

### La pantalla

- Se rehace el marcado con las utilidades de la app (tokens) y `CTAButton`; desaparecen las clases `cos-*` y `*-space-*` que no existen.
- Si el ejercicio tiene vídeo, un enlace rotulado «Vídeo» que abre otra pestaña. La pizarra sigue visible. Es un enlace externo (YouTube o Vimeo): la app no puede saber si falla, así que no promete nada sobre eso.
- La pizarra animada y las instrucciones del ejercicio en directo son la pieza 3.

## Qué no cambia

- El aislamiento entre clubes y entre equipos: no hay tablas nuevas, y las dos columnas siguen las políticas del plan. La cookie del equipo activo solo filtra dentro de lo que RLS ya deja ver.
- Las reglas de CLAUDE.md: nada de un club en `src/`, tokens, horas en la zona del club, clave de servicio fuera de `src/`.
- Permisos (`can`), rutas existentes y contratos entre fases salvo lo que aquí se nombra.

## Pruebas

- **Unidad y componentes:** `navItems` y `activeNavKey` por rol; `getTeamScope` (cookie válida, ajena, ausente; dirección y entrenador); agrupación por semanas de la Agenda en la zona del club, también con otra zona en el proceso; el reductor y la reconciliación del directo; la barra con dos y con cinco pestañas; el selector de equipo; la card de Inicio y las acciones de la ficha en los tres estados.
- **pgTAP:** `record_live_progress` con los parámetros nuevos y `reset_live_progress`, con aislamiento por club y por equipo; el `check` de las columnas; `posture.test.sql` al día.
- **E2E (375×812):** las pestañas del entrenador y a dónde llevan; Agenda con sus filtros; cambio de equipo como dirección y su efecto en Inicio, Agenda, Sesiones y Equipo; iniciar → avanzar → salir → «Continuar» en Inicio y en la ficha → continuar donde iba; «Empezar de nuevo»; terminar y revisar. Los specs que ya existen se ajustan a los nombres nuevos.
- **Cierre:** `lint`, `typecheck`, `check:guards`, `TZ=UTC pnpm test`, `test:db`, `test:int`, `test:e2e`, y repaso en el navegador a 375×812 con los usuarios del seed.

## Design system

`design/` es la fuente visual: se actualiza la vista previa de `BottomNavigation` (pestañas nuevas, variante de dos) y se añaden las de lo que no existía (selector de equipo en `TopNavigation`, fila de Agenda si no basta `ListRow`, pantalla de directo si su vista previa no coincide).

## Fuera de esta pieza

- Los dos caminos de «Preparar sesión» y las plantillas (pieza 2).
- Pizarra estructurada, animación e instrucciones en directo (pieza 3).
- Barras de dirección, coordinación, jugador y familia más allá de lo dicho (piezas 5 y 9).
- Eventos recurrentes, importación de calendario y aviso de cambios (pieza 6).

## Decisiones a confirmar

Tomadas por este diseño sin preguntarlas una a una:

- Jugador y familia ven solo Inicio e Identidad hasta la pieza 9.
- El equipo activo por defecto es «Todos mis equipos», también para quien entrena dos.
- Inicio de dirección pasa a enseñar lo próximo de todos los equipos del club (o del elegido), en vez de «Aún no estás en ningún equipo».
- Continuar en otro dispositivo arranca el ejercicio guardado con su tiempo entero y el reloj en marcha.
- «Empezar de nuevo» solo existe con la sesión en curso; una terminada se duplica.
- El botón de crear en Sesiones se llama «Preparar sesión» ya en esta pieza, aunque abre el formulario de siempre.
