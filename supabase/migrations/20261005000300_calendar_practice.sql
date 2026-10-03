-- Calendario y planes de sesión: focos, eventos, partidos, planes e ítems.
--
-- Un solo calendario (`events`) para entrenamientos y partidos; el contenido va aparte:
-- `games` añade los datos del partido a su evento y `practice_plans` el plan de la sesión.
-- Un plan puede estar programado (con `event_id`), ser del equipo sin fecha, o ser una
-- plantilla privada de quien la creó (sin equipo).
--
-- RLS aísla en los mismos dos niveles que la estructura deportiva:
--   · entre clubes: toda tabla lleva `organization_id` y las claves foráneas son
--     compuestas `(organization_id, x_id)`, así que una fila no puede apuntar a otro club;
--   · dentro del club, por equipo: quien entrena un equipo no ve los eventos, los partidos
--     ni los planes de otro.
--
-- Como en las migraciones anteriores: en esta fase solo hay lectura para `authenticated`,
-- y los privilegios de cada tabla se fijan aquí de forma explícita.

-- ── Tipos ────────────────────────────────────────────────────────────────────────────
create type public.event_kind as enum ('practice', 'game');
create type public.event_status as enum ('scheduled', 'done', 'cancelled');

-- ── Tablas ───────────────────────────────────────────────────────────────────────────
-- Objetivos de trabajo del club (técnica, defensa…). El slug es único por club.
create table public.focus_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  slug text not null,
  name text not null,
  sort int not null default 0,
  unique (organization_id, slug),
  unique (organization_id, id)
);

-- Las horas son `timestamptz`; se muestran siempre en `organizations.timezone`.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  team_id uuid not null,
  kind public.event_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  status public.event_status not null default 'scheduled',
  unique (organization_id, id),
  check (ends_at > starts_at),
  foreign key (organization_id, team_id) references public.teams (organization_id, id)
);

create index events_team_id_starts_at_idx on public.events (team_id, starts_at);

-- Los datos del partido cuelgan de su evento: un partido por evento.
create table public.games (
  event_id uuid primary key,
  organization_id uuid not null references public.organizations (id),
  opponent_name text not null,
  competition_name text,
  home_away text check (home_away in ('home', 'away')),
  score_for smallint,
  score_against smallint,
  opponent_notes text,
  source text not null default 'manual',
  foreign key (organization_id, event_id) references public.events (organization_id, id)
);

-- `team_id`, `event_id` y los dos focos son opcionales. Con valor, tienen que ser del
-- mismo club; a null, esa clave foránea no se comprueba (MATCH SIMPLE). Un plan sin
-- equipo es una plantilla privada. `event_id` es único: un plan por evento.
-- `created_by` toma por defecto el usuario de la sesión; el seed, que escribe con la
-- clave de servicio y sin sesión, lo deja a null.
create table public.practice_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  team_id uuid,
  event_id uuid unique,
  title text not null,
  primary_focus_id uuid,
  secondary_focus_id uuid,
  notes text,
  is_template boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'ready', 'done')),
  actual_minutes smallint,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, team_id) references public.teams (organization_id, id),
  foreign key (organization_id, event_id) references public.events (organization_id, id),
  foreign key (organization_id, primary_focus_id)
    references public.focus_areas (organization_id, id),
  foreign key (organization_id, secondary_focus_id)
    references public.focus_areas (organization_id, id)
);

create index practice_plans_team_id_idx on public.practice_plans (team_id);

-- La duración de un plan es la suma de sus ítems; no se guarda. `drill_id` todavía no
-- tiene clave foránea: llega con la biblioteca de ejercicios. La posición es única por
-- plan y se comprueba al cerrar la transacción, para poder reordenar los ítems.
create table public.practice_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  plan_id uuid not null,
  sort int not null,
  phase text,
  drill_id uuid,
  title_override text,
  minutes smallint not null check (minutes between 1 and 120),
  notes text,
  completed boolean,
  actual_minutes smallint,
  unique (plan_id, sort) deferrable initially deferred,
  foreign key (organization_id, plan_id)
    references public.practice_plans (organization_id, id) on delete cascade
);

-- ── Funciones de RLS ─────────────────────────────────────────────────────────────────
-- Como `is_team_staff` y `can_see_person`: `security definer`, lee las tablas como su
-- propietario sin pasar por RLS (por eso la política de `practice_plans` puede apoyarse
-- en ella sin recursión), y solo responde por el usuario de la sesión, a través de su
-- membresía ACTIVA en el club del plan. Una membresía en otro club, o revocada, no cuenta.

-- ¿Puede el usuario ver este plan? Sí si es admin del club del plan, si lo creó, o si
-- está en el cuerpo técnico del equipo del plan (misma regla que `is_team_staff`). Un
-- plan sin equipo, una plantilla privada, solo lo ven quien lo creó y los admins.
create function private.can_see_plan(plan uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.practice_plans as pp
    join public.memberships as m
      on m.organization_id = pp.organization_id
    where pp.id = can_see_plan.plan
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role = 'admin'
        or pp.created_by = m.user_id
        or exists (
          select 1
          from public.team_staff as ts
          where ts.organization_id = pp.organization_id
            and ts.team_id = pp.team_id
            and ts.person_id = m.person_id
        )
      )
  );
$$;

revoke all on function private.can_see_plan(uuid) from public, anon;
grant execute on function private.can_see_plan(uuid) to authenticated;

-- ── RLS y privilegios ────────────────────────────────────────────────────────────────
alter table public.focus_areas enable row level security;
alter table public.events enable row level security;
alter table public.games enable row level security;
alter table public.practice_plans enable row level security;
alter table public.practice_items enable row level security;

revoke all on table public.focus_areas from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.games from anon, authenticated;
revoke all on table public.practice_plans from anon, authenticated;
revoke all on table public.practice_items from anon, authenticated;

grant select on table public.focus_areas to authenticated;
grant select on table public.events to authenticated;
grant select on table public.games to authenticated;
grant select on table public.practice_plans to authenticated;
grant select on table public.practice_items to authenticated;

grant select, insert, update, delete on table public.focus_areas to service_role;
grant select, insert, update, delete on table public.events to service_role;
grant select, insert, update, delete on table public.games to service_role;
grant select, insert, update, delete on table public.practice_plans to service_role;
grant select, insert, update, delete on table public.practice_items to service_role;

-- ── Políticas (solo lectura en esta fase) ────────────────────────────────────────────
create policy focus_areas_select_member
  on public.focus_areas
  for select
  to authenticated
  using (private.is_member(organization_id));

create policy events_select_admin_or_staff
  on public.events
  for select
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or private.is_team_staff(team_id)
  );

-- El equipo de un partido está en su evento. La subconsulta pasa también por la política
-- de `events` (admin o staff del equipo), que no lee `games`: no hay recursión. La
-- condición de staff va además explícita, para que abrir más adelante el calendario a
-- otros roles no abra con él los datos del partido.
create policy games_select_admin_or_staff
  on public.games
  for select
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or exists (
      select 1
      from public.events as e
      where e.organization_id = games.organization_id
        and e.id = games.event_id
        and private.is_team_staff(e.team_id)
    )
  );

create policy practice_plans_select_visible
  on public.practice_plans
  for select
  to authenticated
  using (private.can_see_plan(id));

create policy practice_items_select_visible
  on public.practice_items
  for select
  to authenticated
  using (private.can_see_plan(plan_id));
