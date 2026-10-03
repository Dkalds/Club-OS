-- Calendario y planes de sesión: focos, eventos, partidos, planes e ítems.
--
-- RLS aísla por club y, dentro del club, por equipo: quien entrena un equipo no ve los
-- eventos, los partidos ni los planes de otro, aunque sea del mismo club. Una plantilla
-- privada (plan sin equipo) solo la ven quien la creó y los admins del club.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*`
-- vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al
-- final. Los datos son ficticios y solo de este test.
begin;

select plan(89);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Como en structure.test.sql (sin el ayudante de T1, con adminA sin persona enlazada y
-- con una cuenta sin club), más el calendario:
-- Club A
--   T1 «Alevín A»:   staff c1; jugador p1. Eventos: pasado, entreno y partido.
--   T2 «Benjamín A»: staff c2 y multia; jugador p2. Eventos: entreno y partido.
--   adminA es admin y su membresía no enlaza con ninguna persona. `jugador` es la cuenta
--   de p1 (rol player).
-- Club B
--   TB «Infantil A»: staff cb; jugador pb. Eventos: entreno y partido.
-- `multi` tiene membresía en los dos clubes: staff de T2 en A y sin equipo en B.
-- `sinClub` tiene cuenta y ninguna membresía.
--
-- Planes (título → equipo, evento, autor):
--   «Plan de T1»                 → T1, entreno de T1, sin autor (como los del seed)
--   «Plantilla de T1»            → T1, sin evento, c1
--   «Plantilla privada de c1»    → sin equipo, sin evento, c1
--   «Plan de T2»                 → T2, entreno de T2, c2
--   «Plantilla privada de multi» → sin equipo, sin evento, multi
--   «Plan de TB»                 → TB, entreno de TB, cb
-- Los fixtures se insertan sin sesión (`auth.uid()` es null), así que el autor va siempre
-- explícito: `created_by` no puede depender aquí de su valor por defecto.
--
-- Hacen de clave para leer las aserciones: `events.location`, `games.opponent_name`,
-- `practice_plans.title` y `practice_items.title_override`. Están elegidas para que
-- `order by` dé el mismo orden con cualquier collation.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_c1 uuid := tests.create_user('c1@calendar.pgtap.test');
  u_c2 uuid := tests.create_user('c2@calendar.pgtap.test');
  u_admin_a uuid := tests.create_user('admin-a@calendar.pgtap.test');
  u_jugador uuid := tests.create_user('jugador@calendar.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@calendar.pgtap.test');
  u_multi uuid := tests.create_user('multi@calendar.pgtap.test');
  u_sin_club uuid := tests.create_user('sin-club@calendar.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_c2 constant uuid := gen_random_uuid();
  p_multia constant uuid := gen_random_uuid();
  p_p1 constant uuid := gen_random_uuid();
  p_p2 constant uuid := gen_random_uuid();
  p_cb constant uuid := gen_random_uuid();
  p_multib constant uuid := gen_random_uuid();
  p_pb constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  season_b constant uuid := gen_random_uuid();
  cat_alevin constant uuid := gen_random_uuid();
  cat_benjamin constant uuid := gen_random_uuid();
  cat_infantil constant uuid := gen_random_uuid();
  t1 constant uuid := gen_random_uuid();
  t2 constant uuid := gen_random_uuid();
  tb constant uuid := gen_random_uuid();

  f_a_tecnica constant uuid := gen_random_uuid();
  f_a_rebote constant uuid := gen_random_uuid();
  f_b_tecnica constant uuid := gen_random_uuid();

  e_t1_past constant uuid := gen_random_uuid();
  e_t1_next constant uuid := gen_random_uuid();
  e_t1_game constant uuid := gen_random_uuid();
  e_t2_next constant uuid := gen_random_uuid();
  e_t2_game constant uuid := gen_random_uuid();
  e_tb_next constant uuid := gen_random_uuid();
  e_tb_game constant uuid := gen_random_uuid();

  plan_t1 constant uuid := gen_random_uuid();
  tpl_t1 constant uuid := gen_random_uuid();
  tpl_c1 constant uuid := gen_random_uuid();
  plan_t2 constant uuid := gen_random_uuid();
  tpl_multi constant uuid := gen_random_uuid();
  plan_tb constant uuid := gen_random_uuid();

  i_t1_1 constant uuid := gen_random_uuid();
  i_t1_2 constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_c2, club_a, 'c2', 'Ficticia', null),
    (p_multia, club_a, 'multia', 'Ficticia', null),
    (p_p1, club_a, 'p1', 'Ficticio', 2015),
    (p_p2, club_a, 'p2', 'Ficticia', 2017),
    (p_cb, club_b, 'cb', 'Ficticio', null),
    (p_multib, club_b, 'multib', 'Ficticia', null),
    (p_pb, club_b, 'pb', 'Ficticia', 2013);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_c1, 'coach', p_c1),
    (club_a, u_c2, 'coach', p_c2),
    (club_a, u_admin_a, 'admin', null),
    (club_a, u_jugador, 'player', p_p1),
    (club_a, u_multi, 'coach', p_multia),
    (club_b, u_coach_b, 'coach', p_cb),
    (club_b, u_multi, 'coach', p_multib);

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true),
    (season_b, club_b, '2026/27', '2026-09-01', '2027-06-30', true);

  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_benjamin, club_a, 'Benjamín', 'U10', 10),
    (cat_alevin, club_a, 'Alevín', 'U12', 20),
    (cat_infantil, club_b, 'Infantil', 'U14', 10);

  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, club_a, season_a, cat_alevin, 'Alevín A'),
    (t2, club_a, season_a, cat_benjamin, 'Benjamín A'),
    (tb, club_b, season_b, cat_infantil, 'Infantil A');

  insert into team_staff (organization_id, team_id, person_id, staff_role) values
    (club_a, t1, p_c1, 'head_coach'),
    (club_a, t2, p_c2, 'head_coach'),
    (club_a, t2, p_multia, 'assistant'),
    (club_b, tb, p_cb, 'head_coach');

  insert into team_players (organization_id, team_id, person_id, jersey_number, position) values
    (club_a, t1, p_p1, 4, 'Base'),
    (club_a, t2, p_p2, 4, 'Base'),
    (club_b, tb, p_pb, 7, 'Alero');

  -- Los dos clubes usan el mismo slug: es único por club, no global.
  insert into focus_areas (id, organization_id, slug, name, sort) values
    (f_a_tecnica, club_a, 'tecnica', 'Técnica', 10),
    (f_a_rebote, club_a, 'rebote', 'Rebote', 20),
    (f_b_tecnica, club_b, 'tecnica', 'Técnica B', 10);

  insert into events (id, organization_id, team_id, kind, starts_at, ends_at, location, status) values
    (e_t1_past, club_a, t1, 'practice', '2026-10-01T16:00:00Z', '2026-10-01T17:15:00Z', 'T1 pasado', 'done'),
    (e_t2_next, club_a, t2, 'practice', '2026-10-06T15:00:00Z', '2026-10-06T16:00:00Z', 'T2 entreno', 'scheduled'),
    (e_t1_next, club_a, t1, 'practice', '2026-10-06T16:00:00Z', '2026-10-06T17:15:00Z', 'T1 entreno', 'scheduled'),
    (e_tb_next, club_b, tb, 'practice', '2026-10-07T16:00:00Z', '2026-10-07T17:15:00Z', 'TB entreno', 'scheduled'),
    (e_t1_game, club_a, t1, 'game', '2026-10-10T08:30:00Z', '2026-10-10T10:00:00Z', 'T1 partido', 'scheduled'),
    (e_t2_game, club_a, t2, 'game', '2026-10-10T10:30:00Z', '2026-10-10T12:00:00Z', 'T2 partido', 'scheduled'),
    (e_tb_game, club_b, tb, 'game', '2026-10-11T09:00:00Z', '2026-10-11T10:30:00Z', 'TB partido', 'scheduled');

  insert into games (event_id, organization_id, opponent_name, competition_name, home_away) values
    (e_t1_game, club_a, 'Rival de T1', 'Liga ficticia', 'home'),
    (e_t2_game, club_a, 'Rival de T2', 'Liga ficticia', 'away'),
    (e_tb_game, club_b, 'Rival de TB', null, null);

  insert into practice_plans (
    id, organization_id, team_id, event_id, title,
    primary_focus_id, secondary_focus_id, is_template, status, created_by
  ) values
    (plan_t1, club_a, t1, e_t1_next, 'Plan de T1', f_a_tecnica, f_a_rebote, false, 'ready', null),
    (tpl_t1, club_a, t1, null, 'Plantilla de T1', f_a_tecnica, null, true, 'draft', u_c1),
    (tpl_c1, club_a, null, null, 'Plantilla privada de c1', null, null, true, 'draft', u_c1),
    (plan_t2, club_a, t2, e_t2_next, 'Plan de T2', f_a_rebote, null, false, 'ready', u_c2),
    (tpl_multi, club_a, null, null, 'Plantilla privada de multi', null, null, true, 'draft', u_multi),
    (plan_tb, club_b, tb, e_tb_next, 'Plan de TB', f_b_tecnica, null, false, 'ready', u_coach_b);

  insert into practice_items (id, organization_id, plan_id, sort, phase, title_override, minutes) values
    (i_t1_1, club_a, plan_t1, 1, 'Activación', 'plan-t1-1', 10),
    (i_t1_2, club_a, plan_t1, 2, 'Técnica', 'plan-t1-2', 15),
    (gen_random_uuid(), club_a, plan_t1, 3, 'Competición', 'plan-t1-3', 20),
    (gen_random_uuid(), club_a, tpl_t1, 1, null, 'plantilla-t1-1', 10),
    (gen_random_uuid(), club_a, tpl_c1, 1, null, 'privada-c1-1', 10),
    (gen_random_uuid(), club_a, plan_t2, 1, 'Activación', 'plan-t2-1', 10),
    (gen_random_uuid(), club_a, plan_t2, 2, 'Técnica', 'plan-t2-2', 20),
    (gen_random_uuid(), club_a, tpl_multi, 1, null, 'privada-multi-1', 10),
    (gen_random_uuid(), club_b, plan_tb, 1, 'Activación', 'plan-tb-1', 10);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.c2', u_c2::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.jugador', u_jugador::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.multi', u_multi::text, true);
  perform set_config('fx.sin_club', u_sin_club::text, true);
  perform set_config('fx.t1', t1::text, true);
  perform set_config('fx.t2', t2::text, true);
  perform set_config('fx.tb', tb::text, true);
  perform set_config('fx.f_a_tecnica', f_a_tecnica::text, true);
  perform set_config('fx.e_t1_past', e_t1_past::text, true);
  perform set_config('fx.e_t1_next', e_t1_next::text, true);
  perform set_config('fx.e_t1_game', e_t1_game::text, true);
  perform set_config('fx.e_tb_next', e_tb_next::text, true);
  perform set_config('fx.plan_t1', plan_t1::text, true);
  perform set_config('fx.tpl_t1', tpl_t1::text, true);
  perform set_config('fx.tpl_c1', tpl_c1::text, true);
  perform set_config('fx.plan_tb', plan_tb::text, true);
  perform set_config('fx.i_t1_1', i_t1_1::text, true);
  perform set_config('fx.i_t1_2', i_t1_2::text, true);
end
$$;

-- ── c1: staff de T1 ──────────────────────────────────────────────────────────────────
-- Cada conjunto es exacto: lo que c1 ve y, a la vez, que no ve nada más (ni T2 ni B).
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  'select location from events order by starts_at',
  $$values ('T1 pasado'), ('T1 entreno'), ('T1 partido')$$,
  'c1 ve los eventos de T1 y no los de T2 ni TB'
);

select results_eq(
  'select opponent_name from games',
  $$values ('Rival de T1')$$,
  'c1 ve el partido de T1 y no los de T2 ni TB'
);

-- «Plan de T1» no lo creó c1: lo ve por ser staff del equipo. La plantilla privada no
-- tiene equipo: la ve por haberla creado. La de multi, también privada, no la ve.
select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Plan de T1'), ('Plantilla de T1'), ('Plantilla privada de c1')$$,
  'c1 ve los planes de T1 y sus plantillas, y no los de T2 ni TB'
);

select results_eq(
  'select title_override from practice_items order by 1',
  $$values ('plan-t1-1'), ('plan-t1-2'), ('plan-t1-3'), ('plantilla-t1-1'), ('privada-c1-1')$$,
  'c1 ve los ítems de sus planes y no los de T2 ni TB'
);

select results_eq(
  'select name from focus_areas order by sort',
  $$values ('Técnica'), ('Rebote')$$,
  'c1 ve los focos de su club y no los de B'
);

select results_eq(
  'select title from practice_plans where team_id is null',
  $$values ('Plantilla privada de c1')$$,
  'plantilla privada: c1 ve la que ha creado, y no las de otros'
);

-- En esta fase no hay escrituras para usuarios: ni política ni privilegio.
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'Plan nuevo')$$,
  '42501', null,
  'nadie crea planes en esta fase'
);

select throws_ok(
  $$update practice_items set minutes = 5$$,
  '42501', null,
  'nadie edita ítems en esta fase'
);

select throws_ok(
  $$delete from events$$,
  '42501', null,
  'nadie borra eventos en esta fase'
);

-- ── c2: staff de T2, mismo club (Review Focus 3) ─────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c2')::uuid);

-- Controles positivos: c2 sí ve lo de su equipo, así que los `is_empty` de abajo no pasan
-- en vacío. Lo de T1 existe: es lo que c1 veía arriba.
select results_eq(
  'select location from events order by starts_at',
  $$values ('T2 entreno'), ('T2 partido')$$,
  'c2 ve los eventos de T2 y ningún otro'
);

select results_eq(
  'select opponent_name from games',
  $$values ('Rival de T2')$$,
  'c2 ve el partido de T2 y ningún otro'
);

select results_eq(
  'select title from practice_plans',
  $$values ('Plan de T2')$$,
  'c2 ve el plan de T2 y ningún otro'
);

select results_eq(
  'select title_override from practice_items order by 1',
  $$values ('plan-t2-1'), ('plan-t2-2')$$,
  'c2 ve los ítems del plan de T2 y ningún otro'
);

select is_empty(
  $$select 'plan' from practice_plans where team_id = current_setting('fx.t1')::uuid
    union all
    select 'ítem' from practice_items
    where plan_id in (current_setting('fx.plan_t1')::uuid, current_setting('fx.tpl_t1')::uuid)
    union all
    select 'partido' from games where event_id = current_setting('fx.e_t1_game')::uuid$$,
  'c2 no ve planes, ítems ni partidos de T1'
);

select is_empty(
  $$select 1 from events where team_id = current_setting('fx.t1')::uuid$$,
  'c2 no ve los eventos de T1'
);

select is_empty(
  $$select 'plan' from practice_plans where id = current_setting('fx.tpl_c1')::uuid
    union all
    select 'ítem' from practice_items where plan_id = current_setting('fx.tpl_c1')::uuid$$,
  'plantilla privada: c2 no ve la de c1, ni sus ítems'
);

-- ── adminA: todo su club, nada de B ──────────────────────────────────────────────────
-- Su membresía no enlaza con ninguna persona: ser admin no depende de `person_id`.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  'select location from events order by starts_at',
  $$values ('T1 pasado'), ('T2 entreno'), ('T1 entreno'), ('T1 partido'), ('T2 partido')$$,
  'admin ve los eventos de su club y ninguno de B'
);

select results_eq(
  'select opponent_name from games order by 1',
  $$values ('Rival de T1'), ('Rival de T2')$$,
  'admin ve los partidos de su club y ninguno de B'
);

select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Plan de T1'), ('Plan de T2'), ('Plantilla de T1'),
           ('Plantilla privada de c1'), ('Plantilla privada de multi')$$,
  'admin ve los planes de su club, plantillas privadas incluidas, y ninguno de B'
);

select results_eq(
  'select title_override from practice_items order by 1',
  $$values ('plan-t1-1'), ('plan-t1-2'), ('plan-t1-3'), ('plan-t2-1'), ('plan-t2-2'),
           ('plantilla-t1-1'), ('privada-c1-1'), ('privada-multi-1')$$,
  'admin ve los ítems de su club y ninguno de B'
);

select results_eq(
  'select name from focus_areas order by sort',
  $$values ('Técnica'), ('Rebote')$$,
  'admin ve los focos de su club y ninguno de B'
);

select throws_ok(
  $$update games set score_for = 60$$,
  '42501', null,
  'ni el admin escribe en esta fase'
);

-- ── coachB: el aislamiento entre clubes vale en los dos sentidos ─────────────────────
select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select results_eq(
  'select location from events order by starts_at',
  $$values ('TB entreno'), ('TB partido')$$,
  'coach de B no ve nada de A: eventos'
);

select results_eq(
  'select opponent_name from games',
  $$values ('Rival de TB')$$,
  'coach de B no ve nada de A: partidos'
);

select results_eq(
  'select title from practice_plans',
  $$values ('Plan de TB')$$,
  'coach de B no ve nada de A: planes'
);

select results_eq(
  'select title_override from practice_items',
  $$values ('plan-tb-1')$$,
  'coach de B no ve nada de A: ítems'
);

select results_eq(
  'select name from focus_areas',
  $$values ('Técnica B')$$,
  'coach de B no ve nada de A: focos'
);

-- ── multi: una cuenta con membresía en los dos clubes ────────────────────────────────
-- Cada club se resuelve con su propia membresía: ser staff en A no abre nada de B.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select results_eq(
  'select location from events order by starts_at',
  $$values ('T2 entreno'), ('T2 partido')$$,
  'ser staff en un club no da acceso a los eventos de otro'
);

select results_eq(
  'select opponent_name from games',
  $$values ('Rival de T2')$$,
  'ser staff en un club no da acceso a los partidos de otro'
);

-- «Plan de T2» lo creó c2: multi lo ve por ser staff de T2.
select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Plan de T2'), ('Plantilla privada de multi')$$,
  'con dos clubes ve el plan de su equipo y su plantilla, y ninguno de B'
);

select results_eq(
  'select title_override from practice_items order by 1',
  $$values ('plan-t2-1'), ('plan-t2-2'), ('privada-multi-1')$$,
  'con dos clubes ve los ítems de esos planes y ninguno de B'
);

select results_eq(
  'select organization_id, count(*)::int from focus_areas group by 1 order by 1',
  $$values (current_setting('fx.club_a')::uuid, 2), (current_setting('fx.club_b')::uuid, 1)$$,
  'con dos clubes ve los focos de cada uno'
);

-- ── jugador: la cuenta de un jugador de T1, que no es staff ──────────────────────────
-- Las políticas de esta fase solo abren el calendario a admins y a staff.
select tests.authenticate_as(current_setting('fx.jugador')::uuid);

-- Control positivo: es miembro activo, ve lo que ve cualquier miembro.
select results_eq(
  'select name from focus_areas order by sort',
  $$values ('Técnica'), ('Rebote')$$,
  'una cuenta de jugador ve los focos de su club'
);

select is_empty(
  $$select 'events' from events
    union all select 'games' from games
    union all select 'practice_plans' from practice_plans
    union all select 'practice_items' from practice_items$$,
  'una cuenta de jugador no ve eventos, partidos, planes ni ítems, tampoco los de su equipo'
);

-- ── sinClub: con sesión pero sin membresía ───────────────────────────────────────────
-- Control positivo: las filas existen; son las que ven los usuarios de arriba.
select tests.authenticate_as(current_setting('fx.sin_club')::uuid);

select is_empty(
  $$select 'focus_areas' from focus_areas
    union all select 'events' from events
    union all select 'games' from games
    union all select 'practice_plans' from practice_plans
    union all select 'practice_items' from practice_items$$,
  'sin membresía no ve nada en las cinco tablas'
);

-- ── anon: sin privilegios sobre ninguna tabla ────────────────────────────────────────
select tests.clear_authentication();

select throws_ok('select * from focus_areas', '42501', null, 'anon no tiene acceso a los focos');
select throws_ok('select * from events', '42501', null, 'anon no tiene acceso a los eventos');
select throws_ok('select * from games', '42501', null, 'anon no tiene acceso a los partidos');
select throws_ok('select * from practice_plans', '42501', null, 'anon no tiene acceso a los planes');
select throws_ok('select * from practice_items', '42501', null, 'anon no tiene acceso a los ítems');

select throws_ok(
  $$select private.can_see_plan(current_setting('fx.plan_t1')::uuid)$$,
  '42501', null,
  'anon no puede usar can_see_plan'
);

-- ── Solo cuentan las membresías activas ──────────────────────────────────────────────
-- Control positivo: es el mismo c1 que arriba veía sus eventos, su partido y sus planes.
reset role;
update memberships set status = 'revoked' where user_id = current_setting('fx.c1')::uuid;
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select is_empty('select * from events', 'membresía revocada no ve eventos');
select is_empty('select * from games', 'membresía revocada no ve partidos');
select is_empty(
  'select * from practice_plans',
  'membresía revocada no ve planes, ni las plantillas que creó'
);
select is_empty(
  'select * from practice_items',
  'membresía revocada no ve ítems, ni los de las plantillas que creó'
);
select is_empty('select * from focus_areas', 'membresía revocada no ve focos');

-- multi pierde A y sigue activo en B: haber creado un plan solo cuenta mientras se es
-- miembro del club de ese plan, no de cualquier club.
reset role;
update memberships set status = 'revoked'
where user_id = current_setting('fx.multi')::uuid
  and organization_id = current_setting('fx.club_a')::uuid;
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select results_eq(
  'select name from focus_areas',
  $$values ('Técnica B')$$,
  'revocado en A y activo en B sigue viendo los focos de B'
);

select is_empty(
  $$select 'events' from events
    union all select 'games' from games
    union all select 'practice_plans' from practice_plans
    union all select 'practice_items' from practice_items$$,
  'revocado en A y activo en B no ve nada de A, ni la plantilla que creó'
);

-- ── Abrir el calendario no abre los partidos ─────────────────────────────────────────
-- La política de `games` busca el equipo en `events`, y esa subconsulta pasa por la
-- política de `events`. Si una fase posterior abre el calendario a más miembros, los datos
-- del partido no deben abrirse con él. Se simula con una política temporal, que se quita
-- aquí mismo (y, en todo caso, se deshace con la transacción).
reset role;

create policy events_select_member_simulada
  on events
  for select
  to authenticated
  using (private.is_member(organization_id));

select tests.authenticate_as(current_setting('fx.c2')::uuid);

-- Control positivo: la política temporal funciona, c2 ve ahora también los eventos de T1.
select results_eq(
  'select location from events order by starts_at',
  $$values ('T1 pasado'), ('T2 entreno'), ('T1 entreno'), ('T1 partido'), ('T2 partido')$$,
  'con el calendario abierto a los miembros, c2 ve los eventos de todo su club'
);

select results_eq(
  'select opponent_name from games',
  $$values ('Rival de T2')$$,
  'con el calendario abierto a los miembros, c2 sigue sin ver el partido de T1'
);

reset role;

drop policy events_select_member_simulada on events;

-- ── Claves foráneas compuestas (como postgres) ───────────────────────────────────────
-- Control positivo: las fixtures de arriba, todas dentro de su club, se insertaron; y las
-- plantillas privadas entraron con equipo, evento y focos a null (MATCH SIMPLE).

-- El plan es de A: decir que la fila es de B no basta para colgarle un ítem.
select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.plan_t1')::uuid, 9, 10)$$,
  '23503', null,
  'FK compuesta: un ítem de B no entra en un plan de A'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_tb')::uuid, 9, 10)$$,
  '23503', null,
  'FK compuesta: un ítem de A no entra en un plan de B'
);

select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-13T16:00:00Z', '2026-10-13T17:15:00Z')$$,
  '23503', null,
  'un evento no usa el equipo de otro club'
);

-- El entreno de T1 no tiene partido: lo que falla es la clave foránea, no la primaria.
select throws_ok(
  $$insert into games (event_id, organization_id, opponent_name)
    values (current_setting('fx.e_t1_next')::uuid, current_setting('fx.club_b')::uuid, 'Rival cruzado')$$,
  '23503', null,
  'un partido no se cuelga del evento de otro club'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.t1')::uuid, 'Plan cruzado')$$,
  '23503', null,
  'un plan no usa el equipo de otro club'
);

-- El evento pasado de T1 no tiene plan: lo que falla es la clave foránea, no el único.
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.tb')::uuid,
            current_setting('fx.e_t1_past')::uuid, 'Plan cruzado')$$,
  '23503', null,
  'un plan no se cuelga del evento de otro club'
);

select throws_ok(
  $$insert into practice_plans (organization_id, title, primary_focus_id)
    values (current_setting('fx.club_b')::uuid, 'Plan cruzado', current_setting('fx.f_a_tecnica')::uuid)$$,
  '23503', null,
  'un plan no usa como foco principal el de otro club'
);

select throws_ok(
  $$insert into practice_plans (organization_id, title, secondary_focus_id)
    values (current_setting('fx.club_b')::uuid, 'Plan cruzado', current_setting('fx.f_a_tecnica')::uuid)$$,
  '23503', null,
  'un plan no usa como foco secundario el de otro club'
);

-- Con el equipo o el plan a null la clave foránea compuesta no se comprobaría: en estas
-- dos tablas son obligatorios, igual que `organization_id` en las cinco.
select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at)
    values (current_setting('fx.club_a')::uuid, null, 'practice',
            '2026-10-13T16:00:00Z', '2026-10-13T17:15:00Z')$$,
  '23502', null,
  'un evento sin equipo se rechaza'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes)
    values (current_setting('fx.club_a')::uuid, null, 9, 10)$$,
  '23502', null,
  'un ítem sin plan se rechaza'
);

select results_eq(
  $$select count(*)::int
    from pg_attribute as a
    join pg_class as c on c.oid = a.attrelid
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('focus_areas', 'events', 'games', 'practice_plans', 'practice_items')
      and a.attname = 'organization_id'
      and a.attnotnull$$,
  array[5],
  'organization_id es obligatorio en las cinco tablas'
);

-- ── Restricciones (como postgres) ────────────────────────────────────────────────────
select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-13T17:15:00Z', '2026-10-13T16:00:00Z')$$,
  '23514', null,
  'fin anterior al inicio rechazado'
);

select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-13T16:00:00Z', '2026-10-13T16:00:00Z')$$,
  '23514', null,
  'fin igual al inicio rechazado'
);

select throws_ok(
  $$update practice_items set minutes = 0 where id = current_setting('fx.i_t1_1')::uuid$$,
  '23514', null,
  'minutes = 0 rechazado'
);

select throws_ok(
  $$update practice_items set minutes = 121 where id = current_setting('fx.i_t1_1')::uuid$$,
  '23514', null,
  'minutes = 121 rechazado'
);

select lives_ok(
  $$update practice_items set minutes = case sort when 1 then 1 else 120 end
    where plan_id = current_setting('fx.plan_t1')::uuid$$,
  'minutes entre 1 y 120 aceptado'
);

select throws_ok(
  $$update games set home_away = 'neutral'
    where event_id = current_setting('fx.e_t1_game')::uuid$$,
  '23514', null,
  'home_away distinto de home o away rechazado'
);

select throws_ok(
  $$update practice_plans set status = 'archived' where id = current_setting('fx.plan_t1')::uuid$$,
  '23514', null,
  'estado de plan desconocido rechazado'
);

select enum_has_labels(
  'public', 'event_kind', array['practice', 'game'],
  'event_kind es practice o game'
);

select enum_has_labels(
  'public', 'event_status', array['scheduled', 'done', 'cancelled'],
  'event_status es scheduled, done o cancelled'
);

-- El entreno de T1 ya tiene su plan.
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.e_t1_next')::uuid, 'Segundo plan')$$,
  '23505', null,
  'un solo plan por evento'
);

select throws_ok(
  $$insert into games (event_id, organization_id, opponent_name)
    values (current_setting('fx.e_t1_game')::uuid, current_setting('fx.club_a')::uuid, 'Otro rival')$$,
  '23505', null,
  'un solo partido por evento'
);

-- Control positivo: los dos clubes tienen un foco con el slug `tecnica`.
select throws_ok(
  $$insert into focus_areas (organization_id, slug, name)
    values (current_setting('fx.club_a')::uuid, 'tecnica', 'Técnica repetida')$$,
  '23505', null,
  'slug de foco único por club'
);

-- La posición de un ítem es única por plan y la comprobación es diferida: se mira al
-- cerrar la transacción (aquí, al pasar las restricciones a `immediate`).
select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t1')::uuid, 1, 10);
    set constraints all immediate$$,
  '23505', null,
  'dos ítems de un plan no comparten posición'
);

-- Reordenar pasa por un estado intermedio con la posición repetida: solo vale si la
-- comprobación es diferida.
select lives_ok(
  $$update practice_items set sort = 2 where id = current_setting('fx.i_t1_1')::uuid;
    update practice_items set sort = 1 where id = current_setting('fx.i_t1_2')::uuid;
    set constraints all immediate$$,
  'los ítems de un plan se reordenan dentro de una transacción'
);

set constraints all deferred;

select results_eq(
  $$select title_override from practice_items
    where plan_id = current_setting('fx.plan_t1')::uuid order by sort$$,
  $$values ('plan-t1-2'), ('plan-t1-1'), ('plan-t1-3')$$,
  'el nuevo orden de los ítems queda guardado'
);

-- Control positivo: «Plantilla de T1» tenía su ítem (`plantilla-t1-1`, visto por c1).
select lives_ok(
  $$delete from practice_plans where id = current_setting('fx.tpl_t1')::uuid$$,
  'un plan con ítems se puede borrar'
);

select is_empty(
  $$select 1 from practice_items where plan_id = current_setting('fx.tpl_t1')::uuid$$,
  'borrar un plan borra sus ítems'
);

select has_index(
  'public'::name, 'events'::name, 'events_team_id_starts_at_idx'::name,
  array['team_id', 'starts_at']::name[],
  'events tiene índice por equipo y hora de inicio'::text
);

-- ── created_by toma por defecto el usuario de la sesión ──────────────────────────────
-- Se inserta como postgres (los usuarios no escriben en esta fase), con el `sub` de c2
-- en la sesión, que es lo que lee `auth.uid()`.
select tests.authenticate_as(current_setting('fx.c2')::uuid);
reset role;

insert into practice_plans (organization_id, title)
values (current_setting('fx.club_a')::uuid, 'Plan sin autor explícito');

select results_eq(
  $$select created_by from practice_plans where title = 'Plan sin autor explícito'$$,
  $$values (current_setting('fx.c2')::uuid)$$,
  'created_by toma por defecto el usuario de la sesión'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Plan de T2'), ('Plan sin autor explícito')$$,
  'quien crea un plan sin equipo lo ve'
);

-- ── RLS, privilegios, políticas y función de las cinco tablas ────────────────────────
reset role;

select results_eq(
  $$select count(*)::int from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('focus_areas', 'events', 'games', 'practice_plans', 'practice_items')
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
      and c.relname in ('focus_areas', 'events', 'games', 'practice_plans', 'practice_items')
      and has_table_privilege('anon', c.oid, p.privilege)$$,
  'anon no tiene ningún privilegio sobre las tablas'
);

select is_empty(
  $$select c.relname, p.privilege
    from pg_class as c
    cross join unnest(
      array['insert', 'update', 'delete', 'truncate', 'references', 'trigger']
      || case when current_setting('server_version_num')::int >= 170000
           then array['maintain'] else array[]::text[] end
    ) as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('focus_areas', 'events', 'games', 'practice_plans', 'practice_items')
      and has_table_privilege('authenticated', c.oid, p.privilege)$$,
  'authenticated no tiene privilegios de escritura'
);

select results_eq(
  $$select count(*)::int from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('focus_areas', 'events', 'games', 'practice_plans', 'practice_items')
      and has_table_privilege('authenticated', c.oid, 'select')$$,
  array[5],
  'authenticated puede leer las cinco tablas'
);

-- El seed y los scripts escriben con la clave de servicio (nunca desde src/).
select results_eq(
  $$select count(*)::int
    from pg_class as c
    cross join unnest(array['select', 'insert', 'update', 'delete']) as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('focus_areas', 'events', 'games', 'practice_plans', 'practice_items')
      and has_table_privilege('service_role', c.oid, p.privilege)$$,
  array[20],
  'service_role puede leer y escribir las cinco tablas'
);

-- Sin política no hay acceso, y en esta fase solo hay lectura: una política por tabla,
-- `for select` y solo para `authenticated`. Las columnas de tipo `name` del catálogo
-- llevan la collation "C"; se pasan a la de por defecto para compararlas con `values`.
select results_eq(
  $$select tablename::text collate "default", policyname::text collate "default",
           cmd, roles::text[] collate "default", permissive
    from pg_policies
    where schemaname = 'public'
      and tablename in ('focus_areas', 'events', 'games', 'practice_plans', 'practice_items')
    order by 1, 2$$,
  $$values
    ('events', 'events_select_admin_or_staff', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('focus_areas', 'focus_areas_select_member', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('games', 'games_select_admin_or_staff', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('practice_items', 'practice_items_select_visible', 'SELECT', array['authenticated'], 'PERMISSIVE'),
    ('practice_plans', 'practice_plans_select_visible', 'SELECT', array['authenticated'], 'PERMISSIVE')$$,
  'una sola política por tabla, de lectura y solo para authenticated'
);

-- La función de RLS: `stable security definer` con `search_path` vacío, y fuera del
-- alcance de anon (PUBLIC incluido).
select results_eq(
  $$select count(*)::int from pg_proc as f
    where f.pronamespace = 'private'::regnamespace
      and f.proname = 'can_see_plan'
      and f.prosecdef
      and f.provolatile = 's'
      and f.proconfig = array['search_path=""']$$,
  array[1],
  'can_see_plan es stable security definer con search_path vacío'
);

select is_empty(
  $$select f.oid::regprocedure::text from pg_proc as f
    where f.pronamespace = 'private'::regnamespace
      and f.proname = 'can_see_plan'
      and has_function_privilege('anon', f.oid, 'execute')$$,
  'anon no puede ejecutar can_see_plan'
);

select * from finish();

rollback;
