-- Biblioteca de ejercicios del club: ejercicios, puntos de coaching, variantes y sus
-- vínculos con objetivos de trabajo, principios de juego y Standards.
--
-- Cada club tiene su propia biblioteca. RLS la resuelve con dos reglas:
--   · lectura: admin y entrenadores del club ven lo publicado y lo archivado; un borrador
--     solo lo ven su autor y el admin;
--   · escritura: el admin edita todo, y publicar y archivar es suyo. Un entrenador solo crea
--     borradores y solo edita los suyos mientras sean borradores.
-- Los ejercicios no se borran, se archivan: `drills` no tiene política `delete` ni `grant
-- delete` para los usuarios. El archivado sale de la búsqueda, pero su ficha y su enlace en
-- los planes de sesión siguen ahí. Los hijos se ven y se escriben según su ejercicio.
--
-- Como en las migraciones anteriores: toda tabla lleva `organization_id`, las claves
-- foráneas que cuelgan de otra tabla del club son compuestas `(organization_id, x_id)`, y
-- los privilegios de cada tabla se fijan aquí de forma explícita. Los diagramas
-- (`diagram_media_id`) y las funciones de búsqueda y guardado llegan en migraciones
-- posteriores.

-- ── Búsqueda sin tildes ──────────────────────────────────────────────────────────────
create extension if not exists unaccent with schema extensions;

-- `unaccent` está declarada `stable`, y una columna generada y un índice exigen una función
-- `immutable`. Esta envoltura la declara así porque fija todo de lo que depende: el
-- diccionario va cualificado y la función fija su `search_path`, así que no depende de quien
-- la llame. La ejecuta quien inserta o cambia un ejercicio, para calcular `search`.
create function private.f_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1);
$$;

revoke all on function private.f_unaccent(text) from public, anon;
grant execute on function private.f_unaccent(text) to authenticated, service_role;

-- ── updated_at ───────────────────────────────────────────────────────────────────────
-- `updated_at` de `drills` es el testigo de la concurrencia optimista: quien edita envía el
-- que leyó y el guardado solo vale si sigue siendo el de la fila. Tiene que avanzar en cada
-- cambio aunque ocurra en la misma transacción que el anterior, y `now()` vale lo mismo en
-- toda la transacción: por eso `clock_timestamp()`. La función ya existe (la creó tenancy
-- para `organizations`); se redefine en vez de duplicarla, y el cambio alcanza también a los
-- triggers de `organizations` y `organization_branding`, donde solo cambia que el valor es
-- el instante del `update` y no el del inicio de la transacción. Conserva su `revoke`.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

-- ── Tipos ────────────────────────────────────────────────────────────────────────────
create type public.drill_status as enum ('draft', 'published', 'archived');

-- ── Tablas ───────────────────────────────────────────────────────────────────────────
-- Un ejercicio. Jugadores, duración y edad son rangos; `min_age` y `max_age` son el número
-- de la categoría (la «U» de U12), y `max_age` a null deja la edad máxima abierta.
-- `equipment` es el material en texto libre. `setup_md` es Markdown corto.
-- `video_url` solo admite https y el host exacto de YouTube o Vimeo: el patrón termina el
-- host en la barra, así `youtube.com.evil.com` y los enlaces que solo nombran YouTube en la
-- query no pasan. `diagram_media_id` todavía no tiene clave foránea: llega con la tabla de
-- medios.
-- `created_by` toma por defecto el usuario de la sesión; el seed, que escribe con la clave
-- de servicio y sin sesión, lo deja a null. Si se borra la cuenta del autor, el ejercicio se
-- queda y `created_by` pasa a null: un borrador sin autor no es de nadie, y solo lo ven y lo
-- editan los admins.
-- `search` es el texto del ejercicio sin tildes, listo para buscar.
create table public.drills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 80),
  summary text check (char_length(summary) <= 200),
  objective text check (char_length(objective) <= 500),
  setup_md text check (char_length(setup_md) <= 5000),
  min_players smallint not null check (min_players between 1 and 40),
  max_players smallint not null check (max_players between min_players and 40),
  min_minutes smallint not null check (min_minutes between 1 and 120),
  max_minutes smallint not null check (max_minutes between min_minutes and 120),
  min_age smallint not null check (min_age between 8 and 18),
  max_age smallint check (max_age between min_age and 18),
  equipment text[] not null default '{}' check (cardinality(equipment) <= 12),
  diagram_media_id uuid,
  video_url text check (
    char_length(video_url) <= 300
    and video_url ~ '^https://((www|m)\.)?(youtube\.com|youtu\.be|vimeo\.com)/\S*$'
  ),
  status public.drill_status not null default 'draft',
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp(),
  search tsvector generated always as (
    to_tsvector(
      'spanish'::regconfig,
      private.f_unaccent(
        coalesce(title, '') || ' ' || coalesce(summary, '') || ' '
        || coalesce(objective, '') || ' ' || coalesce(setup_md, '')
      )
    )
  ) stored,
  unique (organization_id, id)
);

create index drills_search_idx on public.drills using gin (search);
create index drills_organization_id_status_idx on public.drills (organization_id, status);

create trigger drills_set_updated_at
  before update on public.drills
  for each row execute function private.set_updated_at();

-- Los puntos de coaching y las variantes de un ejercicio, en el orden de `sort`. Se
-- reemplazan en bloque al guardar, y se borran con su ejercicio.
create table public.drill_coaching_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  drill_id uuid not null,
  text text not null check (char_length(text) between 1 and 140),
  is_key boolean not null default false,
  sort smallint not null,
  unique (drill_id, sort),
  foreign key (organization_id, drill_id)
    references public.drills (organization_id, id) on delete cascade
);

create table public.drill_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  drill_id uuid not null,
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 500),
  sort smallint not null,
  unique (drill_id, sort),
  foreign key (organization_id, drill_id)
    references public.drills (organization_id, id) on delete cascade
);

-- Con qué trabaja un ejercicio: objetivos de trabajo del club (Fase 1), principios de juego
-- y Standards (Fase 2). Las claves foráneas compuestas impiden vincular algo de otro club.
-- La clave primaria cubre las búsquedas por ejercicio; el índice, las de «qué ejercicios
-- trabajan este Standard».
create table public.drill_focus_areas (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  drill_id uuid not null,
  focus_area_id uuid not null,
  primary key (drill_id, focus_area_id),
  foreign key (organization_id, drill_id)
    references public.drills (organization_id, id) on delete cascade,
  foreign key (organization_id, focus_area_id)
    references public.focus_areas (organization_id, id)
);

create index drill_focus_areas_focus_area_id_idx on public.drill_focus_areas (focus_area_id);

create table public.drill_principles (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  drill_id uuid not null,
  principle_id uuid not null,
  primary key (drill_id, principle_id),
  foreign key (organization_id, drill_id)
    references public.drills (organization_id, id) on delete cascade,
  foreign key (organization_id, principle_id)
    references public.game_principles (organization_id, id)
);

create index drill_principles_principle_id_idx on public.drill_principles (principle_id);

create table public.drill_standards (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  drill_id uuid not null,
  standard_id uuid not null,
  primary key (drill_id, standard_id),
  foreign key (organization_id, drill_id)
    references public.drills (organization_id, id) on delete cascade,
  foreign key (organization_id, standard_id)
    references public.standards (organization_id, id)
);

create index drill_standards_standard_id_idx on public.drill_standards (standard_id);

-- Los ítems de un plan ya llevaban `drill_id` sin clave foránea, a la espera de esta tabla.
-- Un ítem no puede apuntar al ejercicio de otro club. Los ítems sin ejercicio (`drill_id`
-- null) no se comprueban. Borrar o cambiar un ejercicio mira los ítems por
-- `(organization_id, drill_id)`: sin un índice que empiece por ahí recorrería los de todos
-- los clubes.
alter table public.practice_items
  add foreign key (organization_id, drill_id) references public.drills (organization_id, id);

create index practice_items_organization_id_drill_id_idx
  on public.practice_items (organization_id, drill_id);

-- ── Funciones de RLS ─────────────────────────────────────────────────────────────────
-- Como `can_see_plan`: `security definer`, leen las tablas como su propietario sin pasar
-- por RLS, y solo responden por el usuario de la sesión, a través de su membresía ACTIVA en
-- el club del ejercicio. Una membresía en otro club, o revocada, no cuenta, y tampoco la de
-- un jugador o un tutor: la biblioteca es del cuerpo técnico.

-- ¿Puede el usuario ver este ejercicio? Sí si es admin o entrenador del club y el ejercicio
-- está publicado o archivado, o es un borrador y el usuario es su autor o admin.
create function private.can_see_drill(drill uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.drills as d
    join public.memberships as m
      on m.organization_id = d.organization_id
    where d.id = can_see_drill.drill
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role in ('admin', 'coach')
      and (d.status <> 'draft' or m.role = 'admin' or d.created_by = m.user_id)
  );
$$;

-- ¿Puede el usuario editar este ejercicio y sus hijos? Sí si es admin del club, o si es
-- entrenador del club y el ejercicio es un borrador suyo. Un borrador sin autor
-- (`created_by` null) no es de ningún entrenador.
create function private.can_edit_drill(drill uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.drills as d
    join public.memberships as m
      on m.organization_id = d.organization_id
    where d.id = can_edit_drill.drill
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role = 'admin'
        or (m.role = 'coach' and d.status = 'draft' and d.created_by = m.user_id)
      )
  );
$$;

revoke all on function private.can_see_drill(uuid) from public, anon;
revoke all on function private.can_edit_drill(uuid) from public, anon;
grant execute on function private.can_see_drill(uuid) to authenticated;
grant execute on function private.can_edit_drill(uuid) to authenticated;

-- ── RLS y privilegios ────────────────────────────────────────────────────────────────
alter table public.drills enable row level security;
alter table public.drill_coaching_points enable row level security;
alter table public.drill_variants enable row level security;
alter table public.drill_focus_areas enable row level security;
alter table public.drill_principles enable row level security;
alter table public.drill_standards enable row level security;

revoke all on table public.drills from anon, authenticated;
revoke all on table public.drill_coaching_points from anon, authenticated;
revoke all on table public.drill_variants from anon, authenticated;
revoke all on table public.drill_focus_areas from anon, authenticated;
revoke all on table public.drill_principles from anon, authenticated;
revoke all on table public.drill_standards from anon, authenticated;

-- `drills` no se borra: `authenticated` no recibe `delete`, y las políticas tampoco lo
-- abren. Los hijos sí: al guardar un ejercicio se reemplazan en bloque, y las políticas
-- dejan borrar solo los de un ejercicio que se puede editar.
grant select, insert, update on table public.drills to authenticated;
grant select, insert, update, delete on table public.drill_coaching_points to authenticated;
grant select, insert, update, delete on table public.drill_variants to authenticated;
grant select, insert, update, delete on table public.drill_focus_areas to authenticated;
grant select, insert, update, delete on table public.drill_principles to authenticated;
grant select, insert, update, delete on table public.drill_standards to authenticated;

-- El seed y la limpieza de los e2e escriben con la clave de servicio (nunca desde src/).
grant select, insert, update, delete on table public.drills to service_role;
grant select, insert, update, delete on table public.drill_coaching_points to service_role;
grant select, insert, update, delete on table public.drill_variants to service_role;
grant select, insert, update, delete on table public.drill_focus_areas to service_role;
grant select, insert, update, delete on table public.drill_principles to service_role;
grant select, insert, update, delete on table public.drill_standards to service_role;

-- ── Políticas de drills ──────────────────────────────────────────────────────────────
-- Es la regla de `can_see_drill` escrita sobre las columnas de la propia fila, y no una
-- llamada a la función. Con `insert … returning` (PostgREST con `.select()`, y las funciones
-- de guardado) PostgreSQL aplica esta política a la fila nueva como una comprobación previa
-- a escribirla: en ese momento la fila no está en la tabla, y ninguna consulta por `id` la
-- encuentra, sea cual sea la volatilidad de la función. El alta de un borrador fallaría con
-- 42501, y cambiar `stable` por `volatile` no lo arregla. Los hijos sí usan la función: su
-- ejercicio ya existe. Si cambias una de las dos reglas, cambia la otra; el test comprueba
-- que ven lo mismo.
create policy drills_select_visible
  on public.drills
  for select
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin', 'coach']::public.org_role[])
    and (
      status <> 'draft'
      or created_by = (select auth.uid())
      or private.has_org_role(organization_id, array['admin']::public.org_role[])
    )
  );

-- Se crea siempre un borrador, y a nombre de quien lo crea. Publicar es un `update` del
-- admin.
create policy drills_insert_own_draft
  on public.drills
  for insert
  to authenticated
  with check (
    status = 'draft'
    and created_by = (select auth.uid())
    and private.has_org_role(organization_id, array['admin', 'coach']::public.org_role[])
  );

-- `using` mira la fila tal como está (¿se puede editar?) y `with check` la fila resultante:
-- el admin deja el ejercicio en cualquier estado; el entrenador solo lo deja como borrador
-- suyo, así que no puede publicarlo, archivarlo, cederlo a otro autor ni sacarlo de su club.
create policy drills_update_editable
  on public.drills
  for update
  to authenticated
  using (private.can_edit_drill(id))
  with check (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or (
      status = 'draft'
      and created_by = (select auth.uid())
      and private.has_org_role(organization_id, array['coach']::public.org_role[])
    )
  );

-- ── Políticas de los hijos ───────────────────────────────────────────────────────────
-- Se ven si se ve el ejercicio y se escriben si se puede editar. La clave foránea compuesta
-- garantiza que el `organization_id` del hijo es el del ejercicio.
create policy drill_coaching_points_select_visible
  on public.drill_coaching_points
  for select
  to authenticated
  using (private.can_see_drill(drill_id));

create policy drill_coaching_points_insert_editable
  on public.drill_coaching_points
  for insert
  to authenticated
  with check (private.can_edit_drill(drill_id));

create policy drill_coaching_points_update_editable
  on public.drill_coaching_points
  for update
  to authenticated
  using (private.can_edit_drill(drill_id))
  with check (private.can_edit_drill(drill_id));

create policy drill_coaching_points_delete_editable
  on public.drill_coaching_points
  for delete
  to authenticated
  using (private.can_edit_drill(drill_id));

create policy drill_variants_select_visible
  on public.drill_variants
  for select
  to authenticated
  using (private.can_see_drill(drill_id));

create policy drill_variants_insert_editable
  on public.drill_variants
  for insert
  to authenticated
  with check (private.can_edit_drill(drill_id));

create policy drill_variants_update_editable
  on public.drill_variants
  for update
  to authenticated
  using (private.can_edit_drill(drill_id))
  with check (private.can_edit_drill(drill_id));

create policy drill_variants_delete_editable
  on public.drill_variants
  for delete
  to authenticated
  using (private.can_edit_drill(drill_id));

create policy drill_focus_areas_select_visible
  on public.drill_focus_areas
  for select
  to authenticated
  using (private.can_see_drill(drill_id));

create policy drill_focus_areas_insert_editable
  on public.drill_focus_areas
  for insert
  to authenticated
  with check (private.can_edit_drill(drill_id));

create policy drill_focus_areas_update_editable
  on public.drill_focus_areas
  for update
  to authenticated
  using (private.can_edit_drill(drill_id))
  with check (private.can_edit_drill(drill_id));

create policy drill_focus_areas_delete_editable
  on public.drill_focus_areas
  for delete
  to authenticated
  using (private.can_edit_drill(drill_id));

create policy drill_principles_select_visible
  on public.drill_principles
  for select
  to authenticated
  using (private.can_see_drill(drill_id));

create policy drill_principles_insert_editable
  on public.drill_principles
  for insert
  to authenticated
  with check (private.can_edit_drill(drill_id));

create policy drill_principles_update_editable
  on public.drill_principles
  for update
  to authenticated
  using (private.can_edit_drill(drill_id))
  with check (private.can_edit_drill(drill_id));

create policy drill_principles_delete_editable
  on public.drill_principles
  for delete
  to authenticated
  using (private.can_edit_drill(drill_id));

create policy drill_standards_select_visible
  on public.drill_standards
  for select
  to authenticated
  using (private.can_see_drill(drill_id));

create policy drill_standards_insert_editable
  on public.drill_standards
  for insert
  to authenticated
  with check (private.can_edit_drill(drill_id));

create policy drill_standards_update_editable
  on public.drill_standards
  for update
  to authenticated
  using (private.can_edit_drill(drill_id))
  with check (private.can_edit_drill(drill_id));

create policy drill_standards_delete_editable
  on public.drill_standards
  for delete
  to authenticated
  using (private.can_edit_drill(drill_id));
