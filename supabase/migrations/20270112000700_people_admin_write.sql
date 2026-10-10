-- Escritura de dirección sobre las personas de su club (Fase 7, Task 11): alta una a una o
-- por CSV, edición del nombre y el año de nacimiento, y archivar (nunca se borra: una
-- persona archivada deja de aparecer en listas de alta, pero sus notas, objetivos y partidos
-- siguen enteros). Hasta ahora `people` solo tenía lectura para `authenticated` (Fase 1).

create policy people_write_managed
  on public.people
  for all
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

grant insert on public.people to authenticated;
grant update (first_name, last_name, birth_year, archived_at) on public.people to authenticated;
