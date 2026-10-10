-- Vista de cobertura de The Way (Fase 7, Task 13; spec, decisión 11). Lo que se garantiza:
--   · cuenta solo una sesión jugada (status = 'done') con el ítem marcado hecho de verdad
--     (completed = true), nunca un plan sin jugar ni un ítem sin marcar;
--   · solo dentro del rango de fechas pedido;
--   · cada club ve solo lo suyo;
--   · dirección ve la cobertura de cualquier equipo de su club; un entrenador, solo la de
--     los suyos (la misma RLS de siempre: `security invoker`, no eleva nada).
--
-- Se ejecuta con `pnpm test:db`. Transacción que se deshace al final; datos ficticios.
begin;

select plan(6);

do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@coverage.pgtap.test');
  u_coach_a uuid := tests.create_user('coach-a@coverage.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@coverage.pgtap.test');

  p_admin_a constant uuid := gen_random_uuid();
  p_coach_a constant uuid := gen_random_uuid();
  p_coach_b constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  cat_a constant uuid := gen_random_uuid();
  t1 constant uuid := gen_random_uuid();
  t2 constant uuid := gen_random_uuid();

  standard_1 constant uuid := gen_random_uuid();
  standard_2 constant uuid := gen_random_uuid();
  drill_1 constant uuid := gen_random_uuid();

  -- T1: un plan jugado, con su ítem marcado hecho, enlazado a standard_1: cuenta.
  event_done constant uuid := gen_random_uuid();
  plan_done constant uuid := gen_random_uuid();

  -- T1: un plan jugado pero con el ítem SIN marcar hecho: no cuenta.
  event_not_completed constant uuid := gen_random_uuid();
  plan_not_completed constant uuid := gen_random_uuid();

  -- T1: un plan solo programado (nunca jugado), con su ítem marcado: no cuenta.
  event_scheduled constant uuid := gen_random_uuid();
  plan_scheduled constant uuid := gen_random_uuid();

  -- T1: un plan jugado fuera del rango de fechas pedido: no cuenta.
  event_out_of_range constant uuid := gen_random_uuid();
  plan_out_of_range constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'), (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_admin_a, club_a, 'adminA', 'Ficticia', null),
    (p_coach_a, club_a, 'coachA', 'Ficticio', null),
    (p_coach_b, club_b, 'coachB', 'Ficticio', null);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', p_admin_a),
    (club_a, u_coach_a, 'coach', p_coach_a),
    (club_b, u_coach_b, 'coach', p_coach_b);

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true);
  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_a, club_a, 'Alevín', 'U12', 10);
  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, club_a, season_a, cat_a, 'T1'), (t2, club_a, season_a, cat_a, 'T2');
  insert into team_staff (organization_id, team_id, person_id, staff_role) values
    (club_a, t1, p_coach_a, 'head_coach');

  insert into standards (id, organization_id, number, title, description, status) values
    (standard_1, club_a, 1, 'Protejo el balón', 'Ficticio.', 'published'),
    (standard_2, club_a, 2, 'Leo la defensa', 'Ficticio.', 'published');
  insert into drills (id, organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, status) values
    (drill_1, club_a, 'Rondo 4x2', 4, 8, 5, 15, 8, 'published');
  insert into drill_standards (organization_id, drill_id, standard_id) values
    (club_a, drill_1, standard_1);

  insert into events (id, organization_id, team_id, kind, starts_at, ends_at, status) values
    (event_done, club_a, t1, 'practice', '2026-10-05 18:00+00', '2026-10-05 19:00+00', 'done'),
    (event_not_completed, club_a, t1, 'practice', '2026-10-06 18:00+00', '2026-10-06 19:00+00', 'done'),
    (event_scheduled, club_a, t1, 'practice', '2026-10-07 18:00+00', '2026-10-07 19:00+00', 'scheduled'),
    (event_out_of_range, club_a, t1, 'practice', '2026-01-05 18:00+00', '2026-01-05 19:00+00', 'done');

  insert into practice_plans (id, organization_id, team_id, event_id, title) values
    (plan_done, club_a, t1, event_done, 'Plan jugado'),
    (plan_not_completed, club_a, t1, event_not_completed, 'Plan sin marcar'),
    (plan_scheduled, club_a, t1, event_scheduled, 'Plan programado'),
    (plan_out_of_range, club_a, t1, event_out_of_range, 'Plan fuera de rango');

  insert into practice_items (organization_id, plan_id, sort, drill_id, minutes, completed) values
    (club_a, plan_done, 1, drill_1, 10, true),
    (club_a, plan_not_completed, 1, drill_1, 10, null),
    (club_a, plan_scheduled, 1, drill_1, 10, true),
    (club_a, plan_out_of_range, 1, drill_1, 10, true);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.coach_a', u_coach_a::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.t1', t1::text, true);
  perform set_config('fx.t2', t2::text, true);
  perform set_config('fx.standard_1', standard_1::text, true);
  perform set_config('fx.standard_2', standard_2::text, true);
end
$$;

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select results_eq(
  $$select team_id, standard_id from coverage_by_team(
    current_setting('fx.club_a')::uuid, '2026-09-01'::date, '2027-06-30'::date
  )$$,
  $$values (current_setting('fx.t1')::uuid, current_setting('fx.standard_1')::uuid)$$,
  'solo el plan jugado y con el ítem marcado hecho cuenta: una sola fila'
);

select is_empty(
  $$select 1 from coverage_by_team(
    current_setting('fx.club_a')::uuid, '2025-01-01'::date, '2025-01-31'::date
  )$$,
  'fuera del rango de fechas pedido, nada cuenta'
);

select is_empty(
  $$select 1 from coverage_by_team(
    current_setting('fx.club_a')::uuid, '2026-09-01'::date, '2027-06-30'::date
  ) where standard_id = current_setting('fx.standard_2')::uuid$$,
  'un Standard sin ningún ejercicio que lo trabaje no sale nunca'
);

select results_eq(
  $$select count(*)::int from coverage_by_team(
    current_setting('fx.club_a')::uuid, '2026-09-01'::date, '2027-06-30'::date
  ) where team_id = current_setting('fx.t2')::uuid$$,
  $$values (0)$$,
  'T2, sin ninguna sesión jugada, no cubre nada'
);

select tests.authenticate_as(current_setting('fx.coach_a')::uuid);
select results_eq(
  $$select team_id from coverage_by_team(
    current_setting('fx.club_a')::uuid, '2026-09-01'::date, '2027-06-30'::date
  )$$,
  $$values (current_setting('fx.t1')::uuid)$$,
  'coachA ve la cobertura de su equipo (RLS de practice_plans, sin elevar nada)'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);
select is_empty(
  $$select 1 from coverage_by_team(
    current_setting('fx.club_a')::uuid, '2026-09-01'::date, '2027-06-30'::date
  )$$,
  'coachB, de otro club, no ve nada de club A aunque pida su id a mano'
);

select * from finish();

rollback;
