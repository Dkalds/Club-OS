-- Estado del directo en el servidor: `practice_plans.live_started_at` y `live_position`,
-- los dos parámetros nuevos de `record_live_progress` y `reset_live_progress`.
--
-- Qué se verifica aquí:
--   · Las columnas existen y la posición solo vale entre 0 y 29 y con la sesión empezada.
--   · c1 (entrenador de T1) inicia: se guardan el inicio y la posición. El inicio no se pisa
--     con una llamada posterior; la posición sí. Una llamada sin los parámetros no los toca.
--   · Posición fuera de rango, o sin sesión empezada → INVALID (22023).
--   · c2 (otro equipo), coachB (otro club) y jugador → NOT_FOUND opaco, sin cambiar nada;
--     anon → 42501.
--   · reset_live_progress: borra el estado del plan y lo registrado en sus ítems y devuelve
--     el `updated_at` del plan; con la sesión cancelada o hecha → SESSION_CLOSED.
--   · Cerrar la sesión conserva `live_started_at`.
--   · c2 no puede escribir las columnas del plan de T1 por la API directa (RLS).
--
-- Se ejecuta con `pnpm test:db`. Los helpers `tests.*` vienen de `supabase/seed.sql`. Todo
-- ocurre dentro de una transacción que se deshace al final. Los datos son ficticios.
begin;

select plan(28);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────
-- Misma estructura que live_progress.test.sql: dos equipos en el club A (T1 de c1, T2 de
-- c2) y uno en el club B. e_t1 y e_t2 programados; e_t1_cancelled, cancelado.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_c1    uuid := tests.create_user('c1@live-state.pgtap.test');
  u_c2    uuid := tests.create_user('c2@live-state.pgtap.test');
  u_jugad uuid := tests.create_user('jugador@live-state.pgtap.test');
  u_cb    uuid := tests.create_user('coach-b@live-state.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_c2 constant uuid := gen_random_uuid();
  p_p1 constant uuid := gen_random_uuid();
  p_cb constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  season_b constant uuid := gen_random_uuid();
  cat_a    constant uuid := gen_random_uuid();
  cat_b    constant uuid := gen_random_uuid();
  t1       constant uuid := gen_random_uuid();
  t2       constant uuid := gen_random_uuid();
  tb       constant uuid := gen_random_uuid();

  e_t1           constant uuid := gen_random_uuid();
  e_t2           constant uuid := gen_random_uuid();
  e_t1_cancelled constant uuid := gen_random_uuid();

  plan_t1           constant uuid := gen_random_uuid();
  plan_t2           constant uuid := gen_random_uuid();
  plan_t1_cancelled constant uuid := gen_random_uuid();

  item1    constant uuid := gen_random_uuid();
  item2    constant uuid := gen_random_uuid();
  item_t2a constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_c2, club_a, 'c2', 'Ficticia', null),
    (p_p1, club_a, 'p1', 'Ficticio', 2015),
    (p_cb, club_b, 'cb', 'Ficticio', null);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_c1,    'coach',  p_c1),
    (club_a, u_c2,    'coach',  p_c2),
    (club_a, u_jugad, 'player', p_p1),
    (club_b, u_cb,    'coach',  p_cb);

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true),
    (season_b, club_b, '2026/27', '2026-09-01', '2027-06-30', true);

  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_a, club_a, 'Alevín',   'U12', 10),
    (cat_b, club_b, 'Infantil', 'U14', 10);

  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, club_a, season_a, cat_a, 'Alevín A'),
    (t2, club_a, season_a, cat_a, 'Alevín B'),
    (tb, club_b, season_b, cat_b, 'Infantil A');

  insert into team_staff (organization_id, team_id, person_id, staff_role) values
    (club_a, t1, p_c1, 'head_coach'),
    (club_a, t2, p_c2, 'head_coach'),
    (club_b, tb, p_cb, 'head_coach');

  insert into team_players (organization_id, team_id, person_id, jersey_number, position) values
    (club_a, t1, p_p1, 4, 'Base');

  insert into events (id, organization_id, team_id, kind, starts_at, ends_at, status) values
    (e_t1,           club_a, t1, 'practice', '2026-10-06T16:00:00Z', '2026-10-06T17:15:00Z', 'scheduled'),
    (e_t2,           club_a, t2, 'practice', '2026-10-06T15:00:00Z', '2026-10-06T16:00:00Z', 'scheduled'),
    (e_t1_cancelled, club_a, t1, 'practice', '2026-10-01T16:00:00Z', '2026-10-01T17:15:00Z', 'cancelled');

  insert into practice_plans (id, organization_id, team_id, event_id, title, status, created_by) values
    (plan_t1,           club_a, t1, e_t1,           'Plan T1',        'ready', u_c1),
    (plan_t2,           club_a, t2, e_t2,           'Plan T2',        'ready', u_c2),
    (plan_t1_cancelled, club_a, t1, e_t1_cancelled, 'Plan cancelado', 'ready', u_c1);

  insert into practice_items (id, organization_id, plan_id, sort, phase, title_override, minutes) values
    (item1,    club_a, plan_t1, 1, 'Activación', 'ls-t1-1', 10),
    (item2,    club_a, plan_t1, 2, 'Técnica',    'ls-t1-2', 20),
    (item_t2a, club_a, plan_t2, 1, 'Activación', 'ls-t2-a', 10);

  perform set_config('fx.c1',    u_c1::text,    true);
  perform set_config('fx.c2',    u_c2::text,    true);
  perform set_config('fx.jugad', u_jugad::text, true);
  perform set_config('fx.cb',    u_cb::text,    true);
  perform set_config('fx.e_t1',           e_t1::text,           true);
  perform set_config('fx.e_t2',           e_t2::text,           true);
  perform set_config('fx.e_t1_cancelled', e_t1_cancelled::text, true);
  perform set_config('fx.plan_t1',  plan_t1::text,  true);
  perform set_config('fx.plan_t2',  plan_t2::text,  true);
  perform set_config('fx.item1',    item1::text,    true);
  perform set_config('fx.item2',    item2::text,    true);
  perform set_config('fx.item_t2a', item_t2a::text, true);
end
$$;

-- ── Esquema ───────────────────────────────────────────────────────────────────────────

-- 1-2. Las columnas existen.
select col_type_is('public', 'practice_plans', 'live_started_at', 'timestamp with time zone',
  'practice_plans.live_started_at es timestamptz');
select col_type_is('public', 'practice_plans', 'live_position', 'smallint',
  'practice_plans.live_position es smallint');

-- 3. Una posición sin sesión empezada no cabe.
select throws_ok(
  $$update practice_plans set live_position = 1
    where id = current_setting('fx.plan_t2')::uuid$$,
  '23514', null,
  'live_position sin live_started_at viola el check'
);

-- 4. Una posición por encima de 29 no cabe.
select throws_ok(
  $$update practice_plans set live_started_at = now(), live_position = 30
    where id = current_setting('fx.plan_t2')::uuid$$,
  '23514', null,
  'live_position = 30 viola el check'
);

-- ── c1 inicia y avanza ────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

-- 5. Posición sin sesión empezada → INVALID.
select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid, '[]'::jsonb, false,
      p_position => 0)$$,
  '%INVALID%',
  'una posición sin inicio (ni guardado ni en la llamada) devuelve INVALID'
);

-- 6. Inicia: se guardan el inicio y la posición.
select lives_ok(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid, '[]'::jsonb, false,
      p_started_at => '2026-10-06T16:02:00Z', p_position => 0)$$,
  'c1 inicia la sesión de T1'
);

-- 7.
select results_eq(
  $$select live_started_at, live_position
    from practice_plans where id = current_setting('fx.plan_t1')::uuid$$,
  $$values ('2026-10-06T16:02:00Z'::timestamptz, 0::smallint)$$,
  'el plan guarda el inicio y la posición 0'
);

-- 8. Una llamada posterior no pisa el inicio; la posición sí cambia.
select lives_ok(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item1'), 'completed', true, 'actual_minutes', 9)
      ),
      false,
      p_started_at => '2026-10-06T16:30:00Z', p_position => 1)$$,
  'c1 pasa al segundo ejercicio'
);

-- 9.
select results_eq(
  $$select live_started_at, live_position
    from practice_plans where id = current_setting('fx.plan_t1')::uuid$$,
  $$values ('2026-10-06T16:02:00Z'::timestamptz, 1::smallint)$$,
  'el inicio no se pisa y la posición pasa a 1'
);

-- 10. Sin los parámetros nuevos, el estado no se toca.
select lives_ok(
  $$select record_live_progress(current_setting('fx.e_t1')::uuid, '[]'::jsonb, false)$$,
  'una llamada sin inicio ni posición sigue funcionando'
);

-- 11.
select results_eq(
  $$select live_started_at, live_position
    from practice_plans where id = current_setting('fx.plan_t1')::uuid$$,
  $$values ('2026-10-06T16:02:00Z'::timestamptz, 1::smallint)$$,
  'sin los parámetros nuevos, el inicio y la posición se conservan'
);

-- 12-13. Posición fuera de rango → INVALID.
select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid, '[]'::jsonb, false, p_position => 30)$$,
  '%INVALID%',
  'posición 30 devuelve INVALID'
);

select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid, '[]'::jsonb, false, p_position => -1)$$,
  '%INVALID%',
  'posición negativa devuelve INVALID'
);

-- ── Control de acceso ─────────────────────────────────────────────────────────────────

-- 14. c2 no gestiona T1: no reinicia su sesión.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select throws_like(
  $$select reset_live_progress(current_setting('fx.e_t1')::uuid)$$,
  '%NOT_FOUND%',
  'c2 (equipo distinto) recibe NOT_FOUND al reiniciar e_t1'
);

-- 15. c2 tampoco escribe las columnas por la API directa: RLS no le deja ver la fila.
select is_empty(
  $$update practice_plans set live_started_at = null, live_position = null
    where id = current_setting('fx.plan_t1')::uuid
    returning id$$,
  'c2 no cambia el estado del plan de T1 con un update directo'
);

-- 16-17. coachB no es del club A.
select tests.authenticate_as(current_setting('fx.cb')::uuid);

select throws_like(
  $$select reset_live_progress(current_setting('fx.e_t1')::uuid)$$,
  '%NOT_FOUND%',
  'coachB (otro club) recibe NOT_FOUND al reiniciar e_t1'
);

select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid, '[]'::jsonb, false,
      p_started_at => '2026-10-06T16:40:00Z', p_position => 0)$$,
  '%NOT_FOUND%',
  'coachB (otro club) recibe NOT_FOUND al iniciar e_t1'
);

-- 18. El jugador no gestiona ningún equipo.
select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select throws_like(
  $$select reset_live_progress(current_setting('fx.e_t1')::uuid)$$,
  '%NOT_FOUND%',
  'jugador recibe NOT_FOUND al reiniciar e_t1'
);

-- 19. anon no ejecuta la función.
select tests.clear_authentication();

select throws_ok(
  $$select reset_live_progress(current_setting('fx.e_t1')::uuid)$$,
  '42501', 'permission denied for function reset_live_progress',
  'anon no puede llamar a reset_live_progress (42501)'
);

-- 20. Nada de lo anterior cambió el plan de T1.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$select live_started_at, live_position
    from practice_plans where id = current_setting('fx.plan_t1')::uuid$$,
  $$values ('2026-10-06T16:02:00Z'::timestamptz, 1::smallint)$$,
  'tras los intentos sin permiso, el plan de T1 sigue igual'
);

-- ── Empezar de nuevo ──────────────────────────────────────────────────────────────────

-- 21. c1 reinicia. Lo que devuelve se guarda para compararlo después: `results_eq` abre sus
-- dos consultas antes de recorrerlas, y la segunda leería el plan de antes de reiniciar.
select lives_ok(
  $$select set_config(
      'fx.reset_at',
      reset_live_progress(current_setting('fx.e_t1')::uuid)::text,
      true)$$,
  'c1 reinicia la sesión de T1'
);

select results_eq(
  $$select updated_at::text from practice_plans where id = current_setting('fx.plan_t1')::uuid$$,
  $$select current_setting('fx.reset_at')$$,
  'reset_live_progress devuelve el updated_at con el que queda el plan'
);

-- 22.
select results_eq(
  $$select live_started_at, live_position
    from practice_plans where id = current_setting('fx.plan_t1')::uuid$$,
  $$values (null::timestamptz, null::smallint)$$,
  'tras reiniciar, el plan no tiene inicio ni posición'
);

-- 23.
select results_eq(
  $$select count(*)::int from practice_items
    where plan_id = current_setting('fx.plan_t1')::uuid
      and (completed is not null or actual_minutes is not null)$$,
  $$values (0)$$,
  'tras reiniciar, ningún ítem conserva completed ni actual_minutes'
);

-- 24. Una sesión cancelada no se reinicia.
select throws_like(
  $$select reset_live_progress(current_setting('fx.e_t1_cancelled')::uuid)$$,
  '%SESSION_CLOSED%',
  'reiniciar una sesión cancelada devuelve SESSION_CLOSED'
);

-- ── Cerrar conserva el inicio ─────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c2')::uuid);

-- 25.
select lives_ok(
  $$select record_live_progress(
      current_setting('fx.e_t2')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item_t2a'), 'completed', true, 'actual_minutes', 8)
      ),
      true,
      p_started_at => '2026-10-06T15:01:00Z', p_position => 0)$$,
  'c2 inicia y termina la sesión de T2 en una llamada'
);

-- 26.
select results_eq(
  $$select live_started_at, status
    from practice_plans where id = current_setting('fx.plan_t2')::uuid$$,
  $$values ('2026-10-06T15:01:00Z'::timestamptz, 'done')$$,
  'el plan cerrado conserva cuándo se inició'
);

-- 27. Una sesión hecha no se reinicia.
select throws_like(
  $$select reset_live_progress(current_setting('fx.e_t2')::uuid)$$,
  '%SESSION_CLOSED%',
  'reiniciar una sesión hecha devuelve SESSION_CLOSED'
);

select * from finish();
rollback;
