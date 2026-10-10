-- El servidor pasa a saber si una sesión está empezada y por dónde va.
--
-- Hasta ahora el progreso del directo vivía solo en el dispositivo (`localStorage`): Inicio no
-- podía distinguir «Iniciar» de «Continuar», y la ficha solo decía «Continuar» en el móvil
-- que la había empezado. Dos columnas en `practice_plans`:
--   · `live_started_at`: cuándo se pulsó «Iniciar». Nulo = sin empezar.
--   · `live_position`: el índice (desde 0) del ejercicio en curso.
-- Se guarda la posición y no el id del ítem: no hay clave foránea circular entre el plan y sus
-- ítems, y quien la lee la acota al número de ejercicios.
--
-- Las escribe `record_live_progress`, que gana dos parámetros opcionales al final (C15), y
-- las borra `reset_live_progress` («Empezar de nuevo»). Ninguna tabla nueva: las columnas
-- siguen las políticas del plan (`can_edit_plan`).

alter table public.practice_plans
  add column live_started_at timestamptz,
  add column live_position smallint,
  add constraint practice_plans_live_position_check
    check (
      live_position is null
      or (live_position between 0 and 29 and live_started_at is not null)
    );

-- Una columna nueva nace sin privilegios (C27). Las funciones son `security invoker`.
grant update (live_started_at, live_position) on table public.practice_plans to authenticated;

-- ── public.record_live_progress ──────────────────────────────────────────────────────
-- La misma función de `20261201000300_live_progress.sql`, con el estado del directo:
--   · `p_started_at`: se guarda la primera vez que llega y ya no cambia.
--   · `p_position`: sustituye a la anterior. INVALID si no está entre 0 y 29, o si llega
--     sin que la sesión esté empezada (ni guardada ni en esta llamada).
-- Cambia la lista de argumentos: se borra la de cuatro y se crea la de seis.
drop function public.record_live_progress(uuid, jsonb, boolean, int);

create function public.record_live_progress(
  p_event          uuid,
  p_items          jsonb,
  p_finished       boolean,
  p_actual_minutes int default null,
  p_started_at     timestamptz default null,
  p_position       int default null
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
  v_started_at timestamptz;
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

  -- La posición: entre 0 y 29, y solo con la sesión empezada (ya guardada o en esta llamada).
  if p_position is not null then
    if p_position not between 0 and 29 then
      raise exception 'INVALID' using errcode = '22023';
    end if;

    select pp.live_started_at into v_started_at
    from public.practice_plans as pp
    where pp.organization_id = v_org
      and pp.id = v_plan;

    if coalesce(v_started_at, p_started_at) is null then
      raise exception 'INVALID' using errcode = '22023';
    end if;
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
      status = case when p_finished then 'done' else status end,
      live_started_at = coalesce(pp.live_started_at, p_started_at),
      live_position = coalesce(p_position::smallint, pp.live_position)
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

revoke all on function public.record_live_progress(uuid, jsonb, boolean, int, timestamptz, int)
  from public, anon, service_role;
grant execute on function public.record_live_progress(uuid, jsonb, boolean, int, timestamptz, int)
  to authenticated;

-- ── public.reset_live_progress ───────────────────────────────────────────────────────
-- «Empezar de nuevo»: deja una sesión abierta como si nunca se hubiera iniciado. Borra el
-- estado del directo del plan y lo registrado en sus ítems, y devuelve el `updated_at` nuevo
-- del plan (C22: escribir en los ítems mueve la copia de la sesión).
--
-- Entra por `private.open_session` (C26): NOT_FOUND si el evento no es un entreno con plan de
-- un equipo que se gestiona; SESSION_CLOSED si ya no está programado. Una sesión terminada no
-- se reinicia: se duplica.
create function public.reset_live_progress(p_event uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org        uuid;
  v_plan       uuid;
  v_updated_at timestamptz;
begin
  select s.org, s.plan into v_org, v_plan
  from private.open_session(p_event) as s;

  update public.practice_items as pi
  set completed      = null,
      actual_minutes = null
  where pi.organization_id = v_org
    and pi.plan_id = v_plan;

  update public.practice_plans as pp
  set live_started_at = null,
      live_position   = null
  where pp.organization_id = v_org
    and pp.id = v_plan
  returning pp.updated_at into v_updated_at;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_updated_at;
end;
$$;

revoke all on function public.reset_live_progress(uuid) from public, anon, service_role;
grant execute on function public.reset_live_progress(uuid) to authenticated;
