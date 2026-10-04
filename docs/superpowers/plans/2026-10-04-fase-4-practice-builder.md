# CLUB OS · Fase 4 (Practice Builder) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un entrenador crea la sesión de su equipo, la monta con ejercicios y bloques libres que ordena y cronometra, la duplica para la semana siguiente y la abre desde Inicio; solo el cuerpo técnico del equipo y dirección pueden tocarla.

**Architecture:** Escritura con RLS por equipo (`private.can_manage_team`) y cuatro funciones SQL `security invoker` para lo que toca varias tablas (crear, editar datos, reemplazar ítems con copia obsoleta, duplicar). El esquema ata el plan al equipo y al tipo de su evento. La lista y el detalle se leen en Server Components; el constructor es un componente de cliente con dnd-kit y botones subir/bajar que guarda con una Server Action y `expectedUpdatedAt`.

**Tech Stack:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, `@dnd-kit/utilities`, `@radix-ui/react-alert-dialog` (nuevos) + lo de las Fases 1–3.

**Spec:** `docs/spec/club-os-primera-entrega.md` + `docs/superpowers/plans/2026-10-03-00-contratos-entre-fases.md` + bloques «Fase 4» de `docs/superpowers/backlog.md`

**Requiere:** Fases 1 y 2 terminadas. Fase 3: su base de datos (sus Tasks 1–3, ya fusionadas en esta rama) para las Tasks 1–14; hasta su Task 13 (módulo `drills`, `BottomSheet`, `DrillCard`, `Search`, ficha y seed de ejercicios) para la Task 15. Al cerrar cada tarea, `git log HEAD..claude/fase-3-fccf45` y fusionar lo nuevo en ese límite, nunca a mitad.

**Dentro de esta fase:** integridad y escritura de `events`, `practice_plans` y `practice_items`; módulo `practice`; pestaña Entrenar (Próximas · Histórico), nueva sesión, detalle, constructor, duplicar y cancelar; «Añadir a sesión» desde la ficha de ejercicio; pendientes del backlog asignados a la Fase 4. **Fuera:** plantillas (planes sin equipo: sin interfaz ni escritura de usuario), Live Practice e «Iniciar entrenamiento» (Fase 5), partidos (Fase 6), restaurar una sesión cancelada, borrado físico, repetición semanal automática.

## Global Constraints

- TypeScript `strict: true`, sin `any` explícito. `SUPABASE_SERVICE_ROLE_KEY` solo en `scripts/` y `e2e/`.
- Toda tabla de club: `organization_id not null`, RLS, FKs compuestas, `revoke all … from anon`; políticas con `(select auth.uid())`. `update` de `authenticated` concedido columna a columna: nunca `organization_id`, `id`, `team_id`, `kind`, `created_by`.
- `src/` no contiene `Arcángel`, `Arcangel`, `c9a45c`, `Club Demo` ni `3fb8af`; sus tests usan `club-a` y `clubContext()` de `src/modules/tenancy/test-support.ts`.
- Ningún hex en componentes; medidas según la convención de la Task 1. Copy en español, tuteo, sin exclamaciones ni emoji. Formatos: «Martes 6 oct», «18:00–19:15», «75 min» en texto y «15'» en el constructor. Viewport 375×812; áreas táctiles ≥ 44 px.
- Migraciones `20261117000100_practice_integrity.sql`, `…000200_practice_write.sql`, `…000300_practice_functions.sql`. Funciones de RLS en `private` (`language sql stable security definer set search_path = ''`, `execute` solo a `authenticated`); funciones de escritura en `public` (`plpgsql security invoker set search_path = ''`, argumentos opcionales al final con `default null`, `revoke all … from public, anon, service_role`).
- Errores de BD (C1): `NOT_FOUND` `P0002`; `STALE_COPY` y `SESSION_CLOSED` `P0001`; `INVALID` `22023`; los checks (`23514`) pasan tal cual. Único traductor: `fromDbError`.
- Server Actions `(clubSlug: string, input)`: Zod → `requireClub` → `can(ctx, 'practice.manage')` (si no, `NOT_FOUND` sin tocar la BD) → escritura → `revalidatePath('/c/[club]/(app)', 'layout')` → `ActionResult<T>`.
- `expectedUpdatedAt` es el string de `practice_plans.updated_at` tal cual sale de la BD; nunca pasa por `Date`.
- Horas: `timestamptz` en BD; fecha y hora de formulario se interpretan y se muestran en `ctx.org.timezone`, nunca en la zona del dispositivo.
- Las consultas filtran siempre por `organization_id = ctx.org.id` y por los equipos gestionables, aunque RLS ya lo limite.
- Una sesión se edita mientras su evento está `scheduled`; `done` y `cancelled` son de solo lectura (se pueden duplicar). Nada se borra: cancelar es `status = 'cancelled'`.
- Un ítem guarda siempre su título en `title_override` (copia del título del ejercicio al añadirlo); la duración total se calcula, no se guarda.
- Cada página bajo `/c/[club]` llama a `requireClub`; sin permiso, `notFound()` (el 404 opaco).
- E2E que escriben: proyecto `admin`, sesiones propias `E2E … {Date.now()}`; no afirman recuentos totales. Entorno de este worktree: Supabase `clubos-f4` (puertos 583xx), `PORT=3400 pnpm test:e2e`.

## Review Focus

1. Nora (otro equipo) o Marta (otro club) abren, editan o guardan por URL o por la API una sesión de Alevín A: 404 opaco, `42501` o 0 filas; y un plan no puede colgarse del evento de otro equipo ni de un partido. → Tasks 3, 4, 5 (pgTAP) y 13 (e2e).
2. Álex e Irene, del mismo equipo, guardan la misma sesión a la vez: el segundo recibe `STALE_COPY`, queda lo del primero y «Recargar» lo enseña. → Tasks 5 (pgTAP), 10 (unidad) y 14 (e2e).
3. El móvil del entrenador está en otra zona horaria, o la sesión se duplica a través de un cambio de hora: las 18:00 son siempre las 18:00 del club. → Tasks 2 (unidad) y 13 (e2e con `timezoneId`).
4. Arrastrar con el dedo falla o no se puede: «Subir» y «Bajar» y el teclado reordenan igual; los minutos no salen de 1–120 y el total se recalcula al momento. → Tasks 8 (unidad), 11 (componente) y 14 (componente y e2e).
5. Guardar falla o se sale con cambios sin guardar: lo escrito sigue en pantalla, salir pregunta antes, y una sesión hecha o cancelada no se edita ni por la API (`SESSION_CLOSED`). → Tasks 5 (pgTAP) y 14 (componente y e2e).

---

## Estructura de ficheros

```
design/README.md, scripts/tokens-to-css.ts, scripts/check-guards.sh   convención de medidas, generador estricto, guards
supabase/migrations/2026111700{0100_practice_integrity,0200_practice_write,0300_practice_functions}.sql
supabase/tests/database/{practice_integrity,practice_write,practice_functions,posture}.test.sql
scripts/seed/data.ts, e2e/helpers/seed.ts, e2e/helpers/sessions.ts    sesión cancelada, restauración, sesión de Irene
src/lib/time.ts, mutate.ts, use-action.ts, action-result.ts, permissions.ts
src/modules/practice/types, limits, items, format, map-rows, queries, schema, actions (.ts + tests), practice-list.tsx
src/modules/home/build-home.ts, home-screen.tsx                        fin de semana, enlaces a la sesión
src/ui/card, list-row, cta-button, form-field, practice-card           ajustes
src/ui/confirm-dialog, leave-guard, practice-item, practice-summary    nuevos
src/app/c/[club]/(app)/train/page, loading, error; new/page; [eventId]/page, loading; [eventId]/edit/page
src/app/c/[club]/(app)/train/_components/practice-form, practice-actions, practice-editor, practice-builder, drill-picker
src/app/c/[club]/(app)/drills/[drillId]/add-to-practice.tsx            (Task 15)
e2e/train.spec.ts (mobile), e2e/practice-session.spec.ts, e2e/practice-builder.spec.ts, e2e/practice-drills.spec.ts (admin)
```

---

### Task 1: Deuda de diseño: tokens estrictos, guards de hex y medidas, `ListRow` como lista

**Files:**
- Modify: `scripts/tokens-to-css.ts` (+ test), `scripts/check-guards.sh` (+ `scripts/check-guards.test.ts`), `design/README.md`, `src/ui/card.tsx`, `src/ui/list-row.tsx` (+ tests), los cuatro componentes con medidas fuera de convención, y cada uso de `ListRow`

**Interfaces:**
- Produces: `validateTokens(input: unknown): DesignTokens` (exportada; `main` la llama antes de `tokensToCss`); `Card` acepta `as?: 'div' | 'ul'` (con `'ul'` añade `role="list"`); `ListRow` pinta `<li>` con el enlace dentro.

Convención de medidas (va a `design/README.md`, «Espaciado y layout»): (1) si la medida es un token, se usa el token; (2) si no, la escala de Tailwind, que es la rejilla de 4 px (`size-10`, `w-11`, `min-h-55`, `h-4.5`, `w-7/10`), copiando la medida de `design/components/bundle.css`; (3) valores entre corchetes con unidad solo en tipografía (`text-[…]`, `leading-[…]`, `tracking-[…]`) cuando `bundle.css` fija una medida sin estilo de texto; (4) `calc()` y `env()` sobre tokens, sin restricción.

Reglas:
- `validateTokens` lanza `Error` nombrando la ruta si falta una familia (`color.themes` no vacío, `color.tokens`, `type.groups`, `spacing.tokens`, `radius.tokens`, `size.tokens`, `shadow.tokens`), si un token no tiene `name` o `value`, o si un nombre se repite en su familia. `tokensToCss` lanza `El token «a» apunta a «{x}», que no existe` con un alias desconocido.
- `check-guards.sh` falla con un color hex (`#` + 3, 4, 6 u 8 dígitos hex) en `src/**/*.tsx` que no sea test, y con una clase `-[<número>(px|rem|em|%)]` cuyo prefijo no sea `text`, `leading` o `tracking`.
- Las cuatro medidas actuales pasan a la escala: `min-h-[220px]` → `min-h-55`, `max-w-[280px]` → `max-w-70`, `h-[18px]` → `h-4.5`, `w-[70%]` → `w-7/10`.
- `ListRow`: el separador y `first:border-t-0` pasan al `<li>`. Su comentario dice que va como hija directa de `<Card variant="flush" as="ul">`.

- [ ] **Step 1: Tests que fallan**
  - `tokens-to-css.test.ts`: `alias desconocido` (`{ name: 'a', value: '{nope}' }` → lanza con «{nope}»); `sin spacing.tokens` → lanza con «spacing.tokens»; `nombre repetido` → lanza con el nombre; `el tokens.json real valida`.
  - `check-guards.test.ts` (mismo mecanismo que sus casos actuales): un `.tsx` con `text-[#ff0000]` → exit 1; con `min-h-[220px]` → exit 1; con `text-[24px]` y `tracking-[0.04em]` → exit 0; un `.test.tsx` con hex → exit 0.
  - `list-row.test.tsx`: la fila es un `listitem` con un `link` dentro; `card.test.tsx`: con `as="ul"` es una `list`.
- [ ] **Step 2:** `pnpm test scripts src/ui` → FAIL.
- [ ] **Step 3:** Implementar; pasar a `as="ul"` cada `Card flush` con `ListRow` (`grep -rn "ListRow" src`).
- [ ] **Step 4:** `pnpm test && pnpm check:guards && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `chore(design): tokens estrictos, guards de hex y medidas, y ListRow como lista`

---

### Task 2: Fechas de formulario y cambio de hora

**Files:**
- Modify: `src/lib/time.ts`, `src/lib/time.test.ts`, `src/modules/home/build-home.ts`, `src/modules/home/build-home.test.ts`

**Interfaces:**
- Produces (C6):
  - `zonedDateTimeToIso(date: string, time: string, tz: string): string` (`date` `YYYY-MM-DD`, `time` `HH:mm`; devuelve ISO en UTC)
  - `isoToLocalInputs(iso: string, tz: string): { date: string; time: string }`
  - `nextWeeklySlot(startIso: string, nowIso: string, tz: string): string`

Reglas:
- `zonedDateTimeToIso`: formato inválido o día que no existe (`2026-02-30`) → `RangeError('Fecha u hora no válidas')`. Una hora que no existe por el cambio de hora se adelanta lo que dura el hueco (02:30 → 03:30, como hace `Date`); una hora repetida, a su primera ocurrencia.
- `nextWeeklySlot`: el primer instante con el mismo día de la semana y la misma hora de reloj que `startIso`, estrictamente posterior a `max(nowIso, startIso)`; suma semanas de calendario (`addLocalDays(…, 7, tz)`), no múltiplos de 168 h.
- `inZone` rechaza con el mismo `RangeError` de hoy un ISO sin `Z` ni desfase `±hh:mm`.
- `buildHome`: fin de «Esta semana» = `startOfLocalDay(addLocalDays(nowIso, 7, tz), tz)`.

- [ ] **Step 1: Tests que fallan**
  - `zonedDateTimeToIso('2026-11-17', '18:00', 'Europe/Madrid') === '2026-11-17T17:00:00.000Z'`; `('2026-07-07', '18:00', 'Europe/Madrid') === '2026-07-07T16:00:00.000Z'`; `('2026-03-29', '02:30', 'Europe/Madrid') === '2026-03-29T01:30:00.000Z'` (hueco: 03:30 locales); `('2026-02-30', '18:00', …)`, `('2026-11-17', '25:00', …)` y `('17/11/2026', '18:00', …)` lanzan `RangeError`.
  - `isoToLocalInputs('2026-11-17T17:00:00.000Z', 'Europe/Madrid')` → `{ date: '2026-11-17', time: '18:00' }`; ida y vuelta con `America/Mexico_City`.
  - `nextWeeklySlot` (Review Focus 3): inicio martes `2026-10-20T16:00:00.000Z` (18:00 CEST), ahora `2026-10-21T08:00:00.000Z` → `'2026-10-27T17:00:00.000Z'` (18:00 CET tras el cambio del 25 oct); inicio futuro respecto a ahora → una semana después del inicio; inicio de hace tres semanas → el primero posterior a ahora.
  - `inZone`: `formatEventSlot('2026-11-17T18:00:00', …)` lanza `RangeError`.
  - `build-home.test.ts`: en `America/Santiago`, con `now` en el día del cambio de hora (`2026-09-06T15:00:00.000Z`), un entrenamiento a las 00:30 locales del día 7 siguiente no entra en `week`.
- [ ] **Step 2:** `pnpm test src/lib/time.test.ts src/modules/home` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(time): fechas de formulario en la zona del club y semana a prueba de cambio de hora`

---

### Task 3: Integridad del plan y una sola regla de cuerpo técnico

**Files:**
- Create: `supabase/migrations/20261117000100_practice_integrity.sql`, `supabase/tests/database/practice_integrity.test.sql`
- Modify: `supabase/tests/database/calendar.test.sql` (solo las aserciones que cambian con la regla nueva de visibilidad)

**Interfaces:**
- Consumes: `private.is_member`, `private.has_org_role`, `private.is_team_staff`, `tests.*` (Fase 1); `private.set_updated_at()` (Fase 3).
- Produces:
  - `private.can_manage_team(team uuid) returns boolean`: admin del club del equipo o `is_team_staff(team)`.
  - `private.can_see_plan(plan)` reescrita: admin del club; o plan sin equipo, creado por el usuario y este miembro activo; o plan con equipo e `is_team_staff(team_id)`. **Decisión:** quien creó un plan de equipo y deja su cuerpo técnico deja de verlo.
  - `private.can_see_person(person)` reescrita sobre `is_team_staff` (mismo resultado: `structure.test.sql` sigue en verde sin tocarlo).
  - `events`: `unique (organization_id, team_id, kind, id)`; `check (location is null or char_length(location) <= 80)`.
  - `practice_plans`: `updated_at timestamptz not null default now()` con trigger `practice_plans_set_updated_at` (`before update`, `private.set_updated_at()`); `updated_by uuid default auth.uid() references auth.users (id) on delete set null`; `created_by` pasa a `on delete set null`; `event_kind public.event_kind not null default 'practice' check (event_kind = 'practice')`; la FK `(organization_id, event_id) → events` se sustituye por `practice_plans_event_fkey (organization_id, team_id, event_kind, event_id) → events (organization_id, team_id, kind, id)`; `check (event_id is null or team_id is not null)`; `check (char_length(title) between 1 and 80)`; `check (notes is null or char_length(notes) <= 2000)`; `check (secondary_focus_id is null or secondary_focus_id <> primary_focus_id)`.
  - `practice_items`: `check (title_override is null or char_length(title_override) between 1 and 80)`, `check (phase is null or char_length(phase) <= 40)`, `check (notes is null or char_length(notes) <= 500)`, `check (drill_id is not null or title_override is not null)`.

- [ ] **Step 1: Test que falla** `practice_integrity.test.sql`. Fixtures como `calendar.test.sql`: club A con `adminA`, `c1` (T1), `c2` (T2) y `jugador`; club B con `adminB` y `coachB` (TB); en T1 un entreno y un partido, en T2 un entreno.
  - `can_manage_team`: adminA → T1 y T2; c1 → T1 sí, T2 no; coachB y adminB → T1 no; c1 con la membresía revocada → no; `anon` → `42501`.
  - `un plan no ocupa el evento de otro equipo` (Review Focus 1): plan de T2 sobre el entreno de T1 → `23503`.
  - `un plan no cuelga de un partido`: plan de T1 sobre el partido de T1 → `23503`; `event_kind = 'game'` → `23514`.
  - `plan con evento exige equipo`: `team_id` null y `event_id` del entreno → `23514`.
  - `el autor que deja el equipo deja de ver el plan`: c1 crea «Plan de c1» en T1; tras borrar su fila de `team_staff`, c1 ve 0 planes de T1 y sigue viendo su plantilla privada; adminA ve los dos.
  - `borrar al autor no falla`: `delete from auth.users` del autor → `lives_ok` y el plan queda con `created_by` null.
  - `checks` → `23514`: título `''` y de 81 caracteres; ítem sin `drill_id` ni `title_override`; `title_override` de 81; secundario igual al principal.
  - `updated_at avanza` tras un `update` del título dentro de la transacción.
- [ ] **Step 2:** `pnpm supabase db reset && pnpm test:db` → FAIL.
- [ ] **Step 3:** Escribir la migración (orden: funciones, únicos, columnas, FK, checks, trigger). Ajustar en `calendar.test.sql` solo lo que la decisión de visibilidad cambia.
- [ ] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS (todos los ficheros). `pnpm db:types`.
- [ ] **Step 5: Commit** `feat(db): el plan va atado al equipo y al tipo de su evento, y una sola regla de cuerpo técnico`

---

### Task 4: Escritura con RLS y test de postura

**Files:**
- Create: `supabase/migrations/20261117000200_practice_write.sql`, `supabase/tests/database/practice_write.test.sql`, `supabase/tests/database/posture.test.sql`

**Interfaces:**
- Consumes: Task 3.
- Produces: `private.can_edit_plan(plan uuid) returns boolean` (el plan tiene equipo, `can_manage_team(team_id)` y su evento, si lo tiene, está `scheduled`); privilegios y políticas de abajo.

Privilegios de `authenticated` (además del `select` actual):
- `events`: `insert (organization_id, team_id, kind, starts_at, ends_at, location)`, `update (starts_at, ends_at, location, status)`.
- `practice_plans`: `insert (organization_id, team_id, event_id, title, primary_focus_id, secondary_focus_id, notes)`, `update (title, primary_focus_id, secondary_focus_id, notes, status)`. `updated_by` no se concede: lo fija el trigger `practice_plans_set_updated_by` (`private.set_updated_by()`, `before update`, solo en sentencias directas) con el usuario de la sesión.
- `practice_items`: `insert (organization_id, plan_id, sort, phase, drill_id, title_override, minutes, notes)`, `update (sort, phase, drill_id, title_override, minutes, notes)`, `delete`.

Políticas (`to authenticated`):
- `events_insert_practice_managed`: `with check (kind = 'practice' and status = 'scheduled' and private.can_manage_team(team_id))`.
- `events_update_practice_managed`: `using (kind = 'practice' and status = 'scheduled' and private.can_manage_team(team_id)) with check (kind = 'practice' and private.can_manage_team(team_id))`.
- `practice_plans_insert_managed`: `with check (team_id is not null and private.can_manage_team(team_id))`; `practice_plans_update_editable`: `using (private.can_edit_plan(id)) with check (team_id is not null and private.can_manage_team(team_id))`.
- `practice_items_{insert,update,delete}_editable`: `private.can_edit_plan(plan_id)` (en `update`, `using` y `with check`).

- [ ] **Step 1: Tests que fallan**
  - `practice_write.test.sql` (fixtures de la Task 3 más `c1b`, ayudante de T1, y en T1 un entreno `done` y otro `cancelled` con plan e ítems):
    - `c1 crea y edita en su equipo`: insert de evento `practice` en T1, de su plan y de un ítem → `lives_ok`; `created_by` del plan = c1; c1b actualiza el ítem → 1 fila.
    - `c2 no escribe en T1` (Review Focus 1): insert de evento, de plan y de ítem → `42501`; update del evento, del plan y del ítem, y delete del ítem → 0 filas.
    - `coachB y adminB no escriben en A`: los mismos casos → `42501` y 0 filas; evento con `organization_id` de A y equipo TB → `23503`.
    - `adminA gestiona T1 y T2`; `jugador` no escribe (`42501`).
    - `nadie toca partidos` (C11): c1 inserta `kind = 'game'` → `42501`; update del partido de T1 → 0 filas.
    - `sesión cerrada` (Review Focus 5): sobre el entreno `done` y el `cancelled`, update del evento y del plan → 0 filas; insert de ítem → `42501`; update y delete de ítem → 0 filas.
    - `ni club ni equipo ni autor`: `update events set team_id`, `update practice_plans set organization_id` y `set created_by` → `42501`.
    - `nadie borra`: `delete` de evento y de plan → `42501`; `anon` → `42501` en las tres tablas.
  - `posture.test.sql`: toda tabla de `public` tiene RLS activado; `anon` no tiene ningún privilegio de tabla ni de columna en `public`, ni `execute` en ninguna función de `public` ni de `private`; los privilegios de tabla y de columna de `authenticated` en `public` son exactamente una lista escrita en el test (`set_eq` contra `information_schema.table_privileges` y `column_privileges`), que incluye las tablas de las Fases 1–3 fusionadas.
- [ ] **Step 2:** `pnpm supabase db reset && pnpm test:db` → FAIL.
- [ ] **Step 3:** Escribir la migración. Si `posture.test.sql` destapa un privilegio de más en una tabla anterior, se corrige en esta migración.
- [ ] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS. `pnpm db:types`.
- [ ] **Step 5: Commit** `feat(db): el cuerpo técnico escribe las sesiones de su equipo, y test de postura de todas las tablas`

---

### Task 5: Funciones de sesión

**Files:**
- Create: `supabase/migrations/20261117000300_practice_functions.sql`, `supabase/tests/database/practice_functions.test.sql`

**Interfaces:**
- Consumes: Tasks 3 y 4.
- Produces:
  - `public.create_practice_session(p_team uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_title text, p_primary_focus uuid default null, p_secondary_focus uuid default null, p_location text default null) returns uuid` (id del evento)
  - `public.update_practice_session(p_event uuid, p_expected_updated_at timestamptz, p_starts_at timestamptz, p_ends_at timestamptz, p_title text, p_primary_focus uuid default null, p_secondary_focus uuid default null, p_location text default null, p_notes text default null) returns timestamptz`
  - `public.save_practice_items(p_plan uuid, p_expected_updated_at timestamptz, p_items jsonb) returns timestamptz`
  - `public.duplicate_practice(p_event uuid, p_starts_at timestamptz) returns uuid` (id del evento nuevo)
  - Claves de cada elemento de `p_items`: `id` (opcional), `drill_id`, `title`, `phase`, `minutes`, `notes`.

Reglas, en este orden en cada función:
1. El equipo (o el evento `practice`, o el plan) no existe o `not private.can_manage_team(team)` → `NOT_FOUND`. Quien no puede escribir nunca recibe `STALE_COPY` ni `SESSION_CLOSED`.
2. (`update_practice_session`, `save_practice_items`) evento no `scheduled` → `SESSION_CLOSED`.
3. (las mismas) `select … for update` del evento y del plan (el del evento evita que un cierre simultáneo se cuele entre la comprobación y la escritura); `updated_at <> p_expected_updated_at` → `STALE_COPY`.
4. Entrada: `p_items` null, que no sea un array o con más de 30 elementos → `INVALID`; un `id` que no es un ítem de ese plan → `INVALID`; `p_starts_at` null en `duplicate_practice` → `INVALID`.

Efectos:
- `create_practice_session`: evento `practice` `scheduled` del club del equipo y su plan (`status 'draft'`, `created_by` del usuario). El plan se inserta sin `returning` (la política de lectura busca la fila por id antes de que exista y daría `42501`) y se lee por `event_id`.
- `update_practice_session`: horas y lugar del evento; título, focos y notas del plan; devuelve el `updated_at` nuevo. Ninguna función nombra `updated_by` (no tiene el privilegio): lo sella el trigger en cada `update` del plan.
- `save_practice_items`: borra los ítems del plan cuyo `id` no llega, actualiza los que llegan con `id` (conservan `completed` y `actual_minutes`) e inserta los que no lo traen; `sort` = posición desde 1; `title_override = title`; plan `status = 'ready'` con algún ítem y `'draft'` sin ninguno, con un `update` del plan que se hace siempre (es el que mueve `updated_at` y sella `updated_by`); devuelve el `updated_at` nuevo.
- `duplicate_practice`: vale cualquier estado del origen. Evento nuevo `scheduled` del mismo equipo, con el mismo lugar y la misma duración desde `p_starts_at`; plan con título, focos y notas; ítems copiados en orden sin `completed` ni `actual_minutes`; `status` como en `save_practice_items`.

- [ ] **Step 1: Test que falla** `practice_functions.test.sql` (fixtures de la Task 4):
  - `c1 crea una sesión`: evento `practice` `scheduled` de T1; plan con el título, T1, `created_by` c1, `draft`. `c2` y `coachB` sobre T1 → `P0002`; `p_ends_at <= p_starts_at` y título vacío → `23514`; foco del club B → `23503`.
  - `guardar ordena y reemplaza`: tres ítems → `sort` 1, 2, 3, plan `ready` y `updated_at` mayor; con sus ids en orden inverso → mismos ids, `sort` invertido; sin el segundo → queda borrado; uno sin `id` → insertado al final.
  - `conserva lo registrado`: un ítem con `completed = true` que sigue en la lista lo mantiene.
  - `copia obsoleta` (Review Focus 2): dos llamadas con el mismo `p_expected_updated_at` → la segunda `throws_ok(…, 'P0001', 'STALE_COPY')` y quedan los ítems de la primera.
  - `sesión cerrada` (Review Focus 5): sobre el entreno `done` y el `cancelled`, `save_practice_items` y `update_practice_session` → `throws_ok(…, 'P0001', 'SESSION_CLOSED')`.
  - `entrada inválida` → `22023`: `p_items` null, `'{}'`, 31 elementos, `id` de un ítem de otro plan; `minutes` 0 y 121 → `23514`. Lista vacía → 0 ítems y plan `draft`.
  - `quien no gestiona no sabe nada`: c2 y coachB con un `p_expected_updated_at` viejo → `P0002`, no `P0001`.
  - `editar datos`: cambia horas, lugar, título, focos y notas y devuelve un `updated_at` mayor; con la copia vieja → `STALE_COPY`.
  - `duplicar`: evento nuevo de T1 con la misma duración y lugar; mismo título y focos; ítems en el mismo orden y `completed` null; el origen no cambia; desde el `done` y el `cancelled` también; c2 → `P0002`; sobre el partido → `P0002`.
  - `anon` → `42501` en las cuatro.
- [ ] **Step 2:** `pnpm test:db` → FAIL.
- [ ] **Step 3:** Escribir las funciones con sus `grant`/`revoke`.
- [ ] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS; `pnpm supabase db lint` sin errores. `pnpm db:types`.
- [ ] **Step 5: Commit** `feat(db): crear, editar, guardar y duplicar una sesión con copia obsoleta`

---

### Task 6: Seed: una sesión cancelada y restauración de sesiones

**Files:**
- Modify: `scripts/seed/data.ts`, `scripts/seed/data.test.ts`, `scripts/seed/seed.int.test.ts`, `e2e/helpers/seed.ts`, `scripts/seed/restore-seed.test.ts`, `e2e/helpers/sessions.ts`

**Interfaces:**
- Consumes: `seedId`, `runSeed`, `ARCANGEL` (Fase 1).
- Produces: `SessionDef.status: 'scheduled' | 'done' | 'cancelled'` (sustituye a `done`); `restoreSeed` limpia también `practice_items`, `practice_plans` y los `events` de `kind = 'practice'` que no son del seed; `SESSION_USERS` incluye `irene@arcangel.test`.

Datos: Alevín A gana la sesión `cancelled-0` «Tiro libre y finalizaciones» (foco `tiro`, sin secundario, «Pabellón 2», el mismo día que `upcoming[1]` de 16:30 a 17:30, evento `cancelled`, plan `ready`, ítems «Rueda de tiros libres» (Tiro, 20) y «Finalizaciones 1x0» (Técnica, 25)). Recuentos (C7): `events` de Alevín A 7 → 8.

- [ ] **Step 1: Tests que fallan**
  - `seed.int.test.ts`: Alevín A tiene 8 eventos, uno `cancelled`; el plan de ese evento tiene 2 ítems.
  - `data.test.ts`: la sesión cancelada cae el día de `upcoming[1]` a las 16:30 locales.
  - `restore-seed.test.ts`: con una sesión creada a mano en un club del seed (evento, plan, ítem), `restoreSeed` la borra y deja las del seed; un evento `game` ajeno al seed no se toca.
- [ ] **Step 2:** `pnpm test scripts && pnpm test:int` → FAIL.
- [ ] **Step 3:** Implementar (orden de borrado: ítems, planes, eventos).
- [ ] **Step 4:** `pnpm seed && pnpm seed && pnpm test scripts && pnpm test:int && pnpm check:guards` → PASS; `PORT=3400 pnpm test:e2e e2e/home.spec.ts` → PASS (la cancelada no sale en Inicio).
- [ ] **Step 5: Commit** `feat(seed): una sesión cancelada en Alevín A y restauración de las sesiones de los e2e`

---

### Task 7: Base de escrituras compartida

**Files:**
- Create: `src/lib/mutate.ts`, `src/lib/mutate.test.ts`
- Move: `src/app/c/[club]/admin/_components/use-action.ts` y su test → `src/lib/use-action.ts`, `src/lib/use-action.test.tsx`
- Modify: `src/modules/methodology/actions.ts`, `src/lib/action-result.ts`, `src/lib/permissions.ts` (+ tests), los imports de `useAction`

**Interfaces:**
- Produces:
  - `type Write<D> = { db: SupabaseClient<Database>; ctx: ClubContext; data: D; fromDb: (error: DbError, unique?: UniqueField) => ActionResult<never>; retryOnConflict: <T>(attempt: () => Promise<Attempt<T>>) => Promise<ActionResult<T>> }`, con `DbError`, `UniqueField`, `Attempt<T>` y `UNIQUE_VIOLATION` exportados.
  - `type MutateConfig = { tag: string; permission: Action; routes: readonly string[] }` y `mutate<D, T>(config: MutateConfig, clubSlug: string, schema: z.ZodType<D>, input: unknown, write: (run: Write<D>) => Promise<ActionResult<T>>): Promise<ActionResult<T>>` (la forma de la Fase 3, que extrajo lo mismo en paralelo; al fusionarla sustituyó al `createMutate` con que se implementó esta tarea)
  - `ActionError` añade `'SESSION_CLOSED'`: «Esta sesión ya está cerrada y no se puede cambiar. Duplícala para reutilizarla.»
  - `Action` añade `'practice.manage'` (`admin` y `coach`).

Reglas: `mutate` es el de `methodology/actions.ts` movido tal cual, con la etiqueta de log, el permiso y las rutas a revalidar (`revalidatePath(ruta, 'layout')`) en `config`. Cada módulo lo envuelve en un `mutate(name, …)` local con lo suyo, como `methodology/actions.ts` (`{ tag: 'methodology.<name>', permission: 'way.manage', routes: [WAY_ROUTE, ADMIN_ROUTE] }`); su test no cambia.

- [ ] **Step 1: Tests que fallan**
  - `mutate.test.ts` (mocks de `createClient`, `requireClub`, `revalidatePath`): entrada inválida → `INVALID` sin pedir el club; sin permiso → `NOT_FOUND` sin crear cliente; `write` que lanza → `SAVE_FAILED` y `logError('modulo.nombre', …)`; `notFound()` dentro de `write` se relanza; con `ok` revalida cada ruta con `'layout'` y con fallo ninguna; `retryOnConflict` repite hasta 3 veces y entonces `SAVE_FAILED`.
  - `permissions.test.ts`: `practice.manage` → admin y coach `true`, player y guardian `false`. `action-result.test.ts`: `{ code: 'P0001', message: 'SESSION_CLOSED' }` → `SESSION_CLOSED`.
- [ ] **Step 2:** `pnpm test src/lib` → FAIL.
- [ ] **Step 3:** Implementar (`git mv` para `use-action`).
- [ ] **Step 4:** `pnpm test && pnpm typecheck && pnpm lint` → PASS.
- [ ] **Step 5: Commit** `refactor(lib): mutate y useAction compartidos, y el permiso de gestionar sesiones`

---

### Task 8: Módulo `practice`: tipos, límites y funciones puras

**Files:**
- Create: `src/modules/practice/types.ts`, `limits.ts`, `items.ts`, `format.ts`, `items.test.ts`, `format.test.ts`
- Modify: `src/ui/practice-card.tsx` (usa `itemsLabel`)

**Interfaces:**
- Consumes: `Standard`, `formatStandardNumber` (Fase 2).
- Produces:
  ```ts
  export type PracticeStatus = 'scheduled' | 'done' | 'cancelled';
  export type TeamOption = { id: string; name: string };
  export type FocusOption = { id: string; name: string };
  export type PracticeItemDraft = { id?: string; drillId: string | null; title: string; phase: string | null; minutes: number; notes: string | null };
  export type SavedPracticeItem = PracticeItemDraft & { id: string };
  export type PracticeListItem = { eventId: string; teamName: string; dow: string; day: string; time: string; title: string; totalMinutes: number; itemCount: number; status: PracticeStatus; location: string | null };
  export type PracticeDetail = { eventId: string; planId: string; teamId: string; teamName: string; status: PracticeStatus; startsAt: string; endsAt: string; slotLabel: string; location: string | null; title: string; primaryFocus: FocusOption | null; secondaryFocus: FocusOption | null; notes: string | null; items: SavedPracticeItem[]; standards: Standard[]; updatedAt: string; canEdit: boolean };
  export type PhaseBlock<T> = { phase: string | null; startIndex: number; items: T[]; minutes: number };
  ```
  - `limits.ts` (sin Zod): `MAX_ITEMS = 30`, `MIN_MINUTES = 1`, `MAX_MINUTES = 120`, `MINUTES_STEP = 5`, `DEFAULT_ITEM_MINUTES = 10`, `TITLE_MAX = 80`, `PHASE_MAX = 40`, `LOCATION_MAX = 80`, `NOTES_MAX = 2000`, `ITEM_NOTES_MAX = 500`, `MIN_SESSION_MINUTES = 15`, `MAX_SESSION_MINUTES = 240`, `DEFAULT_SESSION_MINUTES = 75`, `DEFAULT_SESSION_TIME = '18:00'`.
  - `items.ts`: `DEFAULT_PHASES` (los ocho del contrato, en su orden); `totalMinutes(items: Array<{ minutes: number }>): number`; `moveItem<T>(items: T[], from: number, to: number): T[]`; `changeMinutes<T extends { minutes: number }>(items: T[], index: number, delta: 5 | -5): T[]`; `phaseBlocks<T extends { phase: string | null; minutes: number }>(items: T[]): PhaseBlock<T>[]`.
  - `format.ts`: `minutesLabel(n: number): string` («75 min»); `builderMinutes(n: number): string` («15'»); `itemsLabel(count: number): string`; `practiceMeta(p: { totalMinutes: number; itemCount: number; location: string | null }): string`; `itemNumber(index: number): string` («01»); `statusLabel(status: PracticeStatus): string | null`.

Reglas: ninguna función muta su entrada. `moveItem` con índices fuera de rango o iguales devuelve una copia sin cambios. `changeMinutes`: al subir, `min(120, floor(m / 5) * 5 + 5)`; al bajar, `max(1, ceil(m / 5) * 5 - 5)`. `phaseBlocks` agrupa ítems consecutivos con la misma fase (null con null).

- [ ] **Step 1: Tests que fallan**
  - `items.test.ts`: `totalMinutes` de 10, 15, 15, 20, 15 → 75 y de `[]` → 0; `moveItem(['a','b','c'], 0, 2)` → `['b','c','a']`, `(…, 2, 0)` → `['c','a','b']`, `(…, 1, 1)` y `(…, 0, 5)` → igual, sin mutar; `changeMinutes` (Review Focus 4): 10 → 15, 12 ↑ 15, 12 ↓ 10, 5 ↓ 1, 1 ↑ 5, 120 ↑ 120, 118 ↑ 120, y solo cambia el índice dado; `phaseBlocks` de fases `Activación, Técnica, Técnica, null, Técnica` → cuatro bloques con `startIndex` 0, 1, 3, 4 y `minutes` sumados.
  - `format.test.ts`: `minutesLabel(75) === '75 min'`; `builderMinutes(15) === "15'"`; `itemsLabel(0) === 'Sin ejercicios todavía'`, `(1) === '1 ejercicio'`, `(5) === '5 ejercicios'`; `practiceMeta({ totalMinutes: 75, itemCount: 5, location: 'Pabellón 2' }) === '75 min · 5 ejercicios · Pabellón 2'` y sin lugar sin el último campo; `itemNumber(0) === '01'`; `statusLabel('done') === 'Hecho'`, `('cancelled') === 'Cancelada'`, `('scheduled') === null`.
- [ ] **Step 2:** `pnpm test src/modules/practice` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(practice): tipos, límites y funciones puras del constructor`

---

### Task 9: Consultas de sesiones

**Files:**
- Create: `src/modules/practice/map-rows.ts`, `queries.ts`, `map-rows.test.ts`, `queries.test.ts`

**Interfaces:**
- Consumes: `createClient`, `ClubContext`, `can`, `formatEventSlot`, `dayChip`, `localTime`; Task 8.
- Produces:
  - `listManageableTeams(ctx: ClubContext): Promise<TeamOption[]>`
  - `getPracticeFormOptions(ctx: ClubContext): Promise<{ teams: TeamOption[]; focusAreas: FocusOption[] }>`
  - `listPractices(ctx: ClubContext, scope: 'upcoming' | 'history', nowIso: string): Promise<{ practices: PracticeListItem[]; teamCount: number }>`
  - `getPractice(ctx: ClubContext, eventId: string): Promise<PracticeDetail | null>`

Reglas:
- `listManageableTeams`: equipos de la temporada actual (`seasons.is_current`), por nombre; admin → todos los del club; el resto → los de `team_staff` de `ctx.membership.personId` (sin persona, `[]`).
- `listPractices`: sin equipos, `{ practices: [], teamCount: 0 }` sin consultar eventos. Filtra por club, `kind = 'practice'` y esos equipos; `upcoming` = `scheduled` con `ends_at > nowIso`, por `starts_at` ascendente; `history` = el resto, descendente; `limit(50)`. Título del plan, o «Entrenamiento sin plan».
- `getPractice`: `null` sin consultar si `eventId` no es uuid; `null` si no hay fila o el evento no tiene plan. Ítems por `sort`; título del ítem = `title_override ?? drills.title ?? 'Ejercicio'`. `standards`: los publicados de los ejercicios de sus ítems (`drills(drill_standards(standards(…)))`), sin repetir, por `number`. `canEdit = can(ctx, 'practice.manage') && status === 'scheduled'`. `updatedAt` tal cual.
- Un error de lectura se registra con `logError` y lanza (como `home/queries.ts`).

- [ ] **Step 1: Tests que fallan** (mock de `createClient` como en `home/queries.test.ts`)
  - `map-rows.test.ts`: una fila con plan, dos focos, tres ítems desordenados y dos ejercicios que comparten un Standard → ítems en orden, `standards` sin repetir y solo publicados, `slotLabel` «Martes 17 nov · 18:00–19:15» en `Europe/Madrid`; ítem con `title_override` null → título del ejercicio; relaciones embebidas como objeto o como lista de uno dan lo mismo.
  - `queries.test.ts`: `getPractice(ctx, 'abc')` → `null` sin llamadas; filtra por `organization_id`, `id` y `kind`; un coach sin persona → `listPractices` vacío sin consultar eventos; `upcoming` pide `status = scheduled` y `ends_at > now` ascendente y `history` descendente con `limit(50)`; un error de Supabase lanza.
- [ ] **Step 2:** `pnpm test src/modules/practice` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(practice): consultas de sesiones por equipo`

---

### Task 10: Acciones de sesiones

**Files:**
- Create: `src/modules/practice/schema.ts`, `actions.ts`, `actions.test.ts`

**Interfaces:**
- Consumes: `mutate`, `MutateConfig`, `Write` de `src/lib/mutate.ts` (Task 7), funciones SQL (Task 5), `zonedDateTimeToIso` (Task 2), `limits.ts` (Task 8).
- Produces (`'use server'`; firma `(clubSlug: string, input)`):
  - `createPractice({ teamId, date, time, durationMinutes, title, primaryFocusId: string | null, secondaryFocusId: string | null, location: string | null })` → `ActionResult<{ eventId: string }>`
  - `updatePracticeMeta({ eventId, expectedUpdatedAt, date, time, durationMinutes, title, primaryFocusId, secondaryFocusId, location, notes: string | null })` → `ActionResult<{ updatedAt: string }>`
  - `savePracticeItems({ eventId, expectedUpdatedAt, items: PracticeItemDraft[] })` → `ActionResult<{ updatedAt: string }>`
  - `duplicatePractice({ eventId, date, time })` → `ActionResult<{ eventId: string }>`
  - `cancelPractice({ eventId })` → `ActionResult<null>`
  - Esquemas `<acción>Schema` y sus tipos de entrada en `schema.ts`.

Reglas:
- Un `mutate(name, clubSlug, schema, input, write)` local, no exportado, que llama al de `src/lib/mutate.ts` con `{ tag: 'practice.<name>', permission: 'practice.manage', routes: ['/c/[club]/(app)'] }` (como el de `methodology/actions.ts`).
- Inicio = `zonedDateTimeToIso(date, time, ctx.org.timezone)`; fin = inicio + `durationMinutes`. Si lanza `RangeError` → `INVALID` con `fieldErrors.date = 'Elige una fecha y una hora válidas.'`.
- Toda acción con `eventId` lee antes el evento `practice` de este club con su plan (`organization_id`, `id`, `kind`); si no está, `NOT_FOUND` sin RPC.
- `savePracticeItems` envía `p_items` como `[{ id?, drill_id, title, phase, minutes, notes }]`, en el orden recibido. Los argumentos opcionales de las funciones se omiten cuando son `null`.
- `cancelPractice`: `update({ status: 'cancelled' })` por club, id, `kind` y `status = 'scheduled'` con `select('id')`; 0 filas → `NOT_FOUND`.
- Mensajes: «Elige un equipo.»; «Escribe un título.»; «Máximo {n} caracteres.»; «Elige una fecha.»; «Elige una hora.»; «La duración tiene que estar entre 15 y 240 minutos.»; «El objetivo secundario tiene que ser distinto del principal.»; «Una sesión tiene como máximo 30 ejercicios.»; por ítem, «Escribe un título.» (`items.N.title`) y «Entre 1 y 120 minutos.» (`items.N.minutes`). `trim`; opcionales vacíos → `null`.

- [ ] **Step 1: Tests que fallan** `actions.test.ts` (`clubContext('coach')`, zona `Europe/Madrid`):
  - `un jugador no gestiona`: rol `player` → `NOT_FOUND` sin llamadas.
  - `crea a la hora del club` (Review Focus 3): `{ date: '2026-11-17', time: '18:00', durationMinutes: 75 }` → `create_practice_session` con `p_starts_at: '2026-11-17T17:00:00.000Z'` y `p_ends_at: '2026-11-17T18:15:00.000Z'`; devuelve `{ eventId }` y revalida `'/c/[club]/(app)'` con `'layout'`.
  - `fecha imposible`: `2026-02-30` → `INVALID` con `fieldErrors.date`; duración 5 → `fieldErrors.durationMinutes`; mismo foco dos veces → `fieldErrors.secondaryFocusId`; título vacío → «Escribe un título.».
  - `guardar ítems`: dos borradores (uno con `id`, otro sin él) → `p_items` con las claves de arriba en ese orden y `p_expected_updated_at === '2026-11-17T10:00:00.123456+00:00'`; `data.updatedAt` = lo que devuelve el RPC.
  - `31 ítems` → `INVALID` sin RPC; ítem con título vacío → `fieldErrors['items.0.title']`; minutos 0 → `fieldErrors['items.0.minutes']`.
  - `copia obsoleta` (Review Focus 2) y `sesión cerrada`: `{ code: 'P0001', message: 'STALE_COPY' }` → `STALE_COPY`; `'SESSION_CLOSED'` → `SESSION_CLOSED`.
  - `sesión de otro club`: la lectura previa no devuelve fila → `NOT_FOUND` sin RPC.
  - `duplicar`: `duplicate_practice` con `p_starts_at` en la zona del club; `cancelar`: filtra por club, id, tipo y estado, y con 0 filas → `NOT_FOUND`.
- [ ] **Step 2:** `pnpm test src/modules/practice` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(practice): acciones de crear, editar, guardar, duplicar y cancelar`

---

### Task 11: Componentes: confirmación, salida con cambios, ítem y resumen de sesión

**Files:**
- Create: `src/ui/confirm-dialog.tsx`, `leave-guard.tsx`, `practice-item.tsx`, `practice-summary.tsx` (+ tests)
- Modify: `src/ui/cta-button.tsx`, `src/ui/icons.tsx`, `src/ui/practice-card.tsx` (+ tests), `src/app/c/[club]/admin/_components/section-editor.tsx` (+ test), `package.json`
- Reference: `design/components/PracticeItem/`, `design/components/PracticeCard/`, `design/components/bundle.css` (`.cos-pi*`)

**Interfaces:**
- Consumes: Task 8; `Card`, `CTAButton`, `StandardBadge`.
- Produces:
  - `ConfirmDialog({ open; onOpenChange; title; body; confirmLabel; cancelLabel; tone?: 'default' | 'danger'; pending?: boolean; onConfirm })` (C4; cliente; `role="alertdialog"`).
  - `useLeaveGuard(dirty: boolean): { guard: (event: MouseEvent<HTMLAnchorElement>) => void; dialog: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }; release: () => void }` y `LeaveGuardDialog(props: ReturnType<typeof useLeaveGuard>['dialog'])`.
  - `PracticeItemView({ index: number; title: string; phase: string | null; minutes: number; href?: string })` (un `<li>`).
  - `PracticeItem({ index; title; phase; minutes; isFirst: boolean; isLast: boolean; expanded: boolean; dragging?: boolean; handle?: ReactNode; onToggle: () => void; onMinutes: (delta: 5 | -5) => void; onMove: (direction: 'up' | 'down') => void; onRemove: () => void; children?: ReactNode })` (cliente).
  - `PracticeTotal({ minutes: number })`.
  - `PracticeSummary({ practice: Pick<PracticeDetail, 'teamName' | 'slotLabel' | 'title' | 'location' | 'status' | 'primaryFocus' | 'secondaryFocus'> & { totalMinutes: number; itemCount: number } })`.
  - `CTAButton` gana la variante `'danger'`; iconos `PlusIcon`, `MinusIcon`, `GripIcon`, `ChevronUpIcon`, `ChevronDownIcon`, `TrashIcon`.

Reglas:
- `ConfirmDialog`: Radix AlertDialog; panel `surface-1`, `radius-xl`, `shadow-sheet`, sobre `scrim`; botones `cancelLabel` (`secondary`) y `confirmLabel` (`primary`, o `danger` con `tone="danger"`); `pending` desactiva los dos; confirmar no cierra solo (cierra quien llama).
- `useLeaveGuard`: con `dirty`, avisa en `beforeunload`; `guard` deja pasar un clic con Ctrl, Cmd, Mayús o botón central y, si no, lo detiene y abre el diálogo; confirmar navega al `href` del enlace con `router.push`; `release` quita el aviso de `beforeunload` (para «Recargar»). `LeaveGuardDialog`: «¿Salir sin guardar?» / «Tienes cambios sin guardar. Si sales, se pierden.» / «Salir sin guardar» / «Seguir editando».
- `PracticeItem` (fila de 72 px de la vista previa): asa (`handle`), número `numeral` en `brand-accent` (`itemNumber`), fase en `label` y título, que forman un botón con `aria-expanded`; «Menos minutos, {título}» y «Más minutos, {título}» (36 px visuales, 44 px de área) con «15'» entre los dos. Abierto, pinta `children` y «Subir {título}», «Bajar {título}» (desactivados en los extremos) y «Quitar {título}». Con `dragging`, `surface-3` y `shadow-sheet`.
- `PracticeSummary`: kicker con el equipo, franja, `h1` con el título, `practiceMeta`, objetivos (lista «Objetivos») y, si no es `scheduled`, su estado con icono («Hecho» en `success`).
- `PracticeCard`: el kicker pasa a «Próximo entrenamiento · {teamName}» (sin equipo, como hoy).
- `SectionEditor`: `window.confirm` → `useLeaveGuard` + `LeaveGuardDialog` en «Volver» y en el enlace «Ir a los valores / principios / Standards»; «Recargar» llama a `release`.

- [ ] **Step 1: Tests que fallan**
  - `confirm-dialog.test.tsx`: abierto, es un `alertdialog` con título y cuerpo; confirmar llama a `onConfirm` y no a `onOpenChange`; cancelar y Escape → `onOpenChange(false)`; con `pending`, los dos desactivados.
  - `leave-guard.test.tsx`: sin cambios, el clic navega; con cambios, se detiene y abre el diálogo; con Ctrl no pregunta; «Salir sin guardar» llama a `router.push` con el `href`.
  - `practice-item.test.tsx` (Review Focus 4): pinta «01», la fase, el título y «15'»; «Más minutos, …» → `onMinutes(5)` y «Menos…» → `onMinutes(-5)`; el título cambia `aria-expanded`; «Subir» desactivado si `isFirst` y «Bajar» si `isLast`; `PracticeItemView` con `href` es un enlace dentro de un `listitem`; `PracticeTotal` → «Total» y «75'».
  - `practice-summary.test.tsx`: equipo, franja, título en `h1`, «75 min · 5 ejercicios · Pabellón 2», dos objetivos; `done` → «Hecho»; `scheduled` → sin estado.
  - `practice-card.test.tsx`: «Próximo entrenamiento · Equipo A». `section-editor.test.tsx`: con cambios, «Volver» abre el diálogo y «Seguir editando» lo cierra sin navegar.
- [ ] **Step 2:** `pnpm test src/ui src/app` → FAIL.
- [ ] **Step 3:** `pnpm add @radix-ui/react-alert-dialog`; implementar.
- [ ] **Step 4:** `pnpm test && pnpm check:guards && pnpm typecheck && PORT=3400 pnpm test:e2e e2e/admin.spec.ts e2e/home.spec.ts` → PASS.
- [ ] **Step 5: Commit** `feat(ui): ConfirmDialog, aviso de cambios sin guardar, PracticeItem y PracticeSummary`

---

### Task 12: Entrenar: Próximas e Histórico, e Inicio enlaza a la sesión

**Files:**
- Create: `src/modules/practice/practice-list.tsx` (+ test), `src/app/c/[club]/(app)/train/loading.tsx`, `error.tsx`, `e2e/train.spec.ts`
- Modify: `src/app/c/[club]/(app)/train/page.tsx`, `src/modules/home/home-screen.tsx` (+ test), `src/app/c/[club]/(app)/page.tsx`, `e2e/home.spec.ts`

**Interfaces:**
- Consumes: Tasks 8, 9 y 11; `ListRow`, `DateChip`, `Card`, `EmptyState`, `CTAButton`.
- Produces: `PracticeList({ clubSlug: string; scope: 'upcoming' | 'history'; practices: PracticeListItem[]; teamCount: number; canCreate: boolean })`; `HomeScreen` gana `canCreatePractice: boolean`.

Pantalla `/train` (la entrada «Biblioteca de ejercicios» que añade la Task 10 de la Fase 3 se conserva debajo al fusionarla):
- `h1` «Entrenar»; con `canCreate` y algún equipo, `primary block` «Nueva sesión» (icono `PlusIcon`) → `/train/new`.
- `<nav aria-label="Sesiones">` con «Próximas» (`/train`) e «Histórico» (`/train?scope=history`); la activa con `aria-current="page"`. `scope` es `history` solo si el parámetro vale exactamente eso.
- `Card flush as="ul"` con un `ListRow` por sesión → `/train/{eventId}`: `DateChip`, título, `practiceMeta` (precedido de «{equipo} · » si `teamCount > 1`) y, a la derecha, la hora o `statusLabel`.
- Vacíos: sin equipos, «Aún no estás en ningún equipo» / «Cuando dirección te asigne un equipo, aquí verás sus sesiones.» / «Volver a Inicio»; próximas, «No hay sesiones programadas» / «Crea la próxima sesión de tu equipo.» / «Nueva sesión» (sin `canCreate`: «Cuando haya una sesión en el calendario, la verás aquí.» / «Ver histórico»); histórico, «Aún no hay sesiones pasadas» / «Las sesiones que termines aparecerán aquí.» / «Ver próximas».
- `loading.tsx` → `LoadingState rows={4}`; `error.tsx` → `ErrorState` «No se pudieron cargar las sesiones» / «Revisa la conexión y vuelve a intentarlo.».
- Inicio: `PracticeCard` y las filas de entrenamiento de «Esta semana» → `/c/{slug}/train/{eventId}`; los partidos siguen en `/games`. Sin próximo entrenamiento y con `canCreatePractice`, el estado vacío ofrece «Nueva sesión» → `/train/new`.

- [ ] **Step 1: Tests que fallan**
  - `practice-list.test.tsx`: dos sesiones → dos `listitem` con su `href`, «75 min · 5 ejercicios · Pabellón 2» y la hora; con `teamCount: 2`, el subtítulo empieza por el equipo; `history` con una `done` → «Hecho»; cada vacío con su texto y su salida; sin `canCreate` no hay «Nueva sesión»; «Histórico» lleva `aria-current` en `history`.
  - `home-screen.test.tsx`: la card enlaza a `/c/club-a/train/{eventId}`; sin entrenamiento y con `canCreatePractice`, enlace «Nueva sesión».
  - `e2e/train.spec.ts` (proyecto `mobile`, solo lee):
    - `Álex ve sus próximas sesiones`: «Transición + rebote defensivo» con «75 min · 5 ejercicios · Pabellón 2» y «Defensa presionante»; no «Bote y control» ni «Tiro libre y finalizaciones».
    - `histórico`: las cuatro hechas con «Hecho», «Tiro libre y finalizaciones» con «Cancelada».
    - `cada uno lo suyo`: Nora ve solo «Bote y control»; Raúl ve las de los dos equipos con «Alevín A · » y «Benjamín A · »; Marta ve «Defensa individual» y nada de Arcángel.
    - `cabe en el móvil`: `scrollWidth <= 375`, filas y pestañas ≥ 44 px, sin `console.error`.
  - `e2e/home.spec.ts`: el `href` de la card es `/c/arcangel/train/{seedId('arcangel', 'event:alevin-a:upcoming-0')}`; el recorrido de pestañas deja de esperar «Entrenar llega en una próxima fase».
- [ ] **Step 2:** `pnpm test src/modules && PORT=3400 pnpm test:e2e e2e/train.spec.ts e2e/home.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Los dos comandos y `pnpm check:guards` → PASS.
- [ ] **Step 5: Commit** `feat(train): próximas e histórico de sesiones, e Inicio abre la sesión`

---

### Task 13: Nueva sesión y detalle, con duplicar y cancelar

**Files:**
- Create: `src/app/c/[club]/(app)/train/new/page.tsx`, `[eventId]/page.tsx`, `[eventId]/loading.tsx`, `[eventId]/error.tsx` («No se pudo cargar la sesión» / «Revisa la conexión y vuelve a intentarlo.»), `_components/practice-form.tsx`, `_components/practice-actions.tsx` (+ tests de los dos), `e2e/practice-session.spec.ts`
- Modify: `src/ui/form-field.tsx` (+ test), `playwright.config.ts`, `e2e/train.spec.ts`

**Interfaces:**
- Consumes: Tasks 2, 8–11; `useAction`, `TextField`, `SelectField`, `TextAreaField`, `FormAlert`, `BackLink`, `StandardBadge`, `standardsLabel`.
- Produces:
  - `TextField` admite `type: 'date' | 'time'` (sin `maxLength`).
  - `type PracticeFormValues = { teamId: string; title: string; date: string; time: string; durationMinutes: string; primaryFocusId: string; secondaryFocusId: string; location: string; notes: string }`
  - `PracticeForm({ clubSlug: string; options: { teams: TeamOption[]; focusAreas: FocusOption[] }; initial: PracticeFormValues; edit?: { eventId: string; expectedUpdatedAt: string; onSaved: (updatedAt: string) => void } })` (cliente)
  - `PracticeActions({ clubSlug: string; eventId: string; canEdit: boolean; duplicateDefaults: { date: string; time: string } })` (cliente)

Pantallas:
- `/train/new`: sin `practice.manage` → `notFound()`; sin equipos, el vacío «Aún no estás en ningún equipo». `BackLink` «Entrenar»; `h1` «Nueva sesión»; campos «Equipo» (solo con más de uno), «Título», «Fecha», «Hora», «Duración (min)», «Objetivo principal» y «Objetivo secundario» (primera opción «Sin objetivo»), «Lugar»; `primary block` «Crear sesión». Valores iniciales: primer equipo, hoy en la zona del club (`isoToLocalInputs`), `DEFAULT_SESSION_TIME`, `DEFAULT_SESSION_MINUTES`. Al crear, `router.push('/c/{slug}/train/{eventId}')` (la Task 14 lo cambia a `…/edit`, cuando existe el constructor).
- En modo `edit`, `PracticeForm` no pinta «Equipo», añade «Notas» y su botón es `secondary` «Guardar datos»; al guardar llama a `onSaved(updatedAt)` y muestra «Datos guardados.».
- Fallos: `fieldErrors` bajo cada campo y `ACTION_ERROR_COPY` arriba (`FormAlert`), sin perder lo escrito.
- `/train/[eventId]`: `getPractice` o `notFound()`. `BackLink` «Entrenar»; `PracticeSummary`; con `standards`, `standardsLabel(terminology)` y hasta 3 `StandardBadge` (`/c/{slug}/way/standards#standard-{NN}`) y «+N»; «Notas» si las hay; los ítems en bloques de `phaseBlocks` (fase y minutos del bloque como cabecera, `ul` de `PracticeItemView`) y `PracticeTotal`. Sin ítems: «Esta sesión aún no tiene ejercicios» / «Añade ejercicios para prepararla.» / «Editar sesión» (cerrada o sin permiso: «No se añadieron ejercicios a esta sesión.» / «Volver a Entrenar»).
- `PracticeActions`: con `canEdit`, `primary block` «Editar sesión» → `/edit`; «Duplicar» (`secondary`) abre «Fecha» y «Hora» (con `duplicateDefaults`, de `nextWeeklySlot`) y «Crear copia», que lleva al detalle de la copia; con `canEdit`, «Cancelar sesión» (`danger`) abre `ConfirmDialog` «¿Cancelar esta sesión?» / «Dejará de salir en Inicio y en Próximas. Seguirá en el histórico.» / «Cancelar sesión» / «Volver» y después `router.refresh()`. Sin `practice.manage` no se pinta nada.
- `playwright.config.ts`: `ADMIN_SPECS` suma `/practice-session\.spec\.ts/` y `/practice-builder\.spec\.ts/`.

- [ ] **Step 1: Tests que fallan**
  - `form-field.test.tsx`: `type="date"` pinta un `input[type=date]` con su etiqueta.
  - `practice-form.test.tsx`: con un solo equipo no hay «Equipo»; enviar llama a `createPractice('club-a', …)` con los valores y `durationMinutes` numérico; un `INVALID` con `fieldErrors.title` lo pinta bajo «Título» y conserva lo escrito; en `edit` llama a `updatePracticeMeta` con `expectedUpdatedAt` y a `onSaved` con el nuevo.
  - `practice-actions.test.tsx`: sin `canEdit` no hay «Editar sesión» ni «Cancelar sesión» y sí «Duplicar»; «Cancelar sesión» no llama a la acción hasta confirmar.
  - `e2e/train.spec.ts` (lectura): `detalle`: Álex abre «Transición + rebote defensivo» desde Inicio («Abrir entrenamiento») → franja, «75 min · 5 ejercicios · Pabellón 2», «Transición» y «Rebote», bloques «Activación»…«Competición», «01»…«05», «Total» «75'» y «Editar sesión»; una sesión hecha no ofrece «Editar sesión» ni «Cancelar sesión».
  - `e2e/practice-session.spec.ts` (proyecto `admin`, `mode: 'serial'`):
    - `otro equipo y otro club reciben el 404` (Review Focus 1): Nora y Marta en `/c/arcangel/train/{upcoming-0 de Alevín A}` y en `…/edit` → «No encontramos esta página»; Nora en `/c/arcangel/train/new` no ve el campo «Equipo» (solo tiene uno) y Raúl puede elegir entre «Alevín A» y «Benjamín A».
    - `crear una sesión`: Álex → «Nueva sesión» → título `E2E sesión {ts}`, fecha dentro de 3 días, 18:00, 60, «Defensa» → «Crear sesión» → su detalle, con «Esta sesión aún no tiene ejercicios»; en Próximas sale con «60 min · Sin ejercicios todavía».
    - `la hora es la del club` (Review Focus 3): con `test.use({ timezoneId: 'America/New_York' })`, crear a las 18:00 → el detalle dice «18:00–19:00».
    - `duplicar`: en «Transición + rebote defensivo», «Duplicar» propone el mismo día de la semana siguiente a las 18:00; «Crear copia» → detalle con el mismo título, cinco ítems y «75'»; el original no cambia.
    - `cancelar`: en la sesión creada, «Cancelar sesión» → «Volver» no hace nada; otra vez y confirmar → desaparece de Próximas, sale en Histórico con «Cancelada» y su detalle no ofrece «Editar sesión».
- [ ] **Step 2:** `pnpm test src && PORT=3400 pnpm test:e2e e2e/train.spec.ts e2e/practice-session.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Los dos comandos, `pnpm check:guards` y `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(train): nueva sesión y detalle, con duplicar y cancelar`

---

### Task 14: Practice Builder

**Files:**
- Create: `src/app/c/[club]/(app)/train/[eventId]/edit/page.tsx`, `_components/practice-editor.tsx`, `_components/practice-builder.tsx`, `_components/practice-builder.test.tsx`, `e2e/practice-builder.spec.ts`
- Modify: `package.json` (dnd-kit)

**Interfaces:**
- Consumes: Tasks 8, 10, 11 y 13.
- Produces:
  - `PracticeEditor({ clubSlug: string; practice: PracticeDetail; options: { teams: TeamOption[]; focusAreas: FocusOption[] } })` (cliente): guarda el `updatedAt` vigente y lo comparte entre `PracticeForm` (modo `edit`, dentro de un desplegable «Fecha y datos») y `PracticeBuilder`.
  - `PracticeBuilder({ clubSlug: string; eventId: string; initialItems: SavedPracticeItem[]; expectedUpdatedAt: string; onSaved: (updatedAt: string) => void; backHref: string; extraActions?: (add: (item: PracticeItemDraft) => void) => ReactNode })` (cliente).

Reglas:
- `/edit`: `getPractice` o `notFound()`; sin `practice.manage` → `notFound()`; sesión no `scheduled` → `redirect` al detalle. `PracticeForm` pasa a llevar al constructor tras crear (`…/edit`), y el e2e `crear una sesión` de la Task 13 se ajusta a esa URL.
- Estado: lista de ítems con una clave estable por fila (`id`, o una local para los nuevos), la última copia guardada y qué fila está abierta. `dirty` = la lista difiere de la guardada.
- Orden: `DndContext` + `SortableContext` vertical; sensores de ratón (distancia 8), táctil (retardo 150 ms, tolerancia 8) y teclado (`sortableKeyboardCoordinates`); solo el asa arrastra (`touch-action: none` en ella); `restrictToVerticalAxis`. Al soltar, `moveItem`. Los anuncios de dnd-kit van en español («Has cogido {título}.», «{título} está en la posición {n} de {total}.», «Has soltado {título} en la posición {n}.», «Has cancelado el movimiento.»). «Subir» y «Bajar» usan el mismo `moveItem`.
- Fila abierta: «Fase» (`SelectField`: «Sin fase», `DEFAULT_PHASES` y cualquier fase que ya tenga un ítem), «Título» (solo si `drillId` es null) y «Notas».
- «Añadir bloque libre» (`secondary block`, `PlusIcon`): añade `{ drillId: null, title: '', phase: null, minutes: DEFAULT_ITEM_MINUTES, notes: null }` al final, abierto y con el foco en «Título». Con 30 ítems se desactiva y explica «Una sesión tiene como máximo 30 ejercicios.». `extraActions` es el hueco de «Añadir ejercicio» (Task 15).
- Barra de guardado fija sobre la navegación inferior: `PracticeTotal` y `primary` «Guardar sesión» (desactivado sin cambios o guardando). Bien: «Sesión guardada.» (`role="status"`) y `onSaved(updatedAt)`. Mal: `FormAlert` con su copy sin tocar la lista; los `fieldErrors` `items.N.*` se pintan en su fila, que se abre; `STALE_COPY` ofrece «Recargar» y `SESSION_CLOSED` «Volver a la sesión».
- `BackLink` «Volver a la sesión» pasa por `useLeaveGuard(dirty)`.

- [ ] **Step 1: Tests que fallan**
  - `practice-builder.test.tsx` (mock de `savePracticeItems`):
    - `subir y bajar reordenan y renumeran` (Review Focus 4): «Bajar A» → orden B, A, C con «01», «02», «03».
    - `los minutos van de 5 en 5 y el total se recalcula`: «Más minutos, A» → «15'» y «Total» de «35'» a «40'»; no pasa de «120'» ni baja de «1'».
    - `añadir y quitar un bloque libre`: fila nueva abierta con el foco en «Título»; «Quitar …» la elimina.
    - `guardar envía el orden nuevo`: la acción recibe los ítems en orden, con sus `id`, y el `expectedUpdatedAt` de la prop; después «Sesión guardada.» y `onSaved` con el nuevo; al volver a pintar con esa prop, el siguiente guardado la usa.
    - `si falla, lo escrito sigue ahí` (Review Focus 5): `SAVE_FAILED` → su copy, las filas intactas y «Guardar sesión» activo.
    - `copia obsoleta ofrece recargar`; `título vacío`: `fieldErrors['items.1.title']` abre la segunda fila y pinta «Escribe un título.».
    - `con 30 ítems no deja añadir`; `salir con cambios pregunta`.
  - `e2e/practice-builder.spec.ts` (proyecto `admin`, `mode: 'serial'`; cada test crea su sesión `E2E builder {ts}`):
    - `montar una sesión`: tres bloques libres con título y fase, «Más minutos» en uno → «Guardar sesión» → «Sesión guardada.»; tras recargar siguen y el detalle muestra el total.
    - `reordenar de tres maneras` (Review Focus 4): «Bajar» con el botón; el asa con el ratón; y con teclado (Espacio, flecha abajo, Espacio); tras guardar y recargar, el orden se mantiene.
    - `dos entrenadores a la vez` (Review Focus 2): Álex e Irene abren `/edit`; Álex guarda; Irene guarda → copy de `STALE_COPY`; «Recargar» muestra lo de Álex.
    - `salir sin guardar` (Review Focus 5): cambiar minutos y «Volver a la sesión» → diálogo; «Seguir editando» conserva el cambio; «Salir sin guardar» → el detalle sin él.
    - `editar los datos`: en «Fecha y datos» cambiar hora y lugar → «Datos guardados.»; el detalle muestra la franja nueva y «Guardar sesión» sigue funcionando sin recargar.
    - `una sesión hecha no se edita`: `/edit` de una sesión `done` lleva al detalle.
    - `cabe en el móvil`: `scrollWidth <= 375`; asa, «Más minutos», «Menos minutos» y botones de la fila con área ≥ 44 px; sin `console.error`.
- [ ] **Step 2:** `pnpm test src/app && PORT=3400 pnpm test:e2e e2e/practice-builder.spec.ts` → FAIL.
- [ ] **Step 3:** `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/utilities`; implementar.
- [ ] **Step 4:** Los dos comandos, `pnpm check:guards` y `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(train): Practice Builder con arrastre, subir y bajar, y guardado con copia obsoleta`

---

### Task 15: Ejercicios en la sesión

**Requiere** la Fase 3 fusionada hasta su Task 13. Antes del Step 1: fusionar `claude/fase-3-fccf45` (o `main`, si ya entró), conservar en `/train` la entrada «Biblioteca de ejercicios», regenerar `database.types.ts`, sumar sus tablas a `posture.test.sql` y sus specs de escritura a `ADMIN_SPECS`, y dejar toda la suite en verde.

**Files:**
- Create: `src/app/c/[club]/(app)/train/_components/drill-picker.tsx` (+ test), `src/app/c/[club]/(app)/drills/[drillId]/add-to-practice.tsx` (+ test), `e2e/practice-drills.spec.ts`
- Modify: `src/modules/practice/actions.ts`, `schema.ts` (+ test), `_components/practice-editor.tsx`, `train/[eventId]/page.tsx`, `drills/[drillId]/page.tsx`, `scripts/seed/drills.ts`, `scripts/seed/seed.int.test.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes (Fase 3): `searchDrills(ctx, filters)`, `DrillSummary`, `DrillFilters`, `getFocusAreas`, `DrillCard({ drill, href, action? })`, `BottomSheet`, `Search`, `Filter`, `ARCANGEL_DRILLS`; Tasks 9, 10 y 14.
- Produces:
  - `findDrills(clubSlug: string, input: { q?: string; focus?: string }): Promise<ActionResult<DrillSummary[]>>` (solo publicados)
  - `addDrillToPractice(clubSlug: string, input: { eventId: string; drillId: string }): Promise<ActionResult<{ title: string }>>`
  - `DrillPicker({ clubSlug: string; focusAreas: FocusArea[]; open: boolean; onOpenChange: (open: boolean) => void; onPick: (drill: DrillSummary) => void })` (cliente)
  - `AddToPractice({ clubSlug: string; drillId: string; practices: PracticeListItem[] })` (cliente)

Reglas:
- `DrillPicker`: `BottomSheet` «Añadir ejercicio» con `Search` «Buscar ejercicios…», `Filter` «Objetivo» y la lista de `DrillCard` con `action` «Añadir» (`aria-label` «Añadir {título}»). Elegir no cierra la hoja: la fila pasa a «Añadido» y se puede seguir. Sin resultados: «No hay ejercicios con esta búsqueda».
- En el constructor, «Añadir ejercicio» (`secondary block`, vía `extraActions`) va encima de «Añadir bloque libre» y añade `{ drillId, title: drill.title, phase: null, minutes: drill.minMinutes, notes: null }`.
- `addDrillToPractice`: lee la sesión y el ejercicio de este club (publicado), y llama a `save_practice_items` con los ítems actuales más el nuevo y el `updated_at` leído; ante `STALE_COPY` relee y repite una vez.
- Ficha de ejercicio: con `practice.manage` y ejercicio publicado, «Añadir a sesión» (`secondary block`) abre un `BottomSheet` «Añadir a una sesión» con las próximas sesiones (`listPractices(ctx, 'upcoming', now)`); al elegir una, «Añadido a {título}.» y enlace «Abrir sesión» → `/train/{eventId}/edit`. Sin sesiones: «No hay sesiones programadas» y «Nueva sesión».
- Detalle de sesión: el ítem con ejercicio enlaza a `/c/{slug}/drills/{drillId}`.
- Seed (C7: 18 → 21): `ARCANGEL_DRILLS` gana «Ayuda y recuperación 3x3» (12+, 6–12, 12–15, `defensa`, Standards 1 y 2), «Presión al balón en medio campo» (12+, 6–12, 10–15, `defensa`, Standard 2) y «Bloqueo y rebote 3x3» (10+, 6–12, 10–12, `rebote`, Standard 3), publicados, de `raul@arcangel.test`, con objetivo, organización y tres puntos (dos clave) como el resto. Así tres de los seis ítems de «Defensa presionante» quedan enlazados.

- [ ] **Step 1: Tests que fallan**
  - `actions.test.ts`: `findDrills` pide solo publicados y devuelve `DrillSummary[]`; `addDrillToPractice` añade al final con el título y los minutos mínimos del ejercicio, reintenta una vez tras `STALE_COPY`, y con un ejercicio en borrador o de otro club → `NOT_FOUND`.
  - `drill-picker.test.tsx`: «Añadir Rebote + outlet» llama a `onPick` con el ejercicio, la hoja sigue abierta y la fila dice «Añadido». `add-to-practice.test.tsx`: sin sesiones, el vacío con «Nueva sesión».
  - `seed.int.test.ts`: 21 ejercicios publicados o en borrador en Arcángel; «Defensa presionante» tiene 3 ítems con `drill_id`.
  - `e2e/practice-drills.spec.ts` (proyecto `admin`):
    - `del principio al ejercicio y a la sesión` (flujo de la spec): Álex → The Way → «Cómo jugamos» → «Transición» → un ejercicio → «Añadir a sesión» → su sesión `E2E drills {ts}` → «Abrir sesión» → el ejercicio es el último ítem.
    - `cinco ejercicios desde el selector`: «Añadir ejercicio» → buscar «outlet» → «Añadir Rebote + outlet» y cuatro más sin cerrar la hoja → cinco filas con sus minutos → «Guardar sesión».
    - `qué y por qué`: el detalle de «Transición + rebote defensivo» muestra los badges «03», «04» y «05» y cada ítem enlaza a su ficha; el de «Defensa presionante», «01», «02» y «03».
    - `un borrador ajeno no se cuela`: el selector de Álex no ofrece «Bloqueo de rebote».
- [ ] **Step 2:** `pnpm test src && pnpm test:int && PORT=3400 pnpm test:e2e e2e/practice-drills.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Los tres comandos, `pnpm check:guards` y `pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(train): ejercicios de la biblioteca en la sesión y «Añadir a sesión» desde la ficha`

---

### Task 16: Cierre de fase

**Files:**
- Modify: `docs/superpowers/plans/2026-10-03-00-contratos-entre-fases.md`, `docs/superpowers/backlog.md`, `README.md` y las correcciones que salgan de la revisión

- [ ] **Step 1:** `pnpm supabase db reset && pnpm seed && pnpm db:types`; `git diff --exit-code src/lib/database.types.ts` limpio.
- [ ] **Step 2:** `pnpm lint && pnpm typecheck && pnpm check:guards && pnpm test && pnpm test:db && pnpm test:int && PORT=3400 pnpm test:e2e` en verde; `pnpm supabase db lint` sin errores.
- [ ] **Step 3:** App arrancada (`pnpm dev`), a 375×812, con Álex, Irene, Nora, Marta y Raúl: crear una sesión de cinco ejercicios cronometrando (meta de la spec: menos de 3 minutos), reordenar con el dedo, duplicar, cancelar; consola limpia; nada se sale del ancho; Nora y Marta no llegan a las sesiones de Alevín A.
- [ ] **Step 4:** Documentos: en el contrato, la sección de la Fase 4 con «Cambios propuestos al contrato»; en el backlog, el bloque «Fase 4» marcado como hecho y, en «Pendientes que deja la Fase 4», lo que la revisión deje.
- [ ] **Step 5: Commit** `chore: cierre de la Fase 4` y abrir el PR (después del de la Fase 3: las migraciones de la Fase 4 no se despliegan antes que las suyas).

---

## Cambios propuestos al contrato

- **SQL:** `private.can_manage_team`, `private.can_edit_plan`; `public.update_practice_session` (los datos de una sesión son dos tablas); argumentos opcionales al final con `default null`; `practice_plans.event_kind` y la FK de cuatro columnas a `events`; `updated_at` por trigger (`private.set_updated_at` de la Fase 3); error de dominio `SESSION_CLOSED`; `save_practice_items` conserva el `id` de los ítems que siguen y fija `status` (`ready` con ítems, `draft` sin ellos); checks de longitud. `can_see_plan`: el autor que deja el cuerpo técnico deja de ver los planes del equipo.
- **TS:** `mutate` (la forma de la Fase 3, con `retryOnConflict`) y `useAction` en `src/lib/`; `SavedPracticeItem`, `PracticeStatus`, `TeamOption`, `FocusOption`, `PhaseBlock`, `limits.ts`, `format.ts`; `listPractices(ctx, scope, nowIso)` devuelve `{ practices, teamCount }`; `listManageableTeams`, `getPracticeFormOptions`; `changeMinutes` avanza por múltiplos de 5 (1, 5, 10 … 120); `addDrillToPractice(clubSlug, { eventId, drillId })` y `findDrills` (C2); `HomeScreen` gana `canCreatePractice`.
- **UI:** `ConfirmDialog` sobre Radix AlertDialog; `useLeaveGuard` y `LeaveGuardDialog`; `PracticeItemView`, `PracticeTotal`; variante `danger` de `CTAButton`; `TextField` con `date` y `time`; `Card` con `as="ul"` y `ListRow` como `<li>`; `PracticeBuilder`, `PracticeEditor`, `PracticeForm`, `PracticeActions`, `DrillPicker` y `AddToPractice` viven junto a sus rutas (`train/_components/`, `drills/[drillId]/`).
- **Seed y e2e:** `SessionDef.status`; `restoreSeed` limpia las sesiones que no son del seed; `irene@arcangel.test` en `SESSION_USERS`; `posture.test.sql` con la lista de privilegios, que cada fase amplía con sus tablas.
- **Otros:** convención de medidas y guards de hex y de medidas en `check:guards`; `validateTokens`.
- **Pasa a la Fase 7** (backlog): unificar el estado «guardado» de `SectionEditor` con `useConfirmation`/`EditorForm`. **Sin dueño en el MVP:** plantillas de sesión y restaurar una sesión cancelada.
