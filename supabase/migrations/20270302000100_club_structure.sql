-- La estructura del club, en manos de su dirección: temporadas, categorías, equipos, cuerpos
-- técnicos, plantillas y personas.
--
-- Las seis tablas existen desde `20261005000200_people_structure.sql`, con RLS, su
-- `organization_id` y claves foráneas compuestas; hasta ahora solo se leían, y las llenaba el
-- seed. Aquí:
--
--   1. Lo que la base garantiza de lo que se escribe: fechas, nombres y nombres sin repetir.
--   2. `grant` por columnas de lo que la app escribe (C17, C27).
--   3. Políticas de alta, cambio y borrado: solo la dirección del club de la fila.
--   4. Cuatro funciones para lo que toca varias filas a la vez. Cuál es la temporada actual
--      (`seasons.is_current`) solo lo deciden dos de ellas: la columna no se concede.
--
-- Quien entrena y los jugadores siguen leyendo lo mismo: sus políticas de lectura no cambian.
-- `people` no se borra: se archiva (`archived_at`).

-- ── Lo que la base garantiza ─────────────────────────────────────────────────────────────
-- Un nombre lleva algo que no sea un espacio (`\S`: tampoco vale uno de tabuladores o saltos
-- de línea) y no pasa de 60 caracteres.
alter table public.seasons
  add constraint seasons_dates_check check (ends_on > starts_on),
  add constraint seasons_name_check check (name ~ '\S' and char_length(name) <= 60);

alter table public.categories
  add constraint categories_name_check check (name ~ '\S' and char_length(name) <= 60);

alter table public.teams
  add constraint teams_name_check check (name ~ '\S' and char_length(name) <= 60);

alter table public.people
  add constraint people_first_name_check check (first_name ~ '\S' and char_length(first_name) <= 60),
  add constraint people_last_name_check check (last_name ~ '\S' and char_length(last_name) <= 60);

alter table public.team_players
  add constraint team_players_position_check
    check (position is null or (position ~ '\S' and char_length(position) <= 30));

-- Nombres sin repetir, sin distinguir mayúsculas ni espacios alrededor: temporadas y
-- categorías por club; equipos, por temporada.
create unique index seasons_name_key
  on public.seasons (organization_id, lower(btrim(name)));

create unique index categories_name_key
  on public.categories (organization_id, lower(btrim(name)));

create unique index teams_name_key
  on public.teams (organization_id, season_id, lower(btrim(name)));

-- ── Privilegios ──────────────────────────────────────────────────────────────────────────
-- Por columnas: `organization_id` se escribe al nacer la fila y no se cambia; la temporada de
-- un equipo, tampoco. `seasons.is_current` no se concede: una temporada nace sin la marca y
-- solo la mueven `create_season` y `set_current_season`, para que un club con temporada actual
-- no se quede sin ella. Quién escribe lo dicen las políticas de abajo.
grant insert (organization_id, first_name, last_name, birth_year) on table public.people to authenticated;
grant update (first_name, last_name, birth_year, archived_at) on table public.people to authenticated;

grant insert (organization_id, name, starts_on, ends_on) on table public.seasons to authenticated;
grant update (name, starts_on, ends_on) on table public.seasons to authenticated;
grant delete on table public.seasons to authenticated;

grant insert (organization_id, name, age_band, sort) on table public.categories to authenticated;
grant update (name, age_band, sort) on table public.categories to authenticated;
grant delete on table public.categories to authenticated;

grant insert (organization_id, season_id, category_id, name) on table public.teams to authenticated;
grant update (name, category_id) on table public.teams to authenticated;
grant delete on table public.teams to authenticated;

grant insert (organization_id, team_id, person_id, staff_role) on table public.team_staff to authenticated;
grant update (staff_role) on table public.team_staff to authenticated;
grant delete on table public.team_staff to authenticated;

grant insert (organization_id, team_id, person_id, jersey_number, position)
  on table public.team_players to authenticated;
grant update (jersey_number, position) on table public.team_players to authenticated;
grant delete on table public.team_players to authenticated;

-- ── Políticas ────────────────────────────────────────────────────────────────────────────
-- En todas, la dirección del club de la fila. Las claves compuestas impiden además que una
-- fila apunte a otro club.

-- La lectura de `people`, con la dirección dicha sobre la propia fila. No cambia quién ve a
-- quién (`can_see_person` ya dejaba a la dirección ver a todo su club), pero esa función busca
-- a la persona en la tabla, y la fila de un `insert … returning` aún no está: sin esto, el alta
-- de una persona devolvería un 42501 a quien sí puede darla.
alter policy people_select_visible
  on public.people
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or private.can_see_person(id)
  );

create policy people_insert_admin
  on public.people
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy people_update_admin
  on public.people
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy seasons_insert_admin
  on public.seasons
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy seasons_update_admin
  on public.seasons
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

-- La temporada actual no se borra: antes se marca otra.
create policy seasons_delete_admin
  on public.seasons
  for delete
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    and not is_current
  );

create policy categories_insert_admin
  on public.categories
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy categories_update_admin
  on public.categories
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy categories_delete_admin
  on public.categories
  for delete
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy teams_insert_admin
  on public.teams
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy teams_update_admin
  on public.teams
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy teams_delete_admin
  on public.teams
  for delete
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy team_staff_insert_admin
  on public.team_staff
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy team_staff_update_admin
  on public.team_staff
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy team_staff_delete_admin
  on public.team_staff
  for delete
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy team_players_insert_admin
  on public.team_players
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy team_players_update_admin
  on public.team_players
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy team_players_delete_admin
  on public.team_players
  for delete
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]));

-- ── Funciones ────────────────────────────────────────────────────────────────────────────
-- Sirven para que varias filas cambien juntas o no cambie ninguna.
--
-- Reglas comunes (C26): NOT_FOUND primero, si lo que se pide no es de un club que quien llama
-- dirige. Las restricciones de las tablas dan los demás errores (`23505`, `23514`).
--
-- `delete_team` y `add_new_player` son `security invoker`: escriben con la sesión de quien
-- llama, y las políticas de arriba siguen mandando.
--
-- `create_season` y `set_current_season` son `security definer`: son las únicas que escriben
-- `seasons.is_current`, que nadie tiene concedida. Por eso comprueban ellas, antes de nada, que
-- quien llama dirige el club (`private.has_org_role`, que responde por `auth.uid()`), y no
-- tocan nada fuera de ese club. Se ponen en fila por club (`pg_advisory_xact_lock`): dos a la
-- vez no dejan un club con dos temporadas actuales ni sin ninguna.

-- ── public.create_season ────────────────────────────────────────────────────────────────
-- Una temporada nueva. Nace actual si el club no tenía ninguna actual. Con
-- `p_copy_teams_from`, copia los equipos de esa temporada (nombre y categoría), vacíos.
create function public.create_season(
  p_org uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_copy_teams_from uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_org_role(p_org, array['admin']::public.org_role[]) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_copy_teams_from is not null and not exists (
    select 1
    from public.seasons as s
    where s.id = p_copy_teams_from
      and s.organization_id = p_org
  ) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 0));

  insert into public.seasons (organization_id, name, starts_on, ends_on, is_current)
  values (
    p_org,
    btrim(p_name),
    p_starts_on,
    p_ends_on,
    not exists (
      select 1
      from public.seasons as s
      where s.organization_id = p_org
        and s.is_current
    )
  )
  returning id into v_id;

  if p_copy_teams_from is not null then
    insert into public.teams (organization_id, season_id, category_id, name)
    select t.organization_id, v_id, t.category_id, t.name
    from public.teams as t
    where t.organization_id = p_org
      and t.season_id = p_copy_teams_from;
  end if;

  return v_id;
end;
$$;

revoke all on function public.create_season(uuid, text, date, date, uuid) from public, anon, service_role;
grant execute on function public.create_season(uuid, text, date, date, uuid) to authenticated;

-- ── public.set_current_season ───────────────────────────────────────────────────────────
-- Deja esta temporada como la actual de su club y le quita la marca a la que la tuviera.
create function public.set_current_season(p_season uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select s.organization_id
  into v_org
  from public.seasons as s
  where s.id = p_season
    and private.has_org_role(s.organization_id, array['admin']::public.org_role[]);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org::text, 0));

  -- Tras esperar el turno, la temporada puede haberse borrado. Se bloquea su fila: un borrado
  -- directo a la vez espera a que esto acabe y entonces ya es la actual, que no se borra.
  perform 1 from public.seasons as s where s.id = p_season for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.seasons as s
  set is_current = false
  where s.organization_id = v_org
    and s.is_current
    and s.id <> p_season;

  update public.seasons as s
  set is_current = true
  where s.id = p_season
    and not s.is_current;
end;
$$;

revoke all on function public.set_current_season(uuid) from public, anon, service_role;
grant execute on function public.set_current_season(uuid) to authenticated;

-- ── public.delete_team ──────────────────────────────────────────────────────────────────
-- Borra un equipo con su cuerpo técnico y su plantilla (no las personas). IN_USE si algo lo
-- referencia (sesiones, partidos, objetivos, notas): entonces no se borra nada.
create function public.delete_team(p_team uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.teams as t
    where t.id = p_team
      and private.has_org_role(t.organization_id, array['admin']::public.org_role[])
  ) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  begin
    delete from public.team_staff as ts where ts.team_id = p_team;
    delete from public.team_players as tp where tp.team_id = p_team;
    delete from public.teams as t where t.id = p_team;
  exception
    when foreign_key_violation then
      raise exception 'IN_USE' using errcode = 'P0001';
  end;
end;
$$;

revoke all on function public.delete_team(uuid) from public, anon, service_role;
grant execute on function public.delete_team(uuid) to authenticated;

-- ── public.add_new_player ───────────────────────────────────────────────────────────────
-- Da de alta a una persona y la pone en la plantilla del equipo: las dos cosas o ninguna (un
-- dorsal repetido no deja a la persona suelta). De un menor solo entra el año de nacimiento.
create function public.add_new_player(
  p_team uuid,
  p_first_name text,
  p_last_name text,
  p_birth_year smallint default null,
  p_jersey_number smallint default null,
  p_position text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org    uuid;
  v_person uuid;
begin
  select t.organization_id
  into v_org
  from public.teams as t
  where t.id = p_team
    and private.has_org_role(t.organization_id, array['admin']::public.org_role[]);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.people (organization_id, first_name, last_name, birth_year)
  values (v_org, btrim(p_first_name), btrim(p_last_name), p_birth_year)
  returning id into v_person;

  insert into public.team_players (organization_id, team_id, person_id, jersey_number, position)
  values (v_org, p_team, v_person, p_jersey_number, nullif(btrim(p_position), ''));

  return v_person;
end;
$$;

revoke all on function public.add_new_player(uuid, text, text, smallint, smallint, text)
  from public, anon, service_role;
grant execute on function public.add_new_player(uuid, text, text, smallint, smallint, text) to authenticated;
