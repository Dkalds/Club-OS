-- Medios del club: la tabla `media_assets` y el bucket privado `club-media` de Storage.
--
-- Por ahora solo hay una imagen por ejercicio, su diagrama. El fichero vive en Storage bajo
--   org/<club>/drills/<ejercicio>/<uuid>.<png|jpg|webp>
-- y `media_assets` lo registra: quién lo subió, de qué tipo es y cuánto pesa. Las políticas
-- de Storage deciden por la ruta, sin mirar `media_assets`:
--   · se sube (y se borra) en la carpeta de un ejercicio del club de la ruta que el usuario
--     puede editar: el admin, todos; un entrenador, sus borradores;
--   · se lee lo que hay en la carpeta de un ejercicio del club de la ruta que el usuario puede
--     ver: el cuerpo técnico, y los borradores solo su autor y el admin. Cualquier otra ruta
--     del bucket no se lee: sin política no hay acceso.
-- No hay política `update`: un objeto no se renombra ni se mueve de carpeta. Cambiar un
-- diagrama es subir otro y apuntar el ejercicio a él.
-- El tipo y el tamaño de lo que entra los aplica el propio bucket (la API de Storage); la
-- tabla repite los mismos límites para que una ficha no diga otra cosa que el bucket.
--
-- Como en las migraciones anteriores: toda tabla lleva `organization_id`, las claves
-- foráneas que cuelgan de otra tabla del club son compuestas `(organization_id, x_id)`, y
-- los privilegios de cada tabla se fijan aquí de forma explícita.

-- ── Tabla ────────────────────────────────────────────────────────────────────────────
-- `path` es único y empieza por `org/<club>`: el CHECK ata la ficha al club de su ruta, y
-- con la política de subida (que exige que el ejercicio de la ruta sea de ese mismo club)
-- el `organization_id` de la ficha, el de la ruta y el del ejercicio son uno.
-- `contains_minor` marca las imágenes en las que sale un menor; por defecto, no.
-- `created_by` toma por defecto el usuario de la sesión. Si se borra la cuenta del autor, la
-- ficha se queda y `created_by` pasa a null, como en `drills`: borrar una cuenta no puede
-- fallar ni llevarse el contenido del club. Una ficha sin autor solo la ve el admin, o quien
-- ve el ejercicio del que es diagrama.
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bucket text not null default 'club-media' check (bucket = 'club-media'),
  path text not null unique constraint media_assets_path_check check (
    split_part(path, '/', 1) = 'org'
    and split_part(path, '/', 2) = organization_id::text
  ),
  kind text not null check (kind in ('image', 'video', 'document')),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  bytes int not null check (bytes between 1 and 2097152),
  contains_minor boolean not null default false,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

-- ── Diagrama del ejercicio ───────────────────────────────────────────────────────────
-- `drills.diagram_media_id` existía sin clave foránea, a la espera de esta tabla. Compuesta,
-- para que un ejercicio no use el diagrama de otro club. Si se borra la ficha, el ejercicio
-- se queda sin diagrama: `set null` solo sobre esa columna, porque sobre las dos dejaría el
-- ejercicio sin club.
alter table public.drills
  add constraint drills_diagram_fk
  foreign key (organization_id, diagram_media_id)
  references public.media_assets (organization_id, id)
  on delete set null (diagram_media_id);

-- La clave foránea mira `(organization_id, diagram_media_id)` al borrar o cambiar un medio, y
-- `can_see_media` busca por ahí el ejercicio que lo usa. Sin un índice que empiece por
-- `organization_id` recorrería los ejercicios de todos los clubes.
create index drills_organization_id_diagram_media_id_idx
  on public.drills (organization_id, diagram_media_id);

-- ── Funciones de RLS ─────────────────────────────────────────────────────────────────
-- Como `can_see_drill`: `security definer`, leen las tablas como su propietario sin pasar
-- por RLS, y solo responden por el usuario de la sesión. Las que reciben una ruta tienen que
-- ser seguras con cualquier texto: se evalúan dentro de políticas de `storage.objects`, donde
-- una excepción no sería una denegación sino un error de la API. Por eso comprueban la forma
-- de la ruta con una expresión regular antes de convertir nada a `uuid`, y el `case` garantiza
-- ese orden (un `and` no lo garantiza).

-- El club de una ruta de Storage, o null si no empieza por `org/<uuid en minúsculas>/`. No lee
-- ninguna tabla, pero se declara como las demás para que sean todas iguales. Las dos funciones
-- que siguen la usan para el club de la ruta.
create function private.storage_org_id(path text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when storage_org_id.path ~ '^org/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then split_part(storage_org_id.path, '/', 2)::uuid
  end;
$$;

-- ¿Puede el usuario subir (o borrar) este objeto? La ruta tiene que ser exactamente
-- `org/<club>/drills/<ejercicio>/<uuid>.<png|jpg|webp>`, con los tres uuid en minúsculas; el
-- ejercicio tiene que existir y ser del club de la ruta (si no, un admin de B podría escribir
-- en `org/A/…` con un ejercicio suyo), y el usuario tiene que poder editarlo. La edición la
-- decide `can_edit_drill`, que mira la membresía del club del ejercicio: ser admin de otro
-- club no cuenta.
create function private.can_upload_drill_media(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when can_upload_drill_media.path ~ format(
      '^org/%1$s/drills/%1$s/%1$s\.(png|jpg|webp)$',
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    )
    then exists (
      select 1
      from public.drills as d
      where d.id = split_part(can_upload_drill_media.path, '/', 4)::uuid
        and d.organization_id = private.storage_org_id(can_upload_drill_media.path)
        and private.can_edit_drill(d.id)
    )
    else false
  end;
$$;

-- ¿Puede el usuario leer este objeto? Sí si la ruta es de la carpeta de un ejercicio,
-- `org/<club>/drills/<ejercicio>/…`, el ejercicio existe y es del club de la ruta, y el usuario
-- puede verlo (`can_see_drill`). Quien puede editar un ejercicio puede verlo, así que quien
-- sube un fichero puede leerlo de vuelta. A diferencia de la subida, no mira el nombre del
-- fichero ni su extensión: leer no puede depender de ellos. Cualquier otra ruta da false.
create function private.can_see_drill_media(path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when can_see_drill_media.path ~ format(
      '^org/%1$s/drills/%1$s/',
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    )
    then exists (
      select 1
      from public.drills as d
      where d.id = split_part(can_see_drill_media.path, '/', 4)::uuid
        and d.organization_id = private.storage_org_id(can_see_drill_media.path)
        and private.can_see_drill(d.id)
    )
    else false
  end;
$$;

-- ¿Puede el usuario ver esta ficha? Sí si es admin del club, o si la subió y sigue siendo
-- admin o entrenador del club, o si es el diagrama de un ejercicio que puede ver. Lo último
-- reutiliza `can_see_drill`: el diagrama de un borrador lo ven el autor del borrador y el
-- admin, no el resto del cuerpo técnico. Una membresía revocada o de un jugador no cuenta,
-- tampoco para el autor: la biblioteca es del cuerpo técnico.
create function private.can_see_media(media uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.media_assets as ma
    where ma.id = can_see_media.media
      and (
        private.has_org_role(ma.organization_id, array['admin']::public.org_role[])
        or (
          ma.created_by = (select auth.uid())
          and private.has_org_role(ma.organization_id, array['admin', 'coach']::public.org_role[])
        )
        or exists (
          select 1
          from public.drills as d
          where d.organization_id = ma.organization_id
            and d.diagram_media_id = ma.id
            and private.can_see_drill(d.id)
        )
      )
  );
$$;

-- Las evalúan las políticas, siempre con la sesión de un usuario: la clave de servicio no
-- pasa por RLS y no las necesita.
revoke all on function private.storage_org_id(text) from public, anon;
revoke all on function private.can_upload_drill_media(text) from public, anon;
revoke all on function private.can_see_drill_media(text) from public, anon;
revoke all on function private.can_see_media(uuid) from public, anon;
grant execute on function private.storage_org_id(text) to authenticated;
grant execute on function private.can_upload_drill_media(text) to authenticated;
grant execute on function private.can_see_drill_media(text) to authenticated;
grant execute on function private.can_see_media(uuid) to authenticated;

-- ── RLS y privilegios de media_assets ────────────────────────────────────────────────
alter table public.media_assets enable row level security;

revoke all on table public.media_assets from anon, authenticated;

-- Una ficha se crea al subir y ya: ni se cambia ni se borra desde la app (no hay `update` ni
-- `delete` para `authenticated`, ni política que los abra).
grant select, insert on table public.media_assets to authenticated;

-- El seed y la limpieza de los e2e escriben con la clave de servicio (nunca desde src/).
grant select, insert, update, delete on table public.media_assets to service_role;

-- ── Políticas de media_assets ────────────────────────────────────────────────────────
-- La regla de `can_see_media` es «admin, autor, o diagrama de un ejercicio visible». La
-- política escribe la parte del autor sobre las columnas de la propia fila, y deja el resto a
-- la función. Con `insert … returning` (PostgREST con `.select()`, y la acción de subida, que
-- necesita el id nuevo) PostgreSQL aplica esta política a la fila nueva como una comprobación
-- previa a escribirla: en ese momento la fila no está en la tabla, y `can_see_media(id)`, que
-- la busca por su id, no la encuentra. El alta fallaría con 42501 para quien la hace, que es
-- justo el autor. Si cambias la parte del autor en una de las dos, cámbiala en la otra; el
-- test comprueba que ven lo mismo.
create policy media_assets_select_visible
  on public.media_assets
  for select
  to authenticated
  using (
    (
      created_by = (select auth.uid())
      and private.has_org_role(organization_id, array['admin', 'coach']::public.org_role[])
    )
    or private.can_see_media(id)
  );

-- Se registra a nombre de quien sube, y solo una ruta en la que esa persona puede subir. El
-- `organization_id` no hace falta mirarlo aquí: el CHECK de la tabla lo ata a la ruta, y la
-- ruta al ejercicio.
create policy media_assets_insert_own
  on public.media_assets
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and private.can_upload_drill_media(path)
  );

-- ── Bucket ───────────────────────────────────────────────────────────────────────────
-- Privado: los diagramas se sirven con URL firmada. Solo imágenes PNG, JPEG o WebP de hasta
-- 2 MB. Si el bucket ya existe, la migración deja sus ajustes como aquí se dicen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-media', 'club-media', false, 2097152, '{image/png,image/jpeg,image/webp}'
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ── Políticas de storage.objects ─────────────────────────────────────────────────────
-- Todas piden `bucket_id = 'club-media'`: las políticas de Storage se suman entre sí, y sin
-- esa cláusula estas abrirían las rutas `org/…` de cualquier otro bucket.
-- Leer sigue al ejercicio: un objeto lo lee quien puede ver el ejercicio de su carpeta. No
-- basta con ser miembro del club ni con que la ruta no se adivine: listar también obedece esta
-- política (las funciones de Storage que listan carpetas, como `search`, se ejecutan con los
-- privilegios de quien llama). Con una política más ancha, un jugador o un entrenador que no ve
-- un borrador listaría la carpeta de su ejercicio, vería su id y firmaría su diagrama aunque
-- `drills` y `media_assets` no le enseñen nada. Una ruta que no sea la carpeta de un ejercicio
-- no tiene regla de lectura: nadie la lee hasta que una fase posterior le dé la suya.
-- Subir y borrar son de quien puede subir a esa ruta. Quien puede subir puede ver el ejercicio,
-- y `insert … returning` pide la fila de vuelta: la política mira el ejercicio de la ruta, que
-- ya existe, y no la fila nueva.
create policy club_media_read
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'club-media'
    and private.can_see_drill_media(name)
  );

create policy club_media_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'club-media'
    and private.can_upload_drill_media(name)
  );

create policy club_media_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'club-media'
    and private.can_upload_drill_media(name)
  );
