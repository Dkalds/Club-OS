-- Escritura de partidos (Fase 6, contrato C11).
--
-- Hasta aquí `games` solo se leía y `events` solo se escribía para entrenos. Esta migración:
--   · ata cada partido a un evento `game` con una clave foránea compuesta, como hizo la Fase 4
--     con los planes (`practice_plans_event_fkey`): un partido no cuelga de un entreno, y un
--     evento con partido no cambia de tipo;
--   · abre la escritura a quien gestiona el equipo (`private.can_manage_team`: su cuerpo técnico
--     y la dirección del club), con políticas para `kind = 'game'`;
--   · añade cuatro funciones `security invoker` con las reglas que una política no expresa:
--     `create_game`, `update_game`, `record_game_result` y `cancel_game`.
--
-- Reglas: solo en equipos de la temporada actual; el resultado se apunta desde la hora de inicio,
-- deja el partido `done` y se puede corregir; un partido `cancelled` ya no cambia. Errores (C1):
-- NOT_FOUND (P0002) → GAME_CLOSED (P0001) → INVALID (22023).

-- ── Integridad ───────────────────────────────────────────────────────────────────────

-- `event_kind` vale siempre `game`. No guarda información: existe para que la clave foránea
-- pueda exigir que el evento de un partido sea un partido.
alter table public.games
  add column event_kind public.event_kind not null default 'game' check (event_kind = 'game');

alter table public.events
  add constraint events_organization_id_kind_id_key unique (organization_id, kind, id);

-- Se sustituye, no se añade: entre `games` y `events` tiene que haber una sola clave foránea,
-- o el embed de PostgREST (Inicio, Partidos) sería ambiguo.
alter table public.games
  drop constraint games_organization_id_event_id_fkey,
  add constraint games_event_fkey
    foreign key (organization_id, event_kind, event_id)
    references public.events (organization_id, kind, id);

-- Lo que se escribe a mano tiene tope. El tanteo va entero o no va.
alter table public.games
  add constraint games_opponent_name_check
    check (char_length(btrim(opponent_name)) between 1 and 80),
  add constraint games_competition_name_check
    check (competition_name is null or char_length(competition_name) <= 80),
  add constraint games_opponent_notes_check
    check (opponent_notes is null or char_length(opponent_notes) <= 1000),
  add constraint games_score_check
    check (
      (score_for is null) = (score_against is null)
      and (score_for is null or (score_for between 0 and 300 and score_against between 0 and 300))
    );

-- ── Políticas ────────────────────────────────────────────────────────────────────────

create policy events_insert_game_managed
  on public.events
  for insert
  to authenticated
  with check (
    kind = 'game'
    and status = 'scheduled'
    and private.can_manage_team(team_id)
  );

-- `using` mira la fila como está: un partido no cancelado de un equipo que se gestiona.
-- `with check` no pide estado: así se cierra (`done`, `cancelled`), y un cancelado ya no cumple
-- `using`.
--
-- Postgres junta las políticas permisivas de `update` por separado: basta el `using` de una y
-- el `with check` de otra. Sin más, el `using` de los entrenos y el `with check` de los
-- partidos dejarían convertir un entreno en partido (y al revés). Hoy lo impide además el
-- privilegio por columnas (`kind` no se escribe), pero cada política tiene que cerrarlo sola:
-- un partido es un evento con su fila en `games`, y un entreno, uno sin ella.
create policy events_update_game_managed
  on public.events
  for update
  to authenticated
  using (
    kind = 'game'
    and status <> 'cancelled'
    and private.can_manage_team(team_id)
  )
  with check (
    kind = 'game'
    and private.can_manage_team(team_id)
    and exists (
      select 1 from public.games as g
      where g.organization_id = events.organization_id
        and g.event_id = events.id
    )
  );

alter policy events_update_practice_managed
  on public.events
  with check (
    kind = 'practice'
    and private.can_manage_team(team_id)
    and not exists (
      select 1 from public.games as g
      where g.organization_id = events.organization_id
        and g.event_id = events.id
    )
  );

-- La subconsulta pasa por la política de lectura de `events` (admin o cuerpo técnico), que no
-- lee `games`: no hay recursión.
create policy games_insert_managed
  on public.games
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.events as e
      where e.organization_id = games.organization_id
        and e.id = games.event_id
        and e.kind = 'game'
        and e.status = 'scheduled'
        and private.can_manage_team(e.team_id)
    )
  );

create policy games_update_managed
  on public.games
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.events as e
      where e.organization_id = games.organization_id
        and e.id = games.event_id
        and e.status <> 'cancelled'
        and private.can_manage_team(e.team_id)
    )
  )
  with check (
    exists (
      select 1
      from public.events as e
      where e.organization_id = games.organization_id
        and e.id = games.event_id
        and private.can_manage_team(e.team_id)
    )
  );

-- Los privilegios de `events` ya son por columna y valen para los dos tipos (C11). Los de
-- `games`: ni el club ni el evento cambian; `event_kind` lo pone su valor por defecto.
grant insert (event_id, organization_id, opponent_name, competition_name, home_away)
  on public.games to authenticated;
grant update (opponent_name, competition_name, home_away, score_for, score_against, opponent_notes)
  on public.games to authenticated;

-- ── Validación común ─────────────────────────────────────────────────────────────────

-- INVALID si los datos de un partido no valen. Es la misma regla para crear y para cambiar.
create function private.check_game_input(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_opponent text,
  p_competition text,
  p_home_away text,
  p_location text
)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_starts_at is null
     or p_ends_at is null
     or p_ends_at <= p_starts_at
     or p_opponent is null
     or char_length(btrim(p_opponent)) not between 1 and 80
     or char_length(coalesce(p_competition, '')) > 80
     or char_length(coalesce(p_location, '')) > 120
     or (p_home_away is not null and p_home_away not in ('home', 'away')) then
    raise exception 'INVALID' using errcode = '22023';
  end if;
end;
$$;

revoke all on function private.check_game_input(timestamptz, timestamptz, text, text, text, text)
  from public, anon;
grant execute on function private.check_game_input(timestamptz, timestamptz, text, text, text, text)
  to authenticated;

-- El partido `p_event` de un equipo que se gestiona, bloqueado hasta el final de la transacción.
-- NOT_FOUND si no lo es; GAME_CLOSED si está cancelado. Devuelve su estado y su hora de inicio.
create function private.open_game(p_event uuid)
returns table (status public.event_status, starts_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.event_status;
  v_starts_at timestamptz;
  v_team uuid;
begin
  select e.status, e.starts_at, e.team_id
  into v_status, v_starts_at, v_team
  from public.events as e
  where e.id = p_event
    and e.kind = 'game'
    and private.can_manage_team(e.team_id);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_status = 'cancelled' then
    raise exception 'GAME_CLOSED' using errcode = 'P0001';
  end if;

  -- La política de `update` solo deja bloquear un partido no cancelado de un equipo que se
  -- gestiona. Sin fila: otra transacción lo canceló o le quitó el equipo a quien llama.
  perform 1 from public.events as e where e.id = p_event for update;
  if not found then
    if private.can_manage_team(v_team) then
      raise exception 'GAME_CLOSED' using errcode = 'P0001';
    end if;
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  return query select v_status, v_starts_at;
end;
$$;

revoke all on function private.open_game(uuid) from public, anon;
grant execute on function private.open_game(uuid) to authenticated;

-- ── create_game ──────────────────────────────────────────────────────────────────────
-- Crea el evento y su partido en una transacción y devuelve el id del evento. NOT_FOUND si el
-- equipo no se gestiona o no es de la temporada actual.
create function public.create_game(
  p_team uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_opponent text,
  p_competition text default null,
  p_home_away text default null,
  p_location text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_event uuid;
begin
  select t.organization_id into v_org
  from public.teams as t
  join public.seasons as s
    on s.organization_id = t.organization_id
   and s.id = t.season_id
  where t.id = p_team
    and s.is_current
    and private.can_manage_team(t.id);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  perform private.check_game_input(p_starts_at, p_ends_at, p_opponent, p_competition, p_home_away, p_location);

  insert into public.events (organization_id, team_id, kind, starts_at, ends_at, location)
  values (v_org, p_team, 'game', p_starts_at, p_ends_at, nullif(btrim(p_location), ''))
  returning id into v_event;

  insert into public.games (event_id, organization_id, opponent_name, competition_name, home_away)
  values (v_event, v_org, btrim(p_opponent), nullif(btrim(p_competition), ''), p_home_away);

  return v_event;
end;
$$;

revoke all on function public.create_game(uuid, timestamptz, timestamptz, text, text, text, text)
  from public, anon;
grant execute on function public.create_game(uuid, timestamptz, timestamptz, text, text, text, text)
  to authenticated;

-- ── update_game ──────────────────────────────────────────────────────────────────────
-- Cambia los datos de un partido no cancelado (también de uno ya jugado: el resultado no se
-- toca aquí). `p_opponent_notes` a null las borra: el formulario las manda siempre.
create function public.update_game(
  p_event uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_opponent text,
  p_competition text default null,
  p_home_away text default null,
  p_location text default null,
  p_opponent_notes text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.open_game(p_event);
  perform private.check_game_input(p_starts_at, p_ends_at, p_opponent, p_competition, p_home_away, p_location);
  if char_length(coalesce(p_opponent_notes, '')) > 1000 then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  update public.games as g
  set opponent_name = btrim(p_opponent),
      competition_name = nullif(btrim(p_competition), ''),
      home_away = p_home_away,
      opponent_notes = nullif(btrim(p_opponent_notes), '')
  where g.event_id = p_event;

  update public.events as e
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      location = nullif(btrim(p_location), '')
  where e.id = p_event;
end;
$$;

revoke all on function public.update_game(uuid, timestamptz, timestamptz, text, text, text, text, text)
  from public, anon;
grant execute on function public.update_game(uuid, timestamptz, timestamptz, text, text, text, text, text)
  to authenticated;

-- ── record_game_result ───────────────────────────────────────────────────────────────
-- Apunta (o corrige) el resultado y deja el partido hecho. Desde la hora de inicio.
create function public.record_game_result(p_event uuid, p_score_for int, p_score_against int)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_starts_at timestamptz;
begin
  select g.starts_at into v_starts_at from private.open_game(p_event) as g;

  if v_starts_at > now()
     or p_score_for is null
     or p_score_against is null
     or p_score_for not between 0 and 300
     or p_score_against not between 0 and 300 then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  update public.games as g
  set score_for = p_score_for,
      score_against = p_score_against
  where g.event_id = p_event;

  update public.events as e
  set status = 'done'
  where e.id = p_event;
end;
$$;

revoke all on function public.record_game_result(uuid, int, int) from public, anon;
grant execute on function public.record_game_result(uuid, int, int) to authenticated;

-- ── cancel_game ──────────────────────────────────────────────────────────────────────
-- Cancela un partido programado. Uno ya jugado no se cancela (INVALID); no se deshace.
create function public.cancel_game(p_event uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status public.event_status;
begin
  select g.status into v_status from private.open_game(p_event) as g;

  if v_status <> 'scheduled' then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  update public.events as e
  set status = 'cancelled'
  where e.id = p_event;
end;
$$;

revoke all on function public.cancel_game(uuid) from public, anon;
grant execute on function public.cancel_game(uuid) to authenticated;
