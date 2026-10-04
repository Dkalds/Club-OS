-- Biblioteca de ejercicios: búsqueda sin tildes y filtros (`public.search_drills`).
--
-- La función es `security invoker`: lo que devuelve lo decide RLS de `drills` (un borrador solo
-- lo ven su autor y el admin; los jugadores y quien no es del club, nada) y la función solo
-- añade las condiciones de la búsqueda: club, estado (el archivado no sale), texto, objetivo,
-- principio, edad, jugadores y minutos. Este test comprueba las dos mitades: que cada filtro
-- filtra, y que la función no abre a nadie lo que RLS le cierra.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*`
-- vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al
-- final. Los datos son ficticios y solo de este test; los emails y los ids de club no chocan
-- con los de `pnpm seed` ni con los de los otros tests.
begin;

select plan(66);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A
--   adminA es admin; c1 y c2 son entrenadores; jugA es un jugador (rol player). `multi` es
--   entrenador de A y admin de B: ve los dos clubes y la función tiene que quedarse con el que
--   se le pide.
--   Ejercicios (título → estado, edad, jugadores, minutos; objetivo y principio):
--     «4x4 transición»    → publicado, U12+, 8–12, 15–20; objetivo y principio `transicion`
--     «Rebote + outlet»   → publicado, U12+, 6–12, 10–15; objetivo `rebote`; «compañeros» en el
--                           resumen
--     «Bote y control»    → publicado, U8–U12, 4–12, 10–15; «aros» en la organización
--     «Bloqueo de rebote» → borrador de c1, U10+, 6–10, 10–15; objetivo `rebote`
--     «Rebote ofensivo»   → archivado, U10+, 6–12, 10–15; objetivo `rebote`
--   Un archivado que cumpliría casi todos los filtros: si saliera, se notaría en casi todas
--   las aserciones.
-- Club B
--   coachB es coach. «Rebote B» (publicado, U10+, 6–12, 10–20) con objetivo `rebote` y
--   principio `transicion`: los mismos slugs que A, para que ninguna búsqueda mezcle clubes.
--
-- Los ids quedan en ajustes `fx.*` de la transacción. Las aserciones ordenan por título con
-- collation "C" para que el orden no dependa de la configuración del servidor: dígitos,
-- mayúsculas y minúsculas, en ese orden.
do $$
declare
  club_a constant uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  club_b constant uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  u_admin_a uuid := tests.create_user('admin-a@drillsearch.pgtap.test');
  u_c1 uuid := tests.create_user('c1@drillsearch.pgtap.test');
  u_c2 uuid := tests.create_user('c2@drillsearch.pgtap.test');
  u_jug_a uuid := tests.create_user('jug-a@drillsearch.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@drillsearch.pgtap.test');
  u_multi uuid := tests.create_user('multi@drillsearch.pgtap.test');

  p_jug_a constant uuid := gen_random_uuid();

  f_rebote_a constant uuid := gen_random_uuid();
  f_trans_a constant uuid := gen_random_uuid();
  f_rebote_b constant uuid := gen_random_uuid();
  g_trans_a constant uuid := gen_random_uuid();
  g_trans_b constant uuid := gen_random_uuid();

  d_4x4 constant uuid := gen_random_uuid();
  d_outlet constant uuid := gen_random_uuid();
  d_bote constant uuid := gen_random_uuid();
  d_block constant uuid := gen_random_uuid();
  d_arch constant uuid := gen_random_uuid();
  d_b constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_jug_a, club_a, 'jugA', 'Ficticio', 2015);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', null),
    (club_a, u_c1, 'coach', null),
    (club_a, u_c2, 'coach', null),
    (club_a, u_jug_a, 'player', p_jug_a),
    (club_b, u_coach_b, 'coach', null),
    (club_a, u_multi, 'coach', null),
    (club_b, u_multi, 'admin', null);

  insert into focus_areas (id, organization_id, slug, name, sort) values
    (f_rebote_a, club_a, 'rebote', 'Rebote', 10),
    (f_trans_a, club_a, 'transicion', 'Transición', 20),
    (f_rebote_b, club_b, 'rebote', 'Rebote B', 10);

  insert into game_principles (id, organization_id, slug, title, status) values
    (g_trans_a, club_a, 'transicion', 'Transición de A', 'published'),
    (g_trans_b, club_b, 'transicion', 'Transición de B', 'published');

  insert into drills (
    id, organization_id, title, summary, objective, setup_md, min_players, max_players,
    min_minutes, max_minutes, min_age, max_age, status, created_by
  ) values
    (d_4x4, club_a, '4x4 transición', 'Juego reducido con cambios de ritmo.', null, null,
     8, 12, 15, 20, 12, null, 'published', u_admin_a),
    (d_outlet, club_a, 'Rebote + outlet', 'Pase de salida con los compañeros.', null, null,
     6, 12, 10, 15, 12, null, 'published', u_admin_a),
    (d_bote, club_a, 'Bote y control', null, null, 'Aros en el suelo y un balón por jugador.',
     4, 12, 10, 15, 8, 12, 'published', u_admin_a),
    (d_block, club_a, 'Bloqueo de rebote', null, null, null,
     6, 10, 10, 15, 10, null, 'draft', u_c1),
    (d_arch, club_a, 'Rebote ofensivo', 'Segunda oportunidad.', null, null,
     6, 12, 10, 15, 10, null, 'archived', u_admin_a),
    (d_b, club_b, 'Rebote B', null, null, null,
     6, 12, 10, 20, 10, null, 'published', u_coach_b);

  insert into drill_focus_areas (organization_id, drill_id, focus_area_id) values
    (club_a, d_4x4, f_trans_a),
    (club_a, d_outlet, f_rebote_a),
    (club_a, d_block, f_rebote_a),
    (club_a, d_arch, f_rebote_a),
    (club_b, d_b, f_rebote_b);

  insert into drill_principles (organization_id, drill_id, principle_id) values
    (club_a, d_4x4, g_trans_a),
    (club_b, d_b, g_trans_b);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.c2', u_c2::text, true);
  perform set_config('fx.jug_a', u_jug_a::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.multi', u_multi::text, true);
  perform set_config('fx.d_block', d_block::text, true);
  perform set_config('fx.d_arch', d_arch::text, true);
  perform set_config('fx.d_b', d_b::text, true);
end
$$;

-- ── private.f_search_key (como postgres) ─────────────────────────────────────────────
-- La clave de comparación de la búsqueda por prefijo: sin tildes, en minúsculas y con todo lo
-- que no sea letra o número convertido en un único espacio. Solo lleva `[a-z0-9 ]`, así que
-- cabe en un `like` sin escapar nada.
select is(
  private.f_search_key('  Árbol: ¡Rápido!  Ñandú_2x2 '),
  'arbol rapido nandu 2x2',
  'f_search_key quita tildes, pasa a minúsculas y deja un espacio entre palabras'
);

select is(
  private.f_search_key('%_''-+ '),
  '',
  'f_search_key de solo símbolos es la cadena vacía'
);

select is(
  private.f_search_key(null),
  null,
  'f_search_key de null es null'
);

-- ── c2 (entrenador): búsqueda por texto ──────────────────────────────────────────────
-- Todo lo que sigue es de A y lo pide c2, salvo indicación.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

-- Sin criterios: lo publicado del club. Ni el borrador de c1, ni el archivado, ni lo de B.
select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid)
    order by title collate "C"$$,
  $$values ('4x4 transición'), ('Bote y control'), ('Rebote + outlet')$$,
  'sin criterios, c2 recibe lo publicado de A y nada más'
);

-- Review Focus 2: sin tildes ni mayúsculas, y por prefijo de palabra del título.
select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'transicion')$$,
  $$values ('4x4 transición')$$,
  '«transicion» encuentra «4x4 transición»'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'TRANSICIÓN')$$,
  $$values ('4x4 transición')$$,
  '«TRANSICIÓN» encuentra «4x4 transición»'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'transi')$$,
  $$values ('4x4 transición')$$,
  '«transi» encuentra «4x4 transición» por prefijo'
);

-- El prefijo también ignora tildes y mayúsculas: «transició» no es una palabra entera que el
-- texto completo conozca, pero sí el principio de «transicion».
select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'TRANSICIÓ')$$,
  $$values ('4x4 transición')$$,
  '«TRANSICIÓ» encuentra «4x4 transición» por prefijo, sin tildes ni mayúsculas'
);

-- Es prefijo de palabra, no una subcadena cualquiera: «ebote» está dentro de «Rebote» y de
-- «Bote» pero no empieza ninguna palabra.
select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'ebote')$$,
  '«ebote» no encuentra nada: el prefijo es de palabra'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'outl')$$,
  $$values ('Rebote + outlet')$$,
  '«outl» encuentra «Rebote + outlet» por prefijo'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'rebote outlet')$$,
  $$values ('Rebote + outlet')$$,
  '«rebote outlet» encuentra «Rebote + outlet»: todas las palabras, sin el «+»'
);

-- El prefijo abarca varias palabras seguidas del título: el texto completo no encuentra
-- «out», pero «rebote out» es el principio de «rebote outlet».
select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'rebote out')$$,
  $$values ('Rebote + outlet')$$,
  '«rebote out» encuentra «Rebote + outlet» por prefijo de varias palabras'
);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'zzz')$$,
  '«zzz» no encuentra nada'
);

-- El texto completo (`search`) entiende las formas de la palabra y lee el resumen y la
-- organización, no solo el título: ninguno de estos tres se encuentra por prefijo del título.
select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'transiciones')$$,
  $$values ('4x4 transición')$$,
  '«transiciones» encuentra «4x4 transición»: el plural se reduce a la misma raíz'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'COMPAÑEROS')$$,
  $$values ('Rebote + outlet')$$,
  '«COMPAÑEROS» encuentra «Rebote + outlet» por el resumen, con la ñ y las mayúsculas'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'aros')$$,
  $$values ('Bote y control')$$,
  '«aros» encuentra «Bote y control» por la organización'
);

-- Una palabra vacía suelta se ignora en el texto completo y el resto sigue contando.
select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'rebote de outlet')$$,
  $$values ('Rebote + outlet')$$,
  '«rebote de outlet» ignora «de» y encuentra «Rebote + outlet»'
);

-- Una búsqueda sin letras ni números equivale a no buscar: la función no falla y devuelve lo
-- mismo que con `null`. Sin clave de búsqueda no se aplica ninguna condición de texto, ni
-- siquiera se construye la consulta de texto completo.
select lives_ok(
  $$select * from public.search_drills(current_setting('fx.club_a')::uuid, p_q => '%_''')$$,
  'una búsqueda de solo símbolos no falla'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => '%_''')
    order by title collate "C"$$,
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid)
    order by title collate "C"$$,
  'una búsqueda de solo símbolos devuelve lo mismo que no buscar'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => '   ')
    order by title collate "C"$$,
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid)
    order by title collate "C"$$,
  'una búsqueda de solo espacios devuelve lo mismo que no buscar'
);

-- Una palabra vacía sola («de») es texto para la clave pero no deja ninguna palabra en el
-- texto completo: queda el prefijo del título. En A, ningún título publicado tiene una
-- palabra que empiece por «de».
select lives_ok(
  $$select * from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'de')$$,
  '«de» (solo una palabra vacía) no falla'
);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'de')$$,
  'c2: «de» solo encuentra títulos con una palabra que empiece por «de», y no hay ninguno'
);

-- ── c2: filtros ──────────────────────────────────────────────────────────────────────
-- Objetivo y principio: por slug del club. Un slug que no existe no es un error.
select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_focus => 'rebote')$$,
  $$values ('Rebote + outlet')$$,
  'objetivo «rebote»: solo el publicado que lo trabaja'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_focus => 'transicion')$$,
  $$values ('4x4 transición')$$,
  'objetivo «transicion»'
);

select lives_ok(
  $$select * from public.search_drills(current_setting('fx.club_a')::uuid, p_focus => 'no-existe')$$,
  'un objetivo que no existe en el club no falla'
);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_focus => 'no-existe')$$,
  'un objetivo que no existe en el club no devuelve nada'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_principle => 'transicion')$$,
  $$values ('4x4 transición')$$,
  'principio «transicion»'
);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_principle => 'rebote')$$,
  'un principio solo mira los principios: «rebote» es un objetivo, no un principio'
);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_principle => 'no-existe')$$,
  'un principio que no existe en el club no devuelve nada'
);

-- Edad: la categoría (el número de la «U») tiene que caer dentro de la edad del ejercicio, y
-- una edad máxima abierta no excluye a nadie por arriba.
select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_age => 12)
    order by title collate "C"$$,
  $$values ('4x4 transición'), ('Bote y control'), ('Rebote + outlet')$$,
  'edad 12: «Bote y control» (U8–U12) y los U12+'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_age => 14)
    order by title collate "C"$$,
  $$values ('4x4 transición'), ('Rebote + outlet')$$,
  'edad 14: «Bote y control» ya no, y los U12+ siguen'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_age => 10)$$,
  $$values ('Bote y control')$$,
  'edad 10: ningún U12+'
);

-- Jugadores y minutos: el valor tiene que caer dentro del rango del ejercicio, extremos
-- incluidos.
select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_players => 5)$$,
  $$values ('Bote y control')$$,
  '5 jugadores: solo «Bote y control»'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_players => 12)
    order by title collate "C"$$,
  $$values ('4x4 transición'), ('Bote y control'), ('Rebote + outlet')$$,
  '12 jugadores: el máximo de cada rango cuenta'
);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_players => 13)$$,
  '13 jugadores: ninguno'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_minutes => 20)$$,
  $$values ('4x4 transición')$$,
  '20 minutos: solo «4x4 transición»'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_minutes => 12)
    order by title collate "C"$$,
  $$values ('Bote y control'), ('Rebote + outlet')$$,
  '12 minutos: los de 10–15, y no el de 15–20'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_minutes => 15)
    order by title collate "C"$$,
  $$values ('4x4 transición'), ('Bote y control'), ('Rebote + outlet')$$,
  '15 minutos: el máximo de unos y el mínimo de otro cuentan'
);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_minutes => 21)$$,
  '21 minutos: ninguno'
);

select results_eq(
  $$select title from public.search_drills(
      current_setting('fx.club_a')::uuid, p_principle => 'transicion', p_minutes => 20)$$,
  $$values ('4x4 transición')$$,
  '20 minutos y principio «transicion»: solo «4x4 transición»'
);

-- Combinaciones: todas las condiciones a la vez.
select results_eq(
  $$select title from public.search_drills(
      current_setting('fx.club_a')::uuid, p_q => 'rebote', p_age => 12, p_players => 7, p_minutes => 10)$$,
  $$values ('Rebote + outlet')$$,
  'texto, edad, jugadores y minutos a la vez'
);

select is_empty(
  $$select 1 from public.search_drills(
      current_setting('fx.club_a')::uuid, p_q => 'rebote', p_minutes => 20)$$,
  'texto y minutos que no coinciden: ninguno'
);

-- Review Focus 1: la combinación sin resultados para c2. «Rebote + outlet» es U12+ y el único
-- otro ejercicio del objetivo es un borrador de c1.
select is_empty(
  $$select 1 from public.search_drills(
      current_setting('fx.club_a')::uuid, p_focus => 'rebote', p_age => 10)$$,
  'combinación sin resultados: objetivo «rebote» y 10 años no dan nada a c2'
);

-- ── c2: lo que RLS le cierra (Review Focus 1 y 5) ────────────────────────────────────
-- El borrador de c1 existe, con título, objetivo y edad que cumplen estas búsquedas: si c2
-- lo recibiera, la función estaría saltándose RLS.
select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid)
      where id = current_setting('fx.d_block')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'bloqueo de rebote')
      where id = current_setting('fx.d_block')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'bloq')
      where id = current_setting('fx.d_block')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_focus => 'rebote')
      where id = current_setting('fx.d_block')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_age => 10)
      where id = current_setting('fx.d_block')::uuid$$,
  'c2 nunca recibe el borrador de c1, por muchos criterios que lo describan'
);

-- ── c1 (entrenador): su borrador sí ──────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid)
    order by title collate "C"$$,
  $$values ('4x4 transición'), ('Bloqueo de rebote'), ('Bote y control'), ('Rebote + outlet')$$,
  'sin criterios, c1 recibe lo publicado y su borrador, y no el archivado'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'rebote')
    order by title collate "C"$$,
  $$values ('Bloqueo de rebote'), ('Rebote + outlet')$$,
  'c1: «rebote» encuentra su borrador y el publicado, y no el archivado'
);

select results_eq(
  $$select title from public.search_drills(
      current_setting('fx.club_a')::uuid, p_focus => 'rebote', p_age => 10)$$,
  $$values ('Bloqueo de rebote')$$,
  'combinación sin resultados para c2: c1 recibe su borrador'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'de')$$,
  $$values ('Bloqueo de rebote')$$,
  'c1: «de» (solo una palabra vacía) se queda con el prefijo del título'
);

-- ── adminA: ve todos los borradores del club, y tampoco el archivado ─────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid)
    order by title collate "C"$$,
  $$values ('4x4 transición'), ('Bloqueo de rebote'), ('Bote y control'), ('Rebote + outlet')$$,
  'sin criterios, adminA recibe lo publicado y el borrador de c1, y no el archivado'
);

-- ── El archivado no sale a nadie ─────────────────────────────────────────────────────
-- «Rebote ofensivo» está archivado: se encuentra por título, por objetivo, por edad y sin
-- criterios en ninguna de las tres cuentas.
select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid)
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'rebote ofensivo')
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'ofens')
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_focus => 'rebote')
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_age => 10)
      where id = current_setting('fx.d_arch')::uuid$$,
  'adminA no recibe el archivado'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid)
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'rebote ofensivo')
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'ofens')
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_focus => 'rebote')
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_age => 10)
      where id = current_setting('fx.d_arch')::uuid$$,
  'c1 no recibe el archivado'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid)
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'rebote ofensivo')
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'ofens')
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_focus => 'rebote')
      where id = current_setting('fx.d_arch')::uuid
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_age => 10)
      where id = current_setting('fx.d_arch')::uuid$$,
  'c2 no recibe el archivado'
);

-- ── Otro club y otro rol ─────────────────────────────────────────────────────────────
-- coachB es de B: A no es suyo, con ningún criterio. En B, donde sí es entrenador, recibe lo
-- suyo, también por los slugs que A y B comparten.
select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid)
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'rebote')
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_focus => 'rebote')
    union all
    select 1 from public.search_drills(current_setting('fx.club_a')::uuid, p_principle => 'transicion')$$,
  'coachB con el club A: nada, sea cual sea el criterio'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_b')::uuid)$$,
  $$values ('Rebote B')$$,
  'coachB recibe lo suyo en B'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_b')::uuid, p_focus => 'rebote')$$,
  $$values ('Rebote B')$$,
  'coachB: el objetivo «rebote» de B es el de B'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_b')::uuid, p_principle => 'transicion')$$,
  $$values ('Rebote B')$$,
  'coachB: el principio «transicion» de B es el de B'
);

-- multi ve los dos clubes (coach de A, admin de B): la función se queda con el que se le
-- pide, aunque RLS le dejaría ver los dos.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid)
    order by title collate "C"$$,
  $$values ('4x4 transición'), ('Bote y control'), ('Rebote + outlet')$$,
  'multi con el club A: lo publicado de A, ni el borrador de c1 ni nada de B'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_b')::uuid)$$,
  $$values ('Rebote B')$$,
  'multi con el club B: solo lo de B'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_q => 'rebote')$$,
  $$values ('Rebote + outlet')$$,
  'multi busca «rebote» en A y no encuentra «Rebote B»'
);

select results_eq(
  $$select title from public.search_drills(current_setting('fx.club_a')::uuid, p_principle => 'transicion')$$,
  $$values ('4x4 transición')$$,
  'multi con el principio «transicion» en A: el de A, no el de B, que tiene el mismo slug'
);

-- Un jugador es del club, pero la biblioteca es del cuerpo técnico.
select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select is_empty(
  $$select 1 from public.search_drills(current_setting('fx.club_a')::uuid)$$,
  'jugA no recibe ningún ejercicio'
);

-- ── anon: sin acceso a la función ────────────────────────────────────────────────────
select tests.clear_authentication();

select throws_ok(
  $$select * from public.search_drills(current_setting('fx.club_a')::uuid)$$,
  '42501', null,
  'anon no ejecuta search_drills'
);

-- ── Funciones: tipo, privilegios (catálogo) ──────────────────────────────────────────
reset role;

-- `f_search_key` es pura (inmutable) como `f_unaccent`. `search_drills` es `stable` y
-- `security invoker`: RLS se aplica con el usuario de la sesión. Las dos fijan su search_path;
-- `search_drills` además silencia los avisos del cliente (ver la migración).
select results_eq(
  $$select p.provolatile::text collate "default", p.prosecdef, l.lanname::text collate "default",
           p.proconfig @> array['search_path=""']
    from pg_proc as p
    join pg_language as l on l.oid = p.prolang
    where p.oid = 'private.f_search_key(text)'::regprocedure$$,
  $$values ('i', false, 'sql', true)$$,
  'f_search_key es sql inmutable, security invoker y con search_path vacío'
);

select results_eq(
  $$select p.provolatile::text collate "default", p.prosecdef, l.lanname::text collate "default", p.proretset,
           p.proconfig @> array['search_path=""', 'client_min_messages=warning']
    from pg_proc as p
    join pg_language as l on l.oid = p.prolang
    where p.oid = 'public.search_drills(uuid, text, text, text, integer, integer, integer)'::regprocedure$$,
  $$values ('s', false, 'sql', true, true)$$,
  'search_drills es sql stable, security invoker y devuelve un conjunto, con search_path vacío'
);

select results_eq(
  $$select has_function_privilege('public', 'private.f_search_key(text)', 'execute'),
           has_function_privilege('anon', 'private.f_search_key(text)', 'execute'),
           has_function_privilege('authenticated', 'private.f_search_key(text)', 'execute')$$,
  $$values (false, false, true)$$,
  'f_search_key la ejecuta authenticated, y no PUBLIC ni anon'
);

select results_eq(
  $$select
      has_function_privilege('public', 'public.search_drills(uuid, text, text, text, integer, integer, integer)', 'execute'),
      has_function_privilege('anon', 'public.search_drills(uuid, text, text, text, integer, integer, integer)', 'execute'),
      has_function_privilege('service_role', 'public.search_drills(uuid, text, text, text, integer, integer, integer)', 'execute'),
      has_function_privilege('authenticated', 'public.search_drills(uuid, text, text, text, integer, integer, integer)', 'execute')$$,
  $$values (false, false, false, true)$$,
  'search_drills la ejecuta authenticated, y no PUBLIC, anon ni service_role'
);

select * from finish();

rollback;
