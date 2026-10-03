-- Metodología del club: secciones de The Way, valores, principios de juego, puntos de
-- principio y Standards.
--
-- Cada club escribe su propia metodología y los entrenadores la leen. RLS lo resuelve con
-- dos reglas:
--   · lectura: un miembro del club lee lo publicado; el admin del club lo lee todo,
--     borradores incluidos. La metodología es de todo el club, no de un equipo;
--   · escritura: solo el admin del club crea y edita.
-- Nadie borra contenido (archivar es pasar a borrador), salvo los puntos de un principio,
-- que el admin reemplaza al guardarlo.
--
-- Como en las migraciones anteriores: toda tabla lleva `organization_id`, las claves
-- foráneas que cuelgan de otra tabla del club son compuestas `(organization_id, x_id)`, y
-- los privilegios de cada tabla se fijan aquí de forma explícita. Las funciones que
-- escriben varias filas a la vez llegan en la migración siguiente.

-- ── Tipos ────────────────────────────────────────────────────────────────────────────
create type public.content_status as enum ('draft', 'published');

-- ── Tablas ───────────────────────────────────────────────────────────────────────────
-- Una sección es una página de The Way. `number` es su posición en la gestión del club y
-- `slug` su dirección: `standards` queda reservado porque `/way/standards` es la página de
-- los Standards. `body_md` es Markdown corto. `content_kind` dice qué pinta la sección
-- además de su texto: los valores, los principios o los Standards del club.
-- `updated_at` no tiene trigger a propósito: solo lo cambia `update_way_section`, que es
-- lo que invalida la copia de quien edita; reordenar o cambiar `status` lo deja como está.
-- `updated_by` toma por defecto el usuario de la sesión; el seed, que escribe con la clave
-- de servicio y sin sesión, lo deja a null. Si se borra a ese usuario, la sección se queda y
-- `updated_by` pasa a null: quien guardó una sección no puede quedar atado a ella.
create table public.way_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number smallint not null check (number between 1 and 99),
  slug text not null check (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(slug) <= 60
    and slug <> 'standards'
  ),
  title text not null check (char_length(title) between 1 and 80),
  summary text check (char_length(summary) <= 200),
  body_md text not null default '' check (char_length(body_md) <= 20000),
  content_kind text not null default 'text'
    check (content_kind in ('text', 'values', 'principles', 'standards')),
  sort int not null default 0,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  unique (organization_id, slug)
);

create index way_sections_organization_id_sort_idx
  on public.way_sections (organization_id, sort);

-- Los valores del club: un código corto en mayúsculas, un título opcional y su descripción.
create table public.club_values (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 40),
  title text check (char_length(title) <= 80),
  description text not null check (char_length(description) between 1 and 500),
  sort int not null default 0,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now()
);

create index club_values_organization_id_sort_idx
  on public.club_values (organization_id, sort);

-- Los principios de juego del club. Sus puntos cuelgan de `(organization_id, id)`.
create table public.game_principles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  title text not null check (char_length(title) between 1 and 80),
  summary text check (char_length(summary) <= 300),
  sort int not null default 0,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (organization_id, id)
);

-- Los Standards: el número lo elige la dirección y es único por club.
create table public.standards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  number smallint not null check (number between 1 and 99),
  title text not null check (char_length(title) between 1 and 80),
  description text not null check (char_length(description) between 1 and 500),
  sort int not null default 0,
  status public.content_status not null default 'draft',
  created_at timestamptz not null default now(),
  unique (organization_id, number),
  unique (organization_id, id)
);

-- Los puntos de un principio no tienen estado propio: se ven o no según el de su
-- principio. Un principio con sus puntos se reemplaza en bloque, de ahí el borrado en
-- cascada y que el admin pueda borrarlos.
create table public.principle_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  principle_id uuid not null,
  text text not null check (char_length(text) between 1 and 200),
  sort int not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, principle_id)
    references public.game_principles (organization_id, id) on delete cascade
);

create index principle_points_principle_id_sort_idx
  on public.principle_points (principle_id, sort);

-- La clave foránea compuesta `(organization_id, principle_id)` necesita un índice que empiece
-- por ahí: sin él, borrar o cambiar un principio recorre los puntos de todos los clubes.
create index principle_points_organization_id_principle_id_idx
  on public.principle_points (organization_id, principle_id);

-- ── RLS y privilegios ────────────────────────────────────────────────────────────────
alter table public.way_sections enable row level security;
alter table public.club_values enable row level security;
alter table public.game_principles enable row level security;
alter table public.principle_points enable row level security;
alter table public.standards enable row level security;

revoke all on table public.way_sections from anon, authenticated;
revoke all on table public.club_values from anon, authenticated;
revoke all on table public.game_principles from anon, authenticated;
revoke all on table public.principle_points from anon, authenticated;
revoke all on table public.standards from anon, authenticated;

-- `authenticated` recibe las cuatro operaciones y las políticas deciden quién las usa:
-- `delete` solo tiene política en `principle_points`, así que en las otras cuatro tablas
-- el `delete` no encuentra filas sobre las que actuar.
grant select, insert, update, delete on table public.way_sections to authenticated;
grant select, insert, update, delete on table public.club_values to authenticated;
grant select, insert, update, delete on table public.game_principles to authenticated;
grant select, insert, update, delete on table public.principle_points to authenticated;
grant select, insert, update, delete on table public.standards to authenticated;

grant select, insert, update, delete on table public.way_sections to service_role;
grant select, insert, update, delete on table public.club_values to service_role;
grant select, insert, update, delete on table public.game_principles to service_role;
grant select, insert, update, delete on table public.principle_points to service_role;
grant select, insert, update, delete on table public.standards to service_role;

-- ── Políticas de lectura ─────────────────────────────────────────────────────────────
create policy way_sections_select_published_or_admin
  on public.way_sections
  for select
  to authenticated
  using (
    (status = 'published' and private.is_member(organization_id))
    or private.has_org_role(organization_id, array['admin']::public.org_role[])
  );

create policy club_values_select_published_or_admin
  on public.club_values
  for select
  to authenticated
  using (
    (status = 'published' and private.is_member(organization_id))
    or private.has_org_role(organization_id, array['admin']::public.org_role[])
  );

create policy game_principles_select_published_or_admin
  on public.game_principles
  for select
  to authenticated
  using (
    (status = 'published' and private.is_member(organization_id))
    or private.has_org_role(organization_id, array['admin']::public.org_role[])
  );

create policy standards_select_published_or_admin
  on public.standards
  for select
  to authenticated
  using (
    (status = 'published' and private.is_member(organization_id))
    or private.has_org_role(organization_id, array['admin']::public.org_role[])
  );

-- Un punto no tiene estado: se ve si su principio está publicado y el usuario es miembro,
-- o si es admin del club. La condición del principio va explícita, para no depender de que
-- la política de `game_principles` filtre los borradores. La subconsulta pasa también por
-- esa política, que no lee `principle_points`: no hay recursión.
create policy principle_points_select_published_or_admin
  on public.principle_points
  for select
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or (
      private.is_member(organization_id)
      and exists (
        select 1
        from public.game_principles as gp
        where gp.organization_id = principle_points.organization_id
          and gp.id = principle_points.principle_id
          and gp.status = 'published'
      )
    )
  );

-- ── Políticas de escritura ───────────────────────────────────────────────────────────
-- Solo el admin del club, y el `with check` impide además mover una fila a otro club: tanto
-- al crearla como al cambiarle el `organization_id`.
create policy way_sections_insert_admin
  on public.way_sections
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy way_sections_update_admin
  on public.way_sections
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy club_values_insert_admin
  on public.club_values
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy club_values_update_admin
  on public.club_values
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy game_principles_insert_admin
  on public.game_principles
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy game_principles_update_admin
  on public.game_principles
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy standards_insert_admin
  on public.standards
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy standards_update_admin
  on public.standards
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy principle_points_insert_admin
  on public.principle_points
  for insert
  to authenticated
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

create policy principle_points_update_admin
  on public.principle_points
  for update
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

-- Lo único que se borra: los puntos de un principio.
create policy principle_points_delete_admin
  on public.principle_points
  for delete
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]));
