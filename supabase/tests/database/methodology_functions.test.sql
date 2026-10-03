-- Metodología: escrituras atómicas (`update_way_section`, `reorder_methodology` y
-- `save_game_principle`).
--
-- Las tres funciones son `security invoker`: RLS se aplica dentro de ellas. Este test fija
-- su contrato, que las Server Actions traducen por SQLSTATE y mensaje:
--   · `NOT_FOUND` (P0002): la fila no se ve o quien llama no es admin del club. Los dos casos
--     son indistinguibles, y un coach nunca recibe `STALE_COPY`;
--   · `STALE_COPY` (P0001): la copia que editaba quien guarda ya no es la última;
--   · `INVALID` (22023): entrada que la función rechaza antes de escribir; los checks de las
--     tablas dan 23514 y se dejan pasar tal cual.
-- Cuando una función falla no escribe nada: se comprueba con las filas intactas.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*`
-- vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al
-- final. Los datos son ficticios y solo de este test; los emails y los slugs de club no
-- chocan con los de `pnpm seed` ni con los de los otros tests. Las tablas y sus políticas las
-- prueba `methodology.test.sql`: aquí solo las funciones.
begin;

select plan(85);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A: adminA (admin) y coachA (coach).
--   Secciones:  `pub-a` (publicada, 1), `draft-a` (borrador, 2) y `s1`, `s2`, `s3`
--               (publicadas, 3, 4 y 5); `sort` y `number` coinciden con la posición. Todas
--               con updated_at en el año 2000; el de `draft-a` lleva además microsegundos,
--               para comprobar que la comparación de la copia es exacta.
--   Valores:    `VALOR-PUB` (1) y `VALOR-BORRADOR` (2).
--   Principios: `pub-p` (publicado, con los puntos `pub-p-1` y `pub-p-2`) y `draft-p`
--               (borrador, con el punto `draft-p-1`).
--   Standards:  1 (publicado) y 2 (borrador).
-- Club B: adminB (admin) y coachB (coach). Las secciones `pub-b` (publicada) y `draft-b`
--   (borrador), el valor `VALOR-B`, el principio `pub-pb` con el punto `pub-pb-1` y el
--   Standard 1.
-- `multi` es admin de A y solo entrenador de B. `sinClub` tiene cuenta y ninguna membresía.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@methodology-functions.pgtap.test');
  u_coach_a uuid := tests.create_user('coach-a@methodology-functions.pgtap.test');
  u_admin_b uuid := tests.create_user('admin-b@methodology-functions.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@methodology-functions.pgtap.test');
  u_multi uuid := tests.create_user('multi@methodology-functions.pgtap.test');
  u_sin_club uuid := tests.create_user('sin-club@methodology-functions.pgtap.test');

  sec_pub_a constant uuid := gen_random_uuid();
  sec_draft_a constant uuid := gen_random_uuid();
  sec_s1 constant uuid := gen_random_uuid();
  sec_s2 constant uuid := gen_random_uuid();
  sec_s3 constant uuid := gen_random_uuid();
  sec_pub_b constant uuid := gen_random_uuid();
  sec_draft_b constant uuid := gen_random_uuid();
  g_pub constant uuid := gen_random_uuid();
  g_draft constant uuid := gen_random_uuid();
  g_pub_b constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a-fn', 'Club A'),
    (club_b, 'club-b-fn', 'Club B');

  insert into memberships (organization_id, user_id, role) values
    (club_a, u_admin_a, 'admin'),
    (club_a, u_coach_a, 'coach'),
    (club_b, u_admin_b, 'admin'),
    (club_b, u_coach_b, 'coach'),
    (club_a, u_multi, 'admin'),
    (club_b, u_multi, 'coach');

  insert into way_sections (
    id, organization_id, number, slug, title, content_kind, status, sort, updated_at
  ) values
    (sec_pub_a, club_a, 1, 'pub-a', 'Sección publicada de A', 'text', 'published', 1, '2000-01-01T00:00:00Z'),
    (sec_draft_a, club_a, 2, 'draft-a', 'Sección en borrador de A', 'text', 'draft', 2, '2000-01-01T00:00:00.123456Z'),
    (sec_s1, club_a, 3, 's1', 'Sección s1 de A', 'text', 'published', 3, '2000-01-01T00:00:00Z'),
    (sec_s2, club_a, 4, 's2', 'Sección s2 de A', 'text', 'published', 4, '2000-01-01T00:00:00Z'),
    (sec_s3, club_a, 5, 's3', 'Sección s3 de A', 'text', 'published', 5, '2000-01-01T00:00:00Z'),
    (sec_pub_b, club_b, 1, 'pub-b', 'Sección publicada de B', 'text', 'published', 1, '2000-01-01T00:00:00Z'),
    (sec_draft_b, club_b, 2, 'draft-b', 'Sección en borrador de B', 'text', 'draft', 2, '2000-01-01T00:00:00Z');

  insert into club_values (organization_id, code, title, description, sort, status) values
    (club_a, 'VALOR-PUB', 'Valor publicado', 'Descripción del valor publicado.', 1, 'published'),
    (club_a, 'VALOR-BORRADOR', null, 'Descripción del valor en borrador.', 2, 'draft'),
    (club_b, 'VALOR-B', null, 'Descripción del valor de B.', 1, 'published');

  insert into game_principles (id, organization_id, slug, title, summary, sort, status) values
    (g_pub, club_a, 'pub-p', 'Principio publicado', 'Resumen del principio publicado.', 1, 'published'),
    (g_draft, club_a, 'draft-p', 'Principio en borrador', null, 2, 'draft'),
    (g_pub_b, club_b, 'pub-pb', 'Principio publicado de B', null, 1, 'published');

  insert into principle_points (organization_id, principle_id, text, sort) values
    (club_a, g_pub, 'pub-p-1', 1),
    (club_a, g_pub, 'pub-p-2', 2),
    (club_a, g_draft, 'draft-p-1', 1),
    (club_b, g_pub_b, 'pub-pb-1', 1);

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
  perform set_config('fx.sin_club', u_sin_club::text, true);
  perform set_config('fx.pub_a', sec_pub_a::text, true);
  perform set_config('fx.draft_a', sec_draft_a::text, true);
  perform set_config('fx.s1', sec_s1::text, true);
  perform set_config('fx.s2', sec_s2::text, true);
  perform set_config('fx.s3', sec_s3::text, true);
  perform set_config('fx.pub_b', sec_pub_b::text, true);
  perform set_config('fx.draft_b', sec_draft_b::text, true);
  perform set_config('fx.g_pub', g_pub::text, true);
  perform set_config('fx.g_draft', g_draft::text, true);
  perform set_config('fx.g_pub_b', g_pub_b::text, true);
  -- Todas las secciones de cada club, en un orden distinto del actual: `ways_a` pone `s3`
  -- el primero. Es la lista completa que acepta `reorder_methodology`.
  perform set_config(
    'fx.ways_a', array[sec_s3, sec_s1, sec_s2, sec_pub_a, sec_draft_a]::text, true
  );
end
$$;

-- ── coachA: ve lo publicado, pero no escribe (y nunca recibe STALE_COPY) ──────────────
-- Es miembro de A, así que `pub-a` le llega por RLS: aun así `NOT_FOUND`, porque no es admin.
select tests.authenticate_as(current_setting('fx.coach_a')::uuid);

select throws_ok(
  $$select public.update_way_section(
      current_setting('fx.pub_a')::uuid, '2000-01-01T00:00:00Z',
      'Título de coachA', null, 'text', 'Cuerpo de coachA')$$,
  'P0002', 'NOT_FOUND',
  'un coach no edita: ve la sección publicada y recibe NOT_FOUND'
);

select throws_ok(
  $$select public.update_way_section(
      current_setting('fx.pub_a')::uuid, '1999-01-01T00:00:00Z',
      'Título de coachA', null, 'text', 'Cuerpo de coachA')$$,
  'P0002', 'NOT_FOUND',
  'un coach con una copia obsoleta tampoco recibe STALE_COPY'
);

select throws_ok(
  $$select public.update_way_section(
      current_setting('fx.draft_a')::uuid, '2000-01-01T00:00:00.123456Z',
      'Título de coachA', null, 'text', 'Cuerpo de coachA')$$,
  'P0002', 'NOT_FOUND',
  'un coach recibe NOT_FOUND también con una sección en borrador, que ni ve'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections', current_setting('fx.ways_a')::uuid[])$$,
  'P0002', 'NOT_FOUND',
  'un coach no reordena las secciones de su club'
);

-- El tipo se valida antes que el permiso: no le dice nada a nadie y evita mirar el club.
select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'people', current_setting('fx.ways_a')::uuid[])$$,
  '22023', 'INVALID',
  'un tipo inválido da INVALID antes que NOT_FOUND'
);

select throws_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Principio de coachA', null, array['coach-a'])$$,
  'P0002', 'NOT_FOUND',
  'un coach no edita un principio publicado que sí ve'
);

select throws_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_draft')::uuid, 'Principio de coachA', null, array['coach-a'])$$,
  'P0002', 'NOT_FOUND',
  'un coach recibe NOT_FOUND con un principio en borrador, que no ve'
);

select throws_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Principio de coachA', null,
      array(select 'p' || g from generate_series(1, 13) as g))$$,
  'P0002', 'NOT_FOUND',
  'un coach con 13 puntos recibe NOT_FOUND antes que INVALID'
);

-- ── adminB no toca A (Review Focus 3) ────────────────────────────────────────────────
-- Es admin de B y de A no ve nada: las tres funciones le dan NOT_FOUND, no un error que
-- delate que la fila existe.
select tests.authenticate_as(current_setting('fx.admin_b')::uuid);

select throws_ok(
  $$select public.update_way_section(
      current_setting('fx.pub_a')::uuid, '2000-01-01T00:00:00Z',
      'Título de adminB', null, 'text', 'Cuerpo de adminB')$$,
  'P0002', 'NOT_FOUND',
  'adminB no edita una sección de A'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections', current_setting('fx.ways_a')::uuid[])$$,
  'P0002', 'NOT_FOUND',
  'adminB no reordena las secciones de A, ni con la lista completa de A'
);

select throws_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Principio de adminB', null, array['admin-b'])$$,
  'P0002', 'NOT_FOUND',
  'adminB no edita un principio de A'
);

-- ── multi: admin de A y solo entrenador de B ─────────────────────────────────────────
-- En B es miembro y ve lo publicado, pero no es admin: NOT_FOUND, como un coach.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select throws_ok(
  $$select public.update_way_section(
      current_setting('fx.pub_b')::uuid, '2000-01-01T00:00:00Z',
      'Título de multi', null, 'text', 'Cuerpo de multi')$$,
  'P0002', 'NOT_FOUND',
  'multi no edita una sección de B, donde solo es entrenador'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_b')::uuid, 'way_sections',
      array[current_setting('fx.draft_b')::uuid, current_setting('fx.pub_b')::uuid])$$,
  'P0002', 'NOT_FOUND',
  'multi no reordena las secciones de B'
);

select throws_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub_b')::uuid, 'Principio de multi', null, array['multi'])$$,
  'P0002', 'NOT_FOUND',
  'multi no edita un principio de B'
);

-- ── sinClub: con sesión pero sin membresía ───────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.sin_club')::uuid);

select throws_ok(
  $$select public.update_way_section(
      current_setting('fx.pub_a')::uuid, '2000-01-01T00:00:00Z',
      'Título de sinClub', null, 'text', 'Cuerpo de sinClub')$$,
  'P0002', 'NOT_FOUND',
  'sin membresía no edita una sección'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections', current_setting('fx.ways_a')::uuid[])$$,
  'P0002', 'NOT_FOUND',
  'sin membresía no reordena'
);

select throws_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Principio de sinClub', null, array['sin-club'])$$,
  'P0002', 'NOT_FOUND',
  'sin membresía no edita un principio'
);

-- ── anon: las funciones no se le ofrecen ─────────────────────────────────────────────
select tests.clear_authentication();

select throws_ok(
  $$select public.update_way_section(
      current_setting('fx.pub_a')::uuid, '2000-01-01T00:00:00Z', 'Título', null, 'text', '')$$,
  '42501', null,
  'anon no ejecuta update_way_section'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections', current_setting('fx.ways_a')::uuid[])$$,
  '42501', null,
  'anon no ejecuta reorder_methodology'
);

select throws_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Principio', null, array['anon'])$$,
  '42501', null,
  'anon no ejecuta save_game_principle'
);

-- ── Ningún intento anterior escribió nada (como postgres) ────────────────────────────
-- Lo de A sigue como en las fixtures: números, orden, títulos, updated_at y puntos.
reset role;

select results_eq(
  $$select slug, title, number::int, sort, updated_at
    from way_sections where organization_id = current_setting('fx.club_a')::uuid
    order by sort$$,
  $$values
    ('pub-a', 'Sección publicada de A', 1, 1, '2000-01-01T00:00:00Z'::timestamptz),
    ('draft-a', 'Sección en borrador de A', 2, 2, '2000-01-01T00:00:00.123456Z'::timestamptz),
    ('s1', 'Sección s1 de A', 3, 3, '2000-01-01T00:00:00Z'::timestamptz),
    ('s2', 'Sección s2 de A', 4, 4, '2000-01-01T00:00:00Z'::timestamptz),
    ('s3', 'Sección s3 de A', 5, 5, '2000-01-01T00:00:00Z'::timestamptz)$$,
  'los intentos rechazados no cambiaron ninguna sección de A'
);

select results_eq(
  $$select gp.slug, gp.title, gp.summary,
           (select string_agg(pp.text, ',' order by pp.sort)
            from principle_points as pp where pp.principle_id = gp.id)
    from game_principles as gp
    where gp.organization_id = current_setting('fx.club_a')::uuid
    order by gp.sort$$,
  $$values
    ('pub-p', 'Principio publicado', 'Resumen del principio publicado.', 'pub-p-1,pub-p-2'),
    ('draft-p', 'Principio en borrador', null, 'draft-p-1')$$,
  'los intentos rechazados no cambiaron ningún principio de A ni sus puntos'
);

-- ── adminA: update_way_section ───────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

do $do$
begin
  perform set_config(
    'fx.ret1',
    public.update_way_section(
      current_setting('fx.s1')::uuid, '2000-01-01T00:00:00Z',
      'Título nuevo', 'Resumen nuevo', 'values', 'Cuerpo nuevo'
    )::text,
    true
  );
end
$do$;

select cmp_ok(
  current_setting('fx.ret1')::timestamptz, '>', '2000-01-01T00:00:00Z'::timestamptz,
  'guardar devuelve un updated_at mayor'
);

select is(
  current_setting('fx.ret1')::timestamptz,
  (select updated_at from way_sections where id = current_setting('fx.s1')::uuid),
  'el updated_at devuelto es el que queda guardado'
);

select results_eq(
  $$select title, summary, content_kind, body_md, updated_by
    from way_sections where id = current_setting('fx.s1')::uuid$$,
  $$values ('Título nuevo', 'Resumen nuevo', 'values', 'Cuerpo nuevo', current_setting('fx.admin_a')::uuid)$$,
  'guardar cambia título, resumen, tipo y cuerpo, y deja a quien guardó en updated_by'
);

select results_eq(
  $$select slug, number::int, sort, status::text, organization_id
    from way_sections where id = current_setting('fx.s1')::uuid$$,
  $$values ('s1', 3, 3, 'published', current_setting('fx.club_a')::uuid)$$,
  'guardar no toca el slug, el número, el orden, el estado ni el club'
);

-- Control positivo: con la copia al día (el updated_at que devolvió el guardado anterior)
-- se vuelve a guardar. El resumen es opcional y llega como null.
select lives_ok(
  $$select public.update_way_section(
      current_setting('fx.s1')::uuid, current_setting('fx.ret1')::timestamptz,
      'Título dos', null, 'text', '')$$,
  'una copia al día vuelve a guardar'
);

select results_eq(
  $$select title, summary from way_sections where id = current_setting('fx.s1')::uuid$$,
  $$values ('Título dos', null::text)$$,
  'el resumen null se guarda como null'
);

-- Review Focus 4: dos admins abren la misma sección (misma copia, la del año 2000). El
-- primero guarda; el segundo recibe STALE_COPY y queda el texto del primero.
select lives_ok(
  $$select public.update_way_section(
      current_setting('fx.s2')::uuid, '2000-01-01T00:00:00Z',
      'Primera copia', 'Resumen de la primera', 'text', 'Cuerpo de la primera')$$,
  'el primero en guardar guarda'
);

select throws_ok(
  $$select public.update_way_section(
      current_setting('fx.s2')::uuid, '2000-01-01T00:00:00Z',
      'Segunda copia', 'Resumen de la segunda', 'text', 'Cuerpo de la segunda')$$,
  'P0001', 'STALE_COPY',
  'copia obsoleta: la segunda llamada con el mismo updated_at recibe STALE_COPY'
);

select results_eq(
  $$select title, summary, body_md from way_sections where id = current_setting('fx.s2')::uuid$$,
  $$values ('Primera copia', 'Resumen de la primera', 'Cuerpo de la primera')$$,
  'tras la copia obsoleta queda el texto de la primera'
);

-- `expectedUpdatedAt` viaja con microsegundos y no pasa por Date: un valor truncado a
-- milisegundos, que es lo que perdería un Date, ya no es la copia que se abrió.
select throws_ok(
  $$select public.update_way_section(
      current_setting('fx.draft_a')::uuid, '2000-01-01T00:00:00.123Z',
      'Título truncado', null, 'text', '')$$,
  'P0001', 'STALE_COPY',
  'un updated_at truncado a milisegundos es una copia obsoleta: la comparación es exacta'
);

select lives_ok(
  $$select public.update_way_section(
      current_setting('fx.draft_a')::uuid, '2000-01-01T00:00:00.123456Z',
      'Título completo', null, 'text', '')$$,
  'el updated_at completo, con microsegundos, guarda (adminA edita también borradores)'
);

-- Un guardado rechazado por un check de la tabla no cambia nada.
select throws_ok(
  $$select public.update_way_section(
      current_setting('fx.s3')::uuid, '2000-01-01T00:00:00Z',
      'Título nuevo', null, 'otro', '')$$,
  '23514', null,
  'un tipo de contenido desconocido lo rechaza el check de la tabla'
);

select results_eq(
  $$select title, updated_at from way_sections where id = current_setting('fx.s3')::uuid$$,
  $$values ('Sección s3 de A', '2000-01-01T00:00:00Z'::timestamptz)$$,
  'un guardado rechazado no cambia el título ni el updated_at'
);

select throws_ok(
  $$select public.update_way_section(
      gen_random_uuid(), '2000-01-01T00:00:00Z', 'Título', null, 'text', '')$$,
  'P0002', 'NOT_FOUND',
  'una sección que no existe da NOT_FOUND'
);

-- ── adminA: reorder_methodology ──────────────────────────────────────────────────────
-- Foto de los updated_at de A: reordenar no los toca (no hay trigger y la función no los
-- escribe).
do $do$
begin
  perform set_config(
    'fx.upd_before',
    (select string_agg(updated_at::text, ',' order by id)
     from public.way_sections
     where organization_id = current_setting('fx.club_a')::uuid),
    true
  );
end
$do$;

select lives_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections', current_setting('fx.ways_a')::uuid[])$$,
  'adminA reordena las secciones de su club, borradores incluidos'
);

select results_eq(
  $$select slug, sort, number::int from way_sections
    where organization_id = current_setting('fx.club_a')::uuid order by sort$$,
  $$values ('s3', 1, 1), ('s1', 2, 2), ('s2', 3, 3), ('pub-a', 4, 4), ('draft-a', 5, 5)$$,
  'reordenar renumera: sort y number son la posición de la lista'
);

select is(
  (select string_agg(updated_at::text, ',' order by id)
   from way_sections
   where organization_id = current_setting('fx.club_a')::uuid),
  current_setting('fx.upd_before'),
  'reordenar no toca updated_at'
);

-- Cada lista rechazada deja el orden anterior: la lista tiene que ser exactamente el
-- conjunto de filas del club, cada una una sola vez.
select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections',
      array[current_setting('fx.s3')::uuid, current_setting('fx.s1')::uuid,
            current_setting('fx.s2')::uuid])$$,
  'P0001', 'STALE_COPY',
  'una lista incompleta es una copia obsoleta'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections',
      array[current_setting('fx.s3')::uuid, current_setting('fx.s3')::uuid,
            current_setting('fx.s2')::uuid, current_setting('fx.pub_a')::uuid,
            current_setting('fx.draft_a')::uuid])$$,
  'P0001', 'STALE_COPY',
  'una lista con un id repetido y otro que falta, aunque tenga el tamaño justo, es una copia obsoleta'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections',
      current_setting('fx.ways_a')::uuid[] || current_setting('fx.s3')::uuid)$$,
  'P0001', 'STALE_COPY',
  'una lista completa con un id repetido es una copia obsoleta'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections', '{}'::uuid[])$$,
  'P0001', 'STALE_COPY',
  'una lista vacía no vale para un club con secciones'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections',
      (current_setting('fx.ways_a')::uuid[])[1:4] || current_setting('fx.pub_b')::uuid)$$,
  'P0001', 'STALE_COPY',
  'una lista con una sección de B en lugar de una de A es una copia obsoleta'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections',
      current_setting('fx.ways_a')::uuid[] || current_setting('fx.pub_b')::uuid)$$,
  'P0001', 'STALE_COPY',
  'una lista completa de A con una sección de B añadida es una copia obsoleta'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections',
      (current_setting('fx.ways_a')::uuid[])[1:4] || null::uuid)$$,
  'P0001', 'STALE_COPY',
  'una lista con un null en lugar de un id es una copia obsoleta'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'way_sections', null)$$,
  '22023', 'INVALID',
  'una lista null es una entrada inválida: no se interpreta como lista vacía'
);

select results_eq(
  $$select slug, sort, number::int from way_sections
    where organization_id = current_setting('fx.club_a')::uuid order by sort$$,
  $$values ('s3', 1, 1), ('s1', 2, 2), ('s2', 3, 3), ('pub-a', 4, 4), ('draft-a', 5, 5)$$,
  'las listas rechazadas dejan el orden y la numeración como estaban'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'people', current_setting('fx.ways_a')::uuid[])$$,
  '22023', 'INVALID',
  'el tipo people no se puede reordenar'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'principle_points', current_setting('fx.ways_a')::uuid[])$$,
  '22023', 'INVALID',
  'solo se reordenan las cuatro tablas con estado: los puntos de un principio no'
);

select throws_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, null, current_setting('fx.ways_a')::uuid[])$$,
  '22023', 'INVALID',
  'un tipo null es una entrada inválida'
);

-- Una rama por tabla: cada una renumera `sort` según la lista (aquí, al revés de como
-- estaban). Solo las secciones renumeran también `number`: el de un Standard lo elige la
-- dirección.
select lives_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'club_values',
      array(select id from club_values
            where organization_id = current_setting('fx.club_a')::uuid order by sort desc))$$,
  'adminA reordena los valores'
);

select results_eq(
  $$select code, sort from club_values
    where organization_id = current_setting('fx.club_a')::uuid order by sort$$,
  $$values ('VALOR-BORRADOR', 1), ('VALOR-PUB', 2)$$,
  'los valores quedan en el orden de la lista'
);

select lives_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'game_principles',
      array(select id from game_principles
            where organization_id = current_setting('fx.club_a')::uuid order by sort desc))$$,
  'adminA reordena los principios'
);

select results_eq(
  $$select slug, sort from game_principles
    where organization_id = current_setting('fx.club_a')::uuid order by sort$$,
  $$values ('draft-p', 1), ('pub-p', 2)$$,
  'los principios quedan en el orden de la lista'
);

select lives_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_a')::uuid, 'standards',
      array(select id from standards
            where organization_id = current_setting('fx.club_a')::uuid order by sort desc))$$,
  'adminA reordena los Standards'
);

select results_eq(
  $$select number::int, sort from standards
    where organization_id = current_setting('fx.club_a')::uuid order by sort$$,
  $$values (2, 1), (1, 2)$$,
  'los Standards quedan en el orden de la lista y conservan su número'
);

-- Reordenar A no mueve nada de B (como postgres).
reset role;

select results_eq(
  $$select slug, number::int, sort from way_sections
    where organization_id = current_setting('fx.club_b')::uuid order by sort$$,
  $$values ('pub-b', 1, 1), ('draft-b', 2, 2)$$,
  'reordenar las secciones de A no toca las de B'
);

select results_eq(
  $$select 'valor', code, sort from club_values where organization_id = current_setting('fx.club_b')::uuid
    union all
    select 'principio', slug, sort from game_principles where organization_id = current_setting('fx.club_b')::uuid
    union all
    select 'standard', number::text, sort from standards where organization_id = current_setting('fx.club_b')::uuid
    order by 1$$,
  $$values ('principio', 'pub-pb', 1), ('standard', '1', 1), ('valor', 'VALOR-B', 1)$$,
  'reordenar los valores, principios y Standards de A no toca los de B'
);

-- ── adminA: save_game_principle ──────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select lives_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Principio editado', 'Resumen editado',
      array['A', 'B', 'C'])$$,
  'adminA guarda un principio con tres puntos'
);

select results_eq(
  $$select text, sort from principle_points
    where principle_id = current_setting('fx.g_pub')::uuid order by sort$$,
  $$values ('A', 1), ('B', 2), ('C', 3)$$,
  'guardar un principio reemplaza los puntos: A, B y C por orden, y los anteriores borrados'
);

select results_eq(
  $$select title, summary from game_principles where id = current_setting('fx.g_pub')::uuid$$,
  $$values ('Principio editado', 'Resumen editado')$$,
  'guardar un principio cambia su título y su resumen'
);

select results_eq(
  $$select count(*)::int from principle_points
    where principle_id = current_setting('fx.g_pub')::uuid
      and organization_id = current_setting('fx.club_a')::uuid$$,
  array[3],
  'los puntos nuevos llevan el organization_id del principio'
);

select results_eq(
  $$select text from principle_points where principle_id = current_setting('fx.g_draft')::uuid$$,
  $$values ('draft-p-1')$$,
  'guardar un principio no toca los puntos de otro'
);

select throws_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Principio de trece', null,
      array(select 'p' || g from generate_series(1, 13) as g))$$,
  '22023', 'INVALID',
  'más de 12 puntos es una entrada inválida'
);

select results_eq(
  $$select gp.title, (select string_agg(pp.text, ',' order by pp.sort)
                      from principle_points as pp where pp.principle_id = gp.id)
    from game_principles as gp where gp.id = current_setting('fx.g_pub')::uuid$$,
  $$values ('Principio editado', 'A,B,C')$$,
  'con 13 puntos no cambia ni el título ni los puntos'
);

select lives_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Principio editado', 'Resumen editado',
      array(select 'p' || g from generate_series(1, 12) as g))$$,
  '12 puntos es el máximo y se guarda'
);

select results_eq(
  $$select count(*)::int, min(sort), max(sort) from principle_points
    where principle_id = current_setting('fx.g_pub')::uuid$$,
  $$values (12, 1, 12)$$,
  'los 12 puntos quedan numerados de 1 a 12'
);

-- Un punto de 201 caracteres lo rechaza el check de la tabla. Como la función es una sola
-- transacción, tampoco se queda el título nuevo ni se pierden los puntos anteriores.
select throws_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Título que no se guarda', null,
      array['corto', repeat('a', 201)])$$,
  '23514', null,
  'un punto de 201 caracteres lo rechaza el check de la tabla'
);

select results_eq(
  $$select gp.title, (select count(*)::int from principle_points as pp
                      where pp.principle_id = gp.id)
    from game_principles as gp where gp.id = current_setting('fx.g_pub')::uuid$$,
  $$values ('Principio editado', 12)$$,
  'un guardado rechazado deja el título y los 12 puntos como estaban'
);

select lives_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Principio editado', 'Resumen editado', '{}'::text[])$$,
  'una lista vacía de puntos se guarda'
);

select is_empty(
  $$select 1 from principle_points where principle_id = current_setting('fx.g_pub')::uuid$$,
  'una lista vacía deja el principio sin puntos'
);

select throws_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub')::uuid, 'Principio editado', null, null)$$,
  '22023', 'INVALID',
  'una lista de puntos null es una entrada inválida: no borra los puntos'
);

-- adminA ve y edita también un principio en borrador, y el punto que tenía se borra.
select lives_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_draft')::uuid, 'Borrador editado', null, array['uno', 'dos'])$$,
  'adminA guarda un principio en borrador'
);

select results_eq(
  $$select text, sort from principle_points
    where principle_id = current_setting('fx.g_draft')::uuid order by sort$$,
  $$values ('uno', 1), ('dos', 2)$$,
  'el principio en borrador queda con sus dos puntos nuevos y sin el anterior'
);

select throws_ok(
  $$select public.save_game_principle(gen_random_uuid(), 'Título', null, array['uno'])$$,
  'P0002', 'NOT_FOUND',
  'un principio que no existe da NOT_FOUND'
);

-- ── adminB: lo que sí puede hacer en su club ─────────────────────────────────────────
-- Control positivo de las pruebas de aislamiento: adminB usa las tres funciones en B; lo que
-- le cerraba la puerta en A no era la función.
select tests.authenticate_as(current_setting('fx.admin_b')::uuid);

select lives_ok(
  $$select public.reorder_methodology(
      current_setting('fx.club_b')::uuid, 'way_sections',
      array[current_setting('fx.draft_b')::uuid, current_setting('fx.pub_b')::uuid])$$,
  'adminB reordena las secciones de B'
);

select lives_ok(
  $$select public.update_way_section(
      current_setting('fx.pub_b')::uuid, '2000-01-01T00:00:00Z',
      'Título de B', null, 'text', 'Cuerpo de B')$$,
  'adminB edita una sección de B'
);

select lives_ok(
  $$select public.save_game_principle(
      current_setting('fx.g_pub_b')::uuid, 'Principio de B', null, array['b1'])$$,
  'adminB guarda un principio de B'
);

reset role;

select results_eq(
  $$select slug, sort, title from way_sections
    where organization_id = current_setting('fx.club_b')::uuid order by sort$$,
  $$values ('draft-b', 1, 'Sección en borrador de B'), ('pub-b', 2, 'Título de B')$$,
  'las secciones de B quedan reordenadas y la editada con su título nuevo'
);

select results_eq(
  $$select gp.title, (select string_agg(pp.text, ',' order by pp.sort)
                      from principle_points as pp where pp.principle_id = gp.id)
    from game_principles as gp where gp.id = current_setting('fx.g_pub_b')::uuid$$,
  $$values ('Principio de B', 'b1')$$,
  'el principio de B queda con su título y su punto nuevos'
);

-- ── Catálogo: firmas, tipo de función y privilegios ──────────────────────────────────
-- Los nombres de los parámetros son parte del contrato: PostgREST resuelve el RPC por ellos.
select results_eq(
  $$select f.proname::text collate "default",
           pg_get_function_identity_arguments(f.oid),
           pg_get_function_result(f.oid)
    from pg_proc as f
    where f.pronamespace = 'public'::regnamespace
      and f.proname in ('update_way_section', 'reorder_methodology', 'save_game_principle')
    order by 1$$,
  $$values
    ('reorder_methodology', 'p_org uuid, p_kind text, p_ids uuid[]', 'void'),
    ('save_game_principle', 'p_id uuid, p_title text, p_summary text, p_points text[]', 'void'),
    ('update_way_section',
     'p_id uuid, p_expected_updated_at timestamp with time zone, p_title text, p_summary text, p_content_kind text, p_body_md text',
     'timestamp with time zone')$$,
  'las tres funciones tienen las firmas del contrato'
);

-- `security invoker` (no `prosecdef`): RLS se aplica con el usuario de la sesión.
select results_eq(
  $$select count(*)::int
    from pg_proc as f
    join pg_language as l on l.oid = f.prolang
    where f.pronamespace = 'public'::regnamespace
      and f.proname in ('update_way_section', 'reorder_methodology', 'save_game_principle')
      and l.lanname = 'plpgsql'
      and not f.prosecdef
      and f.proconfig = array['search_path=""']$$,
  array[3],
  'las tres funciones son plpgsql security invoker con search_path vacío'
);

select is_empty(
  $$select f.oid::regprocedure::text
    from pg_proc as f
    where f.pronamespace = 'public'::regnamespace
      and f.proname in ('update_way_section', 'reorder_methodology', 'save_game_principle')
      and (
        has_function_privilege('public', f.oid, 'execute')
        or has_function_privilege('anon', f.oid, 'execute')
        or has_function_privilege('service_role', f.oid, 'execute')
      )$$,
  'ni PUBLIC, ni anon, ni service_role pueden ejecutar las funciones'
);

select results_eq(
  $$select count(*)::int
    from pg_proc as f
    where f.pronamespace = 'public'::regnamespace
      and f.proname in ('update_way_section', 'reorder_methodology', 'save_game_principle')
      and has_function_privilege('authenticated', f.oid, 'execute')$$,
  array[3],
  'authenticated puede ejecutar las tres funciones'
);

select * from finish();

rollback;
