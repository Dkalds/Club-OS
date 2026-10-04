-- Biblioteca de ejercicios: `drills` y sus cinco tablas hijas.
--
-- RLS aísla por club y, dentro del club, por autor y estado: admin y entrenadores del club
-- ven lo publicado y lo archivado; un borrador solo lo ven su autor y el admin. Escribe el
-- admin, y el entrenador solo en un borrador propio; publicar y archivar es del admin. Nadie
-- borra un ejercicio (se archiva). Los hijos (puntos, variantes, objetivos, principios y
-- Standards) siguen las mismas reglas que su ejercicio: se ven si se ve y se escriben si se
-- puede editar.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*`
-- vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al
-- final. Los datos son ficticios y solo de este test; los emails y los slugs de club no
-- chocan con los de `pnpm seed` ni con los de los otros tests.
begin;

select plan(150);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A
--   adminA es admin; c1 entrena T1 «Alevín A» y c2 entrena T2 «Benjamín A»; jugA es un
--   jugador de T1 (rol player). `multi` es entrenador de A y admin de B: lee y escribe en B
--   como admin, y en A solo tiene lo de un entrenador que no es autor de nada.
--   Ejercicios (título → estado, autor):
--     «Pase y corte»    → publicado, adminA; con dos puntos, una variante, un objetivo, un
--                         principio y un Standard
--     «Borrador de c1»  → borrador, c1; con un punto, una variante, un objetivo, un
--                         principio y un Standard
--     «Rebote ofensivo» → archivado, adminA; con un punto; está en un ítem de un plan
--                         `done` de T1
--   Dos objetivos (fA, fA2), dos principios (gA, gA2) y dos Standards (sA, sA2): el segundo
--   de cada uno es libre, para vincularlo en las pruebas sin chocar con la clave primaria.
-- Club B
--   coachB es coach. Un objetivo (fB), un principio (gB), un Standard (sB) y «Ejercicio de
--   B» (publicado, coachB) con un punto, una variante y los tres vínculos.
--
-- `tests.all_drill_ids()` lee todos los ejercicios sin pasar por RLS: es la referencia con la
-- que se compara lo que ve cada usuario (la función existe solo en esta transacción).
--
-- Los ids quedan en ajustes `fx.*` de la transacción. Los títulos hacen de clave para leer
-- las aserciones; empiezan por letras distintas para que `order by` dé el mismo orden con
-- cualquier collation. Los fixtures se insertan sin sesión (`auth.uid()` es null), así que
-- el autor va siempre explícito.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@drills.pgtap.test');
  u_c1 uuid := tests.create_user('c1@drills.pgtap.test');
  u_c2 uuid := tests.create_user('c2@drills.pgtap.test');
  u_jug_a uuid := tests.create_user('jug-a@drills.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@drills.pgtap.test');
  u_multi uuid := tests.create_user('multi@drills.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_c2 constant uuid := gen_random_uuid();
  p_jug_a constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  cat_alevin constant uuid := gen_random_uuid();
  cat_benjamin constant uuid := gen_random_uuid();
  t1 constant uuid := gen_random_uuid();
  t2 constant uuid := gen_random_uuid();

  f_a constant uuid := gen_random_uuid();
  f_a2 constant uuid := gen_random_uuid();
  f_b constant uuid := gen_random_uuid();
  g_a constant uuid := gen_random_uuid();
  g_a2 constant uuid := gen_random_uuid();
  g_b constant uuid := gen_random_uuid();
  s_a constant uuid := gen_random_uuid();
  s_a2 constant uuid := gen_random_uuid();
  s_b constant uuid := gen_random_uuid();

  d_pub constant uuid := gen_random_uuid();
  d_draft constant uuid := gen_random_uuid();
  d_arch constant uuid := gen_random_uuid();
  d_b constant uuid := gen_random_uuid();

  plan_done constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_c2, club_a, 'c2', 'Ficticia', null),
    (p_jug_a, club_a, 'jugA', 'Ficticio', 2015);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', null),
    (club_a, u_c1, 'coach', p_c1),
    (club_a, u_c2, 'coach', p_c2),
    (club_a, u_jug_a, 'player', p_jug_a),
    (club_b, u_coach_b, 'coach', null),
    (club_a, u_multi, 'coach', null),
    (club_b, u_multi, 'admin', null);

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true);

  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_benjamin, club_a, 'Benjamín', 'U10', 10),
    (cat_alevin, club_a, 'Alevín', 'U12', 20);

  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, club_a, season_a, cat_alevin, 'Alevín A'),
    (t2, club_a, season_a, cat_benjamin, 'Benjamín A');

  insert into team_staff (organization_id, team_id, person_id, staff_role) values
    (club_a, t1, p_c1, 'head_coach'),
    (club_a, t2, p_c2, 'head_coach');

  insert into team_players (organization_id, team_id, person_id, jersey_number, position) values
    (club_a, t1, p_jug_a, 4, 'Base');

  insert into focus_areas (id, organization_id, slug, name, sort) values
    (f_a, club_a, 'rebote', 'Rebote', 10),
    (f_a2, club_a, 'equilibrio', 'Equilibrio', 20),
    (f_b, club_b, 'rebote', 'Rebote B', 10);

  insert into game_principles (id, organization_id, slug, title, status) values
    (g_a, club_a, 'principio-a', 'Principio de A', 'published'),
    (g_a2, club_a, 'principio-a2', 'Segundo principio de A', 'published'),
    (g_b, club_b, 'principio-b', 'Principio de B', 'published');

  insert into standards (id, organization_id, number, title, description, status) values
    (s_a, club_a, 1, 'Standard 1 de A', 'Descripción del Standard 1 de A.', 'published'),
    (s_a2, club_a, 2, 'Standard 2 de A', 'Descripción del Standard 2 de A.', 'published'),
    (s_b, club_b, 1, 'Standard 1 de B', 'Descripción del Standard 1 de B.', 'published');

  -- El plan pasado no tiene autor, como los del seed: el último bloque del test borra la
  -- cuenta de c1 y `practice_plans.created_by` no se desengancha solo.
  insert into practice_plans (id, organization_id, team_id, title, status, created_by) values
    (plan_done, club_a, t1, 'Entrenamiento pasado de T1', 'done', null);

  insert into drills (
    id, organization_id, title, summary, min_players, max_players, min_minutes, max_minutes,
    min_age, max_age, status, created_by
  ) values
    (d_pub, club_a, 'Pase y corte', 'Transición rápida tras el rebote.', 4, 10, 10, 15, 10, 14,
     'published', u_admin_a),
    (d_draft, club_a, 'Borrador de c1', null, 4, 8, 10, 15, 10, null, 'draft', u_c1),
    (d_arch, club_a, 'Rebote ofensivo', null, 4, 8, 10, 15, 10, null, 'archived', u_admin_a),
    (d_b, club_b, 'Ejercicio de B', null, 4, 8, 10, 15, 10, null, 'published', u_coach_b);

  insert into drill_coaching_points (organization_id, drill_id, text, is_key, sort) values
    (club_a, d_pub, 'Mira antes de pasar', true, 1),
    (club_a, d_pub, 'Cuenta hasta tres', false, 2),
    (club_a, d_draft, 'Punto del borrador', false, 1),
    (club_a, d_arch, 'Punto del archivado', false, 1),
    (club_b, d_b, 'Punto de B', false, 1);

  insert into drill_variants (organization_id, drill_id, title, description, sort) values
    (club_a, d_pub, 'Variante publicada', null, 1),
    (club_a, d_draft, 'Variante del borrador', null, 1),
    (club_b, d_b, 'Variante de B', null, 1);

  insert into drill_focus_areas (organization_id, drill_id, focus_area_id) values
    (club_a, d_pub, f_a),
    (club_a, d_draft, f_a),
    (club_b, d_b, f_b);

  insert into drill_principles (organization_id, drill_id, principle_id) values
    (club_a, d_pub, g_a),
    (club_a, d_draft, g_a),
    (club_b, d_b, g_b);

  insert into drill_standards (organization_id, drill_id, standard_id) values
    (club_a, d_pub, s_a),
    (club_a, d_draft, s_a),
    (club_b, d_b, s_b);

  insert into practice_items (organization_id, plan_id, sort, minutes, drill_id) values
    (club_a, plan_done, 1, 15, d_arch);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.c2', u_c2::text, true);
  perform set_config('fx.jug_a', u_jug_a::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.multi', u_multi::text, true);
  perform set_config('fx.f_a', f_a::text, true);
  perform set_config('fx.f_a2', f_a2::text, true);
  perform set_config('fx.f_b', f_b::text, true);
  perform set_config('fx.g_a', g_a::text, true);
  perform set_config('fx.g_a2', g_a2::text, true);
  perform set_config('fx.g_b', g_b::text, true);
  perform set_config('fx.s_a', s_a::text, true);
  perform set_config('fx.s_a2', s_a2::text, true);
  perform set_config('fx.s_b', s_b::text, true);
  perform set_config('fx.d_pub', d_pub::text, true);
  perform set_config('fx.d_draft', d_draft::text, true);
  perform set_config('fx.d_arch', d_arch::text, true);
  perform set_config('fx.d_b', d_b::text, true);
  perform set_config('fx.plan_done', plan_done::text, true);
end
$$;

create function tests.all_drill_ids()
returns setof uuid
language sql
security definer
set search_path = ''
as $$
  select id from public.drills;
$$;

-- ── c1 (entrenador): lo publicado, lo archivado y su borrador ────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  'select title from drills order by title',
  $$values ('Borrador de c1'), ('Pase y corte'), ('Rebote ofensivo')$$,
  'c1 ve los publicados, los archivados y su borrador, y nada de B'
);

-- Los hijos se ven con su ejercicio, los del borrador de c1 incluidos: drills, puntos,
-- variantes, objetivos, principios y Standards.
select results_eq(
  $$select (select count(*) from drills)::int,
           (select count(*) from drill_coaching_points)::int,
           (select count(*) from drill_variants)::int,
           (select count(*) from drill_focus_areas)::int,
           (select count(*) from drill_principles)::int,
           (select count(*) from drill_standards)::int$$,
  $$values (3, 4, 2, 2, 2, 2)$$,
  'c1 ve en las seis tablas lo de A que le toca, y nada de B'
);

-- La política de lectura de `drills` y `can_see_drill` (la de los hijos) son dos copias de la
-- misma regla: lo que cada usuario ve en `drills` es exactamente lo que la función da por
-- visible, sobre todos los ejercicios del servidor.
select results_eq(
  'select id from drills order by id',
  'select id from tests.all_drill_ids() as t (id) where private.can_see_drill(id) order by id',
  'c1: la política de drills y can_see_drill ven lo mismo'
);

-- ── c2 (entrenador): no ve el borrador de c1 (Review Focus 1) ────────────────────────
-- Las filas existen: son las que ve c1 arriba. c2 es del mismo club y entrena otro equipo,
-- pero el borrador es de su autor, no del club.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  'select title from drills order by title',
  $$values ('Pase y corte'), ('Rebote ofensivo')$$,
  'c2 ve los publicados y los archivados, no el borrador de c1'
);

select is_empty(
  $$select 1 from drills where id = current_setting('fx.d_draft')::uuid$$,
  'c2 no ve el borrador de c1 aunque lo pida por su id'
);

select is_empty(
  $$select 'puntos' from drill_coaching_points where drill_id = current_setting('fx.d_draft')::uuid
    union all
    select 'variantes' from drill_variants where drill_id = current_setting('fx.d_draft')::uuid
    union all
    select 'objetivos' from drill_focus_areas where drill_id = current_setting('fx.d_draft')::uuid
    union all
    select 'principios' from drill_principles where drill_id = current_setting('fx.d_draft')::uuid
    union all
    select 'standards' from drill_standards where drill_id = current_setting('fx.d_draft')::uuid$$,
  'c2 no ve ni los puntos, ni las variantes, ni los vínculos del borrador de c1'
);

-- Control positivo: lo publicado sí llega con sus hijos.
select results_eq(
  $$select (select count(*) from drills)::int,
           (select count(*) from drill_coaching_points)::int,
           (select count(*) from drill_variants)::int,
           (select count(*) from drill_focus_areas)::int,
           (select count(*) from drill_principles)::int,
           (select count(*) from drill_standards)::int$$,
  $$values (2, 3, 1, 1, 1, 1)$$,
  'c2 ve en las seis tablas lo publicado y lo archivado de A, y nada de B'
);

-- Los hijos de un archivado se ven igual que los de un publicado: el archivado sigue en la
-- biblioteca y en el histórico.
select results_eq(
  $$select text from drill_coaching_points where drill_id = current_setting('fx.d_arch')::uuid$$,
  $$values ('Punto del archivado')$$,
  'c2 lee el punto de un ejercicio archivado'
);

select results_eq(
  'select id from drills order by id',
  'select id from tests.all_drill_ids() as t (id) where private.can_see_drill(id) order by id',
  'c2: la política de drills y can_see_drill ven lo mismo'
);

-- ── adminA: todo su club, borradores incluidos ───────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  'select title from drills order by title',
  $$values ('Borrador de c1'), ('Pase y corte'), ('Rebote ofensivo')$$,
  'adminA ve el borrador de c1, los publicados y los archivados, y nada de B'
);

select results_eq(
  $$select (select count(*) from drills)::int,
           (select count(*) from drill_coaching_points)::int,
           (select count(*) from drill_variants)::int,
           (select count(*) from drill_focus_areas)::int,
           (select count(*) from drill_principles)::int,
           (select count(*) from drill_standards)::int$$,
  $$values (3, 4, 2, 2, 2, 2)$$,
  'adminA ve en las seis tablas todo lo de A, y nada de B'
);

select results_eq(
  'select id from drills order by id',
  'select id from tests.all_drill_ids() as t (id) where private.can_see_drill(id) order by id',
  'adminA: la política de drills y can_see_drill ven lo mismo'
);

-- ── jugA (jugador) y coachB (entrenador de B): nada de A ─────────────────────────────
select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select is_empty(
  $$select 'drills' from drills
    union all select 'puntos' from drill_coaching_points
    union all select 'variantes' from drill_variants
    union all select 'objetivos' from drill_focus_areas
    union all select 'principios' from drill_principles
    union all select 'standards' from drill_standards$$,
  'jugA, que es del club pero juega, no ve nada en las seis tablas'
);

select results_eq(
  'select id from drills order by id',
  'select id from tests.all_drill_ids() as t (id) where private.can_see_drill(id) order by id',
  'jugA: la política de drills y can_see_drill ven lo mismo'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

-- Control positivo: coachB lee lo suyo.
select results_eq(
  'select title from drills',
  $$values ('Ejercicio de B')$$,
  'coachB ve el ejercicio de B'
);

select is_empty(
  $$select 'drills' from drills where organization_id = current_setting('fx.club_a')::uuid
    union all select 'puntos' from drill_coaching_points where organization_id = current_setting('fx.club_a')::uuid
    union all select 'variantes' from drill_variants where organization_id = current_setting('fx.club_a')::uuid
    union all select 'objetivos' from drill_focus_areas where organization_id = current_setting('fx.club_a')::uuid
    union all select 'principios' from drill_principles where organization_id = current_setting('fx.club_a')::uuid
    union all select 'standards' from drill_standards where organization_id = current_setting('fx.club_a')::uuid$$,
  'coachB no ve nada de A en las seis tablas'
);

select results_eq(
  'select id from drills order by id',
  'select id from tests.all_drill_ids() as t (id) where private.can_see_drill(id) order by id',
  'coachB: la política de drills y can_see_drill ven lo mismo'
);

-- ── multi (entrenador de A y admin de B): cada club por su rol ───────────────────────
-- Lee lo publicado y lo archivado de A, que no es admin, y todo B, donde sí lo es; no ve el
-- borrador de c1.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select results_eq(
  'select title from drills order by title',
  $$values ('Ejercicio de B'), ('Pase y corte'), ('Rebote ofensivo')$$,
  'multi ve lo publicado y lo archivado de A y el ejercicio de B, y no el borrador de c1'
);

select results_eq(
  'select id from drills order by id',
  'select id from tests.all_drill_ids() as t (id) where private.can_see_drill(id) order by id',
  'multi: la política de drills y can_see_drill ven lo mismo'
);

-- ── c1: crea borradores y edita los suyos ────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select lives_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age)
    values (current_setting('fx.club_a')::uuid, 'Borrador nuevo de c1', 4, 8, 10, 15, 10)$$,
  'c1 crea un borrador'
);

-- Lo que no se indica lo pone la base de datos: nace en borrador, con la sesión de autor.
select results_eq(
  $$select status::text, created_by from drills where title = 'Borrador nuevo de c1'$$,
  $$values ('draft', current_setting('fx.c1')::uuid)$$,
  'un ejercicio nuevo nace en borrador y con c1 de autor'
);

-- Con `returning` la fila nueva también tiene que pasar la política de lectura: es lo que
-- hace PostgREST con `insert().select()` y lo que harán las funciones de guardado.
select lives_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age)
    values (current_setting('fx.club_a')::uuid, 'Borrador con returning', 4, 8, 10, 15, 10)
    returning id$$,
  'c1 crea un borrador y recibe su fila de vuelta con returning'
);

select throws_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, status)
    values (current_setting('fx.club_a')::uuid, 'Publicado por c1', 4, 8, 10, 15, 10, 'published')$$,
  '42501', null,
  'c1 no crea un ejercicio publicado'
);

select throws_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, created_by)
    values (current_setting('fx.club_a')::uuid, 'A nombre de c2', 4, 8, 10, 15, 10, current_setting('fx.c2')::uuid)$$,
  '42501', null,
  'c1 no crea un borrador a nombre de otro'
);

select throws_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age)
    values (current_setting('fx.club_b')::uuid, 'Borrador de c1 en B', 4, 8, 10, 15, 10)$$,
  '42501', null,
  'c1 no crea un borrador en B'
);

select throws_ok(
  $$update drills set status = 'published' where id = current_setting('fx.d_draft')::uuid$$,
  '42501', null,
  'c1 no publica su borrador'
);

select throws_ok(
  $$update drills set organization_id = current_setting('fx.club_b')::uuid
    where id = current_setting('fx.d_draft')::uuid$$,
  '42501', null,
  'c1 no pasa su borrador a B'
);

select throws_ok(
  $$update drills set created_by = current_setting('fx.c2')::uuid
    where id = current_setting('fx.d_draft')::uuid$$,
  '42501', null,
  'c1 no cede su borrador a otro autor'
);

select results_eq(
  $$with u as (update drills set summary = 'Resumen editado.'
               where id = current_setting('fx.d_draft')::uuid returning 1)
    select count(*)::int from u$$,
  array[1],
  'c1 edita su borrador'
);

select results_eq(
  $$with
      p as (update drills set summary = 'editado' where id = current_setting('fx.d_pub')::uuid returning 1),
      a as (update drills set summary = 'editado' where id = current_setting('fx.d_arch')::uuid returning 1)
    select (select count(*) from p)::int, (select count(*) from a)::int$$,
  $$values (0, 0)$$,
  'c1 no edita el publicado ni el archivado'
);

-- No hay `grant delete` en `drills`: el borrado falla por privilegios, antes de llegar a RLS.
select throws_ok(
  $$delete from drills where id = current_setting('fx.d_draft')::uuid$$,
  '42501', null,
  'nadie borra: c1 no borra ni su borrador'
);

-- ── c1: los hijos siguen a su ejercicio ──────────────────────────────────────────────
select lives_ok(
  $$insert into drill_coaching_points (organization_id, drill_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_draft')::uuid, 'Punto nuevo de c1', 2)$$,
  'c1 añade un punto a su borrador'
);

select lives_ok(
  $$insert into drill_focus_areas (organization_id, drill_id, focus_area_id)
    select d.organization_id, d.id, current_setting('fx.f_a')::uuid
    from drills as d where d.title = 'Borrador nuevo de c1';
    insert into drill_principles (organization_id, drill_id, principle_id)
    select d.organization_id, d.id, current_setting('fx.g_a')::uuid
    from drills as d where d.title = 'Borrador nuevo de c1';
    insert into drill_standards (organization_id, drill_id, standard_id)
    select d.organization_id, d.id, current_setting('fx.s_a')::uuid
    from drills as d where d.title = 'Borrador nuevo de c1'$$,
  'c1 vincula a su borrador un objetivo, un principio y un Standard'
);

select lives_ok(
  $$insert into drill_variants (organization_id, drill_id, title, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_draft')::uuid, 'Variante nueva de c1', 2)$$,
  'c1 añade una variante a su borrador'
);

-- Control positivo de las escrituras: c1 cambia los hijos de su borrador en las cinco tablas.
select results_eq(
  $$with
      p as (update drill_coaching_points set is_key = true
            where drill_id = current_setting('fx.d_draft')::uuid returning 1),
      v as (update drill_variants set title = 'Variante editada'
            where drill_id = current_setting('fx.d_draft')::uuid and sort = 1 returning 1),
      f as (update drill_focus_areas set focus_area_id = current_setting('fx.f_a2')::uuid
            where drill_id = current_setting('fx.d_draft')::uuid returning 1),
      g as (update drill_principles set principle_id = current_setting('fx.g_a2')::uuid
            where drill_id = current_setting('fx.d_draft')::uuid returning 1),
      s as (update drill_standards set standard_id = current_setting('fx.s_a2')::uuid
            where drill_id = current_setting('fx.d_draft')::uuid returning 1)
    select (select count(*) from p)::int, (select count(*) from v)::int,
           (select count(*) from f)::int, (select count(*) from g)::int,
           (select count(*) from s)::int$$,
  $$values (2, 1, 1, 1, 1)$$,
  'c1 modifica los puntos, la variante y los vínculos de su borrador'
);

-- Un hijo de su borrador no se muda a un ejercicio que c1 no puede editar (el archivado): la
-- fila vieja cumple `using` y la nueva no cumple `with check`. Se usa el archivado y no el
-- publicado para que, si la política fallara, la fila movida no choque con las pruebas
-- siguientes sobre el publicado.
select throws_ok(
  $$update drill_coaching_points set drill_id = current_setting('fx.d_arch')::uuid, sort = 9
    where drill_id = current_setting('fx.d_draft')::uuid and sort = 1$$,
  '42501', null,
  'c1 no pasa un punto de su borrador al archivado'
);

select throws_ok(
  $$update drill_variants set drill_id = current_setting('fx.d_arch')::uuid, sort = 9
    where drill_id = current_setting('fx.d_draft')::uuid and sort = 1$$,
  '42501', null,
  'c1 no pasa una variante de su borrador al archivado'
);

select throws_ok(
  $$update drill_focus_areas set drill_id = current_setting('fx.d_arch')::uuid
    where drill_id = current_setting('fx.d_draft')::uuid$$,
  '42501', null,
  'c1 no pasa un objetivo de su borrador al archivado'
);

select throws_ok(
  $$update drill_principles set drill_id = current_setting('fx.d_arch')::uuid
    where drill_id = current_setting('fx.d_draft')::uuid$$,
  '42501', null,
  'c1 no pasa un principio de su borrador al archivado'
);

select throws_ok(
  $$update drill_standards set drill_id = current_setting('fx.d_arch')::uuid
    where drill_id = current_setting('fx.d_draft')::uuid$$,
  '42501', null,
  'c1 no pasa un Standard de su borrador al archivado'
);

-- El publicado no es de c1: no le añade nada, en ninguna de las cinco tablas.
select throws_ok(
  $$insert into drill_coaching_points (organization_id, drill_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, 'Punto de c1', 3)$$,
  '42501', null,
  'c1 no añade puntos al publicado'
);

select throws_ok(
  $$insert into drill_variants (organization_id, drill_id, title, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, 'Variante de c1', 9)$$,
  '42501', null,
  'c1 no añade variantes al publicado'
);

select throws_ok(
  $$insert into drill_focus_areas (organization_id, drill_id, focus_area_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, current_setting('fx.f_a2')::uuid)$$,
  '42501', null,
  'c1 no vincula un objetivo al publicado'
);

select throws_ok(
  $$insert into drill_principles (organization_id, drill_id, principle_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, current_setting('fx.g_a2')::uuid)$$,
  '42501', null,
  'c1 no vincula un principio al publicado'
);

select throws_ok(
  $$insert into drill_standards (organization_id, drill_id, standard_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, current_setting('fx.s_a2')::uuid)$$,
  '42501', null,
  'c1 no vincula un Standard al publicado'
);

select results_eq(
  $$with
      p as (update drill_coaching_points set text = 'editado'
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      v as (update drill_variants set title = 'editado'
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      f as (update drill_focus_areas set focus_area_id = current_setting('fx.f_a2')::uuid
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      g as (update drill_principles set principle_id = current_setting('fx.g_a2')::uuid
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      s as (update drill_standards set standard_id = current_setting('fx.s_a2')::uuid
            where drill_id = current_setting('fx.d_pub')::uuid returning 1)
    select (select count(*) from p)::int, (select count(*) from v)::int,
           (select count(*) from f)::int, (select count(*) from g)::int,
           (select count(*) from s)::int$$,
  $$values (0, 0, 0, 0, 0)$$,
  'c1 no modifica los puntos, las variantes ni los vínculos del publicado'
);

select results_eq(
  $$with
      p as (delete from drill_coaching_points
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      v as (delete from drill_variants
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      f as (delete from drill_focus_areas
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      g as (delete from drill_principles
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      s as (delete from drill_standards
            where drill_id = current_setting('fx.d_pub')::uuid returning 1)
    select (select count(*) from p)::int, (select count(*) from v)::int,
           (select count(*) from f)::int, (select count(*) from g)::int,
           (select count(*) from s)::int$$,
  $$values (0, 0, 0, 0, 0)$$,
  'c1 no borra puntos, variantes ni vínculos del publicado'
);

select results_eq(
  $$with p as (delete from drill_coaching_points where text = 'Punto nuevo de c1' returning 1)
    select count(*)::int from p$$,
  array[1],
  'c1 borra un punto de su borrador'
);

-- ── c2: tampoco escribe en el borrador de c1 ─────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  $$with u as (update drills set summary = 'editado'
               where id = current_setting('fx.d_draft')::uuid returning 1)
    select count(*)::int from u$$,
  array[0],
  'c2 no edita el borrador de c1'
);

select throws_ok(
  $$insert into drill_coaching_points (organization_id, drill_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_draft')::uuid, 'Punto de c2', 3)$$,
  '42501', null,
  'c2 no añade puntos al borrador de c1'
);

select results_eq(
  $$with
      p as (delete from drill_coaching_points
            where drill_id = current_setting('fx.d_draft')::uuid returning 1),
      v as (delete from drill_variants
            where drill_id = current_setting('fx.d_draft')::uuid returning 1),
      f as (delete from drill_focus_areas
            where drill_id = current_setting('fx.d_draft')::uuid returning 1),
      g as (delete from drill_principles
            where drill_id = current_setting('fx.d_draft')::uuid returning 1),
      s as (delete from drill_standards
            where drill_id = current_setting('fx.d_draft')::uuid returning 1)
    select (select count(*) from p)::int, (select count(*) from v)::int,
           (select count(*) from f)::int, (select count(*) from g)::int,
           (select count(*) from s)::int$$,
  $$values (0, 0, 0, 0, 0)$$,
  'c2 no borra puntos, variantes ni vínculos del borrador de c1'
);

-- ── jugA y coachB: no escriben en A ──────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select throws_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age)
    values (current_setting('fx.club_a')::uuid, 'Borrador de jugA', 4, 8, 10, 15, 10)$$,
  '42501', null,
  'jugA no crea ejercicios'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select throws_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age)
    values (current_setting('fx.club_a')::uuid, 'Borrador de coachB en A', 4, 8, 10, 15, 10)$$,
  '42501', null,
  'coachB no crea ejercicios en A'
);

select results_eq(
  $$with u as (update drills set summary = 'editado'
               where organization_id = current_setting('fx.club_a')::uuid returning 1)
    select count(*)::int from u$$,
  array[0],
  'coachB no modifica ningún ejercicio de A'
);

-- ── multi: ser admin de B no da ningún permiso en A ──────────────────────────────────
-- Es entrenador de A: ve el publicado de A y sus hijos, pero no es autor ni admin allí.
-- `can_edit_drill` mira la membresía del club del ejercicio, no cualquiera del usuario.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

-- Controles positivos: en B, donde es admin, escribe.
select results_eq(
  $$with u as (update drills set summary = 'Revisado por multi.'
               where id = current_setting('fx.d_b')::uuid returning 1)
    select count(*)::int from u$$,
  array[1],
  'multi edita un ejercicio de B, donde es admin'
);

select lives_ok(
  $$insert into drill_variants (organization_id, drill_id, title, sort)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.d_b')::uuid, 'Variante de multi', 2)$$,
  'multi añade una variante a un ejercicio de B'
);

-- En A, no. `using` no encuentra la fila y el `update` no toca nada. Si `can_edit_drill`
-- dejara pasar a multi por su rol en B, el `update` llegaría a `with check` y fallaría con
-- 42501: por eso `lives_ok` y, aparte, que el resumen no haya cambiado.
select lives_ok(
  $$update drills set summary = 'editado' where id = current_setting('fx.d_pub')::uuid$$,
  'multi intenta editar el publicado de A y el update no falla'
);

select is_empty(
  $$select 1 from drills
    where id = current_setting('fx.d_pub')::uuid and summary = 'editado'$$,
  'multi no edita el publicado de A'
);

select results_eq(
  $$with
      p as (update drill_coaching_points set text = 'editado'
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      v as (update drill_variants set title = 'editado'
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      f as (update drill_focus_areas set focus_area_id = current_setting('fx.f_a2')::uuid
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      g as (update drill_principles set principle_id = current_setting('fx.g_a2')::uuid
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      s as (update drill_standards set standard_id = current_setting('fx.s_a2')::uuid
            where drill_id = current_setting('fx.d_pub')::uuid returning 1)
    select (select count(*) from p)::int, (select count(*) from v)::int,
           (select count(*) from f)::int, (select count(*) from g)::int,
           (select count(*) from s)::int$$,
  $$values (0, 0, 0, 0, 0)$$,
  'multi no modifica los puntos, las variantes ni los vínculos del publicado de A'
);

select results_eq(
  $$with
      p as (delete from drill_coaching_points
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      v as (delete from drill_variants
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      f as (delete from drill_focus_areas
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      g as (delete from drill_principles
            where drill_id = current_setting('fx.d_pub')::uuid returning 1),
      s as (delete from drill_standards
            where drill_id = current_setting('fx.d_pub')::uuid returning 1)
    select (select count(*) from p)::int, (select count(*) from v)::int,
           (select count(*) from f)::int, (select count(*) from g)::int,
           (select count(*) from s)::int$$,
  $$values (0, 0, 0, 0, 0)$$,
  'multi no borra puntos, variantes ni vínculos del publicado de A'
);

select throws_ok(
  $$insert into drill_coaching_points (organization_id, drill_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, 'Punto de multi', 9)$$,
  '42501', null,
  'multi no añade puntos al publicado de A'
);

select throws_ok(
  $$insert into drill_variants (organization_id, drill_id, title, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, 'Variante de multi', 9)$$,
  '42501', null,
  'multi no añade variantes al publicado de A'
);

select throws_ok(
  $$insert into drill_focus_areas (organization_id, drill_id, focus_area_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, current_setting('fx.f_a2')::uuid)$$,
  '42501', null,
  'multi no vincula un objetivo al publicado de A'
);

select throws_ok(
  $$insert into drill_principles (organization_id, drill_id, principle_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, current_setting('fx.g_a2')::uuid)$$,
  '42501', null,
  'multi no vincula un principio al publicado de A'
);

select throws_ok(
  $$insert into drill_standards (organization_id, drill_id, standard_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, current_setting('fx.s_a2')::uuid)$$,
  '42501', null,
  'multi no vincula un Standard al publicado de A'
);

-- ── adminA: publica, archiva y edita, siempre dentro de su club ──────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select lives_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age)
    values (current_setting('fx.club_a')::uuid, 'Borrador de adminA', 4, 8, 10, 15, 10)$$,
  'adminA crea un borrador'
);

select throws_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, status)
    values (current_setting('fx.club_a')::uuid, 'Publicado por adminA', 4, 8, 10, 15, 10, 'published')$$,
  '42501', null,
  'adminA tampoco crea un ejercicio publicado: se crea en borrador y se publica después'
);

select throws_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age)
    values (current_setting('fx.club_b')::uuid, 'Borrador de adminA en B', 4, 8, 10, 15, 10)$$,
  '42501', null,
  'adminA no crea un borrador en B'
);

select results_eq(
  $$with u as (update drills set status = 'published'
               where title = 'Borrador nuevo de c1' returning status::text)
    select * from u$$,
  $$values ('published')$$,
  'adminA publica el borrador de c1'
);

select lives_ok(
  $$insert into drill_coaching_points (organization_id, drill_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, 'Punto de adminA', 3)$$,
  'adminA añade un punto a un ejercicio publicado'
);

select throws_ok(
  $$update drills set organization_id = current_setting('fx.club_b')::uuid
    where id = current_setting('fx.d_pub')::uuid$$,
  '42501', null,
  'adminA no pasa un ejercicio de A a B'
);

select throws_ok(
  $$delete from drills where id = current_setting('fx.d_pub')::uuid$$,
  '42501', null,
  'nadie borra: ni adminA borra un ejercicio'
);

-- ── c1: lo que adminA publicó ya no es suyo ──────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$with u as (update drills set summary = 'editado'
               where title = 'Borrador nuevo de c1' returning 1)
    select count(*)::int from u$$,
  array[0],
  'c1 ya no edita su ejercicio una vez publicado'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$with u as (update drills set status = 'archived'
               where title = 'Borrador nuevo de c1' returning status::text)
    select * from u$$,
  $$values ('archived')$$,
  'adminA archiva el ejercicio'
);

-- ── El archivado sigue en el histórico (Review Focus 5) ──────────────────────────────
-- «Rebote ofensivo» está archivado y en un ítem de un plan `done` de T1: el staff de T1
-- sigue leyendo su título por `practice_items`.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$select d.title
    from practice_items as pi
    join drills as d on d.id = pi.drill_id
    order by d.title$$,
  $$values ('Rebote ofensivo')$$,
  'el archivado sigue en el histórico: c1 lee el título por practice_items'
);

-- ── Sin política `delete`: tampoco RLS deja borrar ───────────────────────────────────
-- Arriba el borrado falla por privilegios. Si un día alguien da `delete` a `authenticated`
-- (como en las tablas de la metodología), la falta de política tiene que seguir cerrando el
-- paso: el borrado no encuentra filas y `returning` sale vacío. El privilegio se concede
-- aquí, solo dentro de esta transacción, y se retira al terminar.
reset role;
grant delete on table public.drills to authenticated;

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$with d as (delete from drills where id = current_setting('fx.d_pub')::uuid returning 1)
    select count(*)::int from d$$,
  array[0],
  'sin política delete, adminA no borra un ejercicio publicado ni con el privilegio'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$with d as (delete from drills where id = current_setting('fx.d_draft')::uuid returning 1)
    select count(*)::int from d$$,
  array[0],
  'sin política delete, c1 no borra ni su borrador ni con el privilegio'
);

reset role;
revoke delete on table public.drills from authenticated;

-- ── anon: sin privilegios ────────────────────────────────────────────────────────────
select tests.clear_authentication();

select throws_ok('select * from drills', '42501', null, 'anon no tiene acceso a los ejercicios');

-- ── Restricciones (como postgres) ────────────────────────────────────────────────────
-- Las que rechazan se prueban con `update` sobre «Rebote ofensivo»: un CHECK vale igual al
-- crear que al cambiar, y una fila rechazada no deja rastro. Las filas válidas, que sí lo
-- dejan, se crean con `insert`.
reset role;

-- Texto
select throws_ok(
  $$update drills set title = 'ab' where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'título de 2 caracteres rechazado'
);

select throws_ok(
  $$update drills set title = repeat('a', 81) where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'título de 81 caracteres rechazado'
);

select throws_ok(
  $$update drills set summary = repeat('a', 201) where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'resumen de 201 caracteres rechazado'
);

select throws_ok(
  $$update drills set objective = repeat('a', 501) where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'objetivo de 501 caracteres rechazado'
);

select throws_ok(
  $$update drills set setup_md = repeat('a ', 2500) || 'a' where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'organización de 5001 caracteres rechazada'
);

-- Jugadores, duración y edad
select throws_ok(
  $$update drills set min_players = 0 where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'mínimo de 0 jugadores rechazado'
);

select throws_ok(
  $$update drills set max_players = 41 where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'máximo de 41 jugadores rechazado'
);

select throws_ok(
  $$update drills set min_players = 8, max_players = 7 where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'máximo de jugadores menor que el mínimo rechazado'
);

select throws_ok(
  $$update drills set min_minutes = 0 where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'mínimo de 0 minutos rechazado'
);

select throws_ok(
  $$update drills set max_minutes = 121 where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'máximo de 121 minutos rechazado'
);

select throws_ok(
  $$update drills set min_minutes = 15, max_minutes = 14 where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'duración máxima menor que la mínima rechazada'
);

select throws_ok(
  $$update drills set min_age = 7 where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'edad mínima de 7 rechazada'
);

select throws_ok(
  $$update drills set min_age = 19 where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'edad mínima de 19 rechazada'
);

select throws_ok(
  $$update drills set max_age = 19 where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'edad máxima de 19 rechazada'
);

select throws_ok(
  $$update drills set min_age = 12, max_age = 11 where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'edad máxima menor que la mínima rechazada'
);

select throws_ok(
  $$update drills set equipment = array_fill('balón'::text, array[13])
    where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'más de 12 materiales rechazado'
);

-- Vídeo: solo https y solo YouTube o Vimeo. El host tiene que ser exactamente uno de ellos.
select throws_ok(
  $$update drills set video_url = 'http://youtube.com/x' where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'enlace sin https rechazado'
);

select throws_ok(
  $$update drills set video_url = 'https://youtube.com.evil.com/x' where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'enlace a un host que solo empieza como YouTube rechazado'
);

select throws_ok(
  $$update drills set video_url = 'https://evil.com/?youtube.com/' where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'enlace que solo nombra YouTube en la query rechazado'
);

select throws_ok(
  $$update drills set video_url = 'https://evil.com/?u=https://youtube.com/x'
    where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'enlace que lleva otro enlace de YouTube en la query rechazado'
);

select throws_ok(
  $$update drills set video_url = 'https://youtu.be/' || repeat('a', 284)
    where id = current_setting('fx.d_arch')::uuid$$,
  '23514', null, 'enlace de 301 caracteres rechazado'
);

select lives_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, video_url)
    values (current_setting('fx.club_a')::uuid, 'Con youtu.be', 4, 8, 10, 15, 10, 'https://youtu.be/abc')$$,
  'un enlace de youtu.be pasa'
);

select lives_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, video_url)
    values (current_setting('fx.club_a')::uuid, 'Con YouTube', 4, 8, 10, 15, 10, 'https://www.youtube.com/watch?v=abc'),
           (current_setting('fx.club_a')::uuid, 'Con YouTube móvil', 4, 8, 10, 15, 10, 'https://m.youtube.com/watch?v=abc'),
           (current_setting('fx.club_a')::uuid, 'Con Vimeo', 4, 8, 10, 15, 10, 'https://vimeo.com/123')$$,
  'los enlaces de youtube.com, m.youtube.com y vimeo.com pasan'
);

-- Los valores límite entran.
select lives_ok(
  $$insert into drills (
      organization_id, title, summary, objective, setup_md, min_players, max_players,
      min_minutes, max_minutes, min_age, max_age, equipment, video_url
    ) values (
      current_setting('fx.club_a')::uuid, repeat('a', 80), repeat('a', 200), repeat('a', 500),
      repeat('a ', 2500), 1, 40, 1, 120, 8, 18, array_fill('balón'::text, array[12]),
      'https://youtu.be/' || repeat('a', 283)
    ), (
      current_setting('fx.club_a')::uuid, 'abc', null, null, null, 8, 8, 5, 5, 18, 18, '{}', null
    )$$,
  'los valores límite de cada columna entran'
);

select throws_ok(
  $$update drills set status = 'otro' where id = current_setting('fx.d_arch')::uuid$$,
  '22P02', null, 'estado desconocido rechazado: solo draft, published o archived'
);

-- Hijos
select throws_ok(
  $$insert into drill_coaching_points (organization_id, drill_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_arch')::uuid, '', 1)$$,
  '23514', null, 'punto vacío rechazado'
);

select throws_ok(
  $$insert into drill_coaching_points (organization_id, drill_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_arch')::uuid, repeat('a', 141), 1)$$,
  '23514', null, 'punto de 141 caracteres rechazado'
);

select throws_ok(
  $$insert into drill_variants (organization_id, drill_id, title, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_arch')::uuid, '', 1)$$,
  '23514', null, 'título de variante vacío rechazado'
);

select throws_ok(
  $$insert into drill_variants (organization_id, drill_id, title, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_arch')::uuid, repeat('a', 81), 1)$$,
  '23514', null, 'título de variante de 81 caracteres rechazado'
);

select throws_ok(
  $$insert into drill_variants (organization_id, drill_id, title, description, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_arch')::uuid, 'Variante', repeat('a', 501), 1)$$,
  '23514', null, 'descripción de variante de 501 caracteres rechazada'
);

-- ── Claves foráneas compuestas (como postgres) ───────────────────────────────────────
-- Decir que la fila es de A no basta para colgarla de algo de B.
select throws_ok(
  $$insert into drill_standards (organization_id, drill_id, standard_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_arch')::uuid, current_setting('fx.s_b')::uuid)$$,
  '23503', null, 'FK compuesta: un ejercicio de A no recibe un Standard de B'
);

select throws_ok(
  $$insert into drill_focus_areas (organization_id, drill_id, focus_area_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_arch')::uuid, current_setting('fx.f_b')::uuid)$$,
  '23503', null, 'FK compuesta: un ejercicio de A no recibe un objetivo de B'
);

select throws_ok(
  $$insert into drill_principles (organization_id, drill_id, principle_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_arch')::uuid, current_setting('fx.g_b')::uuid)$$,
  '23503', null, 'FK compuesta: un ejercicio de A no recibe un principio de B'
);

select throws_ok(
  $$insert into drill_coaching_points (organization_id, drill_id, text, sort)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.d_arch')::uuid, 'Cruzado', 9)$$,
  '23503', null, 'FK compuesta: un punto de B no cuelga de un ejercicio de A'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes, drill_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_done')::uuid, 2, 10, current_setting('fx.d_b')::uuid)$$,
  '23503', null, 'FK compuesta: un ítem de un plan de A no usa un ejercicio de B'
);

select throws_ok(
  $$insert into drill_coaching_points (organization_id, drill_id, text, sort)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, 'Posición repetida', 1)$$,
  '23505', null, 'la posición de un punto es única por ejercicio'
);

select throws_ok(
  $$insert into drill_standards (organization_id, drill_id, standard_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid, current_setting('fx.s_a')::uuid)$$,
  '23505', null, 'un Standard solo se vincula una vez a un ejercicio'
);

-- ── updated_at y búsqueda (como postgres) ────────────────────────────────────────────
-- `updated_at` es la copia de quien edita: tiene que avanzar aunque el cambio ocurra en la
-- misma transacción que la creación del ejercicio, que es lo que pasa aquí. Con `now()`, que
-- vale lo mismo en toda la transacción, no avanzaría.
select results_eq(
  $$with
      antes as (select updated_at from drills where id = current_setting('fx.d_arch')::uuid),
      despues as (update drills set summary = 'Resumen cambiado.'
                  where id = current_setting('fx.d_arch')::uuid returning updated_at)
    select (select updated_at from despues) > (select updated_at from antes)$$,
  $$values (true)$$,
  'updated_at avanza dentro de la transacción tras un update'
);

select is(
  private.f_unaccent('Transición'),
  'Transicion',
  'f_unaccent quita las tildes'
);

-- «Pase y corte» lleva «Transición» en el resumen. La consulta pasa por `f_unaccent` como lo
-- hará la función de búsqueda: el vector está sin tildes y la consulta también.
select results_eq(
  $$select title from drills
    where search @@ plainto_tsquery('spanish', private.f_unaccent('TRANSICIÓN'))$$,
  $$values ('Pase y corte')$$,
  'search encuentra «TRANSICIÓN» en «Transición»: sin tildes ni mayúsculas'
);

-- ── service_role: el seed y la limpieza de los e2e escriben con la clave de servicio ──
-- PostgREST pone el rol y unos claims sin `sub` (`auth.uid()` es null).
do $$ begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
end $$;
set local role service_role;

-- Insertar calcula `search`, que llama a `private.f_unaccent` con los privilegios de quien
-- inserta.
select lives_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age)
    values (current_setting('fx.club_a')::uuid, 'Creado con la clave de servicio', 4, 8, 10, 15, 10)$$,
  'service_role crea un ejercicio'
);

select results_eq(
  $$with d as (delete from drills where title = 'Creado con la clave de servicio' returning 1)
    select count(*)::int from d$$,
  array[1],
  'service_role borra un ejercicio'
);

reset role;

-- ── Borrado en cascada (como postgres) ───────────────────────────────────────────────
select lives_ok(
  $$delete from drills where id = current_setting('fx.d_b')::uuid$$,
  'un ejercicio con hijos se puede borrar como postgres'
);

select is_empty(
  $$select 'puntos' from drill_coaching_points where drill_id = current_setting('fx.d_b')::uuid
    union all
    select 'variantes' from drill_variants where drill_id = current_setting('fx.d_b')::uuid
    union all
    select 'objetivos' from drill_focus_areas where drill_id = current_setting('fx.d_b')::uuid
    union all
    select 'principios' from drill_principles where drill_id = current_setting('fx.d_b')::uuid
    union all
    select 'standards' from drill_standards where drill_id = current_setting('fx.d_b')::uuid$$,
  'borrar un ejercicio borra sus puntos, variantes y vínculos'
);

-- ── Borrar a la cuenta de un autor ───────────────────────────────────────────────────
-- `created_by` apunta a `auth.users`. Sin `on delete set null`, borrar la cuenta de c1
-- fallaba con 23503 o se llevaba su contenido: el ejercicio se queda y su autor pasa a
-- null. Un borrador sin autor no es de nadie: solo lo ven y lo editan los admins.
select results_eq(
  $$select created_by from drills where id = current_setting('fx.d_draft')::uuid$$,
  $$values (current_setting('fx.c1')::uuid)$$,
  'control: c1, que creó «Borrador de c1», figura como su autor'
);

select lives_ok(
  $$delete from auth.users where id = current_setting('fx.c1')::uuid$$,
  'borrar la cuenta de un autor no falla'
);

select results_eq(
  $$select title, status::text, created_by from drills where id = current_setting('fx.d_draft')::uuid$$,
  $$values ('Borrador de c1', 'draft', null::uuid)$$,
  'el borrador se queda y su autor pasa a null'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select is_empty(
  $$select 1 from drills where id = current_setting('fx.d_draft')::uuid$$,
  'un borrador sin autor no lo ve ningún entrenador'
);

select is_empty(
  $$select 'puntos' from drill_coaching_points where drill_id = current_setting('fx.d_draft')::uuid
    union all
    select 'variantes' from drill_variants where drill_id = current_setting('fx.d_draft')::uuid
    union all
    select 'objetivos' from drill_focus_areas where drill_id = current_setting('fx.d_draft')::uuid
    union all
    select 'principios' from drill_principles where drill_id = current_setting('fx.d_draft')::uuid
    union all
    select 'standards' from drill_standards where drill_id = current_setting('fx.d_draft')::uuid$$,
  'un borrador sin autor tampoco enseña sus hijos a ningún entrenador'
);

select results_eq(
  'select id from drills order by id',
  'select id from tests.all_drill_ids() as t (id) where private.can_see_drill(id) order by id',
  'c2, con un borrador sin autor: la política de drills y can_see_drill ven lo mismo'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$with u as (update drills set summary = 'Revisado por dirección.'
               where id = current_setting('fx.d_draft')::uuid returning 1)
    select count(*)::int from u$$,
  array[1],
  'adminA ve y edita un borrador sin autor'
);

select results_eq(
  $$select (select count(*) from drill_coaching_points where drill_id = current_setting('fx.d_draft')::uuid)::int,
           (select count(*) from drill_variants where drill_id = current_setting('fx.d_draft')::uuid)::int,
           (select count(*) from drill_focus_areas where drill_id = current_setting('fx.d_draft')::uuid)::int,
           (select count(*) from drill_principles where drill_id = current_setting('fx.d_draft')::uuid)::int,
           (select count(*) from drill_standards where drill_id = current_setting('fx.d_draft')::uuid)::int$$,
  $$values (1, 2, 1, 1, 1)$$,
  'adminA ve los hijos de un borrador sin autor'
);

select results_eq(
  'select id from drills order by id',
  'select id from tests.all_drill_ids() as t (id) where private.can_see_drill(id) order by id',
  'adminA, con un borrador sin autor: la política de drills y can_see_drill ven lo mismo'
);

-- ── Solo cuentan las membresías activas ──────────────────────────────────────────────
-- Control positivo: es el mismo c2 que arriba veía lo publicado de A.
reset role;
update memberships set status = 'revoked' where user_id = current_setting('fx.c2')::uuid;
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select is_empty(
  $$select 'drills' from drills
    union all select 'puntos' from drill_coaching_points
    union all select 'variantes' from drill_variants
    union all select 'objetivos' from drill_focus_areas
    union all select 'principios' from drill_principles
    union all select 'standards' from drill_standards$$,
  'una membresía revocada no ve nada en las seis tablas'
);

-- ── Tipo, RLS, privilegios y políticas (catálogo) ────────────────────────────────────
reset role;

select enum_has_labels(
  'public', 'drill_status', array['draft', 'published', 'archived'],
  'drill_status es draft, published o archived'
);

select results_eq(
  $$select count(*)::int from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in (
        'drills', 'drill_coaching_points', 'drill_variants',
        'drill_focus_areas', 'drill_principles', 'drill_standards'
      )
      and relrowsecurity$$,
  array[6],
  'RLS activado en las seis tablas'
);

select results_eq(
  $$select count(*)::int
    from pg_attribute as a
    join pg_class as c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'drills', 'drill_coaching_points', 'drill_variants',
        'drill_focus_areas', 'drill_principles', 'drill_standards'
      )
      and a.attname = 'organization_id'
      and a.attnotnull$$,
  array[6],
  'organization_id es obligatorio en las seis tablas'
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
        'drills', 'drill_coaching_points', 'drill_variants',
        'drill_focus_areas', 'drill_principles', 'drill_standards'
      )
      and has_table_privilege('anon', c.oid, p.privilege)$$,
  'anon no tiene ningún privilegio sobre las tablas'
);

-- `drills` no se borra: sin `delete` para nadie salvo la clave de servicio.
select results_eq(
  $$select has_table_privilege('authenticated', 'public.drills', 'select'),
           has_table_privilege('authenticated', 'public.drills', 'insert'),
           has_table_privilege('authenticated', 'public.drills', 'update'),
           has_table_privilege('authenticated', 'public.drills', 'delete')$$,
  $$values (true, true, true, false)$$,
  'authenticated lee, crea y cambia ejercicios, y no los borra'
);

select results_eq(
  $$select count(*)::int
    from pg_class as c
    cross join unnest(array['select', 'insert', 'update', 'delete']) as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'drill_coaching_points', 'drill_variants',
        'drill_focus_areas', 'drill_principles', 'drill_standards'
      )
      and has_table_privilege('authenticated', c.oid, p.privilege)$$,
  array[20],
  'authenticated puede leer y escribir las cinco tablas hijas, con RLS por delante'
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
        'drills', 'drill_coaching_points', 'drill_variants',
        'drill_focus_areas', 'drill_principles', 'drill_standards'
      )
      and has_table_privilege('authenticated', c.oid, p.privilege)$$,
  'authenticated no tiene truncate, references ni trigger en ninguna tabla'
);

-- El seed y la limpieza de los e2e escriben con la clave de servicio (nunca desde src/).
select results_eq(
  $$select count(*)::int
    from pg_class as c
    cross join unnest(array['select', 'insert', 'update', 'delete']) as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'drills', 'drill_coaching_points', 'drill_variants',
        'drill_focus_areas', 'drill_principles', 'drill_standards'
      )
      and has_table_privilege('service_role', c.oid, p.privilege)$$,
  array[24],
  'service_role puede leer y escribir las seis tablas'
);

-- Sin política no hay acceso: lectura, alta y cambio en las seis tablas, y borrado solo en
-- las hijas. Las columnas de tipo `name` del catálogo se pasan a texto para compararlas con
-- `values`, y `set_eq` no depende de la collation con que se ordenen los nombres.
select set_eq(
  $$select tablename::text, policyname::text, cmd::text, roles::text[], permissive::text
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'drills', 'drill_coaching_points', 'drill_variants',
        'drill_focus_areas', 'drill_principles', 'drill_standards'
      )$$,
  $$values
    ('drills', 'drills_select_visible', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('drills', 'drills_insert_own_draft', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('drills', 'drills_update_editable', 'UPDATE', array['authenticated'], 'PERMISSIVE'),
    ('drill_coaching_points', 'drill_coaching_points_select_visible', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('drill_coaching_points', 'drill_coaching_points_insert_editable', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('drill_coaching_points', 'drill_coaching_points_update_editable', 'UPDATE', array['authenticated'], 'PERMISSIVE'),
    ('drill_coaching_points', 'drill_coaching_points_delete_editable', 'DELETE', array['authenticated'], 'PERMISSIVE'),
    ('drill_variants', 'drill_variants_select_visible', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('drill_variants', 'drill_variants_insert_editable', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('drill_variants', 'drill_variants_update_editable', 'UPDATE', array['authenticated'], 'PERMISSIVE'),
    ('drill_variants', 'drill_variants_delete_editable', 'DELETE', array['authenticated'], 'PERMISSIVE'),
    ('drill_focus_areas', 'drill_focus_areas_select_visible', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('drill_focus_areas', 'drill_focus_areas_insert_editable', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('drill_focus_areas', 'drill_focus_areas_update_editable', 'UPDATE', array['authenticated'], 'PERMISSIVE'),
    ('drill_focus_areas', 'drill_focus_areas_delete_editable', 'DELETE', array['authenticated'], 'PERMISSIVE'),
    ('drill_principles', 'drill_principles_select_visible', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('drill_principles', 'drill_principles_insert_editable', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('drill_principles', 'drill_principles_update_editable', 'UPDATE', array['authenticated'], 'PERMISSIVE'),
    ('drill_principles', 'drill_principles_delete_editable', 'DELETE', array['authenticated'], 'PERMISSIVE'),
    ('drill_standards', 'drill_standards_select_visible', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('drill_standards', 'drill_standards_insert_editable', 'INSERT', array['authenticated'], 'PERMISSIVE'),
    ('drill_standards', 'drill_standards_update_editable', 'UPDATE', array['authenticated'], 'PERMISSIVE'),
    ('drill_standards', 'drill_standards_delete_editable', 'DELETE', array['authenticated'], 'PERMISSIVE')$$,
  'las políticas de las seis tablas: leer, crear y editar, y borrar solo en las hijas'
);

-- Las funciones de RLS son solo de `authenticated`; `f_unaccent` también de `service_role`,
-- que inserta ejercicios desde el seed.
select results_eq(
  $$select has_function_privilege('anon', 'private.can_see_drill(uuid)', 'execute'),
           has_function_privilege('authenticated', 'private.can_see_drill(uuid)', 'execute'),
           has_function_privilege('anon', 'private.can_edit_drill(uuid)', 'execute'),
           has_function_privilege('authenticated', 'private.can_edit_drill(uuid)', 'execute')$$,
  $$values (false, true, false, true)$$,
  'can_see_drill y can_edit_drill las ejecuta authenticated y no anon'
);

select results_eq(
  $$select has_function_privilege('anon', 'private.f_unaccent(text)', 'execute'),
           has_function_privilege('authenticated', 'private.f_unaccent(text)', 'execute'),
           has_function_privilege('service_role', 'private.f_unaccent(text)', 'execute')$$,
  $$values (false, true, true)$$,
  'f_unaccent la ejecutan authenticated y service_role, y no anon'
);

-- ── Índices ──────────────────────────────────────────────────────────────────────────
select has_index(
  'public'::name, 'drills'::name, 'drills_search_idx'::name, 'search'::name,
  'drills tiene índice sobre search'::text
);

select results_eq(
  $$select am.amname::text collate "default"
    from pg_class as c
    join pg_am as am on am.oid = c.relam
    where c.relnamespace = 'public'::regnamespace and c.relname = 'drills_search_idx'$$,
  $$values ('gin')$$,
  'el índice de search es GIN'
);

select has_index(
  'public'::name, 'drills'::name, 'drills_organization_id_status_idx'::name,
  array['organization_id', 'status']::name[],
  'drills tiene índice por club y estado'::text
);

select has_index(
  'public'::name, 'drill_focus_areas'::name, 'drill_focus_areas_focus_area_id_idx'::name,
  'focus_area_id'::name,
  'drill_focus_areas tiene índice por objetivo'::text
);

select has_index(
  'public'::name, 'drill_principles'::name, 'drill_principles_principle_id_idx'::name,
  'principle_id'::name,
  'drill_principles tiene índice por principio'::text
);

select has_index(
  'public'::name, 'drill_standards'::name, 'drill_standards_standard_id_idx'::name,
  'standard_id'::name,
  'drill_standards tiene índice por Standard'::text
);

-- La clave foránea compuesta de los ítems es `(organization_id, drill_id)`: sin un índice que
-- empiece por ahí, cambiar o borrar un ejercicio recorre los ítems de todos los clubes.
select has_index(
  'public'::name, 'practice_items'::name, 'practice_items_organization_id_drill_id_idx'::name,
  array['organization_id', 'drill_id']::name[],
  'practice_items tiene índice por club y ejercicio'::text
);

select * from finish();

rollback;
