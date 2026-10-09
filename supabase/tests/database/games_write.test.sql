-- Escritura de partidos (Fase 6): `create_game`, `update_game`, `record_game_result` y
-- `cancel_game`, y las políticas que hay debajo.
--
-- Lo que se garantiza:
--   · crea y cambia un partido quien gestiona el equipo (su cuerpo técnico y el admin de su
--     club) y nadie más, y solo en un equipo de la temporada actual;
--   · un partido es siempre de un evento `game`: no cuelga de un entreno ni cambia de tipo;
--   · el resultado se apunta desde la hora de inicio, deja el partido hecho y se puede
--     corregir; un partido cancelado ya no cambia (GAME_CLOSED);
--   · orden de errores: NOT_FOUND → GAME_CLOSED → INVALID.
--
-- Se ejecuta con `pnpm test:db`. Transacción que se deshace al final; datos ficticios.
begin;

select plan(41);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A: T1 (staff c1, c1b), T2 (staff c2), T_old (temporada pasada, staff c1); adminA;
-- `jugador`. Club B: TB (staff cb).
-- Eventos de T1: un entreno, un partido futuro, uno que ya empezó y uno cancelado. TB: un
-- partido.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@games-write.pgtap.test');
  u_c1 uuid := tests.create_user('c1@games-write.pgtap.test');
  u_c1b uuid := tests.create_user('c1b@games-write.pgtap.test');
  u_c2 uuid := tests.create_user('c2@games-write.pgtap.test');
  u_jugador uuid := tests.create_user('jugador@games-write.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@games-write.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_c1b constant uuid := gen_random_uuid();
  p_c2 constant uuid := gen_random_uuid();
  p_cb constant uuid := gen_random_uuid();
  p1 constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  season_old constant uuid := gen_random_uuid();
  season_b constant uuid := gen_random_uuid();
  cat_a constant uuid := gen_random_uuid();
  cat_b constant uuid := gen_random_uuid();
  t1 constant uuid := gen_random_uuid();
  t2 constant uuid := gen_random_uuid();
  t_old constant uuid := gen_random_uuid();
  tb constant uuid := gen_random_uuid();

  e_practice constant uuid := gen_random_uuid();
  e_future constant uuid := gen_random_uuid();
  e_started constant uuid := gen_random_uuid();
  e_cancelled constant uuid := gen_random_uuid();
  e_tb constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_c1b, club_a, 'c1b', 'Ficticio', null),
    (p_c2, club_a, 'c2', 'Ficticia', null),
    (p_cb, club_b, 'cb', 'Ficticio', null),
    (p1, club_a, 'p1', 'Ficticio', 2015);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', null),
    (club_a, u_c1, 'coach', p_c1),
    (club_a, u_c1b, 'coach', p_c1b),
    (club_a, u_c2, 'coach', p_c2),
    (club_a, u_jugador, 'player', p1),
    (club_b, u_coach_b, 'coach', p_cb);

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true),
    (season_old, club_a, '2025/26', '2025-09-01', '2026-06-30', false),
    (season_b, club_b, '2026/27', '2026-09-01', '2027-06-30', true);

  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_a, club_a, 'Alevín', 'U12', 10),
    (cat_b, club_b, 'Infantil', 'U14', 10);

  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, club_a, season_a, cat_a, 'T1'),
    (t2, club_a, season_a, cat_a, 'T2'),
    (t_old, club_a, season_old, cat_a, 'T viejo'),
    (tb, club_b, season_b, cat_b, 'TB');

  insert into team_staff (organization_id, team_id, person_id, staff_role) values
    (club_a, t1, p_c1, 'head_coach'),
    (club_a, t1, p_c1b, 'assistant'),
    (club_a, t2, p_c2, 'head_coach'),
    (club_a, t_old, p_c1, 'head_coach'),
    (club_b, tb, p_cb, 'head_coach');

  insert into team_players (organization_id, team_id, person_id, jersey_number) values
    (club_a, t1, p1, 4);

  insert into events (id, organization_id, team_id, kind, starts_at, ends_at, location, status) values
    (e_practice, club_a, t1, 'practice', now() + interval '1 day', now() + interval '1 day 75 minutes', 'Entreno T1', 'scheduled'),
    (e_future, club_a, t1, 'game', now() + interval '3 days', now() + interval '3 days 90 minutes', 'Partido futuro', 'scheduled'),
    (e_started, club_a, t1, 'game', now() - interval '2 hours', now() - interval '30 minutes', 'Partido empezado', 'scheduled'),
    (e_cancelled, club_a, t1, 'game', now() + interval '5 days', now() + interval '5 days 90 minutes', 'Partido cancelado', 'cancelled'),
    (e_tb, club_b, tb, 'game', now() + interval '3 days', now() + interval '3 days 90 minutes', 'Partido TB', 'scheduled');

  insert into games (event_id, organization_id, opponent_name, home_away) values
    (e_future, club_a, 'Rival futuro', 'home'),
    (e_started, club_a, 'Rival empezado', 'away'),
    (e_cancelled, club_a, 'Rival cancelado', 'home'),
    (e_tb, club_b, 'Rival de B', 'home');

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.c1b', u_c1b::text, true);
  perform set_config('fx.c2', u_c2::text, true);
  perform set_config('fx.jugador', u_jugador::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.t1', t1::text, true);
  perform set_config('fx.t2', t2::text, true);
  perform set_config('fx.t_old', t_old::text, true);
  perform set_config('fx.tb', tb::text, true);
  perform set_config('fx.e_practice', e_practice::text, true);
  perform set_config('fx.e_future', e_future::text, true);
  perform set_config('fx.e_started', e_started::text, true);
  perform set_config('fx.e_cancelled', e_cancelled::text, true);
  perform set_config('fx.e_tb', e_tb::text, true);
end
$$;

-- Llamada a create_game con un equipo y un rival; el resto, valores válidos.
create function pg_temp.create_sql(team text, opponent text, extra text default '')
returns text
language sql
as $$
  select format(
    $f$select create_game(current_setting('fx.%s')::uuid, now() + interval '7 days',
                          now() + interval '7 days 90 minutes', %L%s)$f$,
    team, opponent, extra
  );
$$;

-- ── create_game ──────────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select lives_ok(
  pg_temp.create_sql('t1', 'Rival nuevo', ', ''Liga'', ''away'', ''Pabellón Norte'''),
  'c1 crea un partido de T1'
);

reset role;
select results_eq(
  $$select e.team_id, e.kind::text, e.status::text, e.location, g.competition_name, g.home_away,
           g.score_for is null
    from games as g join events as e on e.id = g.event_id
    where g.opponent_name = 'Rival nuevo'$$,
  $$values (current_setting('fx.t1')::uuid, 'game', 'scheduled', 'Pabellón Norte', 'Liga', 'away', true)$$,
  'el partido nuevo es un evento game de T1, programado y sin resultado'
);

select tests.authenticate_as(current_setting('fx.c1b')::uuid);
select lives_ok(pg_temp.create_sql('t1', 'Rival de c1b'), 'c1b, ayudante de T1, también crea');

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select lives_ok(pg_temp.create_sql('t2', 'Rival de dirección'), 'adminA crea en cualquier equipo del club');

select tests.authenticate_as(current_setting('fx.c2')::uuid);
select throws_ok(pg_temp.create_sql('t1', 'X'), 'P0002', 'NOT_FOUND', 'c2 no crea en T1');

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);
select throws_ok(pg_temp.create_sql('t1', 'X'), 'P0002', 'NOT_FOUND', 'cb, de otro club, no crea en T1');

select tests.authenticate_as(current_setting('fx.jugador')::uuid);
select throws_ok(pg_temp.create_sql('t1', 'X'), 'P0002', 'NOT_FOUND', 'un jugador no crea partidos');

select tests.authenticate_as(current_setting('fx.c1')::uuid);
select throws_ok(
  pg_temp.create_sql('t_old', 'X'), 'P0002', 'NOT_FOUND',
  'ni en un equipo de la temporada pasada, aunque lo entrenara'
);
select throws_ok(pg_temp.create_sql('t1', '   '), '22023', 'INVALID', 'sin rival no hay partido');
select throws_ok(
  $$select create_game(current_setting('fx.t1')::uuid, now() + interval '7 days',
                       now() + interval '7 days', 'Rival')$$,
  '22023', 'INVALID', 'termina después de empezar'
);
select throws_ok(
  pg_temp.create_sql('t1', 'Rival', ', null, ''neutral'''), '22023', 'INVALID',
  'local o visitante, nada más'
);

-- ── Un partido es de un evento game ──────────────────────────────────────────────────
reset role;
select throws_ok(
  $$insert into games (event_id, organization_id, opponent_name)
    values (current_setting('fx.e_practice')::uuid, current_setting('fx.club_a')::uuid, 'X')$$,
  '23503', null, 'un partido no cuelga de un entreno'
);
select throws_ok(
  $$update events set kind = 'practice' where id = current_setting('fx.e_future')::uuid$$,
  '23503', null, 'un evento con partido no cambia de tipo'
);

-- ── update_game ──────────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);
select lives_ok(
  $$select update_game(current_setting('fx.e_future')::uuid, now() + interval '4 days',
                       now() + interval '4 days 90 minutes', 'Rival corregido', 'Copa', 'away',
                       'Pabellón Sur', 'Juegan en zona')$$,
  'c1 cambia los datos de un partido de T1'
);

reset role;
select results_eq(
  $$select g.opponent_name, g.competition_name, g.home_away, e.location, g.opponent_notes
    from games as g join events as e on e.id = g.event_id
    where g.event_id = current_setting('fx.e_future')::uuid$$,
  $$values ('Rival corregido', 'Copa', 'away', 'Pabellón Sur', 'Juegan en zona')$$,
  'los cambios se guardan en el evento y en el partido'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);
select throws_ok(
  $$select update_game(current_setting('fx.e_future')::uuid, now() + interval '4 days',
                       now() + interval '4 days 90 minutes', 'De c2')$$,
  'P0002', 'NOT_FOUND', 'c2 no cambia un partido de T1'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);
select throws_ok(
  $$select update_game(current_setting('fx.e_future')::uuid, now() + interval '4 days',
                       now() + interval '4 days 90 minutes', 'De cb')$$,
  'P0002', 'NOT_FOUND', 'cb no cambia un partido de otro club'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);
select throws_ok(
  $$select update_game(current_setting('fx.e_practice')::uuid, now() + interval '4 days',
                       now() + interval '4 days 90 minutes', 'Rival')$$,
  'P0002', 'NOT_FOUND', 'un entreno no se cambia como si fuera un partido'
);
select throws_ok(
  $$select update_game(current_setting('fx.e_cancelled')::uuid, now() + interval '4 days',
                       now() + interval '4 days 90 minutes', 'Rival')$$,
  'P0001', 'GAME_CLOSED', 'un partido cancelado no cambia'
);
select throws_ok(
  $$select update_game(current_setting('fx.e_future')::uuid, now() + interval '4 days',
                       now() + interval '4 days 90 minutes', '')$$,
  '22023', 'INVALID', 'el rival no se puede vaciar'
);

-- ── record_game_result ───────────────────────────────────────────────────────────────
select throws_ok(
  $$select record_game_result(current_setting('fx.e_future')::uuid, 60, 50)$$,
  '22023', 'INVALID', 'un partido que no ha empezado no tiene resultado'
);
select lives_ok(
  $$select record_game_result(current_setting('fx.e_started')::uuid, 61, 58)$$,
  'c1 apunta el resultado de un partido empezado'
);

reset role;
select results_eq(
  $$select g.score_for::int, g.score_against::int, e.status::text
    from games as g join events as e on e.id = g.event_id
    where g.event_id = current_setting('fx.e_started')::uuid$$,
  $$values (61, 58, 'done')$$,
  'el resultado queda apuntado y el partido, hecho'
);

select tests.authenticate_as(current_setting('fx.c1b')::uuid);
select lives_ok(
  $$select record_game_result(current_setting('fx.e_started')::uuid, 62, 58)$$,
  'el resultado de un partido hecho se puede corregir'
);
select throws_ok(
  $$select record_game_result(current_setting('fx.e_started')::uuid, -1, 58)$$,
  '22023', 'INVALID', 'un tanteo negativo no vale'
);
select throws_ok(
  $$select record_game_result(current_setting('fx.e_started')::uuid, 301, 58)$$,
  '22023', 'INVALID', 'ni uno imposible'
);
select throws_ok(
  $$select record_game_result(current_setting('fx.e_started')::uuid, null, 58)$$,
  '22023', 'INVALID', 'los dos tanteos o ninguno'
);
select throws_ok(
  $$select record_game_result(current_setting('fx.e_cancelled')::uuid, 1, 0)$$,
  'P0001', 'GAME_CLOSED', 'un partido cancelado no tiene resultado'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);
select throws_ok(
  $$select record_game_result(current_setting('fx.e_started')::uuid, 0, 100)$$,
  'P0002', 'NOT_FOUND', 'c2 no apunta resultados de T1'
);

reset role;
select results_eq(
  $$select score_for::int from games where event_id = current_setting('fx.e_started')::uuid$$,
  $$values (62)$$,
  'vale la corrección; los intentos fallidos no cambiaron nada'
);

-- ── cancel_game ──────────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c2')::uuid);
select throws_ok(
  $$select cancel_game(current_setting('fx.e_future')::uuid)$$,
  'P0002', 'NOT_FOUND', 'c2 no cancela un partido de T1'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);
select lives_ok($$select cancel_game(current_setting('fx.e_future')::uuid)$$, 'c1 cancela un partido');
select throws_ok(
  $$select cancel_game(current_setting('fx.e_future')::uuid)$$,
  'P0001', 'GAME_CLOSED', 'cancelado ya no se vuelve a cancelar'
);
select throws_ok(
  $$select cancel_game(current_setting('fx.e_started')::uuid)$$,
  '22023', 'INVALID', 'un partido ya jugado no se cancela'
);

reset role;
select results_eq(
  $$select status::text from events where id = current_setting('fx.e_future')::uuid$$,
  $$values ('cancelled')$$,
  'el partido queda cancelado'
);

-- ── Debajo de las funciones, las políticas ───────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c2')::uuid);
select lives_ok(
  $$update events set location = 'c2 estuvo aquí'
    where kind = 'game' and team_id = current_setting('fx.t1')::uuid$$,
  'c2 lanza un cambio directo sobre los partidos'
);
select tests.authenticate_as(current_setting('fx.c1')::uuid);
select lives_ok(
  $$update games set opponent_name = 'c1 sobre un cancelado'
    where event_id = current_setting('fx.e_cancelled')::uuid$$,
  'c1 lanza un cambio directo sobre un partido cancelado'
);

reset role;
select is(
  (select count(*)::int from events where location = 'c2 estuvo aquí')
    + (select count(*)::int from games where opponent_name = 'c1 sobre un cancelado'),
  0,
  'ni c2 cambia partidos de T1 ni nadie cambia un cancelado'
);

-- La política sola, sin el privilegio por columnas: se concede `update (kind)` dentro de la
-- transacción para ver que la política de entrenos no deja convertir un partido en entreno
-- (el caso contrario lo prueba practice_write.test.sql).
grant update (kind) on table public.events to authenticated;
select tests.authenticate_as(current_setting('fx.c1')::uuid);
select throws_ok(
  $$update events set kind = 'practice' where id = current_setting('fx.e_started')::uuid$$,
  '42501', 'new row violates row-level security policy for table "events"',
  'la política impide que c1 convierta un partido en entreno'
);
reset role;
revoke update (kind) on table public.events from authenticated;

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);
select is(
  (select count(*)::int from games where organization_id = current_setting('fx.club_a')::uuid),
  0, 'cb no ve los partidos de otro club'
);

-- ── anon ─────────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select throws_ok(pg_temp.create_sql('t1', 'X'), '42501', null, 'anon no crea partidos');

select * from finish();

rollback;
