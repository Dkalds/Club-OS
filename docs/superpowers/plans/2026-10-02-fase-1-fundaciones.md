# CLUB OS · Fase 1 (Fundaciones) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un entrenador invitado entra con un código por email, aterriza en `/c/{club}` con la marca de su club y ve su Inicio (próximo entrenamiento, próximo partido, esta semana), con el aislamiento entre clubes y entre equipos garantizado por RLS y cubierto por tests.

**Architecture:** Monolito Next.js (App Router) sobre Supabase. Las lecturas van por Server Components con la sesión del usuario; Postgres aplica RLS en cada tabla con funciones de apoyo en el esquema `private`. El club se resuelve por el slug de la URL en el layout de `/c/[club]`, que inyecta los colores del club como variables CSS. Los tokens visuales se generan desde `design/tokens.json`.

**Tech Stack:** Next.js (última estable, App Router), React, TypeScript strict, Tailwind CSS v4, Supabase (CLI local, Postgres, Auth), `@supabase/ssr`, Zod, `date-fns` + `@date-fns/tz`, `uuid` (v5 para el seed), Vitest + Testing Library, Playwright, pgTAP (`supabase test db`), pnpm, GitHub Actions.

**Spec:** `docs/spec/club-os-primera-entrega.md` (13 decisiones aprobadas) + design system en `design/`.

**Dentro de esta fase:** repo y CI, tokens y tipografía, esquema de tenancy, personas, estructura, calendario y planes con RLS, seed de Arcángel y Club Demo, login por código, selector de club, layout de club con marca y navegación, componentes de Inicio, pantalla de Inicio, entorno remoto.

**Fuera (fases siguientes):** invitaciones (Fase 7), The Way y Standards (2), biblioteca (3), Practice Builder y escritura de sesiones (4), Live Practice (5), pantallas de equipo y jugador (6), gestión y vista de cobertura (7), Storage y fotos, PWA. Los ejercicios, Standards y principios del seed de Arcángel se cargan en las Fases 2 y 3, cuando existen sus tablas. Las pestañas de esas secciones existen como pantallas vacías.

## Global Constraints

- TypeScript `strict: true`; ESLint sin `any` explícito.
- Toda tabla de club: `organization_id uuid not null`, `enable row level security`, `unique (organization_id, id)` si otras tablas la referencian, y claves foráneas compuestas `(organization_id, x_id) references x (organization_id, id)`.
- Funciones de RLS en el esquema `private`: `language sql stable security definer set search_path = ''`; `execute` revocado a `public` y `anon`, concedido a `authenticated`. Las políticas usan `(select auth.uid())`.
- Cada tabla nueva revoca todo a `anon`. En esta fase solo hay políticas `select`; las escrituras llegan con su fase y sus tests.
- `SUPABASE_SERVICE_ROLE_KEY` solo en `scripts/` y `e2e/`. `src/` no lo menciona nunca.
- `src/` no contiene `Arcángel`, `Arcangel` ni `c9a45c` (ni otro literal de un club).
- Ningún hex en componentes: colores, espacios y radios vía tokens (`src/ui/tokens.css` generado + `src/ui/brand-defaults.css`).
- Login: `signInWithOtp({ email, options: { shouldCreateUser: false } })`; `[auth] enable_signup = false` en `supabase/config.toml`.
- Copy en español, tuteo, sin exclamaciones ni emoji. Formatos: «Martes 6 oct», «18:00–19:15» (raya corta U+2013), «75 min».
- Horas en `timestamptz`; se muestran en `organizations.timezone` (por defecto `Europe/Madrid`), nunca en la del dispositivo.
- Personas: `birth_year`, nunca fecha completa. URLs: slug de club o uuid. Seed 100 % ficticio.
- Viewport de referencia 375×812; controles táctiles ≥ 44 px.
- Proyecto Supabase remoto en la región `eu-central-1` (Fráncfort).

## Review Focus

1. Un usuario con sesión abre `/c/club-demo` sin ser miembro, o un slug que no existe: los dos casos muestran la misma página 404, sin el nombre ni datos del club. → Task 8, e2e.
2. Un email no invitado pide código: ve el mismo mensaje que uno invitado y no se crea ningún usuario. → Task 7, unidad.
3. La entrenadora de Benjamín A, del mismo club, no ve la plantilla, los eventos ni los planes de Alevín A. → Tasks 4 y 5 (pgTAP) y Task 11 (e2e).
4. Un entrenamiento después del cambio de hora (25 oct 2026), a las `2026-10-27T17:00:00Z`, se muestra a las 18:00 en Madrid; «Esta semana» que cruza el cambio no pierde ni duplica días. → Task 9, unidad.
5. Un color de marca malformado (`red;background:url(x)`) no llega nunca al atributo `style`: lo rechaza un CHECK en BD y `brandingToCssVars` cae a los colores de plataforma. → Tasks 3 (pgTAP) y 8 (unidad).

---

## Estructura de ficheros

```
CLAUDE.md                              reglas del proyecto (ya en el starter)
design/                                tokens.json, README.md, components/** (referencia visual)
docs/spec/, docs/superpowers/plans/
.env.example
supabase/config.toml
supabase/templates/magic_link.html     email con el código {{ .Token }}
supabase/migrations/20261005000100_tenancy.sql
supabase/migrations/20261005000200_people_structure.sql
supabase/migrations/20261005000300_calendar_practice.sql
supabase/seed.sql                      SOLO helpers de test (esquema tests), local
supabase/tests/database/tenancy.test.sql
supabase/tests/database/structure.test.sql
supabase/tests/database/calendar.test.sql
scripts/check-guards.sh
scripts/tokens-to-css.ts (+ .test.ts)
scripts/lib/admin-client.ts
scripts/seed.ts
scripts/seed/guard.ts, dates.ts, data.ts (+ guard.test.ts, dates.test.ts, seed.int.test.ts)
src/proxy.ts                           (middleware.ts si la versión de Next es < 16)
src/app/layout.tsx, globals.css
src/app/(auth)/login/page.tsx, login-form.tsx
src/app/auth/sign-out/route.ts
src/app/select-club/page.tsx
src/app/c/[club]/layout.tsx, page.tsx, loading.tsx, error.tsx, not-found.tsx
src/app/c/[club]/{way,train,games,team}/page.tsx
src/lib/supabase/server.ts, session.ts
src/lib/database.types.ts              generado
src/lib/time.ts (+ test)
src/modules/auth/actions.ts (+ test)
src/modules/tenancy/branding.ts, navigation.ts, queries.ts (+ tests)
src/modules/home/types.ts, build-home.ts, queries.ts (+ test)
src/ui/tokens.css (generado), brand-defaults.css, icons.tsx
src/ui/app-shell.tsx, top-navigation.tsx, bottom-navigation.tsx, hero.tsx, section-header.tsx,
       card.tsx, cta-button.tsx, list-row.tsx, avatar.tsx, practice-card.tsx, game-card.tsx, states.tsx (+ tests)
e2e/helpers/auth.ts, e2e/auth.spec.ts, e2e/tenancy.spec.ts, e2e/home.spec.ts
.github/workflows/ci.yml
```

---

### Task 1: Repo, herramientas y CI

**Files:**
- Create: proyecto Next.js, `package.json` scripts, `vitest.config.ts`, `playwright.config.ts`, `supabase/config.toml`, `supabase/templates/magic_link.html`, `.env.example`, `scripts/check-guards.sh`, `.github/workflows/ci.yml`
- Copy: `CLAUDE.md`, `docs/`, `design/` del starter

**Interfaces:**
- Produces: scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:db`, `test:int`, `test:e2e`, `tokens`, `seed`, `db:types`, `check:guards`; variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (la anon key en CLI antiguos), `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 1:** `pnpm create next-app@latest clubos --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm`; copiar `CLAUDE.md`, `docs/` y `design/` a la raíz; `strict: true` en `tsconfig.json`.
- [ ] **Step 2:** Dependencias: `@supabase/supabase-js @supabase/ssr zod date-fns @date-fns/tz`; dev: `supabase tsx uuid vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test`.
- [ ] **Step 3:** `pnpm supabase init`. En `config.toml`: `[auth] enable_signup = false`; `[auth.email] otp_length = 6`, `otp_expiry = 600`; `[auth.rate_limit] email_sent = 100`; `[auth.email.template.magic_link] subject = "Tu código para entrar"`, `content_path = "./supabase/templates/magic_link.html"`. La plantilla muestra «Tu código para entrar en CLUB OS: {{ .Token }}. Caduca en 10 minutos.»
- [ ] **Step 4:** `vitest.config.ts`: entorno `node`, `jsdom` para `src/ui/**`; incluye `src/**/*.test.ts(x)` y `scripts/**/*.test.ts`, excluye `**/*.int.test.ts`. `pnpm test:int` ejecuta solo `**/*.int.test.ts`. `playwright.config.ts`: un proyecto `mobile` con viewport 375×812, `baseURL` `http://localhost:3000`, `webServer` `pnpm build && pnpm start`, `reuseExistingServer` fuera de CI.
- [ ] **Step 5:** `scripts/check-guards.sh` falla (exit 1) si `grep -rniE 'arc[aá]ngel|c9a45c' src/` encuentra algo, si `grep -rn 'SERVICE_ROLE' src/` encuentra algo, o si `pnpm tokens && git diff --exit-code src/ui/tokens.css` detecta diferencias (esta última comprobación se activa en la Task 2).
- [ ] **Step 6:** Verificar el guard: crear `src/tmp.ts` con `// Arcángel`, `pnpm check:guards` → exit 1 con la línea encontrada; borrar el fichero → exit 0.
- [ ] **Step 7:** `ci.yml` con tres jobs: `checks` (install, lint, typecheck, check:guards, test), `db` (`supabase/setup-cli`, `supabase start`, `pnpm test:db`), `e2e` (`supabase start`, volcar `supabase status -o env` a `.env.local`, `pnpm seed`, `pnpm test:int`, `pnpm exec playwright install --with-deps chromium`, `pnpm test:e2e`).
- [ ] **Step 8:** `pnpm lint && pnpm typecheck && pnpm check:guards && pnpm build` → todo en verde; `pnpm supabase start` arranca.
- [ ] **Step 9: Commit** `chore: scaffold Next.js + Supabase + CI`

---

### Task 2: Tokens del design system en código

**Files:**
- Create: `scripts/tokens-to-css.ts`, `scripts/tokens-to-css.test.ts`, `src/ui/tokens.css` (generado), `src/ui/brand-defaults.css`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`

**Interfaces:**
- Produces: `type DesignTokens` (forma de `design/tokens.json`); `tokensToCss(tokens: DesignTokens): string`; variables CSS `--<token>` de todas las familias; utilidades Tailwind `bg-<color>`, `text-<color>`, `border-<color>`, `rounded-<radius>`; variables de fuente `--font-display` y `--font-text`.

- [ ] **Step 1: Tests que fallan** en `scripts/tokens-to-css.test.ts`, leyendo el `design/tokens.json` real:
  - `emite los colores del primer tema en :root` → contiene `--bg: #0a0a0b;` y `--ink: #f2eee6;`
  - `resuelve alias como var()` → contiene `--focus-ring: var(--ink);`
  - `emite espaciado, radios, tamaños y sombra` → `--space-4: 16px;`, `--radius-lg: 16px;`, `--target-min: 44px;`, `--shadow-sheet: 0 -8px 24px rgba(0,0,0,0.5);`
  - `no emite tokens brand-*` → no contiene `--brand-`
- [ ] **Step 2:** `pnpm test scripts/tokens-to-css.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Implementar `tokensToCss` y la CLI (`pnpm tokens` escribe `src/ui/tokens.css` con cabecera «Generado desde design/tokens.json; no editar»). Los `brand-*` se excluyen porque los pone el club.
- [ ] **Step 4:** `src/ui/brand-defaults.css` define en `:root` los colores de marca de plataforma (se usan fuera de un club, p. ej. en login): `--brand-accent: #f2eee6; --brand-accent-pressed: #d9d4ca; --brand-on-accent: #0a0a0b; --brand-accent-soft: #26262a;`.
- [ ] **Step 5:** `globals.css`: `@import "tailwindcss"`, importa `tokens.css` y `brand-defaults.css`, y un bloque `@theme inline` que mapea cada token de color `x` a `--color-x: var(--x)` (incluidos los cuatro `brand-*`) y los radios a `--radius-*`. `body` usa `bg-bg text-ink font-text`. En `layout.tsx`, `next/font/google`: `Barlow` (400, 500, 600, 700) en la variable `--font-text` y `Barlow_Condensed` (500, 600, 700) en `--font-display`; `<html lang="es">`.
- [ ] **Step 6:** `pnpm test` en verde; `pnpm tokens && git diff --exit-code src/ui/tokens.css` limpio; `pnpm check:guards` en verde.
- [ ] **Step 7: Commit** `feat(ui): generar tokens del design system`

---

### Task 3: Tenancy en BD (organizaciones, marca, perfiles, membresías)

**Files:**
- Create: `supabase/migrations/20261005000100_tenancy.sql`, `supabase/seed.sql`, `supabase/tests/database/tenancy.test.sql`

**Interfaces:**
- Produces (SQL): esquema `private`; enum `public.org_role ('admin','coach','player','guardian')`; tablas `organizations`, `organization_branding`, `profiles`, `memberships`; funciones `private.is_member(org uuid) returns boolean` y `private.has_org_role(org uuid, roles public.org_role[]) returns boolean`; helpers de test `tests.create_user(email text) returns uuid`, `tests.authenticate_as(uid uuid) returns void`, `tests.clear_authentication() returns void`.

Columnas fijadas:
- `organizations`: `id uuid pk default gen_random_uuid()`, `slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`, `name text not null`, `timezone text not null default 'Europe/Madrid'`, `status text not null default 'active' check (status in ('active','suspended'))`, `created_at`, `updated_at`.
- `organization_branding`: `organization_id uuid pk references organizations on delete cascade`, `display_name text not null`, `wordmark_sub text`, `short_name text not null check (char_length(short_name) between 2 and 4)`, `way_name text not null`, `tagline text`, `color_accent`, `color_accent_pressed`, `color_on_accent`, `color_accent_soft` (todos `text not null check (x ~ '^#[0-9a-f]{6}$')`), `terminology jsonb not null default '{}'`, `updated_at`.
- `profiles`: `user_id uuid pk references auth.users on delete cascade`, `display_name text`, `locale text not null default 'es'`, `created_at`. Trigger `after insert on auth.users` que crea el perfil (`private.handle_new_user()`).
- `memberships`: `id`, `organization_id not null references organizations`, `user_id not null references auth.users on delete cascade`, `role public.org_role not null`, `person_id uuid null` (la FK compuesta llega en la Task 4), `status text not null default 'active' check (status in ('active','revoked'))`, `created_at`, `unique (organization_id, user_id)`; índices en `user_id` y `organization_id`.

Políticas `select`: `organizations` → `private.is_member(id)`; `organization_branding` → `private.is_member(organization_id)`; `profiles` → `user_id = (select auth.uid())`; `memberships` → `user_id = (select auth.uid()) or private.has_org_role(organization_id, '{admin}')`. Solo cuentan membresías `active`.

`supabase/seed.sql` (solo local; nunca en migraciones): crea el esquema `tests` y los tres helpers. `authenticate_as` hace `set_config('role','authenticated',true)` y `set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)`; `clear_authentication` vuelve a `anon` sin claims; `create_user` inserta en `auth.users` (`instance_id` cero, `aud`/`role` `authenticated`) y devuelve el id.

- [ ] **Step 1: Test que falla** `tenancy.test.sql` (`begin; select plan(n); … select * from finish(); rollback;`). Fixtures como `postgres`: club A y club B con su marca, `coachA` (coach en A), `adminA` (admin en A), `coachB` (coach en B), `sinClub` (sin membresía). Aserciones:
  - `coachA solo ve su club`: `results_eq('select slug from organizations', ...)` = solo A.
  - `coachA no ve la marca de B`: `is_empty` sobre `organization_branding` de B.
  - `coach ve solo su membresía` (1 fila); `admin ve todas las de su club` (2 filas en A, 0 de B).
  - `sin membresía no ve clubes`: `is_empty('select * from organizations')`.
  - `anon no tiene acceso`: `throws_ok('select * from organizations', '42501')`.
  - `membresía revocada pierde el acceso`: tras `status = 'revoked'`, coachA ve 0 clubes.
  - `color malformado rechazado`: como postgres, `throws_ok($$update organization_branding set color_accent = 'red;background:url(x)' ...$$, '23514')`.
- [ ] **Step 2:** `pnpm supabase db reset && pnpm test:db` → FAIL (tablas inexistentes).
- [ ] **Step 3:** Escribir la migración con tablas, enum, trigger, funciones, grants, `revoke all ... from anon` y políticas.
- [ ] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS. `pnpm db:types`.
- [ ] **Step 5: Commit** `feat(db): tenancy con RLS y tests de aislamiento`

---

### Task 4: Personas y estructura deportiva

**Files:**
- Create: `supabase/migrations/20261005000200_people_structure.sql`, `supabase/tests/database/structure.test.sql`

**Interfaces:**
- Consumes: `private.is_member`, `private.has_org_role`, helpers `tests.*` (Task 3).
- Produces: enum `public.staff_role ('head_coach','assistant')`; tablas `people`, `seasons`, `categories`, `teams`, `team_staff`, `team_players`; FK compuesta `memberships (organization_id, person_id) → people`; funciones `private.is_team_staff(team uuid) returns boolean` y `private.can_see_person(person uuid) returns boolean`.

Columnas fijadas:
- `people`: `id`, `organization_id`, `first_name text not null`, `last_name text not null`, `birth_year smallint check (birth_year between 1900 and 2100)`, `created_at`, `archived_at`; `unique (organization_id, id)`.
- `seasons`: `id`, `organization_id`, `name text not null` («2026/27»), `starts_on date not null`, `ends_on date not null`, `is_current boolean not null default false`; índice único parcial: una temporada actual por club.
- `categories`: `id`, `organization_id`, `name text not null`, `age_band text not null check (age_band ~ '^U[0-9]{1,2}$')`, `sort int not null default 0`.
- `teams`: `id`, `organization_id`, `season_id`, `category_id`, `name text not null`; FKs compuestas a `seasons` y `categories`.
- `team_staff`: `organization_id`, `team_id`, `person_id`, `staff_role`, pk `(team_id, person_id)`; FKs compuestas; índice en `person_id`.
- `team_players`: `organization_id`, `team_id`, `person_id`, `jersey_number smallint check (jersey_number between 0 and 99)`, `position text`, pk `(team_id, person_id)`; dorsal único por equipo; índice en `person_id`.

Reglas: `is_team_staff(team)` es verdadero si la persona vinculada a la membresía activa del usuario en el club del equipo está en `team_staff` de ese equipo. `can_see_person(person)`: admin del club de la persona, o es la propia persona del usuario, o la persona está en `team_staff`/`team_players` de un equipo donde el usuario es staff. Políticas `select`: `people` → `can_see_person(id)`; `seasons`, `categories` → `is_member`; `teams` → admin o `is_team_staff(id)`; `team_staff`, `team_players` → admin o `is_team_staff(team_id)`.

- [ ] **Step 1: Test que falla** `structure.test.sql`. Fixtures: club A con equipos `T1` (Alevín) y `T2` (Benjamín), `c1` staff de T1, `c2` staff de T2, `p1` jugador de T1, `p2` de T2, `adminA`; club B con equipo `TB` y jugador `pb`. Aserciones:
  - `c1 ve solo su equipo`: teams = {T1}.
  - `c1 ve la plantilla de T1 y no la de T2`: team_players = {p1}.
  - `c1 ve a su gente`: people ⊇ {c1, p1} y sin p2 ni pb.
  - `c2 no ve la plantilla de Alevín A` (Review Focus 3): `is_empty` de team_players de T1.
  - `admin ve los dos equipos de su club y nada de B`.
  - `FK compuesta impide mezclar clubes`: como postgres, insertar en `team_players (organization_id = B, team_id = T1, person_id = pb)` → `throws_ok(..., '23503')`.
  - `una sola temporada actual por club`: segunda `is_current = true` → `23505`.
- [ ] **Step 2:** `pnpm test:db` → FAIL.
- [ ] **Step 3:** Escribir la migración.
- [ ] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS (también `tenancy.test.sql`). `pnpm db:types`.
- [ ] **Step 5: Commit** `feat(db): personas, temporadas, equipos y plantillas con RLS`

---

### Task 5: Calendario y planes de sesión

**Files:**
- Create: `supabase/migrations/20261005000300_calendar_practice.sql`, `supabase/tests/database/calendar.test.sql`

**Interfaces:**
- Consumes: funciones de las Tasks 3 y 4.
- Produces: enums `public.event_kind ('practice','game')`, `public.event_status ('scheduled','done','cancelled')`; tablas `focus_areas`, `events`, `games`, `practice_plans`, `practice_items`; función `private.can_see_plan(plan uuid) returns boolean`.

Columnas fijadas:
- `focus_areas`: `id`, `organization_id`, `slug text not null`, `name text not null`, `sort int not null default 0`; únicos `(organization_id, slug)` y `(organization_id, id)`.
- `events`: `id`, `organization_id`, `team_id`, `kind event_kind not null`, `starts_at timestamptz not null`, `ends_at timestamptz not null check (ends_at > starts_at)`, `location text`, `status event_status not null default 'scheduled'`; FK compuesta a `teams`; índice `(team_id, starts_at)`.
- `games`: `event_id pk`, `organization_id`, `opponent_name text not null`, `competition_name text`, `home_away text check (home_away in ('home','away'))`, `score_for smallint`, `score_against smallint`, `opponent_notes text`, `source text not null default 'manual'`; FK compuesta a `events`.
- `practice_plans`: `id`, `organization_id`, `team_id uuid null`, `event_id uuid null unique`, `title text not null`, `primary_focus_id`, `secondary_focus_id` (null, FK compuesta a `focus_areas`), `notes text`, `is_template boolean not null default false`, `status text not null default 'draft' check (status in ('draft','ready','done'))`, `actual_minutes smallint`, `created_by uuid references auth.users default auth.uid()`, `created_at`.
- `practice_items`: `id`, `organization_id`, `plan_id` (FK compuesta a `practice_plans`, `on delete cascade`), `sort int not null`, `phase text`, `drill_id uuid null` (la FK llega en la Fase 3), `title_override text`, `minutes smallint not null check (minutes between 1 and 120)`, `notes text`, `completed boolean`, `actual_minutes smallint`; `unique (plan_id, sort) deferrable initially deferred`.

Reglas: `can_see_plan(plan)`: admin del club del plan, o staff de su equipo, o (`created_by` = usuario y miembro del club). Políticas `select`: `focus_areas` → `is_member`; `events` → admin o `is_team_staff(team_id)`; `games` → admin o el evento es de un equipo donde el usuario es staff; `practice_plans` → `can_see_plan(id)`; `practice_items` → `can_see_plan(plan_id)`.

- [ ] **Step 1: Test que falla** `calendar.test.sql` (mismas fixtures que la Task 4 más eventos, un partido y planes con ítems en T1, T2 y TB):
  - `c1 ve los eventos de T1 y no los de T2 ni TB`.
  - `c2 no ve planes, ítems ni partidos de T1` (Review Focus 3).
  - `coach de B no ve nada de A` en las cinco tablas.
  - `plantilla privada`: un plan con `team_id null` creado por c1 es visible para c1 y no para c2.
  - `FK compuesta`: `practice_items (organization_id = B, plan_id = <plan de A>)` → `23503`.
  - `fin anterior al inicio` → `23514`; `minutes = 0` → `23514`.
- [ ] **Step 2:** `pnpm test:db` → FAIL.
- [ ] **Step 3:** Escribir la migración.
- [ ] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS (las tres suites). `pnpm db:types`.
- [ ] **Step 5: Commit** `feat(db): eventos, partidos y planes de sesión con RLS`

---

### Task 6: Seed de Arcángel y Club Demo

**Files:**
- Create: `scripts/lib/admin-client.ts`, `scripts/seed/guard.ts`, `scripts/seed/dates.ts`, `scripts/seed/data.ts`, `scripts/seed.ts`, `scripts/seed/guard.test.ts`, `scripts/seed/dates.test.ts`, `scripts/seed/seed.int.test.ts`

**Interfaces:**
- Consumes: tablas de las Tasks 3–5; `Database` de `src/lib/database.types.ts`.
- Produces: `createAdminClient(): SupabaseClient<Database>`; `assertSeedTarget(url: string, env: Record<string, string | undefined>): void`; `type SlotIso = { startsAt: string; endsAt: string }`; `seedSchedule(now: Date, tz: string): { past: SlotIso[]; upcoming: SlotIso[]; game: SlotIso }`; `runSeed(now: Date): Promise<void>`; ids deterministas `seedId(orgSlug: string, key: string): string` (uuid v5 con un namespace fijo del proyecto).

Reglas de `seedSchedule` (en la zona `tz`): `upcoming` = los dos siguientes martes/jueves a las 18:00–19:15 estrictamente posteriores a `now`; `game` = el siguiente sábado 10:30–12:00 posterior a `now`; `past` = los cuatro martes/jueves 18:00–19:15 más recientes anteriores a `now`, del más reciente al más antiguo.

Datos (`data.ts`, todo ficticio):

| Club | Contenido |
| --- | --- |
| CB Arcángel (`arcangel`, Europe/Madrid) | Marca: display «Arcángel», sub «Basketball», short «CBA», way «The Arcángel Way», tagline «One club. One identity. One way.», colores `#c9a45c` / `#b38e48` / `#0a0a0b` / `#2b2517`, terminología `{"way": "The Way", "standards": "Arcángel Standards"}`. Temporada «2026/27» (2026-09-01 a 2027-06-30, actual). Categorías Benjamín U10 (sort 10) y Alevín U12 (20). Equipos Alevín A y Benjamín A. Focus areas: técnica, transición, tiro, defensa, rebote, ataque. |
| Usuarios Arcángel | `raul@arcangel.test` Raúl Campos, admin, sin equipo · `alex@arcangel.test` Álex Prieto, head coach Alevín A · `irene@arcangel.test` Irene Soler, assistant Alevín A · `nora@arcangel.test` Nora Gil, head coach Benjamín A |
| Alevín A (año 2015) | #4 Hugo Serrano Base · #5 Saúl Méndez Escolta · #6 Adrián Toledo Alero · #7 Leo Ortega Base · #8 Bruno Pardo Escolta · #9 Marco Vidal Alero · #10 Gael Ferrer Alero · #11 Unai Robles Ala-pívot · #12 Iker Navas Ala-pívot · #13 Óscar Vega Pívot · #14 Teo Marín Base · #15 Pablo Rey Pívot |
| Sesiones Alevín A | `upcoming[0]` «Transición + rebote defensivo» (transición/rebote; Pabellón 2): Activación «Movilidad + rueda de pases» 10 · Técnica «3 calles» 15 · Rebote «Rebote + outlet» 15 · Transición «3x2 continuo» 20 · Competición «2x2 presión» 15. `upcoming[1]` «Defensa presionante» (defensa/rebote): 10 · 15 · 15 · 15 · 10 · 10. `past[0..3]` «Tiro tras bote», «Pase y corte», «Contraataque 2x1», «Rebote ofensivo», con estado `done`. Partido en `game`: vs «CB Ribera», «Liga Alevín», local. |
| Benjamín A (año 2017) | #3 Mario Ibáñez · #6 Lucas Peña · #9 Eric Soto. Sesión en `upcoming[0]` con hora 17:00–18:00: «Bote y control», 60 min en 4 ítems. |
| Club Demo (`club-demo`, Europe/Madrid) | Marca: display «Club Demo», sub «Baloncesto», short «CDM», way «The Demo Way», colores `#3fb8af` / `#34998f` / `#0a0a0b` / `#10282a`, terminología `{"way": "Nuestra forma"}`. Temporada 2026/27, categoría Infantil U14, equipo Infantil A, `marta@demo.test` Marta Ruiz head coach, 3 jugadores (año 2013), sesión «Defensa individual» en `upcoming[0]`. |
| Sin club | `sin.club@clubos.test`, usuario sin membresías |

- [ ] **Step 1: Tests que fallan**
  - `guard.test.ts`: `acepta Supabase local` (`http://127.0.0.1:54321` no lanza); `rechaza un remoto` (`https://abc.supabase.co` lanza `/Seed bloqueado/`); `permite remoto con ALLOW_REMOTE_SEED=true`.
  - `dates.test.ts` con `now = 2026-10-02T10:00:00Z` (viernes) y `Europe/Madrid`: `upcoming` = `2026-10-06T16:00:00Z–17:15:00Z` y `2026-10-08T16:00:00Z–17:15:00Z`; `game` = `2026-10-03T08:30:00Z–10:00:00Z`; `past` = 1 oct, 29 sep, 24 sep y 22 sep a las `16:00:00Z`. Caso cambio de hora con `now = 2026-10-23T10:00:00Z`: `upcoming[0].startsAt = 2026-10-27T17:00:00Z`, `game.startsAt = 2026-10-24T08:30:00Z`.
  - `seed.int.test.ts` (Supabase local): tras `runSeed` dos veces, `organizations` = 2, `people` de Arcángel = 19, `events` de Alevín A = 7, `auth.users` con dominio `.test` = 6, y cada usuario con club tiene su membresía con `person_id`.
- [ ] **Step 2:** `pnpm test scripts/seed` → FAIL.
- [ ] **Step 3:** Implementar. `seed.ts` llama a `assertSeedTarget` antes de nada; usuarios con `auth.admin.createUser({ email, email_confirm: true })` si no existen; todo lo demás (incluidas las membresías con su `person_id`) con `upsert` sobre ids `seedId(...)`; los eventos se recalculan con `seedSchedule(new Date(), tz)` en cada ejecución.
- [ ] **Step 4:** `pnpm test` y `pnpm test:int` → PASS. `pnpm seed` dos veces seguidas sin errores.
- [ ] **Step 5: Commit** `feat(seed): Arcángel y Club Demo con fechas relativas`

---

### Task 7: Acceso por código y selector de club

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/session.ts`, `src/proxy.ts`, `src/modules/auth/actions.ts`, `src/modules/auth/actions.test.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/login-form.tsx`, `src/app/auth/sign-out/route.ts`, `src/app/select-club/page.tsx`, `e2e/helpers/auth.ts`, `e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `Database`; usuarios del seed (Task 6).
- Produces: `createClient(): Promise<SupabaseClient<Database>>` (cookies, `@supabase/ssr`); `updateSession(request: NextRequest): Promise<NextResponse>`; `type LoginState = { step: 'email' | 'code'; email?: string; error?: string; info?: string }`; `requestLoginCode(prev: LoginState, formData: FormData): Promise<LoginState>`; `verifyLoginCode(prev: LoginState, formData: FormData): Promise<LoginState>` (redirige a `/select-club` si va bien); e2e `loginAs(page: Page, email: string): Promise<void>`.

Copy exacto: título «Entra en tu club»; campo «Email»; botón «Enviar código»; info tras pedirlo «Si tu email tiene acceso, te hemos enviado un código de 6 dígitos.»; email inválido «Escribe un email válido.»; campo «Código»; botón «Entrar»; enlace «Usar otro email»; código erróneo «El código no es válido o ha caducado. Pide uno nuevo.». Selector sin clubes: «Tu cuenta no tiene acceso a ningún club» + «Si crees que es un error, pide una nueva invitación a tu club.» + botón «Salir».

Reglas: el proxy redirige a `/login` cualquier `/c/*` o `/select-club` sin sesión y refresca la sesión en el resto. `/select-club`: una membresía activa → `redirect('/c/{slug}')`; varias → lista de `ListRow` (nombre del club); ninguna → estado vacío anterior. `/auth/sign-out` (POST) cierra sesión y redirige a `/login`.

- [ ] **Step 1: Tests que fallan** `actions.test.ts` (mock de `createClient`):
  - `pide el código sin crear usuarios`: `signInWithOtp` recibe `{ email: 'alex@arcangel.test', options: { shouldCreateUser: false } }`; devuelve `{ step: 'code', email, info: <copy> }`.
  - `misma respuesta si el email no existe` (Review Focus 2): con `signInWithOtp` devolviendo `{ error: { message: 'Signups not allowed for otp' } }`, el resultado es idéntico al anterior.
  - `email inválido`: `'no-es-email'` → `{ step: 'email', error: 'Escribe un email válido.' }` y `signInWithOtp` no se llama.
  - `código erróneo`: `verifyOtp` con error → `{ step: 'code', email, error: <copy> }`.
  - `código correcto`: `verifyOtp({ email, token, type: 'email' })` sin error → `redirect('/select-club')`.
- [ ] **Step 2:** `pnpm test src/modules/auth` → FAIL.
- [ ] **Step 3:** Implementar cliente, sesión, proxy, acciones (validación Zod), pantalla de login (dos pasos con `useActionState`), selector y cierre de sesión.
- [ ] **Step 4:** `e2e/helpers/auth.ts`: `loginAs` abre `/login`, envía el email, obtiene el código con `createAdminClient().auth.admin.generateLink({ type: 'magiclink', email })` → `data.properties.email_otp`, lo escribe y envía. `e2e/auth.spec.ts`:
  - `el entrenador entra y aterriza en su club` → `loginAs('alex@arcangel.test')`, URL `/c/arcangel`.
  - `un usuario sin club ve el aviso` → `sin.club@clubos.test` ve «Tu cuenta no tiene acceso a ningún club».
  - `sin sesión no se entra en un club` → `/c/arcangel` redirige a `/login`.
- [ ] **Step 5:** `pnpm test && pnpm test:e2e e2e/auth.spec.ts` → PASS. (El primer test e2e necesita la Task 8 para la página del club; si se ejecuta antes, basta con comprobar la URL.)
- [ ] **Step 6: Commit** `feat(auth): acceso por código solo para invitados`

---

### Task 8: Contexto de club, marca y navegación

**Files:**
- Create: `src/modules/tenancy/branding.ts`, `branding.test.ts`, `navigation.ts`, `navigation.test.ts`, `queries.ts`; `src/ui/icons.tsx`, `src/ui/app-shell.tsx`, `src/ui/top-navigation.tsx`, `src/ui/bottom-navigation.tsx`, `src/ui/bottom-navigation.test.tsx`; `src/app/c/[club]/layout.tsx`, `not-found.tsx`, `way/page.tsx`, `train/page.tsx`, `games/page.tsx`, `team/page.tsx`; `e2e/tenancy.spec.ts`
- Reference: `design/components/{AppShell,TopNavigation,BottomNavigation}/`

**Interfaces:**
- Consumes: `createClient` (Task 7); tablas de tenancy (Task 3).
- Produces:
  - `type Terminology = { way?: string; standards?: string }`
  - `type BrandColors = { accent: string; accentPressed: string; onAccent: string; accentSoft: string }`
  - `type Branding = { displayName: string; wordmarkSub: string | null; shortName: string; wayName: string; tagline: string | null; colors: BrandColors; terminology: Terminology }`
  - `PLATFORM_BRAND_COLORS: BrandColors` = `#f2eee6` / `#d9d4ca` / `#0a0a0b` / `#26262a` (los de `brand-defaults.css`)
  - `brandingToCssVars(colors: Partial<BrandColors> | null): Record<'--brand-accent' | '--brand-accent-pressed' | '--brand-on-accent' | '--brand-accent-soft', string>`
  - `type ClubContext = { org: { id: string; slug: string; name: string; timezone: string }; branding: Branding; membership: { role: 'admin' | 'coach' | 'player' | 'guardian'; personId: string | null } }`
  - `getClubContext(slug: string): Promise<ClubContext | null>` (envuelta en `cache()` de React; `null` si no existe o no es miembro)
  - `type NavKey = 'home' | 'way' | 'train' | 'games' | 'team'`; `type NavItem = { key: NavKey; label: string; href: string }`
  - `navItems(clubSlug: string, terminology: Terminology): NavItem[]`; `activeNavKey(pathname: string, clubSlug: string): NavKey`
  - `<AppShell header={ReactNode} nav={NavItem[]} clubSlug={string}>`; `<TopNavigation brand={{ displayName; wordmarkSub }} />`; `<BottomNavigation items={NavItem[]} clubSlug={string} />` (cliente, usa `usePathname`)

Reglas: el layout hace `getClubContext(params.club)` y llama a `notFound()` si es `null`; envuelve todo en `<div data-club={slug} style={brandingToCssVars(...)}>`; `export const dynamic = 'force-dynamic'`. `not-found.tsx` muestra «No encontramos esta página» y un enlace «Volver a tus clubes» a `/select-club`, igual para club ajeno y para club inexistente. Etiquetas: Inicio, `terminology.way ?? 'The Way'`, Entrenar, Partidos, Equipo; rutas `/c/{slug}`, `/way`, `/train`, `/games`, `/team`. Las cuatro pestañas sin contenido muestran `EmptyState` (Task 10) con «{etiqueta} llega en una próxima fase» y «Estamos preparando esta sección.»; hasta la Task 10 basta un texto plano.

- [ ] **Step 1: Tests que fallan**
  - `branding.test.ts`: `usa los colores válidos del club` (`#c9a45c` → `--brand-accent: '#c9a45c'`); `rechaza un color malformado` (Review Focus 5: `'red;background:url(x)'` → `'#f2eee6'`); `sin marca usa los colores de plataforma`; `acepta hex en mayúsculas`.
  - `navigation.test.ts`: `etiquetas por defecto` (5 ítems, «The Way»); `la terminología del club cambia la etiqueta` (`{ way: 'Nuestra forma' }`); `rutas con el slug`; `activeNavKey('/c/arcangel/train/abc', 'arcangel') === 'train'`; `activeNavKey('/c/arcangel', 'arcangel') === 'home'`.
  - `bottom-navigation.test.tsx`: `marca la pestaña activa con aria-current="page"` y las otras cuatro sin él.
- [ ] **Step 2:** `pnpm test src/modules/tenancy src/ui` → FAIL.
- [ ] **Step 3:** Implementar módulo, componentes (siguiendo las vistas previas de `design/components/`) y rutas.
- [ ] **Step 4:** `e2e/tenancy.spec.ts`:
  - `un club ajeno y uno inexistente dan el mismo 404` (Review Focus 1): Álex abre `/c/club-demo` y `/c/no-existe`; ambas muestran «No encontramos esta página», el texto de `main` es idéntico y ninguna contiene «Club Demo».
  - `cada club pinta su acento`: `getComputedStyle([data-club]).getPropertyValue('--brand-accent')` es `#c9a45c` para Álex y `#3fb8af` para Marta.
  - `la terminología llega a la navegación`: Marta ve la pestaña «Nuestra forma»; Álex ve «The Way».
- [ ] **Step 5:** `pnpm test && pnpm test:e2e && pnpm check:guards` → PASS.
- [ ] **Step 6: Commit** `feat(tenancy): layout de club con marca, navegación y 404 opaco`

---

### Task 9: Datos de Inicio

**Files:**
- Create: `src/lib/time.ts`, `src/lib/time.test.ts`, `src/modules/home/types.ts`, `src/modules/home/build-home.ts`, `src/modules/home/build-home.test.ts`, `src/modules/home/queries.ts`

**Interfaces:**
- Consumes: `ClubContext`, `createClient`.
- Produces:
  - `formatEventSlot(startIso: string, endIso: string, tz: string): string` → «Martes 6 oct · 18:00–19:15»
  - `formatGameSlot(startIso: string, tz: string, homeAway: 'home' | 'away' | null): string` → «Sábado 10 oct · 10:30 · Local» (o «Visitante»; sin sufijo si `null`)
  - `dayChip(iso: string, tz: string): { dow: string; day: string }` → `{ dow: 'Jue', day: '8' }`
  - `localTime(iso: string, tz: string): string` → «18:00»
  - `greeting(nowIso: string, tz: string): 'Buenos días' | 'Buenas tardes' | 'Buenas noches'` (06:00–13:59, 14:00–20:59, resto)
  - `startOfLocalDay(iso: string, tz: string): string` y `addLocalDays(iso: string, days: number, tz: string): string`
  - En `types.ts`:
    ```ts
    export type HomePractice = { eventId: string; teamName: string; slotLabel: string; title: string; totalMinutes: number; drillCount: number; focus: string[]; location: string | null };
    export type HomeGame = { eventId: string; teamName: string; slotLabel: string; opponent: string; competition: string | null };
    export type WeekItem = { eventId: string; kind: 'practice' | 'game'; dow: string; day: string; title: string; subtitle: string; time: string };
    export type HomeData = { greeting: string; firstName: string; kicker: string | null; nextPractice: HomePractice | null; nextGame: HomeGame | null; week: WeekItem[]; hasTeams: boolean };
    export type HomeEvent = { id: string; teamId: string; kind: 'practice' | 'game'; status: 'scheduled' | 'done' | 'cancelled'; startsAt: string; endsAt: string; location: string | null; plan: { title: string; focus: string[]; itemMinutes: number[] } | null; game: { opponent: string; competition: string | null; homeAway: 'home' | 'away' | null } | null };
    export type HomeInput = { firstName: string; teams: Array<{ id: string; name: string; seasonName: string }>; events: HomeEvent[] };
    ```
  - `buildHome(input: HomeInput, nowIso: string, tz: string): HomeData`
  - `getHomeData(ctx: ClubContext, nowIso: string): Promise<HomeData>`

Reglas de `buildHome`: cuentan los eventos `scheduled` con `endsAt > now` (uno en curso sigue siendo el próximo). `nextPractice`: el entrenamiento más temprano; con plan, `title` = título del plan, `totalMinutes` = suma de `itemMinutes`, `drillCount` = nº de ítems; sin plan, `title` = «Entrenamiento sin plan», `totalMinutes` = duración del evento, `drillCount` = 0. `nextGame`: el partido más temprano. `week`: eventos con `startsAt` en `[startOfLocalDay(now), addLocalDays(esa fecha, 7))`, ordenados; `title` «Entrenamiento» o «Partido»; `subtitle` = título del plan («Sin plan» si falta) o «vs {rival} · Local/Visitante», con «{equipo} · » delante si hay más de un equipo. `kicker` = «{equipo} · Temporada {temporada}» con un equipo, «{n} equipos · Temporada {temporada}» con varios, `null` sin equipos. Los nombres de días y meses salen de listas fijas en español (no de `Intl`): `Domingo…Sábado`, `Dom, Lun, Mar, Mié, Jue, Vie, Sáb`, `ene…dic`.

`getHomeData`: nombre de `people` por `membership.personId`; equipos donde esa persona es staff (con temporada); eventos de esos equipos con `ends_at > now` ordenados por `starts_at`, límite 30, con plan (título, nombres de focus, minutos de ítems) y partido. Nombres de focus por `primary_focus_id` y `secondary_focus_id`. Sin tests propios: la cubre el e2e de la Task 11.

- [ ] **Step 1: Tests que fallan**
  - `time.test.ts`: `formatEventSlot('2026-10-06T16:00:00Z', '2026-10-06T17:15:00Z', 'Europe/Madrid') === 'Martes 6 oct · 18:00–19:15'`; cambio de hora (Review Focus 4): `formatEventSlot('2026-10-27T17:00:00Z', '2026-10-27T18:15:00Z', 'Europe/Madrid') === 'Martes 27 oct · 18:00–19:15'`; otra zona: el primer instante en `America/Mexico_City` → `'Martes 6 oct · 10:00–11:15'`; `dayChip('2026-10-08T16:00:00Z', 'Europe/Madrid')` → `{ dow: 'Jue', day: '8' }`; `greeting` a las `05:30Z`, `12:30Z` y `19:30Z` del 6 oct → días, tardes, noches; `formatGameSlot('2026-10-10T08:30:00Z', 'Europe/Madrid', 'home') === 'Sábado 10 oct · 10:30 · Local'`.
  - `build-home.test.ts` (con `now = 2026-10-02T10:00:00Z`): `elige el próximo entrenamiento y suma minutos y ejercicios` (75 min, 5, slot del martes 6); `un entrenamiento en curso sigue siendo el próximo`; `ignora cancelados y pasados`; `esta semana son 7 días locales desde hoy` (incluye sáb 3, mar 6 y jue 8; excluye un evento el viernes 9 a las 18:00 local); `semana que cruza el cambio de hora` (`now = 2026-10-23T10:00:00Z`: incluye `2026-10-27T17:00:00Z` y `2026-10-29T17:00:00Z` con hora «18:00»; excluye `2026-10-29T23:30:00Z`, que ya es día 30 en Madrid); `sin equipos: hasTeams false y todo vacío`; `sin plan: título por defecto y minutos del evento`; `con dos equipos el subtítulo lleva el equipo delante`.
- [ ] **Step 2:** `pnpm test src/lib src/modules/home` → FAIL.
- [ ] **Step 3:** Implementar con `TZDate` de `@date-fns/tz`.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5: Commit** `feat(home): datos de Inicio con zona horaria del club`

---

### Task 10: Componentes de Inicio

**Files:**
- Create: `src/ui/card.tsx`, `cta-button.tsx`, `list-row.tsx`, `avatar.tsx`, `section-header.tsx`, `hero.tsx`, `practice-card.tsx`, `game-card.tsx`, `states.tsx` y tests `avatar.test.tsx`, `practice-card.test.tsx`, `game-card.test.tsx`, `states.test.tsx`, `cta-button.test.tsx`
- Reference: `design/components/<Comp>/preview.html` y `README.md` de cada uno (estructura, estados y copy); `design/components/bundle.css` como guía de medidas, traducida a utilidades Tailwind sobre tokens

**Interfaces:**
- Consumes: `HomePractice`, `HomeGame`, `WeekItem` (Task 9).
- Produces:
  - `Card({ variant?: 'default' | 'spotlight' | 'flush'; className?: string; children })`
  - `CTAButton({ variant: 'primary' | 'secondary' | 'ghost' | 'on-spotlight'; size?: 'md' | 'live'; block?: boolean; href?: string; icon?: ReactNode; children, ...buttonProps })` (`<a>` si hay `href`)
  - `ListRow({ href: string; lead: ReactNode; title: string; subtitle?: string; trail?: ReactNode })`, `DateChip({ dow: string; day: string })`
  - `initials(name: string): string`; `Avatar({ name: string; size?: 'sm' | 'md' | 'lg'; number?: string })`
  - `SectionHeader({ title: string; action?: { label: string; href: string } })`
  - `Hero({ kicker: string | null; title: string })`
  - `PracticeCard({ practice: HomePractice; href: string })`
  - `teamAbbr(name: string): string`; `GameCard({ game: HomeGame; ownShortName: string })`
  - `EmptyState({ icon?: ReactNode; title: string; body: string; action?: { label: string; href: string } })`, `LoadingState({ rows?: number })`, `ErrorState({ title: string; body: string; onRetry?: () => void })`

Reglas: `PracticeCard` es la card `spotlight` con kicker «Próximo entrenamiento», slot, título, meta «{min} min · {n} ejercicios» («1 ejercicio» en singular; «Sin ejercicios todavía» con 0) y « · {lugar}» si existe, etiquetas de focus y CTA `on-spotlight` «Abrir entrenamiento». `GameCard`: kicker «Próximo partido», avatar con `ownShortName` en acento, «vs», avatar con `teamAbbr(rival)`, slot centrado. `teamAbbr` = tres primeras letras en mayúsculas de la última palabra, sin acentos. Ningún componente usa hex ni un nombre de club.

- [ ] **Step 1: Tests que fallan**
  - `avatar.test.tsx`: `initials('Álex Prieto') === 'ÁP'`, `initials('Hugo') === 'H'`, `initials('  ') === '?'`; `Avatar` con `aria-label` igual al nombre.
  - `practice-card.test.tsx`: muestra «Martes 6 oct · 18:00–19:15», el título, «75 min · 5 ejercicios · Pabellón 2», las etiquetas y un enlace «Abrir entrenamiento» con el `href`; con `drillCount: 1` → «1 ejercicio»; con `0` → «Sin ejercicios todavía».
  - `game-card.test.tsx`: `teamAbbr('CB Ribera') === 'RIB'`, `teamAbbr('Club Demo') === 'DEM'`, `teamAbbr('Ávila') === 'AVI'`; renderiza «vs» y el slot.
  - `states.test.tsx`: `EmptyState` con acción renderiza el enlace; `LoadingState` tiene `aria-busy="true"`; `ErrorState` con `onRetry` muestra «Reintentar».
  - `cta-button.test.tsx`: con `href` renderiza `<a>`; `primary` lleva `bg-brand-accent`.
- [ ] **Step 2:** `pnpm test src/ui` → FAIL.
- [ ] **Step 3:** Implementar los componentes.
- [ ] **Step 4:** `pnpm test && pnpm check:guards` → PASS.
- [ ] **Step 5: Commit** `feat(ui): componentes de Inicio del design system`

---

### Task 11: Pantalla de Inicio y cierre de fase

**Files:**
- Create: `src/app/c/[club]/page.tsx`, `loading.tsx`, `error.tsx`, `e2e/home.spec.ts`
- Modify: placeholders de pestañas para usar `EmptyState`

**Interfaces:**
- Consumes: `getClubContext`, `getHomeData`, componentes de las Tasks 8 y 10, `seedSchedule` y `formatEventSlot` (en el e2e, para calcular lo esperado).

Orden de la pantalla: `Hero` («{saludo}, {nombre}.» y kicker) → `PracticeCard` (href `/c/{slug}/train` hasta la Fase 4) o `EmptyState` «No hay entrenamientos programados» → `GameCard` si hay partido → `SectionHeader` «Esta semana» + `ListRow` por `WeekItem` (o «No hay nada más esta semana.»). Sin equipos: solo `Hero` y `EmptyState` «Aún no estás en ningún equipo» / «Cuando dirección te asigne un equipo, aquí verás tus entrenamientos y partidos.». `loading.tsx` → `LoadingState`; `error.tsx` → `ErrorState` «No se pudo cargar tu inicio» / «Revisa la conexión y vuelve a intentarlo.» con `reset`.

- [ ] **Step 1: E2E que falla** `e2e/home.spec.ts` (tras `pnpm seed`; lo esperado se calcula con `seedSchedule(new Date(), 'Europe/Madrid')`):
  - `el entrenador ve su próximo entrenamiento`: Álex ve «Próximo entrenamiento», «Transición + rebote defensivo», «75 min · 5 ejercicios · Pabellón 2» y `formatEventSlot(upcoming[0])`.
  - `ve el próximo partido y su semana`: «Ribera» y al menos una fila «Partido» en «Esta semana».
  - `la entrenadora de Benjamín A solo ve lo suyo` (Review Focus 3): Nora ve «Bote y control» y la página no contiene «Transición + rebote defensivo».
  - `dirección sin equipo ve el estado vacío`: Raúl ve «Aún no estás en ningún equipo».
  - `cabe en el móvil`: a 375 px, `document.documentElement.scrollWidth <= 375` y la navegación inferior visible; captura en `test-results/home-375.png`.
  - `áreas táctiles de 44 px`: cada enlace de la navegación inferior y el CTA tienen `boundingBox().height >= 44`.
  - `sin errores de consola` en todas las pantallas recorridas (el test falla con cualquier `console.error`).
- [ ] **Step 2:** `pnpm test:e2e e2e/home.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar `page.tsx`, `loading.tsx`, `error.tsx` y los placeholders.
- [ ] **Step 4:** Cierre de fase: `pnpm lint && pnpm typecheck && pnpm check:guards && pnpm test && pnpm test:db && pnpm test:int && pnpm test:e2e` → todo en verde. Revisión manual en un móvil real (`pnpm dev` + túnel o red local) con Álex, Nora, Marta y Raúl: marca, navegación, aislamiento y textos.
- [ ] **Step 5: Commit** `feat(home): Inicio del entrenador` y abrir PR de la Fase 1.

---

### Task 12: Entorno remoto (preview)

**Files:**
- Modify: `.github/workflows/ci.yml` (job opcional de deploy), `.env.example`

- [ ] **Step 1:** Crear el proyecto Supabase en `eu-central-1`; `supabase link` y `supabase db push`; en Auth, desactivar el registro abierto y subir la plantilla del código.
- [ ] **Step 2:** Proyecto en Vercel con región de funciones `fra1` y las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (la clave de servicio no se configura en Vercel).
- [ ] **Step 3:** Seed del entorno de demo con `ALLOW_REMOTE_SEED=true pnpm seed` apuntando al proyecto remoto (solo demo; nunca con datos reales).
- [ ] **Step 4:** Verificación: abrir la URL de preview en el móvil, entrar como `alex@arcangel.test` (código por email real o generado desde el panel) y comprobar Inicio; ejecutar `pnpm test:e2e e2e/tenancy.spec.ts` contra la URL de preview con `BASE_URL`.
- [ ] **Step 5: Commit** `chore: entorno de preview en la UE`
