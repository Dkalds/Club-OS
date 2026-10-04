-- Metodología: secciones de The Way, valores, principios de juego, puntos de principio y
-- Standards.
--
-- RLS aísla por club y separa lo publicado de lo que está en borrador: un miembro del club
-- (también un entrenador sin equipo: la metodología es de todo el club) lee solo lo
-- publicado; el admin del club lo lee todo, y es el único que escribe. Nadie borra
-- contenido, salvo los puntos de un principio, que el admin reemplaza al guardarlo.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*`
-- vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al
-- final. Los datos son ficticios y solo de este test; los emails y los slugs de club no
-- chocan con los de `pnpm seed` ni con los de los otros tests.
begin;

select plan(128);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A: adminA (admin) y coachA (coach, sin equipo ni persona enlazada).
--   Secciones:  `pub-a` (publicada, 1) y `draft-a` (borrador, 2); las dos con updated_at
--               en el año 2000, para comprobar que escribir no lo toca.
--   Valores:    `VALOR-PUB` (publicado) y `VALOR-BORRADOR` (borrador).
--   Principios: `pub-p` (publicado, con los puntos `pub-p-1` y `pub-p-2`) y `draft-p`
--               (borrador, con el punto `draft-p-1`).
--   Standards:  1 (publicado) y 2 (borrador).
-- Club B: adminB (admin) y coachB (coach). Una fila publicada en cada tabla: la sección
--   `pub-b`, el valor `VALOR-B`, el principio `pub-pb` con el punto `pub-pb-1` y el
--   Standard 1 (el mismo número que en A: es único por club, no global).
-- `multi` es admin de A y solo entrenador de B. `ambos` es admin de A y de B. `sinClub` tiene
-- cuenta y ninguna membresía.
--
-- Hacen de clave para leer las aserciones: `way_sections.slug`, `club_values.code`,
-- `game_principles.slug`, `principle_points.text` y `standards.number`. Están elegidas
-- para que `order by` dé el mismo orden con cualquier collation.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@methodology.pgtap.test');
  u_coach_a uuid := tests.create_user('coach-a@methodology.pgtap.test');
  u_admin_b uuid := tests.create_user('admin-b@methodology.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@methodology.pgtap.test');
  u_multi uuid := tests.create_user('multi@methodology.pgtap.test');
  u_both uuid := tests.create_user('ambos@methodology.pgtap.test');
  u_sin_club uuid := tests.create_user('sin-club@methodology.pgtap.test');

  g_pub constant uuid := gen_random_uuid();
  g_draft constant uuid := gen_random_uuid();
  g_pub_b constant uuid := gen_random_uuid();
  pt_pub_1 constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into memberships (organization_id, user_id, role) values
    (club_a, u_admin_a, 'admin'),
    (club_a, u_coach_a, 'coach'),
    (club_b, u_admin_b, 'admin'),
    (club_b, u_coach_b, 'coach'),
    (club_a, u_multi, 'admin'),
    (club_b, u_multi, 'coach'),
    (club_a, u_both, 'admin'),
    (club_b, u_both, 'admin');

  insert into way_sections (
    organization_id, number, slug, title, content_kind, status, sort, updated_at
  ) values
    (club_a, 1, 'pub-a', 'Sección publicada de A', 'text', 'published', 1, '2000-01-01T00:00:00Z'),
    (club_a, 2, 'draft-a', 'Sección en borrador de A', 'text', 'draft', 2, '2000-01-01T00:00:00Z'),
    (club_b, 1, 'pub-b', 'Sección publicada de B', 'text', 'published', 1, '2000-01-01T00:00:00Z');

  insert into club_values (organization_id, code, title, description, sort, status) values
    (club_a, 'VALOR-PUB', 'Valor publicado', 'Descripción del valor publicado.', 1, 'published'),
    (club_a, 'VALOR-BORRADOR', null, 'Descripción del valor en borrador.', 2, 'draft'),
    (club_b, 'VALOR-B', null, 'Descripción del valor de B.', 1, 'published');

  insert into game_principles (id, organization_id, slug, title, summary, sort, status) values
    (g_pub, club_a, 'pub-p', 'Principio publicado', 'Resumen del principio publicado.', 1, 'published'),
    (g_draft, club_a, 'draft-p', 'Principio en borrador', null, 2, 'draft'),
    (g_pub_b, club_b, 'pub-pb', 'Principio publicado de B', null, 1, 'published');

  insert into principle_points (id, organization_id, principle_id, text, sort) values
    (pt_pub_1, club_a, g_pub, 'pub-p-1', 1),
    (gen_random_uuid(), club_a, g_pub, 'pub-p-2', 2),
    (gen_random_uuid(), club_a, g_draft, 'draft-p-1', 1),
    (gen_random_uuid(), club_b, g_pub_b, 'pub-pb-1', 1);

  insert into standards (organization_id, number, title, description, sort, status) values
    (club_a, 1, 'Standard 1 de A', 'Descripción del Standard 1 de A.', 1, 'published'),
    (club_a, 2, 'Standard 2 de A', 'Descripción del Standard 2 de A.', 2, 'draft'),
    (club_b, 1, 'Standard 1 de B', 'Descripción del Standard 1 de B.', 1, 'published');

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.coach_a', u_coach_a::text, true);
  perform set_config('fx.admin_b', u_admin_b::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.multi', u_multi::text, true);
  perform set_config('fx.both', u_both::text, true);
  perform set_config('fx.sin_club', u_sin_club::text, true);
  perform set_config('fx.g_pub', g_pub::text, true);
  perform set_config('fx.g_draft', g_draft::text, true);
  perform set_config('fx.g_pub_b', g_pub_b::text, true);
  perform set_config('fx.pt_pub_1', pt_pub_1::text, true);
end
$$;

-- ── coachA: lee lo publicado de su club ──────────────────────────────────────────────
-- Cada conjunto es exacto: lo que coachA ve y, a la vez, que no ve nada más (ni los
-- borradores de A ni nada de B).
select tests.authenticate_as(current_setting('fx.coach_a')::uuid);

select results_eq(
  'select slug from way_sections order by sort',
  $$values ('pub-a')$$,
  'coachA ve las secciones publicadas de su club y no las de B ni los borradores'
);

select results_eq(
  'select code from club_values order by sort',
  $$values ('VALOR-PUB')$$,
  'coachA ve los valores publicados de su club y no los de B ni los borradores'
);

select results_eq(
  'select slug from game_principles order by sort',
  $$values ('pub-p')$$,
  'coachA ve los principios publicados de su club y no los de B ni los borradores'
);

select results_eq(
  'select text from principle_points order by text',
  $$values ('pub-p-1'), ('pub-p-2')$$,
  'coachA ve los puntos de los principios publicados y no los de B ni los de borradores'
);

select results_eq(
  'select number::int from standards order by number',
  $$values (1)$$,
  'coachA ve los Standards publicados de su club y no los de B ni los borradores'
);

-- ── coachA: un borrador no se ve aunque se pida (Review Focus 2) ─────────────────────
-- Las filas existen: son las que ve adminA más abajo.
select is_empty(
  $$select 1 from way_sections where slug = 'draft-a'$$,
  'coachA no ve una sección en borrador aunque la pida por su slug'
);

select is_empty(
  $$select 1 from principle_points where principle_id = current_setting('fx.g_draft')::uuid$$,
  'coachA no ve los puntos de un principio en borrador aunque los pida por su principio'
);

select is_empty(
  $$select 'valor' from club_values where code = 'VALOR-BORRADOR'
    union all
    select 'principio' from game_principles where slug = 'draft-p'
    union all
    select 'standard' from standards where number = 2$$,
  'coachA no ve un valor, un principio ni un Standard en borrador aunque los pida por su clave'
);

-- ── coachA: no escribe ───────────────────────────────────────────────────────────────
-- Tiene privilegio de escritura sobre las tablas (lo necesita el admin) pero ninguna
-- política se lo abre: el insert lo rechaza el `with check`, y el update y el delete no
-- encuentran filas sobre las que actuar.
select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 9, 'coach-a', 'Sección de coachA')$$,
  '42501', null,
  'coachA no crea secciones'
);

select throws_ok(
  $$insert into club_values (organization_id, code, description)
    values (current_setting('fx.club_a')::uuid, 'VALOR-COACH', 'Valor de coachA.')$$,
  '42501', null,
  'coachA no crea valores'
);

select throws_ok(
  $$insert into game_principles (organization_id, slug, title)
    values (current_setting('fx.club_a')::uuid, 'coach-p', 'Principio de coachA')$$,
  '42501', null,
  'coachA no crea principios'
);

select throws_ok(
  $$insert into standards (organization_id, number, title, description)
    values (current_setting('fx.club_a')::uuid, 9, 'Standard de coachA', 'Descripción.')$$,
  '42501', null,
  'coachA no crea Standards'
);

select throws_ok(
  $$insert into principle_points (organization_id, principle_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.g_pub')::uuid, 'coach-a', 9)$$,
  '42501', null,
  'coachA no añade puntos a un principio'
);

select results_eq(
  $$with
      s as (update way_sections set title = 'editado', sort = 5, status = 'draft'
            where slug = 'pub-a' returning 1),
      v as (update club_values set description = 'editado' where code = 'VALOR-PUB' returning 1),
      g as (update game_principles set title = 'editado' where slug = 'pub-p' returning 1),
      d as (update standards set title = 'editado' where number = 1 returning 1),
      p as (update principle_points set text = 'editado' where text = 'pub-p-1' returning 1)
    select (select count(*) from s)::int, (select count(*) from v)::int,
           (select count(*) from g)::int, (select count(*) from d)::int,
           (select count(*) from p)::int$$,
  $$values (0, 0, 0, 0, 0)$$,
  'coachA no modifica ninguna fila de las cinco tablas: ni siquiera para publicar o despublicar'
);

select results_eq(
  $$with p as (delete from principle_points
               where id = current_setting('fx.pt_pub_1')::uuid returning 1)
    select count(*)::int from p$$,
  array[0],
  'coachA no borra puntos'
);

-- ── coachB: el aislamiento vale en los dos sentidos ──────────────────────────────────
select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select results_eq(
  'select slug from way_sections',
  $$values ('pub-b')$$,
  'coachB no ve nada de A: secciones'
);

select results_eq(
  'select code from club_values',
  $$values ('VALOR-B')$$,
  'coachB no ve nada de A: valores'
);

select results_eq(
  'select slug from game_principles',
  $$values ('pub-pb')$$,
  'coachB no ve nada de A: principios'
);

select results_eq(
  'select text from principle_points',
  $$values ('pub-pb-1')$$,
  'coachB no ve nada de A: puntos'
);

select results_eq(
  'select title from standards',
  $$values ('Standard 1 de B')$$,
  'coachB no ve nada de A: Standards'
);

-- ── adminA: todo su club, borradores incluidos, y nada de B ──────────────────────────
-- Es admin del club: lo es sin depender de ningún equipo ni persona.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  'select slug from way_sections order by sort',
  $$values ('pub-a'), ('draft-a')$$,
  'adminA ve las secciones de A, borradores incluidos, y ninguna de B'
);

select results_eq(
  'select code from club_values order by sort',
  $$values ('VALOR-PUB'), ('VALOR-BORRADOR')$$,
  'adminA ve los valores de A, borradores incluidos, y ninguno de B'
);

select results_eq(
  'select slug from game_principles order by sort',
  $$values ('pub-p'), ('draft-p')$$,
  'adminA ve los principios de A, borradores incluidos, y ninguno de B'
);

select results_eq(
  'select text from principle_points order by text',
  $$values ('draft-p-1'), ('pub-p-1'), ('pub-p-2')$$,
  'adminA ve los puntos de A, también los de un principio en borrador, y ninguno de B'
);

select results_eq(
  'select number::int from standards order by number',
  $$values (1), (2)$$,
  'adminA ve los Standards de A, borradores incluidos, y ninguno de B'
);

-- ── adminB: admin de su club, sin ningún poder sobre A (Review Focus 3) ──────────────
select tests.authenticate_as(current_setting('fx.admin_b')::uuid);

-- Control positivo: adminB lee lo de B. Lo de A, borradores incluidos, no lo ve: ser admin
-- de un club no abre el otro.
select results_eq(
  'select slug from way_sections',
  $$values ('pub-b')$$,
  'adminB ve las secciones de B'
);

select is_empty(
  $$select 1 from way_sections where organization_id = current_setting('fx.club_a')::uuid
    union all
    select 1 from club_values where organization_id = current_setting('fx.club_a')::uuid
    union all
    select 1 from game_principles where organization_id = current_setting('fx.club_a')::uuid
    union all
    select 1 from principle_points where organization_id = current_setting('fx.club_a')::uuid
    union all
    select 1 from standards where organization_id = current_setting('fx.club_a')::uuid$$,
  'adminB no ve nada de A en las cinco tablas, borradores incluidos'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 9, 'de-b-en-a', 'Sección de adminB en A')$$,
  '42501', null,
  'adminB no crea secciones en A'
);

select throws_ok(
  $$insert into club_values (organization_id, code, description)
    values (current_setting('fx.club_a')::uuid, 'VALOR-DE-B', 'Valor de adminB en A.')$$,
  '42501', null,
  'adminB no crea valores en A'
);

select throws_ok(
  $$insert into game_principles (organization_id, slug, title)
    values (current_setting('fx.club_a')::uuid, 'de-b-en-a', 'Principio de adminB en A')$$,
  '42501', null,
  'adminB no crea principios en A'
);

select throws_ok(
  $$insert into standards (organization_id, number, title, description)
    values (current_setting('fx.club_a')::uuid, 9, 'Standard de adminB en A', 'Descripción.')$$,
  '42501', null,
  'adminB no crea Standards en A'
);

select throws_ok(
  $$insert into principle_points (organization_id, principle_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.g_pub')::uuid, 'de-b-en-a', 9)$$,
  '42501', null,
  'adminB no añade puntos a un principio de A'
);

-- Con el `organization_id` de B la política deja pasar al admin; lo que frena el punto es
-- la clave foránea compuesta: el principio es de A.
select throws_ok(
  $$insert into principle_points (organization_id, principle_id, text, sort)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.g_pub')::uuid, 'de-b-en-a', 9)$$,
  '23503', null,
  'adminB no cuelga de un principio de A un punto de B'
);

select results_eq(
  $$with
      s as (update way_sections set title = 'editado' where slug = 'pub-a' returning 1),
      v as (update club_values set description = 'editado'
            where organization_id = current_setting('fx.club_a')::uuid returning 1),
      g as (update game_principles set title = 'editado'
            where organization_id = current_setting('fx.club_a')::uuid returning 1),
      d as (update standards set title = 'editado'
            where organization_id = current_setting('fx.club_a')::uuid returning 1),
      p as (update principle_points set text = 'editado'
            where organization_id = current_setting('fx.club_a')::uuid returning 1)
    select (select count(*) from s)::int, (select count(*) from v)::int,
           (select count(*) from g)::int, (select count(*) from d)::int,
           (select count(*) from p)::int$$,
  $$values (0, 0, 0, 0, 0)$$,
  'adminB no modifica ninguna fila de A'
);

select results_eq(
  $$with p as (delete from principle_points
               where id = current_setting('fx.pt_pub_1')::uuid returning 1)
    select count(*)::int from p$$,
  array[0],
  'adminB no borra un punto de A'
);

-- ── multi: admin de A y solo entrenador de B ─────────────────────────────────────────
-- Cada club se resuelve con su propia membresía: ser admin de A no da poder en B, y ser
-- miembro de B no deja llevar allí lo de A.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select results_eq(
  'select slug from way_sections order by slug',
  $$values ('draft-a'), ('pub-a'), ('pub-b')$$,
  'multi ve todo A, por ser admin, y lo publicado de B, por ser miembro'
);

-- Las filas publicadas siguen siendo visibles para multi en B, que es miembro: lo que
-- frena el cambio de club es el `with check` de la política de update, que pide ser admin
-- del club de destino.
select throws_ok(
  $$update way_sections set organization_id = current_setting('fx.club_b')::uuid
    where slug = 'pub-a'$$,
  '42501', null,
  'multi no pasa una sección de A, donde es admin, a B, donde no lo es'
);

select throws_ok(
  $$update club_values set organization_id = current_setting('fx.club_b')::uuid
    where code = 'VALOR-PUB'$$,
  '42501', null,
  'multi no pasa un valor de A a B'
);

select throws_ok(
  $$update game_principles set organization_id = current_setting('fx.club_b')::uuid
    where slug = 'pub-p'$$,
  '42501', null,
  'multi no pasa un principio de A a B'
);

select throws_ok(
  $$update standards set organization_id = current_setting('fx.club_b')::uuid
    where organization_id = current_setting('fx.club_a')::uuid and number = 1$$,
  '42501', null,
  'multi no pasa un Standard de A a B'
);

-- ── ambos: admin de A y de B ─────────────────────────────────────────────────────────
-- El caso que ninguna política cierra: quien administra los dos clubes pasa el `using` por
-- A y el `with check` por B. Lo cierran los privilegios por columna: `authenticated` no
-- puede cambiar `organization_id` de ninguna fila, sea quien sea. Tampoco el slug, que es la
-- dirección de la sección y el ancla del principio.
select tests.authenticate_as(current_setting('fx.both')::uuid);

select results_eq(
  $$with edited as (
      update way_sections set title = title where slug in ('pub-a', 'pub-b') returning 1
    )
    select count(*)::int from edited$$,
  array[2],
  'control: quien administra A y B edita secciones de los dos clubes'
);

select throws_ok(
  $$update way_sections set organization_id = current_setting('fx.club_b')::uuid
    where slug = 'draft-a'$$,
  '42501', null,
  'ni quien administra los dos clubes pasa una sección de A a B'
);

select throws_ok(
  $$update club_values set organization_id = current_setting('fx.club_b')::uuid
    where code = 'VALOR-PUB'$$,
  '42501', null,
  'ni quien administra los dos clubes pasa un valor de A a B'
);

select throws_ok(
  $$update game_principles set organization_id = current_setting('fx.club_b')::uuid
    where slug = 'pub-p'$$,
  '42501', null,
  'ni quien administra los dos clubes pasa un principio de A a B'
);

select throws_ok(
  $$update principle_points set organization_id = current_setting('fx.club_b')::uuid
    where id = current_setting('fx.pt_pub_1')::uuid$$,
  '42501', null,
  'ni quien administra los dos clubes pasa un punto de A a B'
);

-- El Standard 2: B no tiene ese número, así que no es el único de la tabla lo que lo frena.
select throws_ok(
  $$update standards set organization_id = current_setting('fx.club_b')::uuid
    where organization_id = current_setting('fx.club_a')::uuid and number = 2$$,
  '42501', null,
  'ni quien administra los dos clubes pasa un Standard de A a B'
);

select throws_ok(
  $$update way_sections set slug = 'otra-direccion' where slug = 'pub-a'$$,
  '42501', null,
  'el slug de una sección no se cambia'
);

select throws_ok(
  $$update game_principles set slug = 'otra-ancla' where slug = 'pub-p'$$,
  '42501', null,
  'el slug de un principio no se cambia'
);

-- ── sinClub: con sesión pero sin membresía ───────────────────────────────────────────
-- Control positivo: las filas existen; son las que ven los usuarios de arriba.
select tests.authenticate_as(current_setting('fx.sin_club')::uuid);

select is_empty(
  $$select 'way_sections' from way_sections
    union all select 'club_values' from club_values
    union all select 'game_principles' from game_principles
    union all select 'principle_points' from principle_points
    union all select 'standards' from standards$$,
  'sin membresía no ve nada en las cinco tablas'
);

-- ── anon: sin privilegios sobre ninguna tabla ────────────────────────────────────────
select tests.clear_authentication();

select throws_ok('select * from way_sections', '42501', null, 'anon no tiene acceso a las secciones');
select throws_ok('select * from club_values', '42501', null, 'anon no tiene acceso a los valores');
select throws_ok('select * from game_principles', '42501', null, 'anon no tiene acceso a los principios');
select throws_ok('select * from principle_points', '42501', null, 'anon no tiene acceso a los puntos');
select throws_ok('select * from standards', '42501', null, 'anon no tiene acceso a los Standards');

-- ── Solo cuentan las membresías activas ──────────────────────────────────────────────
-- Control positivo: es el mismo coachA que arriba veía lo publicado de A.
reset role;
update memberships set status = 'revoked' where user_id = current_setting('fx.coach_a')::uuid;
select tests.authenticate_as(current_setting('fx.coach_a')::uuid);

select is_empty(
  $$select 'way_sections' from way_sections
    union all select 'club_values' from club_values
    union all select 'game_principles' from game_principles
    union all select 'principle_points' from principle_points
    union all select 'standards' from standards$$,
  'una membresía revocada no ve nada en las cinco tablas'
);

-- ── adminA: escribe en su club ───────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select lives_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 3, 'nueva-a', 'Sección nueva de A')$$,
  'adminA crea una sección'
);

select lives_ok(
  $$insert into club_values (organization_id, code, description)
    values (current_setting('fx.club_a')::uuid, 'VALOR-NUEVO', 'Descripción del valor nuevo.')$$,
  'adminA crea un valor'
);

select lives_ok(
  $$insert into game_principles (organization_id, slug, title)
    values (current_setting('fx.club_a')::uuid, 'nuevo-p', 'Principio nuevo')$$,
  'adminA crea un principio'
);

select lives_ok(
  $$insert into standards (organization_id, number, title, description)
    values (current_setting('fx.club_a')::uuid, 3, 'Standard 3 de A', 'Descripción del Standard 3.')$$,
  'adminA crea un Standard'
);

select lives_ok(
  $$insert into principle_points (organization_id, principle_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.g_draft')::uuid, 'draft-p-2', 2)$$,
  'adminA añade un punto a un principio en borrador'
);

-- Lo que no se indica lo pone la base de datos: una sección nace en borrador, de texto, sin
-- cuerpo y con quien la creó en `updated_by` (la sesión, a través de `auth.uid()`).
select results_eq(
  $$select content_kind, body_md, status::text, sort, updated_by
    from way_sections where slug = 'nueva-a'$$,
  $$values ('text', '', 'draft', 0, current_setting('fx.admin_a')::uuid)$$,
  'una sección nueva nace en borrador, de texto, vacía y con su autor en updated_by'
);

select results_eq(
  $$select status::text, sort from club_values where code = 'VALOR-NUEVO'
    union all select status::text, sort from game_principles where slug = 'nuevo-p'
    union all select status::text, sort from standards where number = 3$$,
  $$values ('draft', 0), ('draft', 0), ('draft', 0)$$,
  'un valor, un principio y un Standard nuevos nacen en borrador y con sort 0'
);

select results_eq(
  $$with
      s as (update way_sections set title = 'editado', sort = 5, status = 'draft'
            where slug = 'pub-a' returning 1),
      v as (update club_values set description = 'editado' where code = 'VALOR-PUB' returning 1),
      g as (update game_principles set title = 'editado' where slug = 'pub-p' returning 1),
      d as (update standards set title = 'editado' where number = 1 returning 1),
      p as (update principle_points set text = 'editado' where text = 'pub-p-1' returning 1)
    select (select count(*) from s)::int, (select count(*) from v)::int,
           (select count(*) from g)::int, (select count(*) from d)::int,
           (select count(*) from p)::int$$,
  $$values (1, 1, 1, 1, 1)$$,
  'adminA modifica una fila de cada tabla de su club'
);

-- Sin trigger de `updated_at` en `way_sections`: reordenar o cambiar `status` no invalida
-- la copia de quien edita. Solo `update_way_section` lo cambia.
select results_eq(
  $$select updated_at from way_sections where slug = 'pub-a'$$,
  $$values ('2000-01-01T00:00:00Z'::timestamptz)$$,
  'cambiar título, orden o estado de una sección no toca updated_at'
);

-- ── adminA: no saca una fila de su club ──────────────────────────────────────────────
-- Pasa el `using` (la fila es de A), pero la fila nueva sería de B, donde adminA no es
-- admin ni miembro: la rechaza el `with check` (y la política de lectura, que tampoco le
-- deja ver filas de B). Donde solo frena el `with check` es el caso de multi, más arriba.
select throws_ok(
  $$update way_sections set organization_id = current_setting('fx.club_b')::uuid
    where slug = 'pub-a'$$,
  '42501', null,
  'adminA no pasa una sección a B'
);

select throws_ok(
  $$update club_values set organization_id = current_setting('fx.club_b')::uuid
    where code = 'VALOR-PUB'$$,
  '42501', null,
  'adminA no pasa un valor a B'
);

select throws_ok(
  $$update game_principles set organization_id = current_setting('fx.club_b')::uuid
    where slug = 'pub-p'$$,
  '42501', null,
  'adminA no pasa un principio a B'
);

select throws_ok(
  $$update standards set organization_id = current_setting('fx.club_b')::uuid
    where number = 1$$,
  '42501', null,
  'adminA no pasa un Standard a B'
);

select throws_ok(
  $$update principle_points set organization_id = current_setting('fx.club_b')::uuid
    where id = current_setting('fx.pt_pub_1')::uuid$$,
  '42501', null,
  'adminA no pasa un punto a B'
);

-- ── adminA: nadie borra contenido ────────────────────────────────────────────────────
-- Archivar es pasar a borrador. Solo hay política `delete` en los puntos: en las otras
-- cuatro tablas el `delete` no encuentra filas sobre las que actuar.
select results_eq(
  $$with
      s as (delete from way_sections where slug = 'pub-a' returning 1),
      v as (delete from club_values where code = 'VALOR-PUB' returning 1),
      g as (delete from game_principles where slug = 'pub-p' returning 1),
      d as (delete from standards where number = 1 returning 1)
    select (select count(*) from s)::int, (select count(*) from v)::int,
           (select count(*) from g)::int, (select count(*) from d)::int$$,
  $$values (0, 0, 0, 0)$$,
  'ni el admin borra secciones, valores, principios ni Standards'
);

select results_eq(
  $$with p as (delete from principle_points
               where id = current_setting('fx.pt_pub_1')::uuid returning 1)
    select count(*)::int from p$$,
  array[1],
  'el admin borra un punto de un principio'
);

-- ── Restricciones (como postgres) ────────────────────────────────────────────────────
reset role;

-- way_sections
select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 9, 'standards', 'Slug reservado')$$,
  '23514', null,
  'el slug standards está reservado en las secciones'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 9, 'Mal Slug', 'Slug con formato inválido')$$,
  '23514', null,
  'slug de sección con formato inválido rechazado'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 9, repeat('a', 61), 'Slug de 61 caracteres')$$,
  '23514', null,
  'slug de sección de 61 caracteres rechazado'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 100, 'numero-100', 'Número fuera de rango')$$,
  '23514', null,
  'número de sección 100 rechazado'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 9, 'titulo-vacio', '')$$,
  '23514', null,
  'título de sección vacío rechazado'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 9, 'titulo-largo', repeat('a', 81))$$,
  '23514', null,
  'título de sección de 81 caracteres rechazado'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title, summary)
    values (current_setting('fx.club_a')::uuid, 9, 'resumen-largo', 'Resumen largo', repeat('a', 201))$$,
  '23514', null,
  'resumen de sección de 201 caracteres rechazado'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title, body_md)
    values (current_setting('fx.club_a')::uuid, 9, 'cuerpo-largo', 'Cuerpo largo', repeat('x', 20001))$$,
  '23514', null,
  'cuerpo de sección de 20001 caracteres rechazado'
);

select lives_ok(
  $$insert into way_sections (organization_id, number, slug, title, body_md)
    values (current_setting('fx.club_a')::uuid, 9, 'cuerpo-limite', 'Cuerpo límite', repeat('x', 20000))$$,
  'cuerpo de sección de 20000 caracteres aceptado'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title, content_kind)
    values (current_setting('fx.club_a')::uuid, 9, 'tipo-raro', 'Tipo raro', 'otro')$$,
  '23514', null,
  'tipo de contenido desconocido rechazado'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title, status)
    values (current_setting('fx.club_a')::uuid, 9, 'estado-raro', 'Estado raro', 'archived')$$,
  '22P02', null,
  'estado desconocido rechazado: solo draft o published'
);

select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 9, 'pub-a', 'Slug repetido en A')$$,
  '23505', null,
  'slug de sección único por club'
);

-- Control positivo: el slug es único por club, no global. `pub-a` ya está en A y entra
-- también en B.
select lives_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_b')::uuid, 2, 'pub-a', 'Mismo slug, otro club')$$,
  'el mismo slug de sección vale en otro club'
);

-- El número de una sección es su posición: único por club (B tiene también su sección 1 y
-- su sección 2, de las fixtures y del control de arriba).
select throws_ok(
  $$insert into way_sections (organization_id, number, slug, title)
    values (current_setting('fx.club_a')::uuid, 1, 'numero-repetido', 'Número repetido en A')$$,
  '23505', null,
  'número de sección único por club'
);

-- El único es diferible: se comprueba al acabar la sentencia, no fila a fila. Es lo que
-- deja a `reorder_methodology` renumerar todas las secciones de golpe.
select results_eq(
  $$with swapped as (
      update way_sections set number = 3 - number
      where organization_id = current_setting('fx.club_a')::uuid and number in (1, 2)
      returning 1
    )
    select count(*)::int from swapped$$,
  array[2],
  'dos secciones intercambian su número en una sola sentencia'
);

-- club_values
select throws_ok(
  $$insert into club_values (organization_id, code, description)
    values (current_setting('fx.club_a')::uuid, '', 'Código vacío.')$$,
  '23514', null,
  'código de valor vacío rechazado'
);

select throws_ok(
  $$insert into club_values (organization_id, code, description)
    values (current_setting('fx.club_a')::uuid, repeat('A', 41), 'Código de 41 caracteres.')$$,
  '23514', null,
  'código de valor de 41 caracteres rechazado'
);

select throws_ok(
  $$insert into club_values (organization_id, code, title, description)
    values (current_setting('fx.club_a')::uuid, 'TITULO-LARGO', repeat('a', 81), 'Título de 81.')$$,
  '23514', null,
  'título de valor de 81 caracteres rechazado'
);

select throws_ok(
  $$insert into club_values (organization_id, code, description)
    values (current_setting('fx.club_a')::uuid, 'SIN-TEXTO', '')$$,
  '23514', null,
  'descripción de valor vacía rechazada'
);

select throws_ok(
  $$insert into club_values (organization_id, code, description)
    values (current_setting('fx.club_a')::uuid, 'MUY-LARGO', repeat('a', 501))$$,
  '23514', null,
  'descripción de valor de 501 caracteres rechazada'
);

-- game_principles
select throws_ok(
  $$insert into game_principles (organization_id, slug, title)
    values (current_setting('fx.club_a')::uuid, 'Mal_Slug', 'Slug con formato inválido')$$,
  '23514', null,
  'slug de principio con formato inválido rechazado'
);

select throws_ok(
  $$insert into game_principles (organization_id, slug, title)
    values (current_setting('fx.club_a')::uuid, 'pub-p', 'Slug repetido en A')$$,
  '23505', null,
  'slug de principio único por club'
);

-- La reserva de `standards` es de las secciones: la ruta `/way/standards` solo choca con
-- ellas. Un principio puede llamarse así.
select lives_ok(
  $$insert into game_principles (organization_id, slug, title)
    values (current_setting('fx.club_a')::uuid, 'standards', 'Principio con el slug reservado en secciones')$$,
  'el slug standards no está reservado en los principios'
);

select throws_ok(
  $$insert into game_principles (organization_id, slug, title)
    values (current_setting('fx.club_a')::uuid, 'titulo-vacio', '')$$,
  '23514', null,
  'título de principio vacío rechazado'
);

select throws_ok(
  $$insert into game_principles (organization_id, slug, title, summary)
    values (current_setting('fx.club_a')::uuid, 'resumen-largo', 'Resumen largo', repeat('a', 301))$$,
  '23514', null,
  'resumen de principio de 301 caracteres rechazado'
);

-- standards
-- Control positivo: B tiene su propio Standard 1 (fixtures); el número es único por club.
select throws_ok(
  $$insert into standards (organization_id, number, title, description)
    values (current_setting('fx.club_a')::uuid, 1, 'Standard 1 repetido', 'Descripción.')$$,
  '23505', null,
  'número de Standard único por club'
);

select throws_ok(
  $$insert into standards (organization_id, number, title, description)
    values (current_setting('fx.club_a')::uuid, 0, 'Número fuera de rango', 'Descripción.')$$,
  '23514', null,
  'número de Standard 0 rechazado'
);

select throws_ok(
  $$insert into standards (organization_id, number, title, description)
    values (current_setting('fx.club_a')::uuid, 9, '', 'Descripción.')$$,
  '23514', null,
  'título de Standard vacío rechazado'
);

select throws_ok(
  $$insert into standards (organization_id, number, title, description)
    values (current_setting('fx.club_a')::uuid, 9, 'Descripción larga', repeat('a', 501))$$,
  '23514', null,
  'descripción de Standard de 501 caracteres rechazada'
);

-- También aquí el único es diferible: el seed devuelve su número a todos sus Standards en
-- una sola sentencia, aunque dirección los haya intercambiado.
select results_eq(
  $$with swapped as (
      update standards set number = 3 - number
      where organization_id = current_setting('fx.club_a')::uuid and number in (1, 2)
      returning 1
    )
    select count(*)::int from swapped$$,
  array[2],
  'dos Standards intercambian su número en una sola sentencia'
);

-- principle_points
select throws_ok(
  $$insert into principle_points (organization_id, principle_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.g_draft')::uuid, repeat('a', 201), 9)$$,
  '23514', null,
  'punto de 201 caracteres rechazado'
);

select throws_ok(
  $$insert into principle_points (organization_id, principle_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.g_draft')::uuid, '', 9)$$,
  '23514', null,
  'punto vacío rechazado'
);

-- ── Claves foráneas compuestas y borrado en cascada (como postgres) ──────────────────
-- El principio es de B: decir que el punto es de A no basta para colgárselo.
select throws_ok(
  $$insert into principle_points (organization_id, principle_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.g_pub_b')::uuid, 'cruzado', 9)$$,
  '23503', null,
  'FK compuesta: un punto de A no entra en un principio de B'
);

-- Con el principio a null la clave foránea compuesta no se comprobaría: es obligatorio,
-- igual que `organization_id` en las cinco tablas.
select throws_ok(
  $$insert into principle_points (organization_id, principle_id, text, sort)
    values (current_setting('fx.club_a')::uuid, null, 'sin principio', 9)$$,
  '23502', null,
  'un punto sin principio se rechaza'
);

select results_eq(
  $$select count(*)::int
    from pg_attribute as a
    join pg_class as c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'way_sections', 'club_values', 'game_principles', 'principle_points', 'standards'
      )
      and a.attname = 'organization_id'
      and a.attnotnull$$,
  array[5],
  'organization_id es obligatorio en las cinco tablas'
);

-- Control positivo: `draft-p` tiene dos puntos (el de las fixtures y el de adminA).
select lives_ok(
  $$delete from game_principles where id = current_setting('fx.g_draft')::uuid$$,
  'un principio con puntos se puede borrar como postgres'
);

select is_empty(
  $$select 1 from principle_points where principle_id = current_setting('fx.g_draft')::uuid$$,
  'borrar un principio borra sus puntos'
);

-- Los miembros de B se borran antes: `memberships` no es en cascada.
select lives_ok(
  $$delete from memberships where organization_id = current_setting('fx.club_b')::uuid;
    delete from organizations where id = current_setting('fx.club_b')::uuid$$,
  'un club con metodología se puede borrar'
);

select is_empty(
  $$select 1 from way_sections where organization_id = current_setting('fx.club_b')::uuid
    union all
    select 1 from club_values where organization_id = current_setting('fx.club_b')::uuid
    union all
    select 1 from game_principles where organization_id = current_setting('fx.club_b')::uuid
    union all
    select 1 from principle_points where organization_id = current_setting('fx.club_b')::uuid
    union all
    select 1 from standards where organization_id = current_setting('fx.club_b')::uuid$$,
  'borrar un club borra su metodología en las cinco tablas'
);

-- ── Borrar a un usuario que guardó una sección ───────────────────────────────────────
-- `updated_by` apunta a `auth.users`. Sin `on delete set null`, borrar a quien guardó una
-- sección fallaba con 23503: la sección se queda y su autor pasa a null. Es lo último que
-- hace el test con adminA: al borrarlo se va también su membresía.
select results_eq(
  $$select updated_by from way_sections where slug = 'nueva-a'$$,
  $$values (current_setting('fx.admin_a')::uuid)$$,
  'control: adminA, que creó «nueva-a», figura como su autor'
);

select lives_ok(
  $$delete from auth.users where id = current_setting('fx.admin_a')::uuid$$,
  'borrar a un usuario que guardó una sección no falla'
);

select results_eq(
  $$select updated_by from way_sections where slug = 'nueva-a'$$,
  $$values (null::uuid)$$,
  'la sección se queda y su autor pasa a null'
);

-- ── Tipo e índices ───────────────────────────────────────────────────────────────────
select enum_has_labels(
  'public', 'content_status', array['draft', 'published'],
  'content_status es draft o published'
);

select has_index(
  'public'::name, 'way_sections'::name, 'way_sections_organization_id_sort_idx'::name,
  array['organization_id', 'sort']::name[],
  'way_sections tiene índice por club y orden'::text
);

select has_index(
  'public'::name, 'principle_points'::name, 'principle_points_principle_id_sort_idx'::name,
  array['principle_id', 'sort']::name[],
  'principle_points tiene índice por principio y orden'::text
);

select has_index(
  'public'::name, 'club_values'::name, 'club_values_organization_id_sort_idx'::name,
  array['organization_id', 'sort']::name[],
  'club_values tiene índice por club y orden'::text
);

-- La clave foránea compuesta de los puntos es `(organization_id, principle_id)`: sin un índice
-- que empiece por ahí, borrar o cambiar un principio recorre todos los puntos de todos los clubes.
select has_index(
  'public'::name, 'principle_points'::name, 'principle_points_organization_id_principle_id_idx'::name,
  array['organization_id', 'principle_id']::name[],
  'principle_points tiene índice por club y principio'::text
);

-- La spec (§9) pide índices por `organization_id`: cada tabla tiene alguno que empieza por esa
-- columna, sea el de una clave única o uno propio. (El nombre de tabla del catálogo lleva la
-- collation "C": se pasa a la de por defecto para compararlo con el array.)
select results_eq(
  $$select c.relname::text collate "default"
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'way_sections', 'club_values', 'game_principles', 'principle_points', 'standards'
      )
      and exists (
        select 1
        from pg_index as i
        where i.indrelid = c.oid
          and i.indkey[0] = (
            select a.attnum from pg_attribute as a
            where a.attrelid = c.oid and a.attname = 'organization_id'
          )
      )
    order by 1$$,
  array['club_values', 'game_principles', 'principle_points', 'standards', 'way_sections'],
  'las cinco tablas tienen un índice que empieza por organization_id'
);

-- ── RLS, privilegios y políticas de las cinco tablas ─────────────────────────────────
select results_eq(
  $$select count(*)::int from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in (
        'way_sections', 'club_values', 'game_principles', 'principle_points', 'standards'
      )
      and relrowsecurity$$,
  array[5],
  'RLS activado en las cinco tablas'
);

-- `maintain` existe como privilegio desde PostgreSQL 17.
select is_empty(
  $$select c.relname, p.privilege
    from pg_class as c
    cross join unnest(
      array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']
      || case when current_setting('server_version_num')::int >= 170000
           then array['maintain'] else array[]::text[] end
    ) as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'way_sections', 'club_values', 'game_principles', 'principle_points', 'standards'
      )
      and has_table_privilege('anon', c.oid, p.privilege)$$,
  'anon no tiene ningún privilegio sobre las tablas'
);

select is_empty(
  $$select c.relname, p.privilege
    from pg_class as c
    cross join unnest(
      array['truncate', 'references', 'trigger']
      || case when current_setting('server_version_num')::int >= 170000
           then array['maintain'] else array[]::text[] end
    ) as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'way_sections', 'club_values', 'game_principles', 'principle_points', 'standards'
      )
      and has_table_privilege('authenticated', c.oid, p.privilege)$$,
  'authenticated solo tiene select, insert, update y delete: lo demás no lo abre ninguna política'
);

select results_eq(
  $$select count(*)::int
    from pg_class as c
    cross join unnest(array['select', 'insert', 'delete']) as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'way_sections', 'club_values', 'game_principles', 'principle_points', 'standards'
      )
      and has_table_privilege('authenticated', c.oid, p.privilege)$$,
  array[15],
  'authenticated puede leer, crear y borrar en las cinco tablas, con RLS por delante'
);

-- `update` no se concede sobre la tabla entera sino columna a columna: solo lo que la app
-- cambia. Fuera quedan `organization_id` (una fila no cambia de club), `id`, `created_at`,
-- el slug y el principio de un punto. Una columna nueva no se puede cambiar hasta que una
-- migración la añada aquí.
select is_empty(
  $$select c.relname
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'way_sections', 'club_values', 'game_principles', 'principle_points', 'standards'
      )
      and has_table_privilege('authenticated', c.oid, 'update')$$,
  'authenticated no tiene update sobre ninguna de las cinco tablas enteras'
);

select results_eq(
  $$select c.relname::text collate "default",
           string_agg(a.attname::text, ', ' order by a.attname)::text collate "default"
    from pg_class as c
    join pg_attribute as a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'way_sections', 'club_values', 'game_principles', 'principle_points', 'standards'
      )
      and has_column_privilege('authenticated', c.oid, a.attnum, 'update')
    group by c.relname
    order by 1$$,
  $$values
    ('club_values', 'code, description, sort, status, title'),
    ('game_principles', 'sort, status, summary, title'),
    ('principle_points', 'sort, text'),
    ('standards', 'description, number, sort, status, title'),
    ('way_sections', 'body_md, content_kind, number, sort, status, summary, title, updated_at, updated_by')$$,
  'las columnas que authenticated puede cambiar en cada tabla, y ninguna más'
);

-- El seed y los scripts escriben con la clave de servicio (nunca desde src/).
select results_eq(
  $$select count(*)::int
    from pg_class as c
    cross join unnest(array['select', 'insert', 'update', 'delete']) as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'way_sections', 'club_values', 'game_principles', 'principle_points', 'standards'
      )
      and has_table_privilege('service_role', c.oid, p.privilege)$$,
  array[20],
  'service_role puede leer y escribir las cinco tablas'
);

-- Sin política no hay acceso: lectura, alta y cambio en las cinco tablas, y borrado solo
-- en los puntos; todas para `authenticated`. Las columnas de tipo `name` del catálogo
-- llevan la collation "C"; se pasan a la de por defecto para compararlas con `values`.
select results_eq(
  $$select tablename::text collate "default", policyname::text collate "default",
           cmd, roles::text[] collate "default", permissive
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'way_sections', 'club_values', 'game_principles', 'principle_points', 'standards'
      )
    order by 1, 2$$,
  $$values
    ('club_values', 'club_values_insert_admin', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('club_values', 'club_values_select_published_or_admin', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('club_values', 'club_values_update_admin', 'UPDATE', array['authenticated'], 'PERMISSIVE'),
    ('game_principles', 'game_principles_insert_admin', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('game_principles', 'game_principles_select_published_or_admin', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('game_principles', 'game_principles_update_admin', 'UPDATE', array['authenticated'], 'PERMISSIVE'),
    ('principle_points', 'principle_points_delete_admin', 'DELETE', array['authenticated'], 'PERMISSIVE'),
    ('principle_points', 'principle_points_insert_admin', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('principle_points', 'principle_points_select_published_or_admin', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('principle_points', 'principle_points_update_admin', 'UPDATE', array['authenticated'], 'PERMISSIVE'),
    ('standards', 'standards_insert_admin', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('standards', 'standards_select_published_or_admin', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('standards', 'standards_update_admin', 'UPDATE', array['authenticated'], 'PERMISSIVE'),
    ('way_sections', 'way_sections_insert_admin', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('way_sections', 'way_sections_select_published_or_admin', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('way_sections', 'way_sections_update_admin', 'UPDATE', array['authenticated'], 'PERMISSIVE')$$,
  'las políticas de las cinco tablas: leer, crear y editar, y borrar solo los puntos'
);

-- El número, único por club en las secciones y en los Standards. Diferible e inmediato: se
-- comprueba al final de cada sentencia, no al cerrar la transacción.
select results_eq(
  $$select conrelid::regclass::text collate "default", condeferrable, condeferred
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname in (
        'standards_organization_id_number_key', 'way_sections_organization_id_number_key'
      )
    order by 1$$,
  $$values ('standards', true, false), ('way_sections', true, false)$$,
  'el número es único por club y diferible en secciones y Standards'
);

select * from finish();

rollback;
