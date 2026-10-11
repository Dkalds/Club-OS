-- El calendario del club: pistas, horarios semanales que crean los entrenamientos de la
-- temporada, y el registro de qué ha cambiado en cada evento.
--
--   1. `venues`: las pistas del club. Un evento cuyo lugar (`events.location`, que sigue
--      siendo un texto) es el nombre de una pista queda vinculado a ella (`events.venue_id`).
--      Ese vínculo lo mantiene la base con triggers, lo escriba quien lo escriba.
--   2. `team_schedules`: los horarios semanales de un equipo. Solo se escriben con tres
--      funciones, que crean, mueven y borran sus entrenamientos (`events.schedule_id`).
--   3. `event_changes`: cada cambio de hora, de lugar o cancelación de un evento programado.
--      Lo escribe un trigger de `events`; nadie más.
--
-- Las tres tablas llevan `organization_id`, RLS y claves foráneas compuestas, como el resto.
-- Quién crea, mueve o cancela un entrenamiento o un partido suelto no cambia.

-- ── Pistas ───────────────────────────────────────────────────────────────────────────────
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (name ~ '\S' and char_length(name) <= 60),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

-- Dos pistas de un club no comparten nombre, sin distinguir mayúsculas ni espacios alrededor:
-- es por el nombre como un evento encuentra la suya.
create unique index venues_name_key
  on public.venues (organization_id, lower(btrim(name)));

-- ── Horarios semanales ───────────────────────────────────────────────────────────────────
-- `weekday` es el día ISO (1 lunes, 7 domingo) y `start_time`, la hora del reloj del club
-- (`organizations.timezone`): un horario a las 18:00 lo es en invierno y en verano.
create table public.team_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  team_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  duration_minutes smallint not null check (duration_minutes between 15 and 240),
  venue_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  -- Un equipo no entrena dos veces el mismo día a la misma hora.
  unique (team_id, weekday, start_time),
  -- Borrar un equipo se lleva sus horarios (`delete_team`); con entrenamientos, no se borra.
  foreign key (organization_id, team_id)
    references public.teams (organization_id, id) on delete cascade,
  -- Una pista con horarios no se borra.
  foreign key (organization_id, venue_id) references public.venues (organization_id, id)
);

create index team_schedules_venue_id_idx on public.team_schedules (venue_id);

-- ── Eventos: su pista y su horario ───────────────────────────────────────────────────────
-- Ninguna de las dos columnas se concede: `venue_id` la pone un trigger a partir de
-- `location`, y `schedule_id`, las funciones de los horarios. Borrar una pista o un horario
-- no toca el evento: solo suelta el vínculo.
--
-- No hay un único de (horario, inicio): quien entrena mueve una sesión de un horario a donde
-- quiera, también a la hora de otra. Que un horario no cree ni mueva un entrenamiento a donde
-- el equipo ya tiene uno lo comprueban sus funciones.
alter table public.events
  add column venue_id uuid,
  add column schedule_id uuid,
  add constraint events_venue_fkey
    foreign key (organization_id, venue_id)
    references public.venues (organization_id, id) on delete set null (venue_id),
  add constraint events_schedule_fkey
    foreign key (organization_id, schedule_id)
    references public.team_schedules (organization_id, id) on delete set null (schedule_id);

create index events_venue_id_idx on public.events (venue_id);
create index events_schedule_id_idx on public.events (schedule_id);

-- ── Registro de cambios ──────────────────────────────────────────────────────────────────
-- Qué cambió (`what`) y lo que había antes. Lo de después está en el propio evento. No se
-- guarda quién: solo qué y cuándo.
create table public.event_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  event_id uuid not null,
  team_id uuid not null,
  what text not null check (what in ('time', 'location', 'cancelled')),
  old_starts_at timestamptz not null,
  old_ends_at timestamptz not null,
  old_location text,
  changed_at timestamptz not null default now(),
  unique (organization_id, id),
  -- Se va con su evento: solo se borra un entrenamiento de un horario que nadie tocó.
  foreign key (organization_id, event_id)
    references public.events (organization_id, id) on delete cascade,
  foreign key (organization_id, team_id) references public.teams (organization_id, id)
);

create index event_changes_event_id_idx on public.event_changes (event_id);
create index event_changes_team_id_changed_at_idx on public.event_changes (team_id, changed_at desc);

-- ── El vínculo de un evento con su pista ─────────────────────────────────────────────────
-- `security definer` en los tres: leen y escriben sin pasar por RLS ni por los `grant` (quien
-- cambia el lugar de un entrenamiento no tiene concedida `venue_id`). Solo comparan nombres
-- dentro del club de la fila.

-- Al nacer un evento o cambiar su lugar: su pista es la del club que se llama así, o ninguna.
create function private.link_event_venue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.venue_id := (
    select v.id
    from public.venues as v
    where v.organization_id = new.organization_id
      and lower(btrim(v.name)) = lower(btrim(new.location))
  );
  return new;
end;
$$;

revoke all on function private.link_event_venue() from public, anon, authenticated;

create trigger events_link_venue
  before insert or update of location on public.events
  for each row execute function private.link_event_venue();

-- Al nacer una pista o cambiar de nombre:
--   · con nombre nuevo, sus eventos programados que aún no han empezado pasan a llamarla así
--     (los ya pasados conservan el nombre que tenía entonces);
--   · y los eventos sin pista cuyo lugar ya era ese nombre quedan vinculados a ella.
create function private.sync_venue_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    update public.events as e
    set location = new.name
    where e.venue_id = new.id
      and e.status = 'scheduled'
      and e.starts_at > now()
      and e.location is distinct from new.name;
  end if;

  update public.events as e
  set venue_id = new.id
  where e.organization_id = new.organization_id
    and e.venue_id is null
    and lower(btrim(e.location)) = lower(btrim(new.name));

  return null;
end;
$$;

revoke all on function private.sync_venue_events() from public, anon, authenticated;

create trigger venues_sync_events
  after insert or update of name on public.venues
  for each row execute function private.sync_venue_events();

-- ── El registro de cambios lo escribe la base ────────────────────────────────────────────
-- Después de cambiar un evento que estaba programado: una fila por cambio de hora (inicio o
-- fin), otra por cambio de lugar, o una sola si se cancela. No se registra:
--   · lo que escribe el seed o un script (sin usuario en la sesión);
--   · el nombre nuevo que una pista da a sus eventos (un trigger dentro de otro): la pista es
--     la misma.
create function private.log_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'scheduled' or (select auth.uid()) is null or pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.status = 'cancelled' then
    insert into public.event_changes (organization_id, event_id, team_id, what, old_starts_at, old_ends_at, old_location)
    values (old.organization_id, old.id, old.team_id, 'cancelled', old.starts_at, old.ends_at, old.location);
    return null;
  end if;

  if new.starts_at <> old.starts_at or new.ends_at <> old.ends_at then
    insert into public.event_changes (organization_id, event_id, team_id, what, old_starts_at, old_ends_at, old_location)
    values (old.organization_id, old.id, old.team_id, 'time', old.starts_at, old.ends_at, old.location);
  end if;

  if new.location is distinct from old.location then
    insert into public.event_changes (organization_id, event_id, team_id, what, old_starts_at, old_ends_at, old_location)
    values (old.organization_id, old.id, old.team_id, 'location', old.starts_at, old.ends_at, old.location);
  end if;

  return null;
end;
$$;

revoke all on function private.log_event_change() from public, anon, authenticated;

create trigger events_log_change
  after update of starts_at, ends_at, location, status on public.events
  for each row execute function private.log_event_change();

-- ── RLS y privilegios ────────────────────────────────────────────────────────────────────
alter table public.venues enable row level security;
alter table public.team_schedules enable row level security;
alter table public.event_changes enable row level security;

revoke all on table public.venues from anon, authenticated;
revoke all on table public.team_schedules from anon, authenticated;
revoke all on table public.event_changes from anon, authenticated;

-- Las pistas las escribe la dirección por la tabla. Los horarios y el registro de cambios solo
-- se leen: los escriben las funciones y el trigger.
grant select on table public.venues to authenticated;
grant insert (organization_id, name) on table public.venues to authenticated;
grant update (name) on table public.venues to authenticated;
grant delete on table public.venues to authenticated;
grant select on table public.team_schedules to authenticated;
grant select on table public.event_changes to authenticated;

grant select, insert, update, delete on table public.venues to service_role;
grant select, insert, update, delete on table public.team_schedules to service_role;
grant select, insert, update, delete on table public.event_changes to service_role;

-- Las pistas las lee cualquier miembro del club: son lo que sugiere «Lugar» en un formulario.
create policy venues_select_member
  on public.venues
  for select
  to authenticated
  using (private.is_member(organization_id));

create policy venues_insert_admin
  on public.venues
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy venues_update_admin
  on public.venues
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy venues_delete_admin
  on public.venues
  for delete
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]));

-- Los horarios y los cambios de un equipo los ve quien ve sus eventos.
create policy team_schedules_select_admin_or_staff
  on public.team_schedules
  for select
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or private.is_team_staff(team_id)
  );

create policy event_changes_select_admin_or_staff
  on public.event_changes
  for select
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or private.is_team_staff(team_id)
  );

-- ── Los entrenamientos de un horario ─────────────────────────────────────────────────────
-- Crea los entrenamientos que le faltan a un horario, uno por semana, desde hoy (o desde el
-- inicio de la temporada del equipo, si aún no ha empezado) hasta su final. Cada uno es una
-- sesión normal: programada, con su plan en borrador, sin ítems y a nombre de quien llama.
--
-- La hora es la del reloj del club: `(día + hora) at time zone` da las 18:00 de Madrid a cada
-- lado del cambio de hora. No crea nada en el pasado, ni donde el equipo ya tiene un
-- entrenamiento sin cancelar a esa misma hora (uno suyo o uno hecho a mano).
--
-- Solo la llaman las funciones de abajo, que ya han comprobado quién llama.
create function private.generate_schedule_practices(p_schedule uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.team_schedules%rowtype;
  v_tz       text;
  v_from     date;
  v_until    date;
  v_location text;
  v_day      date;
  v_start    timestamptz;
  v_event    uuid;
  v_created  integer := 0;
begin
  select ts.* into v_schedule from public.team_schedules as ts where ts.id = p_schedule;

  select o.timezone into v_tz from public.organizations as o where o.id = v_schedule.organization_id;

  select greatest(s.starts_on, (now() at time zone v_tz)::date), s.ends_on
  into v_from, v_until
  from public.teams as t
  join public.seasons as s
    on s.id = t.season_id
  where t.id = v_schedule.team_id;

  select v.name into v_location from public.venues as v where v.id = v_schedule.venue_id;

  -- El primer día de esa semana que cae en `weekday`, de hoy en adelante.
  v_day := v_from + ((v_schedule.weekday - extract(isodow from v_from)::integer + 7) % 7);

  while v_day <= v_until loop
    v_start := (v_day + v_schedule.start_time) at time zone v_tz;

    if v_start > now() and not exists (
      select 1
      from public.events as e
      where e.team_id = v_schedule.team_id
        and e.kind = 'practice'
        and e.status <> 'cancelled'
        and e.starts_at = v_start
    ) then
      insert into public.events as e (
        organization_id, team_id, kind, starts_at, ends_at, location, schedule_id
      )
      values (
        v_schedule.organization_id, v_schedule.team_id, 'practice', v_start,
        v_start + make_interval(mins => v_schedule.duration_minutes), v_location, v_schedule.id
      )
      returning e.id into v_event;

      insert into public.practice_plans (organization_id, team_id, event_id, title)
      values (v_schedule.organization_id, v_schedule.team_id, v_event, 'Entrenamiento');

      v_created := v_created + 1;
    end if;

    v_day := v_day + 7;
  end loop;

  return v_created;
end;
$$;

revoke all on function private.generate_schedule_practices(uuid) from public, anon, authenticated;

-- Lo que comparten crear y cambiar un horario: que el día, la hora y la duración valgan
-- (INVALID) y que la pista, si viene, sea de ese club (NOT_FOUND).
create function private.check_schedule_input(
  p_org uuid,
  p_weekday smallint,
  p_start_time time,
  p_duration_minutes smallint,
  p_venue uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_venue is not null and not exists (
    select 1 from public.venues as v where v.id = p_venue and v.organization_id = p_org
  ) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_weekday is null or p_weekday not between 1 and 7
    or p_start_time is null
    or p_duration_minutes is null or p_duration_minutes not between 15 and 240
  then
    raise exception 'INVALID' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.check_schedule_input(uuid, smallint, time, smallint, uuid)
  from public, anon, authenticated;

-- ── Funciones de los horarios ────────────────────────────────────────────────────────────
-- `security definer`: escriben `team_schedules`, que nadie tiene concedida, y
-- `events.schedule_id`; la última borra eventos, que tampoco. Por eso comprueban ellas, antes
-- de nada, que quien llama dirige el club del equipo (`private.has_org_role`, que responde por
-- `auth.uid()`), y no tocan nada fuera de ese equipo.
--
-- Reglas comunes (C26): NOT_FOUND primero (el equipo, el horario o la pista no son de un club
-- que quien llama dirige), INVALID después. Un horario repetido es un `23505`.

-- ── public.create_team_schedule ─────────────────────────────────────────────────────────
-- Un horario nuevo y sus entrenamientos hasta el final de la temporada. Devuelve su id y
-- cuántos entrenamientos ha creado.
--
-- INVALID también si la temporada del equipo ya ha acabado (no habría nada que crear) o si
-- el equipo ya tiene 14 horarios.
create function public.create_team_schedule(
  p_team uuid,
  p_weekday smallint,
  p_start_time time,
  p_duration_minutes smallint,
  p_venue uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org     uuid;
  v_ends_on date;
  v_tz      text;
  v_id      uuid;
begin
  select t.organization_id, s.ends_on, o.timezone
  into v_org, v_ends_on, v_tz
  from public.teams as t
  join public.seasons as s
    on s.id = t.season_id
  join public.organizations as o
    on o.id = t.organization_id
  where t.id = p_team
    and private.has_org_role(t.organization_id, array['admin']::public.org_role[]);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  perform private.check_schedule_input(v_org, p_weekday, p_start_time, p_duration_minutes, p_venue);

  -- Las altas de un equipo, en fila: dos a la vez no se saltan el tope.
  perform pg_advisory_xact_lock(hashtextextended(p_team::text, 0));

  if v_ends_on < (now() at time zone v_tz)::date
    or (select count(*) from public.team_schedules as ts where ts.team_id = p_team) >= 14
  then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  insert into public.team_schedules as ts (
    organization_id, team_id, weekday, start_time, duration_minutes, venue_id
  )
  values (v_org, p_team, p_weekday, p_start_time, p_duration_minutes, p_venue)
  returning ts.id into v_id;

  return jsonb_build_object('id', v_id, 'created', private.generate_schedule_practices(v_id));
end;
$$;

revoke all on function public.create_team_schedule(uuid, smallint, time, smallint, uuid)
  from public, anon, service_role;
grant execute on function public.create_team_schedule(uuid, smallint, time, smallint, uuid) to authenticated;

-- ── public.update_team_schedule ─────────────────────────────────────────────────────────
-- Cambia el día, la hora, la duración o la pista de un horario, y mueve con él sus
-- entrenamientos programados que aún no han empezado y siguen en su sitio (el mismo día de la
-- semana y la misma hora que tenía el horario). El que alguien movió a mano se queda donde
-- está. Devuelve cuántos ha cambiado; cada uno deja su cambio en `event_changes`.
--
-- De cada uno solo cambia lo que seguía siendo del horario: la duración, si era la suya (una
-- sesión que alguien alargó conserva lo que dura); el lugar, si era su pista. Guardar un
-- horario sin cambiar nada no toca ningún entrenamiento.
--
-- Uno no se mueve si caería en el pasado, después del final de la temporada o a una hora en la
-- que el equipo ya tiene otro entrenamiento sin cancelar: se queda donde está.
create function public.update_team_schedule(
  p_schedule uuid,
  p_weekday smallint,
  p_start_time time,
  p_duration_minutes smallint,
  p_venue uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old       public.team_schedules%rowtype;
  v_tz        text;
  v_until     date;
  v_old_place text;
  v_new_place text;
  v_event     record;
  v_local     timestamp;
  v_day       date;
  v_start     timestamptz;
  v_end       timestamptz;
  v_place     text;
  v_moved     integer := 0;
begin
  select ts.*
  into v_old
  from public.team_schedules as ts
  where ts.id = p_schedule
    and private.has_org_role(ts.organization_id, array['admin']::public.org_role[])
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  perform private.check_schedule_input(
    v_old.organization_id, p_weekday, p_start_time, p_duration_minutes, p_venue
  );

  select o.timezone into v_tz from public.organizations as o where o.id = v_old.organization_id;
  select s.ends_on
  into v_until
  from public.teams as t
  join public.seasons as s
    on s.id = t.season_id
  where t.id = v_old.team_id;
  select v.name into v_old_place from public.venues as v where v.id = v_old.venue_id;
  select v.name into v_new_place from public.venues as v where v.id = p_venue;

  update public.team_schedules as ts
  set weekday = p_weekday,
      start_time = p_start_time,
      duration_minutes = p_duration_minutes,
      venue_id = p_venue
  where ts.id = p_schedule;

  for v_event in
    select e.id, e.starts_at, e.ends_at, e.location
    from public.events as e
    where e.schedule_id = p_schedule
      and e.status = 'scheduled'
      and e.starts_at > now()
    order by e.starts_at
  loop
    v_local := v_event.starts_at at time zone v_tz;
    continue when v_local::time <> v_old.start_time
      or extract(isodow from v_local)::integer <> v_old.weekday;

    v_day := v_local::date + (p_weekday - v_old.weekday);
    v_start := (v_day + p_start_time) at time zone v_tz;
    -- Un día anterior de la misma semana puede caer ya en el pasado, y uno posterior, después
    -- del final de la temporada: ese no se mueve.
    continue when v_start <= now() or v_day > v_until;
    -- Ni a donde el equipo ya tiene otro entrenamiento: no se duplica.
    continue when v_start <> v_event.starts_at and exists (
      select 1
      from public.events as other
      where other.team_id = v_old.team_id
        and other.kind = 'practice'
        and other.status <> 'cancelled'
        and other.starts_at = v_start
        and other.id <> v_event.id
    );

    -- La duración y el lugar, solo si seguían siendo los del horario.
    v_end := v_start + case
      when v_event.ends_at - v_event.starts_at = make_interval(mins => v_old.duration_minutes)
        then make_interval(mins => p_duration_minutes)
      else v_event.ends_at - v_event.starts_at
    end;
    v_place := case
      when v_event.location is not distinct from v_old_place then v_new_place
      else v_event.location
    end;

    update public.events as e
    set starts_at = v_start, ends_at = v_end, location = v_place
    where e.id = v_event.id
      and (e.starts_at <> v_start or e.ends_at <> v_end or e.location is distinct from v_place);

    if found then
      v_moved := v_moved + 1;
    end if;
  end loop;

  return v_moved;
end;
$$;

revoke all on function public.update_team_schedule(uuid, smallint, time, smallint, uuid)
  from public, anon, service_role;
grant execute on function public.update_team_schedule(uuid, smallint, time, smallint, uuid) to authenticated;

-- ── public.delete_team_schedule ─────────────────────────────────────────────────────────
-- Quita un horario. Borra sus entrenamientos programados que aún no han empezado y que nadie
-- ha tocado: sin ítems, sin notas, sin objetivos, sin empezar en directo, con el título con el
-- que nacieron y en el sitio del horario (su día, su hora y su pista: el que alguien movió a
-- mano se queda). Los demás se quedan como sesiones sueltas (`schedule_id` a null). Devuelve
-- cuántos ha borrado.
--
-- Es la única vía por la que se borra un evento: una sesión preparada, hecha o cancelada no
-- se borra nunca. Por eso primero bloquea los eventos del horario y solo después mira cuáles
-- siguen sin tocar: quien estuviera guardando una sesión en ese momento (`open_session`
-- bloquea su evento) termina antes, y lo que guardó ya se ve.
create function public.delete_team_schedule(p_schedule uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.team_schedules%rowtype;
  v_tz       text;
  v_place    text;
  v_events   uuid[];
begin
  select ts.*
  into v_schedule
  from public.team_schedules as ts
  where ts.id = p_schedule
    and private.has_org_role(ts.organization_id, array['admin']::public.org_role[])
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select o.timezone into v_tz from public.organizations as o where o.id = v_schedule.organization_id;
  select v.name into v_place from public.venues as v where v.id = v_schedule.venue_id;

  -- Primero el bloqueo, en su propia sentencia: la siguiente ya ve lo que haya guardado quien
  -- estaba escribiendo una de estas sesiones.
  perform 1 from public.events as e where e.schedule_id = p_schedule for update;

  select coalesce(array_agg(e.id), '{}')
  into v_events
  from public.events as e
  join public.practice_plans as pp
    on pp.event_id = e.id
  where e.schedule_id = p_schedule
    and e.status = 'scheduled'
    and e.starts_at > now()
    and (e.starts_at at time zone v_tz)::time = v_schedule.start_time
    and extract(isodow from e.starts_at at time zone v_tz)::integer = v_schedule.weekday
    and e.location is not distinct from v_place
    and pp.title = 'Entrenamiento'
    and pp.notes is null
    and pp.primary_focus_id is null
    and pp.secondary_focus_id is null
    and pp.live_started_at is null
    and not exists (select 1 from public.practice_items as pi where pi.plan_id = pp.id);

  delete from public.practice_plans as pp where pp.event_id = any (v_events);
  delete from public.events as e where e.id = any (v_events);
  delete from public.team_schedules as ts where ts.id = p_schedule;

  return coalesce(array_length(v_events, 1), 0);
end;
$$;

revoke all on function public.delete_team_schedule(uuid) from public, anon, service_role;
grant execute on function public.delete_team_schedule(uuid) to authenticated;
