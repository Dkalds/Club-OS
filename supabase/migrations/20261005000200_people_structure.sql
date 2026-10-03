-- Personas y estructura deportiva: personas, temporadas, categorías, equipos, cuerpos
-- técnicos y plantillas.
--
-- RLS aísla en dos niveles:
--   · entre clubes: toda tabla lleva `organization_id` y las claves foráneas son
--     compuestas `(organization_id, x_id)`, así que una fila no puede apuntar a otro club;
--   · dentro del club, por equipo: quien entrena un equipo no ve la plantilla ni el
--     cuerpo técnico de otro.
--
-- Como en tenancy: en esta fase solo hay lectura para `authenticated`, y los privilegios
-- de cada tabla se fijan aquí de forma explícita.

-- ── Tipos ────────────────────────────────────────────────────────────────────────────
create type public.staff_role as enum ('head_coach', 'assistant');

-- ── Tablas ───────────────────────────────────────────────────────────────────────────
-- Menores: de una persona solo se guarda el año de nacimiento, nunca la fecha completa.
create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  first_name text not null,
  last_name text not null,
  birth_year smallint check (birth_year between 1900 and 2100),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, id)
);

-- La cuenta de un usuario solo puede enlazar con una persona de su mismo club. Una
-- membresía sin persona (`person_id` null) sigue siendo válida.
alter table public.memberships
  add foreign key (organization_id, person_id) references public.people (organization_id, id);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  unique (organization_id, id)
);

-- Una sola temporada actual por club.
create unique index seasons_one_current_per_organization_idx
  on public.seasons (organization_id)
  where is_current;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null,
  age_band text not null check (age_band ~ '^U[0-9]{1,2}$'),
  sort int not null default 0,
  unique (organization_id, id)
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  season_id uuid not null,
  category_id uuid not null,
  name text not null,
  unique (organization_id, id),
  foreign key (organization_id, season_id) references public.seasons (organization_id, id),
  foreign key (organization_id, category_id) references public.categories (organization_id, id)
);

create table public.team_staff (
  organization_id uuid not null references public.organizations (id),
  team_id uuid not null,
  person_id uuid not null,
  staff_role public.staff_role not null,
  primary key (team_id, person_id),
  foreign key (organization_id, team_id) references public.teams (organization_id, id),
  foreign key (organization_id, person_id) references public.people (organization_id, id)
);

create index team_staff_person_id_idx on public.team_staff (person_id);

create table public.team_players (
  organization_id uuid not null references public.organizations (id),
  team_id uuid not null,
  person_id uuid not null,
  jersey_number smallint check (jersey_number between 0 and 99),
  position text,
  primary key (team_id, person_id),
  -- Dorsal único por equipo; sin dorsal (null) puede haber varios.
  unique (team_id, jersey_number),
  foreign key (organization_id, team_id) references public.teams (organization_id, id),
  foreign key (organization_id, person_id) references public.people (organization_id, id)
);

create index team_players_person_id_idx on public.team_players (person_id);

-- ── Funciones de RLS ─────────────────────────────────────────────────────────────────
-- `security definer`: leen las tablas como su propietario, sin pasar por RLS, y por eso
-- las políticas pueden apoyarse en ellas sin recursión. Solo responden por el usuario de
-- la sesión (`auth.uid()`), y lo resuelven siempre igual: su membresía ACTIVA en el club
-- del equipo o de la persona, y la persona (`person_id`) enlazada a esa membresía. Una
-- membresía en otro club, o revocada, no cuenta.

-- ¿Está la persona del usuario en el cuerpo técnico de este equipo?
create function private.is_team_staff(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams as t
    join public.memberships as m
      on m.organization_id = t.organization_id
    join public.team_staff as ts
      on ts.organization_id = t.organization_id
     and ts.team_id = t.id
     and ts.person_id = m.person_id
    where t.id = is_team_staff.team
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

-- ¿Puede el usuario ver a esta persona? Sí si es admin del club de la persona, si es su
-- propia persona, o si la persona está en el cuerpo técnico o en la plantilla de un
-- equipo donde el usuario es staff.
create function private.can_see_person(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people as p
    join public.memberships as m
      on m.organization_id = p.organization_id
    where p.id = can_see_person.person
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role = 'admin'
        or m.person_id = p.id
        or exists (
          select 1
          from public.team_staff as mine
          where mine.organization_id = p.organization_id
            and mine.person_id = m.person_id
            and (
              exists (
                select 1
                from public.team_staff as ts
                where ts.team_id = mine.team_id
                  and ts.person_id = p.id
              )
              or exists (
                select 1
                from public.team_players as tp
                where tp.team_id = mine.team_id
                  and tp.person_id = p.id
              )
            )
        )
      )
  );
$$;

revoke all on function private.is_team_staff(uuid) from public, anon;
revoke all on function private.can_see_person(uuid) from public, anon;
grant execute on function private.is_team_staff(uuid) to authenticated;
grant execute on function private.can_see_person(uuid) to authenticated;

-- ── RLS y privilegios ────────────────────────────────────────────────────────────────
alter table public.people enable row level security;
alter table public.seasons enable row level security;
alter table public.categories enable row level security;
alter table public.teams enable row level security;
alter table public.team_staff enable row level security;
alter table public.team_players enable row level security;

revoke all on table public.people from anon, authenticated;
revoke all on table public.seasons from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.teams from anon, authenticated;
revoke all on table public.team_staff from anon, authenticated;
revoke all on table public.team_players from anon, authenticated;

grant select on table public.people to authenticated;
grant select on table public.seasons to authenticated;
grant select on table public.categories to authenticated;
grant select on table public.teams to authenticated;
grant select on table public.team_staff to authenticated;
grant select on table public.team_players to authenticated;

grant select, insert, update, delete on table public.people to service_role;
grant select, insert, update, delete on table public.seasons to service_role;
grant select, insert, update, delete on table public.categories to service_role;
grant select, insert, update, delete on table public.teams to service_role;
grant select, insert, update, delete on table public.team_staff to service_role;
grant select, insert, update, delete on table public.team_players to service_role;

-- ── Políticas (solo lectura en esta fase) ────────────────────────────────────────────
create policy people_select_visible
  on public.people
  for select
  to authenticated
  using (private.can_see_person(id));

create policy seasons_select_member
  on public.seasons
  for select
  to authenticated
  using (private.is_member(organization_id));

create policy categories_select_member
  on public.categories
  for select
  to authenticated
  using (private.is_member(organization_id));

create policy teams_select_admin_or_staff
  on public.teams
  for select
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or private.is_team_staff(id)
  );

create policy team_staff_select_admin_or_staff
  on public.team_staff
  for select
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or private.is_team_staff(team_id)
  );

create policy team_players_select_admin_or_staff
  on public.team_players
  for select
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or private.is_team_staff(team_id)
  );
