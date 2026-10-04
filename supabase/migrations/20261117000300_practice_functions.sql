-- Sesiones de entrenamiento: escrituras atómicas.
--
-- Cuatro operaciones que tocan más de una tabla y que por eso no se resuelven con un insert o
-- un update suelto: crear una sesión (su evento y su plan), editar sus datos (las horas y el
-- lugar están en el evento; el título, los focos y las notas, en el plan), guardar su lista de
-- ítems sin pisar lo que otro guardó antes, y duplicarla. Cada una es una función de `public`,
-- que las Server Actions invocan por RPC, y cada llamada es una sola transacción: una función
-- que falla no escribe nada.
--
-- Son `security invoker`: se ejecutan con el usuario de la sesión, y dentro valen los
-- privilegios por columna y las políticas de `20261117000200_practice_write.sql`. No abren nada
-- que un usuario no pudiera hacer ya sentencia a sentencia; lo que añaden es el orden, la
-- atomicidad y la copia obsoleta. De ahí salen cuatro cosas que se repiten más abajo:
--   · ninguna nombra `updated_by` ni escribe `updated_at` (no hay privilegio): los fijan los
--     triggers del plan en cada `update`. Por eso todo guardado hace un `update` del plan,
--     aunque solo hayan cambiado los ítems: es el que mueve la copia y anota quién guardó;
--   · al insertar no se eligen el `id`, el estado ni el autor, que salen de sus valores por
--     defecto. El estado de un plan se cambia después, con un `update`;
--   · un plan se inserta sin `returning` y se lee después por `event_id`, que es único: la
--     política de lectura busca la fila por su id antes de que exista, y el alta daría 42501;
--   · el plan de una sesión cerrada no se puede bloquear (`for update` pasa por la política de
--     `update`, que no lo deja): que una sesión está cerrada se decide antes, leyéndola.
--
-- Las reglas van en el mismo orden en las cuatro, y el orden es parte del contrato con las
-- Server Actions, que traducen los errores por SQLSTATE y mensaje:
--   1. `NOT_FOUND` (P0002): el equipo, el entreno o el plan no existe, o quien llama no
--      gestiona el equipo (`private.can_manage_team`). Se comprueba de forma explícita y antes
--      que nada: lo que RLS no deja ver y lo que se ve pero no se gestiona responden igual, y
--      quien no puede escribir no recibe nunca otro error. No llega a saber si la sesión
--      existe, si está cerrada ni si su copia está al día. Un partido, un entreno sin plan y
--      un plan sin equipo (una plantilla privada) tampoco son una sesión: `NOT_FOUND`.
--   2. `SESSION_CLOSED` (P0001): el entreno ya no está `scheduled`. Una sesión hecha o
--      cancelada es histórica: se lee y se duplica, no se cambia.
--   3. `STALE_COPY` (P0001): `p_expected_updated_at` no es el `updated_at` del plan, es decir,
--      alguien guardó antes. Se compara exacto, en microsegundos y tal cual lo devolvió el
--      guardado anterior; sin copia esperada también es obsoleta. La copia es una sola para
--      los datos de la sesión y para sus ítems.
--   4. `INVALID` (22023): entrada que la función rechaza antes de escribir.
-- Los checks y las claves foráneas de las tablas (23514, 23502, 23503…) no se traducen: se
-- dejan pasar. Un foco o un ejercicio de otro club es un 23503.
--
-- Editar y guardar bloquean dos filas, siempre en el mismo orden (el evento y después el
-- plan) para que dos llamadas simultáneas no acaben esperándose la una a la otra:
--   · el evento, para que un cierre simultáneo no se cuele entre la comprobación del estado y
--     la escritura. Las políticas leen el estado del evento con la instantánea de cada
--     sentencia: sin el bloqueo, una sesión podría cerrarse a mitad de un guardado y quedarse
--     con ítems escritos después de cerrada. Con él, quien cierra espera a que el guardado
--     acabe; y si el cierre llegó antes, el bloqueo ya no encuentra la fila;
--   · el plan, para que el segundo de dos guardados simultáneos espere al primero y al
--     despertar vea su `updated_at` nuevo.
--
-- Y un `update` que no encuentra su fila no pasa en silencio: bajo RLS no falla, no toca
-- nada. Aquí solo puede ocurrir si quien llama deja de gestionar el equipo a mitad de la
-- llamada; entonces es `NOT_FOUND` y se deshace lo escrito hasta ahí.

-- ── create_practice_session ──────────────────────────────────────────────────────────
-- Crea un entreno programado en un equipo que se gestiona, con su plan en borrador y sin
-- ítems, y devuelve el id del evento. El club es el del equipo, no uno que venga de fuera. El
-- plan nace a nombre de quien llama (`created_by` y `updated_by` por defecto).
--
-- Los tres últimos parámetros tienen `default null`: los tipos generados para el cliente los
-- marcan opcionales. Que la sesión acabe después de empezar, que el título tenga entre 1 y 80
-- caracteres y que los focos sean del club y distintos lo dicen las tablas (23514, 23503).
create function public.create_practice_session(
  p_team uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_title text,
  p_primary_focus uuid default null,
  p_secondary_focus uuid default null,
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
  select t.organization_id
  into v_org
  from public.teams as t
  where t.id = p_team
    and private.can_manage_team(t.id);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- El `returning` pasa por la política de lectura de `events`, que mira el club y el equipo
  -- de la fila y no la busca por su id: la fila nueva la cumple.
  insert into public.events as e (organization_id, team_id, kind, starts_at, ends_at, location)
  values (v_org, p_team, 'practice', p_starts_at, p_ends_at, p_location)
  returning e.id into v_event;

  -- Sin `returning`. El evento ya existe cuando se inserta el plan: la política de alta del
  -- plan lo busca, y en una sola sentencia con el alta del evento no lo vería.
  insert into public.practice_plans (
    organization_id, team_id, event_id, title, primary_focus_id, secondary_focus_id
  )
  values (v_org, p_team, v_event, p_title, p_primary_focus, p_secondary_focus);

  return v_event;
end;
$$;

-- ── update_practice_session ──────────────────────────────────────────────────────────
-- Cambia los datos de una sesión abierta y devuelve el `updated_at` nuevo de su plan, que es
-- la copia que tendrá quien siga editando. Las horas y el lugar van al evento; el título, los
-- focos y las notas, al plan. Los ítems, el estado del plan y el del evento no se tocan.
--
-- Editar es dejar la sesión tal como dice la llamada: un opcional que no llega (el lugar, un
-- foco, las notas) queda vacío, no como estaba.
create function public.update_practice_session(
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
  v_org uuid;
  v_team uuid;
  v_status public.event_status;
  v_plan uuid;
  v_current timestamptz;
  v_updated_at timestamptz;
begin
  -- 1. Un entreno, con su plan, de un equipo que se gestiona.
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

  -- 2. Todavía programado. Se decide aquí, con una lectura: el bloqueo de abajo no devuelve
  -- la fila de una sesión cerrada.
  if v_status <> 'scheduled' then
    raise exception 'SESSION_CLOSED' using errcode = 'P0001';
  end if;

  -- 3. El evento y el plan, bloqueados hasta el final de la transacción.
  perform 1
  from public.events as e
  where e.organization_id = v_org
    and e.id = p_event
  for update;

  -- La política de `update` solo deja bloquear un entreno programado de un equipo que se
  -- gestiona. Sin fila, entre la lectura de arriba y el bloqueo otra transacción cerró la
  -- sesión; o le quitó el equipo a quien llama, que entonces no debe saber nada más.
  if not found then
    if private.can_manage_team(v_team) then
      raise exception 'SESSION_CLOSED' using errcode = 'P0001';
    end if;
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select pp.updated_at
  into v_current
  from public.practice_plans as pp
  where pp.organization_id = v_org
    and pp.id = v_plan
  for update;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_current is distinct from p_expected_updated_at then
    raise exception 'STALE_COPY' using errcode = 'P0001';
  end if;

  update public.events as e
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      location = p_location
  where e.organization_id = v_org
    and e.id = p_event;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.practice_plans as pp
  set title = p_title,
      primary_focus_id = p_primary_focus,
      secondary_focus_id = p_secondary_focus,
      notes = p_notes
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
-- Deja la lista de ítems de un plan tal como llega en `p_items` y devuelve el `updated_at`
-- nuevo del plan. `p_items` es una lista, en el orden de la sesión, de objetos con las claves
-- `id` (opcional), `drill_id`, `title`, `phase`, `minutes` y `notes`; una clave ausente o
-- null vale null, y las demás claves no se leen. Una sesión lleva como mucho 30 ítems, y una
-- lista vacía la deja sin ninguno.
--
--   · los ítems del plan cuyo `id` no llega se borran;
--   · los que llegan con `id` se cambian en su fila: conservan lo que pasó en la pista
--     (`completed` y `actual_minutes`), que borrar y volver a insertar perdería;
--   · los que llegan sin `id` se insertan, con el club del plan;
--   · `sort` es la posición en la lista, desde 1. La posición es única por plan y se
--     comprueba al cerrar la transacción, así que renumerar no choca consigo mismo;
--   · `title` se guarda en `title_override`: un ítem lleva siempre su título, también cuando
--     es un ejercicio de la biblioteca;
--   · el plan queda `ready` si tiene algún ítem y `draft` si no. Ese `update` se hace siempre.
--
-- Un `id` tiene que ser el de un ítem de este plan y llegar una sola vez. El de un ítem de
-- otro plan, sea del equipo, del club o de otro club, y uno que no existe dan el mismo
-- `INVALID`. Los minutos fuera de 1–120, un título vacío y un ítem sin ejercicio ni título los
-- rechazan los checks de la tabla.
--
-- Vale también para un plan de equipo sin evento (sin fecha todavía), que la política deja
-- editar a quien gestiona el equipo: no hay sesión que pueda estar cerrada ni evento que
-- bloquear.
create function public.save_practice_items(
  p_plan uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb
)
returns timestamptz
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
    -- 2. Su entreno, todavía programado. Un evento que no se llegara a ver cuenta como
    -- cerrado: ante la duda no se escribe.
    if v_status is distinct from 'scheduled' then
      raise exception 'SESSION_CLOSED' using errcode = 'P0001';
    end if;

    -- 3. El evento, bloqueado hasta el final de la transacción. Como en
    -- `update_practice_session`: sin fila, alguien cerró la sesión entre la lectura y el
    -- bloqueo, o le quitó el equipo a quien llama.
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

  -- 4. La entrada. Una lista null no es una lista vacía: no borra los ítems. Cada
  -- comprobación va en su `if`: la longitud de algo que no es una lista es un error.
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

  -- … y llega una sola vez: dos elementos con el mismo `id` pedirían dos posiciones para la
  -- misma fila.
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

  -- Siempre, aunque el estado no cambie: es el `update` que mueve `updated_at` y anota en
  -- `updated_by` a quien guarda. La copia es de todo el plan, ítems incluidos.
  update public.practice_plans as pp
  set status = case when jsonb_array_length(p_items) > 0 then 'ready' else 'draft' end
  where pp.organization_id = v_org
    and pp.id = p_plan
  returning pp.updated_at into v_updated_at;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_updated_at;
end;
$$;

-- ── duplicate_practice ───────────────────────────────────────────────────────────────
-- Crea una sesión nueva a partir de otra y devuelve el id del evento nuevo. El origen puede
-- estar en cualquier estado (programado, hecho o cancelado): solo se lee, y no se bloquea ni
-- se toca ninguna de sus filas. No hay copia esperada: no se guarda sobre nada que exista.
--
-- La sesión nueva es un entreno programado del mismo equipo, con el mismo lugar y la misma
-- duración desde `p_starts_at`; su plan lleva el título, los focos y las notas del origen, a
-- nombre de quien duplica; y sus ítems son los del origen en el mismo orden, renumerados desde
-- 1 y sin lo que pasó en la pista (`completed` y `actual_minutes`). El plan queda `ready` si
-- tiene algún ítem y `draft` si no, como al guardar.
create function public.duplicate_practice(
  p_event uuid,
  p_starts_at timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_team uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_location text;
  v_plan uuid;
  v_title text;
  v_primary_focus uuid;
  v_secondary_focus uuid;
  v_notes text;
  v_new_event uuid;
  v_new_plan uuid;
begin
  select e.organization_id, e.team_id, e.starts_at, e.ends_at, e.location,
         pp.id, pp.title, pp.primary_focus_id, pp.secondary_focus_id, pp.notes
  into v_org, v_team, v_starts_at, v_ends_at, v_location,
       v_plan, v_title, v_primary_focus, v_secondary_focus, v_notes
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

  if p_starts_at is null then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  -- La duración se suma en segundos, no como el intervalo que da restar las dos horas: ese
  -- intervalo lleva días, y un día sumado a una hora es un día de calendario en la zona
  -- horaria de la sesión de base de datos, que a través de un cambio de hora no son 24 horas.
  insert into public.events as e (organization_id, team_id, kind, starts_at, ends_at, location)
  values (
    v_org, v_team, 'practice', p_starts_at,
    p_starts_at + make_interval(secs => extract(epoch from (v_ends_at - v_starts_at))),
    v_location
  )
  returning e.id into v_new_event;

  insert into public.practice_plans (
    organization_id, team_id, event_id, title, primary_focus_id, secondary_focus_id, notes
  )
  values (v_org, v_team, v_new_event, v_title, v_primary_focus, v_secondary_focus, v_notes);

  select pp.id
  into v_new_plan
  from public.practice_plans as pp
  where pp.organization_id = v_org
    and pp.event_id = v_new_event;

  insert into public.practice_items (
    organization_id, plan_id, sort, phase, drill_id, title_override, minutes, notes
  )
  select v_org, v_new_plan, (row_number() over (order by pi.sort, pi.id))::int,
         pi.phase, pi.drill_id, pi.title_override, pi.minutes, pi.notes
  from public.practice_items as pi
  where pi.organization_id = v_org
    and pi.plan_id = v_plan;

  -- El plan nació `draft`, que es lo que le toca sin ítems. Si se copió alguno, `ready`.
  if found then
    update public.practice_plans as pp
    set status = 'ready'
    where pp.organization_id = v_org
      and pp.id = v_new_plan;

    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  return v_new_event;
end;
$$;

-- ── Privilegios ──────────────────────────────────────────────────────────────────────
-- Solo `authenticated`, como las demás funciones de escritura: Postgres da `execute` a PUBLIC
-- en toda función nueva y Supabase lo da además a anon, authenticated y service_role en
-- `public`; se quita lo que sobra. Ninguna sirve sin sesión de usuario (los permisos salen de
-- `auth.uid()`), y la clave de servicio se salta RLS: escribiría en cualquier equipo.
revoke all on function public.create_practice_session(
  uuid, timestamptz, timestamptz, text, uuid, uuid, text
) from public, anon, service_role;
revoke all on function public.update_practice_session(
  uuid, timestamptz, timestamptz, timestamptz, text, uuid, uuid, text, text
) from public, anon, service_role;
revoke all on function public.save_practice_items(uuid, timestamptz, jsonb)
  from public, anon, service_role;
revoke all on function public.duplicate_practice(uuid, timestamptz)
  from public, anon, service_role;

grant execute on function public.create_practice_session(
  uuid, timestamptz, timestamptz, text, uuid, uuid, text
) to authenticated;
grant execute on function public.update_practice_session(
  uuid, timestamptz, timestamptz, timestamptz, text, uuid, uuid, text, text
) to authenticated;
grant execute on function public.save_practice_items(uuid, timestamptz, jsonb)
  to authenticated;
grant execute on function public.duplicate_practice(uuid, timestamptz)
  to authenticated;
