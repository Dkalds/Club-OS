# CLUB OS · Fase 2 (The Way y metodología) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dirección redacta, ordena y publica la metodología de su club desde Gestión, y cada entrenador la consulta en la pestaña The Way viendo solo lo publicado de su club.

**Architecture:** Cinco tablas con RLS (los miembros leen lo publicado; el admin lee todo y escribe) y tres funciones SQL `security invoker` para las escrituras atómicas. El entrenador lee con Server Components; la gestión (`/c/[club]/admin`, de escritorio) escribe con Server Actions que devuelven `ActionResult<T>`. Markdown sin HTML crudo y con lista blanca.

**Tech Stack:** `react-markdown` (nuevo) + lo de la Fase 1.

**Spec:** `docs/spec/club-os-primera-entrega.md` + `docs/superpowers/plans/2026-10-03-00-contratos-entre-fases.md`

**Requiere:** Fase 1 terminada.

**Dentro de esta fase:** tablas, funciones y seed de metodología, base de escrituras, pestaña The Way, menú de cuenta y Gestión. **Fuera:** enlaces de ejercicios y `StandardBadge` en ejercicios, sesiones y objetivos (Fases 3, 4, 6); resumen de Gestión, cobertura y marca (Fase 7; `/admin` redirige a `/admin/way`); imágenes, versiones y borrado físico.

## Global Constraints

- TypeScript `strict: true`, sin `any` explícito. `SUPABASE_SERVICE_ROLE_KEY` solo en `scripts/` y `e2e/`.
- Toda tabla de club: `organization_id uuid not null`, RLS, `unique (organization_id, id)` si se referencia, FKs compuestas, `revoke all … from anon`; políticas con `(select auth.uid())`.
- `src/` no contiene `Arcángel`, `Arcangel` ni `c9a45c`; los tests de `src/` usan datos neutros (`club-a`, `club-b`, colores que no sean de ningún club del seed).
- Ningún hex ni medida suelta en componentes (todo vía tokens). Copy en español, tuteo, sin exclamaciones ni emoji. Viewport 375×812; táctiles ≥ 44 px.
- Migraciones `20261020000100_methodology.sql` y `20261020000200_methodology_functions.sql`. Funciones en `public`, `plpgsql security invoker set search_path = ''`, `execute` solo para `authenticated`; errores `raise exception 'NOT_FOUND' using errcode = 'P0002'`, `'STALE_COPY'` (`P0001`), `'INVALID'` (`22023`).
- Las consultas del entrenador filtran siempre por `organization_id = ctx.org.id` y `status = 'published'`, aunque RLS deje ver más.
- Cada `page.tsx` de `/admin` llama a `requireClub` y `requireAdmin`. Las Server Actions reciben `(clubSlug: string, input)`, llaman a `requireClub(clubSlug)`, validan `input` con Zod y comprueban `can(ctx, 'way.manage')` o devuelven `NOT_FOUND` sin tocar la BD; en inserts, `organization_id = ctx.org.id`.
- Sin borrado físico salvo `principle_points`: «archivar» es pasar a borrador.
- `expectedUpdatedAt` viaja como string tal cual lo devuelve PostgREST (con microsegundos); nunca pasa por `Date`.
- Número de sección = posición en Gestión (un borrador intermedio deja hueco al entrenador, a propósito); número de Standard = el que elige dirección, único por club. Ambos se pintan «03».
- Errores: `SAVE_FAILED` y `STALE_COPY`, copy del contrato; `INVALID` «Revisa los campos marcados.»; `NOT_FOUND` «No encontramos este contenido.».
- Gestión: barra lateral desde `lg` (1024 px); tokens nuevos `admin-nav` (240px) y `admin-content-max` (960px).

## Review Focus

1. Markdown malicioso (`<script>`, `<img onerror>`, `[x](javascript:…)`, `[x](data:…)`): solo elementos de la lista blanca y enlaces `http(s)`/`mailto`; el texto se conserva. → Task 6 (unidad).
2. Un entrenador abre por URL directa una sección en borrador: mismo 404 opaco que un slug inexistente; la BD no le da la fila ni los puntos de un principio en borrador. → Task 1 (pgTAP) y Task 8 (e2e).
3. Un admin del club B escribe en el A: el insert con `organization_id` de A da `42501`, el update de una fila de A afecta a 0 filas y las funciones dan `NOT_FOUND`. → Tasks 1 y 2 (pgTAP).
4. Dos admins editan la misma sección: el segundo guardado (con `expectedUpdatedAt` viejo) recibe `STALE_COPY` y queda el texto del primero. → Task 2 (pgTAP), Task 9 (unidad), Task 10 (e2e).
5. Club sin nada publicado: The Way muestra el `Hero` y «Tu club todavía no ha publicado su metodología», sin error. → Task 8 (componente).

---

## Estructura de ficheros

```
design/tokens.json  + admin-nav, admin-content-max (src/ui/tokens.css regenerado)
supabase/migrations/, supabase/tests/database/  methodology (tablas + RLS), methodology_functions (RPC)
scripts/seed/data.ts, scripts/seed.ts, seed.int.test.ts  metodología de los dos clubes
scripts/check-guards.sh, playwright.config.ts  guard de admin; proyecto admin
src/lib/action-result.ts, guards.ts, permissions.ts  base de escrituras
src/modules/methodology/  tipos, formato, slugs, orden, consultas, acciones
src/modules/tenancy/  etiquetas, nav de admin, nombre del usuario
src/ui/  Markdown, bloques de metodología, menú, AdminShell, campos
src/app/c/[club]/(app)/  rutas de la Fase 1 movidas + way/, way/[section], way/standards
src/app/c/[club]/admin/  Gestión (layout, way, values, principles, standards)
e2e/way.spec.ts, e2e/admin.spec.ts
```

---

### Task 1: Tablas de metodología con RLS

**Files:**
- Create: `supabase/migrations/20261020000100_methodology.sql`, `supabase/tests/database/methodology.test.sql`

**Interfaces:**
- Consumes: `private.is_member`, `private.has_org_role`, `tests.*` (Fase 1).
- Produces: enum `public.content_status ('draft','published')`; cinco tablas con `id` uuid, `organization_id not null references organizations on delete cascade` y `created_at`; las cuatro primeras con `sort int not null default 0` y `status content_status not null default 'draft'`; todo `not null` salvo lo marcado «null»; longitudes con `check (char_length(…))`:
  - `way_sections`: `number smallint not null check (number between 1 and 99)`, `slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60 and slug <> 'standards')`, `title` (1–80), `summary` (≤ 200, null), `body_md text not null default ''` (≤ 20000), `content_kind text default 'text' check (content_kind in ('text','values','principles','standards'))`, `updated_at timestamptz not null default now()`, `updated_by uuid references auth.users default auth.uid()` (null); `unique (organization_id, slug)`; índice `(organization_id, sort)`.
  - `club_values`: `code` (1–40), `title` (≤ 80, null), `description` (1–500).
  - `game_principles`: `slug` (mismo formato, sin reserva), `title` (1–80), `summary` (≤ 300, null); únicos `(organization_id, slug)` y `(organization_id, id)`.
  - `standards`: `number smallint` (1–99), `title` (1–80), `description` (1–500); únicos `(organization_id, number)` y `(organization_id, id)`.
  - `principle_points`: `principle_id uuid not null`, `text` (1–200), `sort int not null`; FK `(organization_id, principle_id) → game_principles on delete cascade`; índice `(principle_id, sort)`.

Políticas: `select` = `(status = 'published' and private.is_member(organization_id)) or private.has_org_role(organization_id, '{admin}')`; en `principle_points`, admin o principio padre publicado y miembro. `insert` (`with check`) y `update` (`using` + `with check`) = admin del `organization_id`. `delete` solo en `principle_points` (admin).

- [ ] **Step 1: Test que falla** `methodology.test.sql`. Club A con `adminA` y `coachA` (sin equipo: la metodología es de todo el club) y club B con `adminB` y `coachB`. En A: secciones `pub-a` y `draft-a`; un valor publicado y otro no; `pub-p` publicado (2 puntos) y `draft-p` en borrador (1); Standards 1 publicado y 2 en borrador. En B: `pub-b` y Standard 1 publicados.
  - `coachA solo ve lo publicado de su club`: secciones {`pub-a`}; 1 valor; principios {`pub-p`}; 2 puntos; Standards {1}.
  - `coachA no ve un borrador aunque lo pida` (Review Focus 2): `is_empty` de `draft-a` por slug y de los puntos de `draft-p`.
  - `adminA ve los borradores de A y nada de B`: secciones {`pub-a`, `draft-a`}; Standards {1, 2}.
  - `ningún coach ve el otro club` (cinco tablas); sin club, nada; `anon` → `42501`.
  - `coachA no escribe`: insert de sección → `42501`; update de `pub-a` → 0 filas.
  - `adminB no escribe en A` (Review Focus 3): insert de sección con `organization_id` de A → `42501`; update de `pub-a` → 0 filas; insert de punto `(organization_id = B, principle_id = <pub-p>)` → `23503`.
  - `adminA no saca una fila de su club`: `update … set organization_id = <B>` → `42501`.
  - `nadie borra contenido`: `delete` de adminA en las cuatro tablas con `status` → 0 filas; de un punto → 1.
  - `checks`: Standard 1 repetido → `23505`; slug `standards`, `body_md` de 20001 caracteres y título vacío → `23514`; slug `pub-a` en B → `lives_ok`.
- [ ] **Step 2:** `pnpm supabase db reset && pnpm test:db` → FAIL.
- [ ] **Step 3:** Escribir la migración.
- [ ] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS. `pnpm db:types`.
- [ ] **Step 5: Commit** `feat(db): metodología con RLS de lectura y escritura`

---

### Task 2: Funciones de escritura atómica

**Files:**
- Create: `supabase/migrations/20261020000200_methodology_functions.sql`, `supabase/tests/database/methodology_functions.test.sql`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `public.update_way_section(p_id uuid, p_expected_updated_at timestamptz, p_title text, p_summary text, p_content_kind text, p_body_md text) returns timestamptz`
  - `public.reorder_methodology(p_org uuid, p_kind text, p_ids uuid[]) returns void`
  - `public.save_game_principle(p_id uuid, p_title text, p_summary text, p_points text[]) returns void`

Reglas, en este orden:
- `update_way_section`: (1) fila no visible o usuario no admin → `NOT_FOUND` (un coach no recibe `STALE_COPY`); (2) `update … set …, updated_at = now(), updated_by = (select auth.uid()) where id = p_id and updated_at = p_expected_updated_at returning updated_at`; (3) sin fila → `STALE_COPY`.
- `reorder_methodology`: `p_kind` fuera de las cuatro tablas con `status` → `INVALID`; no admin de `p_org` → `NOT_FOUND`; `p_ids` (sin duplicados) distinto del conjunto de filas del club → `STALE_COPY`; si no, `sort = ordinality` (y `number` en secciones), con una rama estática por tabla y sin tocar `updated_at`.
- `save_game_principle`: no visible o no admin → `NOT_FOUND`; más de 12 puntos → `INVALID`; actualiza título y resumen y reemplaza los puntos (`sort = ordinality`, `organization_id` del principio).

- [ ] **Step 1: Test que falla** `methodology_functions.test.sql` (fixtures de la Task 1 más secciones `s1`, `s2`, `s3` en A):
  - `guardar devuelve un updated_at mayor` y cambia el título (adminA).
  - `copia obsoleta` (Review Focus 4): dos llamadas con el mismo `p_expected_updated_at`; la segunda → `throws_ok(..., 'P0001', 'STALE_COPY')` y queda el título de la primera.
  - `un coach no edita`: coachA sobre `pub-a` → `P0002`.
  - `adminB no toca A` (Review Focus 3): `update_way_section(<pub-a>)`, `reorder_methodology(<A>, 'way_sections', <ids de A>)` y `save_game_principle(<pub-p>)` → `P0002`.
  - `reordenar renumera`: `[s3, s1, s2]` → `sort` y `number` 1, 2, 3 en ese orden, `updated_at` intacto; lista incompleta → `P0001` sin cambios; tipo `'people'` → `22023`.
  - `guardar principio reemplaza los puntos`: `['A','B','C']` → textos por `sort` A, B, C y los anteriores borrados; 13 puntos → `22023`; punto de 201 caracteres → `23514`.
- [ ] **Step 2:** `pnpm test:db` → FAIL.
- [ ] **Step 3:** Escribir las funciones con sus `grant`/`revoke`.
- [ ] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS. `pnpm db:types`.
- [ ] **Step 5: Commit** `feat(db): escrituras atómicas de metodología con copia obsoleta`

---

### Task 3: Seed de metodología

**Files:**
- Modify: `scripts/seed/data.ts`, `scripts/seed.ts` (`runSeed`), `scripts/seed/seed.int.test.ts`

**Interfaces:**
- Consumes: `seedId`, `runSeed`, `ARCANGEL`, `CLUB_DEMO` (Fase 1).
- Produces: en cada fixture, `methodology: { sections; values; principles; standards }` con los campos de la Task 1 en camelCase (principios con `points: string[]`). Ids `seedId(org, 'way:<slug>' | 'value:<code>' | 'principle:<slug>' | 'point:<slug>:<n>' | 'standard:<n>')`. Todo publicado; `number` y `sort` = posición; `slug = slugify(title)` (`el-jugador-arcangel`, `como-jugamos`…; principios `defensa`, `transicion`, `rebote`, `ataque`).

| Club | Contenido |
| --- | --- |
| Arcángel · secciones | 01 «Nuestra cultura» (`values`, «Lo que nos une dentro y fuera de la pista.») · 02 «El jugador Arcángel» (`text`, «Qué esperamos de cada jugador.») · 03 «Cómo jugamos» (`principles`, «Nuestros principios de juego.») · 04 «Cómo entrenamos» (`text`, «Cómo son nuestras sesiones.») · 05 «Cómo competimos» (`standards`, «Lo que exigimos en cada partido.») |
| Cuerpos | 02: «Queremos jugadores que **compiten**, **aprenden** y **ayudan** al equipo.» + `### Lo que esperamos` con «Llega puntual.» / «Escucha y lo vuelve a intentar.» / «Anima desde el banquillo.» · 04: «Entrenamos como competimos: **intensidad** y pocas paradas.» + `### Una sesión tipo` con «Activación.» / «Técnica.» / «Táctica.» / «Competición.» numerados |
| Arcángel · valores | «TEAM FIRST» «El equipo está por delante del individuo.» · «EFFORT» «El esfuerzo no es negociable.» · «RESPECT» «Respeto a compañeros, entrenadores, rivales, árbitros y mesa.» (sin título) |
| Arcángel · principios | «Defensa» «Defensa arriba y presionante.» · «Transición» «Nuestra primera opción es correr.», punto «El balón busca al jugador más adelantado.» · «Rebote» «La posesión defensiva termina cuando controlamos el balón.» · «Ataque» (sin resumen): «Espacios», «Pase», «1x1», «2x2», «Pasar y cortar», «Toma de decisiones» |
| Arcángel · Standards | 01 «TEAM FIRST» «Celebramos el pase extra y la ayuda.» · 02 «EFFORT IS NON-NEGOTIABLE» «En cada posesión, en cada ejercicio.» · 03 «FINISH THE POSSESSION» «La defensa acaba cuando cogemos el rebote.» · 04 «FIRST LOOK FORWARD» «Al recuperar, la primera mirada va hacia delante.» · 05 «RUN WIDE» «En transición corremos por las calles laterales.» |
| Club Demo | 01 «Quiénes somos» (`text`, «Nuestra manera de entender el baloncesto.», cuerpo «Somos un club de barrio que **forma personas**.») · 02 «Nuestros Standards» (`standards`). Standards 01 «DEFENDER JUNTOS» «Nadie defiende solo.» · 02 «COMPARTIR EL BALÓN» «El mejor tiro es el del compañero liberado.» |

- [ ] **Step 1: Test que falla** — ampliar `seed.int.test.ts` (tras `runSeed` dos veces): `Arcángel tiene su metodología` (`way_sections` 5, `club_values` 3, `game_principles` 4, `principle_points` 7, `standards` 5, todo `published`); `Club Demo tiene la suya` (secciones 2, Standards 2, valores y principios 0); `orden del seed` (la sección 3 es `como-jugamos`; los puntos de `ataque` van de «Espacios» a «Toma de decisiones»).
- [ ] **Step 2:** `pnpm test:int` → FAIL.
- [ ] **Step 3:** Datos y `upsert` en `runSeed`.
- [ ] **Step 4:** `pnpm seed` dos veces; `pnpm test:int && pnpm check:guards` → PASS.
- [ ] **Step 5: Commit** `feat(seed): metodología de Arcángel y Club Demo`

---

### Task 4: Base de escrituras: ActionResult, guards y permisos

**Files:**
- Create: `src/lib/action-result.ts`, `guards.ts`, `permissions.ts` y sus `.test.ts`

**Interfaces:**
- Consumes: `ClubContext`, `getClubContext` (Fase 1); `notFound`.
- Produces:
  - `type ActionError = 'SAVE_FAILED' | 'STALE_COPY' | 'INVALID' | 'NOT_FOUND'` (las fases siguientes amplían la unión y `ACTION_ERROR_COPY` aquí; único traductor de errores de BD); `ActionResult<T>` como en el contrato; `ACTION_ERROR_COPY: Record<ActionError, string>`
  - `ok<T>(data: T): ActionResult<T>`; `fail(error: ActionError, fieldErrors?: Record<string, string>): ActionResult<never>`
  - `fromZodError(error: ZodError): ActionResult<never>` (`INVALID`, primer mensaje por campo)
  - `fromDbError(error: { code?: string; message?: string }, unique?: { field: string; message: string }): ActionResult<never>`: `P0001` cuyo mensaje sea un `ActionError` → ese código (`STALE_COPY` y los que añadan otras fases); `P0002` o `42501` → `NOT_FOUND`; `23505` → `INVALID` (con `fieldErrors = { [unique.field]: unique.message }` si llega `unique`); `23514` o `22023` → `INVALID`; otro → `SAVE_FAILED`
  - `requireClub(slug: string): Promise<ClubContext>`; `requireAdmin(ctx: ClubContext): void`
  - `type Action = 'way.manage' | 'admin.access'`; `can(ctx: ClubContext, action: Action): boolean` (ambas = `role === 'admin'`)

- [ ] **Step 1: Tests que fallan**
  - `action-result.test.ts`: cada caso de `fromDbError`, incluido `{ code: 'P0001', message: 'STALE_COPY' }` → `STALE_COPY` y `{ code: 'P0001', message: 'OTRA_COSA' }` → `SAVE_FAILED`; `fromZodError` de `z.object({ title: z.string().min(1, 'Escribe un título.') })` con `''` → `{ ok: false, error: 'INVALID', fieldErrors: { title: 'Escribe un título.' } }`.
  - `permissions.test.ts`: admin → `true` en las dos acciones, coach → `false`; `guards.test.ts` (mocks): `requireClub` devuelve el contexto o llama a `notFound`; `requireAdmin` llama a `notFound` con coach y no con admin.
- [ ] **Step 2:** `pnpm test src/lib` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5: Commit** `feat(lib): ActionResult, guards y permisos`

---

### Task 5: Módulo de metodología: tipos, formato y consultas

**Files:**
- Create: `src/modules/methodology/types.ts`, `format.ts`, `slug.ts`, `order.ts` (+ tests de los tres), `queries.ts`, `admin-queries.ts`
- Modify: `src/modules/tenancy/navigation.ts` (+ test)

**Interfaces:**
- Consumes: `ClubContext`, `createClient`, `Terminology` (Fase 1).
- Produces (en `types.ts`, `string` salvo indicación):
  - `ContentStatus = 'draft' | 'published'`; `ContentKind = 'text' | 'values' | 'principles' | 'standards'`; `MethodologyKind = 'way_sections' | 'club_values' | 'game_principles' | 'standards'`
  - `WaySection { id; number: number; slug; title; summary: string | null; bodyMd; contentKind: ContentKind; status: ContentStatus; updatedAt }`
  - `ClubValue { id; code; title: string | null; description; status }`; `PrinciplePoint { id; text }`; `GamePrinciple { id; slug; title; summary: string | null; status; points: PrinciplePoint[] }`
  - `Standard { id; number: number; title; description }`; `AdminStandard = Standard & { status: ContentStatus }`
  - `WayIndexEntry { id; number: number; slug; title; subtitle: string | null }`; `WaySectionView { section: WaySection; values: ClubValue[]; principles: GamePrinciple[]; standards: Standard[] }`
  - `CONTENT_KIND_LABELS: Record<ContentKind, string>` = «Texto», «Valores», «Principios», «Standards»
  - `formatStandardNumber(n: number): string`; `sectionSubtitle(kind: ContentKind, summary: string | null, counts: { values: number; principles: number; standards: number }): string | null`
  - `slugify(text: string): string`; `uniqueSlug(base: string, taken: string[], fallback: string): string`
  - `moveAt<T>(items: T[], index: number, direction: 'up' | 'down'): T[]`; `moveId(ids: string[], id: string, direction: 'up' | 'down'): string[]`
  - Entrenador (solo publicado): `getWayIndex(ctx): Promise<WayIndexEntry[]>`, `getWaySection(ctx, slug): Promise<WaySectionView | null>`, `getStandards(ctx): Promise<Standard[]>`, `getPrinciples(ctx): Promise<GamePrinciple[]>`, `getValues(ctx): Promise<ClubValue[]>`
  - Admin: `listSectionsForAdmin(ctx): Promise<WaySection[]>`, `getSectionForAdmin(ctx, id): Promise<WaySection | null>` (`null` si `id` no es uuid), `listValuesForAdmin`, `listPrinciplesForAdmin`, `listStandardsForAdmin` (→ `AdminStandard[]`)
  - `wayLabel(t: Terminology): string` (`t.way ?? 'The Way'`; `navItems` pasa a usarla); `standardsLabel(t): string` (`t.standards ?? 'Standards'`)

Reglas: orden `sort, created_at`. `sectionSubtitle`: `text` → `summary`; resto: «3 valores» / «1 valor», «4 principios» / «1 principio», «5 Standards» / «1 Standard»; 0 → «Sin contenido todavía». `getWaySection`: `null` si no existe o no está publicada; rellena solo la lista de su `contentKind`. `slugify`: minúsculas, sin acentos, el resto de caracteres → `-` sin repetir ni en los extremos, ≤ 60. `uniqueSlug`: base vacía → `fallback`; ocupado o `standards` → `-2`, `-3`…

- [ ] **Step 1: Tests que fallan**
  - `format.test.ts`: `formatStandardNumber(3) === '03'`, `(12) === '12'`; `sectionSubtitle` en cada caso, singulares y 0 incluidos.
  - `slug.test.ts`: `slugify('¿Cómo jugamos?') === 'como-jugamos'`; `slugify('  1x1  ') === '1x1'`; `uniqueSlug('como-jugamos', ['como-jugamos'], 'seccion') === 'como-jugamos-2'`; base `a` con `['a','a-2']` → `'a-3'`; `uniqueSlug('standards', [], 'seccion') === 'standards-2'`; `uniqueSlug('', [], 'seccion') === 'seccion'`.
  - `order.test.ts`: `moveId(['a','b','c'], 'b', 'up')` → `['b','a','c']`; `'a','up'`, `'c','down'` e id desconocido → sin cambios; `moveAt(['x','y'], 0, 'down')` → `['y','x']`; no muta la entrada.
  - `navigation.test.ts`: `wayLabel({})` → «The Way»; `wayLabel({ way: 'Nuestra forma' })` → «Nuestra forma»; `standardsLabel({})` → «Standards».
- [ ] **Step 2:** `pnpm test src/modules` → FAIL.
- [ ] **Step 3:** Implementar (las consultas las cubren los e2e).
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(methodology): tipos, formato y consultas`

---

### Task 6: Componentes de contenido y Markdown seguro

**Files:**
- Create: `src/ui/markdown-body.tsx`, `standard-badge.tsx`, `standard-block.tsx`, `principle-card.tsx`, `value-block.tsx`; tests `markdown-body.test.tsx`, `standard-badge.test.tsx`, `content-blocks.test.tsx`
- Modify: `package.json` (`react-markdown`)

**Interfaces:**
- Consumes: Task 5; `Card`; `design/components/StandardBadge/` (chip y bloque).
- Produces: `safeHref(url: string): string | null`; `MarkdownBody({ markdown: string })`; `StandardBadge({ number: number; title: string; href?: string })`; `StandardBlock({ standard: Standard })`; `PrincipleCard({ principle: GamePrinciple })`; `ValueBlock({ value: ClubValue })`.

Reglas:
- `safeHref`: la URL solo si `new URL(url).protocol` ∈ {`http:`, `https:`, `mailto:`}; relativas, inválidas y el resto → `null`.
- `MarkdownBody`: `react-markdown` con `skipHtml`, `allowedElements = ['p','strong','em','ul','ol','li','h3','blockquote','a']` y `unwrapDisallowed`, sin `rehype-raw` ni plugins; `components.a`: con `safeHref` `null`, solo los hijos; si no, `<a rel="noopener noreferrer">` y `target="_blank"` en `http(s)`. Texto `body-l`.
- `StandardBadge` (alto `space-8`; con `href`, mínimo `target-min`) y `StandardBlock` (`<article id="standard-NN">`, kicker «Standard») siguen la vista previa. `PrincipleCard` (`<article id="principle-{slug}">`, puntos en `ul`) y `ValueBlock` (código en `display-m`) son `Card` con texto `body-l` `ink-2`; lo opcional vacío no se pinta.

- [ ] **Step 1: Tests que fallan**
  - `markdown-body.test.tsx` (Review Focus 1): `<script>window.x=1</script>hola` → sin `script`, con «hola»; `<img src=x onerror="window.x=1">` → sin `img` ni `onerror`; `[clic](javascript:…)`, `(JAVASCRIPT:…)`, `(java\tscript:…)` y `(data:text/html,x)` → sin `a`, con «clic»; `https://…` → `a` con `rel="noopener noreferrer"` y `target="_blank"`; `mailto:` → `a`; `# Título` → sin `h1`, con «Título»; `### Sub` → `h3`; `![f](https://x.example/f.png)` → sin `img`; con todo junto, cada `tagName` del contenedor ∈ {P, STRONG, EM, UL, OL, LI, H3, BLOCKQUOTE, A}.
  - `standard-badge.test.tsx`: con `href`, un `a` con «03» y el título; sin `href`, sin `a`; lleva `bg-brand-accent-soft`.
  - `content-blocks.test.tsx`: `StandardBlock` nº 3 → `id="standard-03"`, «03», «Standard»; `PrincipleCard` con 6 puntos → 6 `li` e `id="principle-ataque"`, sin puntos sin `ul`; `ValueBlock` sin título no deja elemento vacío.
- [ ] **Step 2:** `pnpm test src/ui` → FAIL.
- [ ] **Step 3:** `pnpm add react-markdown`; implementar.
- [ ] **Step 4:** `pnpm test && pnpm check:guards` → PASS.
- [ ] **Step 5: Commit** `feat(ui): Markdown seguro y bloques de metodología`

---

### Task 7: Área de Gestión y menú de cuenta

**Files:**
- Modify: `src/app/c/[club]/layout.tsx` (solo contexto, `notFound()` y marca), `src/ui/top-navigation.tsx`, `src/modules/tenancy/navigation.ts` (+ test) y `queries.ts`, `design/tokens.json`, `src/ui/tokens.css`, `scripts/check-guards.sh`, `playwright.config.ts`
- Create: `src/app/c/[club]/(app)/layout.tsx` (AppShell) y `git mv` a `(app)/` de las rutas de la Fase 1 salvo `not-found.tsx`; `src/ui/account-menu.tsx`, `admin-shell.tsx`, `admin-nav.tsx` (+ tests); `src/app/c/[club]/admin/` (`layout`, `page`, `loading`, `error` y cuatro páginas de solo cabecera); `e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Task 4; `wayLabel`, `standardsLabel`; componentes de la Fase 1.
- Produces:
  - `TopNavigation({ brand, account?: { name: string; adminHref: string | null } })`; `AccountMenu({ name: string; adminHref: string | null })` (cliente)
  - `getViewerName(ctx: ClubContext): Promise<string>` (nombre de la persona de la membresía o «Tu cuenta»)
  - `type AdminNavItem = { label: string; href: string }`; `adminNavItems(clubSlug: string, t: Terminology): AdminNavItem[]`
  - `AdminShell({ brandName: string; clubSlug: string; items: AdminNavItem[]; children })`; `AdminNav({ items })` (cliente, `usePathname`)

Reglas:
- `AccountMenu`: botón `aria-label="Abrir menú de cuenta"` (`aria-expanded`, `Avatar`) que abre «Gestión» (si hay `adminHref`) y «Salir» (`<form method="post" action="/auth/sign-out">`); cierra con Escape (foco al botón) o al pulsar fuera. `(app)/layout.tsx` pasa `name = getViewerName(ctx)` y `adminHref = can(ctx, 'admin.access') ? '/c/{slug}/admin' : null`.
- `adminNavItems`: `wayLabel(t)` → `/c/{slug}/admin/way`, «Valores» → `…/values`, «Principios» → `…/principles`, `standardsLabel(t)` → `…/standards`.
- `AdminShell`: nombre del club, kicker «Gestión» y `ghost` «Volver a la app» → `/c/{slug}`; `<nav aria-label="Gestión">` (`aria-current="page"` si el `href` es prefijo de la ruta) y `<main>`. Bajo `lg`, pestañas desplazables encima; desde `lg`, columna `admin-nav` y contenido hasta `admin-content-max`; sin navegación inferior.
- `admin/layout.tsx`: guards + `AdminShell`; `admin/page.tsx`: guards + `redirect` a `/admin/way`; `error.tsx`: «No se pudo cargar Gestión» / «Revisa la conexión y vuelve a intentarlo.».
- `check-guards.sh` falla si un `page.tsx` bajo `src/app/c/[club]/admin/` no contiene `requireAdmin(`.
- Playwright: los e2e que modifican el seed van en el proyecto `admin` (375×812, en serie, `dependencies: ['mobile']`, `testMatch: [/admin\.spec\.ts/]`, lista que amplían las fases siguientes y que `mobile` ignora); `admin.spec.ts` usa `mode: 'serial'`.

- [ ] **Step 1: Tests que fallan**
  - `account-menu.test.tsx`: `cerrado por defecto` (`aria-expanded="false"`); `Salir es un POST a /auth/sign-out`; `dirección ve Gestión` (`href="/c/club-a/admin"`) y un entrenador no; `Escape cierra y devuelve el foco`.
  - `admin-nav.test.tsx`: en `/c/club-a/admin/standards/x` solo «Standards» lleva `aria-current="page"`.
  - `navigation.test.ts`: `adminNavItems('club-a', {})` → «The Way», «Valores», «Principios», «Standards» con `href` `/c/club-a/admin/…`; con `{ way: 'Nuestra forma', standards: 'Normas' }` cambian la primera y la última.
- [ ] **Step 2:** `pnpm test src/ui src/modules/tenancy` → FAIL.
- [ ] **Step 3:** Implementar (tokens con `pnpm tokens`).
- [ ] **Step 4:** Guard: `admin/tmp/page.tsx` sin `requireAdmin(` → `pnpm check:guards` exit 1; borrarlo → exit 0.
- [ ] **Step 5: E2E** en `e2e/admin.spec.ts`:
  - `un entrenador no entra en Gestión`: Álex en `/c/arcangel/admin/way` ve «No encontramos esta página»; su menú tiene «Salir» y no «Gestión».
  - `dirección entra desde el avatar`: Raúl → menú → «Gestión» → `/c/arcangel/admin/way`; `/c/arcangel/admin` redirige ahí.
  - `Gestión se adapta al escritorio`: a 375 px la caja de `nav[aria-label="Gestión"]` acaba encima de `main`; a 1280×800, a su izquierda.
- [ ] **Step 6:** `pnpm test && pnpm check:guards && pnpm test:e2e` → PASS (también los e2e de la Fase 1).
- [ ] **Step 7: Commit** `feat(admin): área de Gestión y menú de cuenta`

---

### Task 8: Pestaña The Way del entrenador

**Files:**
- Create: `src/ui/way-index-view.tsx` (+ test), `src/app/c/[club]/(app)/way/loading.tsx`, `error.tsx`, `[section]/page.tsx`, `standards/page.tsx`, `e2e/way.spec.ts`
- Modify: `src/app/c/[club]/(app)/way/page.tsx` (sustituye el placeholder)

**Interfaces:**
- Consumes: Tasks 4–6; componentes de la Fase 1.
- Produces: `WayIndexView({ wayName: string; tagline: string | null; sections: WayIndexEntry[]; clubSlug: string; emptyAction: { label: string; href: string } })`.

Pantallas:
- `/way`: `Hero` (título `branding.wayName`, kicker `branding.tagline`) y `Card` `flush` con un `ListRow` por sección (número en `numeral` `brand-accent`, título, `subtitle`). Sin secciones: `Hero` + `EmptyState` «Tu club todavía no ha publicado su metodología» / «Cuando dirección la publique, la verás aquí.» con acción «Ir a Gestión» → `/c/{slug}/admin/way` (admin) o «Volver a Inicio» → `/c/{slug}`.
- `/way/[section]`: `getWaySection` o `notFound()`. `ghost` con chevron y `wayLabel(terminology)` → `/way`; número, `h1`, resumen, `MarkdownBody` si hay cuerpo (introducción en las estructuradas) y `ValueBlock`, `PrincipleCard` o `StandardBlock` según `contentKind`. Vacío: «Todavía no hay valores publicados» (o «principios», «Standards») / «Cuando dirección los publique, aparecerán aquí.», o en `text` «Esta sección todavía no tiene contenido» / «Vuelve a consultarla más adelante.»; acción `wayLabel` → `/way`.
- `/way/standards`: mismo enlace de vuelta, `h1` `standardsLabel(terminology)` y `StandardBlock` de `getStandards` (vacío: como arriba).
- `loading.tsx` → `LoadingState`; `error.tsx` → `ErrorState` «No se pudo cargar la metodología» / «Revisa la conexión y vuelve a intentarlo.» con `reset`.

- [ ] **Step 1: Tests que fallan**
  - `way-index-view.test.tsx`: `club sin contenido publicado` (Review Focus 5): con `sections: []`, título del `Hero`, «Tu club todavía no ha publicado su metodología» y enlace de `emptyAction`; `lista las secciones`: «01», «03», subtítulos y `href="/c/club-a/way/como-jugamos"`.
  - `e2e/way.spec.ts` (`beforeAll` crea con `createAdminClient()` la sección `borrador-e2e` (número 99) y el Standard 98 «BORRADOR E2E», en borrador; `afterAll` los borra):
    - `el entrenador recorre The Way`: Álex pulsa «The Way» → «The Arcángel Way», «One club. One identity. One way.», filas «01»…«05», «3 valores», «4 principios», «5 Standards», «Qué esperamos de cada jugador.».
    - `principios y Standards`: «Cómo jugamos» muestra «El balón busca al jugador más adelantado.»; `/c/arcangel/way/standards#standard-03` tiene `#standard-03` visible con «FINISH THE POSSESSION» y no «BORRADOR E2E».
    - `un borrador por URL directa da el 404 opaco` (Review Focus 2): `/c/arcangel/way/borrador-e2e` y `/c/arcangel/way/no-existe` muestran «No encontramos esta página» con el mismo texto de `main`.
    - `cada club ve lo suyo con su terminología`: Marta pulsa «Nuestra forma» → «Quiénes somos» y no «Nuestra cultura»; `/c/club-demo/way/nuestros-standards` tiene «DEFENDER JUNTOS» y no «TEAM FIRST».
    - `cabe en el móvil`: en `/way` y `/way/el-jugador-arcangel`, `scrollWidth <= 375`, filas ≥ 44 px y sin `console.error`.
- [ ] **Step 2:** `pnpm test src/ui && pnpm test:e2e e2e/way.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar `WayIndexView` y las rutas.
- [ ] **Step 4:** `pnpm test && pnpm test:e2e && pnpm check:guards` → PASS.
- [ ] **Step 5: Commit** `feat(way): The Way del entrenador`

---

### Task 9: Acciones de metodología

**Files:**
- Create: `src/modules/methodology/schema.ts`, `actions.ts`, `actions.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 4 y 5; `createClient`.
- Produces (`'use server'`; firma `(clubSlug: string, input)`; abajo, el `input`):
  - `createWaySection({ title, contentKind })` → `ActionResult<{ id: string }>`
  - `updateWaySection({ id, expectedUpdatedAt: string, title, summary: string | null, contentKind, bodyMd })` → `ActionResult<{ updatedAt: string }>`
  - `setMethodologyStatus({ kind: MethodologyKind, id, status: ContentStatus })`, `moveMethodologyItem({ kind: MethodologyKind, id, direction: 'up' | 'down' })` → `ActionResult<null>`
  - `createValue({ code, title: string | null, description })`, `createPrinciple({ title, summary: string | null })`, `createStandard({ number, title, description })` → `ActionResult<{ id: string }>`
  - `updateValue({ id, … })`, `savePrinciple({ id, title, summary, points: string[] })`, `updateStandard({ id, … })` → `ActionResult<null>`
  - Esquemas Zod `<acción>Schema` en `schema.ts`

Reglas:
- Orden: Zod sobre `input` → `requireClub(clubSlug)` + `can(ctx, 'way.manage')` (si no, `fail('NOT_FOUND')`) → escritura → `revalidatePath` de `/c/{slug}/way` y `/c/{slug}/admin` (`'layout'`) → `ok`.
- Límites = checks de la Task 1; mensajes «Escribe un título.», «Máximo {n} caracteres.», «El texto es demasiado largo (máximo 20.000 caracteres).», «Escribe el código del valor.», «Escribe una descripción.», «El número tiene que estar entre 1 y 99.», «Un principio tiene como máximo 12 puntos.». `trim`; opcionales vacíos → `null`; puntos vacíos fuera; `expectedUpdatedAt` = `z.string().min(1)`.
- Altas: `status = 'draft'`, `sort = máx + 1`; en secciones, `number = máx + 1` y `slug = uniqueSlug(slugify(title), slugs del club, 'seccion')` (`'principio'` en principios). Editar nunca cambia el slug.
- `updateWaySection` → `rpc('update_way_section')`, devuelve su `updated_at` tal cual; `savePrinciple` → `rpc('save_game_principle')`.
- `setMethodologyStatus`: update de `status` por `id` y `organization_id` con `.select('id')`; 0 filas → `NOT_FOUND`.
- `moveMethodologyItem`: ids del club por `sort, created_at`, `moveId` y `rpc('reorder_methodology', { p_org: ctx.org.id, p_kind, p_ids })`; si nada cambia, `ok(null)` sin llamar.
- Standards pasan `{ field: 'number', message: 'Ya existe un Standard con ese número.' }` a `fromDbError`.

- [ ] **Step 1: Tests que fallan** `actions.test.ts` (mocks de `createClient`, `requireClub`, `revalidatePath`; llamadas como `createWaySection('club-a', { … })`):
  - `un entrenador no gestiona`: rol `coach` → `NOT_FOUND` sin llamadas al cliente.
  - `título vacío` → `INVALID`, `fieldErrors.title = 'Escribe un título.'`; cuerpo de 20001 caracteres → `INVALID` en `bodyMd`.
  - `crea con el siguiente número y un slug libre`: con `{ number: 5, slug: 'como-jugamos' }`, «Cómo jugamos» → insert con `number: 6`, `sort: 6`, `slug: 'como-jugamos-2'`, `status: 'draft'`, `organization_id` del contexto.
  - `copia obsoleta` (Review Focus 4): el RPC responde `{ code: 'P0001', message: 'STALE_COPY' }` → `{ ok: false, error: 'STALE_COPY' }`.
  - `expectedUpdatedAt viaja intacto`: `p_expected_updated_at === '2026-10-20T10:00:00.123456+00:00'`; `data.updatedAt` = lo que devuelve el RPC.
  - `Standard duplicado`: `{ code: '23505' }` → `fieldErrors: { number: 'Ya existe un Standard con ese número.' }`.
  - `subir una sección`: `['s1','s2','s3']`, `s2` arriba → `p_ids: ['s2','s1','s3']`; `s1` arriba → sin llamada.
  - `puntos`: `['Espacios', '  ', 'Pase']` → `p_points: ['Espacios', 'Pase']`; 13 puntos → `INVALID` con «Un principio tiene como máximo 12 puntos.».
- [ ] **Step 2:** `pnpm test src/modules/methodology` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(methodology): acciones de gestión con ActionResult`

---

### Task 10: Gestión de The Way: lista y editor de sección

**Files:**
- Create: `src/ui/form-field.tsx`, `src/ui/markdown-editor.tsx` (+ tests); `src/app/c/[club]/admin/_components/status-pill.tsx`, `item-controls.tsx`, `create-section-form.tsx`, `section-editor.tsx`; `src/app/c/[club]/admin/way/[sectionId]/page.tsx`
- Modify: `src/app/c/[club]/admin/way/page.tsx`, `e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Tasks 4, 5, 6 y 9; componentes de la Fase 1.
- Produces:
  - `TextField({ label; name; value; onChange: (v: string) => void; maxLength: number; error?; type?: 'text' | 'number' })`, `TextAreaField(… + rows?)`, `SelectField({ label; name; value; options: { value; label }[]; onChange; error? })`
  - `MarkdownEditor({ label; value; onChange; maxLength: number; error? })` (cliente)
  - `StatusPill({ status: ContentStatus })`; `ItemControls({ clubSlug; kind: MethodologyKind; id; title; status; isFirst: boolean; isLast: boolean })` (cliente)

Reglas:
- Campos: etiqueta enlazada, `surface-2`, borde `line-strong`, `radius-md`, alto `target-min`; con `error`, `aria-invalid` y `aria-describedby` al mensaje (`danger` + icono). Los formularios (cliente) llaman a la acción en `startTransition`; `fieldErrors` bajo cada campo y `ACTION_ERROR_COPY[error]` arriba.
- `MarkdownEditor`: pestañas «Escribir» / «Vista previa» (`aria-selected`); el `textarea` sigue montado (oculto) en la vista previa, que pinta `MarkdownBody`; contador «{n} / 20.000» («Demasiado largo» en `danger` al pasarse); ayuda «Puedes usar **negrita**, *cursiva*, listas, ### subtítulos, > citas y enlaces.».
- `StatusPill`: «Publicado» (`success` + icono) o «Borrador» (`ink-3` + icono). `ItemControls`: «Subir» / «Bajar» (`aria-label` «Subir {title}» / «Bajar {title}», deshabilitados en los extremos) y «Publicar» / «Pasar a borrador».
- `/admin/way`: `h1` `wayLabel(terminology)` y «Ordena las secciones y publica las que estén listas. Los entrenadores solo ven lo publicado.»; filas con número, título, tipo, `StatusPill`, `ItemControls` y «Editar»; vacío: «Aún no hay secciones» / «Crea la primera sección de la metodología de tu club.». Debajo, «Título», «Tipo» y `primary` «Crear sección» (luego `router.push` al editor).
- `/admin/way/[sectionId]`: `getSectionForAdmin` o `notFound()`; `h1` «Editar sección»; «Título», «Resumen», «Tipo» y `MarkdownEditor` «Contenido». En tipos no `text`: «Esta sección muestra los valores publicados.» (o «los principios», «los Standards») + «El texto de aquí aparece antes, como introducción.» y enlace a su página. `primary` «Guardar cambios» y `secondary` «Volver». El `updatedAt` devuelto es el siguiente `expectedUpdatedAt`; éxito: «Cambios guardados.»; `STALE_COPY`: su copy y `secondary` «Recargar» (`location.reload()`).

- [ ] **Step 1: Tests que fallan**
  - `form-field.test.tsx`: `getByLabelText('Título')` encuentra el input; con `error`, `aria-invalid="true"` y `aria-describedby` al mensaje.
  - `markdown-editor.test.tsx`: `**hola**` + «Vista previa» → `strong` «hola»; el `textarea` sigue en el DOM con su valor; contador «8 / 20.000»; con 20001 caracteres, «Demasiado largo».
- [ ] **Step 2:** `pnpm test src/ui` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4: E2E** en `e2e/admin.spec.ts` (`afterAll`: borra con `createAdminClient()` las secciones `plan-de-temporada%` y ejecuta `runSeed(new Date())`):
  - `un borrador no llega al entrenador hasta publicarlo`: Raúl crea «Plan de temporada» (Texto) y guarda un cuerpo dos veces seguidas → «Cambios guardados.» las dos; Álex en `/c/arcangel/way/plan-de-temporada` → «No encontramos esta página»; tras «Publicar», Álex ve «06» y el título.
  - `reordenar cambia el número`: «Subir Plan de temporada» → en Gestión y para Álex es «05» y «Cómo competimos» pasa a «06».
  - `dos pestañas editan a la vez` (Review Focus 4): dos contextos de Raúl abren el editor; uno guarda el título «Versión A» y el otro «Versión B» → copy de `STALE_COPY`; tras «Recargar», «Versión A».
- [ ] **Step 5:** `pnpm test && pnpm test:e2e && pnpm check:guards` → PASS.
- [ ] **Step 6: Commit** `feat(admin): gestión de secciones de The Way`

---

### Task 11: Gestión de valores, principios y Standards

**Files:**
- Create: `src/app/c/[club]/admin/_components/value-editor.tsx`, `principle-editor.tsx`, `standard-editor.tsx`
- Modify: `src/app/c/[club]/admin/values/page.tsx`, `principles/page.tsx`, `standards/page.tsx`, `e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Tasks 5, 9 y 10.
- Produces: `ValueEditor({ clubSlug; value?: ClubValue; isFirst?; isLast? })`, `PrincipleEditor({ …; principle?: GamePrinciple })`, `StandardEditor({ …; standard?: AdminStandard; defaultNumber?: number })`; sin elemento son el alta.

Reglas:
- Cada página: guards; `h1` «Valores», «Principios» o `standardsLabel(terminology)`; «Los entrenadores solo ven lo publicado.»; una `Card` por elemento (editor, `StatusPill`, `ItemControls`, `secondary` «Guardar»); al final, el alta con el único `primary`: «Crear valor» / «Crear principio» / «Crear Standard».
- Vacíos: «Aún no hay valores» / «Crea el primer valor de tu club.»; «Aún no hay principios» / «Crea el primer principio de juego de tu club.»; «Aún no hay Standards» / «Crea el primer Standard de tu club.».
- `ValueEditor`: «Código», «Título (opcional)», «Descripción». `StandardEditor`: «Número» (`type="number"`; en alta, `defaultNumber` = máximo + 1), «Título», «Descripción».
- `PrincipleEditor`: «Título», «Resumen (opcional)» y «Puntos»: una fila por punto (input, «Subir», «Bajar» con `moveAt`, «Quitar») y «Añadir punto» (oculto con 12); «Guardar» envía los puntos en orden. El alta solo pide título y resumen.

- [ ] **Step 1: E2E que falla** — ampliar `e2e/admin.spec.ts` (el `afterAll` borra también el Standard 6 y el punto nuevo):
  - `un número de Standard repetido se explica`: Raúl crea el número 3 → bajo «Número», «Ya existe un Standard con ese número.», sin alta.
  - `un Standard nuevo se publica`: Raúl crea el 6 «TALK ON DEFENSE» / «Hablamos en cada defensa.» → Álex no lo ve; tras «Publicar», ve `#standard-06` y «6 Standards» en el índice.
  - `un punto nuevo llega a Cómo jugamos`: en «Defensa», «Añadir punto» → «Ayuda y recupera» → «Guardar» → Álex lo ve en la card de Defensa.
  - `editar y archivar un valor`: descripción de «RESPECT» → «Respeto a todos, siempre.» → Álex la ve; «EFFORT» a borrador → Álex no lo ve y el índice dice «2 valores».
- [ ] **Step 2:** `pnpm test:e2e e2e/admin.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `pnpm test:e2e && pnpm check:guards` → PASS.
- [ ] **Step 5: Commit** `feat(admin): gestión de valores, principios y Standards`

---

### Task 12: Cierre de fase

**Files:**
- Modify: solo correcciones que salgan de la revisión

- [ ] **Step 1:** `pnpm supabase db reset && pnpm seed && pnpm lint && pnpm typecheck && pnpm check:guards && pnpm test && pnpm test:db && pnpm test:int && pnpm test:e2e` → verde; asesor de seguridad de Supabase sin avisos nuevos.
- [ ] **Step 2:** Móvil real (`pnpm dev` + túnel o red local) con Álex, Nora, Marta y Raúl: textos, ningún borrador ni Gestión para entrenadores, consola limpia, nada se sale a 375 px.
- [ ] **Step 3:** Escritorio (1280 px) con Raúl: editar, publicar, reordenar y editar puntos; luego `pnpm seed`.
- [ ] **Step 4: Commit** `chore: cierre de la Fase 2` y abrir el PR de la Fase 2.

---

## Cambios propuestos al contrato

- **SQL:** las tres funciones de la Task 2 y sus códigos de error como convención para todas las fases (`save_practice_items` incluida). `way_sections.created_at`; `body_md not null default ''`; slug `standards` reservado; número de sección = posición; `club_values.title` y `game_principles.summary` opcionales; sin `updated_at` en valores, principios y Standards; `delete` solo en puntos.
- **TS:** `ActionError` (ampliable), `ok`, `fail`, `fromZodError`, `fromDbError` (único traductor), `ACTION_ERROR_COPY`; acciones con firma `(clubSlug, input)`; en `methodology`, `ContentStatus`, `ContentKind`, `MethodologyKind`, `AdminStandard`, `WayIndexEntry`, `WaySectionView`, `CONTENT_KIND_LABELS`, `sectionSubtitle`, `slugify`, `uniqueSlug`, `moveAt`, `moveId`, `getValues`, consultas `…ForAdmin` y acciones de la Task 9 (sin `sort` en los tipos; `formatStandardNumber` también numera secciones); en tenancy, `wayLabel`, `standardsLabel`, `AdminNavItem`, `adminNavItems`, `getViewerName`.
- **UI:** `ValueBlock`, `WayIndexView`, `AccountMenu`, `AdminShell`, `AdminNav`, `TextField`, `TextAreaField`, `SelectField`, `MarkdownEditor`, `safeHref` (`AccountMenu`, `AdminShell` y los campos los reutilizan las fases siguientes); `TopNavigation` gana `account`; anclas `id="standard-NN"` e `id="principle-{slug}"`.
- **Rutas:** grupo `src/app/c/[club]/(app)/` para las pestañas (mismas URLs) y `admin/` fuera de él; `/admin` redirige a `/admin/way` hasta la Fase 7.
- **Otros:** tokens `admin-nav` y `admin-content-max`; guard de `requireAdmin(`; proyecto Playwright `admin` (las demás fases añaden specs a su `testMatch`); tests de `src/` con datos neutros.
