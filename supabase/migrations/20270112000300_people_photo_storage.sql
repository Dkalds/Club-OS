-- Foto de persona (Fase 7, [D10]): la columna y las políticas de Storage nacen listas, pero
-- nadie sube nada en esta fase. Sin subidor hasta que haya cuentas de familia (decisión 13 de
-- la spec): `PlayerCard` y `Avatar` siguen pintando iniciales o dorsal siempre, porque
-- `photo_media_id` siempre es null en el MVP.
--
-- C20: la lectura sigue a la visibilidad de la fila a la que pertenece el objeto. El prefijo
-- `org/{org}/people/{person}/` necesita su propia función de ruta, no una ampliación de la de
-- `drills`. No hay política de subida ni de borrado: sin política no hay acceso.

alter table public.people
  add column photo_media_id uuid;

alter table public.people
  add constraint people_photo_media_fk
  foreign key (organization_id, photo_media_id)
  references public.media_assets (organization_id, id)
  on delete set null (photo_media_id);

create index people_organization_id_photo_media_id_idx
  on public.people (organization_id, photo_media_id);

-- ¿Puede el usuario leer este objeto? La ruta tiene que ser la carpeta de una persona,
-- `org/<club>/people/<persona>/…`, del club de la ruta, y la persona la tiene que poder ver
-- (`can_see_person`, de la Fase 1: cuerpo técnico de sus equipos, o la propia persona). No
-- mira el nombre del fichero: leer no puede depender de él.
create function private.can_see_person_media(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when can_see_person_media.path ~ format(
      '^org/%1$s/people/%1$s/',
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    )
    then exists (
      select 1
      from public.people as p
      where p.id = split_part(can_see_person_media.path, '/', 4)::uuid
        and p.organization_id = private.storage_org_id(can_see_person_media.path)
        and private.can_see_person(p.id)
    )
    else false
  end;
$$;

revoke all on function private.can_see_person_media(text) from public, anon;
grant execute on function private.can_see_person_media(text) to authenticated;

create policy club_media_people_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'club-media'
    and private.can_see_person_media(name)
  );
