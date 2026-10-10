-- Plantillas de sesión: una sesión que ha salido bien se guarda y se vuelve a usar.
--
-- Una plantilla es un plan sin equipo ni evento, con `is_template`, de quien la guarda. La
-- columna existe desde `20261005000300_calendar_practice.sql` y la política de lectura ya deja
-- ver un plan sin equipo solo a su autor (y a la dirección del club), pero hasta ahora ningún
-- usuario podía crear, cambiar ni borrar uno: no había política que lo abriera.
--
-- Aquí:
--   1. Un `check`: una plantilla no tiene evento. Y por la API, un plan de equipo no se da
--      de alta como plantilla.
--   2. Políticas y privilegios para dar de alta una plantilla propia con sus ítems y para
--      borrarla. No se editan: se corrige la sesión y se guarda otra.
--   3. `save_practice_as_template`: copia una sesión (título, objetivos, notas y ejercicios).
--   4. `create_practice_from_template`: crea una sesión de un equipo con los ejercicios de una
--      plantilla propia.
--
-- Sin tablas nuevas. Las plantillas son personales: otro entrenador del mismo club no ve, no
-- usa y no borra la mía.

-- ── 1. Una plantilla no es la sesión de un entreno ──────────────────────────────────────
-- El esquema admite una plantilla con equipo (nadie la crea todavía: compartirlas llega con
-- los roles de coordinación), así que el `check` solo cierra el evento.
alter table public.practice_plans
  add constraint practice_plans_template_check
    check (not is_template or event_id is null);

-- ── 2. Privilegios y políticas ──────────────────────────────────────────────────────────
-- `is_template` no se podía escribir (C27: una columna que la app no escribe no se concede), y
-- los planes no se borraban. `created_by` sigue sin concederse: lo pone su valor por defecto,
-- `auth.uid()`, y así una plantilla es siempre de quien la crea.
grant insert (is_template) on table public.practice_plans to authenticated;
grant delete on table public.practice_plans to authenticated;

-- Con `is_template` ya concedida, el alta de un plan de equipo la rechaza si viene marcada:
-- la política es la de `20261117000200_practice_write.sql` con esa condición delante.
alter policy practice_plans_insert_managed
  on public.practice_plans
  with check (
    not is_template
    and team_id is not null
    and private.can_manage_team(team_id)
    and (
      event_id is null
      or exists (
        select 1
        from public.events as e
        where e.organization_id = practice_plans.organization_id
          and e.id = practice_plans.event_id
          and e.status = 'scheduled'
      )
    )
  );

-- Alta: una plantilla, sin equipo ni evento, propia, en un club donde se entrena o se dirige.
create policy practice_plans_insert_template
  on public.practice_plans
  for insert
  to authenticated
  with check (
    is_template
    and team_id is null
    and event_id is null
    and created_by = (select auth.uid())
    and private.has_org_role(organization_id, array['admin', 'coach']::public.org_role[])
  );

-- Borrado: solo una plantilla propia. Un plan de equipo sigue sin poder borrarse: ninguna
-- política lo abre, y el `delete` no encuentra filas. Sus ítems se van con ella
-- (`on delete cascade`).
create policy practice_plans_delete_own_template
  on public.practice_plans
  for delete
  to authenticated
  using (
    is_template
    and team_id is null
    and event_id is null
    and created_by = (select auth.uid())
  );

-- Ítems: se añaden a una plantilla propia. `practice_items_insert_editable` no sirve aquí:
-- `can_edit_plan` es falso para un plan sin equipo. La subconsulta pasa por la política de
-- lectura de `practice_plans`, que deja ver la plantilla a su autor.
create policy practice_items_insert_template
  on public.practice_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.practice_plans as pp
      where pp.organization_id = practice_items.organization_id
        and pp.id = practice_items.plan_id
        and pp.is_template
        and pp.team_id is null
        and pp.created_by = (select auth.uid())
    )
  );

-- ── 3. public.save_practice_as_template ─────────────────────────────────────────────────
-- Guarda como plantilla la sesión de un entreno: su título, sus objetivos, sus notas y sus
-- ejercicios con fase y minutos. Devuelve el id de la plantilla. Vale una sesión programada,
-- hecha o cancelada: no se escribe en ella.
--
-- Reglas (C26):
--   1. NOT_FOUND si el evento no es un entreno con plan de un equipo que se gestiona.
--   2. INVALID si la sesión no tiene ejercicios: una plantilla vacía no ahorra nada.
--   3. TEMPLATE_LIMIT con 50 plantillas propias en ese club.
create function public.save_practice_as_template(p_event uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org             uuid;
  v_plan            uuid;
  v_title           text;
  v_primary_focus   uuid;
  v_secondary_focus uuid;
  v_notes           text;
  v_template        uuid;
begin
  select e.organization_id, pp.id, pp.title, pp.primary_focus_id, pp.secondary_focus_id, pp.notes
  into v_org, v_plan, v_title, v_primary_focus, v_secondary_focus, v_notes
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

  if not exists (
    select 1
    from public.practice_items as pi
    where pi.organization_id = v_org
      and pi.plan_id = v_plan
  ) then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.practice_plans as pp
    where pp.organization_id = v_org
      and pp.is_template
      and pp.team_id is null
      and pp.created_by = (select auth.uid())
  ) >= 50 then
    raise exception 'TEMPLATE_LIMIT' using errcode = 'P0001';
  end if;

  -- Con `returning`: la política de lectura mira las columnas de la fila nueva
  -- (`20261201000200_practice_read_policy.sql`), y una plantilla propia la ve su autor.
  insert into public.practice_plans as pp (
    organization_id, team_id, event_id, title, primary_focus_id, secondary_focus_id, notes,
    is_template
  )
  values (v_org, null, null, v_title, v_primary_focus, v_secondary_focus, v_notes, true)
  returning pp.id into v_template;

  insert into public.practice_items (
    organization_id, plan_id, sort, phase, drill_id, title_override, minutes, notes
  )
  select v_org, v_template, (row_number() over (order by pi.sort, pi.id))::int,
         pi.phase, pi.drill_id, pi.title_override, pi.minutes, pi.notes
  from public.practice_items as pi
  where pi.organization_id = v_org
    and pi.plan_id = v_plan;

  return v_template;
end;
$$;

-- ── 4. public.create_practice_from_template ─────────────────────────────────────────────
-- Un entreno programado de un equipo con los ejercicios de una plantilla propia. El título,
-- los objetivos y el lugar son los que llegan (el formulario los propone desde la plantilla y
-- se pueden cambiar); las notas son las de la plantilla. Devuelve el id del evento.
--
-- Reglas (C26): NOT_FOUND, sin distinguir, si el equipo no se gestiona, o si la plantilla no
-- existe, no es una plantilla, no es de quien llama o es de otro club que el equipo.
create function public.create_practice_from_template(
  p_template uuid,
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
  v_org   uuid;
  v_notes text;
  v_event uuid;
  v_plan  uuid;
begin
  select t.organization_id
  into v_org
  from public.teams as t
  where t.id = p_team
    and private.can_manage_team(t.id);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select pp.notes
  into v_notes
  from public.practice_plans as pp
  where pp.id = p_template
    and pp.organization_id = v_org
    and pp.is_template
    and pp.team_id is null
    and pp.created_by = (select auth.uid());

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.events as e (organization_id, team_id, kind, starts_at, ends_at, location)
  values (v_org, p_team, 'practice', p_starts_at, p_ends_at, p_location)
  returning e.id into v_event;

  insert into public.practice_plans (
    organization_id, team_id, event_id, title, primary_focus_id, secondary_focus_id, notes
  )
  values (v_org, p_team, v_event, p_title, p_primary_focus, p_secondary_focus, v_notes);

  select pp.id
  into v_plan
  from public.practice_plans as pp
  where pp.organization_id = v_org
    and pp.event_id = v_event;

  insert into public.practice_items (
    organization_id, plan_id, sort, phase, drill_id, title_override, minutes, notes
  )
  select v_org, v_plan, (row_number() over (order by pi.sort, pi.id))::int,
         pi.phase, pi.drill_id, pi.title_override, pi.minutes, pi.notes
  from public.practice_items as pi
  where pi.organization_id = v_org
    and pi.plan_id = p_template;

  if found then
    update public.practice_plans as pp
    set status = 'ready'
    where pp.organization_id = v_org
      and pp.id = v_plan;
  end if;

  return v_event;
end;
$$;

revoke all on function public.save_practice_as_template(uuid) from public, anon, service_role;
grant execute on function public.save_practice_as_template(uuid) to authenticated;

revoke all on function public.create_practice_from_template(
  uuid, uuid, timestamptz, timestamptz, text, uuid, uuid, text
) from public, anon, service_role;
grant execute on function public.create_practice_from_template(
  uuid, uuid, timestamptz, timestamptz, text, uuid, uuid, text
) to authenticated;
