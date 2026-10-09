-- Puerta de entrada común para las funciones que escriben una sesión, y función de progreso
-- en tiempo real.
--
-- `private.open_session` extrae el código que estaba duplicado en `update_practice_session`
-- y `save_practice_items`: comprueban que el evento sea un entreno con plan de un equipo que
-- se gestiona, que siga programado, y bloquean el evento y el plan para la transacción. Ambas
-- funciones se recrean aquí para usarla.
--
-- `record_live_progress` escribe el estado parcial o final de una sesión en tiempo real.
-- A diferencia de las otras funciones de escritura, no lleva copia esperada (D3): Live envía
-- el estado completo, no deltas, y el reenvío del cierre es idempotente (D7). Los ids que no
-- son ítems de este plan se ignoran (D4) y no cuentan en `applied`.

-- ── private.open_session ─────────────────────────────────────────────────────────────
-- La puerta de entrada de toda función que escriba una sesión abierta (C26):
--   1. NOT_FOUND si el evento no es un entreno con plan de un equipo que se gestiona.
--   2. SESSION_CLOSED si el entreno no está programado.
--   3. Bloquea el evento y el plan en ese orden hasta el final de la transacción.
-- Devuelve (org, team, plan) con las filas ya bloqueadas.
create function private.open_session(p_event uuid)
returns table(org uuid, team uuid, plan uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org    uuid;
  v_team   uuid;
  v_status public.event_status;
  v_plan   uuid;
begin
  select e.organization_id, e.team_id, e.status, pp.id
  into v_org, v_team, v_status, v_plan
  from public.events as e
  join public.practice_plans as pp
    on pp.organization_id = e.organization_id
   and pp.event_id = e.id
  where e.id = p_event
    and e.kind = 'practice'
    and private.can_manage_team(e.team_id);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_status <> 'scheduled' then
    raise exception 'SESSION_CLOSED' using errcode = 'P0001';
  end if;

  -- Bloquear el evento. La política de `update` solo deja bloquear un entreno programado
  -- de un equipo que se gestiona. Sin fila: otra transacción cerró la sesión o le quitó
  -- el equipo a quien llama.
  perform 1
  from public.events as e
  where e.organization_id = v_org
    and e.id = p_event
  for update;

  if not found then
    if private.can_manage_team(v_team) then
      raise exception 'SESSION_CLOSED' using errcode = 'P0001';
    end if;
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Bloquear el plan.
  perform 1
  from public.practice_plans as pp
  where pp.organization_id = v_org
    and pp.id = v_plan
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  return query select v_org, v_team, v_plan;
end;
$$;

revoke all on function private.open_session(uuid) from public, anon;
grant execute on function private.open_session(uuid) to authenticated;

-- ── update_practice_session ──────────────────────────────────────────────────────────
-- Reescrita para usar private.open_session. Mismos parámetros y retorno.
create or replace function public.update_practice_session(
  p_event uuid,
  p_expected_updated_at timestamptz,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_title text,
  p_primary_focus uuid default null,
  p_secondary_focus uuid default null,
  p_location text default null,
  p_notes text default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org        uuid;
  v_plan       uuid;
  v_current    timestamptz;
  v_updated_at timestamptz;
begin
  -- 1+2+3. NOT_FOUND, SESSION_CLOSED y bloqueos vía open_session.
  select s.org, s.plan into v_org, v_plan
  from private.open_session(p_event) as s;

  -- Leer updated_at (el plan ya está bloqueado).
  select pp.updated_at into v_current
  from public.practice_plans as pp
  where pp.organization_id = v_org
    and pp.id = v_plan;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_current is distinct from p_expected_updated_at then
    raise exception 'STALE_COPY' using errcode = 'P0001';
  end if;

  update public.events as e
  set starts_at = p_starts_at,
      ends_at   = p_ends_at,
      location  = p_location
  where e.organization_id = v_org
    and e.id = p_event;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.practice_plans as pp
  set title             = p_title,
      primary_focus_id  = p_primary_focus,
      secondary_focus_id = p_secondary_focus,
      notes             = p_notes
  where pp.organization_id = v_org
    and pp.id = v_plan
  returning pp.updated_at into v_updated_at;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_updated_at;
end;
$$;

-- ── save_practice_items ──────────────────────────────────────────────────────────────
-- Reescrita para usar private.open_session cuando el plan tiene evento.
-- Un plan de equipo sin evento (plantilla sin fecha) sigue sin sesión que cerrar.
create or replace function public.save_practice_items(
  p_plan uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb,
  p_save_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org          uuid;
  v_event        uuid;
  v_current      timestamptz;
  v_last_save_id uuid;
  v_updated_at   timestamptz;
  v_item_ids     uuid[];
begin
  -- 1. Un plan de un equipo que se gestiona. Un plan sin equipo no lo gestiona nadie.
  select pp.organization_id, pp.event_id
  into   v_org, v_event
  from public.practice_plans as pp
  where pp.id = p_plan
    and private.can_manage_team(pp.team_id);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_event is not null then
    -- 2+3. SESSION_CLOSED y bloqueos vía open_session.
    perform private.open_session(v_event);
  end if;

  -- El plan, bloqueado (ya bloqueado por open_session si había evento).
  select pp.updated_at, pp.last_save_id
  into v_current, v_last_save_id
  from public.practice_plans as pp
  where pp.organization_id = v_org
    and pp.id = p_plan
  -- Solo aplica FOR UPDATE cuando no hay evento (si hay evento open_session ya lo bloqueó).
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_current is distinct from p_expected_updated_at then
    if p_save_id is not null and v_last_save_id = p_save_id then
      select array_agg(pi.id order by pi.sort)
      into v_item_ids
      from public.practice_items as pi
      where pi.organization_id = v_org
        and pi.plan_id = p_plan;

      return jsonb_build_object(
        'updated_at', to_jsonb(v_current),
        'item_ids', coalesce(to_jsonb(v_item_ids), '[]'::jsonb)
      );
    end if;
    raise exception 'STALE_COPY' using errcode = 'P0001';
  end if;

  -- 4. La entrada.
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as it (item)
    where jsonb_typeof(it.item) <> 'object'
  ) then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) as it (item)
    where it.item ->> 'id' is not null
      and not exists (
        select 1
        from public.practice_items as pi
        where pi.organization_id = v_org
          and pi.plan_id = p_plan
          and pi.id = (it.item ->> 'id')::uuid
      )
  ) then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  if (
    select count(*) <> count(distinct (it.item ->> 'id')::uuid)
    from jsonb_array_elements(p_items) as it (item)
    where it.item ->> 'id' is not null
  ) then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  delete from public.practice_items as pi
  where pi.organization_id = v_org
    and pi.plan_id = p_plan
    and not exists (
      select 1
      from jsonb_array_elements(p_items) as it (item)
      where (it.item ->> 'id')::uuid = pi.id
    );

  update public.practice_items as pi
  set sort           = it.pos::int,
      phase          = it.item ->> 'phase',
      drill_id       = (it.item ->> 'drill_id')::uuid,
      title_override = it.item ->> 'title',
      minutes        = (it.item ->> 'minutes')::smallint,
      notes          = it.item ->> 'notes'
  from jsonb_array_elements(p_items) with ordinality as it (item, pos)
  where pi.organization_id = v_org
    and pi.plan_id = p_plan
    and pi.id = (it.item ->> 'id')::uuid;

  insert into public.practice_items (
    organization_id, plan_id, sort, phase, drill_id, title_override, minutes, notes
  )
  select v_org, p_plan, it.pos::int, it.item ->> 'phase', (it.item ->> 'drill_id')::uuid,
         it.item ->> 'title', (it.item ->> 'minutes')::smallint, it.item ->> 'notes'
  from jsonb_array_elements(p_items) with ordinality as it (item, pos)
  where it.item ->> 'id' is null;

  update public.practice_plans as pp
  set status       = case when jsonb_array_length(p_items) > 0 then 'ready' else 'draft' end,
      last_save_id = p_save_id
  where pp.organization_id = v_org
    and pp.id = p_plan
  returning pp.updated_at into v_updated_at;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select array_agg(
    case
      when it.item ->> 'id' is not null then (it.item ->> 'id')::uuid
      else (
        select pi.id
        from public.practice_items as pi
        where pi.organization_id = v_org
          and pi.plan_id = p_plan
          and pi.sort = it.pos::int
          and (it.item ->> 'id') is null
      )
    end
    order by it.pos
  )
  into v_item_ids
  from jsonb_array_elements(p_items) with ordinality as it (item, pos);

  return jsonb_build_object(
    'updated_at', to_jsonb(v_updated_at),
    'item_ids', coalesce(to_jsonb(v_item_ids), '[]'::jsonb)
  );
end;
$$;

-- ── Nuevos privilegios de columna ──────────────────────────────────────────────────────
-- record_live_progress escribe los resultados de la sesión en cada ítem (`completed` y
-- `actual_minutes`) y el total real en el plan (`actual_minutes`). Las políticas existentes
-- (`can_edit_plan`) ya limitan la escritura a sesiones abiertas del equipo.
grant update (completed, actual_minutes) on table public.practice_items to authenticated;
grant update (actual_minutes) on table public.practice_plans to authenticated;

-- ── public.record_live_progress ──────────────────────────────────────────────────────
-- Escribe el progreso en tiempo real de una sesión abierta y devuelve
-- `{ "applied": <int>, "updated_at": "<texto>" }`.
--
-- Reglas (C24, C26):
--   1. NOT_FOUND si el evento no es un entreno con plan de un equipo que se gestiona.
--   2. Si el evento está done y p_finished = true → idempotente: applied = 0 (D7).
--      done con p_finished = false, o cancelled → SESSION_CLOSED.
--   3. Sin STALE_COPY: Live no lleva copia (D3).
--   4. INVALID si p_items no es lista, > 30 elementos, un elemento sin id uuid,
--      completed no booleano, actual_minutes fuera de 0–180, o id repetido.
--   5. Ids que no son ítems de este plan se ignoran (D4); no cuentan en applied.
--   6. Orden de escritura: ítems → plan → evento (C24).
create function public.record_live_progress(
  p_event          uuid,
  p_items          jsonb,
  p_finished       boolean,
  p_actual_minutes int default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org        uuid;
  v_status     public.event_status;
  v_plan       uuid;
  v_applied    int;
  v_updated_at timestamptz;
begin
  -- 1. Un entreno con plan de un equipo que se gestiona.
  select e.organization_id, e.status, pp.id
  into   v_org, v_status, v_plan
  from public.events as e
  join public.practice_plans as pp
    on pp.organization_id = e.organization_id
   and pp.event_id = e.id
  where e.id = p_event
    and e.kind = 'practice'
    and private.can_manage_team(e.team_id);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 2. done + p_finished = true → idempotente (D7).
  if v_status = 'done' and p_finished then
    select pp.updated_at into v_updated_at
    from public.practice_plans as pp
    where pp.organization_id = v_org
      and pp.id = v_plan;

    return jsonb_build_object('applied', 0, 'updated_at', v_updated_at);
  end if;

  -- done + !finished, o cancelled → SESSION_CLOSED.
  if v_status <> 'scheduled' then
    raise exception 'SESSION_CLOSED' using errcode = 'P0001';
  end if;

  -- 3. Sin STALE_COPY. open_session bloquea evento y plan.
  perform private.open_session(p_event);

  -- 4. Validación de la entrada.
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  if jsonb_array_length(p_items) > 30 then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as it(item)
    where jsonb_typeof(it.item) <> 'object'
  ) then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  -- Cada elemento necesita id (válido como uuid) y completed (booleano).
  begin
    if exists (
      select 1 from jsonb_array_elements(p_items) as it(item)
      where it.item ->> 'id' is null
         or jsonb_typeof(it.item -> 'completed') is distinct from 'boolean'
         or (it.item ->> 'actual_minutes' is not null
             and (it.item ->> 'actual_minutes')::int not between 0 and 180)
    ) then
      raise exception 'INVALID' using errcode = '22023';
    end if;

    -- Comprobar que id sea un uuid sintácticamente válido.
    perform (it.item ->> 'id')::uuid
    from jsonb_array_elements(p_items) as it(item);
  exception when invalid_text_representation or invalid_parameter_value then
    raise exception 'INVALID' using errcode = '22023';
  end;

  -- Ids únicos en la lista.
  if (select count(distinct it.item ->> 'id')
      from jsonb_array_elements(p_items) as it(item))
     < jsonb_array_length(p_items) then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  -- 5. Escribir los ítems que pertenecen a este plan (ignorar los ajenos).
  update public.practice_items as pi
  set completed      = (src.item ->> 'completed')::boolean,
      actual_minutes = (src.item ->> 'actual_minutes')::smallint
  from jsonb_array_elements(p_items) as src(item)
  where pi.organization_id = v_org
    and pi.plan_id = v_plan
    and pi.id = (src.item ->> 'id')::uuid;

  get diagnostics v_applied = row_count;

  -- 6. Actualizar el plan: updated_at avanza con el trigger (C22).
  --    Al cerrar: actual_minutes y status = 'done'.
  update public.practice_plans as pp
  set actual_minutes = case when p_finished
        then coalesce(
          p_actual_minutes,
          (select sum(pi.actual_minutes)::int
           from public.practice_items as pi
           where pi.organization_id = v_org and pi.plan_id = v_plan)
        )
        else actual_minutes end,
      status = case when p_finished then 'done' else status end
  where pp.organization_id = v_org
    and pp.id = v_plan
  returning pp.updated_at into v_updated_at;

  -- 7. Al cerrar: ítems no enviados → completed = false, actual_minutes = null.
  --    El evento se cierra al final (C24).
  if p_finished then
    update public.practice_items as pi
    set completed      = false,
        actual_minutes = null
    where pi.organization_id = v_org
      and pi.plan_id = v_plan
      and not exists (
        select 1 from jsonb_array_elements(p_items) as src(item)
        where (src.item ->> 'id')::uuid = pi.id
      );

    update public.events as e
    set status = 'done'
    where e.organization_id = v_org
      and e.id = p_event;
  end if;

  return jsonb_build_object('applied', v_applied, 'updated_at', v_updated_at);
end;
$$;

revoke all on function public.record_live_progress(uuid, jsonb, boolean, int)
  from public, anon, service_role;
grant execute on function public.record_live_progress(uuid, jsonb, boolean, int)
  to authenticated;
