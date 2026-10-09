-- Desarrollo del jugador (Fase 6): objetivos y notas del cuerpo técnico.
--
-- Un objetivo y una nota son de un jugador EN un equipo (`team_id`): el cuerpo técnico de un
-- equipo trabaja con sus jugadores, y si el jugador cambia de equipo la temporada siguiente,
-- lo escrito se queda en el equipo anterior. Son datos sobre menores:
--   · un objetivo lo leen y lo escriben quien gestiona el equipo (`private.can_manage_team`:
--     su cuerpo técnico y la dirección del club), solo de un jugador de su plantilla, como
--     mucho tres activos por jugador sumando todos sus equipos, y no se borran: se archivan;
--   · una nota privada la lee solo su autor, también frente a dirección; una de cuerpo técnico,
--     el cuerpo técnico del equipo y dirección. Solo su autor la cambia o la borra, y borrarla
--     la quita de la base. Si se borra la cuenta del autor, sus notas se van con ella.
--
-- Errores (C1): el cuarto objetivo activo es `GOAL_LIMIT` (P0001).

create type public.goal_status as enum ('active', 'achieved', 'archived');
create type public.note_visibility as enum ('private', 'staff');

-- ── player_goals ─────────────────────────────────────────────────────────────────────
-- `created_by` toma por defecto el usuario de la sesión; el seed, que escribe con la clave de
-- servicio, lo pone explícito. Si se borra esa cuenta, el objetivo se queda sin autor: es
-- historial deportivo del jugador, no de quien lo escribió.
create table public.player_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  person_id uuid not null,
  team_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  focus_area_id uuid,
  standard_id uuid,
  status public.goal_status not null default 'active',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  achieved_at timestamptz,
  unique (organization_id, id),
  check ((status = 'achieved') = (achieved_at is not null)),
  foreign key (organization_id, person_id) references public.people (organization_id, id),
  foreign key (organization_id, team_id) references public.teams (organization_id, id),
  foreign key (organization_id, focus_area_id) references public.focus_areas (organization_id, id),
  foreign key (organization_id, standard_id) references public.standards (organization_id, id)
);

create index player_goals_team_id_person_id_idx on public.player_goals (team_id, person_id);
create index player_goals_person_id_active_idx on public.player_goals (person_id) where status = 'active';

-- ── coach_notes ──────────────────────────────────────────────────────────────────────
create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  person_id uuid not null,
  team_id uuid not null,
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  visibility public.note_visibility not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, person_id) references public.people (organization_id, id),
  foreign key (organization_id, team_id) references public.teams (organization_id, id)
);

create index coach_notes_team_id_person_id_idx on public.coach_notes (team_id, person_id);
create index coach_notes_author_id_idx on public.coach_notes (author_id);

-- ── Triggers ─────────────────────────────────────────────────────────────────────────

create trigger coach_notes_set_updated_at
  before update on public.coach_notes
  for each row execute function private.set_updated_at();

-- Antes de escribir un objetivo: pone `updated_at` y `achieved_at`, y hace cumplir el límite
-- de tres activos por jugador. Para que dos altas a la vez no pasen las dos con dos activos,
-- bloquea antes la fila del jugador: la segunda espera a que la primera termine y ya la
-- cuenta. Es `security definer` porque cuenta los objetivos de todos los equipos del jugador
-- (también los que quien escribe no ve) y porque `for update` pide un privilegio de escritura
-- sobre `people` que `authenticated` no tiene.
create function private.player_goals_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  if new.status = 'achieved' and (tg_op = 'INSERT' or old.status <> 'achieved') then
    new.achieved_at := now();
  elsif new.status <> 'achieved' then
    new.achieved_at := null;
  end if;

  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    perform 1
    from public.people as p
    where p.organization_id = new.organization_id
      and p.id = new.person_id
    for update;

    if (
      select count(*)
      from public.player_goals as g
      where g.organization_id = new.organization_id
        and g.person_id = new.person_id
        and g.status = 'active'
        and g.id <> new.id
    ) >= 3 then
      raise exception 'GOAL_LIMIT' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.player_goals_before_write() from public, anon, authenticated;

create trigger player_goals_before_write
  before insert or update on public.player_goals
  for each row execute function private.player_goals_before_write();

-- ── RLS ──────────────────────────────────────────────────────────────────────────────

alter table public.player_goals enable row level security;
alter table public.coach_notes enable row level security;

-- ¿Es `person` de la plantilla de `team`? Con la sesión de quien escribe: el cuerpo técnico y
-- la dirección ya leen la plantilla de sus equipos (`team_players_select_admin_or_staff`).
create function private.is_on_roster(team uuid, person uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_players as tp
    where tp.team_id = is_on_roster.team
      and tp.person_id = is_on_roster.person
  );
$$;

revoke all on function private.is_on_roster(uuid, uuid) from public, anon;
grant execute on function private.is_on_roster(uuid, uuid) to authenticated;

-- ¿Se puede ligar este Standard? Sin Standard, sí; con uno, tiene que estar publicado (que es
-- del mismo club lo dice la clave foránea compuesta).
create function private.is_linkable_standard(standard uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select is_linkable_standard.standard is null
    or exists (
      select 1
      from public.standards as s
      where s.id = is_linkable_standard.standard
        and s.status = 'published'
    );
$$;

revoke all on function private.is_linkable_standard(uuid) from public, anon;
grant execute on function private.is_linkable_standard(uuid) to authenticated;

create policy player_goals_select_managed
  on public.player_goals
  for select
  to authenticated
  using (private.can_manage_team(team_id));

create policy player_goals_insert_managed
  on public.player_goals
  for insert
  to authenticated
  with check (
    private.can_manage_team(team_id)
    and private.is_on_roster(team_id, person_id)
    and private.is_linkable_standard(standard_id)
  );

-- Solo un objetivo activo se cambia: uno logrado o archivado ya no (ni vuelve a activo).
create policy player_goals_update_active_managed
  on public.player_goals
  for update
  to authenticated
  using (status = 'active' and private.can_manage_team(team_id))
  with check (private.can_manage_team(team_id) and private.is_linkable_standard(standard_id));

create policy coach_notes_select_visible
  on public.coach_notes
  for select
  to authenticated
  using (
    author_id = (select auth.uid())
    or (
      visibility = 'staff'
      and (
        private.is_team_staff(team_id)
        or private.has_org_role(organization_id, array['admin']::public.org_role[])
      )
    )
  );

create policy coach_notes_insert_managed
  on public.coach_notes
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and private.can_manage_team(team_id)
    and private.is_on_roster(team_id, person_id)
  );

create policy coach_notes_update_author
  on public.coach_notes
  for update
  to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy coach_notes_delete_author
  on public.coach_notes
  for delete
  to authenticated
  using (author_id = (select auth.uid()));

-- ── Privilegios ──────────────────────────────────────────────────────────────────────
-- Una tabla nueva de `public` nace con todo concedido a `anon` y `authenticated` (privilegios
-- por defecto del esquema): se quita todo y se da solo lo que hace falta.
revoke all on table public.player_goals from anon, authenticated;
revoke all on table public.coach_notes from anon, authenticated;

-- Ni el id, ni el autor, ni las fechas: los pone la base. Un objetivo nace activo y no cambia
-- de club, de jugador ni de equipo. Los objetivos no se borran.
grant select on public.player_goals to authenticated;
grant insert (organization_id, person_id, team_id, title, description, focus_area_id, standard_id)
  on public.player_goals to authenticated;
grant update (title, description, focus_area_id, standard_id, status)
  on public.player_goals to authenticated;

grant select, delete on public.coach_notes to authenticated;
grant insert (organization_id, person_id, team_id, body, visibility)
  on public.coach_notes to authenticated;
grant update (body, visibility) on public.coach_notes to authenticated;
