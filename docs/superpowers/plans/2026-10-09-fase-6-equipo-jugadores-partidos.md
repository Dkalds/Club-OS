# CLUB OS · Fase 6 (Equipo, jugadores, objetivos, notas y partidos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Estado: APROBADO por el propietario el 9 oct 2026**, con [D1]–[D10] tal como están. Las entrevistas con otros clubes no se han hecho: se asume el riesgo. Partido cancelado: código propio `GAME_CLOSED` (ver «Cambios propuestos al contrato»).

**Goal:** Un entrenador abre la pestaña Equipo y ve la plantilla de sus equipos de esta temporada. Entra en un jugador y le pone hasta tres objetivos activos, cada uno ligado si quiere a un foco o a un Standard del club; después de entrenar escribe una nota, privada o para el cuerpo técnico, y marca un objetivo como logrado cuando toca. En la pestaña Partidos ve los próximos y los jugados de sus equipos, crea un partido, lo edita y apunta el resultado. Nada de esto sale de su equipo ni de su club, y una nota privada no la lee nadie más que quien la escribió.

**Architecture:** Dos tablas nuevas de club (`player_goals`, `coach_notes`) con `organization_id NOT NULL`, RLS y claves foráneas compuestas, y las políticas de escritura de partidos que el contrato dejó para esta fase (C11). Las escrituras con reglas que una política no expresa (máximo de tres objetivos activos, alta de un partido con su evento) van en funciones SQL `security invoker`; el resto, en `insert`/`update` directos bajo RLS. Tres módulos de servidor (`team`, `development`, `games`) con lecturas por la sesión del usuario y Server Actions (C2) que acotan al club antes de escribir (C25). Las pantallas son Server Components con formularios de cliente en `BottomSheet` (C4).

**Tech Stack:** lo de las Fases 1–5. Sin dependencias nuevas.

**Spec:** `docs/spec/club-os-primera-entrega.md` (§4 «Desarrollo» y «Calendario», §5 permisos y «Menores», §6 sitemap, §7 «Objetivos de un jugador») + `docs/superpowers/plans/2026-10-03-00-contratos-entre-fases.md` («Fase 6 · … — produce», C1, C2, C4, C7, C11, C25, C27) + bloque «Fase 6» de `docs/superpowers/backlog.md` + `design/components/{PlayerCard,GameCard,Avatar,ListRow}/README.md`.

**Requiere:** Fases 1–5 fusionadas en `main` (lo están: Dkalds/Club-OS#8).

**Dentro de esta fase:** pestaña Equipo (mis equipos, plantilla, ficha del jugador), objetivos y notas, pestaña Partidos (lista, alta, detalle, edición, resultado, cancelar), y los pendientes del backlog asignados a la Fase 6. **Fuera:** alta y baja de jugadores, dorsales y plantillas (Gestión, Fase 7), fotos de jugadores (necesitan `consents`, Fase 7), convocatorias, estadísticas de partido, cuentas de jugador o familia con interfaz, importar partidos de la federación (spec §10), duplicar la estructura a otra temporada.

## Antes de empezar (no es código)

1. **Entrevistas con otros clubes.** La spec («Riesgos de producto») pide hablar con 2–3 clubes más antes de esta fase, para no construir solo para Arcángel. Si no se ha hecho, decidir si se hace ahora o se asume el riesgo, y apuntar aquí lo que cambie.
2. **Revisión del propietario** de este plan y de sus decisiones, sobre todo las de datos de menores ([D1], [D4], [D5]).
3. **Entorno:** Docker en marcha, `pnpm supabase start`, `pnpm seed`.

## Global Constraints

Las de las Fases 4 y 5 siguen valiendo todas (TypeScript estricto, regla de literales de club en `src/`, tokens, copy, horas en la zona del club, `requireClub` en cada página, 404 opaco, `TZ=UTC` además de la zona local en unidad). Además:

- Migraciones en el rango F6: `20261215000100_development.sql`, `…000200_games_write.sql`, `…000300_my_teams.sql` si hace falta.
- Toda tabla nueva: `organization_id NOT NULL`, RLS activado, claves foráneas compuestas `(organization_id, x_id)` a `people`, `teams`, `focus_areas`, `standards` y `events`, y su `pgTAP` de aislamiento por club **y** por equipo en la misma tarea. Cada `grant` nuevo se apunta en `posture.test.sql` (C27).
- Errores de dominio con `fromDbError` (C1). Esta fase añade `GOAL_LIMIT` y `GAME_CLOSED` a `ActionError` y a `ACTION_ERROR_COPY`.
- Argumentos opcionales de las funciones SQL al final y con `default null` (backlog, «Antes de empezar la Fase 3»).
- **Menores.** Ningún nombre de jugador en una URL (`/team/[teamId]/players/[personId]`, ids opacos). Nunca fecha de nacimiento; esta fase no muestra ni el año ([D5]). Sin fotos: iniciales en `Avatar`. Notas y objetivos no salen en ninguna lista, en Inicio ni en el `<title>` de la página. Los datos de ejemplo del seed, ficticios.
- Las notas no se registran en logs: `logError` recibe el error, nunca el cuerpo de la nota ni el título de un objetivo.
- Los partidos se muestran en `organizations.timezone`, como los entrenamientos. Formatos de la interfaz: «Sábado 10 oct», «10:30–12:00».
- `PlayerCard` y `GameCard` se reconstruyen desde su vista previa en `design/components/`; no se importan.

## Decisiones que este plan toma y hay que confirmar

Se marcan **[D1]–[D10]** donde se aplican. Si el propietario cambia alguna, se cambia aquí antes de ejecutar.

- **[D1] Quién lee una nota.** `private`: solo su autor, y tampoco dirección (spec §5: dirección «lee las compartidas»). `staff`: el cuerpo técnico del equipo de la nota y dirección. Solo el autor edita o borra la suya, sea cual sea su visibilidad. Si el autor deja el cuerpo técnico, sigue leyendo y borrando sus notas privadas, pero no crea nuevas en ese equipo.
- **[D2] Quién gestiona objetivos.** El cuerpo técnico del equipo del objetivo y dirección (spec §5: dirección «gestiona»). Un objetivo pertenece a un jugador **en un equipo** (`team_id`): si el jugador cambia de equipo la temporada siguiente, sus objetivos se quedan en el equipo anterior y el cuerpo técnico nuevo empieza de cero. El límite de tres activos es por jugador, sumando todos sus equipos.
- **[D3] Ciclo de un objetivo.** `active` → `achieved` (con `achieved_at`) o `archived`. Un objetivo logrado o archivado no se edita ni vuelve a activo; si hace falta, se crea otro. Al llegar a tres activos, «Añadir objetivo» se desactiva y explica por qué; si dos personas lo intentan a la vez, la base lo impide (`GOAL_LIMIT`).
- **[D4] Borrar una nota es borrarla de verdad.** Son datos sobre un menor: borrarla la quita de la base, no la archiva. Pide confirmación. Los objetivos no se borran: se archivan (son historial deportivo, no opinión).
- **[D5] La ficha del jugador** muestra nombre, apellidos, dorsal, posición, equipo y categoría. No muestra el año de nacimiento aunque esté en `people`: ya lo dice la categoría y es un dato menos expuesto.
- **[D6] Quién ve la plantilla y la ficha.** Dirección, todos los equipos del club; un entrenador, solo los equipos de los que es cuerpo técnico (`can_see_person`, ya existe). Sin cuentas de jugador ni de familia con interfaz en esta fase: las políticas nuevas no les dan lectura; se añadirá con `guardianships` (Fase 7).
- **[D7] «Mis equipos» es la temporada actual.** Los equipos de temporadas pasadas no salen en Equipo, Partidos, Entrenar ni Inicio. Sus datos siguen en la base; verlos queda para cuando haya selector de temporada.
- **[D8] Quién crea y edita partidos.** Quien gestiona el equipo (`private.can_manage_team`, como los entrenamientos, C11): su cuerpo técnico y dirección. Esto hereda la decisión pendiente de la Fase 4 (dirección escribe, la spec dice que gestiona eventos: aquí sí coincide).
- **[D9] Resultado y estado de un partido.** El resultado se apunta a partir de la hora de inicio, y apuntarlo deja el partido `done`. Se puede corregir después (a diferencia de una sesión hecha, el marcador sí se edita). Cancelar deja `cancelled`, no se deshace, y el partido sigue en «Jugados» con «Cancelado». Duración por defecto al crear: 90 minutos.
- **[D10] `GoalItem` y `NoteItem` no tienen vista previa en `design/components/`.** Se construyen con `ListRow`, `Card` y `StandardBadge` existentes, sin piezas visuales nuevas, y se añaden sus vistas previas y reglas a `design/components/` en la misma tarea para que el design system siga siendo la fuente de verdad.

## Review Focus

1. **Una nota privada es privada.** Álex escribe una nota privada sobre un jugador de Alevín A: Irene (mismo equipo), Raúl (dirección), Nora (otro equipo) y Marta (otro club) no la leen ni por la app, ni por la API de PostgREST con su sesión, ni contándola. Una nota `staff` la leen Irene y Raúl, y Nora y Marta no. → Tasks 2 (pgTAP), 5 (integración) y 12 (e2e).
2. **Tres objetivos activos, también con dos móviles a la vez.** El cuarto falla con `GOAL_LIMIT` aunque lleguen dos altas en paralelo (el trigger bloquea la fila del jugador). Lograr o archivar uno libera el hueco. → Task 2.
3. **Aislamiento de partidos.** Nora no crea ni edita un partido de Alevín A; Marta no ve los de Arcángel; `create_game` con el id de un equipo de otro club responde `NOT_FOUND` sin escribir (C25). Un partido no se cuelga de un evento de entrenamiento ni al revés. → Tasks 3 y 6.
4. **Nada de un menor donde no toca.** Ni nombres en URLs, ni fecha o año de nacimiento en pantalla, ni notas u objetivos en listas, Inicio, títulos de página o logs. → Tasks 8–10 (unidad) y 12 (e2e que revisa URLs y `<title>`).
5. **«Mis equipos» es esta temporada.** Con un equipo de la temporada pasada en el seed donde Álex era cuerpo técnico, no sale en ninguna pestaña. → Tasks 1 y 12.

---

## Estructura de ficheros

```
supabase/migrations/20261215000100_development.sql                    enums, player_goals, coach_notes
supabase/migrations/20261215000200_games_write.sql                    políticas de partidos, create_game, regla de kind
supabase/tests/database/{development,games_write,posture}.test.sql
scripts/seed/data.ts, scripts/seed/seed.int.test.ts                    temporada pasada, partido jugado, objetivos y notas ficticios
src/lib/action-result.ts, src/lib/permissions.ts                       GOAL_LIMIT; goal.manage, note.manage, game.manage
src/modules/team/{queries,map-rows,types}.ts (+ tests)                 listMyTeams, getTeam
src/modules/development/{queries,actions,schema,types}.ts (+ tests)    ficha, objetivos y notas
src/modules/games/{queries,actions,schema,types,format}.ts (+ tests)   partidos
src/ui/{player-card,goal-item,note-item}.tsx (+ tests); src/ui/game-card.tsx
design/components/{GoalItem,NoteItem}/                                 vista previa y reglas [D10]
src/app/c/[club]/(app)/team/…                                          /team, /team/[teamId], /team/[teamId]/players/[personId]
src/app/c/[club]/(app)/games/…                                         /games, /games/new, /games/[eventId]
src/modules/home/…, src/modules/practice/…                             pendientes del backlog
e2e/{team,games}.spec.ts
```

---

### Task 1: «Mis equipos» de esta temporada

**Files:**
- Create: `src/modules/team/{queries,map-rows,types}.ts` (+ tests)
- Modify: `src/modules/practice/map-rows.ts`, `scripts/seed/data.ts`, `scripts/seed/seed.int.test.ts`, `src/modules/practice/practice-list.tsx`, `src/app/c/[club]/(app)/train/new/page.tsx`

**Interfaces:**
- Produces (contrato F6): `listMyTeams(ctx): Promise<TeamSummary[]>` (dirección: todos los equipos de la temporada actual; entrenador: los suyos de la temporada actual; orden por `categories.sort`, después nombre) y `getTeam(ctx, teamId): Promise<TeamDetail | null>` (plantilla ordenada por dorsal, sin dorsal al final; cuerpo técnico con su rol). `null` si no existe, no es del club o no se ve: la página responde 404 opaco.
- Una sola definición de «equipo de esta temporada» que usan también Entrenar e Inicio ([D7]): `practice/map-rows.ts` deja `TEAM_COLUMNS` y `STAFF_TEAM_COLUMNS` y llama a la de `team`.

- [ ] **Step 1: Test que falla.** Seed: una temporada pasada (no actual) con un equipo «Alevín A» de la temporada anterior, Álex en su cuerpo técnico, dos jugadores ficticios y un entrenamiento hecho. `seed.int.test.ts` cuenta lo que dice C7 más esto. Unidad de `listMyTeams` con filas falsas; integración con `signInAs("alex@…")`: el equipo pasado no sale ni en `listMyTeams` ni en los equipos gestionables de Entrenar (backlog F6, «Los equipos gestionables se filtran por temporada…»).
- [ ] **Step 2: Implementar** `team/` y pasar Entrenar a usarlo.
- [ ] **Step 3: «Aún no estás en ningún equipo» según quién lo lee** (backlog F6). Dirección sin equipos: «Aún no hay equipos esta temporada.» + enlace a Gestión. Entrenador sin equipos: el texto actual. Jugador o familia: no se les ofrece crear sesiones (ya lo esconde `practice.manage`); el texto no sale.
- [ ] **Step 4:** `pnpm test`, `pnpm test:int` PASS.
- [ ] **Step 5: Commit** `feat(team): mis equipos son los de esta temporada`

---

### Task 2: Objetivos y notas en la base de datos

**Files:**
- Create: `supabase/migrations/20261215000100_development.sql`, `supabase/tests/database/development.test.sql`
- Modify: `supabase/tests/database/posture.test.sql`, `src/lib/database.types.ts`

**Interfaces (contrato F6):**
- Enums `goal_status ('active','achieved','archived')`, `note_visibility ('private','staff')`.
- `player_goals (id, organization_id, person_id, team_id, title ≤ 120, description ≤ 1000, focus_area_id null, standard_id null, status, created_by default auth.uid(), created_at, updated_at, achieved_at)`. Claves compuestas a `people`, `teams`, `focus_areas`, `standards`. El jugador tiene que estar en la plantilla de ese equipo (`team_players`): clave compuesta `(organization_id, team_id, person_id)` o comprobación en el trigger.
- `coach_notes (id, organization_id, person_id, team_id, author_id default auth.uid(), body 1–2000, visibility, created_at, updated_at)`.
- Trigger `player_goals_limit`: en `insert` y en `update` que pasa a `active`, bloquea la fila del jugador en `people` (`for update`) y lanza `GOAL_LIMIT` (`P0001`) si ya hay tres activos ([D2], [D3]).
- Trigger que impide pasar un objetivo `achieved` o `archived` a otro estado y que fija `achieved_at` al lograrlo ([D3]).

Políticas (una por tabla y operación):
- `player_goals`: `select`/`insert`/`update` si `private.can_manage_team(team_id)` y el jugador está en la plantilla de ese equipo; sin `delete` ([D4]). `with check` sobre `organization_id` y `team_id`.
- `coach_notes`: `select` si `author_id = auth.uid()` o (`visibility = 'staff'` y (`private.is_team_staff(team_id)` o admin del club)) ([D1]); `insert` si `author_id = auth.uid()` y `private.is_team_staff(team_id)` o admin; `update`/`delete` solo si `author_id = auth.uid()`.
- Grants por columna para `authenticated` (C27): `player_goals` `insert (organization_id, person_id, team_id, title, description, focus_area_id, standard_id)`, `update (title, description, focus_area_id, standard_id, status)`; `coach_notes` `insert (organization_id, person_id, team_id, body, visibility)`, `update (body, visibility)`, `delete`.

- [ ] **Step 1: Test que falla** `development.test.sql` (Review Focus 1 y 2):
  - Álex crea objetivo y nota en un jugador de Alevín A; Nora no puede (0 filas / `42501`); Marta no ve nada de Arcángel; `anon` → `42501`.
  - nota `private` de Álex: Irene, Raúl, Nora, Marta → 0 filas; la de `staff`: Irene y Raúl la ven, Nora y Marta no.
  - Irene no edita ni borra la nota `staff` de Álex.
  - objetivo de un jugador que no está en ese equipo, o con un Standard o foco de otro club → falla.
  - tres activos y un cuarto → `GOAL_LIMIT`; lograr uno → el cuarto entra; un logrado no vuelve a `active`; `achieved_at` se fija solo.
  - dos transacciones que añaden el tercer y cuarto objetivo a la vez: una falla (con `dblink` o dos sesiones, como los tests de bloqueo de la Fase 4; si no se puede en pgTAP, test de integración en Task 5).
  - `posture.test.sql`: columnas y privilegios nuevos.
- [ ] **Step 2–4:** FAIL → migración → `pnpm supabase db reset && pnpm test:db` PASS; `pnpm db:types`; `supabase db lint` sin errores.
- [ ] **Step 5: Commit** `feat(db): objetivos y notas de jugador, con notas privadas de verdad`

---

### Task 3: Escribir partidos en la base de datos

**Files:**
- Create: `supabase/migrations/20261215000200_games_write.sql`, `supabase/tests/database/games_write.test.sql`
- Modify: `supabase/tests/database/posture.test.sql`, `src/lib/database.types.ts`

**Interfaces:**
- Políticas `events_insert_game_managed` y `events_update_game_managed` (`kind = 'game'` y `private.can_manage_team(team_id)`), y `games_insert_managed`/`games_update_managed` sobre el evento del partido (C11). Los privilegios por columna de `events` ya existen; `games`: `update (opponent_name, competition_name, home_away, score_for, score_against, opponent_notes)`.
- Produces (contrato F6, argumentos opcionales al final): `public.create_game(p_team uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_opponent text, p_competition text default null, p_home_away text default null, p_location text default null) returns uuid`: crea el evento `kind = 'game'` y su fila de `games` en una transacción. `NOT_FOUND` si el equipo no se gestiona; `INVALID` si el rival está vacío o `ends_at <= starts_at`.
- Regla de `kind` (backlog F6, «Partido colgado de un evento de entrenamiento»): un trigger impide una fila de `games` cuyo evento no sea `kind = 'game'`, y que un evento con fila en `games` cambie de `kind`.
- Resultado ([D9]): `score_for`/`score_against` ambos o ninguno, entre 0 y 300; solo si `starts_at <= now()`; escribirlos deja el evento `done`. Un partido `cancelled` no admite cambios ni resultado (`GAME_CLOSED`).

- [ ] **Step 1: Test que falla** `games_write.test.sql` (Review Focus 3): Álex crea y edita un partido de Alevín A; Irene también; Raúl en cualquier equipo; Nora y Marta → `NOT_FOUND`/0 filas; `create_game` con un equipo de Club Demo desde Arcángel → `NOT_FOUND`; fila de `games` sobre un entrenamiento → error; resultado antes de empezar → `INVALID`; resultado a medias → `INVALID`; resultado o edición de un cancelado → `GAME_CLOSED`; `posture.test.sql` al día.
- [ ] **Step 2–4:** FAIL → migración → PASS; `pnpm db:types`; `supabase db lint`.
- [ ] **Step 5: Commit** `feat(db): los partidos se crean y se editan desde el equipo`

---

### Task 4: Errores y permisos nuevos

**Files:** Modify `src/lib/action-result.ts`, `src/lib/permissions.ts` (+ tests)

- `ActionError` añade `GAME_CLOSED` (copy «Este partido está cancelado y no se puede cambiar.») y `GOAL_LIMIT` con el copy «Este jugador ya tiene 3 objetivos activos. Marca uno como logrado o archívalo para añadir otro.».
- `Action` añade `'goal.manage' | 'note.manage' | 'game.manage'`: `admin` y `coach` las tres (la base decide el equipo).
- [ ] TDD de `fromDbError` (`P0001` + `GOAL_LIMIT`) y de `can`. Commit `feat(lib): GOAL_LIMIT y permisos de objetivos, notas y partidos`.

---

### Task 5: Módulo `development` (ficha, objetivos, notas)

**Files:** Create `src/modules/development/{queries,actions,schema,types,map-rows}.ts` (+ tests unitarios y `*.int.test.ts`)

**Interfaces (contrato F6):**
- `getPlayerProfile(ctx, teamId, personId): Promise<PlayerProfile | null>`: el jugador en ese equipo ([D5]: sin año de nacimiento), sus objetivos de ese equipo (activos primero; logrados y archivados en «Historial»), cada uno con su foco y su Standard (regla 8), y las notas que el usuario puede leer, de la más reciente a la más antigua, con autor y visibilidad. `null` → 404.
- Server Actions (C2, primer parámetro `clubSlug`): `createGoal`, `updateGoal`, `achieveGoal`, `archiveGoal`, `createNote`, `updateNote`, `deleteNote`. Cada una lee antes la fila (o el equipo y el jugador) con la sesión del usuario filtrando por `organization_id = ctx.org.id` y responde `NOT_FOUND` sin escribir si no está (C25). Zod: título 1–120, descripción ≤ 1000, nota 1–2000.
- Revalidan la ficha del jugador. Nunca registran el texto (Global Constraints).

- [ ] **Step 1: Tests que fallan.** Unidad con cliente falso (como `practice/actions.test.ts`): validación, `NOT_FOUND` de otro club, `GOAL_LIMIT` traducido, `logError` sin contenido. Integración con `signInAs`: Review Focus 1 entero a través de `getPlayerProfile` (Irene no recibe la nota privada de Álex) y el cuarto objetivo en paralelo con `Promise.all` (Review Focus 2).
- [ ] **Step 2–3:** implementar; `pnpm test`, `pnpm test:int` PASS.
- [ ] **Step 4: Commit** `feat(development): ficha del jugador, objetivos y notas`

---

### Task 6: Módulo `games`

**Files:** Create `src/modules/games/{queries,actions,schema,types,format}.ts` (+ tests)

**Interfaces (contrato F6):**
- `listGames(ctx, scope: 'upcoming' | 'played')`: partidos de «mis equipos» ([D7]); próximos por fecha ascendente (`scheduled` que no han terminado), jugados descendente (hechos, cancelados y programados que ya terminaron, como el histórico de Entrenar). Sin corte silencioso: si hay más de 50, «Ver más» (lección de `LIST_LIMIT`, backlog F4).
- `getGame(ctx, eventId)`: partido con equipo, rival, competición, local o visitante, lugar, horas, estado, resultado y notas del rival (estas solo si `game.manage`).
- Server Actions: `createGame` (llama a `create_game` tras comprobar el equipo en el club, C25), `updateGame`, `recordResult`, `cancelGame`. Errores: `NOT_FOUND`, `INVALID`, `GAME_CLOSED`.
- `format.ts`: «Sábado 10 oct», «10:30–12:00», «Local»/«Visitante», marcador desde el punto de vista del club (propio primero).

- [ ] TDD como Task 5 (unidad + integración con Álex, Nora y Marta). Commit `feat(games): lista, detalle y escritura de partidos`.

---

### Task 7: Componentes `PlayerCard`, `GoalItem`, `NoteItem` y arreglos de `GameCard`

**Files:** Create `src/ui/{player-card,goal-item,note-item}.tsx` (+ tests); Modify `src/ui/game-card.tsx` (+ test); Create `design/components/{GoalItem,NoteItem}/{preview.html,README.md}` ([D10])

- `PlayerCard`: desde `design/components/PlayerCard/` (dorsal en `brand-accent` y `font-display` a la derecha, iniciales en `Avatar`, fila entera enlaza a la ficha, nunca año de nacimiento ni notas).
- `GoalItem`: título, descripción corta, `StandardBadge` o foco si los tiene (regla 8), estado («Activo», «Logrado el martes 6 oct», «Archivado») y acciones si se pueden.
- `NoteItem`: cuerpo, autor, fecha relativa en la zona del club y «Solo yo» o «Cuerpo técnico»; editar y borrar solo para el autor.
- `GameCard` (backlog F6): cada equipo se anuncia una sola vez a lectores de pantalla (un `aria-label` con «{propio} contra {rival}, {fecha}» y lo visual `aria-hidden`); el tono del avatar rival por prop, no por selector descendiente.
- [ ] TDD de cada uno (roles, nombres accesibles, sin hex ni corchetes, `check:guards`). Commit `feat(ui): PlayerCard, GoalItem y NoteItem`.

---

### Task 8: Pestaña Equipo

**Files:** Modify/Create `src/app/c/[club]/(app)/team/page.tsx`, `team/[teamId]/page.tsx` (+ tests, `loading.tsx`, `not-found` heredado)

- `/team`: con un equipo, redirige a su plantilla; con varios (dirección, o un entrenador con dos equipos), lista de equipos con categoría y número de jugadores; sin equipos, el estado vacío de Task 1.
- `/team/[teamId]`: cabecera con equipo y categoría, cuerpo técnico, plantilla con `PlayerCard`. Estado vacío «Este equipo aún no tiene jugadores.».
- `<title>` con el nombre del equipo, nunca de un jugador (Review Focus 4).
- [ ] TDD de las páginas (404 opaco con un equipo de otro club o de otra temporada). Commit `feat(team): plantilla de mis equipos`.

---

### Task 9: Ficha del jugador con objetivos y notas

**Files:** Create `src/app/c/[club]/(app)/team/[teamId]/players/[personId]/page.tsx` y `_components/{goal-sheet,note-sheet,player-goals,player-notes}.tsx` (+ tests)

- Ficha ([D5]): nombre, dorsal, posición, equipo y categoría. `<title>`: «Jugador · {equipo}», sin el nombre.
- «Objetivos» (máximo 3 activos, [D3]): «Añadir objetivo» abre un `BottomSheet` con título, descripción, foco y Standard (selectores con lo publicado del club). Con tres activos el botón se desactiva con su explicación. En cada objetivo activo: «Editar», «Marcar como logrado», «Archivar» (este con `ConfirmDialog`). «Historial» plegado con los logrados y archivados.
- «Notas»: «Añadir nota» con cuerpo y visibilidad («Solo yo» por defecto, [D1]); editar y borrar solo las propias (borrar con `ConfirmDialog`, [D4]: «Se borrará para siempre.»). `useLeaveGuard` en los formularios con cambios (C4).
- [ ] TDD (componentes y página). Commit `feat(team): objetivos y notas en la ficha del jugador`.

---

### Task 10: Pestaña Partidos

**Files:** Modify/Create `src/app/c/[club]/(app)/games/page.tsx`, `games/new/page.tsx`, `games/[eventId]/page.tsx` y `_components/{game-form,result-sheet}.tsx` (+ tests)

- `/games`: pestañas «Próximos» y «Jugados» (`?scope=played`, como Entrenar), filas con `GameCard`; «Nuevo partido» si `game.manage`.
- `/games/new`: equipo (si gestiona varios), rival, fecha, hora de inicio y fin (fin por defecto a 90 min, [D9]), local o visitante, competición y lugar; `useLeaveGuard`.
- `/games/[eventId]`: datos del partido, «Editar», «Apuntar resultado» (desde la hora de inicio) o el marcador con «Corregir resultado», «Cancelar partido» (`ConfirmDialog`), notas del rival si `game.manage`.
- [ ] TDD. Commit `feat(games): pestaña Partidos`.

---

### Task 11: Inicio y Entrenar con partidos (pendientes del backlog)

**Files:** Modify `src/modules/home/{queries,home-screen}.tsx`, `src/modules/practice/{queries,map-rows}.ts`, `src/app/c/[club]/(app)/train/[eventId]/page.tsx` (+ tests)

- El próximo partido se pide aparte del límite de 30 eventos de «Esta semana» (backlog F6): nunca lo esconde un mes con muchos entrenamientos.
- El enlace de cada fila de Inicio con `switch` sobre `kind` y `never`: entreno → su sesión; partido → `/games/[eventId]`.
- Un entreno sin plan (backlog F6): no sale en las listas de Entrenar ni en Inicio, en vez de llevar a un 404. Test con un evento sin plan creado en el test.
- [ ] TDD. Commit `fix(home): el próximo partido no se pierde y enlaza a su pantalla`.

---

### Task 12: Seed y e2e

**Files:** Modify `scripts/seed/data.ts`, `scripts/seed/seed.int.test.ts`, `e2e/helpers/seed.ts`, `playwright.config.ts`; Create `e2e/team.spec.ts`, `e2e/games.spec.ts`

- Seed (C7): Alevín A pasa de 8 a 9 eventos con un partido jugado (resultado ficticio). Objetivos ficticios (dos activos y uno logrado en un jugador, tres activos en otro para probar el límite) y notas (una privada de Álex, una de `staff` de Irene). Nombres y textos inventados, sin parecido con personas reales.
- `team.spec.ts` (proyecto `mobile`, solo lectura): Álex ve su plantilla y la ficha; Irene no ve la nota privada de Álex y sí la de `staff`; Nora recibe 404 en la ficha de un jugador de Alevín A; Marta no ve Arcángel; la temporada pasada no sale; ninguna URL ni `<title>` lleva un nombre de jugador (Review Focus 1, 4 y 5).
- `games.spec.ts` y la parte de escritura de `team` (proyecto `admin`, en serie, con `restoreSeed` antes y después): crear un partido, apuntar el resultado, cancelarlo; añadir objetivo hasta el límite y ver el aviso; lograr uno; añadir, editar y borrar una nota.
- [ ] Commit `test(e2e): equipo, jugadores y partidos`.

---

### Task 13: Cierre de la fase

- [ ] Desde una base vacía (`supabase db reset`, `pnpm seed` dos veces, `pnpm db:types` sin deriva): `supabase db lint`, `lint`, `typecheck`, `check:guards`, unidad (también con `TZ=UTC`), `test:db`, `test:int`, `test:e2e`.
- [ ] Arrancar la app, revisar la consola, repasar a 375×812 con Álex, Irene, Nora, Raúl y Marta todas las pantallas nuevas (sin scroll horizontal, áreas de 44 px, una sola cabecera, marca del club).
- [ ] Actualizar `docs/superpowers/backlog.md`: cerrar el bloque «Fase 6» y pasar lo que quede a la Fase 7.
- [ ] README: «Despliegue de Equipo y Partidos (Fase 6)» con las migraciones a aplicar en el remoto.
- [ ] Abrir el PR.

---

## Cambios propuestos al contrato

- **`GAME_CLOSED` para partidos cancelados** (decidido): `P0001`, copy «Este partido está cancelado y no se puede cambiar.». `SESSION_CLOSED` sigue siendo solo de sesiones.
- **`getPlayerProfile(ctx, personId)` pasa a `getPlayerProfile(ctx, teamId, personId)`.** Los objetivos y las notas son de un jugador en un equipo ([D2]); la ruta ya lleva los dos ids.
- **`player_goals` lleva `updated_at`** (el contrato no lo nombra) para que una edición desde dos móviles se detecte como en las sesiones, si el propietario lo quiere; si no, se quita.
