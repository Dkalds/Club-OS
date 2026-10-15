-- `coverage_by_team` comparaba el rango de fechas con `starts_at::date`, es decir, el día en
-- la zona de la sesión de base de datos (UTC), no en la del club (regla 7 de CLAUDE.md). Una
-- sesión a las 00:30 en Canarias caía en el día anterior y entraba o salía de mal del rango.
create or replace function public.coverage_by_team(p_org uuid, p_from date, p_to date)
returns table (team_id uuid, standard_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct e.team_id, ds.standard_id
  from public.events as e
  join public.organizations as o
    on o.id = e.organization_id
  join public.practice_plans as pp
    on pp.organization_id = e.organization_id and pp.event_id = e.id
  join public.practice_items as pi
    on pi.organization_id = pp.organization_id and pi.plan_id = pp.id
  join public.drill_standards as ds
    on ds.organization_id = pi.organization_id and ds.drill_id = pi.drill_id
  where e.organization_id = p_org
    and e.kind = 'practice'
    and e.status = 'done'
    and pi.completed is true
    and (e.starts_at at time zone o.timezone)::date between p_from and p_to
$$;
