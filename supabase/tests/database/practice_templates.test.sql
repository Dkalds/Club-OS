-- Plantillas de sesión: `save_practice_as_template`, `create_practice_from_template` y las
-- políticas que dejan dar de alta y borrar una plantilla propia.
--
-- Qué se verifica aquí:
--   · Una plantilla no puede tener evento (check), y un plan de equipo no se da de alta
--     como plantilla por la API.
--   · c1 (entrenador de T1) guarda su sesión como plantilla: es suya, sin equipo, con el
--     título y los ejercicios copiados en su orden. Las notas no viajan.
--   · c2 (otro equipo del mismo club), coachB (otro club) y el jugador no guardan como
--     plantilla la sesión de T1 (NOT_FOUND opaco); anon → 42501.
--   · Una sesión sin ejercicios no se guarda como plantilla (INVALID).
--   · La plantilla es personal: c2 y coachB no la ven, ni sus ítems; no la usan
--     (NOT_FOUND) y no la borran (0 filas). La dirección del club sí la lee, pero tampoco
--     la usa, ni le añade ejercicios, ni la borra. Quien entrena en dos clubes no usa su
--     plantilla de uno en un equipo del otro.
--   · c1 la usa en su equipo: nace un entreno programado con los ejercicios; no la usa en
--     un equipo que no gestiona.
--   · Por la API directa: nadie da de alta un plan sin equipo que no sea una plantilla, ni
--     una plantilla quien no entrena, ni ítems en la plantilla de otro; y un plan de equipo
--     sigue sin poder borrarse.
--   · c1 borra su plantilla y sus ítems se van con ella; la sesión creada con ella sigue.
--   · Tope de 50 plantillas por persona y club (TEMPLATE_LIMIT).
--
-- Se ejecuta con `pnpm test:db`. Los helpers `tests.*` vienen de `supabase/seed.sql`. Todo
-- ocurre dentro de una transacción que se deshace al final. Los datos son ficticios.
begin;

select plan(36);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_c1    uuid := tests.create_user('c1@templates.pgtap.test');
  u_c2    uuid := tests.create_user('c2@templates.pgtap.test');
  u_admin uuid := tests.create_user('admin@templates.pgtap.test');
  u_jugad uuid := tests.create_user('jugador@templates.pgtap.test');
  u_cb    uuid := tests.create_user('coach-b@templates.pgtap.test');
  u_multi uuid := tests.create_user('multi@templates.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_c2 constant uuid := gen_random_uuid();
  p_p1 constant uuid := gen_random_uuid();
  p_cb constant uuid := gen_random_uuid();
  p_ma constant uuid := gen_random_uuid();
  p_mb constant uuid := gen_random_uuid();
  tpl_multi constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  season_b constant uuid := gen_random_uuid();
  cat_a    constant uuid := gen_random_uuid();
  cat_b    constant uuid := gen_random_uuid();
  t1       constant uuid := gen_random_uuid();
  t2       constant uuid := gen_random_uuid();
  tb       constant uuid := gen_random_uuid();

  e_t1    constant uuid := gen_random_uuid();
  e_empty constant uuid := gen_random_uuid();
  e_tb    constant uuid := gen_random_uuid();

  plan_t1    constant uuid := gen_random_uuid();
  plan_empty constant uuid := gen_random_uuid();
  plan_tb    constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_c2, club_a, 'c2', 'Ficticia', null),
    (p_p1, club_a, 'p1', 'Ficticio', 2015),
    (p_cb, club_b, 'cb', 'Ficticio', null),
    (p_ma, club_a, 'multi', 'Ficticia', null),
    (p_mb, club_b, 'multi', 'Ficticia', null);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_c1,    'coach',  p_c1),
    (club_a, u_c2,    'coach',  p_c2),
    (club_a, u_admin, 'admin',  null),
    (club_a, u_jugad, 'player', p_p1),
    (club_b, u_cb,    'coach',  p_cb),
    (club_a, u_multi, 'coach',  p_ma),
    (club_b, u_multi, 'coach',  p_mb);

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
    (club_b, tb, p_cb, 'head_coach'),
    (club_b, tb, p_mb, 'assistant');

  insert into team_players (organization_id, team_id, person_id, jersey_number, position) values
    (club_a, t1, p_p1, 4, 'Base');

  insert into events (id, organization_id, team_id, kind, starts_at, ends_at, status) values
    (e_t1,    club_a, t1, 'practice', '2026-10-06T16:00:00Z', '2026-10-06T17:15:00Z', 'done'),
    (e_empty, club_a, t1, 'practice', '2026-10-08T16:00:00Z', '2026-10-08T17:15:00Z', 'scheduled'),
    (e_tb,    club_b, tb, 'practice', '2026-10-06T16:00:00Z', '2026-10-06T17:15:00Z', 'scheduled');

  insert into practice_plans (id, organization_id, team_id, event_id, title, notes, status, created_by) values
    (plan_t1,    club_a, t1, e_t1,    'Salida de presión', 'Llevar petos', 'done',  u_c1),
    (plan_empty, club_a, t1, e_empty, 'Por montar',        null,           'draft', u_c1),
    (plan_tb,    club_b, tb, e_tb,    'Plan del club B',   null,           'ready', u_cb);

  -- En desorden de `sort` a propósito: la copia los renumera 1, 2 en su orden. Con notas,
  -- que no deben viajar a la plantilla.
  insert into practice_items (organization_id, plan_id, sort, phase, title_override, minutes, notes) values
    (club_a, plan_t1, 20, 'Técnica',    'pt-segundo', 20, 'Nota de aquel día'),
    (club_a, plan_t1, 10, 'Activación', 'pt-primero', 10, null),
    (club_b, plan_tb, 1,  'Activación', 'pt-club-b',  10, null);

  -- La plantilla que «multi» guardó en el club A: entrena también en el B.
  insert into practice_plans (id, organization_id, title, is_template, created_by) values
    (tpl_multi, club_a, 'Plantilla de multi en A', true, u_multi);
  insert into practice_items (organization_id, plan_id, sort, title_override, minutes) values
    (club_a, tpl_multi, 1, 'pt-multi', 10);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.c1',    u_c1::text,    true);
  perform set_config('fx.c2',    u_c2::text,    true);
  perform set_config('fx.admin', u_admin::text, true);
  perform set_config('fx.jugad', u_jugad::text, true);
  perform set_config('fx.cb',    u_cb::text,    true);
  perform set_config('fx.multi', u_multi::text, true);
  perform set_config('fx.tpl_multi', tpl_multi::text, true);
  perform set_config('fx.t1', t1::text, true);
  perform set_config('fx.t2', t2::text, true);
  perform set_config('fx.tb', tb::text, true);
  perform set_config('fx.e_t1',    e_t1::text,    true);
  perform set_config('fx.e_empty', e_empty::text, true);
  perform set_config('fx.plan_t1', plan_t1::text, true);
end
$$;

-- ── Esquema ───────────────────────────────────────────────────────────────────────────

-- 1. Una plantilla no es la sesión de un entreno.
select throws_ok(
  $$update practice_plans set is_template = true
    where id = current_setting('fx.plan_t1')::uuid$$,
  '23514', null,
  'una plantilla con evento viola el check'
);

-- ── c1 guarda su sesión como plantilla ────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

-- 2. Devuelve el id de la plantilla (se guarda para lo que sigue).
select lives_ok(
  $$select set_config(
      'fx.tpl',
      save_practice_as_template(current_setting('fx.e_t1')::uuid)::text,
      true)$$,
  'c1 guarda como plantilla su sesión, aunque ya esté hecha'
);

-- 3. Es suya, sin equipo ni evento, con el título de la sesión y sin sus notas.
select results_eq(
  $$select is_template, team_id is null, event_id is null, created_by, title, notes is null
    from practice_plans where id = current_setting('fx.tpl')::uuid$$,
  $$values (true, true, true, current_setting('fx.c1')::uuid, 'Salida de presión', true)$$,
  'la plantilla es de c1, sin equipo ni evento, con el título copiado y sin las notas'
);

-- 4. Sus ejercicios, en su orden y renumerados, sin las notas de aquel día.
select results_eq(
  $$select sort, phase, title_override, minutes::int, notes is null
    from practice_items where plan_id = current_setting('fx.tpl')::uuid order by sort$$,
  $$values (1, 'Activación', 'pt-primero', 10, true), (2, 'Técnica', 'pt-segundo', 20, true)$$,
  'los ejercicios se copian en su orden, numerados desde 1 y sin notas'
);

-- 5. La sesión de la que sale no cambia.
select results_eq(
  $$select count(*)::int from practice_items where plan_id = current_setting('fx.plan_t1')::uuid$$,
  $$values (2)$$,
  'la sesión original conserva sus ejercicios'
);

-- 6. Una sesión sin ejercicios no se guarda como plantilla.
select throws_like(
  $$select save_practice_as_template(current_setting('fx.e_empty')::uuid)$$,
  '%INVALID%',
  'una sesión sin ejercicios devuelve INVALID'
);

-- ── Quién no puede guardar la sesión de T1 ────────────────────────────────────────────

-- 7. c2 no gestiona T1.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select throws_like(
  $$select save_practice_as_template(current_setting('fx.e_t1')::uuid)$$,
  '%NOT_FOUND%',
  'c2 (equipo distinto) recibe NOT_FOUND al guardar como plantilla la sesión de T1'
);

-- ── La plantilla es personal ──────────────────────────────────────────────────────────

-- 8-9. c2, del mismo club, no la ve ni ve sus ejercicios.
select is_empty(
  $$select id from practice_plans where id = current_setting('fx.tpl')::uuid$$,
  'c2 no ve la plantilla de c1'
);

select is_empty(
  $$select id from practice_items where plan_id = current_setting('fx.tpl')::uuid$$,
  'c2 no ve los ejercicios de la plantilla de c1'
);

-- 10. No la usa, ni en su propio equipo.
select throws_like(
  $$select create_practice_from_template(
      current_setting('fx.tpl')::uuid, current_setting('fx.t2')::uuid,
      '2026-10-20T16:00:00Z', '2026-10-20T17:15:00Z', 'Copia ajena')$$,
  '%NOT_FOUND%',
  'c2 recibe NOT_FOUND al usar la plantilla de c1 en su equipo'
);

-- 11. No la borra.
select is_empty(
  $$delete from practice_plans where id = current_setting('fx.tpl')::uuid returning id$$,
  'c2 no borra la plantilla de c1'
);

-- 12. No le añade ejercicios por la API directa.
select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes, title_override)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.tpl')::uuid, 9, 10, 'colado')$$,
  '42501', null,
  'c2 no inserta ítems en la plantilla de c1'
);

-- 13-14. coachB, de otro club, ni guarda la sesión de T1 ni usa la plantilla en su equipo.
select tests.authenticate_as(current_setting('fx.cb')::uuid);

select throws_like(
  $$select save_practice_as_template(current_setting('fx.e_t1')::uuid)$$,
  '%NOT_FOUND%',
  'coachB (otro club) recibe NOT_FOUND al guardar como plantilla la sesión de T1'
);

select throws_like(
  $$select create_practice_from_template(
      current_setting('fx.tpl')::uuid, current_setting('fx.tb')::uuid,
      '2026-10-20T16:00:00Z', '2026-10-20T17:15:00Z', 'Copia de otro club')$$,
  '%NOT_FOUND%',
  'coachB recibe NOT_FOUND al usar en su equipo una plantilla de otro club'
);

-- 15. El jugador no gestiona ningún equipo.
select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select throws_like(
  $$select save_practice_as_template(current_setting('fx.e_t1')::uuid)$$,
  '%NOT_FOUND%',
  'jugador recibe NOT_FOUND al guardar como plantilla'
);

-- 16. Ni da de alta una plantilla por la API directa: no entrena ni dirige.
select throws_ok(
  $$insert into practice_plans (organization_id, title, is_template)
    values (current_setting('fx.club_a')::uuid, 'Plantilla de jugador', true)$$,
  '42501', null,
  'un jugador no inserta una plantilla'
);

-- 17-18. anon no ejecuta las funciones.
select tests.clear_authentication();

select throws_ok(
  $$select save_practice_as_template(current_setting('fx.e_t1')::uuid)$$,
  '42501', 'permission denied for function save_practice_as_template',
  'anon no puede llamar a save_practice_as_template (42501)'
);

select throws_ok(
  $$select create_practice_from_template(
      current_setting('fx.tpl')::uuid, current_setting('fx.t1')::uuid,
      '2026-10-20T16:00:00Z', '2026-10-20T17:15:00Z', 'Anónima')$$,
  '42501', 'permission denied for function create_practice_from_template',
  'anon no puede llamar a create_practice_from_template (42501)'
);

-- 19. La dirección del club sí la lee (como cualquier plan de su club).
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select results_eq(
  $$select count(*)::int from practice_plans where id = current_setting('fx.tpl')::uuid$$,
  $$values (1)$$,
  'la dirección del club lee la plantilla de c1'
);

-- 20. Pero no la borra: no es suya.
select is_empty(
  $$delete from practice_plans where id = current_setting('fx.tpl')::uuid returning id$$,
  'la dirección no borra la plantilla de otro'
);

-- Verla no es poder usarla: aquí la lectura pasa, y lo que la para es que no es suya.
select throws_like(
  $$select create_practice_from_template(
      current_setting('fx.tpl')::uuid, current_setting('fx.t1')::uuid,
      '2026-10-21T16:00:00Z', '2026-10-21T17:15:00Z', 'De dirección')$$,
  '%NOT_FOUND%',
  'la dirección recibe NOT_FOUND al usar la plantilla de otro, aunque la vea y gestione el equipo'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes, title_override)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.tpl')::uuid, 9, 10, 'colado')$$,
  '42501', null,
  'la dirección no inserta ítems en la plantilla de otro, aunque la vea'
);

-- ── Quien entrena en dos clubes ───────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.multi')::uuid);

-- Gestiona el equipo del club B y la plantilla es suya: lo único que falla es el club.
select ok(
  private.can_manage_team(current_setting('fx.tb')::uuid)
    and exists (select 1 from practice_plans where id = current_setting('fx.tpl_multi')::uuid),
  'multi gestiona el equipo de B y ve su plantilla de A'
);

select throws_like(
  $$select create_practice_from_template(
      current_setting('fx.tpl_multi')::uuid, current_setting('fx.tb')::uuid,
      '2026-10-21T16:00:00Z', '2026-10-21T17:15:00Z', 'De A a B')$$,
  '%NOT_FOUND%',
  'una plantilla de un club no se usa en un equipo de otro, ni por quien entrena en los dos'
);

-- ── c1 usa su plantilla ───────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);

-- 21. No en un equipo que no gestiona.
select throws_like(
  $$select create_practice_from_template(
      current_setting('fx.tpl')::uuid, current_setting('fx.t2')::uuid,
      '2026-10-20T16:00:00Z', '2026-10-20T17:15:00Z', 'En equipo ajeno')$$,
  '%NOT_FOUND%',
  'c1 recibe NOT_FOUND al usar su plantilla en un equipo que no gestiona'
);

-- 22. En el suyo: devuelve el evento nuevo.
select lives_ok(
  $$select set_config(
      'fx.new_event',
      create_practice_from_template(
        current_setting('fx.tpl')::uuid, current_setting('fx.t1')::uuid,
        '2026-10-20T16:00:00Z', '2026-10-20T17:15:00Z', 'Salida de presión II',
        p_location => 'Pabellón 2')::text,
      true)$$,
  'c1 crea una sesión de su equipo con su plantilla'
);

-- 23. Un entreno programado de T1, con su franja y su lugar.
select results_eq(
  $$select kind::text, status::text, team_id, starts_at, location
    from events where id = current_setting('fx.new_event')::uuid$$,
  $$values ('practice', 'scheduled', current_setting('fx.t1')::uuid, '2026-10-20T16:00:00Z'::timestamptz, 'Pabellón 2')$$,
  'nace un entreno programado del equipo, con su franja y su lugar'
);

-- 24. Su plan: el título que llega, sin notas, de equipo y listo.
select results_eq(
  $$select title, notes is null, status, is_template, team_id
    from practice_plans where event_id = current_setting('fx.new_event')::uuid$$,
  $$values ('Salida de presión II', true, 'ready', false, current_setting('fx.t1')::uuid)$$,
  'el plan lleva el título nuevo, nace sin notas y no es una plantilla'
);

-- 25. Con los ejercicios de la plantilla.
select results_eq(
  $$select pi.sort, pi.phase, pi.title_override, pi.minutes::int
    from practice_items as pi
    join practice_plans as pp on pp.id = pi.plan_id
    where pp.event_id = current_setting('fx.new_event')::uuid
    order by pi.sort$$,
  $$values (1, 'Activación', 'pt-primero', 10), (2, 'Técnica', 'pt-segundo', 20)$$,
  'la sesión nace con los ejercicios de la plantilla'
);

-- ── Por la API directa ────────────────────────────────────────────────────────────────

-- 26. Un plan sin equipo que no es una plantilla no se da de alta.
select throws_ok(
  $$insert into practice_plans (organization_id, title)
    values (current_setting('fx.club_a')::uuid, 'Suelto')$$,
  '42501', null,
  'c1 no inserta un plan sin equipo que no sea una plantilla'
);

-- 27. Ni un plan de su equipo marcado como plantilla.
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title, is_template)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'De equipo', true)$$,
  '42501', null,
  'c1 no inserta un plan de equipo marcado como plantilla'
);

-- 28. Un plan de equipo sigue sin poder borrarse.
select is_empty(
  $$delete from practice_plans where id = current_setting('fx.plan_t1')::uuid returning id$$,
  'un plan de equipo no se borra, ni por quien gestiona el equipo'
);

-- ── Tope ──────────────────────────────────────────────────────────────────────────────

-- 29. Con 50 plantillas propias, la siguiente es TEMPLATE_LIMIT.
reset role;
insert into practice_plans (organization_id, title, is_template, created_by)
select current_setting('fx.club_a')::uuid, 'Relleno ' || n, true, current_setting('fx.c1')::uuid
from generate_series(1, 49) as n;
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_like(
  $$select save_practice_as_template(current_setting('fx.e_t1')::uuid)$$,
  '%TEMPLATE_LIMIT%',
  'con 50 plantillas propias devuelve TEMPLATE_LIMIT'
);

-- ── Borrar ────────────────────────────────────────────────────────────────────────────

-- 30. c1 borra su plantilla.
select results_eq(
  $$with gone as (
      delete from practice_plans where id = current_setting('fx.tpl')::uuid returning id
    ) select count(*)::int from gone$$,
  $$values (1)$$,
  'c1 borra su plantilla'
);

-- 31. Sus ejercicios se van con ella.
reset role;
select results_eq(
  $$select count(*)::int from practice_items where plan_id = current_setting('fx.tpl')::uuid$$,
  $$values (0)$$,
  'los ejercicios de la plantilla se borran con ella'
);

-- 32. La sesión creada con ella sigue, con los suyos.
select results_eq(
  $$select count(*)::int
    from practice_items as pi
    join practice_plans as pp on pp.id = pi.plan_id
    where pp.event_id = current_setting('fx.new_event')::uuid$$,
  $$values (2)$$,
  'la sesión creada con la plantilla conserva sus ejercicios'
);

select * from finish();
rollback;
