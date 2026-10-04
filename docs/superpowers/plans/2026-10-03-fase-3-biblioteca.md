# CLUB OS · Fase 3 (Biblioteca de ejercicios) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un entrenador busca (con o sin tildes) y filtra los ejercicios del club, abre su ficha con diagrama, coaching points y Standards, y propone los suyos como borrador que dirección publica.
**Architecture:** Tablas con RLS por autor y estado; búsqueda en una función SQL `security invoker` sobre un `tsvector` generado sin acentos; guardado atómico por RPC con concurrencia optimista. Diagramas en un bucket privado con políticas por ruta y URLs firmadas; filtros en la URL, leídos en Server Components.
**Tech Stack:** extensión Postgres `unaccent`, Supabase Storage, `@radix-ui/react-dialog`; lo de las Fases 1 y 2.
**Spec:** `docs/spec/club-os-primera-entrega.md` + `docs/superpowers/plans/2026-10-03-00-contratos-entre-fases.md`
**Requiere:** Fases 1 y 2 terminadas.
**Dentro de esta fase:** BD y Storage de la biblioteca, seed, módulo `drills`, diagramas, biblioteca, ficha, editor y relacionados en The Way. **Fuera:** «Añadir a sesión» (Fase 4), `/admin/drills` (Fase 7), favoritos, miniaturas reales en la lista (siempre `CourtThumb`), borrar diagramas sustituidos, subida de vídeo, arrastrar para reordenar.

## Global Constraints

- TypeScript `strict: true`; ESLint sin `any` explícito.
- Toda tabla de club: `organization_id uuid not null`, RLS, `unique (organization_id, id)` si se referencia, FKs compuestas, `revoke all … from anon`.
- Funciones de RLS en `private`: `language sql stable security definer set search_path = ''`; `execute` solo a `authenticated`; políticas con `(select auth.uid())`.
- `SUPABASE_SERVICE_ROLE_KEY` solo en `scripts/` y `e2e/`. `src/` sin `Arcángel`, `Arcangel` ni `c9a45c`: sus tests usan el slug `club-a`.
- Ningún hex en componentes. Copy en español, tuteo, sin exclamaciones; metadatos «U12+ · 6–12 jug. · 10–15 min».
- Viewport 375×812; áreas táctiles ≥ 44 px (los chips de 36 px visuales tienen 44 px de área).
- Los ejercicios no se borran, se archivan: el archivado sale de búsqueda y relacionados, pero su ficha y su enlace en sesiones siguen visibles.
- Solo `createSignedUrl` (600 s), nunca `getPublicUrl`.
- `expectedUpdatedAt` es el string de `updated_at` tal cual sale de la BD (nunca pasa por `new Date()`); `updated_at` se fija con `clock_timestamp()`.
- Errores de BD (convención de la Fase 2): copia obsoleta `raise exception 'STALE_COPY' using errcode = 'P0001'`; no encontrado o sin permiso `P0002` (y `42501` de RLS); entrada inválida `22023` (y `23514`). Se traducen solo con `fromDbError` de `src/lib/action-result.ts`.
- Server Actions: `(clubSlug: string, input)`; llaman a `requireClub(clubSlug)`, validan `input` con Zod y devuelven `ActionResult<T>`; sin permiso según `can` → `NOT_FOUND`.
- `signInAs(email)` de `scripts/lib/user-client.ts` es el cliente de usuario de los tests de integración. E2E que escriben usan ejercicios `E2E … {Date.now()}` que borran con `createAdminClient`; no afirman recuentos totales.

## Review Focus

1. Álex abre por URL el borrador de Irene («Bloqueo de rebote»): misma 404 que un uuid inexistente y no le sale en `search_drills`; Irene y Raúl lo ven con «Borrador». → Task 1 (pgTAP) y Task 11 (e2e).
2. «transicion», «TRANSICIÓN» y «transi» encuentran «4x4 transición»; «outl» encuentra «Rebote + outlet»; una consulta de símbolos (`%_'`) no falla y equivale a no buscar. → Task 3 (pgTAP).
3. Un SVG (también renombrado a `.png` con tipo `image/png`) o un fichero de 20 MB se rechaza con «Sube una imagen PNG, JPEG o WebP de hasta 2 MB.», sin objeto ni fila en `media_assets`; el bucket lo rechaza aunque se salte la app. → Task 8 (unidad e integración) y Task 12 (e2e).
4. Nadie sube a `org/{otro club}/…`, a la carpeta de un ejercicio que no puede editar ni a una ruta cuyo club no es el del ejercicio; Marta no lee ni firma objetos de Arcángel. → Task 2 (pgTAP) y Task 8 (integración).
5. Un ejercicio archivado enlazado desde un entrenamiento pasado sale de la búsqueda, pero el staff del equipo sigue leyendo su título por `practice_items` y su ficha abre con «Archivado». → Tasks 1 y 3 (pgTAP) y Task 11 (e2e).

## Desviaciones del plan durante la ejecución

El texto de las tareas de arriba no se ha reescrito: es el que se ejecutó. Donde se aparta de él, manda esta lista, con su porqué. Las convenciones que de aquí salen están en «Convenciones reconciliadas» del contrato entre fases.

**Esquema y Storage**
- **Task 1 · `private.set_updated_at()` no se crea: se redefine.** Ya existía (la creó la Fase 1 para `organizations`) con `now()`. Se reemplaza por la versión con `clock_timestamp()` en vez de duplicarla, porque `updated_at` tiene que avanzar dentro de una transacción. Alcanza también a `organizations` y `organization_branding`, donde solo cambia que el valor es el instante del `update`.
- **Task 1 · `created_by` admite null y es `on delete set null`** (en `drills` y en `media_assets`). El contrato ya decía `createdBy: string | null`, y borrar la cuenta de un autor no debe fallar ni llevarse el contenido del club.
- **Task 1 · la política `select` de `drills` repite la regla de `can_see_drill` sobre las columnas de la fila**, en lugar de llamar a la función. Con la llamada literal, `insert … returning` de un entrenador daba `42501`: la fila aún no existe cuando se evalúa la política. Un test fija que las dos copias coinciden.
- **Task 2 · regla de lectura de Storage.** El plan decía `select → is_member(club de la ruta)`: cualquier miembro, jugadores incluidos, listaba y firmaba el diagrama de un borrador ajeno. Contradecía la tabla de permisos de la spec (ejercicios: jugador y familia «—»; borradores solo autor y dirección) y el Review Focus 1. Se lee lo que está en la carpeta de un ejercicio del club de la ruta que `can_see_drill` deja ver (`private.can_see_drill_media(path)`, nueva); el resto de prefijos queda sin acceso hasta que una fase les dé el suyo. La spec pide el primer segmento como capa de club, no como única regla.
- **Task 4 · firma de `save_drill`.** `p_drill`, `p_expected_updated_at` y `p_payload` llevan `default null`: los tipos generados los hacen opcionales y `createDrill` omite las claves, sin casts. Sin `p_payload` es una entrada inválida.
- **Task 4 · dos endurecimientos que el plan no tenía.** (1) El diagrama tiene que vivir en la carpeta del propio ejercicio **a nivel de tabla**, no solo dentro de `save_drill`: trigger `drills_check_diagram`. Es `after insert or update` y acotado al club de la fila; la primera versión, `before` y sin acotar, era un oráculo de qué fichas existen en otros clubes. (2) `update` de `drills` por columnas para `authenticated`, sin `organization_id`, `id`, `created_at` ni `created_by`: quien es coach o admin de dos clubes podía mover un ejercicio de uno a otro. De ahí la regla «una columna nueva se añade al grant».

**Seed y tests**
- **Task 5 · arquitectura del seed.** No existen `seedDrills(admin, …)` ni `linkPracticeItems(admin, …)` contra la base de datos. Los ejercicios pasan por `buildSeedData(now)` como el resto: `SeedDrill`, `ARCANGEL_DRILLS`, `DEMO_DRILLS` y constructores puros en `scripts/seed/drills.ts`, filas con ids deterministas, `practice_items.drill_id` resuelto por título exacto al construir y autor por email resuelto en `run.ts`. Es lo que `runSeed(now, client?)`, `restoreSeed` y `seed.int` ya suponían, y el contrato entre fases no hace que ninguna fase consuma las dos firmas del plan.
- **Task 8 · el test de integración de Storage vive en `scripts/media/storage.int.test.ts`,** no en `src/modules/media/`: usa la clave de servicio para limpiar, y esa clave nunca entra en `src/` (regla 2 de CLAUDE.md).
- **Task 8 · «Álex lo firma» pasa a «dirección lo firma».** Consecuencia de la regla de lectura de la Task 2: Álex no ve el borrador de Irene, y en ese test Álex y Marta solo tienen aserciones de denegación.
- **Review Focus 3 · el bucket.** «El bucket lo rechaza aunque se salte la app» solo vale para el tipo declarado y el tamaño: Storage no inspecciona los bytes. Quien se salte la app puede subir un SVG declarado `image/png`; el objeto se sirve con ese tipo de imagen y queda inerte. La app sí mira los bytes (`sniffImageType`). Cerrarlo del todo exigiría un proxy de subida propio.
- **Tasks 11 y 12 · `restoreSeed`** (`e2e/helpers/seed.ts`) se amplía con `drills` (Task 11) y con `media_assets` y los objetos de Storage (Task 12, el primer spec que sube ficheros), para que una ejecución abortada no deje ejercicios `E2E …`. `SESSION_USERS` añade a Irene, y los specs usan `openAs`, no `loginAs` (backlog de la Fase 1).

**Acciones y datos**
- **Task 7 · el esqueleto `mutate` se extrae** de `methodology/actions.ts` a `src/lib/mutate.ts`, parametrizado por permiso, etiqueta de log y rutas, y lo usan metodología y ejercicios: copiar el bloque habría sido duplicar lógica que todas las fases escriben igual.
- **Task 7 · `revalidatePath` con patrones de ruta** (`/c/[club]/(app)/drills`, `/c/[club]/(app)/way`) y `"layout"`, nunca con la URL concreta: la URL concreta no invalida nada.
- **Task 7 · argumentos del RPC.** `searchDrills` omite los filtros ausentes en vez de mandarlos `null`: los tipos generados no admiten `null`. El test del plan «el resto `null`» pasa a «solo las claves presentes».
- **Task 7 · `DrillInput` omite también `createdBy`** (lo hereda de `DrillSummary` y el autor nunca viene del cliente).
- **Task 7 · `DrillDetail.principleIds` y `standardIds`,** con TODOS los vínculos del ejercicio. `principles` y `standards` solo traen lo publicado, y un formulario que reconstruyera los ids desde ahí desvincularía en silencio, al guardar, lo que dirección pasó a borrador.
- **Task 8 · `uploadDrillDiagram` devuelve `previewUrl: string | null`:** si no se puede firmar la URL, la subida cuenta igual y el formulario enseña «Diagrama subido» sin miniatura. Sube los bytes (`Uint8Array`), no el `File`: con un `File`, `supabase-js` manda como tipo del objeto el que declara el cliente e ignora `contentType`.
- **Task 11 · `useAction` pasa de `admin/_components/` a `src/lib/use-action.ts`** (con su test), y Gestión actualiza sus imports: la ficha y el formulario lo reutilizan.

**Interfaz**
- **Task 9 · la cabecera `detail` sustituye a la de inicio con un mecanismo propio.** `(app)/layout.tsx` pinta siempre la de inicio; cada variante lleva `data-topnav` y el marco oculta la de inicio con `:has()` cuando la pantalla trae una de detalle, sin mover rutas ni tocar las páginas de la Fase 2. Por eso la página, su `loading.tsx` y su `error.tsx` montan la misma cabecera.
- **Task 11 · el «+N» de los Standards de la ficha es un enlace** a la página de Standards del club. Con más de tres Standards el resto no se podía ver desde la ficha, y la regla 8 pide enseñar el porqué.
- **Task 13 · `ScrollToHash`.** Abrir una URL con ancla en una carga completa dejaba la página arriba cuando el contenido llegaba en streaming después del esqueleto. Se añade un componente de cliente mínimo que lleva la página al ancla al montarse con el contenido, montado en las dos páginas de The Way que tienen anclas, y se restauran las aserciones de carga directa de los e2e de la Fase 2.

**Cierre**
- **Biblioteca · «primeros 100» solo cuando hay más.** `searchDrills` pide 101 y devuelve `{ drills, hasMore }`; con justo 100 coincidencias la línea dice «100 ejercicios».
- **Formulario · no se pierde lo escrito en silencio.** `DrillForm` guarda en estado el ejercicio tal como se abrió (el `expectedUpdatedAt` no se lee de la propiedad viva) y, con cambios sin guardar, cerrar o recargar la pestaña y «Cancelar» piden confirmación. «Volver» de la cabecera y la navegación inferior quedan para `ConfirmDialog` (Fase 4).
- **Movimientos puros** para que la Fase 4 no importe helpers genéricos de metodología: `throwReadError` (`src/lib/read-error.ts`), `UUID_RE` (`src/lib/uuid.ts`), `WAY_ROUTE` (`src/lib/routes.ts`), `fakeSupabase` (`src/lib/test-support.ts`) y el doble de las filas de chips (`src/ui/test-support.ts`).

---

## Estructura de ficheros

```
next.config.ts                        serverActions.bodySizeLimit '3mb'
supabase/migrations/2026110300{0100_drills,0200_media_storage,0300_drill_search,0400_save_drill}.sql
supabase/tests/database/{drills,media,drill_search,drill_save}.test.sql
scripts/lib/user-client.ts            signInAs (sesión de un usuario del seed)
scripts/seed/data.ts, drills.ts, seed.int.test.ts
src/lib/permissions.ts                acciones nuevas
src/modules/tenancy/navigation.ts     /drills → 'train'
src/modules/media/storage.ts, diagram-file.ts
src/modules/drills/types, format, filters, permissions, schema, queries, actions (.ts + tests)
src/ui/court, drill-card, filter, bottom-sheet, search, coaching-points-list (.tsx + tests); top-navigation, principle-card
src/app/c/[club]/(app)/train/page.tsx entrada a la biblioteca
src/app/c/[club]/(app)/drills/page, loading, error, filters-bar, drill-form; new/page
src/app/c/[club]/(app)/drills/[drillId]/page, loading, error, drill-admin-actions; edit/page
src/app/c/[club]/(app)/way/[section]/page.tsx, way/standards/page.tsx
playwright.config.ts                  specs de escritura en el proyecto admin
e2e/fixtures/diagram.png, diagram.svg; e2e/{drills-library,drill-detail,drill-editor,way-drills}.spec.ts
```

---

### Task 1: Esquema de la biblioteca con RLS

**Files:**
- Create: `supabase/migrations/20261103000100_drills.sql`, `supabase/tests/database/drills.test.sql`

**Interfaces:**
- Consumes: `private.is_member`, `private.has_org_role`, `focus_areas`, `practice_items`, `tests.*` (Fase 1); `game_principles`, `standards` (Fase 2).
- Produces: extensión `unaccent` en `extensions`; `private.f_unaccent(text) returns text` (`immutable strict parallel safe`, cuerpo `select extensions.unaccent('extensions.unaccent'::regdictionary, $1)`); trigger `private.set_updated_at()` (`new.updated_at := clock_timestamp()`); enum `drill_status ('draft','published','archived')`; las tablas de abajo; `private.can_see_drill(drill uuid) returns boolean`, `private.can_edit_drill(drill uuid) returns boolean`; FK `practice_items (organization_id, drill_id) → drills` con índice.

Columnas (`not null` salvo indicación):
- `drills`: `title text` (3–80), `summary` (null, ≤ 200), `objective` (null, ≤ 500), `setup_md` (null, ≤ 5000), `min_players smallint` 1–40, `max_players` `between min_players and 40`, `min_minutes`/`max_minutes` igual en 1–120, `min_age smallint` 8–18, `max_age` (null, `between min_age and 18`), `equipment text[] default '{}'` (≤ 12), `diagram_media_id uuid` (null; FK en Task 2), `video_url` (null, ≤ 300, `~ '^https://((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com)/\S*$'`), `status drill_status default 'draft'`, `created_by uuid default auth.uid() references auth.users`, `created_at`, `updated_at timestamptz default clock_timestamp()`, `search tsvector generated always as (to_tsvector('spanish'::regconfig, private.f_unaccent(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(objective,'') || ' ' || coalesce(setup_md,'')))) stored`; GIN en `search`, btree `(organization_id, status)`.
- `drill_coaching_points`: `drill_id`, `text` (1–140), `is_key boolean default false`, `sort smallint`, `unique (drill_id, sort)`. `drill_variants`: `drill_id`, `title` (1–80), `description` (null, ≤ 500), `sort`, `unique (drill_id, sort)`.
- `drill_focus_areas`, `drill_principles`, `drill_standards`: `(organization_id, drill_id, x_id)`, pk `(drill_id, x_id)`, índice en `x_id`; FKs a `unique (organization_id, id)` de `focus_areas` (Fase 1), `game_principles` y `standards` (Fase 2). Hijos → `drills` con `on delete cascade`.

Reglas: `can_see_drill`: `admin` o `coach` del club y (`status <> 'draft'`, autor o admin). `can_edit_drill`: admin, o borrador propio siendo coach. `drills`: `select` → `can_see_drill(id)`; `insert` → `with check (status = 'draft' and created_by = (select auth.uid()) and private.has_org_role(organization_id, '{admin,coach}'))`; `update` → `using (private.can_edit_drill(id)) with check (private.has_org_role(organization_id, '{admin}') or (status = 'draft' and created_by = (select auth.uid()) and private.has_org_role(organization_id, '{coach}')))`; sin `delete`. Hijos: `select` → `can_see_drill(drill_id)`; escrituras → `can_edit_drill(drill_id)`.

- [x] **Step 1: Test que falla** `drills.test.sql`. A: `adminA`, `c1` (T1), `c2` (T2), `jugA` (`player`), `dPub`, `dDraft` (de c1), `dArch` («Rebote ofensivo», archivado, en un ítem de un plan `done` de T1). B: `coachB`, Standard `sB`, un ejercicio.
  - `c1 ve publicados, archivados y su borrador` (3); `c2 no ve el borrador de c1` (Review Focus 1); `admin lo ve`; `jugA` y `coachB` no ven nada de A (seis tablas).
  - `c1 crea un borrador`; crear publicado o publicar su borrador → `42501`; `c1 no edita el publicado`, `c2 no edita el borrador de c1` y `nadie borra` (`returning` vacío); `admin publica y archiva`.
  - `c2 no ve los puntos del borrador`; `c1 no añade puntos al publicado` → `42501`.
  - `el archivado sigue en el histórico` (Review Focus 5): c1 lee `{'Rebote ofensivo'}` en `practice_items` join `drills` por `drill_id`.
  - `FK compuesta`: `drill_standards` con `sB` y `practice_items` de A con ejercicio de B → `23503`.
  - `CHECK` → `23514`: `http://youtube.com/x`, `https://youtube.com.evil.com/x`, `https://evil.com/?youtube.com/` (y `https://youtu.be/abc` pasa), `max_players < min_players`, `max_age < min_age`, `min_age = 7`.
  - `updated_at avanza` dentro de la transacción tras un `update`.
- [x] **Step 2:** `pnpm supabase db reset && pnpm test:db` → FAIL.
- [x] **Step 3:** Escribir la migración (grants: `select, insert, update` en `drills`; las cuatro en hijos).
- [x] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS. `pnpm db:types`.
- [x] **Step 5: Commit** `git commit -m "feat(db): biblioteca de ejercicios con RLS por autor y estado"`

---

### Task 2: Media y Storage

**Files:**
- Create: `supabase/migrations/20261103000200_media_storage.sql`, `supabase/tests/database/media.test.sql`

**Interfaces:**
- Consumes: Task 1.
- Produces: tabla `media_assets`; FK `drills_diagram_fk (organization_id, diagram_media_id) → media_assets`; bucket `club-media`; `private.storage_org_id(path text) returns uuid` (null si no casa con `^org/<uuid>/`); `private.can_upload_drill_media(path text) returns boolean`; `private.can_see_media(media uuid) returns boolean`; políticas `club_media_read`, `club_media_insert`, `club_media_delete` en `storage.objects`.

`media_assets` (`not null`): `bucket text default 'club-media'` (solo ese valor), `path text unique check (split_part(path,'/',1) = 'org' and split_part(path,'/',2) = organization_id::text)`, `kind` en `('image','video','document')`, `mime` en `('image/png','image/jpeg','image/webp')`, `bytes int` 1–2097152, `contains_minor boolean default false`, `created_by uuid default auth.uid() references auth.users`, `created_at`.

Reglas: bucket por `insert … on conflict (id) do update` en `storage.buckets` con `public = false`, `file_size_limit = 2097152`, `allowed_mime_types = '{image/png,image/jpeg,image/webp}'`. `can_upload_drill_media`: `path ~ '^org/U/drills/U/U\.(png|jpg|webp)$'` (U = uuid en minúsculas), el ejercicio del 4.º segmento existe con `organization_id` = 2.º segmento y `can_edit_drill`. `can_see_media`: admin, autor, o diagrama de un ejercicio que `can_see_drill`. `storage.objects` (`to authenticated`): `select` → `bucket_id = 'club-media' and private.is_member(private.storage_org_id(name))`; `insert`/`delete` → `bucket_id = 'club-media' and private.can_upload_drill_media(name)`; sin `update`. `media_assets`: `select` → `can_see_media(id)`; `insert` → `created_by = (select auth.uid()) and private.can_upload_drill_media(path)`.

- [x] **Step 1: Test que falla** `media.test.sql` (fixtures de la Task 1; `storage.objects` con `bucket_id` y `name`):
  - `bucket privado con límites` (los tres valores); `c1 sube a su borrador`. Review Focus 4 → `42501`: c1 al publicado, c2 al borrador de c1, coachB a A, `org/B/drills/dDraft/…`, y `…/x.svg`, `…/../x.png`, `org/no-uuid/x.png` (sin error de conversión).
  - `c2 lee el objeto de su club`; `coachB no lo lee`; `anon` → `42501`.
  - `media_assets`: c1 registra su ruta; `organization_id` A con ruta de B → `23514`; c2 no ve el asset hasta que es `diagram_media_id` de `dPub`.
- [x] **Step 2:** `pnpm test:db` → FAIL.
- [x] **Step 3:** Escribir la migración.
- [x] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS. `pnpm db:types`.
- [x] **Step 5: Commit** `git commit -m "feat(db): bucket privado club-media con políticas por ruta"`

---

### Task 3: Búsqueda y filtros en BD

**Files:**
- Create: `supabase/migrations/20261103000300_drill_search.sql`, `supabase/tests/database/drill_search.test.sql`

**Interfaces:**
- Consumes: Task 1.
- Produces: `private.f_search_key(text) returns text` (`immutable`: `trim(regexp_replace(lower(private.f_unaccent($1)), '[^a-z0-9]+', ' ', 'g'))`); `public.search_drills(p_org uuid, p_q text default null, p_focus text default null, p_principle text default null, p_age int default null, p_players int default null, p_minutes int default null) returns setof public.drills` (`language sql stable security invoker set search_path = ''`).

Condiciones (AND): `organization_id = p_org`; `status <> 'archived'`; con `k = nullif(private.f_search_key(p_q), '')`: `search @@ websearch_to_tsquery('spanish', private.f_unaccent(p_q)) or (' ' || private.f_search_key(title)) like ('% ' || k || '%')` (`k` solo tiene `[a-z0-9 ]`); `p_focus`/`p_principle` → enlace con ese `slug`; `p_age` → `min_age <= p_age and (max_age is null or max_age >= p_age)`; `p_players`/`p_minutes` → dentro de su rango min–max. RLS decide los borradores.

- [x] **Step 1: Test que falla** `drill_search.test.sql`. A: «4x4 transición» (U12+, 8–12, 15–20, focus y principio `transicion`), «Rebote + outlet» (U12+, 6–12, 10–15, `rebote`), «Bote y control» (U8–U12, 4–12, 10–15), «Bloqueo de rebote» (U10+, borrador de c1, `rebote`), «Rebote ofensivo» (archivado); B: «Rebote B». Como c2 salvo indicación:
  - Review Focus 2: `'transicion'`, `'TRANSICIÓN'`, `'transi'` → incluyen «4x4 transición»; `'outl'` y `'rebote outlet'` → «Rebote + outlet»; `'zzz'` → vacío; `'%_'''` → `lives_ok`, mismo conjunto que `null`.
  - edad 12 incluye «Bote y control» y «4x4 transición», 14 excluye «Bote y control», 10 excluye los U12+; jugadores 5 → solo «Bote y control», 13 → vacío; minutos 20 y principio `transicion` → solo «4x4 transición».
  - `combinación sin resultados`: `rebote` + 10 → vacío para c2, `{'Bloqueo de rebote'}` para c1.
  - Review Focus 1 y 5: c2 nunca recibe «Bloqueo de rebote»; nadie recibe «Rebote ofensivo»; coachB con `p_org` A → vacío.
- [x] **Step 2:** `pnpm test:db` → FAIL.
- [x] **Step 3:** Escribir la migración.
- [x] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS. `pnpm db:types`.
- [x] **Step 5: Commit** `git commit -m "feat(db): búsqueda de ejercicios sin acentos y filtros"`

---

### Task 4: Guardado atómico de un ejercicio

**Files:**
- Create: `supabase/migrations/20261103000400_save_drill.sql`, `supabase/tests/database/drill_save.test.sql`

**Interfaces:**
- Consumes: Tasks 1 y 2.
- Produces: `public.save_drill(p_org uuid, p_drill uuid, p_expected_updated_at timestamptz, p_payload jsonb) returns table (id uuid, updated_at timestamptz)` (`plpgsql security invoker set search_path = ''`). Claves de `p_payload`: `title, summary, objective, setup_md, min_players, max_players, min_minutes, max_minutes, min_age, max_age, equipment, video_url, diagram_media_id, focus_area_ids, principle_ids, standard_ids, coaching_points [{text, is_key}], variants [{title, description}]`.

Reglas: `p_drill` null → inserta un borrador del usuario (sin diagrama). Si no: `select … for update` por `id` y `organization_id`; sin fila → `errcode 'P0002'`; `updated_at` distinto → `'STALE_COPY'` (`P0001`). Más de 3 `is_key` o un `diagram_media_id` cuyo `path` no empiece por `org/{p_org}/drills/{p_drill}/` → `errcode '22023'`. Actualiza columnas (nunca `status` ni `created_by`), reemplaza hijos con `sort` = posición desde 0 y devuelve `id` y `updated_at`.

- [x] **Step 1: Test que falla** `drill_save.test.sql`:
  - `c1 crea un borrador con hijos`: `draft`, autor c1, puntos con `sort` 0 y 1, 1 focus.
  - `reemplaza hijos en orden`: con el `updated_at` devuelto y los puntos invertidos → orden invertido y `updated_at` mayor.
  - `copia antigua` → `throws_ok(…, 'P0001', 'STALE_COPY')`; c2 sobre el borrador de c1 y c1 sobre un publicado → `throws_ok(…, 'P0002')`; 4 clave y diagrama de otra carpeta → `'22023'`.
  - `Standard de otro club` → `23503` y los hijos previos siguen.
  - `admin guarda un publicado sin cambiar su estado`; un `"status":"published"` de c1 se ignora.
- [x] **Step 2:** `pnpm test:db` → FAIL.
- [x] **Step 3:** Escribir la función.
- [x] **Step 4:** `pnpm supabase db reset && pnpm test:db` → PASS. `pnpm db:types`.
- [x] **Step 5: Commit** `git commit -m "feat(db): save_drill atómico con concurrencia optimista"`

---

### Task 5: Seed de la biblioteca

**Files:**
- Create: `scripts/seed/drills.ts`
- Modify: `scripts/seed/data.ts`, `scripts/seed.ts`, `scripts/seed/seed.int.test.ts`

**Interfaces:**
- Consumes: `createAdminClient`, `seedId`, `runSeed` (Fase 1); principios y Standards del seed de la Fase 2.
- Produces: `type SeedDrill` (columnas de la tabla, con `players`/`minutes: [number, number]` y `standards: number[]`, más `key`, `principles`, `equipment`, `objective`, `setupMd`, `points: Array<{ text: string; key?: true }>`, `variants?`, `author` (email), `status`); `ARCANGEL_DRILLS`, `DEMO_DRILLS: SeedDrill[]`; `seedDrills(admin: SupabaseClient<Database>, orgSlug: string, drills: SeedDrill[]): Promise<void>`; `linkPracticeItems(admin: SupabaseClient<Database>, orgSlug: string): Promise<number>`.

Reglas: `key` = título en minúsculas, sin tildes, con `-` (`bloqueo-de-rebote`); ids `seedId(org, 'drill:' + key)` y `… + ':point:' + i`; `upsert`; sin diagramas. Focus y principios por `slug`, Standards por `number`; si falta uno, `Error('Seed: no existe el principio "transicion" en arcangel')`. `linkPracticeItems` pone `drill_id` en los ítems del club sin enlace cuyo `title_override` es exactamente el título de un ejercicio, sin tocar `title_override`. `runSeed` llama a ambas en los dos clubes tras The Way.

Arcángel: autor `raul@arcangel.test`, publicados; el 8 es borrador de `irene@arcangel.test`. Principios = los focus que son principio (`transicion`, `defensa`, `rebote`, `ataque`), más `ataque` en 10 y 17.

| # | Título | Edad | Jug. | Min | Focus | Std |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Rebote + outlet | 12+ | 6–12 | 10–15 | rebote, transicion | 3, 4, 5 |
| 2 | 3 calles | 10+ | 9–15 | 10 | transicion, tecnica | 4, 5 |
| 3 | 3x2 continuo | 12+ | 8–12 | 12–20 | transicion, ataque | 2, 4, 5 |
| 4 | 2x2 presión | 12+ | 8–12 | 12–15 | defensa | 2, 3 |
| 5 | 1x1 toda pista | 12+ | 4–12 | 10–15 | defensa, tecnica | 2 |
| 6 | Movilidad + rueda de pases | 8+ | 8–16 | 8–12 | tecnica | — |
| 7 | Desplazamientos defensivos | 8+ | 4–16 | 8–10 | defensa | 2 |
| 8 | Bloqueo de rebote | 10+ | 6–12 | 10–12 | rebote | 3 |
| 9 | 3x3 a 5 puntos | 12+ | 6–12 | 15–20 | ataque, defensa | 2, 3 |
| 10 | Tiro tras bote | 10+ | 4–12 | 10–15 | tiro, tecnica | — |
| 11 | Pase y corte | 10+ | 6–12 | 10–15 | ataque, tecnica | 4 |
| 12 | Contraataque 2x1 | 10+ | 6–12 | 10–15 | transicion | 4, 5 |
| 13 | Rebote ofensivo | 12+ | 6–12 | 10–15 | rebote, ataque | 2, 3 |
| 14 | Bote y control | 8–12 | 4–12 | 10–15 | tecnica | — |
| 15 | Defensa individual | 10+ | 6–12 | 10–15 | defensa | 2 |
| 16 | Movilidad dinámica | 8+ | 4–16 | 8–10 | tecnica | — |
| 17 | Rueda de entradas | 8+ | 6–16 | 8–12 | tecnica, tiro | — |
| 18 | 4x4 transición | 12+ | 8–12 | 15–20 | transicion, defensa | 2, 4, 5 |

- «Rebote + outlet»: objetivo «Asegurar el rebote defensivo y convertirlo inmediatamente en ventaja ofensiva.»; organización «Tirador en la esquina, reboteador en la zona y dos exteriores abiertos; el rebote sale en outlet y se ataca en 3 calles.»; puntos «Rebote con dos manos»*, «Primera mirada hacia delante»*, «Outlet rápido»*, «Abrir carriles», «Correr» (* = clave); material Balones, Conos, Petos; variantes «Con defensor en el outlet» y «Tras tiro libre» (descripción de una frase).
- Resto: objetivo de una frase en infinitivo, organización de una o dos frases, 3–4 puntos (los dos primeros clave; uno si hay 3); material `Balones` (solo `Conos` en 7 y 16) + `Conos` en 5, 6, 10, 14 + `Petos` en 3, 4, 9, 15, 18; variantes «Toda la pista» (4) y «Con comodín» (18); el objetivo del 18 dice «transición».
- Club Demo (autora `marta@demo.test`, publicados): «Defensa individual» (14+, 6–12, 10–15, `defensa`, Standard 1) y «Tiro en carrera» (12+, 4–12, 10, `tiro`).

- [x] **Step 1: Tests que fallan** en `seed.int.test.ts`, tras `runSeed` dos veces:
  - `18 ejercicios de Arcángel y 1 borrador de Irene`; Club Demo = 2.
  - `Rebote + outlet completo`: Standards 3, 4, 5; 5 puntos con 3 `is_key`; 2 variantes; `equipment` `{Balones,Conos,Petos}`; `min_age` 12, `max_age` null.
  - `ítems enlazados`: los 5 ítems de «Transición + rebote defensivo» tienen `drill_id`; 0 ítems de Arcángel sin enlace cuyo `title_override` coincide con un ejercicio.
  - `idempotente`: mismos recuentos de hijos y enlaces tras la segunda ejecución.
- [x] **Step 2:** `pnpm test:int scripts/seed` → FAIL.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** `pnpm seed && pnpm seed && pnpm test:int` → PASS.
- [x] **Step 5: Commit** `git commit -m "feat(seed): 18 ejercicios de Arcángel enlazados a Standards y sesiones"`

---

### Task 6: Tipos, formato, filtros y permisos

**Files:**
- Create: `src/modules/drills/types.ts`, `format.ts`, `filters.ts`, `permissions.ts` (+ tests)
- Modify: `src/lib/permissions.ts`, `src/modules/tenancy/navigation.ts` (+ tests)

**Interfaces:**
- Consumes: `ClubContext`, `activeNavKey` (Fase 1); `Action`, `can`, `Standard` (Fase 2).
- Produces:
  ```ts
  export type DrillStatus = 'draft' | 'published' | 'archived';
  export type FocusArea = { id: string; slug: string; name: string };
  export type DrillSummary = { id: string; title: string; status: DrillStatus; createdBy: string | null; minAge: number; maxAge: number | null; minPlayers: number; maxPlayers: number; minMinutes: number; maxMinutes: number; focus: Array<{ slug: string; name: string }> };
  export type DrillDetail = DrillSummary & { summary: string | null; objective: string | null; setupMd: string | null; equipment: string[]; videoUrl: string | null; diagramMediaId: string | null; diagramUrl: string | null; coachingPoints: Array<{ text: string; isKey: boolean }>; variants: Array<{ title: string; description: string | null }>; focusAreaIds: string[]; principles: Array<{ id: string; slug: string; title: string }>; principlesSectionSlug: string | null; standards: Standard[]; createdByMe: boolean; updatedAt: string };
  export type DrillFilters = { q?: string; focus?: string; principle?: string; age?: number; players?: number; minutes?: number };
  ```
  - `formatAge(min: number, max: number | null): string`; `drillMeta(d: DrillSummary): string`; `drillHeader(d: DrillSummary): { age: string; players: string; minutes: string }`
  - `AGE_OPTIONS = [8, 10, 12, 14, 16, 18]`, `PLAYER_OPTIONS = [4, 6, 8, 10, 12, 14, 16]`, `MINUTE_OPTIONS = [5, 10, 15, 20, 30]`
  - `parseDrillFilters(searchParams: Record<string, string | string[] | undefined>): DrillFilters`; `filterHref(pathname: string, current: DrillFilters, patch: Partial<Record<keyof DrillFilters, string | number | undefined>>): string`; `hasActiveFilters(f: DrillFilters): boolean`
  - `drillPermissions(ctx: ClubContext, drill: { status: DrillStatus; createdByMe: boolean }): { edit: boolean; publish: boolean; archive: boolean }`
  - `Action` añade `'drill.create' | 'drill.publish'`; `activeNavKey` → `'train'` en `/c/{slug}/drills…`.

Reglas: `parseDrillFilters` toma el primer valor de cada array; `q` recortado (vacío → ausente, truncado a 80); `focus`/`principle` con `^[a-z0-9]+(-[a-z0-9]+)*$`; enteros `age` 8–18, `players` 1–40, `minutes` 1–120; lo inválido se ignora. `filterHref` ordena `q, focus, principle, age, players, minutes`, sin `?` vacío. `drillPermissions`: admin → `edit`, `publish` si no está publicado, `archive` si no está archivado; coach → solo `edit` en borrador propio. `can`: `drill.create` admin o coach; `drill.publish` admin.

- [x] **Step 1: Tests que fallan**
  - `format.test.ts`: `formatAge(12, null) === 'U12+'`, `(10, 14) === 'U10–U14'`, `(12, 12) === 'U12'`; `drillMeta` → `'U12+ · 6–12 jug. · 10–15 min'` y con rangos iguales `'U10+ · 8 jug. · 12 min'`; `drillHeader` → `{ age: 'U12+', players: '6–12 jugadores', minutes: '10–15 minutos' }`; con 1 y 1 → `'1 jugador'`, `'1 minuto'`.
  - `filters.test.ts`: `{ q: '  transicion ', age: '12', players: '10' }` → `{ q: 'transicion', age: 12, players: 10 }`; `{ age: 'abc', players: '0', minutes: '500', focus: 'DROP TABLE' }` → `{}`; `q` de 200 → 80; `filterHref('/c/club-a/drills', { focus: 'rebote', age: 12 }, { focus: undefined })` → `'/c/club-a/drills?age=12'`.
  - `permissions.test.ts`: rol × estado × autoría; `can` con coach, admin y player.
  - `navigation.test.ts`: `activeNavKey('/c/club-a/drills/abc', 'club-a') === 'train'`.
- [x] **Step 2:** `pnpm test src/modules src/lib` → FAIL.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [x] **Step 5: Commit** `git commit -m "feat(drills): tipos, formato, filtros por URL y permisos"`

---

### Task 7: Consultas y acciones de ejercicios

**Files:**
- Create: `src/modules/drills/schema.ts`, `queries.ts`, `actions.ts`, `src/modules/media/storage.ts` (+ tests)

**Interfaces:**
- Consumes: `createClient`; `ActionResult`, `fromDbError`, `requireClub`, `can`, `getStandards(ctx)`, `getPrinciples(ctx)` (Fase 2); Tasks 3, 4 y 6.
- Produces:
  - `VIDEO_URL_RE = /^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com)\/\S*$/`; `type DrillInput = Omit<DrillDetail, 'id' | 'status' | 'focus' | 'diagramUrl' | 'principles' | 'principlesSectionSlug' | 'standards' | 'createdByMe' | 'updatedAt'> & { principleIds: string[]; standardIds: string[] }`; `drillInputSchema` (Zod, `fieldErrors` con esas claves).
  - `MEDIA_BUCKET = 'club-media'`; `type MediaFolder = 'drills'`; `mediaPath(orgId: string, kind: MediaFolder, ownerId: string, ext: 'png' | 'jpg' | 'webp'): string` → `org/{orgId}/{kind}/{ownerId}/{randomUUID()}.{ext}`; `signedUrl(path: string, expiresIn = 600): Promise<string | null>` (sesión del usuario).
  - `getFocusAreas(ctx): Promise<FocusArea[]>`; `searchDrills(ctx, filters: DrillFilters): Promise<DrillSummary[]>`; `getDrill(ctx, drillId: string): Promise<DrillDetail | null>`; `getDrillFormOptions(ctx): Promise<{ focusAreas: FocusArea[]; principles: GamePrinciple[]; standards: Standard[] }>`.
  - `createDrill(clubSlug: string, input: DrillInput): Promise<ActionResult<{ id: string }>>`; `updateDrill(clubSlug: string, input: { drillId: string; expectedUpdatedAt: string; drill: DrillInput }): Promise<ActionResult<{ updatedAt: string }>>`; `publishDrill(clubSlug: string, input: { drillId: string }): Promise<ActionResult<null>>`; `archiveDrill(clubSlug: string, input: { drillId: string }): Promise<ActionResult<null>>`.

Reglas: `searchDrills` → `rpc('search_drills', …)` (ausentes como `null`) con `drill_focus_areas(focus_areas(slug,name,sort))`, `order('title')`, `limit(100)`. `getDrill`: `null` sin consultar si no es uuid; siempre `eq('organization_id', ctx.org.id)`; hijos por `sort`, Standards por `number`; descarta principios o Standards `null` (no publicados); `diagramUrl` con `signedUrl`; `principlesSectionSlug` de la sección publicada `principles`; `createdBy` = `created_by`; `createdByMe` frente a `auth.getUser()`. Acciones: Zod antes de la BD, `fromDbError` y `revalidatePath` de `/c/{slug}/drills` y `/c/{slug}/way` (`'layout'`). `createDrill` exige `drill.create`; publicar y archivar exigen `drill.publish` y hacen `update({ status })` por `id` y club con `select('id')` (0 filas → `NOT_FOUND`).

`fieldErrors`: `title` «Escribe un título de 3 a 80 caracteres.»; `minPlayers` «Elige entre 1 y 40 jugadores.»; `maxPlayers` «El máximo de jugadores no puede ser menor que el mínimo.»; `minMinutes` «Elige entre 1 y 120 minutos.»; `maxMinutes` «La duración máxima no puede ser menor que la mínima.»; `maxAge` «La edad máxima no puede ser menor que la mínima.»; `focusAreaIds` «Elige al menos un objetivo.»; `coachingPoints` (máx. 8; variantes máx. 5) «Marca como clave 3 puntos como máximo.» o «Escribe el punto o quítalo.»; `setupMd` «La organización admite hasta 5000 caracteres.»; `videoUrl` «Pega un enlace de YouTube o Vimeo que empiece por https://.».

- [x] **Step 1: Tests que fallan** (mocks de `createClient` y `requireClub`, club `club-a`):
  - `storage.test.ts`: `mediaPath('o1','drills','d1','png')` casa con `^org/o1/drills/d1/[0-9a-f-]{36}\.png$`.
  - `queries.test.ts`: `searchDrills(ctx, { q: 'transicion', age: 12 })` → RPC con `p_q: 'transicion', p_age: 12` y el resto `null`; `getDrill(ctx, 'abc')` → `null` sin llamadas; `getDrill` filtra por club, ordena puntos, descarta un Standard `null` y marca `createdByMe`.
  - `actions.test.ts`: `maxPlayers < minPlayers` → `INVALID` con `fieldErrors.maxPlayers`, sin RPC; `https://youtube.com.evil.com/x` → `fieldErrors.videoUrl`; `createDrill` válido → `save_drill` con `p_drill: null`, `{ ok: true, data: { id } }` y `revalidatePath`; `updateDrill` pasa `'2026-10-03T10:00:00.123456+00:00'` intacto; error `{ code: 'P0001', message: 'STALE_COPY' }` → `STALE_COPY`, `P0002` → `NOT_FOUND`, otro → `SAVE_FAILED`; `publishDrill` de un coach o con 0 filas → `NOT_FOUND`.
- [x] **Step 2:** `pnpm test src/modules src/lib` → FAIL.
- [x] **Step 3:** Implementar (`actions.ts` con `'use server'`).
- [x] **Step 4:** `pnpm test && pnpm typecheck` → PASS.
- [x] **Step 5: Commit** `git commit -m "feat(drills): consultas y acciones con validación y STALE_COPY"`

---

### Task 8: Subida de diagramas

**Files:**
- Create: `src/modules/media/diagram-file.ts`, `diagram-file.test.ts`, `storage.int.test.ts`, `scripts/lib/user-client.ts`
- Modify: `src/modules/drills/actions.ts` (+ test), `next.config.ts`

**Interfaces:**
- Consumes: `createClient`, `createAdminClient`; Task 2; seed (Task 5); `mediaPath`, `signedUrl` (Task 7).
- Produces:
  - `MAX_DIAGRAM_BYTES = 2_097_152`; `DIAGRAM_ERROR = 'Sube una imagen PNG, JPEG o WebP de hasta 2 MB.'`; `validateDiagramFile(file: { type: string; size: number }): 'ok' | 'type' | 'size'`; `sniffImageType(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | null` (`89 50 4E 47 0D 0A 1A 0A`, `FF D8 FF`, `RIFF????WEBP`).
  - `uploadDrillDiagram(clubSlug: string, input: FormData): Promise<ActionResult<{ mediaId: string; previewUrl: string }>>` (campos `drillId` y `file`, validados con Zod).
  - `signInAs(email: string): Promise<SupabaseClient<Database>>` (OTP de `generateLink` + `verifyOtp` con la clave publicable); las fases siguientes lo importan.

Reglas: `uploadDrillDiagram` valida tamaño, tipo y bytes (si falla, `INVALID` con `fieldErrors.diagram = DIAGRAM_ERROR` sin tocar Storage), sube a `mediaPath(ctx.org.id, 'drills', drillId, ext)` con `{ contentType: <tipo detectado>, upsert: false }` e inserta `media_assets` (`kind 'image'`); si la inserción falla, `remove([path])` y `SAVE_FAILED`. No toca `drills`: `diagramMediaId` se guarda con `updateDrill`. `next.config.ts`: `experimental.serverActions.bodySizeLimit = '3mb'`.

- [x] **Step 1: Tests que fallan**
  - `diagram-file.test.ts`: cabecera PNG → `'png'`; `'<svg …><script>'` → `null`; `{ type: 'image/svg+xml', size: 100 }` → `'type'`; 20 MB → `'size'`; `2097152` → `'ok'`, `2097153` → `'size'`.
  - `actions.test.ts` (Review Focus 3): SVG llamado `x.png` con tipo `image/png` y fichero de 20 MB → `INVALID` + `DIAGRAM_ERROR` sin `upload`; PNG válido → `upload` con `{ contentType: 'image/png', upsert: false }` e inserción; inserción fallida → `remove([path])` y `SAVE_FAILED`.
  - `storage.int.test.ts` (Review Focus 3 y 4): en la carpeta de «Bloqueo de rebote», Irene sube SVG (`image/svg+xml`) y PNG de 3 MB → error, PNG de 1 KB → OK; Álex lo firma, Marta no; Álex no sube a `org/{Club Demo}/drills/…` ni a la carpeta de Irene. Clientes con `signInAs`; limpia con `createAdminClient`.
- [x] **Step 2:** `pnpm test src/modules && pnpm test:int src/modules/media` → FAIL.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** Los dos comandos → PASS.
- [x] **Step 5: Commit** `git commit -m "feat(media): subida de diagramas validada por bytes y URLs firmadas"`

---

### Task 9: Componentes de la biblioteca

**Files:**
- Create: `src/ui/court.tsx`, `drill-card.tsx`, `filter.tsx`, `bottom-sheet.tsx`, `search.tsx`, `coaching-points-list.tsx` (+ tests), `top-navigation.test.tsx`
- Modify: `src/ui/top-navigation.tsx`, `package.json` (`@radix-ui/react-dialog`)
- Reference: `design/components/{DrillCard,Filter,Search,StandardBadge,TopNavigation}/`

**Interfaces:**
- Consumes: `DrillSummary`, `drillMeta` (Task 6); `Card` (Fase 1).
- Produces:
  - `CourtThumb({ size?: 'thumb' | 'full' })`: pista vacía en SVG (`thumb` 80×60, `full` 4:3), `aria-label="Pista sin diagrama"`. `CourtDiagram({ src: string | null; alt: string })`: `<img>` 4:3 o `CourtThumb size="full"`.
  - `DrillCard({ drill: DrillSummary; href: string; action?: ReactNode })`: `CourtThumb`, título, `drillMeta`, etiqueta del primer focus y «Borrador» si lo es.
  - `type FilterProps = { label: string; options: Array<{ value: string; label: string }>; value: string | null; onChange: (v: string | null) => void }`; `Filter(props: FilterProps)` («Todos» primero, `aria-pressed`); `FilterSheetChip(props: FilterProps & { title: string })` (muestra `label` o la opción elegida pulsada; abre `BottomSheet` con `title`, «Cualquiera» y las opciones); `FilterTag({ children })`.
  - `BottomSheet({ open: boolean; onOpenChange: (open: boolean) => void; title: string; children: ReactNode; footer?: ReactNode })` (Dialog de Radix, `radius-xl`, `shadow-sheet`, botón «Cerrar»); las fases siguientes lo reutilizan.
  - `Search({ placeholder: string; defaultValue?: string; onSearch: (q: string) => void; debounceMs?: number })` (250 por defecto).
  - `CoachingPointsList({ points: Array<{ text: string; isKey: boolean }> })`: en orden; los clave con «Clave».
  - `TopNavigation` variante `{ variant: 'detail'; title: string; backHref: string; action?: { label: string; href: string } }`: volver 44×44 con `aria-label="Volver"`.

- [x] **Step 1: Tests que fallan**
  - `drill-card.test.tsx`: título, «U12+ · 6–12 jug. · 10–15 min», «Rebote», `href`; borrador → «Borrador»; pinta `action`.
  - `court.test.tsx`: con `src` → `img` `alt="Diagrama de Rebote + outlet"`; sin `src` → «Pista sin diagrama».
  - `filter.test.tsx`: «Todos» pulsado con `value` null; «Rebote» → `onChange('rebote')`; «Todos» → `onChange(null)`; `FilterSheetChip` con `'12'` muestra «U12» pulsado; «Cualquiera» → `onChange(null)`.
  - `bottom-sheet.test.tsx`: con `open` muestra `title`, `children` y `footer`; «Cerrar» llama a `onOpenChange(false)`.
  - `search.test.tsx` (timers falsos): «outl» → `onSearch('outl')` una vez a los 250 ms.
  - `coaching-points-list.test.tsx`: 3 de 5 con «Clave». `top-navigation.test.tsx`: «Volver» a `backHref`, título y acción.
- [x] **Step 2:** `pnpm test src/ui` → FAIL.
- [x] **Step 3:** Implementar siguiendo las vistas previas.
- [x] **Step 4:** `pnpm test && pnpm check:guards` → PASS.
- [x] **Step 5: Commit** `git commit -m "feat(ui): DrillCard, pista, filtros, hoja inferior, búsqueda y coaching points"`

---

### Task 10: Pantalla de biblioteca

**Files:**
- Create: `src/app/c/[club]/(app)/drills/page.tsx`, `loading.tsx`, `error.tsx`, `filters-bar.tsx`, `e2e/drills-library.spec.ts`
- Modify: `src/app/c/[club]/(app)/train/page.tsx`

**Interfaces:**
- Consumes: `requireClub`, `can`, `getPrinciples`; Tasks 6, 7 y 9; `loginAs`.
- Produces: `DrillFiltersBar({ filters: DrillFilters; focusAreas: FocusArea[]; principleTitle: string | null })` (cliente; `router.replace(filterHref(…), { scroll: false })` en `useTransition`).

Orden: `TopNavigation` detail «Biblioteca» (vuelve a `/train`; «Nuevo» si `drill.create`) → `Search` «Buscar ejercicios…» → `Filter` «Objetivo» → `FilterSheetChip` «Edad» («U12»), «Jugadores» («10 jug.»), «Duración» («15 min») → con `principle`, chip pulsado «Principio: {título}» (`aria-label="Quitar filtro de principio"`) → «{n} ejercicios» («1 ejercicio») → `Card flush` de `DrillCard`. Vacío con filtros: `EmptyState` «No hay ejercicios con estos filtros» / «Prueba con otra búsqueda o con menos filtros.» / «Quitar filtros» → `/c/{slug}/drills`. Sin ejercicios: «Aún no hay ejercicios» / «Crea el primero para empezar la biblioteca del club.» / «Nuevo ejercicio». `LoadingState rows={6}`; `ErrorState` «No se pudo cargar la biblioteca» / «Revisa la conexión y vuelve a intentarlo.». `/train`: `SectionHeader` «Biblioteca» + `ListRow` «Biblioteca de ejercicios» / «Busca por objetivo, edad y duración» sobre el estado vacío de la Fase 1.

- [x] **Step 1: E2E que falla** `e2e/drills-library.spec.ts`:
  - `desde Entrenar`: Álex pulsa «Biblioteca de ejercicios»; Entrenar sigue activa; ve «Rebote + outlet» con «U12+ · 6–12 jug. · 10–15 min» y no «Bloqueo de rebote».
  - `buscar sin tilde`: «transicion» → URL con `q=transicion` y «4x4 transición».
  - `filtros combinados`: «Transición» + «U10» → «3 calles» y «Contraataque 2x1», sin «3x2 continuo».
  - `sin resultados`: `?focus=rebote&age=10` → «No hay ejercicios con estos filtros»; «Quitar filtros» → `/c/arcangel/drills` con «Rebote + outlet». Irene, con el mismo filtro, ve «Bloqueo de rebote» y «Borrador».
  - `cada club su biblioteca`: Marta ve «Tiro en carrera»; «outlet» → estado vacío.
  - `cabe en el móvil`: `scrollWidth <= 375`; chips, buscador y filas ≥ 44 px; sin `console.error`.
- [x] **Step 2:** `pnpm test:e2e e2e/drills-library.spec.ts` → FAIL.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** `pnpm test:e2e e2e/drills-library.spec.ts && pnpm check:guards` → PASS.
- [x] **Step 5: Commit** `git commit -m "feat(drills): biblioteca con búsqueda y filtros en la URL"`

---

### Task 11: Ficha de ejercicio

**Files:**
- Create: `src/app/c/[club]/(app)/drills/[drillId]/page.tsx`, `loading.tsx`, `error.tsx`, `drill-admin-actions.tsx`, `e2e/drill-detail.spec.ts`

**Interfaces:**
- Consumes: `requireClub`, `StandardBadge`, `MarkdownBody`, `formatStandardNumber`; `getDrill`, `publishDrill`, `archiveDrill`, `drillPermissions`, `drillHeader`, `CourtDiagram`, `CoachingPointsList` (Tasks 6, 7, 9).
- Produces: `DrillAdminActions({ clubSlug: string; drillId: string; canPublish: boolean; canArchive: boolean })` (cliente).

Orden: detail «Ejercicio» («Editar» si `perms.edit`) → título → «Borrador» + «Solo lo ven su autor y dirección hasta que se publique.» o «Archivado» + «Este ejercicio está archivado y no sale en la biblioteca.» → píldoras de `drillHeader` → `CourtDiagram` («Diagrama de {título}») → «Objetivo» → «Organización» (`MarkdownBody`) → «Coaching points» → `terminology.standards ?? 'Standards'` con hasta 3 `StandardBadge` (`/c/{slug}/way/standards#standard-{NN}`) y «+N» → «Principios» (`/c/{slug}/way/{principlesSectionSlug}#principle-{slug}`) → «Variantes» → «Material» → «Vídeo» con «Ver vídeo» (`target="_blank" rel="noopener noreferrer"`). Sin secciones vacías. «Publicar» (`primary block`) y «Archivar» (`secondary`, confirma en un `BottomSheet` «¿Archivar este ejercicio?» / «Dejará de salir en la biblioteca. Las sesiones que ya lo usan lo conservan.» / «Archivar» / «Cancelar»). Id no uuid o `getDrill` null → `notFound()`. `ErrorState` «No se pudo cargar el ejercicio» / «Revisa la conexión y vuelve a intentarlo.».

- [x] **Step 1: E2E que falla** `e2e/drill-detail.spec.ts`:
  - `ficha completa`: Álex abre «Rebote + outlet»: «U12+», «6–12 jugadores», «10–15 minutos», objetivo, 3 de 5 puntos con «Clave», badges «03», «04», «05» (`href` acaba en `/way/standards#standard-03`), «Balones», «Conos», «Petos», «Pista sin diagrama»; sin «Añadir a sesión», «Editar», «Publicar» ni «Archivar».
  - `el borrador de otro es un 404` (Review Focus 1): Álex abre `/c/arcangel/drills/{seedId('arcangel','drill:bloqueo-de-rebote')}` y un `randomUUID()`: «No encontramos esta página» con el mismo texto de `main`; Irene ve «Borrador» y «Editar»; Raúl ve «Publicar».
  - `archivar` (Review Focus 5): con un publicado `E2E archivado {ts}`, Raúl lo archiva; buscándolo, estado vacío; Álex abre su URL y ve «Archivado». Sin `console.error` y `scrollWidth <= 375`.
- [x] **Step 2:** `pnpm test:e2e e2e/drill-detail.spec.ts` → FAIL.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** `pnpm test:e2e e2e/drill-detail.spec.ts` → PASS.
- [x] **Step 5: Commit** `git commit -m "feat(drills): ficha con diagrama, coaching points y Standards"`

---

### Task 12: Crear y editar ejercicios

**Files:**
- Create: `src/app/c/[club]/(app)/drills/new/page.tsx`, `[drillId]/edit/page.tsx`, `drill-form.tsx`, `e2e/fixtures/diagram.png`, `diagram.svg`, `e2e/drill-editor.spec.ts`
- Modify: `playwright.config.ts` (`drill-editor.spec.ts` y `drill-detail.spec.ts` al `testMatch` del proyecto `admin`, en serie)

**Interfaces:**
- Consumes: Tasks 6, 7 y 8.
- Produces: `DrillForm({ clubSlug: string; mode: 'new' | 'edit'; drill: DrillDetail | null; options: { focusAreas: FocusArea[]; principles: GamePrinciple[]; standards: Standard[] } })` (cliente).

Campos: «Título», «Resumen», «Objetivo», «Organización» («Admite negritas, cursivas y listas.»), «Jugadores» y «Duración (min)» con «Mín.»/«Máx.», «Edad mínima», «Edad máxima» («Sin máximo» + U8–U18), «Objetivos», «Principios» y «Standards» como chips con `aria-pressed`, «Coaching points» (texto y conmutador «Clave») y «Variantes» (título y descripción), ambas con «Subir», «Bajar», «Quitar» y «Añadir punto»/«Añadir variante», «Material» («Separa con comas.»; se recorta y se quitan vacíos y duplicados), «Vídeo (YouTube o Vimeo)». «Diagrama» solo en edición: `accept="image/png,image/jpeg,image/webp"`, «Subir diagrama»/«Cambiar diagrama», «Quitar diagrama», «Subiendo…», fallo «No se pudo subir el diagrama. Inténtalo de nuevo.»; en alta, «Guarda el borrador para añadir un diagrama.». Botones «Guardar borrador» o «Guardar cambios», y «Cancelar». `INVALID` → «Revisa los campos marcados.» + mensajes por campo; `SAVE_FAILED`/`STALE_COPY` con el copy común, sin perder lo escrito. `validateDiagramFile` antes de enviar. Tras guardar, `router.push` a la ficha. Cabeceras «Nuevo ejercicio» / «Editar ejercicio»; sin `drill.create` o `perms.edit` → `notFound()`.

- [x] **Step 1: E2E que falla** `e2e/drill-editor.spec.ts`:
  - `crea un borrador`: Álex rellena título, 4–8, 10–10, U10, «Tiro» y dos puntos; «Subir» el segundo y «Clave»; «Guardar borrador» → ficha con «Borrador» y el nuevo orden; Irene, en su URL → «No encontramos esta página».
  - `sube un diagrama`: en edición sube `diagram.png` y guarda → `img` con `src` que contiene `/storage/v1/object/sign/club-media/org/`.
  - `rechaza SVG y ficheros grandes` (Review Focus 3): `diagram.svg` y un buffer de 20 MB `big.png` → «Sube una imagen PNG, JPEG o WebP de hasta 2 MB.»; 0 filas en `media_assets` y 0 objetos en la carpeta.
  - `vídeo no permitido`: `https://example.com/v` → «Pega un enlace de YouTube o Vimeo que empiece por https://.».
  - `copia antigua`: dos páginas de Álex guardan el mismo borrador, una tras otra → «Alguien ha cambiado esto mientras editabas. Recarga para ver la última versión.».
  - `dirección publica`: Raúl pulsa «Publicar»; Álex lo encuentra en la biblioteca y ya no ve «Editar».
- [x] **Step 2:** `pnpm test:e2e e2e/drill-editor.spec.ts` → FAIL.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** `pnpm test:e2e e2e/drill-editor.spec.ts && pnpm typecheck` → PASS.
- [x] **Step 5: Commit** `git commit -m "feat(drills): crear y editar ejercicios con diagrama"`

---

### Task 13: Del principio al ejercicio en The Way

**Files:**
- Create: `e2e/way-drills.spec.ts`
- Modify: `src/modules/drills/queries.ts` (+ test), `src/ui/principle-card.tsx`, `src/app/c/[club]/(app)/way/[section]/page.tsx`, `way/standards/page.tsx`

**Interfaces:**
- Consumes: `PrincipleCard`, `StandardBlock`, `getWaySection`, `formatStandardNumber`; `DrillCard`.
- Produces: `getRelatedDrills(ctx: ClubContext, principleIds: string[]): Promise<Record<string, DrillSummary[]>>` (publicados, por título, máximo 3 por principio); `PrincipleCard` acepta `related?: { drills: DrillSummary[]; href: string }` y lleva `id="principle-{slug}"`; cada `StandardBlock` lleva `id="standard-{NN}"`.

Reglas: solo en secciones `principles`. Bloque «Ejercicios relacionados» con hasta 3 `DrillCard` y «Ver todos en la biblioteca» → `/c/{slug}/drills?principle={slug}`; sin ejercicios, «Aún no hay ejercicios con este principio.».

- [x] **Step 1: Tests que fallan**
  - `queries.test.ts`: `getRelatedDrills` filtra `published` y corta en 3 por principio, en orden.
  - `way-drills.spec.ts`: `del principio al ejercicio`: Álex → «Cómo jugamos» → «Transición» muestra «3 calles», «3x2 continuo» y «4x4 transición» → «Ver todos en la biblioteca» → `principle=transicion`, chip «Principio: Transición», «Contraataque 2x1» y «Rebote + outlet» → su ficha → badge «03» → `/way/standards#standard-03` visible. `sin borradores`: Irene ve en «Rebote» «Rebote + outlet» y no «Bloqueo de rebote».
- [x] **Step 2:** `pnpm test src/modules/drills && pnpm test:e2e e2e/way-drills.spec.ts` → FAIL.
- [x] **Step 3:** Implementar.
- [x] **Step 4:** Los dos comandos → PASS.
- [x] **Step 5: Commit** `git commit -m "feat(way): ejercicios relacionados por principio"`

---

### Task 14: Cierre de fase

**Files:**
- Modify: lo que salga de la revisión (sin funcionalidad nueva)

- [ ] **Step 1:** `pnpm supabase db reset && pnpm seed && pnpm db:types`; `git diff --exit-code src/lib/database.types.ts` limpio.
- [ ] **Step 2:** `pnpm lint && pnpm typecheck && pnpm check:guards && pnpm test && pnpm test:db && pnpm test:int && pnpm test:e2e` en verde; `pnpm supabase db lint` sin errores en las funciones nuevas.
- [ ] **Step 3:** Revisión en móvil real con Álex (búsqueda, filtros, borrador con foto como diagrama), Irene, Raúl (publicar, archivar), Nora y Marta: marca del club, hojas inferiores, áreas táctiles, consola limpia.
- [ ] **Step 4: Commit** `git commit -m "chore: cierre de la Fase 3"` y abrir PR de la Fase 3.

---

## Cambios propuestos al contrato

Lo que la fase cambió de verdad, ya recogido en el bloque «Fase 3 · Biblioteca de ejercicios — produce» y en las convenciones C14–C21 de `2026-10-03-00-contratos-entre-fases.md` (el porqué de cada punto está en «Desviaciones del plan durante la ejecución»).

- **SQL nuevo:**
  - Funciones de `private`: `f_unaccent`, `f_search_key`, `can_see_drill`, `can_edit_drill`, `storage_org_id`, `can_upload_drill_media`, `can_see_drill_media`, `can_see_media` y `check_drill_diagram` (con el trigger `drills_check_diagram`, `after insert or update`).
  - `private.set_updated_at()` redefinida con `clock_timestamp()` para todas las tablas.
  - `public.search_drills(p_org, p_q, p_focus, p_principle, p_age, p_players, p_minutes)` y `public.save_drill(p_org, p_drill, p_expected_updated_at, p_payload)`, `security invoker`, ejecutables solo por `authenticated`; todos sus parámetros menos `p_org` llevan `default null`.
  - `drills.created_by` y `media_assets.created_by` admiten null (`on delete set null`).
  - `update` de `drills` por columnas para `authenticated`: una columna de contenido nueva se añade al grant.
- **Visibilidad y Storage:**
  - `can_see_drill`: solo `admin` o `coach` del club; los archivados se ven (histórico); el borrador, su autor y los admins. No «publicado y miembro».
  - La lectura, la subida y el borrado de `club-media` siguen la regla del ejercicio de la carpeta, no el primer segmento de la ruta. Nada fuera de `org/{org}/drills/{drill}/` se lee todavía: cada prefijo nuevo trae sus políticas.
  - El bucket comprueba tipo declarado y tamaño, no los bytes.
- **TS nuevo:**
  - `src/modules/drills/`: `DrillStatus`, `FocusArea`, `DrillSummary`, `DrillSearchResult`, `DrillDetail` (con `principleIds` y `standardIds`), `DrillFilters` (con `principle`), `formatAge`, `drillMeta`, `drillHeader`, `AGE_OPTIONS`, `PLAYER_OPTIONS`, `MINUTE_OPTIONS`, `MAX_QUERY_LENGTH`, `SEARCH_LIMIT`, `RELATED_PER_PRINCIPLE`, `parseDrillFilters`, `filterHref`, `hasActiveFilters`, `drillPermissions`, `VIDEO_URL_RE`, `drillInputSchema`, `DrillInput` (sin `createdBy`), `getFocusAreas`, `searchDrills` (devuelve `{ drills, hasMore }`), `getDrill`, `getRelatedDrills`, `getDrillFormOptions`, `createDrill`, `updateDrill`, `publishDrill`, `archiveDrill`, `uploadDrillDiagram` (devuelve `previewUrl: string | null`).
  - `src/modules/media/`: `MEDIA_BUCKET`, `MediaFolder`, `mediaPath`, `signedUrl`, `MAX_DIAGRAM_BYTES`, `DIAGRAM_ERROR`, `validateDiagramFile`, `sniffImageType`.
  - `Action` añade `'drill.view' | 'drill.create' | 'drill.publish'`.
  - Para todas las fases: `src/lib/mutate.ts`, `src/lib/use-action.ts`, `src/lib/read-error.ts`, `src/lib/uuid.ts`, `src/lib/routes.ts`, `src/lib/unsaved-changes.ts` y `signInAs` de `scripts/lib/user-client.ts`.
- **UI nueva:**
  - `BottomSheet`, `FilterProps`, `FilterSheetChip`, `FilterTag`, `FilterRow` y `Chip` (exportados), `Search` (con `maxLength`), `CourtThumb` (con `decorative`), `CourtDiagram`, `CoachingPointsList`, `ScrollToHash`, `FormAlert` (con `focus`) y `hint` en los campos de texto.
  - De las pantallas: `DrillFiltersBar`, `DrillAdminActions` y `DrillForm` (con `standardsLabel`).
  - `TopNavigation` con la variante `detail` y la convención de que la página, su `loading.tsx` y su `error.tsx` montan la misma cabecera.
  - `DrillCard` acepta `action` (el «Añadir» de la Fase 4) y no enseña Standards; `PrincipleCard` acepta `related`; el «+N» de la ficha enlaza a los Standards. La Fase 4 conserva en `/train` la entrada «Biblioteca de ejercicios».
- **Tests y seed:**
  - Los tests de integración que necesitan la clave de servicio viven en `scripts/` (`scripts/media/storage.int.test.ts`); `pnpm test:int` incluye Storage.
  - `restoreSeed` (`WRITABLE_TABLES`) y la limpieza de Storage se amplían con lo que escriben los specs; `SESSION_USERS` incluye a Irene; `e2e/helpers/slow-content.ts`.
  - El seed sale de `buildSeedData` (`SeedDrill`, `buildDrillRows`); no hay `seedDrills` ni `linkPracticeItems`. 18 ejercicios de Arcángel (uno es el borrador de Irene) y 2 de Club Demo, con Standards enlazados por número.
  - `src/lib/test-support.ts` (`fakeSupabase` con `rpc`, `in` y `!inner`) y `src/ui/test-support.ts` (`clientBoundary`, `installChipRowLayout`).
- **Configuración:** `next.config.ts` con `experimental.serverActions.bodySizeLimit = '3mb'` (para todas las Server Actions de la app, no solo la de subida).
