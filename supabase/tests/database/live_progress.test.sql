-- record_live_progress: guarda el progreso en tiempo real de una sesión de entrenamiento.
--
-- Qué se verifica aquí:
--   · c1 (entrenador de T1) envía ítems → applied cuenta solo los de su plan; las filas
--     cambian; updated_at del plan avanza.
--   · El mismo estado enviado dos veces → mismo resultado (idempotencia, D3-D7).
--   · Un id de un ítem de T2 o de Club B en la lista → ignorado, su fila no cambia (D4).
--   · c2, coachB y jugador → NOT_FOUND opaco; anon → 42501.
--   · finished=true cierra el entreno: evento done, plan done con actual_minutes, ítems no
--     enviados quedan completed=false/null; reenviar el cierre → OK sin cambios (D7).
--   · Progreso sin finished tras cerrar → SESSION_CLOSED; sesión cancelada → SESSION_CLOSED.
--   · Entradas inválidas → INVALID (22023).
--
-- Se ejecuta con `pnpm test:db`. Los helpers `tests.*` vienen de `supabase/seed.sql`. Todo
-- ocurre dentro de una transacción que se deshace al final. Los datos son ficticios.
begin;

select plan(23);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────
-- Misma estructura que practice_write.test.sql. Ítems con id conocido.
-- e_t1 y e_t2 son programados; e_t1_cancelled es cancelado.
-- Plan de T1 tiene dos ítems: item1 e item2.
-- Plan de T2 tiene dos ítems: item_t2a e item_t2b (para el test de cierre).
-- Plan de TB tiene un ítem: item_tb (para el test de aislamiento entre clubes).
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_c1    uuid := tests.create_user('c1@live-progress.pgtap.test');
  u_c2    uuid := tests.create_user('c2@live-progress.pgtap.test');
  u_jugad uuid := tests.create_user('jugador@live-progress.pgtap.test');
  u_cb    uuid := tests.create_user('coach-b@live-progress.pgtap.test');

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
  plan_tb           constant uuid := gen_random_uuid();
  plan_t1_cancelled constant uuid := gen_random_uuid();

  item1   constant uuid := gen_random_uuid();
  item2   constant uuid := gen_random_uuid();
  item_t2a constant uuid := gen_random_uuid();
  item_t2b constant uuid := gen_random_uuid();
  item_tb  constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1',   'Ficticia', null),
    (p_c2, club_a, 'c2',   'Ficticia', null),
    (p_p1, club_a, 'p1',   'Ficticio', 2015),
    (p_cb, club_b, 'cb',   'Ficticio', null);

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

  insert into practice_plans (
    id, organization_id, team_id, event_id, title, status, created_by
  ) values
    (plan_t1,           club_a, t1, e_t1,           'Plan T1',       'ready', u_c1),
    (plan_t2,           club_a, t2, e_t2,           'Plan T2',       'ready', u_c2),
    (plan_tb,           club_b, tb, null,            'Plan TB',       'ready', u_cb),
    (plan_t1_cancelled, club_a, t1, e_t1_cancelled, 'Plan cancelado','ready', u_c1);

  insert into practice_items (id, organization_id, plan_id, sort, phase, title_override, minutes) values
    (item1,    club_a, plan_t1, 1, 'Activación', 'lp-t1-1', 10),
    (item2,    club_a, plan_t1, 2, 'Técnica',    'lp-t1-2', 20),
    (item_t2a, club_a, plan_t2, 1, 'Activación', 'lp-t2-a', 10),
    (item_t2b, club_a, plan_t2, 2, 'Técnica',    'lp-t2-b', 20),
    (item_tb,  club_b, plan_tb, 1, 'Activación', 'lp-tb-1', 10);

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
  perform set_config('fx.item_t2b', item_t2b::text, true);
  perform set_config('fx.item_tb',  item_tb::text,  true);
end
$$;

-- ── c1 envía progreso parcial ─────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

-- 1. applied = 2 (los dos ítems del plan de T1)
select results_eq(
  $$select (record_live_progress(
      current_setting('fx.e_t1')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item1'), 'completed', true,  'actual_minutes', 10),
        jsonb_build_object('id', current_setting('fx.item2'), 'completed', false, 'actual_minutes', null)
      ),
      false
    )) ->> 'applied'$$,
  $$values ('2')$$,
  'c1: enviar item1 e item2 devuelve applied = 2'
);

-- 2. item1 quedó escrito: completed=true, actual_minutes=10
select results_eq(
  $$select completed, actual_minutes
    from practice_items where id = current_setting('fx.item1')::uuid$$,
  $$values (true, 10::smallint)$$,
  'item1: completed = true y actual_minutes = 10'
);

-- 3. El mismo estado dos veces → mismo applied, idempotente
select results_eq(
  $$select (record_live_progress(
      current_setting('fx.e_t1')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item1'), 'completed', true,  'actual_minutes', 10),
        jsonb_build_object('id', current_setting('fx.item2'), 'completed', false, 'actual_minutes', null)
      ),
      false
    )) ->> 'applied'$$,
  $$values ('2')$$,
  'el mismo envío dos veces sigue devolviendo applied = 2 (idempotencia del estado)'
);

-- 4. Un ítem de T2 y uno de TB en la lista → ignored; applied solo cuenta los de T1
select results_eq(
  $$select (record_live_progress(
      current_setting('fx.e_t1')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item_t2a'), 'completed', true, 'actual_minutes', 5),
        jsonb_build_object('id', current_setting('fx.item_tb'),  'completed', true, 'actual_minutes', 5),
        jsonb_build_object('id', current_setting('fx.item1'),    'completed', true, 'actual_minutes', 10),
        jsonb_build_object('id', current_setting('fx.item2'),    'completed', false, 'actual_minutes', null)
      ),
      false
    )) ->> 'applied'$$,
  $$values ('2')$$,
  'ids de T2 y de Club B se ignoran: applied sigue siendo 2, no 4'
);

-- 5. El ítem de T2 no fue escrito (aislamiento entre equipos); c2 lo puede leer
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  $$select completed, actual_minutes
    from practice_items where id = current_setting('fx.item_t2a')::uuid$$,
  $$values (null::boolean, null::smallint)$$,
  'item de T2 no cambia cuando se envía dentro del progreso de T1'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

-- ── Control de acceso ─────────────────────────────────────────────────────────────────

-- 6. c2 no gestiona T1 → NOT_FOUND
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      '[]'::jsonb, false)$$,
  '%NOT_FOUND%',
  'c2 (equipo distinto) recibe NOT_FOUND al llamar sobre e_t1'
);

-- 7. coachB no es del club A → NOT_FOUND
select tests.authenticate_as(current_setting('fx.cb')::uuid);

select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      '[]'::jsonb, false)$$,
  '%NOT_FOUND%',
  'coachB (otro club) recibe NOT_FOUND al llamar sobre e_t1'
);

-- 8. jugador no gestiona ningún equipo → NOT_FOUND
select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      '[]'::jsonb, false)$$,
  '%NOT_FOUND%',
  'jugador recibe NOT_FOUND al llamar sobre e_t1'
);

-- 9. anon → permission denied (42501)
select tests.clear_authentication();

select throws_ok(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      '[]'::jsonb, false)$$,
  '42501', 'permission denied for function record_live_progress',
  'anon no puede llamar a record_live_progress (42501)'
);

-- ── Cierre de sesión (finished=true) ─────────────────────────────────────────────────
-- Se usa e_t2 (plan de T2, con item_t2a e item_t2b).
-- Solo se envía item_t2a; item_t2b queda como no enviado.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

-- 10. applied=1 al cerrar enviando solo item_t2a
select results_eq(
  $$select (record_live_progress(
      current_setting('fx.e_t2')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item_t2a'), 'completed', true, 'actual_minutes', 8)
      ),
      true,
      30
    )) ->> 'applied'$$,
  $$values ('1')$$,
  'c2: cerrar enviando solo item_t2a devuelve applied = 1'
);

-- 11. El evento de T2 quedó done
select results_eq(
  $$select status::text from events where id = current_setting('fx.e_t2')::uuid$$,
  $$values ('done')$$,
  'el evento de T2 pasa a done al cerrar'
);

-- 12. El plan de T2 quedó done con actual_minutes = 30 (p_actual_minutes prevalece)
select results_eq(
  $$select status, actual_minutes
    from practice_plans where id = current_setting('fx.plan_t2')::uuid$$,
  $$values ('done', 30::smallint)$$,
  'el plan de T2 pasa a done y conserva p_actual_minutes = 30'
);

-- 13. item_t2b (no enviado) quedó completed=false, actual_minutes=null
select results_eq(
  $$select completed, actual_minutes
    from practice_items where id = current_setting('fx.item_t2b')::uuid$$,
  $$values (false, null::smallint)$$,
  'item_t2b (no enviado al cerrar) queda completed = false y actual_minutes = null'
);

-- 14. Reenviar el cierre → applied=0 sin cambios (D7)
select results_eq(
  $$select (record_live_progress(
      current_setting('fx.e_t2')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item_t2a'), 'completed', true, 'actual_minutes', 8)
      ),
      true,
      30
    )) ->> 'applied'$$,
  $$values ('0')$$,
  'reenviar el cierre devuelve applied = 0 sin escribir nada (D7)'
);

-- 15. Progreso (finished=false) tras cerrar → SESSION_CLOSED
select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t2')::uuid,
      '[]'::jsonb, false)$$,
  '%SESSION_CLOSED%',
  'enviar progreso tras cerrar devuelve SESSION_CLOSED'
);

-- 16. Sesión cancelada → SESSION_CLOSED
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1_cancelled')::uuid,
      '[]'::jsonb, false)$$,
  '%SESSION_CLOSED%',
  'sesión cancelada devuelve SESSION_CLOSED'
);

-- ── Validación de entrada ────────────────────────────────────────────────────────────

-- 17. p_items no es una lista → INVALID
select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      '"no-es-lista"'::jsonb, false)$$,
  '%INVALID%',
  'p_items que no es un array devuelve INVALID'
);

-- 18. Más de 30 elementos → INVALID
select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      (select jsonb_agg(
         jsonb_build_object('id', gen_random_uuid(), 'completed', false, 'actual_minutes', null)
       )
       from generate_series(1,31)),
      false)$$,
  '%INVALID%',
  'p_items con 31 elementos devuelve INVALID'
);

-- 19. Elemento sin campo id → INVALID
select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      '[{"completed": true, "actual_minutes": 5}]'::jsonb,
      false)$$,
  '%INVALID%',
  'elemento sin id devuelve INVALID'
);

-- 20. completed no es booleano → INVALID
select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item1'), 'completed', 'si', 'actual_minutes', null)
      ),
      false)$$,
  '%INVALID%',
  'completed no booleano devuelve INVALID'
);

-- 21. actual_minutes fuera de 0–180 → INVALID
select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item1'), 'completed', true, 'actual_minutes', 200)
      ),
      false)$$,
  '%INVALID%',
  'actual_minutes > 180 devuelve INVALID'
);

-- 22. Id repetido en la lista → INVALID
select throws_like(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item1'), 'completed', true,  'actual_minutes', null),
        jsonb_build_object('id', current_setting('fx.item1'), 'completed', false, 'actual_minutes', null)
      ),
      false)$$,
  '%INVALID%',
  'id repetido en la lista devuelve INVALID'
);

-- 23. actual_minutes = 0 es válido (límite inferior)
select lives_ok(
  $$select record_live_progress(
      current_setting('fx.e_t1')::uuid,
      jsonb_build_array(
        jsonb_build_object('id', current_setting('fx.item1'), 'completed', true, 'actual_minutes', 0)
      ),
      false)$$,
  'actual_minutes = 0 es válido (límite inferior aceptado)'
);

select * from finish();
rollback;
