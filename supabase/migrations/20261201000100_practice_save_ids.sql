-- Los ids de los ítems son estables entre guardados del constructor (C23).
--
-- `save_practice_items` cambia su tipo de retorno: de `timestamptz` a `jsonb` con
-- `{ "updated_at": "<texto>", "item_ids": ["<uuid>", …] }`. Postgres no permite cambiar el
-- tipo de retorno con `create or replace`, así que se elimina la función con su firma actual
-- y se crea de nuevo con la nueva, sin tocar permisos o privilegios más de lo necesario.
--
-- Se añade también `p_save_id uuid default null` para la Task 2 (respuesta perdida). Aquí
-- no se usa todavía: el parámetro existe, llega como null y se ignora. La Task 2 rellena su
-- semántica en la misma migración (que aún no está en main).
--
-- El `item_ids` devuelve los ids en el mismo orden que `p_items`, que es el orden de la
-- sesión en la interfaz. El constructor los pone a cada ítem por posición al recibir la
-- respuesta: un ítem que llegó sin `id` se queda con el que le asignó la base de datos, y
-- uno que llegó con `id` conserva el suyo. Así el siguiente guardado los envía con `id` y
-- la base no los borra y re-crea (C23).

drop function public.save_practice_items(uuid, timestamptz, jsonb);

create function public.save_practice_items(
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
  v_org uuid;
  v_team uuid;
  v_event uuid;
  v_status public.event_status;
  v_current timestamptz;
  v_updated_at timestamptz;
  v_item_ids uuid[];
begin
  -- 1. Un plan de un equipo que se gestiona. Un plan sin equipo no lo gestiona nadie.
  select pp.organization_id, pp.team_id, pp.event_id, e.status
  into v_org, v_team, v_event, v_status
  from public.practice_plans as pp
  left join public.events as e
    on e.organization_id = pp.organization_id
   and e.id = pp.event_id
  where pp.id = p_plan
    and private.can_manage_team(pp.team_id);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_event is not null then
    -- 2. Su entreno, todavía programado.
    if v_status is distinct from 'scheduled' then
      raise exception 'SESSION_CLOSED' using errcode = 'P0001';
    end if;

    -- 3. El evento, bloqueado hasta el final de la transacción.
    perform 1
    from public.events as e
    where e.organization_id = v_org
      and e.id = v_event
    for update;

    if not found then
      if private.can_manage_team(v_team) then
        raise exception 'SESSION_CLOSED' using errcode = 'P0001';
      end if;
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  -- Y el plan.
  select pp.updated_at
  into v_current
  from public.practice_plans as pp
  where pp.organization_id = v_org
    and pp.id = p_plan
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_current is distinct from p_expected_updated_at then
    raise exception 'STALE_COPY' using errcode = 'P0001';
  end if;

  -- 4. La entrada. Una lista null no es una lista vacía: no borra los ítems.
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

  -- Cada `id` es de un ítem de este plan…
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

  -- … y llega una sola vez.
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
  set sort = it.pos::int,
      phase = it.item ->> 'phase',
      drill_id = (it.item ->> 'drill_id')::uuid,
      title_override = it.item ->> 'title',
      minutes = (it.item ->> 'minutes')::smallint,
      notes = it.item ->> 'notes'
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

  -- Siempre: mueve `updated_at` y anota `updated_by`.
  update public.practice_plans as pp
  set status = case when jsonb_array_length(p_items) > 0 then 'ready' else 'draft' end
  where pp.organization_id = v_org
    and pp.id = p_plan
  returning pp.updated_at into v_updated_at;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Los ids de los ítems en el orden de p_items: primero los que existían (por id),
  -- luego los nuevos (por posición de inserción). Se reconstruye respetando el orden
  -- original de la lista, leyendo cada ítem por su posición.
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

-- Privilegios: la firma nueva necesita su propio revoke/grant. La antigua ya no existe.
revoke all on function public.save_practice_items(uuid, timestamptz, jsonb, uuid)
  from public, anon, service_role;

grant execute on function public.save_practice_items(uuid, timestamptz, jsonb, uuid)
  to authenticated;
