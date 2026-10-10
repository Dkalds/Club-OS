# Uso diario del entrenador · Plan de implementación

> **Para quien lo ejecute:** se ejecuta en esta sesión, tarea a tarea (superpowers:executing-plans), con una revisión de toda la rama al final. Los pasos llevan casilla (`- [ ]`).

**Objetivo:** barra por rol, Sesiones y Biblioteca separadas, Agenda, equipo activo en toda la app y un directo que distingue iniciar, continuar y revisar.

**Arquitectura:** sin tablas nuevas. Dos columnas en `practice_plans` hacen que el servidor sepa si una sesión está empezada y por dónde va; el dispositivo se reconcilia con ellas. El equipo activo es una cookie por club que solo filtra dentro de «mis equipos». La navegación sale del rol en `tenancy/navigation.ts`. Agenda es un módulo nuevo (`schedule`) que lee `events` como ya lo hacen Inicio, Sesiones y Partidos.

**Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres, RLS, pgTAP), Tailwind 4 con tokens, Vitest, Playwright.

**Especificación:** `docs/superpowers/specs/2026-10-10-uso-diario-design.md`

## Restricciones globales

- Reglas de `CLAUDE.md`: nada de un club en `src/`; clave de servicio solo en `scripts/` y `e2e/`; colores, espacios y radios con tokens (ni hex ni medidas entre corchetes en `.tsx`); horas en `organizations.timezone`; español, tuteando, sin exclamaciones.
- Las URL existentes no cambian. Solo se añade `/c/[club]/agenda`.
- Contratos entre fases: C1 (errores), C2 y C14 (`mutate`, `useAction`), C15 (opcionales omitidos), C22 (toda escritura en ítems mueve el plan), C24 (cerrar es lo último), C25 (acotar al club antes de la RPC), C26 (`NOT_FOUND` primero), C27 (postura), C29 (medidas y listas), C30 (e2e de sesiones en `admin`).
- TDD: test que falla, código mínimo, test en verde, commit por tarea.
- Cada página bajo `/c/[club]` se protege con `requireClub`.

## Foco de revisión

1. Cookie `active-team` con el uuid de un equipo que ya no es mío (cambio de temporada, baja del cuerpo técnico): se ignora y se ve «Todos», no una pantalla vacía. → Tarea 5.
2. Sesión en curso a la que se le quitan ejercicios desde otro móvil: `live_position` mayor que el número de ejercicios se acota al último. → Tarea 2.
3. Móvil con progreso sin enviar y servidor reiniciado («Empezar de nuevo» en otro dispositivo): manda el móvil y vuelve a subirlo, sin perder lo cronometrado. → Tarea 2.
4. Semana que cruza el cambio de hora (25 oct 2026) y proceso en otra zona: los grupos de Agenda salen por días de calendario del club. → Tarea 6.
5. Rol sin pestaña para la ruta en la que está (entrenador en `/way`): la barra marca Inicio, nunca ninguna ni dos. → Tarea 8.

---

### Tarea 0 · Entorno del worktree

- [x] `supabase/config.toml`: `project_id = "clubos-mejoras"` y puertos en un rango libre (mirar `docker ps`); `git update-index --skip-worktree supabase/config.toml`.
- [x] `pnpm supabase start -x studio,imgproxy,vector,logflare,realtime,edge-runtime,supavisor`; `.env.local` desde `pnpm supabase status -o env` sin imprimir claves.
- [x] Línea base en verde: `pnpm seed`, `pnpm test`, `pnpm test:db`, `pnpm check:guards`, `pnpm typecheck`.

### Tarea 1 · Base de datos: estado del directo

**Ficheros**
- Crear: `supabase/migrations/20270105000100_live_state.sql`
- Crear: `supabase/tests/database/live_state.test.sql`
- Modificar: `supabase/tests/database/posture.test.sql` (privilegio de columna nuevo), tests pgTAP que llamen a `record_live_progress` si cambia su firma
- Regenerar: `src/lib/database.types.ts`

**Produce**
- `practice_plans.live_started_at timestamptz`, `practice_plans.live_position smallint`, con `check (live_position is null or (live_position between 0 and 29 and live_started_at is not null))`.
- `grant update (live_started_at, live_position) on public.practice_plans to authenticated`.
- `public.record_live_progress(p_event uuid, p_items jsonb, p_finished boolean, p_actual_minutes int default null, p_started_at timestamptz default null, p_position int default null) returns jsonb` (se borra la de cuatro argumentos). `live_started_at = coalesce(live_started_at, p_started_at)`; `live_position = coalesce(p_position, live_position)`; `p_position` fuera de 0–29 o con la sesión sin empezar (ni guardada ni en esta llamada) → `INVALID` (`22023`).
- `public.reset_live_progress(p_event uuid) returns timestamptz`: `private.open_session`, ítems a `completed = null, actual_minutes = null`, plan a `live_started_at = null, live_position = null`; devuelve `updated_at`. `execute` solo `authenticated`.

- [x] pgTAP que falla: columnas y `check`; `record_live_progress` guarda `p_started_at` la primera vez y no lo pisa; `p_position` sustituye; `p_position = 30` y posición sin inicio dan `22023`; `reset_live_progress` limpia plan e ítems y mueve `updated_at`; entrenador de otro equipo y miembro de otro club reciben `P0002` en las dos; sesión `done` → `SESSION_CLOSED` en reset; `anon` no ejecuta ninguna.
- [x] Migración; `pnpm supabase db reset`; `pnpm test:db` en verde; `pnpm supabase db lint`.
- [x] `pnpm db:types`; commit.

### Tarea 2 · Directo: estado y sincronización

**Ficheros**
- Modificar: `src/modules/live/types.ts`, `storage.ts`, `reducer.ts`, `use-live.ts`, `schema.ts`, `queries.ts`, `src/app/api/live-progress/route.ts`, `src/modules/live/clear-live-data.ts` si depende de la clave
- Crear: `src/modules/live/reconcile.ts` (+ test)
- Tests: los `.test.ts` de cada uno

**Produce**
- `LiveSession` gana `live: { startedAt: string | null; position: number | null }` y `LiveItem` gana `videoUrl: string | null`.
- `LiveState.version` pasa a `2`. `StoredLive = { state: LiveState; synced: boolean }`; `saveLiveState(state, synced)`, `loadLiveState(eventId): StoredLive | null` (descarta v1), `clearLiveState(eventId)`.
- `reconcile(session: LiveSession, stored: StoredLive | null, nowMs: number): LiveState` con las reglas de la especificación («Reconciliar el móvil con el servidor»); la posición del servidor se acota a `items.length - 1`.
- `liveProgressSchema` gana `startedAt: z.string().datetime({ offset: true }).optional()` y `position: z.number().int().min(0).max(29).optional()`; `toProgressPayload` los rellena desde el estado; la ruta los pasa como `p_started_at` y `p_position` solo si llegan (C15).
- `useLive` no envía nada mientras `state.startedAt === null`, guarda `synced: false` al cambiar el estado y `true` cuando el envío termina bien.
- `getLiveSession` devuelve `{ kind: "live"; session } | { kind: "done" } | null` y falla con `throwReadError`.

- [x] Tests que fallan: `reconcile` (los cuatro casos, posición fuera de rango, sesión sin ejercicios); `storage` (v1 se descarta, `synced` va y vuelve); `useLive` (sin envío antes de iniciar; `synced` tras éxito); `schema` y `route` (parámetros nuevos, omitidos si no llegan); `queries` (estado del servidor, sesión hecha).
- [x] Implementar; `pnpm test src/modules/live src/app/api` en verde; commit.

### Tarea 3 · Directo: pantalla

**Ficheros**
- Modificar: `src/app/c/[club]/(live)/train/[eventId]/live/page.tsx`, `live-screen.tsx`, `error.tsx`, `loading.tsx`; `src/ui/live-controls.tsx`, `src/ui/timer.tsx` (solo quitar clases que no existen)
- Crear: `live-screen.test.tsx` si no existe

- [x] Tests que fallan: la página redirige a la ficha con `kind: "done"`; la pantalla sin iniciar enseña «Iniciar» como botón principal y el número de ejercicios; con vídeo, un enlace «Vídeo» con `target="_blank"` y `rel="noopener noreferrer"`; ninguna clase `cos-` ni `-space-` suelta en el marcado.
- [x] Rehacer el marcado con utilidades de token y `CTAButton`; el vídeo pasa por `safeHref`.
- [x] Tests en verde; `pnpm check:guards`; commit.

### Tarea 4 · Iniciar, continuar, revisar en la ficha y en Inicio

**Ficheros**
- Modificar: `src/modules/practice/types.ts`, `map-rows.ts`, `actions.ts`, `schema.ts`; `src/app/c/[club]/(app)/train/_components/practice-actions.tsx`; `src/app/c/[club]/(app)/train/[eventId]/page.tsx`; `src/modules/home/types.ts`, `map-rows.ts`, `build-home.ts`, `queries.ts`, `home-screen.tsx`; `src/ui/practice-item.tsx` si hace falta para los minutos reales
- Crear: `src/modules/live/label.ts` (+ test)

**Produce**
- `PracticeDetail.live: { startedAt: string | null; position: number | null }`; `PracticeDetailItem` gana `completed: boolean | null` y `actualMinutes: number | null`; `PracticeDetail.actualMinutes: number | null`.
- `HomePractice.live: { started: boolean; position: number | null }`.
- `liveEntry(live: { started: boolean; position: number | null }, itemCount: number): { label: "Iniciar entrenamiento" | "Continuar entrenamiento"; caption: string | null }`; `caption` es «Ejercicio 3 de 5».
- Acción `resetLiveProgress(clubSlug, { eventId }): Promise<ActionResult<{ updatedAt: string }>>` con `mutate`, permiso `practice.manage`, lectura previa acotada al club (C25).

- [x] Tests que fallan: `liveEntry`; `PracticeActions` en los tres estados (sin iniciar; en curso con «Empezar de nuevo» y su confirmación, que al terminar llama a `clearLiveState`; hecha sin botón de directo); la ficha de una sesión hecha enseña minutos reales y previstos por ejercicio y el total real; `buildHome` y `HomeScreen` con sesión en curso; `resetLiveProgress` (éxito, `NOT_FOUND` sin llamar a la RPC, `SESSION_CLOSED`).
- [x] Implementar. `PracticeActions` deja de leer `localStorage` para decidir la etiqueta.
- [x] Tests en verde; commit.

### Tarea 5 · Equipo activo

**Ficheros**
- Crear: `src/modules/team/scope.ts`, `src/modules/team/actions.ts`, `src/ui/team-switcher.tsx` (+ tests)
- Modificar: `src/ui/top-navigation.tsx`, `src/app/c/[club]/(app)/layout.tsx`, `src/modules/home/queries.ts`, `src/modules/practice/queries.ts`, `src/modules/games/queries.ts`, `src/app/c/[club]/(app)/team/page.tsx`, los formularios de alta de sesión y de partido (equipo por defecto)

**Produce**
- `ACTIVE_TEAM_COOKIE = "active-team"`.
- `type TeamScope = { teams: TeamSummary[]; active: TeamSummary | null; scoped: TeamSummary[] }`.
- `getTeamScope(ctx: ClubContext): Promise<TeamScope>` (`cache()`); `pickScope(teams: TeamSummary[], cookie: string | undefined): TeamScope` (pura).
- `setActiveTeam(clubSlug, { teamId: string | null }): Promise<ActionResult<null>>`: valida que el equipo es de `listMyTeams`; cookie con `path: /c/{slug}`, `httpOnly`, `sameSite: "lax"`, `secure` en producción, `maxAge` de un año; `null` la borra.
- `TeamSwitcher({ clubSlug, teams: { id: string; name: string }[], activeId: string | null })`: botón con el nombre o «Todos» que abre `BottomSheet` «Equipo»; opciones como botones con `aria-pressed`; al elegir, `setActiveTeam` y `router.refresh()`.
- `TopNavigation` (variante `home`) acepta `team?: { teams; activeId }` y lo pinta solo con más de un equipo.

- [x] Tests que fallan: `pickScope` (sin cookie, cookie válida, cookie ajena o malformada, sin equipos); `setActiveTeam` (equipo ajeno → `NOT_FOUND` sin escribir cookie; `null` borra); `TeamSwitcher`; `TopNavigation` con uno y con dos equipos; `listPractices`, `listGames` y `getHomeData` filtran por `scoped`; Inicio de dirección con equipos del club; Equipo abre la plantilla con equipo activo.
- [x] Implementar; tests en verde; commit.

### Tarea 6 · Agenda

**Ficheros**
- Crear: `src/modules/schedule/types.ts`, `queries.ts`, `map-rows.ts`, `build-agenda.ts`, `agenda-list.tsx`, `add-menu.tsx` (+ tests); `src/app/c/[club]/(app)/agenda/page.tsx`, `loading.tsx`, `error.tsx` (+ tests)
- Modificar: `src/app/c/[club]/(app)/games/page.tsx` (redirige), enlaces de vuelta de `games/[eventId]`, `games/new` y sus `loading`/`error`; borrar `src/modules/games/game-list.tsx` y `listGames` si quedan sin uso

**Produce**
- `type AgendaScope = "upcoming" | "past"`; `type AgendaKind = "all" | "practice" | "game"`.
- `type AgendaItem = { eventId: string; kind: "practice" | "game"; href: string; chip: { top: string; day: string }; title: string; subtitle: string; trail: string | null; done: boolean }`.
- `type AgendaWeek = { key: string; label: string; items: AgendaItem[] }`.
- `listAgenda(ctx, { scope, kind }, nowIso): Promise<{ weeks: AgendaWeek[]; teamCount: number; truncated: boolean }>`; `buildAgenda(events, teams, { scope, nowIso, tz, clubSlug }): AgendaWeek[]` (pura).
- Etiquetas de semana: «Esta semana», «Semana que viene», «Semana pasada» y, si no, «Semana del 19 oct» (lunes de esa semana en la zona del club).

- [x] Tests que fallan: `buildAgenda` (agrupa por semana de lunes a domingo en la zona del club; orden ascendente en próximos y descendente en anteriores; un entreno sin plan no sale; partido con resultado; cancelado; con varios equipos el subtítulo abre con el equipo; semana del cambio de hora con `TZ=UTC` y `TZ=America/Santiago`); `listAgenda` (filtra por `scoped`, por `kind`, corta en 50); `AgendaList` (pestañas, chips que conservan la otra query, estados vacíos, «Añadir» solo con permiso); la página (`?scope` y `?kind` no válidos caen en los valores por defecto); `/games` redirige a `/agenda?kind=game`.
- [x] Implementar; tests en verde; commit.

### Tarea 7 · Sesiones y Biblioteca

**Ficheros**
- Modificar: `src/app/c/[club]/(app)/train/page.tsx` y sus `loading`/`error`; `src/modules/practice/practice-list.tsx`; `src/modules/team/no-teams.ts`; `BackLink` y avisos que dicen «Entrenar» en `train/**` y `drills/**`; `src/app/c/[club]/(app)/drills/page.tsx`, `loading.tsx`, `error.tsx`

- [x] Tests que fallan (ajustando los existentes): `/train` se titula «Sesiones», no enlaza a la biblioteca y su botón dice «Preparar sesión»; los enlaces de vuelta dicen «Sesiones»; `/drills` lleva la cabecera de marca, `<h1>` visible «Biblioteca» y «Nuevo ejercicio» con permiso; la ficha de un ejercicio vuelve a `/drills`.
- [x] Implementar; tests en verde; commit.

### Tarea 8 · Navegación por rol e Identidad

**Ficheros**
- Modificar: `src/modules/tenancy/navigation.ts`, `src/modules/tenancy/queries.ts` (nombre por defecto), `src/ui/bottom-navigation.tsx`, `src/ui/icons.tsx`, `src/ui/app-shell.tsx`, `src/ui/account-menu.tsx`, `src/ui/top-navigation.tsx`, `src/app/c/[club]/(app)/layout.tsx`, `src/modules/home/home-screen.tsx`, `src/app/c/[club]/(app)/page.tsx`

**Produce**
- `type NavKey = "home" | "agenda" | "sessions" | "library" | "team" | "identity"`.
- `navItems(clubSlug: string, role: Role): NavItem[]`; `activeNavKey(pathname: string, clubSlug: string, keys: readonly NavKey[]): NavKey`.
- `IDENTITY_LABEL = "Identidad"`; `wayLabel` cae en él cuando el club no ha puesto nombre.
- `AccountMenu({ name, links: { label: string; href: string }[] })`.
- `HomeScreen` gana `identity: { href: string; subtitle: string } | null`.

- [x] Tests que fallan: `navItems` por los cuatro roles; `activeNavKey` (`/agenda`, `/games/x`, `/train/x`, `/drills/x`, `/team/x`, `/way/x` con y sin pestaña de identidad, otro club); `BottomNavigation` con dos y con cinco pestañas (columnas repartidas, una sola `aria-current`); `AccountMenu` con «Identidad» y «Gestión»; `HomeScreen` con y sin la fila de identidad; el layout pasa el rol.
- [x] Implementar; tests en verde; commit.

### Tarea 9 · Design system y documentación

- [x] `design/components/BottomNavigation` (pestañas nuevas y variante de dos), `design/components/TopNavigation` (selector de equipo), `design/components/Timer` o la que recoja el directo si su vista previa difiere de lo implementado.
- [x] `docs/superpowers/plans/2026-10-03-00-contratos-entre-fases.md`: sección «Uso diario — produce» (firmas de arriba, C3 con `/agenda`, tipos de Inicio).
- [x] `docs/superpowers/backlog.md`: «Lo que deja el uso diario» y las decisiones a confirmar; quitar lo que esta pieza resuelve (Inicio de dirección, «Pista sin diagrama» no, eso es de la pieza 3).
- [x] Commit.

### Tarea 10 · E2E y cierre

- [x] Ajustar los specs existentes a los nombres nuevos (`home`, `train`, `games`, `team`, `drills-library`, `practice-*`, `live`, `tenancy`).
- [x] Specs nuevos: `e2e/navigation.spec.ts` (pestañas del entrenador y destino; Identidad desde Inicio y desde el menú), `e2e/agenda.spec.ts` (grupos, chips, anteriores), `e2e/team-scope.spec.ts` (dirección cambia de equipo y lo ven Inicio, Agenda, Sesiones y Equipo; en `admin`), y en `e2e/live.spec.ts`: iniciar → siguiente → salir → «Continuar · Ejercicio 2 de N» en Inicio y en la ficha → continúa en el 2; «Empezar de nuevo»; terminar → ficha con minutos reales; `/live` de la hecha redirige.
- [x] Suite entera desde base vacía: `supabase db reset`, `pnpm seed` (dos veces), `pnpm db:types` sin deriva, `supabase db lint`, `lint`, `typecheck`, `check:guards`, `TZ=UTC pnpm test`, `test:db`, `test:int`, `test:e2e`.
- [x] Repaso en el navegador a 375×812 con los usuarios del seed (guion de Playwright de usar y tirar): consola sin errores, sin scroll horizontal, áreas táctiles de 44 px.
- [x] Revisión de toda la rama con un revisor nuevo; una tanda de arreglos.
