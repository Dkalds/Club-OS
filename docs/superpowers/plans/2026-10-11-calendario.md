# Calendario · Plan de implementación

> **Para quien lo ejecute:** se trabaja tarea a tarea, con TDD (test que falla, código mínimo, test en verde, commit). Las casillas (`- [ ]`) llevan la cuenta.

**Objetivo:** horarios semanales que crean los entrenamientos de la temporada, pistas del club y un registro de qué ha cambiado en cada evento.

**Arquitectura:** una migración con dos tablas nuevas (`venues`, `team_schedules`), dos columnas en `events` que mantiene la base (`venue_id` por trigger, `schedule_id` por funciones), una tabla de cambios que escribe un trigger (`event_changes`) y tres funciones `security definer` para el ciclo de un horario. Un módulo nuevo, `src/modules/calendar/`, con lo de Gestión (pistas y horarios); el registro de cambios se lee desde `src/modules/schedule/`, que ya es el de la Agenda. Las pantallas de la app solo ganan un aviso y una lista.

**Stack:** Next.js 16, React 19, Supabase (Postgres, RLS, pgTAP), Zod 4, Vitest, Playwright.

**Especificación:** `docs/superpowers/specs/2026-10-11-calendario-design.md`.

## Restricciones globales

- Aislamiento: tablas nuevas con `organization_id NOT NULL`, RLS, claves compuestas y sus tests pgTAP por club y por equipo. Las acciones acotan al club antes de llamar a una función que solo recibe un id (C25).
- Horas: `timestamptz`; la hora de un horario es la del reloj del club (`organizations.timezone`), nunca la del dispositivo ni UTC.
- La clave de servicio no entra en `src/`. Nada de un club en `src/`. Solo tokens.
- Errores: `NOT_FOUND` primero (C26); argumentos opcionales de RPC ausentes, nunca `null` (C15); `grant` por columnas y `posture.test.sql` al día (C17, C27).
- Interfaz en español, tuteando, sin exclamaciones; formatos «Martes 6 oct», «18:00–19:15», «75 min»; 375×812; áreas táctiles de 44 px.

## Foco de revisión

1. Un horario a las 18:00 que cruza el cambio de hora de octubre y el de marzo: todos sus entrenamientos son a las 18:00 del club.
2. Añadir dos veces el mismo horario, o un horario donde ya hay un entrenamiento a mano a esa hora: no duplica.
3. Quitar un horario con una sesión ya preparada y otra en directo: esas dos siguen; las vacías se borran.
4. Quien entrena intenta escribir `venue_id`, `schedule_id` o `event_changes` por la API directa: no puede.
5. La dirección del club B llama a las funciones de horarios con ids del club A: `NOT_FOUND`, sin escribir.

## Ficheros

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20270316000100_calendar.sql` | Tablas, columnas, triggers, políticas, `grant` y funciones |
| `supabase/tests/database/team_schedules.test.sql` | pgTAP |
| `src/modules/calendar/{types,schema,format,map-rows,queries,actions}.ts` | Pistas y horarios en Gestión |
| `src/modules/schedule/changes.ts` (+ `changes-queries.ts`) | El registro de cambios: tipos, texto de cada cambio y lecturas |
| `src/ui/event-changes.tsx` | `RecentChanges` (Inicio, Agenda) y `ChangeLog` (ficha) |
| `src/modules/schedule/queries.ts` | Los cancelados que aún no han pasado, en «Próximos» |
| `src/app/c/[club]/admin/calendar/page.tsx` | Gestión → Calendario |
| `src/app/c/[club]/admin/_components/{venue-editor,schedule-section}.tsx` | Formularios |
| `src/app/c/[club]/admin/teams/[teamId]/page.tsx` | «Horario semanal» |
| Fichas de sesión y de partido, Inicio y Agenda | El aviso y la lista de cambios |
| Formularios de sesión y de partido, `src/ui/form-field.tsx` | Sugerencias de «Lugar» |
| `scripts/seed/` | Las pistas de los clubes de ejemplo |
| `e2e/calendar.spec.ts` | E2E, proyecto `admin` |

## Tareas

### 1. Base de datos

**Produce:**

```sql
create_team_schedule(p_team uuid, p_weekday smallint, p_start_time time, p_duration_minutes smallint, p_venue uuid default null) returns jsonb  -- { id, created }
update_team_schedule(p_schedule uuid, p_weekday smallint, p_start_time time, p_duration_minutes smallint, p_venue uuid default null) returns integer
delete_team_schedule(p_schedule uuid) returns integer
```

Tablas `venues`, `team_schedules`, `event_changes`; `events.venue_id`, `events.schedule_id`; triggers `events_link_venue` (antes de insertar o cambiar `location`), `events_log_change` (después de cambiar) y `venues_rename_events`.

- [x] pgTAP que falla (`team_schedules.test.sql`).
- [x] Migración; `pnpm test:db` en verde; `posture.test.sql`; `pnpm db:types`; `supabase db lint`.
- [x] Seed: las pistas de los clubes de ejemplo, con sus tests.
- [x] Commit.

### 2. Módulo `calendar` y registro de cambios

**Produce:**

- `src/modules/calendar/`: `Venue`, `TeamSchedule`, `WEEKDAYS`, `scheduleLabel(schedule)`; `listVenues(ctx)`, `listTeamSchedules(ctx, teamId)`, `listSeasonSchedules(ctx)`; acciones `createVenue`, `renameVenue`, `deleteVenue`, `createTeamSchedule`, `updateTeamSchedule`, `deleteTeamSchedule` (permiso `club.manage`).
- `src/modules/schedule/changes.ts`: `EventChange`, `changeText(change, tz)`; `listRecentChanges(ctx, nowIso, limit)`, `listEventChanges(ctx, eventId)`.

- [x] Tests de esquemas, formato y acciones; código.
- [x] Lecturas con sus tests.
- [x] Commit.

### 3. Pantallas

- [x] Gestión → Calendario y «Horario semanal» en la página del equipo.
- [x] `RecentChanges` en Inicio y Agenda; `ChangeLog` y «quién lo puede cambiar» en las fichas; los cancelados que no han pasado, en «Próximos».
- [x] Sugerencias de «Lugar» en los formularios de sesión y de partido.
- [x] Tests de páginas y componentes.
- [x] Commit.

### 4. E2E y cierre

- [x] `e2e/calendar.spec.ts` en `ADMIN_SPECS`.
- [x] Contratos, backlog y README («Despliegue del calendario»).
- [x] Suite entera desde base vacía, repaso visual a 375×812, revisión de la rama y una tanda de arreglos.
