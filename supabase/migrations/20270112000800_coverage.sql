-- Vista de cobertura de The Way (Fase 7, Task 13; spec, decisión 11): qué Standards ha
-- trabajado cada equipo de verdad, en un rango de fechas. «De verdad» es `events.status =
-- 'done'` (la sesión se jugó, no solo se planeó) y `practice_items.completed = true` (el
-- propio entrenador lo marcó hecho en Live, Fase 4): un plan guardado que nunca se jugó no
-- cuenta como cobertura.
--
-- `security invoker`: no eleva nada. Quien llama ve exactamente los equipos que ya podía ver
-- (`practice_plans_select_...`, Fase 1-6): dirección, todos los del club; un entrenador, solo
-- los suyos. Devuelve solo los pares que SÍ se cubrieron; la tabla completa (con los huecos)
-- la construye `buildCoverageMatrix` en el cliente, cruzando esto con la lista de equipos y
-- de Standards.
create function public.coverage_by_team(p_org uuid, p_from date, p_to date)
returns table (team_id uuid, standard_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct e.team_id, ds.standard_id
  from public.events as e
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
    and e.starts_at::date between p_from and p_to
$$;

revoke all on function public.coverage_by_team(uuid, date, date) from public, anon;
grant execute on function public.coverage_by_team(uuid, date, date) to authenticated;
