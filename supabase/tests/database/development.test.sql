-- Objetivos y notas de jugador (Fase 6): quién los lee y quién los escribe.
--
-- Lo que RLS, los privilegios por columna y los triggers garantizan:
--   · un objetivo lo leen y lo escriben quien gestiona el equipo (su cuerpo técnico y el admin
--     de su club) y nadie más: ni el cuerpo técnico de otro equipo, ni otro club, ni un jugador;
--     solo de un jugador de la plantilla de ese equipo y con un Standard publicado del club;
--   · como mucho tres objetivos activos por jugador, sumando todos sus equipos (GOAL_LIMIT);
--   · un objetivo logrado o archivado ya no cambia; `achieved_at` lo pone la base; no se borran;
--   · una nota privada la lee solo su autor, también frente a dirección y al resto del cuerpo
--     técnico; una de cuerpo técnico, el cuerpo técnico del equipo y dirección; solo su autor
--     la cambia o la borra; quien deja el cuerpo técnico sigue con las suyas y no crea nuevas.
--
-- Un `update` o un `delete` que RLS no deja pasar no falla: no encuentra filas. Por eso esas
-- aserciones miran el estado después, como postgres.
--
-- Se ejecuta con `pnpm test:db`. Todo ocurre en una transacción que se deshace al final. Los
-- datos son ficticios y solo de este test.
begin;

select plan(60);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A
--   T1: staff c1 (principal) y c1b (ayudante); jugadores p1 y p2.
--   T2: staff c2; jugadores p1 (también) y p3.
--   adminA es admin, sin persona. `jugador` es la cuenta de p1.
-- Club B
--   TB: staff cb; jugador pb.
-- Standards: s_pub (publicado) y s_draft (borrador) en A; s_b en B. Focos f_a y f_b.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@development.pgtap.test');
  u_c1 uuid := tests.create_user('c1@development.pgtap.test');
  u_c1b uuid := tests.create_user('c1b@development.pgtap.test');
  u_c2 uuid := tests.create_user('c2@development.pgtap.test');
  u_jugador uuid := tests.create_user('jugador@development.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@development.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_c1b constant uuid := gen_random_uuid();
  p_c2 constant uuid := gen_random_uuid();
  p_cb constant uuid := gen_random_uuid();
  p1 constant uuid := gen_random_uuid();
  p2 constant uuid := gen_random_uuid();
  p3 constant uuid := gen_random_uuid();
  pb constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  season_b constant uuid := gen_random_uuid();
  cat_a constant uuid := gen_random_uuid();
  cat_b constant uuid := gen_random_uuid();
  t1 constant uuid := gen_random_uuid();
  t2 constant uuid := gen_random_uuid();
  tb constant uuid := gen_random_uuid();

  f_a constant uuid := gen_random_uuid();
  f_b constant uuid := gen_random_uuid();
  s_pub constant uuid := gen_random_uuid();
  s_draft constant uuid := gen_random_uuid();
  s_b constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_c1b, club_a, 'c1b', 'Ficticio', null),
    (p_c2, club_a, 'c2', 'Ficticia', null),
    (p_cb, club_b, 'cb', 'Ficticio', null),
    (p1, club_a, 'p1', 'Ficticio', 2015),
    (p2, club_a, 'p2', 'Ficticio', 2015),
    (p3, club_a, 'p3', 'Ficticio', 2017),
    (pb, club_b, 'pb', 'Ficticio', 2013);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', null),
    (club_a, u_c1, 'coach', p_c1),
    (club_a, u_c1b, 'coach', p_c1b),
    (club_a, u_c2, 'coach', p_c2),
    (club_a, u_jugador, 'player', p1),
    (club_b, u_coach_b, 'coach', p_cb);

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true),
    (season_b, club_b, '2026/27', '2026-09-01', '2027-06-30', true);

  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_a, club_a, 'Alevín', 'U12', 10),
    (cat_b, club_b, 'Infantil', 'U14', 10);

  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, club_a, season_a, cat_a, 'T1'),
    (t2, club_a, season_a, cat_a, 'T2'),
    (tb, club_b, season_b, cat_b, 'TB');

  insert into team_staff (organization_id, team_id, person_id, staff_role) values
    (club_a, t1, p_c1, 'head_coach'),
    (club_a, t1, p_c1b, 'assistant'),
    (club_a, t2, p_c2, 'head_coach'),
    (club_b, tb, p_cb, 'head_coach');

  insert into team_players (organization_id, team_id, person_id, jersey_number) values
    (club_a, t1, p1, 4),
    (club_a, t1, p2, 5),
    (club_a, t2, p1, 4),
    (club_a, t2, p3, 6),
    (club_b, tb, pb, 7);

  insert into focus_areas (id, organization_id, slug, name, sort) values
    (f_a, club_a, 'tecnica', 'Técnica', 10),
    (f_b, club_b, 'tecnica', 'Técnica B', 10);

  insert into standards (id, organization_id, number, title, description, sort, status) values
    (s_pub, club_a, 1, 'Publicado', 'd', 1, 'published'),
    (s_draft, club_a, 2, 'Borrador', 'd', 2, 'draft'),
    (s_b, club_b, 1, 'De B', 'd', 1, 'published');

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.c1b', u_c1b::text, true);
  perform set_config('fx.c2', u_c2::text, true);
  perform set_config('fx.jugador', u_jugador::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.p_c1', p_c1::text, true);
  perform set_config('fx.p_c1b', p_c1b::text, true);
  perform set_config('fx.p1', p1::text, true);
  perform set_config('fx.p2', p2::text, true);
  perform set_config('fx.p3', p3::text, true);
  perform set_config('fx.t1', t1::text, true);
  perform set_config('fx.t2', t2::text, true);
  perform set_config('fx.tb', tb::text, true);
  perform set_config('fx.f_a', f_a::text, true);
  perform set_config('fx.f_b', f_b::text, true);
  perform set_config('fx.s_pub', s_pub::text, true);
  perform set_config('fx.s_draft', s_draft::text, true);
  perform set_config('fx.s_b', s_b::text, true);
end
$$;

-- Un objetivo de prueba de `who` sobre `player` en `team`, con el título dado.
create function pg_temp.goal_sql(title text, player text, team text, extra text default '')
returns text
language sql
as $$
  select format(
    $f$insert into player_goals (organization_id, person_id, team_id, title%s)
       values (current_setting('fx.club_a')::uuid, current_setting('fx.%s')::uuid,
               current_setting('fx.%s')::uuid, %L%s)$f$,
    case when extra = '' then '' else ', ' || split_part(extra, '=', 1) end,
    player, team, title,
    case when extra = '' then '' else ', ' || split_part(extra, '=', 2) end
  );
$$;

-- ── Objetivos: c1 en su equipo ───────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select lives_ok(
  pg_temp.goal_sql('Objetivo 1', 'p1', 't1', 'standard_id=current_setting(''fx.s_pub'')::uuid'),
  'c1 crea un objetivo de p1 en T1 ligado a un Standard publicado'
);
select lives_ok(
  pg_temp.goal_sql('Objetivo 2', 'p1', 't1', 'focus_area_id=current_setting(''fx.f_a'')::uuid'),
  'c1 crea un objetivo de p1 en T1 ligado a un foco'
);

reset role;
select results_eq(
  $$select created_by, status::text, achieved_at is null from player_goals where title = 'Objetivo 1'$$,
  $$values (current_setting('fx.c1')::uuid, 'active', true)$$,
  'nace activo, sin fecha de logro y a nombre de c1'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);
select throws_ok(
  pg_temp.goal_sql('Objetivo de p3', 'p3', 't1'),
  '42501', null, 'c1 no pone objetivos en T1 a un jugador que no está en su plantilla'
);
select throws_ok(
  pg_temp.goal_sql('Con Standard ajeno', 'p1', 't1', 'standard_id=current_setting(''fx.s_b'')::uuid'),
  '42501', null, 'un Standard de otro club no se puede ligar (RLS no lo ve antes que la clave foránea)'
);
select throws_ok(
  pg_temp.goal_sql('Con borrador', 'p1', 't1', 'standard_id=current_setting(''fx.s_draft'')::uuid'),
  '42501', null, 'un Standard en borrador no se puede ligar'
);
select throws_ok(
  pg_temp.goal_sql('Con foco ajeno', 'p1', 't1', 'focus_area_id=current_setting(''fx.f_b'')::uuid'),
  '23503', null, 'un foco de otro club no se puede ligar'
);
select throws_ok(
  pg_temp.goal_sql('Ya logrado', 'p1', 't1', 'status=''achieved'''),
  '42501', 'permission denied for table player_goals', 'el estado no se elige al crear'
);
select throws_ok(
  $$insert into player_goals (organization_id, person_id, team_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p1')::uuid,
            current_setting('fx.t1')::uuid, '   ')$$,
  '23514', null, 'un título en blanco no vale'
);

-- ── Quién los ve ─────────────────────────────────────────────────────────────────────
select is((select count(*)::int from player_goals), 2, 'c1 ve los dos objetivos de su equipo');

select tests.authenticate_as(current_setting('fx.c1b')::uuid);
select is((select count(*)::int from player_goals), 2, 'c1b, del mismo cuerpo técnico, también');

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select is((select count(*)::int from player_goals), 2, 'adminA, dirección del club, también');

select tests.authenticate_as(current_setting('fx.c2')::uuid);
select is((select count(*)::int from player_goals), 0, 'c2, de otro equipo, no ve los de T1 aunque p1 esté en el suyo');

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);
select is((select count(*)::int from player_goals), 0, 'cb, de otro club, no ve nada');

select tests.authenticate_as(current_setting('fx.jugador')::uuid);
select is((select count(*)::int from player_goals), 0, 'la cuenta de p1 (jugador) no ve sus objetivos en esta fase');

-- ── Quién los escribe ────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c2')::uuid);
select throws_ok(
  pg_temp.goal_sql('De c2 en T1', 'p1', 't1'), '42501', null,
  'c2 no crea objetivos en T1'
);
select lives_ok(
  $$update player_goals set title = 'c2 estuvo aquí'$$,
  'c2 lanza un cambio sobre todos los objetivos'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);
select throws_ok(
  pg_temp.goal_sql('De cb en T1', 'p1', 't1'), '42501', null,
  'cb, de otro club, no crea objetivos en T1'
);

reset role;
select is(
  (select count(*)::int from player_goals where title = 'c2 estuvo aquí'), 0,
  'el cambio de c2 no tocó ningún objetivo de T1'
);

-- ── Tres activos como mucho ──────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);
select lives_ok(pg_temp.goal_sql('Objetivo 3', 'p1', 't1'), 'el tercero activo de p1 entra');
select throws_ok(
  pg_temp.goal_sql('Objetivo 4', 'p1', 't1'), 'P0001', 'GOAL_LIMIT',
  'el cuarto activo de p1 no entra'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select throws_ok(
  pg_temp.goal_sql('Objetivo 4 de dirección', 'p1', 't1'), 'P0001', 'GOAL_LIMIT',
  'tampoco para dirección'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);
select throws_ok(
  pg_temp.goal_sql('Objetivo en T2', 'p1', 't2'), 'P0001', 'GOAL_LIMIT',
  'el límite suma todos los equipos del jugador: c2 no añade un cuarto en T2'
);
select lives_ok(pg_temp.goal_sql('Objetivo de p3', 'p3', 't2'), 'c2 sí añade objetivos a p3, en su equipo');

-- ── Lograr y archivar ────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);
select lives_ok(
  $$update player_goals set status = 'achieved' where title = 'Objetivo 1'$$,
  'c1 marca un objetivo como logrado'
);
select lives_ok(pg_temp.goal_sql('Objetivo 4', 'p1', 't1'), 'con uno logrado, el cuarto ya entra');
select throws_ok(
  pg_temp.goal_sql('Objetivo 5', 'p1', 't1'), 'P0001', 'GOAL_LIMIT',
  'y vuelve a haber tres activos'
);
select lives_ok(
  $$update player_goals set status = 'archived' where title = 'Objetivo 2'$$,
  'c1 archiva otro'
);

reset role;
select results_eq(
  $$select title, status::text, achieved_at is not null from player_goals
    where title in ('Objetivo 1', 'Objetivo 2') order by title$$,
  $$values ('Objetivo 1', 'achieved', true), ('Objetivo 2', 'archived', false)$$,
  'la base pone la fecha de logro; archivar no la pone'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);
select lives_ok(
  $$update player_goals set status = 'active', title = 'Reabierto' where title in ('Objetivo 1', 'Objetivo 2')$$,
  'c1 intenta reabrir y cambiar los cerrados'
);
select throws_ok(
  $$update player_goals set achieved_at = now() where title = 'Objetivo 3'$$,
  '42501', null, 'la fecha de logro no la escribe nadie'
);
select throws_ok(
  $$delete from player_goals where title = 'Objetivo 3'$$,
  '42501', null, 'los objetivos no se borran'
);

reset role;
select results_eq(
  $$select title, status::text from player_goals where title in ('Objetivo 1', 'Objetivo 2', 'Reabierto') order by title$$,
  $$values ('Objetivo 1', 'achieved'), ('Objetivo 2', 'archived')$$,
  'un objetivo logrado o archivado no se reabre ni se edita'
);

-- ── Notas ────────────────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);
select lives_ok(
  $$insert into coach_notes (organization_id, person_id, team_id, body)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p1')::uuid,
            current_setting('fx.t1')::uuid, 'Privada de c1')$$,
  'c1 escribe una nota sobre p1 (privada por defecto)'
);
select lives_ok(
  $$insert into coach_notes (organization_id, person_id, team_id, body, visibility)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p1')::uuid,
            current_setting('fx.t1')::uuid, 'Compartida de c1', 'staff')$$,
  'c1 escribe una nota para el cuerpo técnico'
);
select throws_ok(
  $$insert into coach_notes (organization_id, person_id, team_id, body, author_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p1')::uuid,
            current_setting('fx.t1')::uuid, 'Suplantada', current_setting('fx.c1b')::uuid)$$,
  '42501', 'permission denied for table coach_notes', 'el autor no se elige: es quien escribe'
);
select throws_ok(
  $$insert into coach_notes (organization_id, person_id, team_id, body)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p3')::uuid,
            current_setting('fx.t1')::uuid, 'De p3')$$,
  '42501', null, 'no sobre un jugador que no está en la plantilla del equipo'
);
select throws_ok(
  $$insert into coach_notes (organization_id, person_id, team_id, body)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p1')::uuid,
            current_setting('fx.t1')::uuid, repeat('x', 2001))$$,
  '23514', null, 'más de 2000 caracteres no caben'
);

reset role;
select results_eq(
  $$select author_id, author_person_id, visibility::text from coach_notes where body = 'Privada de c1'$$,
  $$values (current_setting('fx.c1')::uuid, current_setting('fx.p_c1')::uuid, 'private')$$,
  'la nota es de c1, lleva su persona (para enseñar quién la escribió) y nace privada'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);
select is((select count(*)::int from coach_notes), 2, 'c1 lee sus dos notas');
select throws_ok(
  $$update coach_notes set author_person_id = null$$,
  '42501', null, 'la persona autora no la cambia nadie'
);

select tests.authenticate_as(current_setting('fx.c1b')::uuid);
select results_eq(
  $$select body from coach_notes$$, $$values ('Compartida de c1')$$,
  'c1b, del mismo cuerpo técnico, lee solo la compartida'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select results_eq(
  $$select body from coach_notes$$, $$values ('Compartida de c1')$$,
  'adminA, dirección, lee solo la compartida: la privada es de c1'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);
select is((select count(*)::int from coach_notes), 0, 'c2, de otro equipo, no lee ninguna');

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);
select is((select count(*)::int from coach_notes), 0, 'cb, de otro club, no lee ninguna');

select tests.authenticate_as(current_setting('fx.jugador')::uuid);
select is((select count(*)::int from coach_notes), 0, 'la cuenta de p1 no lee las notas sobre p1');

select tests.authenticate_as(current_setting('fx.c2')::uuid);
select throws_ok(
  $$insert into coach_notes (organization_id, person_id, team_id, body)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p1')::uuid,
            current_setting('fx.t1')::uuid, 'De c2')$$,
  '42501', null, 'c2 no escribe notas en T1'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);
select throws_ok(
  $$insert into coach_notes (organization_id, person_id, team_id, body)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p1')::uuid,
            current_setting('fx.t1')::uuid, 'De cb')$$,
  '42501', null, 'cb, de otro club, no escribe notas en T1'
);

-- ── Solo el autor cambia y borra ─────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1b')::uuid);
select lives_ok(
  $$update coach_notes set body = 'c1b estuvo aquí'$$, 'c1b lanza un cambio sobre las notas que lee'
);
select lives_ok($$delete from coach_notes$$, 'c1b lanza un borrado sobre las notas que lee');

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select lives_ok($$delete from coach_notes$$, 'adminA lanza un borrado sobre las notas que lee');

reset role;
select results_eq(
  $$select body from coach_notes order by body$$,
  $$values ('Compartida de c1'), ('Privada de c1')$$,
  'ni c1b ni dirección cambian ni borran notas de c1'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);
select lives_ok(
  $$update coach_notes set body = 'Compartida, corregida' where body = 'Compartida de c1'$$,
  'c1 corrige su nota'
);
select lives_ok($$delete from coach_notes where body = 'Privada de c1'$$, 'c1 borra su nota privada');

reset role;
select results_eq(
  $$select body from coach_notes$$, $$values ('Compartida, corregida')$$,
  'el borrado es de verdad y la corrección se guarda'
);

-- ── Quien deja el cuerpo técnico ─────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1b')::uuid);
select lives_ok(
  $$insert into coach_notes (organization_id, person_id, team_id, body)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p2')::uuid,
            current_setting('fx.t1')::uuid, 'Privada de c1b')$$,
  'c1b escribe una nota privada sobre p2'
);

reset role;
delete from team_staff
where team_id = current_setting('fx.t1')::uuid and person_id = current_setting('fx.p_c1b')::uuid;

select tests.authenticate_as(current_setting('fx.c1b')::uuid);
select results_eq(
  $$select body from coach_notes$$, $$values ('Privada de c1b')$$,
  'fuera del cuerpo técnico, c1b sigue leyendo su nota privada y ya no la compartida de T1'
);
select throws_ok(
  $$insert into coach_notes (organization_id, person_id, team_id, body)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p2')::uuid,
            current_setting('fx.t1')::uuid, 'Otra de c1b')$$,
  '42501', null, 'y ya no escribe notas nuevas en T1'
);

-- ── anon ─────────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select throws_ok('select 1 from player_goals', '42501', null, 'anon no lee objetivos');
select throws_ok('select 1 from coach_notes', '42501', null, 'anon no lee notas');

select * from finish();

rollback;
