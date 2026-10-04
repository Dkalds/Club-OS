-- Medios y Storage: la tabla `media_assets`, el bucket privado `club-media` y sus políticas
-- por ruta.
--
-- Una imagen (el diagrama de un ejercicio) vive en Storage bajo
-- `org/<club>/drills/<ejercicio>/<uuid>.<ext>` y se registra en `media_assets`. Hay dos ejes
-- de aislamiento, y los dos se prueban:
--   · por club: la ruta lleva el club, y solo se sube a la carpeta de un ejercicio de ese club
--     (el club de la ruta es el del ejercicio);
--   · por autor: dentro del club, solo se sube a la carpeta de un ejercicio que se puede
--     editar (el admin edita todos; un entrenador, sus borradores).
-- Se lee lo que hay en la carpeta de un ejercicio que se puede ver, al leer y al listar: el
-- cuerpo técnico, lo publicado y lo archivado; un borrador, solo su autor y el admin. Cualquier
-- otra ruta del bucket no la lee nadie. La ficha `media_assets` solo la ven el admin, su autor y
-- quien ve el ejercicio del que es diagrama. Los objetos no se actualizan (sin política
-- `update`) y las fichas no se cambian ni se borran desde la app.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*`
-- vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al
-- final. Los datos son ficticios y solo de este test; los emails y los slugs de club no
-- chocan con los de `pnpm seed` ni con los de los otros tests.
begin;

select plan(152);

-- ── Ayudas (solo existen en esta transacción) ────────────────────────────────────────
-- Una ruta válida de la carpeta de un ejercicio, con un nombre de fichero nuevo. Los
-- argumentos son texto para poder pasar también un club o un ejercicio mal formados.
create function tests.drill_path(org text, drill text, ext text default 'png')
returns text
language sql
set search_path = ''
as $$
  select 'org/' || drill_path.org || '/drills/' || drill_path.drill || '/'
         || gen_random_uuid()::text || '.' || drill_path.ext;
$$;

-- Lo que lista Storage bajo un prefijo (un nivel): los nombres de las carpetas o de los
-- ficheros. `storage.search` se ejecuta con los privilegios de quien llama, así que lista lo
-- que la política de lectura de quien llama deja ver.
create function tests.ls(prefix text)
returns setof text
language sql
set search_path = ''
as $$
  select s.name
  from storage.search(
    prefix => ls.prefix, bucketname => 'club-media', limits => 100, levels => 1, offsets => 0
  ) as s;
$$;

-- Lee todos los medios sin pasar por RLS: es la referencia con la que se compara lo que ve
-- cada usuario.
create function tests.all_media_ids()
returns setof uuid
language sql
security definer
set search_path = ''
as $$
  select id from public.media_assets;
$$;

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A
--   adminA es admin; c1 y c2 son entrenadores; jugA es un jugador (rol player). `multi` es
--   entrenador de A y admin de B: en B puede lo que un admin, y en A solo lo de un
--   entrenador que no es autor de nada.
--   Ejercicios: `d_pub` (publicado, adminA) y `d_draft` (borrador, c1).
--   Medios: `m_admin` (en la carpeta de d_pub, de adminA, sin ejercicio),
--           `m_c1` (en la de d_draft, de c1, sin ejercicio) y
--           `m_adm_draft` (en la de d_draft, de adminA, diagrama de d_draft).
-- Club B
--   coachB es coach. `d_b` (publicado, coachB) con el medio `m_b` (suyo) de diagrama.
-- Storage: un objeto de `club-media` en la carpeta de d_pub (`o_pub` y `o_pub2`), en la de
--   d_draft (`o_draft`) y en la de d_b (`o_b`); dos con una ruta válida de A en otro bucket
--   (`o_otro`, en la carpeta de d_draft, y `o_otro2`, en la de d_pub; los dos en `pgtap-otro`);
--   `o_people`, en una carpeta de A que no es la de un ejercicio
--   (`org/A/people/…`); y dos con el club de la ruta cambiado: `o_cross` (`org/B/…` con el
--   ejercicio d_draft, que es de A) y `o_cross2` (`org/A/…` con el ejercicio d_b, que es de B).
-- `p_new` es la ruta con la que c1 registra su medio nuevo (`m_new`, que se conoce después).
--
-- Los ids quedan en ajustes `fx.*` de la transacción. Los fixtures se insertan sin sesión
-- (`auth.uid()` es null), así que el autor va siempre explícito.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@media.pgtap.test');
  u_c1 uuid := tests.create_user('c1@media.pgtap.test');
  u_c2 uuid := tests.create_user('c2@media.pgtap.test');
  u_jug_a uuid := tests.create_user('jug-a@media.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@media.pgtap.test');
  u_multi uuid := tests.create_user('multi@media.pgtap.test');

  d_pub constant uuid := gen_random_uuid();
  d_draft constant uuid := gen_random_uuid();
  d_b constant uuid := gen_random_uuid();

  m_admin constant uuid := gen_random_uuid();
  m_c1 constant uuid := gen_random_uuid();
  m_adm_draft constant uuid := gen_random_uuid();
  m_b constant uuid := gen_random_uuid();

  o_pub constant text := tests.drill_path(club_a::text, d_pub::text);
  o_pub2 constant text := tests.drill_path(club_a::text, d_pub::text);
  o_draft constant text := tests.drill_path(club_a::text, d_draft::text);
  o_b constant text := tests.drill_path(club_b::text, d_b::text);
  o_otro constant text := tests.drill_path(club_a::text, d_draft::text);
  o_otro2 constant text := tests.drill_path(club_a::text, d_pub::text);
  o_people constant text := 'org/' || club_a || '/people/' || gen_random_uuid()::text || '.png';
  o_cross constant text := tests.drill_path(club_b::text, d_draft::text);
  o_cross2 constant text := tests.drill_path(club_a::text, d_b::text);
  p_new constant text := tests.drill_path(club_a::text, d_draft::text);
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', null),
    (club_a, u_c1, 'coach', null),
    (club_a, u_c2, 'coach', null),
    (club_a, u_jug_a, 'player', null),
    (club_b, u_coach_b, 'coach', null),
    (club_a, u_multi, 'coach', null),
    (club_b, u_multi, 'admin', null);

  insert into drills (
    id, organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age,
    status, created_by
  ) values
    (d_pub, club_a, 'Pase y corte', 4, 10, 10, 15, 10, 'published', u_admin_a),
    (d_draft, club_a, 'Borrador de c1', 4, 8, 10, 15, 10, 'draft', u_c1),
    (d_b, club_b, 'Ejercicio de B', 4, 8, 10, 15, 10, 'published', u_coach_b);

  insert into media_assets (id, organization_id, path, kind, mime, bytes, created_by) values
    (m_admin, club_a, tests.drill_path(club_a::text, d_pub::text), 'image', 'image/png', 1000, u_admin_a),
    (m_c1, club_a, tests.drill_path(club_a::text, d_draft::text), 'image', 'image/png', 1000, u_c1),
    (m_adm_draft, club_a, tests.drill_path(club_a::text, d_draft::text), 'image', 'image/png', 1000, u_admin_a),
    (m_b, club_b, tests.drill_path(club_b::text, d_b::text), 'image', 'image/png', 1000, u_coach_b);

  update drills set diagram_media_id = m_adm_draft where id = d_draft;
  update drills set diagram_media_id = m_b where id = d_b;

  -- Un bucket más, para ver que las políticas de `club-media` no abren otros buckets. Su
  -- propia política de lectura se crea más abajo, solo para la prueba del borrado.
  insert into storage.buckets (id, name, public) values ('pgtap-otro', 'pgtap-otro', false);

  insert into storage.objects (bucket_id, name) values
    ('club-media', o_pub),
    ('club-media', o_pub2),
    ('club-media', o_draft),
    ('club-media', o_b),
    ('club-media', o_people),
    ('club-media', o_cross),
    ('club-media', o_cross2),
    ('pgtap-otro', o_otro),
    ('pgtap-otro', o_otro2);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.c2', u_c2::text, true);
  perform set_config('fx.jug_a', u_jug_a::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.multi', u_multi::text, true);
  perform set_config('fx.d_pub', d_pub::text, true);
  perform set_config('fx.d_draft', d_draft::text, true);
  perform set_config('fx.d_b', d_b::text, true);
  perform set_config('fx.m_admin', m_admin::text, true);
  perform set_config('fx.m_c1', m_c1::text, true);
  perform set_config('fx.m_adm_draft', m_adm_draft::text, true);
  perform set_config('fx.m_b', m_b::text, true);
  perform set_config('fx.o_pub', o_pub, true);
  perform set_config('fx.o_pub2', o_pub2, true);
  perform set_config('fx.o_draft', o_draft, true);
  perform set_config('fx.o_b', o_b, true);
  perform set_config('fx.o_otro', o_otro, true);
  perform set_config('fx.o_otro2', o_otro2, true);
  perform set_config('fx.o_people', o_people, true);
  perform set_config('fx.o_cross', o_cross, true);
  perform set_config('fx.o_cross2', o_cross2, true);
  perform set_config('fx.p_new', p_new, true);
end
$$;

-- ── El bucket ────────────────────────────────────────────────────────────────────────
-- Los límites los aplica la API de Storage, no SQL: aquí solo se comprueba que el bucket los
-- lleva. Que rechace de verdad un SVG o un fichero de 20 MB se prueba en la integración.
select results_eq(
  $$select public, file_size_limit, allowed_mime_types
    from storage.buckets where id = 'club-media'$$,
  $$values (false, 2097152::bigint, array['image/png', 'image/jpeg', 'image/webp'])$$,
  'club-media es privado, de 2 MB como máximo y solo admite PNG, JPEG y WebP'
);

-- ── storage_org_id: el club de una ruta, o null ──────────────────────────────────────
-- Corre dentro de las políticas de `storage.objects`: una excepción de conversión dejaría de
-- ser una denegación para ser un error 500.
select is(
  private.storage_org_id('org/' || current_setting('fx.club_a') || '/drills/x/y.png'),
  current_setting('fx.club_a')::uuid,
  'storage_org_id devuelve el club de una ruta org/<uuid>/…'
);

select is(
  private.storage_org_id('org/no-uuid/x.png'),
  null::uuid,
  'storage_org_id devuelve null si el segundo tramo no es un uuid, sin error de conversión'
);

select is_empty(
  $$select p
    from unnest(array[
      null::text,
      '',
      'org',
      'org/',
      'org//drills/x.png',
      'org/' || current_setting('fx.club_a'),
      '/org/' || current_setting('fx.club_a') || '/x.png',
      'x/org/' || current_setting('fx.club_a') || '/x.png',
      'orgs/' || current_setting('fx.club_a') || '/x.png',
      'ORG/' || current_setting('fx.club_a') || '/x.png',
      'org/' || upper(current_setting('fx.club_a')) || '/x.png',
      'org/' || substr(current_setting('fx.club_a'), 2) || '/x.png',
      'org/' || current_setting('fx.club_a') || 'f/x.png',
      'org/gggggggg-gggg-4ggg-8ggg-gggggggggggg/x.png'
    ]) as t (p)
    where private.storage_org_id(p) is not null$$,
  'storage_org_id devuelve null en toda ruta que no empiece por org/<uuid en hexadecimal minúsculo>/, sin error de conversión'
);

-- ── c1 (entrenador): sube a la carpeta de su borrador ────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')))$$,
  'c1 sube un PNG a la carpeta de su borrador'
);

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft'), 'jpg')),
           ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft'), 'webp'))$$,
  'c1 sube también un JPG y un WebP'
);

-- La API de Storage inserta y pide la fila de vuelta: la nueva también tiene que pasar la
-- política de lectura. Quien puede subir a la carpeta de un ejercicio puede verlo, así que quien
-- sube lee lo que acaba de subir.
select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')))
    returning id$$,
  'c1 sube a su borrador y recibe su fila de vuelta con returning'
);

select is(
  private.can_upload_drill_media(tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft'))),
  true,
  'control: can_upload_drill_media da true a c1 en la carpeta de su borrador'
);

-- ── c1: adonde no puede subir (Review Focus 4) ───────────────────────────────────────
-- Por autor: el ejercicio publicado no es suyo.
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')))$$,
  '42501', null,
  'c1 no sube a la carpeta del ejercicio publicado'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), gen_random_uuid()::text))$$,
  '42501', null,
  'c1 no sube a la carpeta de un ejercicio que no existe'
);

-- Por club: ni a otro club, ni a una ruta cuyo club no es el del ejercicio.
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_b'), current_setting('fx.d_b')))$$,
  '42501', null,
  'c1 no sube a la carpeta de un ejercicio de B'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_b'), current_setting('fx.d_draft')))$$,
  '42501', null,
  'c1 no sube a org/B/… con el ejercicio de su borrador de A'
);

-- Por bucket: la política es de `club-media` y no abre ningún otro.
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('pgtap-otro', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')))$$,
  '42501', null,
  'c1 no sube a otro bucket con una ruta válida de su borrador'
);

-- Por forma de la ruta.
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft'), 'svg'))$$,
  '42501', null,
  'c1 no sube un .svg'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft'), 'png.exe'))$$,
  '42501', null,
  'c1 no sube un fichero cuyo nombre acaba en .png.exe'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft'), 'PNG'))$$,
  '42501', null,
  'c1 no sube un fichero con la extensión en mayúsculas'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media',
            'org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_draft') || '/x.png')$$,
  '42501', null,
  'c1 no sube un fichero que no se llama como un uuid (x.png)'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media',
            'org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_draft')
            || '/../' || gen_random_uuid()::text || '.png')$$,
  '42501', null,
  'c1 no sube con un tramo ../ en la ruta'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), upper(current_setting('fx.d_draft'))))$$,
  '42501', null,
  'c1 no sube con el uuid del ejercicio en mayúsculas'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', 'org/no-uuid/x.png')$$,
  '42501', null,
  'c1 no sube a org/no-uuid/x.png, y la política no falla con un error de conversión'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', '/' || tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')))$$,
  '42501', null,
  'c1 no sube con una barra delante de la ruta'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media',
            replace(tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')),
                    '/drills/', '/otros/'))$$,
  '42501', null,
  'c1 no sube a una carpeta que no es drills/'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')) || E'\n')$$,
  '42501', null,
  'c1 no sube con un salto de línea al final de la ruta'
);

-- La función misma responde false, sin error, a rutas mal formadas.
select is_empty(
  $$select p
    from unnest(array[
      null::text,
      '',
      'org/',
      'org/no-uuid/x.png',
      'org/no-uuid/drills/no-uuid/no-uuid.png',
      'org/' || current_setting('fx.club_a') || '/drills/no-uuid/' || gen_random_uuid()::text || '.png',
      'org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_draft') || '/x.png',
      'org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_draft') || '/',
      'org/gggggggg-gggg-4ggg-8ggg-gggggggggggg/drills/gggggggg-gggg-4ggg-8ggg-gggggggggggg/gggggggg-gggg-4ggg-8ggg-gggggggggggg.png',
      'org/' || current_setting('fx.club_a') || '/drills/gggggggg-gggg-4ggg-8ggg-gggggggggggg/gggggggg-gggg-4ggg-8ggg-gggggggggggg.png'
    ]) as t (p)
    where private.can_upload_drill_media(p)$$,
  'can_upload_drill_media responde false a rutas mal formadas, sin error de conversión'
);

-- Y la de lectura: ninguna de estas rutas es de la carpeta de un ejercicio que c1 pueda ver.
-- Es la misma lista de arriba, sin el nombre de fichero como requisito, más los casos en que
-- el club de la ruta no es el del ejercicio, o el ejercicio no existe.
select is_empty(
  $$select p
    from unnest(array[
      null::text,
      '',
      'org/',
      'org/no-uuid/x.png',
      'org/no-uuid/drills/no-uuid/no-uuid.png',
      'org/' || current_setting('fx.club_a') || '/drills/',
      'org/' || current_setting('fx.club_a') || '/drills/no-uuid/' || gen_random_uuid()::text || '.png',
      'org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_draft'),
      '/org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_draft') || '/x.png',
      'org/' || current_setting('fx.club_a') || '/drills/' || upper(current_setting('fx.d_draft')) || '/x.png',
      'org/' || current_setting('fx.club_a') || '/drills/' || gen_random_uuid()::text || '/x.png',
      'org/' || current_setting('fx.club_b') || '/drills/' || current_setting('fx.d_draft') || '/x.png',
      'org/' || current_setting('fx.club_a') || '/people/' || current_setting('fx.d_draft') || '/x.png',
      'org/gggggggg-gggg-4ggg-8ggg-gggggggggggg/drills/gggggggg-gggg-4ggg-8ggg-gggggggggggg/x.png',
      'org/' || current_setting('fx.club_a') || '/drills/gggggggg-gggg-4ggg-8ggg-gggggggggggg/x.png'
    ]) as t (p)
    where private.can_see_drill_media(p)$$,
  'can_see_drill_media responde false a rutas mal formadas, sin error de conversión'
);

-- ── Otros usuarios: lo que cada uno sube ─────────────────────────────────────────────
-- c2 es del mismo club y entrena otro equipo, pero el borrador es de su autor.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')))$$,
  '42501', null,
  'c2 no sube a la carpeta del borrador de c1'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')))$$,
  '42501', null,
  'c2 no sube a la carpeta del ejercicio publicado'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')))$$,
  '42501', null,
  'coachB no sube a la carpeta de un ejercicio de A'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_b')))$$,
  '42501', null,
  'coachB no sube a org/A/… con el ejercicio de B'
);

select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')))$$,
  '42501', null,
  'jugA, que es del club pero juega, no sube a ninguna carpeta'
);

-- multi es entrenador de A y admin de B: ser admin de B no da ningún permiso en A.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_b'), current_setting('fx.d_b')))$$,
  'multi sube a la carpeta de un ejercicio de B, donde es admin'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')))$$,
  '42501', null,
  'multi no sube a la carpeta del borrador de c1, en A'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')))$$,
  '42501', null,
  'multi no sube a la carpeta del publicado de A: allí solo es entrenador'
);

-- El ejercicio d_b sí lo puede editar multi, pero la ruta dice que es de A.
select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_b')))$$,
  '42501', null,
  'multi no sube a org/A/… con un ejercicio de B que sí puede editar'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select lives_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub'))),
           ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')))$$,
  'adminA sube a la carpeta de un ejercicio publicado y a la de un borrador de c1'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_b'), current_setting('fx.d_b')))$$,
  '42501', null,
  'adminA no sube a la carpeta de un ejercicio de B'
);

select tests.clear_authentication();

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')))$$,
  '42501', null,
  'anon no sube a ninguna carpeta'
);

-- ── Lectura de objetos ───────────────────────────────────────────────────────────────
-- Un objeto lo lee quien puede ver el ejercicio de su carpeta. Listar obedece la misma regla
-- (`tests.ls` llama a `storage.search`, que se ejecuta con los privilegios de quien llama),
-- así que también se prueba por ahí: un borrador que no se ve en `drills` no puede salir al
-- listar la carpeta de ejercicios, ni su id, ni los ficheros de dentro.
-- Los objetos de A: `o_pub` y `o_pub2` en la carpeta del publicado, `o_draft` en la del borrador
-- de c1, y `o_people` fuera de las carpetas de ejercicios.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  $$select name from storage.objects where name = current_setting('fx.o_pub')$$,
  $$values (current_setting('fx.o_pub'))$$,
  'c2 lee el objeto de la carpeta de un ejercicio publicado de su club'
);

select is_empty(
  $$select 1 from storage.objects where name = current_setting('fx.o_draft')$$,
  'c2 no lee el objeto de la carpeta del borrador de c1'
);

select is_empty(
  $$select 1 from storage.objects where name = current_setting('fx.o_people')$$,
  'c2 no lee un objeto de su club que no está en la carpeta de un ejercicio'
);

select is_empty(
  $$select 1 from storage.objects where name like 'org/' || current_setting('fx.club_b') || '/%'$$,
  'c2 no lee ningún objeto de B'
);

-- La política es de `club-media`: un objeto de otro bucket con una ruta de A no se lee por
-- ella.
select is_empty(
  $$select 1 from storage.objects where bucket_id <> 'club-media'$$,
  'c2 no lee los objetos de otro bucket por la política de club-media'
);

select set_eq(
  $$select tests.ls('org/' || current_setting('fx.club_a') || '/drills/')$$,
  $$values (current_setting('fx.d_pub'))$$,
  'c2 lista la carpeta del ejercicio publicado, y no la del borrador de c1'
);

select is_empty(
  $$select tests.ls('org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_draft') || '/')$$,
  'c2 no lista los ficheros de la carpeta del borrador de c1'
);

select results_eq(
  $$select f from tests.ls('org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_pub') || '/') as f
    where f = split_part(current_setting('fx.o_pub'), '/', 5)$$,
  $$values (split_part(current_setting('fx.o_pub'), '/', 5))$$,
  'c2 lista los ficheros de la carpeta del ejercicio publicado'
);

select set_eq(
  $$select tests.ls('org/' || current_setting('fx.club_a') || '/')$$,
  $$values ('drills')$$,
  'c2 lista drills/ en la carpeta de su club, y no people/'
);

-- Leer no depende del nombre del fichero (subir sí).
select is(
  private.can_see_drill_media(
    'org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_pub') || '/notas.txt'
  ),
  true,
  'can_see_drill_media no mira el nombre ni la extensión del fichero'
);

select is(
  private.can_see_drill_media(
    'org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_draft') || '/x.png'
  ),
  false,
  'can_see_drill_media da false a c2 en la carpeta del borrador de c1'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select set_eq(
  $$select name from storage.objects
    where name in (current_setting('fx.o_pub'), current_setting('fx.o_draft'))$$,
  $$values (current_setting('fx.o_pub')), (current_setting('fx.o_draft'))$$,
  'c1 lee el objeto de la carpeta de su borrador y el del publicado'
);

select is_empty(
  $$select 1 from storage.objects where name = current_setting('fx.o_people')$$,
  'c1 no lee un objeto de su club que no está en la carpeta de un ejercicio'
);

-- El ejercicio d_draft es de A: una ruta de B que lo nombra no es una carpeta suya.
select is_empty(
  $$select 1 from storage.objects where name = current_setting('fx.o_cross')$$,
  'c1 no lee org/B/… con el ejercicio de su borrador de A'
);

select set_eq(
  $$select tests.ls('org/' || current_setting('fx.club_a') || '/drills/')$$,
  $$values (current_setting('fx.d_pub')), (current_setting('fx.d_draft'))$$,
  'c1 lista la carpeta del publicado y la de su borrador'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select set_eq(
  $$select name from storage.objects
    where name in (current_setting('fx.o_pub'), current_setting('fx.o_draft'))$$,
  $$values (current_setting('fx.o_pub')), (current_setting('fx.o_draft'))$$,
  'adminA lee el objeto del publicado y el del borrador de c1'
);

-- Ni el admin lee una ruta que no sea la carpeta de un ejercicio, ni una que mezcle clubes.
select is_empty(
  $$select 1 from storage.objects
    where name in (current_setting('fx.o_people'), current_setting('fx.o_cross'), current_setting('fx.o_cross2'))$$,
  'adminA no lee un objeto de A fuera de las carpetas de ejercicios, ni los de ruta mezclada'
);

select set_eq(
  $$select tests.ls('org/' || current_setting('fx.club_a') || '/drills/')$$,
  $$values (current_setting('fx.d_pub')), (current_setting('fx.d_draft'))$$,
  'adminA lista las carpetas de los dos ejercicios de A'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select results_eq(
  $$select name from storage.objects where name in (current_setting('fx.o_pub'), current_setting('fx.o_b'))$$,
  $$values (current_setting('fx.o_b'))$$,
  'coachB lee el objeto de B y no el de A'
);

select is_empty(
  $$select 1 from storage.objects where name like 'org/' || current_setting('fx.club_a') || '/%'$$,
  'coachB no lee ningún objeto de A'
);

select is_empty(
  $$select tests.ls('org/' || current_setting('fx.club_a') || '/drills/')$$,
  'coachB no lista ninguna carpeta de A'
);

-- Entre los objetos de B hay uno con una ruta de B y el ejercicio d_draft, que es de A.
select set_eq(
  $$select tests.ls('org/' || current_setting('fx.club_b') || '/drills/')$$,
  $$values (current_setting('fx.d_b'))$$,
  'coachB lista la carpeta del ejercicio de B, y no la de la ruta mezclada'
);

-- Miembro de los dos clubes: lee los publicados de ambos.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select results_eq(
  $$select count(*)::int from storage.objects
    where name in (current_setting('fx.o_pub'), current_setting('fx.o_b'))$$,
  array[2],
  'multi, que es entrenador de A y admin de B, lee los objetos de los dos'
);

select is_empty(
  $$select 1 from storage.objects
    where name in (current_setting('fx.o_draft'), current_setting('fx.o_people'))$$,
  'multi no lee el borrador de c1 en A, donde es un entrenador sin ejercicios, ni lo que no es una carpeta de ejercicio'
);

-- d_b es de B y multi lo ve como admin de B, pero la ruta dice que es de A.
select is_empty(
  $$select 1 from storage.objects where name = current_setting('fx.o_cross2')$$,
  'multi no lee org/A/… con un ejercicio de B que sí puede ver'
);

select set_eq(
  $$select tests.ls('org/' || current_setting('fx.club_a') || '/drills/')$$,
  $$values (current_setting('fx.d_pub'))$$,
  'multi lista en A solo la carpeta del publicado'
);

-- Un jugador es del club, pero la biblioteca es del cuerpo técnico: no lee ni lista nada.
select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select is_empty(
  $$select name from storage.objects
    union all select tests.ls('org/' || current_setting('fx.club_a') || '/')
    union all select tests.ls('org/' || current_setting('fx.club_a') || '/drills/')
    union all select tests.ls('org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_pub') || '/')
    union all select tests.ls('org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_draft') || '/')$$,
  'jugA, que es del club pero juega, no lee ni lista nada de A'
);

select tests.clear_authentication();

select is_empty(
  $$select 1 from storage.objects$$,
  'anon no lee ningún objeto'
);

select is_empty(
  $$select tests.ls('org/' || current_setting('fx.club_a') || '/drills/')$$,
  'anon no lista ninguna carpeta'
);

-- La lectura sigue al ejercicio: cuando adminA publica el borrador de c1, c2 empieza a leer su
-- objeto y a listar su carpeta. Después se deja el borrador como estaba.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$with u as (update drills set status = 'published'
               where id = current_setting('fx.d_draft')::uuid returning status::text)
    select * from u$$,
  $$values ('published')$$,
  'adminA publica el borrador de c1'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  $$select name from storage.objects where name = current_setting('fx.o_draft')$$,
  $$values (current_setting('fx.o_draft'))$$,
  'c2 lee el objeto del borrador desde que se publica'
);

select set_eq(
  $$select tests.ls('org/' || current_setting('fx.club_a') || '/drills/')$$,
  $$values (current_setting('fx.d_pub')), (current_setting('fx.d_draft'))$$,
  'c2 lista la carpeta del ejercicio de c1 desde que se publica'
);

reset role;
update drills set status = 'draft' where id = current_setting('fx.d_draft')::uuid;

-- ── Borrado de objetos y política update ─────────────────────────────────────────────
-- La base de datos no deja borrar `storage.objects` a mano (un trigger de Storage lo corta
-- con 42501 antes de mirar las políticas) salvo que la API lo habilite. Se habilita para
-- probar la política: los borrados que se esperan denegados no fallan, borran 0 filas.
reset role;

do $$ begin
  perform set_config('storage.allow_delete_query', 'true', true);
end $$;

-- Con una política de lectura propia el objeto de `pgtap-otro` es visible para todos, y lo
-- único que lo protege es la cláusula de bucket de la política de borrado.
create policy pgtap_otro_read
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'pgtap-otro');

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  $$with d as (delete from storage.objects where name = current_setting('fx.o_draft') returning 1)
    select count(*)::int from d$$,
  array[0],
  'c2 no borra el objeto de la carpeta del borrador de c1'
);

select results_eq(
  $$with d as (delete from storage.objects where name = current_setting('fx.o_pub') returning 1)
    select count(*)::int from d$$,
  array[0],
  'c2 no borra el objeto de la carpeta del publicado'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select results_eq(
  $$with d as (delete from storage.objects
               where name in (current_setting('fx.o_draft'), current_setting('fx.o_pub')) returning 1)
    select count(*)::int from d$$,
  array[0],
  'coachB no borra objetos de A'
);

select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select results_eq(
  $$with d as (delete from storage.objects where name = current_setting('fx.o_pub') returning 1)
    select count(*)::int from d$$,
  array[0],
  'jugA no borra el objeto de su club'
);

select tests.authenticate_as(current_setting('fx.multi')::uuid);

select results_eq(
  $$with d as (delete from storage.objects where name = current_setting('fx.o_pub') returning 1)
    select count(*)::int from d$$,
  array[0],
  'multi no borra el objeto del publicado de A: lo ve, pero allí solo es entrenador'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$with d as (delete from storage.objects where name = current_setting('fx.o_pub') returning 1)
    select count(*)::int from d$$,
  array[0],
  'c1 no borra el objeto de la carpeta del publicado'
);

select results_eq(
  $$with d as (delete from storage.objects where name = current_setting('fx.o_otro') returning 1)
    select count(*)::int from d$$,
  array[0],
  'c1 no borra, con una ruta válida de su borrador, un objeto de otro bucket'
);

-- No hay política `update`: ni siquiera mover un objeto a otro nombre válido de la misma
-- carpeta. Si hubiera una, mover un objeto de la carpeta de un borrador a la de otro
-- ejercicio sería un `update` más.
select results_eq(
  $$with u as (update storage.objects
               set name = tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft'))
               where name = current_setting('fx.o_draft') returning 1)
    select count(*)::int from u$$,
  array[0],
  'c1 no cambia el nombre de su objeto: no hay política update'
);

select results_eq(
  $$with d as (delete from storage.objects where name = current_setting('fx.o_draft') returning 1)
    select count(*)::int from d$$,
  array[1],
  'c1 borra el objeto de la carpeta de su borrador'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$with d as (delete from storage.objects where name = current_setting('fx.o_pub2') returning 1)
    select count(*)::int from d$$,
  array[1],
  'adminA borra el objeto de la carpeta de un ejercicio publicado'
);

select results_eq(
  $$with d as (delete from storage.objects where name = current_setting('fx.o_b') returning 1)
    select count(*)::int from d$$,
  array[0],
  'adminA no borra el objeto de B'
);

reset role;
drop policy pgtap_otro_read on storage.objects;

-- ── media_assets: lo que ven c1 y c2 ─────────────────────────────────────────────────
-- Al principio, ningún medio es diagrama de un ejercicio publicado: c1 ve el suyo y el que
-- adminA subió a su borrador (diagrama del borrador de c1, que él sí ve), y c2 no ve nada.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select set_eq(
  'select id from media_assets',
  $$values (current_setting('fx.m_c1')::uuid), (current_setting('fx.m_adm_draft')::uuid)$$,
  'c1 ve su medio y el diagrama de su borrador, y no el de adminA ni el de B'
);

-- Con `returning` la fila nueva también tiene que pasar la política de lectura: es lo que hace
-- PostgREST con `insert().select()` y lo que hará la acción de subida.
select lives_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p_new'), 'image', 'image/png', 2048)
    returning id$$,
  'c1 registra su ruta y recibe el id de vuelta con returning'
);

-- Lo que no se indica lo pone la base de datos: el bucket, el autor y que no sale un menor.
select results_eq(
  $$select bucket, organization_id, kind, mime, bytes, contains_minor, created_by
    from media_assets where path = current_setting('fx.p_new')$$,
  $$values ('club-media', current_setting('fx.club_a')::uuid, 'image', 'image/png', 2048,
            false, current_setting('fx.c1')::uuid)$$,
  'el medio de c1 nace en club-media, sin menores y con c1 de autor'
);

do $$ begin
  perform set_config(
    'fx.m_new',
    (select id::text from public.media_assets where path = current_setting('fx.p_new')),
    true
  );
end $$;

select set_eq(
  'select id from media_assets',
  $$values (current_setting('fx.m_c1')::uuid), (current_setting('fx.m_adm_draft')::uuid),
           (current_setting('fx.m_new')::uuid)$$,
  'c1 ve ahora también el que acaba de registrar'
);

-- Lo que c1 no puede registrar.
select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'image', 'image/png', 1000)$$,
  '42501', null,
  'c1 no registra un medio en la carpeta del ejercicio publicado'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes, created_by)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')),
            'image', 'image/png', 1000, current_setting('fx.c2')::uuid)$$,
  '42501', null,
  'c1 no registra un medio a nombre de otro'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_b'), current_setting('fx.d_b')),
            'image', 'image/png', 1000)$$,
  '42501', null,
  'c1 no registra un medio de A con la ruta de un ejercicio de B'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            'org/' || current_setting('fx.club_a') || '/drills/' || current_setting('fx.d_draft') || '/x.png',
            'image', 'image/png', 1000)$$,
  '42501', null,
  'c1 no registra un medio con una ruta que no es la de un fichero subido (x.png)'
);

-- La política no mira `organization_id`: lo ata a la ruta el CHECK de la tabla.
select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_b')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')),
            'image', 'image/png', 1000)$$,
  '23514', null,
  'c1 no registra un medio de B con la ruta de su borrador de A'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select is_empty(
  'select 1 from media_assets',
  'c2 no ve ningún medio: ni el de c1, ni el diagrama del borrador de c1, ni el de B'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')),
            'image', 'image/png', 1000)$$,
  '42501', null,
  'c2 no registra un medio en la carpeta del borrador de c1'
);

-- ── media_assets: el resto de usuarios ───────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select set_eq(
  'select id from media_assets',
  $$values (current_setting('fx.m_admin')::uuid), (current_setting('fx.m_c1')::uuid),
           (current_setting('fx.m_adm_draft')::uuid), (current_setting('fx.m_new')::uuid)$$,
  'adminA ve todos los medios de A, aunque no sean suyos ni de un ejercicio, y ninguno de B'
);

select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select is_empty(
  'select 1 from media_assets',
  'jugA, que es del club pero juega, no ve ningún medio'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'image', 'image/png', 1000)$$,
  '42501', null,
  'jugA no registra medios'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select set_eq(
  'select id from media_assets',
  $$values (current_setting('fx.m_b')::uuid)$$,
  'coachB ve el medio de B y ninguno de A'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')),
            'image', 'image/png', 1000)$$,
  '42501', null,
  'coachB no registra un medio en A'
);

-- multi: entrenador de A y admin de B.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select set_eq(
  'select id from media_assets',
  $$values (current_setting('fx.m_b')::uuid)$$,
  'multi ve el medio de B, donde es admin, y ninguno de A, donde es un entrenador sin ejercicios'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')),
            'image', 'image/png', 1000)$$,
  '42501', null,
  'multi no registra un medio en el borrador de c1, en A'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_b')),
            'image', 'image/png', 1000)$$,
  '42501', null,
  'multi no registra un medio de A con un ejercicio de B que sí puede editar'
);

select tests.clear_authentication();

select throws_ok('select * from media_assets', '42501', null, 'anon no tiene acceso a media_assets');

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')),
            'image', 'image/png', 1000)$$,
  '42501', null,
  'anon no registra medios'
);

-- ── Un medio se ve cuando es el diagrama de un ejercicio que se ve ───────────────────
-- adminA fija el medio que registró c1 como diagrama del ejercicio publicado. A partir de
-- ahí lo ve todo el cuerpo técnico del club; el diagrama de un borrador, no.
reset role;
update drills
set diagram_media_id = current_setting('fx.m_new')::uuid
where id = current_setting('fx.d_pub')::uuid;

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select set_eq(
  'select id from media_assets',
  $$values (current_setting('fx.m_new')::uuid)$$,
  'c2 ve el medio de c1 desde que es el diagrama de un ejercicio publicado, y no el del borrador'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select set_eq(
  'select id from media_assets',
  $$values (current_setting('fx.m_c1')::uuid), (current_setting('fx.m_adm_draft')::uuid),
           (current_setting('fx.m_new')::uuid)$$,
  'c1 sigue viendo los suyos, y no el medio de adminA que no es de ningún ejercicio'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select set_eq(
  'select id from media_assets',
  $$values (current_setting('fx.m_admin')::uuid), (current_setting('fx.m_c1')::uuid),
           (current_setting('fx.m_adm_draft')::uuid), (current_setting('fx.m_new')::uuid)$$,
  'adminA sigue viendo los cuatro de A'
);

select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select is_empty(
  'select 1 from media_assets',
  'jugA no ve ni el diagrama de un ejercicio publicado: la biblioteca es del cuerpo técnico'
);

select tests.authenticate_as(current_setting('fx.multi')::uuid);

select set_eq(
  'select id from media_assets',
  $$values (current_setting('fx.m_new')::uuid), (current_setting('fx.m_b')::uuid)$$,
  'multi ve el diagrama del publicado de A, como entrenador, y el de B, como admin'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select set_eq(
  'select id from media_assets',
  $$values (current_setting('fx.m_b')::uuid)$$,
  'coachB sigue viendo solo el medio de B'
);

-- La política de lectura de `media_assets` (la regla del autor sobre las columnas de la fila,
-- y `can_see_media` para el resto) y `can_see_media` son dos copias de la misma regla: lo que
-- cada usuario ve en `media_assets` es exactamente lo que la función da por visible, sobre
-- todos los medios del servidor.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  'select id from media_assets order by id',
  'select id from tests.all_media_ids() as t (id) where private.can_see_media(id) order by id',
  'c1: la política de media_assets y can_see_media ven lo mismo'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  'select id from media_assets order by id',
  'select id from tests.all_media_ids() as t (id) where private.can_see_media(id) order by id',
  'c2: la política de media_assets y can_see_media ven lo mismo'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  'select id from media_assets order by id',
  'select id from tests.all_media_ids() as t (id) where private.can_see_media(id) order by id',
  'adminA: la política de media_assets y can_see_media ven lo mismo'
);

select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select results_eq(
  'select id from media_assets order by id',
  'select id from tests.all_media_ids() as t (id) where private.can_see_media(id) order by id',
  'jugA: la política de media_assets y can_see_media ven lo mismo'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select results_eq(
  'select id from media_assets order by id',
  'select id from tests.all_media_ids() as t (id) where private.can_see_media(id) order by id',
  'coachB: la política de media_assets y can_see_media ven lo mismo'
);

select tests.authenticate_as(current_setting('fx.multi')::uuid);

select results_eq(
  'select id from media_assets order by id',
  'select id from tests.all_media_ids() as t (id) where private.can_see_media(id) order by id',
  'multi: la política de media_assets y can_see_media ven lo mismo'
);

-- multi, que es admin de B, registra su medio en la carpeta de un ejercicio de B.
select lives_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_b')::uuid,
            tests.drill_path(current_setting('fx.club_b'), current_setting('fx.d_b')),
            'image', 'image/webp', 1000)
    returning id$$,
  'multi registra un medio en la carpeta de un ejercicio de B, donde es admin'
);

-- ── Restricciones de la tabla (como postgres) ────────────────────────────────────────
-- Un CHECK vale igual al crear que al cambiar; aquí se prueban con `insert`, sin sesión: no
-- pasan por RLS.
reset role;

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_b'), current_setting('fx.d_b')),
            'image', 'image/png', 1000)$$,
  '23514', null,
  'una ruta de B no se registra en un medio de A'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            'x/' || current_setting('fx.club_a') || '/drills/y/z.png', 'image', 'image/png', 1000)$$,
  '23514', null,
  'la ruta de un medio tiene que empezar por org/'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, bucket, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'otro', 'image', 'image/png', 1000)$$,
  '23514', null,
  'el único bucket de un medio es club-media'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'audio', 'image/png', 1000)$$,
  '23514', null,
  'el tipo de un medio es image, video o document'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'image', 'image/svg+xml', 1000)$$,
  '23514', null,
  'un SVG no se registra: solo PNG, JPEG o WebP'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'image', 'image/gif', 1000)$$,
  '23514', null,
  'un GIF no se registra'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'image', 'image/png', 0)$$,
  '23514', null,
  'un medio de 0 bytes se rechaza'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'image', 'image/png', 2097153)$$,
  '23514', null,
  'un medio de 2 MB y un byte se rechaza'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    select organization_id, path, kind, mime, bytes from media_assets
    where id = current_setting('fx.m_admin')::uuid$$,
  '23505', null,
  'la ruta de un medio es única'
);

select lives_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes, contains_minor)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'image', 'image/png', 1, true),
           (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'video', 'image/jpeg', 2097152, false),
           (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
            'document', 'image/webp', 1000, false)$$,
  'los valores límite de cada columna entran'
);

-- ── service_role: el seed y la limpieza de los e2e escriben con la clave de servicio ──
-- PostgREST pone el rol y unos claims sin `sub` (`auth.uid()` es null): el medio nace sin
-- autor, y RLS no se aplica.
do $$ begin
  perform set_config(
    'fx.p_svc',
    tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_pub')),
    true
  );
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
end $$;
set local role service_role;

select lives_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p_svc'), 'image', 'image/png', 1000)$$,
  'service_role registra un medio'
);

select results_eq(
  $$with d as (delete from media_assets where path = current_setting('fx.p_svc') returning 1)
    select count(*)::int from d$$,
  array[1],
  'service_role borra un medio'
);

reset role;

-- ── Clave foránea del diagrama (como postgres) ───────────────────────────────────────
select results_eq(
  $$select conname::text collate "default" from pg_constraint
    where conrelid = 'public.drills'::regclass
      and contype = 'f'
      and confrelid = 'public.media_assets'::regclass$$,
  $$values ('drills_diagram_fk')$$,
  'drills tiene una única clave foránea hacia media_assets, drills_diagram_fk'
);

select fk_ok(
  'public', 'drills', array['organization_id', 'diagram_media_id'],
  'public', 'media_assets', array['organization_id', 'id'],
  'drills_diagram_fk es compuesta: (organization_id, diagram_media_id)'
);

select throws_ok(
  $$update drills set diagram_media_id = current_setting('fx.m_b')::uuid
    where id = current_setting('fx.d_pub')::uuid$$,
  '23503', null,
  'FK compuesta: un ejercicio de A no usa de diagrama un medio de B'
);

-- Quitar un medio no puede dejar el ejercicio sin club: solo se vacía el diagrama.
select lives_ok(
  $$delete from media_assets where id = current_setting('fx.m_b')::uuid$$,
  'se puede borrar un medio que es el diagrama de un ejercicio'
);

select results_eq(
  $$select diagram_media_id, organization_id from drills where id = current_setting('fx.d_b')::uuid$$,
  $$values (null::uuid, current_setting('fx.club_b')::uuid)$$,
  'al borrar el medio el ejercicio se queda sin diagrama y en su club'
);

-- ── Solo cuentan las membresías activas ──────────────────────────────────────────────
-- Control positivo: es el mismo c1 que arriba subía a su borrador, leía los objetos de A y veía
-- sus medios, algunos suyos y otros no.
update memberships set status = 'revoked' where user_id = current_setting('fx.c1')::uuid;
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select is_empty(
  'select 1 from media_assets',
  'una membresía revocada no ve ningún medio, tampoco los que subió'
);

select results_eq(
  'select id from media_assets order by id',
  'select id from tests.all_media_ids() as t (id) where private.can_see_media(id) order by id',
  'c1 revocado: la política de media_assets y can_see_media ven lo mismo'
);

select is_empty(
  $$select 1 from storage.objects$$,
  'una membresía revocada no lee ningún objeto'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('club-media', tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')))$$,
  '42501', null,
  'una membresía revocada no sube ni a la carpeta de su propio borrador'
);

select throws_ok(
  $$insert into media_assets (organization_id, path, kind, mime, bytes)
    values (current_setting('fx.club_a')::uuid,
            tests.drill_path(current_setting('fx.club_a'), current_setting('fx.d_draft')),
            'image', 'image/png', 1000)$$,
  '42501', null,
  'una membresía revocada no registra medios'
);

-- ── Borrar a la cuenta de un autor ───────────────────────────────────────────────────
-- `created_by` apunta a `auth.users`. Sin `on delete set null`, borrar la cuenta de c1
-- fallaba con 23503 o se llevaba su contenido: el medio se queda y su autor pasa a null. Un
-- medio sin autor y sin ejercicio solo lo ve el admin.
reset role;

select results_eq(
  $$select created_by from media_assets where id = current_setting('fx.m_c1')::uuid$$,
  $$values (current_setting('fx.c1')::uuid)$$,
  'control: c1, que registró su medio, figura como su autor'
);

select lives_ok(
  $$delete from auth.users where id = current_setting('fx.c1')::uuid$$,
  'borrar la cuenta de un autor no falla'
);

select results_eq(
  $$select created_by from media_assets where id = current_setting('fx.m_c1')::uuid$$,
  $$values (null::uuid)$$,
  'el medio se queda y su autor pasa a null'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select is_empty(
  $$select 1 from media_assets where id = current_setting('fx.m_c1')::uuid$$,
  'un medio sin autor ni ejercicio no lo ve ningún entrenador'
);

select results_eq(
  'select id from media_assets order by id',
  'select id from tests.all_media_ids() as t (id) where private.can_see_media(id) order by id',
  'c2, con un medio sin autor: la política de media_assets y can_see_media ven lo mismo'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$select count(*)::int from media_assets where id = current_setting('fx.m_c1')::uuid$$,
  array[1],
  'adminA sigue viendo un medio sin autor'
);

select results_eq(
  'select id from media_assets order by id',
  'select id from tests.all_media_ids() as t (id) where private.can_see_media(id) order by id',
  'adminA, con un medio sin autor: la política de media_assets y can_see_media ven lo mismo'
);

-- ── Tabla, RLS, privilegios y políticas (catálogo) ───────────────────────────────────
reset role;

select results_eq(
  $$select relrowsecurity from pg_class
    where relnamespace = 'public'::regnamespace and relname = 'media_assets'$$,
  $$values (true)$$,
  'RLS activado en media_assets'
);

-- Todo es obligatorio salvo el autor, que pasa a null si se borra su cuenta.
select set_eq(
  $$select a.attname::text
    from pg_attribute as a
    where a.attrelid = 'public.media_assets'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attnotnull$$,
  $$values ('id'), ('organization_id'), ('bucket'), ('path'), ('kind'), ('mime'), ('bytes'),
           ('contains_minor'), ('created_at')$$,
  'todas las columnas de media_assets son obligatorias salvo created_by'
);

-- `maintain` existe como privilegio desde PostgreSQL 17.
select is_empty(
  $$select p.privilege
    from unnest(
      array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']
      || case when current_setting('server_version_num')::int >= 170000
           then array['maintain'] else array[]::text[] end
    ) as p (privilege)
    where has_table_privilege('anon', 'public.media_assets', p.privilege)$$,
  'anon no tiene ningún privilegio sobre media_assets'
);

-- Las fichas no se cambian ni se borran desde la app: se crean al subir y ya.
select results_eq(
  $$select has_table_privilege('authenticated', 'public.media_assets', 'select'),
           has_table_privilege('authenticated', 'public.media_assets', 'insert'),
           has_table_privilege('authenticated', 'public.media_assets', 'update'),
           has_table_privilege('authenticated', 'public.media_assets', 'delete')$$,
  $$values (true, true, false, false)$$,
  'authenticated lee y crea medios, y no los cambia ni los borra'
);

select is_empty(
  $$select p.privilege
    from unnest(
      array['truncate', 'references', 'trigger']
      || case when current_setting('server_version_num')::int >= 170000
           then array['maintain'] else array[]::text[] end
    ) as p (privilege)
    where has_table_privilege('authenticated', 'public.media_assets', p.privilege)$$,
  'authenticated no tiene truncate, references ni trigger en media_assets'
);

-- El seed y la limpieza de los e2e escriben con la clave de servicio (nunca desde src/).
select results_eq(
  $$select count(*)::int
    from unnest(array['select', 'insert', 'update', 'delete']) as p (privilege)
    where has_table_privilege('service_role', 'public.media_assets', p.privilege)$$,
  array[4],
  'service_role puede leer y escribir media_assets'
);

-- Sin política no hay acceso. En `storage.objects` hay otras políticas en un proyecto real;
-- aquí solo se miran las del bucket de los clubes, y ninguna es de `update`.
select set_eq(
  $$select tablename::text, policyname::text, cmd::text, roles::text[], permissive::text
    from pg_policies
    where (schemaname = 'public' and tablename = 'media_assets')
       or (schemaname = 'storage' and tablename = 'objects' and policyname like 'club\_media\_%')$$,
  $$values
    ('media_assets', 'media_assets_select_visible', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('media_assets', 'media_assets_insert_own', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('objects', 'club_media_read', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('objects', 'club_media_insert', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('objects', 'club_media_delete', 'DELETE', array['authenticated'], 'PERMISSIVE')$$,
  'las políticas: leer y crear medios, y leer, subir y borrar objetos; nada de update'
);

-- Las cuatro funciones son solo de `authenticated`: las evalúan las políticas, y la clave de
-- servicio no pasa por ellas.
select results_eq(
  $$select has_function_privilege('anon', 'private.storage_org_id(text)', 'execute'),
           has_function_privilege('authenticated', 'private.storage_org_id(text)', 'execute'),
           has_function_privilege('anon', 'private.can_upload_drill_media(text)', 'execute'),
           has_function_privilege('authenticated', 'private.can_upload_drill_media(text)', 'execute'),
           has_function_privilege('anon', 'private.can_see_drill_media(text)', 'execute'),
           has_function_privilege('authenticated', 'private.can_see_drill_media(text)', 'execute'),
           has_function_privilege('anon', 'private.can_see_media(uuid)', 'execute'),
           has_function_privilege('authenticated', 'private.can_see_media(uuid)', 'execute')$$,
  $$values (false, true, false, true, false, true, false, true)$$,
  'storage_org_id, can_upload_drill_media, can_see_drill_media y can_see_media las ejecuta authenticated y no anon'
);

-- ── Índices ──────────────────────────────────────────────────────────────────────────
-- La clave foránea compuesta del diagrama es `(organization_id, diagram_media_id)`: sin un
-- índice que empiece por ahí, `can_see_media` (qué ejercicio usa este medio) y borrar o
-- cambiar un medio recorren los ejercicios de todos los clubes.
select has_index(
  'public'::name, 'drills'::name, 'drills_organization_id_diagram_media_id_idx'::name,
  array['organization_id', 'diagram_media_id']::name[],
  'drills tiene índice por club y diagrama'::text
);

select * from finish();

rollback;
