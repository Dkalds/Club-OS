-- La política de lectura de practice_plans usa los valores de las columnas de la fila.
--
-- Hoy `practice_plans_select_visible` llama a `private.can_see_plan(id)`, que busca la fila
-- por su `id`. Con `insert … returning`, Postgres evalúa la política de selección sobre la
-- fila que acaba de insertar antes de que el índice la registre: la función no la encuentra
-- y devuelve falso, lo que da 42501 al usuario que acaba de crear el plan (backlog F4).
--
-- La solución es la misma que tomó `drills_select_visible`: escribir la condición sobre las
-- columnas de la fila directamente (`organization_id`, `team_id`, `created_by`), sin pasar
-- por ninguna función `security definer` que haga su propia consulta sobre la tabla. El
-- resultado es idéntico al de `can_see_plan` para cualquier fila que ya exista.
--
-- `practice_items_select_visible` llama a `can_see_plan(plan_id)`: también se reescribe para
-- buscar el plan por sus columnas en lugar de pasar por la función.

drop policy practice_plans_select_visible on public.practice_plans;

create policy practice_plans_select_visible
  on public.practice_plans
  for select
  to authenticated
  using (
    exists (
      select 1 from public.memberships as m
      where m.organization_id = practice_plans.organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and (
          m.role = 'admin'
          or (
            practice_plans.team_id is not null
            and private.is_team_staff(practice_plans.team_id)
          )
          or (
            practice_plans.team_id is null
            and practice_plans.created_by = (select auth.uid())
          )
        )
    )
  );

drop policy practice_items_select_visible on public.practice_items;

create policy practice_items_select_visible
  on public.practice_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.practice_plans as pp
      join public.memberships as m
        on m.organization_id = pp.organization_id
      where pp.id = practice_items.plan_id
        and pp.organization_id = practice_items.organization_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
        and (
          m.role = 'admin'
          or (pp.team_id is not null and private.is_team_staff(pp.team_id))
          or (pp.team_id is null and pp.created_by = (select auth.uid()))
        )
    )
  );
