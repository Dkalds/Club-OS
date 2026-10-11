# Estructura del club · Plan de implementación

> **Para quien lo ejecute:** se trabaja tarea a tarea, con TDD (test que falla, código mínimo, test en verde, commit). Las casillas (`- [ ]`) llevan la cuenta.

**Objetivo:** que la dirección cree y mantenga desde Gestión las temporadas, categorías, equipos y personas de su club.

**Arquitectura:** las seis tablas ya existen y solo se leían. Una migración les da escritura para la dirección (políticas y `grant` por columnas) y cuatro funciones `security invoker` para lo que toca varias filas. Un módulo nuevo, `src/modules/structure/`, con sus esquemas, lecturas y acciones (esqueleto `mutate`). Las pantallas van en `src/app/c/[club]/admin/`, exportadas con `adminPage`, reutilizando `EditorForm`, `ItemCard` y `NewItemCard`.

**Stack:** Next.js 16, React 19, Supabase (Postgres, RLS, pgTAP), Zod 4, Vitest, Playwright.

**Especificación:** `docs/superpowers/specs/2026-10-11-estructura-del-club-design.md`.

## Restricciones globales

- Aislamiento: toda escritura lleva `organization_id` del club de la URL; las acciones acotan al club antes de llamar a una función que solo recibe un id (C25). Sin política no hay acceso.
- Menores: solo `birth_year`. URLs con uuid.
- La clave de servicio no entra en `src/`. Nada de un club en `src/`. Solo tokens.
- Errores: `NOT_FOUND` primero (C26); argumentos opcionales de RPC ausentes, nunca `null` (C15); `grant` por columnas y `posture.test.sql` al día (C17, C27).
- Interfaz en español, tuteando, sin exclamaciones; 375×812; áreas táctiles de 44 px.

## Foco de revisión

1. La dirección del club B escribe en una fila del club A llamando a la acción del club A con un id del B (y al revés): `NOT_FOUND`, sin escribir.
2. Quien entrena un equipo intenta cambiar su plantilla por la API directa: nada cambia.
3. Marcar como actual una temporada mientras otra persona hace lo mismo: nunca quedan dos actuales ni ninguna.
4. Un nombre repetido solo en mayúsculas o con espacios alrededor («ALEVÍN A », «Alevín A»): se rechaza marcando el campo.
5. Borrar un equipo con sesiones: `IN_USE`, y su plantilla sigue entera.

## Ficheros

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20270302000100_club_structure.sql` | Restricciones, `grant`, políticas y las cuatro funciones |
| `supabase/tests/database/club_structure.test.sql` | pgTAP de todo lo anterior |
| `src/lib/action-result.ts`, `src/lib/permissions.ts` | `IN_USE`; `club.manage` |
| `src/modules/structure/types.ts` | `SeasonSummary`, `SeasonDetail`, `Category`, `AdminTeam`, `PersonSummary`, `PersonDetail` |
| `src/modules/structure/schema.ts` | Esquemas Zod de cada acción |
| `src/modules/structure/format.ts` | `seasonDates`, `ageBandLabel`, `personName`, `matchesPerson`, `STAFF_ROLE_LABEL` |
| `src/modules/structure/queries.ts` | Lecturas de Gestión |
| `src/modules/structure/actions.ts` | Acciones |
| `src/modules/tenancy/navigation.ts` | «Temporada» y «Personas» en `adminNavItems` |
| `src/app/c/[club]/admin/season/**`, `teams/[teamId]`, `people/**` | Páginas |
| `src/app/c/[club]/admin/_components/{season,category,team,roster,staff,person}-*.tsx`, `person-picker.tsx`, `people-list.tsx` | Formularios y listas de cliente |
| `e2e/club-structure.spec.ts` | E2E, proyecto `admin` |

## Tareas

### 1. Base de datos

**Produce:**

```sql
create_season(p_org uuid, p_name text, p_starts_on date, p_ends_on date, p_copy_teams_from uuid default null) returns uuid
set_current_season(p_season uuid) returns void
delete_team(p_team uuid) returns void
add_new_player(p_team uuid, p_first_name text, p_last_name text, p_birth_year smallint default null,
               p_jersey_number smallint default null, p_position text default null) returns uuid
```

Restricciones: `seasons_dates_check (ends_on > starts_on)`; índices únicos `seasons_name_key (organization_id, lower(btrim(name)))`, `categories_name_key` (igual), `teams_name_key (organization_id, season_id, lower(btrim(name)))`; `check` de longitud (1 a 60 tras `btrim`) en los nombres de las cuatro tablas y de 30 en `team_players.position`.

`grant` a `authenticated`: `people` insert `(organization_id, first_name, last_name, birth_year)`, update `(first_name, last_name, birth_year, archived_at)`; `seasons` insert `(organization_id, name, starts_on, ends_on, is_current)`, update `(name, starts_on, ends_on, is_current)`, delete; `categories` insert `(organization_id, name, age_band, sort)`, update `(name, age_band, sort)`, delete; `teams` insert `(organization_id, season_id, category_id, name)`, update `(name, category_id)`, delete; `team_staff` insert (las cuatro), update `(staff_role)`, delete; `team_players` insert (las cinco), update `(jersey_number, position)`, delete.

- [x] pgTAP que falla (`club_structure.test.sql`): escritura por tabla y rol, restricciones, funciones, orden de errores, club ajeno.
- [x] Migración; `pnpm test:db` en verde; `posture.test.sql`; `pnpm db:types`; `supabase db lint`.
- [x] Commit.

### 2. Módulo `structure`

**Produce** (todas las acciones: `(clubSlug, input) => Promise<ActionResult<…>>`, permiso `club.manage`, rutas `ADMIN_ROUTE` y `/c/[club]/(app)`):

`createSeason`, `updateSeason`, `setCurrentSeason`, `deleteSeason`, `createCategory`, `updateCategory`, `deleteCategory`, `createTeam`, `updateTeam`, `deleteTeam`, `addStaff`, `setStaffRole`, `removeStaff`, `addPlayer` (persona existente), `addNewPlayer`, `updatePlayer`, `removePlayer`, `createPerson`, `updatePerson`, `setPersonArchived`.

Lecturas: `listSeasons(ctx)`, `getSeason(ctx, id | null)` (con sus equipos y el número de jugadores), `listCategories(ctx)` (con `inUse`), `getAdminTeam(ctx, id)`, `listPeople(ctx)` (todas, con archivadas y sus equipos de la temporada actual), `getPerson(ctx, id)`.

- [x] Tests de esquemas y de `format`; código.
- [x] Tests de acciones (permiso, club, validación, `23505` por campo, `23503` como `IN_USE`, `NOT_FOUND`); código.
- [x] Lecturas con sus tests.
- [x] Commit.

### 3. Pantallas

- [x] Navegación de Gestión y redirección de la raíz; `noTeamsState` lleva a Temporada.
- [x] Temporada (`season`, `season/[seasonId]`, `season/categories`).
- [x] Equipo (`teams/[teamId]`), con `PersonPicker`.
- [x] Personas (`people`, `people/[personId]`).
- [x] Tests de páginas y componentes.
- [x] Commit.

### 4. E2E y cierre

- [x] `e2e/club-structure.spec.ts` en `ADMIN_SPECS`.
- [x] Contratos, backlog y README («Despliegue de la estructura del club»).
- [x] Suite entera desde base vacía, repaso visual a 375×812, revisión de la rama y una tanda de arreglos.
