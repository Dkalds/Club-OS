-- Política de lectura de practice_plans sobre sus columnas.
--
-- La política `practice_plans_select_visible` se reescribe para que use los valores de las
-- columnas de la fila en lugar de llamar a `can_see_plan(id)`. Así `insert … returning` no
-- da 42501 al usuario que acaba de insertar (su fila no existe todavía en la tabla cuando
-- se evalúa la política de selección de la respuesta si la función busca por `id`).
--
-- Este test comprueba:
--   · `insert … returning id` sobre practice_plans no da 42501.
--   · La visibilidad resultante es la misma que antes: adminA ve todo su club, c1 ve los
--     planes de su equipo y su plantilla privada, quien no está en el cuerpo técnico no ve
--     nada del equipo, un jugador tampoco, alguien de otro club tampoco.
begin;

select plan(10);

-- ── Fixtures ─────────────────────────────────────────────────────────────────────────
-- Club A: T1 con c1 (coach) y jugador (player). T2 con c2 (coach). adminA es admin.
-- Club B: TB con coachB (coach). adminB es admin.
do $$
declare
  club_a constant uuid := 'aabbccdd-0000-4000-8000-aabbccdd0010';
  club_b constant uuid := 'aabbccdd-0000-4000-8000-aabbccdd0011';

  u_admin_a uuid := tests.create_user('admin-a@read-policy.pgtap.test');
  u_c1 uuid := tests.create_user('c1@read-policy.pgtap.test');
  u_c2 uuid := tests.create_user('c2@read-policy.pgtap.test');
  u_jugador uuid := tests.create_user('jugador@read-policy.pgtap.test');
  u_admin_b uuid := tests.create_user('admin-b@read-policy.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@read-policy.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_c2 constant uuid := gen_random_uuid();
  p_jug constant uuid := gen_random_uuid();
  p_cb constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  season_b constant uuid := gen_random_uuid();
  cat_a constant uuid := gen_random_uuid();
  cat_b constant uuid := gen_random_uuid();

  t1 constant uuid := gen_random_uuid();
  t2 constant uuid := gen_random_uuid();
  tb constant uuid := gen_random_uuid();
begin
  -- Clubs
  insert into organizations (id, slug, name)
    values (club_a, 'rp-club-a', 'RP Club A'),
           (club_b, 'rp-club-b', 'RP Club B');

  -- Personas
  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1,  club_a, 'Coach', 'Uno', null),
    (p_c2,  club_a, 'Coach', 'Dos', null),
    (p_jug, club_a, 'Jugador', 'Uno', 2014),
    (p_cb,  club_b, 'Coach', 'B', null);

  -- Membresías
  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin',  null),
    (club_a, u_c1,      'coach',  p_c1),
    (club_a, u_c2,      'coach',  p_c2),
    (club_a, u_jugador, 'player', p_jug),
    (club_b, u_admin_b, 'admin',  null),
    (club_b, u_coach_b, 'coach',  p_cb);

  -- Temporadas y categorías
  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true),
    (season_b, club_b, '2026/27', '2026-09-01', '2027-06-30', true);
  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_a, club_a, 'Alevín', 'U12', 10),
    (cat_b, club_b, 'Infantil', 'U14', 10);

  -- Equipos
  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, club_a, season_a, cat_a, 'T1 Alevín A'),
    (t2, club_a, season_a, cat_a, 'T2 Benjamín A'),
    (tb, club_b, season_b, cat_b, 'TB Infantil A');

  -- Cuerpos técnicos
  insert into team_staff (organization_id, team_id, person_id, staff_role) values
    (club_a, t1, p_c1, 'head_coach'),
    (club_a, t2, p_c2, 'head_coach'),
    (club_b, tb, p_cb, 'head_coach');

  -- Plantillas
  insert into team_players (organization_id, team_id, person_id) values
    (club_a, t1, p_jug);

  -- Planes de referencia (como postgres, sin RLS)
  insert into practice_plans (organization_id, team_id, title, created_by) values
    (club_a, t1, 'Sesión T1', u_c1),
    (club_a, t2, 'Sesión T2', u_c2);
  insert into practice_plans (organization_id, team_id, title, created_by) values
    (club_a, null, 'Plantilla privada c1', u_c1);

  perform set_config('fx.club_a',   club_a::text, true);
  perform set_config('fx.t1',       t1::text, true);
  perform set_config('fx.t2',       t2::text, true);
  perform set_config('fx.admin_a',  u_admin_a::text, true);
  perform set_config('fx.c1',       u_c1::text, true);
  perform set_config('fx.c2',       u_c2::text, true);
  perform set_config('fx.jugador',  u_jugador::text, true);
  perform set_config('fx.admin_b',  u_admin_b::text, true);
  perform set_config('fx.coach_b',  u_coach_b::text, true);
end
$$;

-- ── Tests ─────────────────────────────────────────────────────────────────────────────

-- 1. INSERT … RETURNING: c1 crea un plan en T1 y lo recibe sin 42501.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select lives_ok(
  $$insert into practice_plans (organization_id, team_id, title)
      values (current_setting('fx.club_a')::uuid,
              current_setting('fx.t1')::uuid,
              'Plan insert returning')
      returning id$$,
  'c1 puede hacer INSERT … RETURNING id en practice_plans sin 42501'
);

-- 2. c1 ve los planes de T1 y su plantilla privada.
select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Plan insert returning'), ('Plantilla privada c1'), ('Sesión T1')$$,
  'c1 ve los planes de su equipo y su plantilla privada'
);

-- 3. c2 ve solo los planes de T2 (no T1, no la plantilla de c1).
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Sesión T2')$$,
  'c2 ve solo los planes de T2'
);

-- 4. adminA ve todos los planes del club A.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Plan insert returning'), ('Plantilla privada c1'), ('Sesión T1'), ('Sesión T2')$$,
  'adminA ve todos los planes del club A'
);

-- 5. Un jugador no ve ningún plan.
select tests.authenticate_as(current_setting('fx.jugador')::uuid);

select is_empty(
  'select title from practice_plans',
  'un jugador (role player) no ve ningún plan'
);

-- 6. Un admin de otro club no ve ningún plan del club A.
select tests.authenticate_as(current_setting('fx.admin_b')::uuid);

select is_empty(
  'select title from practice_plans where organization_id = current_setting(''fx.club_a'')::uuid',
  'adminB no ve los planes del club A'
);

-- 7. Un coach de otro club tampoco.
select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select is_empty(
  'select title from practice_plans where organization_id = current_setting(''fx.club_a'')::uuid',
  'coachB no ve los planes del club A'
);

-- 8. c1 deja T1 y deja de ver sus planes de equipo, pero sigue viendo su plantilla privada.
reset role;
delete from team_staff
where team_id = current_setting('fx.t1')::uuid
  and person_id = (
    select person_id from memberships
    where user_id = current_setting('fx.c1')::uuid
      and organization_id = current_setting('fx.club_a')::uuid
  );

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Plantilla privada c1')$$,
  'c1 sin staff de T1: solo ve su plantilla privada (los planes de T1 ya no son visibles)'
);

-- 9. adminA sigue viendo todos los planes aunque c1 haya salido del equipo.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Plan insert returning'), ('Plantilla privada c1'), ('Sesión T1'), ('Sesión T2')$$,
  'adminA ve todos los planes del club A incluido el recién insertado por c1 en T1'
);

-- 10. La visibilidad de practice_items sigue al plan: c2 ve solo los ítems de T2.
reset role;
insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
select organization_id, id, 1, 'item-t2', 10 from practice_plans where title = 'Sesión T2';

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  'select title_override from practice_items',
  $$values ('item-t2')$$,
  'c2 ve solo los ítems del plan de T2'
);

select * from finish();
rollback;
