-- Escritura de dirección sobre su propio club (Fase 7, Task 10): `/admin/club` edita el
-- nombre, la zona horaria, la marca, la terminología y los dos textos de consentimiento;
-- `/admin/teams` da de alta y edita temporadas, categorías y equipos. Hasta ahora estas
-- cinco tablas solo tenían lectura para `authenticated` (Fase 1-2): toda escritura llegaba
-- por el seed, con la clave de servicio. `slug` y `status` de `organizations` no entran en
-- esta fase: cambiar un slug rompe URLs ya compartidas, y `status` es soporte de plataforma.
-- Ningún equipo ni temporada se borra aquí: archivar o cerrar queda para cuando haga falta
-- de verdad, no antes.

create policy organizations_update_managed
  on public.organizations
  for update
  to authenticated
  using (private.has_org_role(id, array['admin']::public.org_role[]))
  with check (private.has_org_role(id, array['admin']::public.org_role[]));

grant update (name, timezone) on public.organizations to authenticated;

create policy organization_branding_update_managed
  on public.organization_branding
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

grant update (
  display_name, wordmark_sub, short_name, way_name, tagline,
  color_accent, color_accent_pressed, color_on_accent, color_accent_soft,
  terminology, terms_text, image_consent_text
) on public.organization_branding to authenticated;

create policy seasons_write_managed
  on public.seasons
  for all
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

grant insert, update on public.seasons to authenticated;

create policy categories_write_managed
  on public.categories
  for all
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

grant insert, update on public.categories to authenticated;

create policy teams_write_managed
  on public.teams
  for all
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

grant insert, update on public.teams to authenticated;
