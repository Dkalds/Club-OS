-- Escritura de las sesiones de entrenamiento: quién crea y cambia eventos, planes e ítems.
--
-- Lo que RLS y los privilegios por columna garantizan al abrir la escritura:
--   · escribe quien gestiona el equipo (su cuerpo técnico y el admin de su club) y nadie más:
--     ni el cuerpo técnico de otro equipo del mismo club, ni nadie de otro club, ni un jugador;
--   · solo entrenos: un partido no se crea ni se cambia;
--   · una sesión cerrada (`done` o `cancelled`) es de solo lectura: ni se cambia, ni recibe
--     un plan que no tuviera, ni se reabre;
--   · una fila no cambia de club, de equipo, de evento, de plan ni de autor, y ni los eventos
--     ni los planes se borran.
--
-- Los dos rechazos de permisos comparten código (42501). Donde importa cuál de las dos capas
-- actuó, la aserción exige el mensaje: «new row violates row-level security policy» es la
-- política; «permission denied for table» es el privilegio. Y un `update` o un `delete` que
-- RLS no deja pasar no falla: no encuentra filas. Por eso esas aserciones cuentan filas.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*`
-- vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al
-- final. Los datos son ficticios y solo de este test.
begin;

select plan(113);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Como en practice_integrity.test.sql, más un ayudante en T1 y sesiones cerradas:
-- Club A
--   T1 «Alevín A»:   staff c1 (entrenador) y c1b (ayudante); jugador p1.
--   T2 «Benjamín A»: staff c2.
--   adminA es admin y su membresía no enlaza con ninguna persona. `jugador` es la cuenta
--   de p1 (rol player).
-- Club B
--   TB «Infantil A»: staff cb. adminB es su admin.
--
-- Eventos (lugar → equipo, tipo, estado) y su plan (título):
--   «T1 entreno»        → T1, entreno, programado → «Sesión de T1» (dos ítems)
--   «T1 sin plan»       → T1, entreno, programado → sin plan
--   «T1 hecho»          → T1, entreno, hecho      → «Sesión hecha» (un ítem)
--   «T1 hecho sin plan» → T1, entreno, hecho      → sin plan
--   «T1 cancelado»      → T1, entreno, cancelado  → «Sesión cancelada» (un ítem)
--   «T1 partido»        → T1, partido, programado
--   «T2 entreno»        → T2, entreno, programado → «Sesión de T2» (un ítem)
--   «TB entreno»        → TB, entreno, programado → «Sesión de TB» (un ítem)
-- Planes sin evento:
--   «Plan suelto de T1»       → T1, creado por c1 (un ítem)
--   «Plantilla privada de c1» → sin equipo, creado por c1 (un ítem)
-- Un foco y un ejercicio publicado en cada club, para las referencias cruzadas.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@practice-write.pgtap.test');
  u_c1 uuid := tests.create_user('c1@practice-write.pgtap.test');
  u_c1b uuid := tests.create_user('c1b@practice-write.pgtap.test');
  u_c2 uuid := tests.create_user('c2@practice-write.pgtap.test');
  u_jugador uuid := tests.create_user('jugador@practice-write.pgtap.test');
  u_admin_b uuid := tests.create_user('admin-b@practice-write.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@practice-write.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_c1b constant uuid := gen_random_uuid();
  p_c2 constant uuid := gen_random_uuid();
  p_p1 constant uuid := gen_random_uuid();
  p_cb constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  season_b constant uuid := gen_random_uuid();
  cat_alevin constant uuid := gen_random_uuid();
  cat_benjamin constant uuid := gen_random_uuid();
  cat_infantil constant uuid := gen_random_uuid();
  t1 constant uuid := gen_random_uuid();
  t2 constant uuid := gen_random_uuid();
  tb constant uuid := gen_random_uuid();

  f_tecnica constant uuid := gen_random_uuid();
  f_rebote constant uuid := gen_random_uuid();
  f_b constant uuid := gen_random_uuid();
  d_a constant uuid := gen_random_uuid();
  d_b constant uuid := gen_random_uuid();

  e_t1 constant uuid := gen_random_uuid();
  e_t1_libre constant uuid := gen_random_uuid();
  e_t1_done constant uuid := gen_random_uuid();
  e_t1_done_libre constant uuid := gen_random_uuid();
  e_t1_cancelled constant uuid := gen_random_uuid();
  e_t1_game constant uuid := gen_random_uuid();
  e_t2 constant uuid := gen_random_uuid();
  e_tb constant uuid := gen_random_uuid();

  plan_t1 constant uuid := gen_random_uuid();
  plan_done constant uuid := gen_random_uuid();
  plan_cancelled constant uuid := gen_random_uuid();
  plan_t2 constant uuid := gen_random_uuid();
  plan_tb constant uuid := gen_random_uuid();
  plan_suelto constant uuid := gen_random_uuid();
  tpl_c1 constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_c1b, club_a, 'c1b', 'Ficticio', null),
    (p_c2, club_a, 'c2', 'Ficticia', null),
    (p_p1, club_a, 'p1', 'Ficticio', 2015),
    (p_cb, club_b, 'cb', 'Ficticio', null);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', null),
    (club_a, u_c1, 'coach', p_c1),
    (club_a, u_c1b, 'coach', p_c1b),
    (club_a, u_c2, 'coach', p_c2),
    (club_a, u_jugador, 'player', p_p1),
    (club_b, u_admin_b, 'admin', null),
    (club_b, u_coach_b, 'coach', p_cb);

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
    (club_a, t1, p_c1b, 'assistant'),
    (club_a, t2, p_c2, 'head_coach'),
    (club_b, tb, p_cb, 'head_coach');

  insert into team_players (organization_id, team_id, person_id, jersey_number, position) values
    (club_a, t1, p_p1, 4, 'Base');

  insert into focus_areas (id, organization_id, slug, name, sort) values
    (f_tecnica, club_a, 'tecnica', 'Técnica', 10),
    (f_rebote, club_a, 'rebote', 'Rebote', 20),
    (f_b, club_b, 'tecnica', 'Técnica B', 10);

  insert into drills (
    id, organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, status
  ) values
    (d_a, club_a, 'Ejercicio de A', 4, 12, 5, 15, 10, 'published'),
    (d_b, club_b, 'Ejercicio de B', 4, 12, 5, 15, 10, 'published');

  insert into events (id, organization_id, team_id, kind, starts_at, ends_at, location, status) values
    (e_t1_done_libre, club_a, t1, 'practice', '2026-09-24T16:00:00Z', '2026-09-24T17:15:00Z', 'T1 hecho sin plan', 'done'),
    (e_t1_done, club_a, t1, 'practice', '2026-09-29T16:00:00Z', '2026-09-29T17:15:00Z', 'T1 hecho', 'done'),
    (e_t1_cancelled, club_a, t1, 'practice', '2026-10-01T16:00:00Z', '2026-10-01T17:15:00Z', 'T1 cancelado', 'cancelled'),
    (e_t2, club_a, t2, 'practice', '2026-10-06T15:00:00Z', '2026-10-06T16:00:00Z', 'T2 entreno', 'scheduled'),
    (e_t1, club_a, t1, 'practice', '2026-10-06T16:00:00Z', '2026-10-06T17:15:00Z', 'T1 entreno', 'scheduled'),
    (e_tb, club_b, tb, 'practice', '2026-10-07T16:00:00Z', '2026-10-07T17:15:00Z', 'TB entreno', 'scheduled'),
    (e_t1_libre, club_a, t1, 'practice', '2026-10-08T16:00:00Z', '2026-10-08T17:15:00Z', 'T1 sin plan', 'scheduled'),
    (e_t1_game, club_a, t1, 'game', '2026-10-10T08:30:00Z', '2026-10-10T10:00:00Z', 'T1 partido', 'scheduled');

  -- Un evento de partido siempre tiene su fila en `games` (`create_game` crea las dos).
  insert into games (event_id, organization_id, opponent_name) values
    (e_t1_game, club_a, 'Rival de T1');

  -- Los fixtures se insertan sin sesión (`auth.uid()` es null): el autor va explícito.
  insert into practice_plans (
    id, organization_id, team_id, event_id, title, is_template, status, created_by
  ) values
    (plan_t1, club_a, t1, e_t1, 'Sesión de T1', false, 'ready', u_c1),
    (plan_done, club_a, t1, e_t1_done, 'Sesión hecha', false, 'done', u_c1),
    (plan_cancelled, club_a, t1, e_t1_cancelled, 'Sesión cancelada', false, 'ready', u_c1),
    (plan_t2, club_a, t2, e_t2, 'Sesión de T2', false, 'ready', u_c2),
    (plan_tb, club_b, tb, e_tb, 'Sesión de TB', false, 'ready', u_coach_b),
    (plan_suelto, club_a, t1, null, 'Plan suelto de T1', false, 'draft', u_c1),
    (tpl_c1, club_a, null, null, 'Plantilla privada de c1', true, 'draft', u_c1);

  insert into practice_items (organization_id, plan_id, sort, phase, title_override, minutes) values
    (club_a, plan_t1, 1, 'Activación', 'sesion-t1-1', 10),
    (club_a, plan_t1, 2, 'Técnica', 'sesion-t1-2', 15),
    (club_a, plan_done, 1, 'Activación', 'hecha-1', 10),
    (club_a, plan_cancelled, 1, 'Activación', 'cancelada-1', 10),
    (club_a, plan_t2, 1, 'Activación', 'sesion-t2-1', 10),
    (club_b, plan_tb, 1, 'Activación', 'sesion-tb-1', 10),
    (club_a, plan_suelto, 1, null, 'suelto-1', 10),
    (club_a, tpl_c1, 1, null, 'privada-c1-1', 10);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.c1b', u_c1b::text, true);
  perform set_config('fx.c2', u_c2::text, true);
  perform set_config('fx.jugador', u_jugador::text, true);
  perform set_config('fx.admin_b', u_admin_b::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.t1', t1::text, true);
  perform set_config('fx.t2', t2::text, true);
  perform set_config('fx.tb', tb::text, true);
  perform set_config('fx.f_tecnica', f_tecnica::text, true);
  perform set_config('fx.f_rebote', f_rebote::text, true);
  perform set_config('fx.f_b', f_b::text, true);
  perform set_config('fx.d_a', d_a::text, true);
  perform set_config('fx.d_b', d_b::text, true);
  perform set_config('fx.e_t1', e_t1::text, true);
  perform set_config('fx.e_t1_libre', e_t1_libre::text, true);
  perform set_config('fx.e_t1_done', e_t1_done::text, true);
  perform set_config('fx.e_t1_done_libre', e_t1_done_libre::text, true);
  perform set_config('fx.e_t1_cancelled', e_t1_cancelled::text, true);
  perform set_config('fx.e_t1_game', e_t1_game::text, true);
  perform set_config('fx.e_t2', e_t2::text, true);
  perform set_config('fx.e_tb', e_tb::text, true);
  perform set_config('fx.plan_t1', plan_t1::text, true);
  perform set_config('fx.plan_done', plan_done::text, true);
  perform set_config('fx.plan_cancelled', plan_cancelled::text, true);
  perform set_config('fx.plan_t2', plan_t2::text, true);
  perform set_config('fx.plan_tb', plan_tb::text, true);
  perform set_config('fx.plan_suelto', plan_suelto::text, true);
  perform set_config('fx.tpl_c1', tpl_c1::text, true);
end
$$;

-- ── c1 crea y edita en su equipo ─────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

-- Las altas nombran todas las columnas que `authenticated` puede insertar, y solo esas: ni el
-- id, ni el estado, ni el autor. Los ponen los valores por defecto.
select lives_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-13T16:00:00Z', '2026-10-13T17:15:00Z', 'c1 entreno')$$,
  'c1 crea un entreno en T1, su equipo'
);

select results_eq(
  $$select organization_id, team_id, kind::text, status::text
    from events where location = 'c1 entreno'$$,
  $$values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            'practice', 'scheduled')$$,
  'el entreno nuevo es de T1 y nace programado'
);

select lives_ok(
  $$insert into practice_plans (
      organization_id, team_id, event_id, title, primary_focus_id, secondary_focus_id, notes
    )
    select organization_id, team_id, id, 'Plan de c1',
           current_setting('fx.f_tecnica')::uuid, current_setting('fx.f_rebote')::uuid,
           'Notas de c1'
    from events where location = 'c1 entreno'$$,
  'c1 crea el plan de su entreno'
);

select results_eq(
  $$select created_by, updated_by, status, event_kind::text, is_template
    from practice_plans where title = 'Plan de c1'$$,
  $$values (current_setting('fx.c1')::uuid, current_setting('fx.c1')::uuid,
            'draft', 'practice', false)$$,
  'el plan nace a nombre de c1, como borrador y de tipo practice'
);

select lives_ok(
  $$insert into practice_items (
      organization_id, plan_id, sort, phase, drill_id, title_override, minutes, notes
    )
    select organization_id, id, 1, 'Activación', current_setting('fx.d_a')::uuid,
           'plan-c1-1', 10, 'Notas del ítem'
    from practice_plans where title = 'Plan de c1'$$,
  'c1 añade a su plan un ítem con un ejercicio de su club'
);

-- El ayudante de T1 gestiona el equipo igual que su entrenador. Los cambios nombran todas las
-- columnas que `authenticated` puede actualizar.
select tests.authenticate_as(current_setting('fx.c1b')::uuid);

select results_eq(
  $$with u as (
      update practice_items
      set sort = 2, phase = 'Técnica', drill_id = null, title_override = 'plan-c1-1 bis',
          minutes = 12, notes = 'Retocado por c1b'
      where title_override = 'plan-c1-1'
      returning 1
    )
    select count(*)::int from u$$,
  array[1],
  'c1b, ayudante de T1, cambia el ítem que creó c1'
);

select results_eq(
  $$with u as (
      update practice_plans
      set title = 'Plan de c1 y c1b', primary_focus_id = current_setting('fx.f_rebote')::uuid,
          secondary_focus_id = null, notes = 'Retocado por c1b', status = 'ready'
      where title = 'Plan de c1'
      returning 1
    )
    select count(*)::int from u$$,
  array[1],
  'c1b cambia el plan que creó c1'
);

-- Quién guardó por última vez no lo dice c1b (no tiene privilegio sobre `updated_by`): lo
-- fija un trigger con el usuario de la sesión. El autor no cambia.
select results_eq(
  $$select created_by, updated_by, status from practice_plans where title = 'Plan de c1 y c1b'$$,
  $$values (current_setting('fx.c1')::uuid, current_setting('fx.c1b')::uuid, 'ready')$$,
  'el plan sigue a nombre de c1 y anota a c1b como quien lo cambió'
);

select results_eq(
  $$with u as (
      update events
      set starts_at = '2026-10-13T17:00:00Z', ends_at = '2026-10-13T18:00:00Z',
          location = 'c1 entreno movido'
      where location = 'c1 entreno'
      returning 1
    )
    select count(*)::int from u$$,
  array[1],
  'c1b cambia la hora y el lugar del entreno'
);

select results_eq(
  $$with d as (delete from practice_items where title_override = 'plan-c1-1 bis' returning 1)
    select count(*)::int from d$$,
  array[1],
  'c1b borra el ítem'
);

-- Un segundo cambio, ahora de c1: quien guardó por última vez pasa a ser él.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$with u as (update practice_plans set notes = 'Retocado por c1'
               where title = 'Plan de c1 y c1b' returning updated_by)
    select updated_by from u$$,
  $$values (current_setting('fx.c1')::uuid)$$,
  'un segundo cambio, de c1, lo anota a él'
);

-- Sin sesión, como el seed (que escribe con la clave de servicio), el trigger no tiene a
-- quién anotar y deja a quien estaba. `clear_authentication` vacía los claims, y `reset role`
-- vuelve a postgres.
select tests.clear_authentication();
reset role;

select results_eq(
  $$with u as (update practice_plans set notes = 'Retocado sin sesión'
               where title = 'Plan de c1 y c1b' returning updated_by)
    select updated_by from u$$,
  $$values (current_setting('fx.c1')::uuid)$$,
  'sin sesión, un cambio deja a quien había guardado por última vez'
);

-- Un plan del equipo sin evento (sin fecha todavía) es del cuerpo técnico, como los demás.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$with
      p as (update practice_plans set title = 'Plan suelto de T1 retocado'
            where id = current_setting('fx.plan_suelto')::uuid returning 1),
      i as (update practice_items set minutes = 20
            where plan_id = current_setting('fx.plan_suelto')::uuid returning 1)
    select (select count(*) from p)::int, (select count(*) from i)::int$$,
  $$values (1, 1)$$,
  'c1 cambia un plan de su equipo que no tiene evento, y su ítem'
);

-- Las plantillas privadas (planes sin equipo) quedan fuera de la fase: ni se crean ni se
-- cambian. c1 ve la suya (última columna): quien se lo impide es la política de escritura.
select throws_ok(
  $$insert into practice_plans (organization_id, title)
    values (current_setting('fx.club_a')::uuid, 'Plantilla nueva')$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'nadie crea un plan sin equipo'
);

select results_eq(
  $$with
      p as (update practice_plans set title = 'Plantilla retocada'
            where id = current_setting('fx.tpl_c1')::uuid returning 1),
      i as (update practice_items set minutes = 20
            where plan_id = current_setting('fx.tpl_c1')::uuid returning 1),
      d as (delete from practice_items
            where plan_id = current_setting('fx.tpl_c1')::uuid returning 1)
    select (select count(*) from p)::int, (select count(*) from i)::int,
           (select count(*) from d)::int,
           (select count(*) from practice_plans
            where id = current_setting('fx.tpl_c1')::uuid)::int$$,
  $$values (0, 0, 0, 1)$$,
  'c1 ve su plantilla privada pero no la cambia, ni cambia ni borra su ítem'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.tpl_c1')::uuid, 2,
            'privada-c1-2', 10)$$,
  '42501', 'new row violates row-level security policy for table "practice_items"',
  'c1 no añade ítems a su plantilla privada'
);

-- Las claves foráneas compuestas valen también para quien sí puede escribir la fila.
select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, drill_id, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t1')::uuid, 9,
            current_setting('fx.d_b')::uuid, 10)$$,
  '23503', null,
  'c1 no usa en su plan un ejercicio de otro club'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title, primary_focus_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            'Plan con foco de B', current_setting('fx.f_b')::uuid)$$,
  '23503', null,
  'c1 no usa en su plan un foco de otro club'
);

-- ── c2 no escribe en T1 (Review Focus 1) ─────────────────────────────────────────────
-- Mismo club, otro equipo.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

-- Control positivo: en T2 sí escribe, así que lo de abajo no es de alguien que no escribe
-- en ningún sitio.
select results_eq(
  $$with
      e as (update events set location = 'T2 entreno movido'
            where id = current_setting('fx.e_t2')::uuid returning 1),
      p as (update practice_plans set notes = 'Notas de c2'
            where id = current_setting('fx.plan_t2')::uuid returning 1),
      i as (update practice_items set minutes = 20
            where plan_id = current_setting('fx.plan_t2')::uuid returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from i)::int$$,
  $$values (1, 1, 1)$$,
  'control: c2 cambia el entreno, el plan y el ítem de T2, su equipo'
);

select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-14T16:00:00Z', '2026-10-14T17:15:00Z', 'c2 en T1')$$,
  '42501', 'new row violates row-level security policy for table "events"',
  'c2 no crea un entreno en T1'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'Plan de c2 en T1')$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'c2 no crea un plan en T1'
);

-- «T1 sin plan» no tiene plan: lo que rechaza a c2 no es el único de `event_id`. Diciendo que
-- el plan es de T1 lo para la política, porque no gestiona T1. Diciendo que es de T2, donde sí
-- escribe, lo para también la política: el evento de un plan tiene que estar programado, y c2
-- no ve los eventos de T1. Detrás queda la clave foránea que ata el plan al equipo de su
-- evento (más abajo, con la lectura abierta).
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.e_t1_libre')::uuid, 'Plan de c2 en el entreno de T1')$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'c2 no planifica un entreno de T1'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid,
            current_setting('fx.e_t1_libre')::uuid, 'Plan de T2 en el entreno de T1')$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'c2 no ocupa un entreno de T1 con un plan de T2'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t1')::uuid, 9,
            'c2-en-t1', 10)$$,
  '42501', 'new row violates row-level security policy for table "practice_items"',
  'c2 no añade ítems al plan de T1'
);

select results_eq(
  $$with
      e as (update events set location = 'c2 estuvo aquí'
            where team_id = current_setting('fx.t1')::uuid returning 1),
      p as (update practice_plans set title = 'c2 estuvo aquí'
            where team_id = current_setting('fx.t1')::uuid returning 1),
      i as (update practice_items set minutes = 99
            where plan_id = current_setting('fx.plan_t1')::uuid returning 1),
      d as (delete from practice_items
            where plan_id = current_setting('fx.plan_t1')::uuid returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from i)::int, (select count(*) from d)::int$$,
  $$values (0, 0, 0, 0)$$,
  'c2 no cambia los entrenos, los planes ni los ítems de T1, ni los borra'
);

-- ── coachB y adminB no escriben en A ─────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select lives_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.tb')::uuid, 'practice',
            '2026-10-14T16:00:00Z', '2026-10-14T17:15:00Z', 'coachB entreno')$$,
  'control: coachB crea un entreno en TB, su equipo'
);

select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-14T16:00:00Z', '2026-10-14T17:15:00Z', 'coachB en T1')$$,
  '42501', 'new row violates row-level security policy for table "events"',
  'coachB no crea un entreno en un equipo de A'
);

-- La política mira el equipo, que sí gestiona; que la fila diga ser de A lo rechaza la clave
-- foránea compuesta: el equipo es de B.
select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.tb')::uuid, 'practice',
            '2026-10-14T16:00:00Z', '2026-10-14T17:15:00Z', 'coachB a nombre de A')$$,
  '23503', null,
  'coachB no crea un entreno de su equipo a nombre de A'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'Plan de coachB en T1')$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'coachB no crea un plan en un equipo de A'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t1')::uuid, 9,
            'coachb-en-t1', 10)$$,
  '42501', 'new row violates row-level security policy for table "practice_items"',
  'coachB no añade ítems a un plan de A'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_tb')::uuid, 9,
            'coachb-a-nombre-de-a', 10)$$,
  '23503', null,
  'coachB no añade a su plan un ítem a nombre de A'
);

select results_eq(
  $$with
      e as (update events set location = 'coachB estuvo aquí'
            where organization_id = current_setting('fx.club_a')::uuid returning 1),
      p as (update practice_plans set title = 'coachB estuvo aquí'
            where organization_id = current_setting('fx.club_a')::uuid returning 1),
      i as (update practice_items set minutes = 99
            where organization_id = current_setting('fx.club_a')::uuid returning 1),
      d as (delete from practice_items
            where organization_id = current_setting('fx.club_a')::uuid returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from i)::int, (select count(*) from d)::int$$,
  $$values (0, 0, 0, 0)$$,
  'coachB no cambia eventos, planes ni ítems de A, ni los borra'
);

select tests.authenticate_as(current_setting('fx.admin_b')::uuid);

select results_eq(
  $$with
      e as (update events set location = 'TB entreno movido'
            where id = current_setting('fx.e_tb')::uuid returning 1),
      p as (update practice_plans set notes = 'Notas de adminB'
            where id = current_setting('fx.plan_tb')::uuid returning 1),
      i as (update practice_items set minutes = 20
            where plan_id = current_setting('fx.plan_tb')::uuid returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from i)::int$$,
  $$values (1, 1, 1)$$,
  'control: adminB cambia el entreno, el plan y el ítem de TB'
);

select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-14T16:00:00Z', '2026-10-14T17:15:00Z', 'adminB en T1')$$,
  '42501', 'new row violates row-level security policy for table "events"',
  'adminB no crea un entreno en un equipo de A: ser admin de un club no da nada en otro'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'Plan de adminB en T1')$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'adminB no crea un plan en un equipo de A'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.tb')::uuid, 'Plan a nombre de A')$$,
  '23503', null,
  'adminB no crea un plan de su equipo a nombre de A'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t1')::uuid, 9,
            'adminb-en-t1', 10)$$,
  '42501', 'new row violates row-level security policy for table "practice_items"',
  'adminB no añade ítems a un plan de A'
);

select results_eq(
  $$with
      e as (update events set location = 'adminB estuvo aquí'
            where organization_id = current_setting('fx.club_a')::uuid returning 1),
      p as (update practice_plans set title = 'adminB estuvo aquí'
            where organization_id = current_setting('fx.club_a')::uuid returning 1),
      i as (update practice_items set minutes = 99
            where organization_id = current_setting('fx.club_a')::uuid returning 1),
      d as (delete from practice_items
            where organization_id = current_setting('fx.club_a')::uuid returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from i)::int, (select count(*) from d)::int$$,
  $$values (0, 0, 0, 0)$$,
  'adminB no cambia eventos, planes ni ítems de A, ni los borra'
);

-- ── adminA gestiona T1 y T2, y nada de B ─────────────────────────────────────────────
-- Su membresía no enlaza con ninguna persona: gestionar por ser admin no depende de estar
-- en ningún cuerpo técnico.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select lives_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values
      (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
       '2026-10-15T16:00:00Z', '2026-10-15T17:15:00Z', 'adminA entreno T1'),
      (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid, 'practice',
       '2026-10-15T15:00:00Z', '2026-10-15T16:00:00Z', 'adminA entreno T2')$$,
  'adminA crea un entreno en T1 y otro en T2'
);

select lives_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    select organization_id, team_id, id, 'Plan de adminA'
    from events where location like 'adminA entreno%'$$,
  'adminA crea el plan de cada uno'
);

select lives_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    select organization_id, id, 1, 'plan-admina-1', 10
    from practice_plans where title = 'Plan de adminA'$$,
  'adminA añade un ítem a cada plan'
);

select results_eq(
  $$select
      (select count(*) from events where location like 'adminA entreno%')::int,
      (select count(*) from practice_plans
       where title = 'Plan de adminA'
         and created_by = current_setting('fx.admin_a')::uuid)::int,
      (select count(*) from practice_items where title_override = 'plan-admina-1')::int$$,
  $$values (2, 2, 2)$$,
  'los dos entrenos tienen su plan, a nombre de adminA, y su ítem'
);

select results_eq(
  $$with
      e as (update events set location = location || ' (admin)'
            where id in (current_setting('fx.e_t1')::uuid, current_setting('fx.e_t2')::uuid)
            returning 1),
      p as (update practice_plans set notes = 'Notas de adminA'
            where id in (current_setting('fx.plan_t1')::uuid, current_setting('fx.plan_t2')::uuid)
            returning 1),
      d as (delete from practice_items where title_override = 'plan-admina-1' returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from d)::int$$,
  $$values (2, 2, 2)$$,
  'adminA cambia los entrenos y los planes de T1 y de T2, y borra sus ítems'
);

select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.tb')::uuid, 'practice',
            '2026-10-14T16:00:00Z', '2026-10-14T17:15:00Z', 'adminA en TB')$$,
  '42501', 'new row violates row-level security policy for table "events"',
  'adminA no crea un entreno en un equipo de B'
);

select results_eq(
  $$with
      e as (update events set location = 'adminA estuvo aquí'
            where organization_id = current_setting('fx.club_b')::uuid returning 1),
      p as (update practice_plans set title = 'adminA estuvo aquí'
            where organization_id = current_setting('fx.club_b')::uuid returning 1),
      i as (update practice_items set minutes = 99
            where organization_id = current_setting('fx.club_b')::uuid returning 1),
      d as (delete from practice_items
            where organization_id = current_setting('fx.club_b')::uuid returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from i)::int, (select count(*) from d)::int$$,
  $$values (0, 0, 0, 0)$$,
  'adminA no cambia eventos, planes ni ítems de B, ni los borra'
);

-- ── jugador: está en la plantilla de T1, no en su cuerpo técnico ─────────────────────
select tests.authenticate_as(current_setting('fx.jugador')::uuid);

select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-14T16:00:00Z', '2026-10-14T17:15:00Z', 'jugador en T1')$$,
  '42501', 'new row violates row-level security policy for table "events"',
  'una cuenta de jugador no crea un entreno de su equipo'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'Plan de jugador')$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'una cuenta de jugador no crea un plan de su equipo'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t1')::uuid, 9,
            'jugador-en-t1', 10)$$,
  '42501', 'new row violates row-level security policy for table "practice_items"',
  'una cuenta de jugador no añade ítems al plan de su equipo'
);

select results_eq(
  $$with
      e as (update events set location = 'jugador estuvo aquí' returning 1),
      p as (update practice_plans set title = 'jugador estuvo aquí' returning 1),
      i as (update practice_items set minutes = 99 returning 1),
      d as (delete from practice_items returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from i)::int, (select count(*) from d)::int$$,
  $$values (0, 0, 0, 0)$$,
  'una cuenta de jugador no cambia ni borra nada'
);

-- ── Partidos ─────────────────────────────────────────────────────────────────────────
-- Desde la Fase 6 los partidos se escriben con sus propias políticas y funciones (C11):
-- `games_write.test.sql`. Las de entrenos siguen sin abrir nada de un partido: lo comprueba
-- «una cuenta de jugador…» de arriba y las aserciones de `kind` de este fichero.

-- ── Sesión cerrada (Review Focus 5) ──────────────────────────────────────────────────
-- Un entreno hecho o cancelado es histórico: se lee, no se escribe.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

-- Control positivo: c1 ve los dos entrenos cerrados, sus planes y sus ítems. Los ceros de
-- abajo los pone la política de escritura, no la de lectura.
select results_eq(
  $$select
      (select count(*) from events
       where id in (current_setting('fx.e_t1_done')::uuid,
                    current_setting('fx.e_t1_cancelled')::uuid))::int,
      (select count(*) from practice_plans
       where id in (current_setting('fx.plan_done')::uuid,
                    current_setting('fx.plan_cancelled')::uuid))::int,
      (select count(*) from practice_items
       where plan_id in (current_setting('fx.plan_done')::uuid,
                         current_setting('fx.plan_cancelled')::uuid))::int$$,
  $$values (2, 2, 2)$$,
  'control: c1 ve los entrenos cerrados de T1, sus planes y sus ítems'
);

select results_eq(
  $$with
      e as (update events set location = 'reabierto', status = 'scheduled'
            where id in (current_setting('fx.e_t1_done')::uuid,
                         current_setting('fx.e_t1_cancelled')::uuid)
            returning 1),
      p as (update practice_plans set title = 'reabierto', status = 'draft'
            where id in (current_setting('fx.plan_done')::uuid,
                         current_setting('fx.plan_cancelled')::uuid)
            returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int$$,
  $$values (0, 0)$$,
  'c1 no cambia ni reabre un entreno hecho ni uno cancelado, ni sus planes'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_done')::uuid, 9,
            'hecha-9', 10)$$,
  '42501', 'new row violates row-level security policy for table "practice_items"',
  'c1 no añade ítems al plan de un entreno hecho'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_cancelled')::uuid, 9,
            'cancelada-9', 10)$$,
  '42501', 'new row violates row-level security policy for table "practice_items"',
  'c1 no añade ítems al plan de un entreno cancelado'
);

select results_eq(
  $$with
      i as (update practice_items set minutes = 99
            where plan_id in (current_setting('fx.plan_done')::uuid,
                              current_setting('fx.plan_cancelled')::uuid)
            returning 1),
      d as (delete from practice_items
            where plan_id in (current_setting('fx.plan_done')::uuid,
                              current_setting('fx.plan_cancelled')::uuid)
            returning 1)
    select (select count(*) from i)::int, (select count(*) from d)::int$$,
  $$values (0, 0)$$,
  'c1 no cambia ni borra los ítems de una sesión cerrada'
);

-- «T1 hecho sin plan» no tiene plan, así que no lo para el único de `event_id`; y es de T1,
-- así que tampoco la clave foránea. Control positivo: sobre un entreno programado sin plan sí
-- pudo («Plan de c1», arriba).
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.e_t1_done_libre')::uuid, 'Plan a toro pasado')$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'c1 no le pone un plan a un entreno ya cerrado'
);

-- Cerrar es de quien gestiona el equipo; reabrir, de nadie. «c1 entreno movido» es el que c1
-- creó arriba, con su plan.
select results_eq(
  $$with u as (update events set status = 'done'
               where location = 'c1 entreno movido' returning 1)
    select count(*)::int from u$$,
  array[1],
  'c1 da por hecho su entreno'
);

select results_eq(
  $$with
      e as (update events set status = 'scheduled'
            where location = 'c1 entreno movido' returning 1),
      p as (update practice_plans set title = 'reabierto'
            where title = 'Plan de c1 y c1b' returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from events
            where location = 'c1 entreno movido' and status = 'done')::int$$,
  $$values (0, 0, 1)$$,
  'c1 no reabre el entreno que acaba de cerrar, ni cambia ya su plan'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    select organization_id, id, 9, 'plan-c1-9', 10
    from practice_plans where title = 'Plan de c1 y c1b'$$,
  '42501', 'new row violates row-level security policy for table "practice_items"',
  'c1 no añade ítems al plan del entreno que acaba de cerrar'
);

-- El admin tampoco: cerrada es cerrada para todos.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$with
      e as (update events set location = 'reabierto', status = 'scheduled'
            where status <> 'scheduled' returning 1),
      p as (update practice_plans set title = 'reabierto'
            where id in (current_setting('fx.plan_done')::uuid,
                         current_setting('fx.plan_cancelled')::uuid)
            returning 1),
      i as (update practice_items set minutes = 99
            where plan_id in (current_setting('fx.plan_done')::uuid,
                              current_setting('fx.plan_cancelled')::uuid)
            returning 1),
      d as (delete from practice_items
            where plan_id in (current_setting('fx.plan_done')::uuid,
                              current_setting('fx.plan_cancelled')::uuid)
            returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from i)::int, (select count(*) from d)::int,
           (select count(*) from events where status <> 'scheduled')::int$$,
  $$values (0, 0, 0, 0, 4)$$,
  'adminA ve las cuatro sesiones cerradas de su club y tampoco las cambia'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.e_t1_done_libre')::uuid, 'Plan a toro pasado')$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'adminA tampoco le pone un plan a un entreno ya cerrado'
);

-- ── Ni club, ni equipo, ni tipo, ni evento, ni autor ─────────────────────────────────
-- Lo cierra el privilegio por columnas, antes de llegar a RLS: adminA gestiona T1 y T2, así
-- que la política sola le dejaría pasar un entreno o un plan de un equipo a otro. El mensaje
-- es el del privilegio.
select throws_ok(
  $$update events set team_id = current_setting('fx.t2')::uuid
    where id = current_setting('fx.e_t1_libre')::uuid$$,
  '42501', 'permission denied for table events',
  'un evento no cambia de equipo'
);

select throws_ok(
  $$update events set organization_id = current_setting('fx.club_b')::uuid
    where id = current_setting('fx.e_t1_libre')::uuid$$,
  '42501', 'permission denied for table events',
  'un evento no cambia de club'
);

select throws_ok(
  $$update events set kind = 'game' where id = current_setting('fx.e_t1_libre')::uuid$$,
  '42501', 'permission denied for table events',
  'un entreno no se convierte en partido'
);

select throws_ok(
  $$update practice_plans set organization_id = current_setting('fx.club_b')::uuid
    where id = current_setting('fx.plan_suelto')::uuid$$,
  '42501', 'permission denied for table practice_plans',
  'un plan no cambia de club'
);

select throws_ok(
  $$update practice_plans set team_id = current_setting('fx.t2')::uuid
    where id = current_setting('fx.plan_suelto')::uuid$$,
  '42501', 'permission denied for table practice_plans',
  'un plan no cambia de equipo'
);

select throws_ok(
  $$update practice_plans set event_id = current_setting('fx.e_t1_libre')::uuid
    where id = current_setting('fx.plan_suelto')::uuid$$,
  '42501', 'permission denied for table practice_plans',
  'un plan no cambia de evento'
);

select throws_ok(
  $$update practice_plans set created_by = current_setting('fx.c2')::uuid
    where id = current_setting('fx.plan_suelto')::uuid$$,
  '42501', 'permission denied for table practice_plans',
  'un plan no cambia de autor'
);

-- Ni quién lo guardó por última vez: podría anotar a cualquier cuenta, de su club o de otro.
select throws_ok(
  $$update practice_plans set updated_by = current_setting('fx.c2')::uuid
    where id = current_setting('fx.plan_suelto')::uuid$$,
  '42501', 'permission denied for table practice_plans',
  'nadie escribe a mano quién guardó un plan por última vez'
);

-- `updated_at` es el testigo de la copia obsoleta: lo mueve el trigger, no quien guarda.
select throws_ok(
  $$update practice_plans set updated_at = now()
    where id = current_setting('fx.plan_suelto')::uuid$$,
  '42501', 'permission denied for table practice_plans',
  'nadie escribe a mano el updated_at de un plan'
);

select throws_ok(
  $$update practice_items set plan_id = current_setting('fx.plan_t2')::uuid
    where plan_id = current_setting('fx.plan_t1')::uuid$$,
  '42501', 'permission denied for table practice_items',
  'un ítem no cambia de plan'
);

-- Tampoco al crear: ni un evento que nazca cerrado, ni un plan a nombre de otro.
select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, status)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-16T16:00:00Z', '2026-10-16T17:15:00Z', 'done')$$,
  '42501', 'permission denied for table events',
  'un evento no se crea con el estado elegido'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title, created_by)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            'Plan a nombre de c2', current_setting('fx.c2')::uuid)$$,
  '42501', 'permission denied for table practice_plans',
  'un plan no se crea a nombre de otro'
);

-- ── Nadie borra eventos ni planes ────────────────────────────────────────────────────
-- No hay `grant delete`: el borrado falla por privilegios, antes de llegar a RLS. Si alguien
-- lo concediera sin política, el borrado no encontraría filas y estas dos aserciones fallarían.
select throws_ok(
  $$delete from events where id = current_setting('fx.e_t1_libre')::uuid$$,
  '42501', 'permission denied for table events',
  'nadie borra un evento, tampoco el admin'
);

select throws_ok(
  $$delete from practice_plans where id = current_setting('fx.plan_suelto')::uuid$$,
  '42501', 'permission denied for table practice_plans',
  'nadie borra un plan, tampoco el admin'
);

-- ── Sin `where`: hasta dónde llega cada uno ──────────────────────────────────────────
-- Los ceros de c2, coachB, adminB y adminA de arriba no prueban la política de escritura: sus
-- sentencias llevan `where`, PostgreSQL les aplica antes la política de lectura, y ninguno ve
-- las filas ajenas. Un `update` o un `delete` sin `where` ni `returning` no lee la fila, y la
-- política de lectura no entra: lo único que decide qué filas toca es la de escritura. Cada
-- usuario lanza aquí un cambio sobre todo lo que hay en las tres tablas, dejando su marca, y
-- después se mira como postgres hasta dónde llegó.
--
-- «Lo suyo» se calcula aparte, sin las funciones de RLS: los entrenos programados de sus
-- equipos, los planes de esos equipos sin evento o con un entreno programado, y sus ítems. La
-- función devuelve cuántas filas marcó fuera de lo suyo en cada tabla, y si marcó todo lo suyo
-- (que además no está vacío: si no, los ceros no dirían nada).
reset role;

create function pg_temp.alcance(marca text, equipos uuid[])
returns table (eventos_de_mas int, planes_de_mas int, items_de_mas int, todo_lo_suyo boolean)
language sql
as $$
  with
    e as (
      select
        position($1 in coalesce(ev.location, '')) > 0 as marcado,
        -- Los partidos no cancelados de sus equipos también, desde la Fase 6 (games_write).
        (ev.team_id = any ($2)
         and ((ev.kind = 'practice' and ev.status = 'scheduled')
              or (ev.kind = 'game' and ev.status <> 'cancelled'))) as suyo
      from public.events as ev
    ),
    p as (
      select
        pp.id,
        pp.notes is not distinct from $1 as marcado,
        coalesce(
          pp.team_id = any ($2)
          and (
            pp.event_id is null
            or exists (
              select 1 from public.events as ev
              where ev.id = pp.event_id and ev.status = 'scheduled'
            )
          ),
          false
        ) as suyo
      from public.practice_plans as pp
    ),
    i as (
      select pi.notes is not distinct from $1 as marcado, p.suyo
      from public.practice_items as pi
      join p on p.id = pi.plan_id
    )
  select
    (select count(*) from e where marcado and not suyo)::int,
    (select count(*) from p where marcado and not suyo)::int,
    (select count(*) from i where marcado and not suyo)::int,
    not exists (select 1 from e where suyo and not marcado)
      and not exists (select 1 from p where suyo and not marcado)
      and not exists (select 1 from i where suyo and not marcado)
      and exists (select 1 from e where suyo)
      and exists (select 1 from p where suyo)
      and exists (select 1 from i where suyo);
$$;

select tests.authenticate_as(current_setting('fx.c1')::uuid);
update events set location = coalesce(location, '') || ' ·c1';
update practice_plans set notes = ' ·c1';
update practice_items set notes = ' ·c1';
reset role;

select results_eq(
  $$select * from pg_temp.alcance(' ·c1', array[current_setting('fx.t1')::uuid])$$,
  $$values (0, 0, 0, true)$$,
  'sin where, c1 cambia todo lo abierto de T1 (también su partido) y nada más: ni T2, ni B, ni lo cerrado, ni su plantilla'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);
update events set location = coalesce(location, '') || ' ·coachB';
update practice_plans set notes = ' ·coachB';
update practice_items set notes = ' ·coachB';
reset role;

select results_eq(
  $$select * from pg_temp.alcance(' ·coachB', array[current_setting('fx.tb')::uuid])$$,
  $$values (0, 0, 0, true)$$,
  'sin where, coachB cambia todo lo de TB y nada de A'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
update events set location = coalesce(location, '') || ' ·adminA';
update practice_plans set notes = ' ·adminA';
update practice_items set notes = ' ·adminA';
reset role;

select results_eq(
  $$select * from pg_temp.alcance(
      ' ·adminA', array[current_setting('fx.t1')::uuid, current_setting('fx.t2')::uuid]
    )$$,
  $$values (0, 0, 0, true)$$,
  'sin where, adminA cambia todo lo abierto de T1 y T2 (también el partido) y nada más: ni B, ni lo cerrado, ni las plantillas'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);
update events set location = coalesce(location, '') || ' ·c2';
update practice_plans set notes = ' ·c2';
update practice_items set notes = ' ·c2';
reset role;

select results_eq(
  $$select * from pg_temp.alcance(' ·c2', array[current_setting('fx.t2')::uuid])$$,
  $$values (0, 0, 0, true)$$,
  'sin where, c2 cambia todo lo de T2 y nada de T1 ni de B'
);

-- Y el borrado, igual: c2 borra todos los ítems que puede, que son los de los planes de T2.
-- Antes se apunta cuántos ítems hay en los planes de T2 y cuántos en los demás.
do $$
declare
  t2 constant uuid := current_setting('fx.t2')::uuid;
begin
  perform
    set_config('fx.items_de_t2', count(*) filter (where pp.team_id = t2)::text, true),
    set_config('fx.items_ajenos', count(*) filter (where pp.team_id is distinct from t2)::text, true)
  from practice_items as pi
  join practice_plans as pp on pp.id = pi.plan_id;
end
$$;

select tests.authenticate_as(current_setting('fx.c2')::uuid);
delete from practice_items;
reset role;

select results_eq(
  $$select
      current_setting('fx.items_de_t2')::int > 0,
      count(*) filter (where pp.team_id = current_setting('fx.t2')::uuid)::int,
      count(*) filter (where pp.team_id is distinct from current_setting('fx.t2')::uuid)::int
        = current_setting('fx.items_ajenos')::int
    from practice_items as pi
    join practice_plans as pp on pp.id = pi.plan_id$$,
  $$values (true, 0, true)$$,
  'sin where, c2 borra los ítems de T2 y ninguno más'
);

-- ── Con la lectura abierta: la política de escritura, sola ───────────────────────────
-- Hoy ve un entreno, un plan o un ítem de un equipo justo quien lo gestiona. Si una fase
-- posterior abre el calendario a más miembros (jugadores, familias), la escritura no debe
-- abrirse con él. Se simula con tres políticas temporales de lectura para cualquier miembro
-- del club.
--
-- Además se concede, también solo aquí, el privilegio de las columnas que nadie puede tocar.
-- El privilegio por columnas rechaza antes que RLS y los dos errores comparten código, así que
-- los 42501 de «ni club, ni equipo…» no dicen si la política aguantaría sola; y sin la lectura
-- abierta, a quien mueve una fila a un equipo que no ve lo pararía antes la política de
-- lectura, con el mismo mensaje. Con las dos cosas abiertas, lo único que queda entre un
-- usuario y la fila es la política de escritura (y, para `updated_by`, su trigger). Todo se
-- quita aquí mismo (y, en todo caso, se deshace con la transacción).
create policy events_select_member_simulada
  on events for select to authenticated
  using (private.is_member(organization_id));

create policy practice_plans_select_member_simulada
  on practice_plans for select to authenticated
  using (private.is_member(organization_id));

create policy practice_items_select_member_simulada
  on practice_items for select to authenticated
  using (private.is_member(organization_id));

grant insert (status), update (team_id, kind) on table public.events to authenticated;
grant update (team_id, updated_by) on table public.practice_plans to authenticated;
grant update (plan_id) on table public.practice_items to authenticated;

select tests.authenticate_as(current_setting('fx.c2')::uuid);

-- Control positivo: las políticas temporales funcionan, c2 ve ahora lo de T1.
select results_eq(
  $$select
      (select count(*) from events where id = current_setting('fx.e_t1')::uuid)::int,
      (select count(*) from practice_plans where id = current_setting('fx.plan_t1')::uuid)::int,
      (select count(*) from practice_items
       where plan_id = current_setting('fx.plan_t1')::uuid)::int$$,
  $$values (1, 1, 2)$$,
  'con la lectura abierta a los miembros, c2 ve el entreno, el plan y los ítems de T1'
);

select results_eq(
  $$with
      e as (update events set location = 'c2 estuvo aquí'
            where team_id = current_setting('fx.t1')::uuid returning 1),
      p as (update practice_plans set title = 'c2 estuvo aquí'
            where team_id = current_setting('fx.t1')::uuid returning 1),
      i as (update practice_items set minutes = 99
            where plan_id = current_setting('fx.plan_t1')::uuid returning 1),
      d as (delete from practice_items
            where plan_id = current_setting('fx.plan_t1')::uuid returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from i)::int, (select count(*) from d)::int$$,
  $$values (0, 0, 0, 0)$$,
  'con la lectura abierta a los miembros, c2 sigue sin cambiar ni borrar nada de T1'
);

-- Review Focus 1, con la lectura abierta: c2 ve ahora «T1 sin plan», programado, y la política
-- de alta de un plan de T2 la cumple. Lo que le impide ocupar ese entreno con un plan de T2 es
-- la clave foránea que ata el plan al equipo de su evento.
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid,
            current_setting('fx.e_t1_libre')::uuid, 'Plan de T2 en el entreno de T1')$$,
  '23503', null,
  'con la lectura abierta a los miembros, c2 sigue sin ocupar un entreno de T1 con un plan de T2'
);

-- Tampoco por un upsert. c2 sí puede insertar un plan de T2, y `event_id` es único: el alta
-- choca con el plan de T1 y el `do update` caería sobre él. PostgreSQL aplica la política de
-- `update` a la fila que ya existe, y aquí no la salta en silencio: falla.
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid,
            current_setting('fx.e_t1')::uuid, 'c2 estuvo aquí')
    on conflict (event_id) do update set title = excluded.title$$,
  '42501', 'new row violates row-level security policy (USING expression) for table "practice_plans"',
  'con la lectura abierta a los miembros, c2 no reescribe el plan de T1 con un upsert sobre su evento'
);

select tests.authenticate_as(current_setting('fx.jugador')::uuid);

select results_eq(
  $$with
      e as (update events set location = 'jugador estuvo aquí' returning 1),
      p as (update practice_plans set title = 'jugador estuvo aquí' returning 1),
      i as (update practice_items set minutes = 99 returning 1),
      d as (delete from practice_items returning 1)
    select (select count(*) from e)::int, (select count(*) from p)::int,
           (select count(*) from i)::int, (select count(*) from d)::int,
           (select count(*) from events)::int > 0$$,
  $$values (0, 0, 0, 0, true)$$,
  'con la lectura abierta a los miembros, una cuenta de jugador ve eventos y sigue sin cambiar ni borrar nada'
);

-- El `with check` de las políticas. c1 solo gestiona T1: la política le impide crear un
-- entreno ya cerrado, llevarse un entreno o un plan a T2, convertir un entreno en partido,
-- dejar un plan sin equipo y pasar un ítem a un plan cerrado. «T1 sin plan» no tiene plan, y
-- «Plan suelto de T1» no tiene evento: ninguna clave foránea se adelanta a la política. No
-- cubre a quien gestiona los dos equipos, como adminA: ese caso es justo el que cierra el
-- privilegio por columnas.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, status)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-16T16:00:00Z', '2026-10-16T17:15:00Z', 'done')$$,
  '42501', 'new row violates row-level security policy for table "events"',
  'la política impide que c1 cree un entreno ya cerrado'
);

select throws_ok(
  $$update events set team_id = current_setting('fx.t2')::uuid
    where id = current_setting('fx.e_t1_libre')::uuid$$,
  '42501', 'new row violates row-level security policy for table "events"',
  'la política impide que c1 pase su entreno a T2'
);

select throws_ok(
  $$update events set kind = 'game' where id = current_setting('fx.e_t1_libre')::uuid$$,
  '42501', 'new row violates row-level security policy for table "events"',
  'la política impide que c1 convierta su entreno en partido'
);

select throws_ok(
  $$update practice_plans set team_id = current_setting('fx.t2')::uuid
    where id = current_setting('fx.plan_suelto')::uuid$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'la política impide que c1 pase su plan a T2'
);

select throws_ok(
  $$update practice_plans set team_id = null
    where id = current_setting('fx.plan_suelto')::uuid$$,
  '42501', 'new row violates row-level security policy for table "practice_plans"',
  'la política impide que c1 deje su plan sin equipo'
);

-- c1 ve el plan cerrado y edita el de origen: lo que falla es el destino.
select throws_ok(
  $$update practice_items set plan_id = current_setting('fx.plan_done')::uuid
    where plan_id = current_setting('fx.plan_t1')::uuid$$,
  '42501', 'new row violates row-level security policy for table "practice_items"',
  'la política impide que c1 pase un ítem a un plan cerrado'
);

-- Y el trigger de `updated_by`, también solo: con el privilegio de la columna concedido la
-- sentencia ya no falla, pero quien queda anotado es quien la lanza. c1 dice que «Plan suelto
-- de T1» lo guardó c2 (el último había sido adminA, más arriba) y queda anotado él.
select results_eq(
  $$with u as (update practice_plans set updated_by = current_setting('fx.c2')::uuid
               where id = current_setting('fx.plan_suelto')::uuid returning updated_by)
    select updated_by from u$$,
  $$values (current_setting('fx.c1')::uuid)$$,
  'el trigger anota a c1 aunque su sentencia diga que guardó c2'
);

reset role;

revoke insert (status), update (team_id, kind) on table public.events from authenticated;
revoke update (team_id, updated_by) on table public.practice_plans from authenticated;
revoke update (plan_id) on table public.practice_items from authenticated;

drop policy events_select_member_simulada on events;
drop policy practice_plans_select_member_simulada on practice_plans;
drop policy practice_items_select_member_simulada on practice_items;

-- ── Solo cuentan las membresías activas ──────────────────────────────────────────────
-- c1 sigue en el cuerpo técnico de T1: lo que cambia es su membresía, que después vuelve a
-- quedar activa para el resto del test.
update memberships set status = 'revoked' where user_id = current_setting('fx.c1')::uuid;
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-20T16:00:00Z', '2026-10-20T17:15:00Z', 'c1 revocado')$$,
  '42501', 'new row violates row-level security policy for table "events"',
  'c1 con la membresía revocada no crea un entreno en T1'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t1')::uuid, 9,
            'c1-revocado', 10)$$,
  '42501', 'new row violates row-level security policy for table "practice_items"',
  'c1 con la membresía revocada no añade ítems al plan de T1'
);

reset role;
update memberships set status = 'active' where user_id = current_setting('fx.c1')::uuid;

-- ── anon: sin privilegios sobre ninguna de las tres tablas ───────────────────────────
-- El alta exige el mensaje del privilegio: sin él, un `grant insert` a `anon` daría el mismo
-- 42501, el de RLS (no hay política para `anon`), y la aserción no lo vería. El cambio y el
-- borrado no lo necesitan: con el privilegio y sin política no fallarían, no encontrarían
-- filas.
select tests.clear_authentication();

select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
            '2026-10-20T16:00:00Z', '2026-10-20T17:15:00Z')$$,
  '42501', 'permission denied for table events',
  'anon no crea eventos'
);
select throws_ok(
  $$update events set location = 'anon estuvo aquí'$$,
  '42501', null, 'anon no cambia eventos'
);
select throws_ok('delete from events', '42501', null, 'anon no borra eventos');

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'Plan de anon')$$,
  '42501', 'permission denied for table practice_plans',
  'anon no crea planes'
);
select throws_ok(
  $$update practice_plans set title = 'anon estuvo aquí'$$,
  '42501', null, 'anon no cambia planes'
);
select throws_ok('delete from practice_plans', '42501', null, 'anon no borra planes');

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t1')::uuid, 9,
            'anon-en-t1', 10)$$,
  '42501', 'permission denied for table practice_items',
  'anon no crea ítems'
);
select throws_ok(
  $$update practice_items set minutes = 99$$,
  '42501', null, 'anon no cambia ítems'
);
select throws_ok('delete from practice_items', '42501', null, 'anon no borra ítems');

select throws_ok(
  $$select private.can_edit_plan(current_setting('fx.plan_t1')::uuid)$$,
  '42501', null,
  'anon no puede usar can_edit_plan'
);

-- ── can_edit_plan: la regla, preguntada directamente ─────────────────────────────────
-- El plan tiene equipo, el usuario lo gestiona y su evento, si lo tiene, está programado.
-- Para un plan que no existe, uno ajeno y uno cerrado la respuesta es la misma: `false`.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$select
      private.can_edit_plan(current_setting('fx.plan_t1')::uuid),
      private.can_edit_plan(current_setting('fx.plan_suelto')::uuid),
      private.can_edit_plan(current_setting('fx.plan_done')::uuid),
      private.can_edit_plan(current_setting('fx.plan_cancelled')::uuid),
      private.can_edit_plan(current_setting('fx.tpl_c1')::uuid),
      private.can_edit_plan(current_setting('fx.plan_t2')::uuid),
      private.can_edit_plan(current_setting('fx.plan_tb')::uuid),
      private.can_edit_plan(gen_random_uuid())$$,
  $$values (true, true, false, false, false, false, false, false)$$,
  'c1 edita el plan programado y el plan sin evento de T1; no los cerrados, su plantilla privada, los de T2 o TB, ni uno que no existe'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$select
      private.can_edit_plan(current_setting('fx.plan_t1')::uuid),
      private.can_edit_plan(current_setting('fx.plan_t2')::uuid),
      private.can_edit_plan(current_setting('fx.plan_done')::uuid),
      private.can_edit_plan(current_setting('fx.tpl_c1')::uuid),
      private.can_edit_plan(current_setting('fx.plan_tb')::uuid)$$,
  $$values (true, true, false, false, false)$$,
  'adminA edita los planes programados de T1 y T2; no el cerrado, una plantilla privada ni el de TB'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select results_eq(
  $$select
      private.can_edit_plan(current_setting('fx.plan_tb')::uuid),
      private.can_edit_plan(current_setting('fx.plan_t1')::uuid)$$,
  $$values (true, false)$$,
  'coachB edita el plan de TB y no el de T1'
);

-- ── Borrar la cuenta de quien guardó un plan ─────────────────────────────────────────
-- La acción `on delete set null` de `created_by` y de `updated_by` es un `update` de
-- `practice_plans`, y pasa por el trigger de `updated_by`. Se borra a c1 con sus propios
-- claims todavía en la sesión, que es el peor caso: si el trigger actuara, volvería a anotar
-- a c1, que ya no existe, y el borrado fallaría con 23503. Con los claims de otro (así lo
-- hace practice_integrity.test.sql) anotaría a ese otro en vez de dejar null. Es lo último
-- que hace el test con c1: al borrarlo se va también su membresía.
select tests.authenticate_as(current_setting('fx.c1')::uuid);
reset role;

select results_eq(
  $$select created_by, updated_by from practice_plans where title = 'Plan de c1 y c1b'$$,
  $$values (current_setting('fx.c1')::uuid, current_setting('fx.c1')::uuid)$$,
  'control: c1 creó «Plan de c1 y c1b» y fue el último en guardarlo'
);

select lives_ok(
  $$delete from auth.users where id = current_setting('fx.c1')::uuid$$,
  'borrar la cuenta de quien guardó un plan no falla, tampoco desde su propia sesión'
);

select results_eq(
  $$select created_by, updated_by from practice_plans where title = 'Plan de c1 y c1b'$$,
  $$values (null::uuid, null::uuid)$$,
  'el plan se queda, sin autor y sin nadie anotado como el último en guardarlo'
);

-- ── La función de RLS y el trigger nuevos (catálogo) ─────────────────────────────────
-- `can_edit_plan`: `stable security definer` con `search_path` vacío, y fuera del alcance de
-- anon (PUBLIC incluido). Los privilegios y las políticas de las tres tablas los fijan
-- posture.test.sql y calendar.test.sql.

select results_eq(
  $$select count(*)::int from pg_proc as f
    where f.pronamespace = 'private'::regnamespace
      and f.proname = 'can_edit_plan'
      and f.prosecdef
      and f.provolatile = 's'
      and f.proconfig = array['search_path=""']$$,
  array[1],
  'can_edit_plan es stable security definer con search_path vacío'
);

select is_empty(
  $$select f.oid::regprocedure::text from pg_proc as f
    where f.pronamespace = 'private'::regnamespace
      and f.proname = 'can_edit_plan'
      and has_function_privilege('anon', f.oid, 'execute')$$,
  'anon no puede ejecutar can_edit_plan'
);

-- La función del trigger de `updated_by` solo la ejecuta el trigger.
select has_trigger(
  'public'::name, 'practice_plans'::name, 'practice_plans_set_updated_by'::name,
  'practice_plans tiene su trigger de updated_by'::text
);

select results_eq(
  $$select p.proconfig = array['search_path=""'],
           has_function_privilege('public', p.oid, 'execute'),
           has_function_privilege('anon', p.oid, 'execute'),
           has_function_privilege('authenticated', p.oid, 'execute')
    from pg_proc as p
    where p.pronamespace = 'private'::regnamespace and p.proname = 'set_updated_by'$$,
  $$values (true, false, false, false)$$,
  'set_updated_by tiene search_path vacío y no la ejecuta PUBLIC, anon ni authenticated'
);

select * from finish();

rollback;
