-- Integridad de los planes de sesión y una sola regla de cuerpo técnico.
--
-- Lo que el esquema garantiza antes de abrir la escritura a los entrenadores:
--   · `can_manage_team` es la única regla de «quién gestiona un equipo»: el admin del club
--     del equipo y su cuerpo técnico, y nadie más;
--   · un plan va atado al equipo y al tipo de su evento: no ocupa el entreno de otro equipo
--     ni cuelga de un partido;
--   · quien creó un plan de equipo deja de verlo cuando sale de su cuerpo técnico;
--   · borrar una cuenta no falla por los planes que creó, y los textos tienen tope.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*`
-- vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al
-- final. Los datos son ficticios y solo de este test.
begin;

select plan(49);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Como en calendar.test.sql, con lo justo:
-- Club A
--   T1 «Alevín A»:   staff c1; jugador p1. Eventos: un entreno (sin plan) y un partido.
--   T2 «Benjamín A»: staff c2. Evento: un entreno, con su plan.
--   adminA es admin y su membresía no enlaza con ninguna persona. `jugador` es la cuenta
--   de p1 (rol player).
-- Club B
--   TB «Infantil A»: staff cb. adminB es su admin.
--
-- Planes (título → equipo, evento, autor):
--   «Sesión de T2»            → T2, entreno de T2, c2
--   «Plantilla privada de c1» → sin equipo, sin evento, c1
-- El entreno de T1 no tiene plan: lo que el test rechaza sobre él lo rechaza la clave
-- foránea, no el único de `event_id`. «Sesión de T2» es el control positivo: un plan sobre
-- el entreno de su propio equipo entra. El test añade después «Sesión de T1» (sin autor) y
-- «Plan de c1» (de T1, sin evento, creado por c1).
--
-- Hacen de clave para leer las aserciones `practice_plans.title` y
-- `practice_items.title_override`. Están elegidas para que `order by` dé el mismo orden con
-- cualquier collation.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@practice-integrity.pgtap.test');
  u_c1 uuid := tests.create_user('c1@practice-integrity.pgtap.test');
  u_c2 uuid := tests.create_user('c2@practice-integrity.pgtap.test');
  u_jugador uuid := tests.create_user('jugador@practice-integrity.pgtap.test');
  u_admin_b uuid := tests.create_user('admin-b@practice-integrity.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@practice-integrity.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
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

  e_t1 constant uuid := gen_random_uuid();
  e_t1_game constant uuid := gen_random_uuid();
  e_t2 constant uuid := gen_random_uuid();

  plan_t2 constant uuid := gen_random_uuid();
  tpl_c1 constant uuid := gen_random_uuid();
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
    (club_a, u_admin_a, 'admin', null),
    (club_a, u_c1, 'coach', p_c1),
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
    (club_a, t2, p_c2, 'head_coach'),
    (club_b, tb, p_cb, 'head_coach');

  insert into team_players (organization_id, team_id, person_id, jersey_number, position) values
    (club_a, t1, p_p1, 4, 'Base');

  insert into focus_areas (id, organization_id, slug, name, sort) values
    (f_tecnica, club_a, 'tecnica', 'Técnica', 10),
    (f_rebote, club_a, 'rebote', 'Rebote', 20);

  insert into events (id, organization_id, team_id, kind, starts_at, ends_at, location, status) values
    (e_t2, club_a, t2, 'practice', '2026-10-06T15:00:00Z', '2026-10-06T16:00:00Z', 'T2 entreno', 'scheduled'),
    (e_t1, club_a, t1, 'practice', '2026-10-06T16:00:00Z', '2026-10-06T17:15:00Z', 'T1 entreno', 'scheduled'),
    (e_t1_game, club_a, t1, 'game', '2026-10-10T08:30:00Z', '2026-10-10T10:00:00Z', 'T1 partido', 'scheduled');

  insert into practice_plans (
    id, organization_id, team_id, event_id, title,
    primary_focus_id, secondary_focus_id, is_template, status, created_by
  ) values
    (plan_t2, club_a, t2, e_t2, 'Sesión de T2', f_tecnica, f_rebote, false, 'ready', u_c2),
    (tpl_c1, club_a, null, null, 'Plantilla privada de c1', null, null, true, 'draft', u_c1);

  insert into practice_items (organization_id, plan_id, sort, phase, title_override, minutes) values
    (club_a, plan_t2, 1, 'Activación', 'sesion-t2-1', 10),
    (club_a, tpl_c1, 1, null, 'privada-c1-1', 10);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.c2', u_c2::text, true);
  perform set_config('fx.jugador', u_jugador::text, true);
  perform set_config('fx.admin_b', u_admin_b::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.p_c1', p_c1::text, true);
  perform set_config('fx.t1', t1::text, true);
  perform set_config('fx.t2', t2::text, true);
  perform set_config('fx.tb', tb::text, true);
  perform set_config('fx.f_tecnica', f_tecnica::text, true);
  perform set_config('fx.f_rebote', f_rebote::text, true);
  perform set_config('fx.e_t1', e_t1::text, true);
  perform set_config('fx.e_t1_game', e_t1_game::text, true);
  perform set_config('fx.e_t2', e_t2::text, true);
  perform set_config('fx.plan_t2', plan_t2::text, true);
end
$$;

-- ── can_manage_team: admin del club del equipo o su cuerpo técnico ───────────────────
-- adminA no tiene persona enlazada: gestionar por ser admin no depende de `person_id`.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select is(
  private.can_manage_team(current_setting('fx.t1')::uuid), true,
  'adminA gestiona T1'
);

select is(
  private.can_manage_team(current_setting('fx.t2')::uuid), true,
  'adminA gestiona T2'
);

select is(
  private.can_manage_team(current_setting('fx.tb')::uuid), false,
  'adminA no gestiona un equipo de otro club'
);

select is(
  private.can_manage_team(gen_random_uuid()), false,
  'un equipo que no existe no lo gestiona nadie, tampoco un admin'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select is(
  private.can_manage_team(current_setting('fx.t1')::uuid), true,
  'c1 gestiona T1, su equipo'
);

select is(
  private.can_manage_team(current_setting('fx.t2')::uuid), false,
  'c1 no gestiona T2, otro equipo de su club'
);

-- Está en la plantilla de T1, no en su cuerpo técnico.
select tests.authenticate_as(current_setting('fx.jugador')::uuid);

select is(
  private.can_manage_team(current_setting('fx.t1')::uuid), false,
  'una cuenta de jugador no gestiona su equipo'
);

-- Controles positivos: coachB y adminB sí gestionan TB, así que su `false` sobre T1 no es
-- el de alguien sin permisos en ningún sitio.
select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select is(
  private.can_manage_team(current_setting('fx.tb')::uuid), true,
  'coachB gestiona TB'
);

select is(
  private.can_manage_team(current_setting('fx.t1')::uuid), false,
  'coachB no gestiona T1: ser staff en un club no da nada en otro'
);

select tests.authenticate_as(current_setting('fx.admin_b')::uuid);

select is(
  private.can_manage_team(current_setting('fx.tb')::uuid), true,
  'adminB gestiona TB'
);

select is(
  private.can_manage_team(current_setting('fx.t1')::uuid), false,
  'adminB no gestiona T1: ser admin de un club no da nada en otro'
);

-- Solo cuentan las membresías activas. c1 sigue en el cuerpo técnico de T1: lo que cambia
-- es su membresía, que después vuelve a quedar activa para el resto del test.
reset role;
update memberships set status = 'revoked' where user_id = current_setting('fx.c1')::uuid;
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select is(
  private.can_manage_team(current_setting('fx.t1')::uuid), false,
  'c1 con la membresía revocada no gestiona T1'
);

reset role;
update memberships set status = 'active' where user_id = current_setting('fx.c1')::uuid;

select tests.clear_authentication();

select throws_ok(
  $$select private.can_manage_team(current_setting('fx.t1')::uuid)$$,
  '42501', null,
  'anon no puede usar can_manage_team'
);

-- ── Un plan va atado al equipo y al tipo de su evento (como postgres) ────────────────
reset role;

-- Review Focus 1. `event_id` es único: sin esto, el cuerpo técnico de T2 podría ocupar el
-- entreno de T1 con un plan suyo, y T1 se quedaría sin poder planificarlo.
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid,
            current_setting('fx.e_t1')::uuid, 'Plan de T2 en el entreno de T1')$$,
  '23503', null,
  'un plan no ocupa el evento de otro equipo'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.e_t1_game')::uuid, 'Plan sobre un partido')$$,
  '23503', null,
  'un plan no cuelga de un partido'
);

-- Decir que el plan es de un partido tampoco vale: `event_kind` solo admite `practice`.
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, event_kind, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.e_t1_game')::uuid, 'game', 'Plan sobre un partido')$$,
  '23514', null,
  'el tipo de evento de un plan es siempre practice'
);

-- Con el equipo a null la clave foránea compuesta no se comprobaría (MATCH SIMPLE) y el
-- plan ocuparía el evento sin ser de nadie.
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title)
    values (current_setting('fx.club_a')::uuid, null,
            current_setting('fx.e_t1')::uuid, 'Plan con evento y sin equipo')$$,
  '23514', null,
  'un plan con evento exige equipo'
);

-- Control positivo sobre el mismo entreno: lo de arriba falló por el equipo, el tipo o la
-- falta de equipo, no por el evento. Sin autor, como los planes del seed.
select lives_ok(
  $$insert into practice_plans (organization_id, team_id, event_id, title, created_by)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.e_t1')::uuid, 'Sesión de T1', null)$$,
  'un plan sí se cuelga del entreno de su propio equipo'
);

-- Tampoco por un `update`: ni el plan se va a otro equipo dejando atrás su evento, ni el
-- evento cambia de equipo o de tipo dejando atrás su plan.
select throws_ok(
  $$update practice_plans set team_id = current_setting('fx.t1')::uuid
    where id = current_setting('fx.plan_t2')::uuid$$,
  '23503', null,
  'un plan con evento no cambia de equipo'
);

select throws_ok(
  $$update events set team_id = current_setting('fx.t1')::uuid
    where id = current_setting('fx.e_t2')::uuid$$,
  '23503', null,
  'un evento con plan no cambia de equipo'
);

select throws_ok(
  $$update events set kind = 'game' where id = current_setting('fx.e_t2')::uuid$$,
  '23503', null,
  'un entreno con plan no se convierte en partido'
);

-- Inicio lee los planes embebidos en sus eventos, y PostgREST resuelve ese embed con la
-- clave foránea entre las dos tablas: tiene que haber una, y solo una.
select results_eq(
  $$select conname::text collate "default", pg_get_constraintdef(oid)
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.practice_plans'::regclass
      and confrelid = 'public.events'::regclass$$,
  $$values (
    'practice_plans_event_fkey',
    'FOREIGN KEY (organization_id, team_id, event_kind, event_id) '
      || 'REFERENCES events(organization_id, team_id, kind, id)'
  )$$,
  'una sola clave foránea entre planes y eventos, con el equipo y el tipo dentro'
);

-- ── El autor que deja el equipo deja de ver el plan ──────────────────────────────────
-- c1 crea «Plan de c1» en T1. Se inserta como postgres (los usuarios todavía no escriben),
-- con el `sub` de c1 en la sesión, que es lo que lee `auth.uid()`.
select tests.authenticate_as(current_setting('fx.c1')::uuid);
reset role;

insert into practice_plans (organization_id, team_id, title)
values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'Plan de c1');

insert into practice_items (organization_id, plan_id, sort, title_override, minutes)
select organization_id, id, 1, 'plan-c1-1', 10 from practice_plans where title = 'Plan de c1';

select results_eq(
  $$select created_by, updated_by, event_kind::text
    from practice_plans where title = 'Plan de c1'$$,
  $$values (current_setting('fx.c1')::uuid, current_setting('fx.c1')::uuid, 'practice')$$,
  'un plan nuevo nace con su autor en created_by y en updated_by, y de tipo practice'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

-- Control positivo: mientras está en el cuerpo técnico de T1, c1 ve los planes del equipo
-- (el suyo y «Sesión de T1», que no creó) y su plantilla privada.
select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Plan de c1'), ('Plantilla privada de c1'), ('Sesión de T1')$$,
  'control: c1, staff de T1, ve los planes de T1 y su plantilla privada'
);

select results_eq(
  'select title_override from practice_items order by 1',
  $$values ('plan-c1-1'), ('privada-c1-1')$$,
  'control: c1 ve los ítems de su plan y de su plantilla'
);

-- c1 deja el cuerpo técnico de T1 y sigue siendo miembro activo del club.
reset role;
delete from team_staff
where team_id = current_setting('fx.t1')::uuid
  and person_id = current_setting('fx.p_c1')::uuid;
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select is(
  private.can_manage_team(current_setting('fx.t1')::uuid), false,
  'quien deja el cuerpo técnico de un equipo deja de gestionarlo'
);

select is_empty(
  $$select title from practice_plans where team_id = current_setting('fx.t1')::uuid$$,
  'el autor que deja el equipo deja de ver sus planes, también el que creó'
);

select results_eq(
  'select title from practice_plans',
  $$values ('Plantilla privada de c1')$$,
  'el autor que deja el equipo sigue viendo su plantilla privada, y nada más'
);

select results_eq(
  'select title_override from practice_items',
  $$values ('privada-c1-1')$$,
  'el autor que deja el equipo deja de ver los ítems del plan que creó'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  'select title from practice_plans order by 1',
  $$values ('Plan de c1'), ('Plantilla privada de c1'), ('Sesión de T1'), ('Sesión de T2')$$,
  'adminA sigue viendo el plan y la plantilla de c1, con el resto de planes del club'
);

-- ── Borrar al autor no falla (como postgres) ─────────────────────────────────────────
-- `created_by` y `updated_by` apuntan a `auth.users`. Sin `on delete set null`, borrar la
-- cuenta de quien creó un plan fallaba con 23503. Es lo último que hace el test con c1: al
-- borrarlo se va también su membresía.
reset role;

select lives_ok(
  $$delete from auth.users where id = current_setting('fx.c1')::uuid$$,
  'borrar al autor de un plan no falla'
);

select results_eq(
  $$select title, created_by, updated_by from practice_plans
    where title in ('Plan de c1', 'Plantilla privada de c1') order by 1$$,
  $$values ('Plan de c1', null::uuid, null::uuid),
           ('Plantilla privada de c1', null::uuid, null::uuid)$$,
  'los planes se quedan y su autor pasa a null'
);

-- ── Restricciones (como postgres) ────────────────────────────────────────────────────
-- practice_plans
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid, '')$$,
  '23514', null,
  'título de plan vacío rechazado'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid, repeat('a', 81))$$,
  '23514', null,
  'título de plan de 81 caracteres rechazado'
);

select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title, notes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid,
            'Notas largas', repeat('a', 2001))$$,
  '23514', null,
  'notas de plan de 2001 caracteres rechazadas'
);

-- Control positivo: «Sesión de T2» tiene dos focos distintos.
select throws_ok(
  $$insert into practice_plans (organization_id, team_id, title, primary_focus_id, secondary_focus_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid, 'Foco repetido',
            current_setting('fx.f_tecnica')::uuid, current_setting('fx.f_tecnica')::uuid)$$,
  '23514', null,
  'el foco secundario no repite el principal'
);

select lives_ok(
  $$insert into practice_plans (organization_id, team_id, title, notes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid,
            repeat('a', 80), repeat('a', 2000))$$,
  'título de 80 caracteres y notas de 2000 aceptados'
);

-- practice_items
select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t2')::uuid, 90, 10)$$,
  '23514', null,
  'un ítem sin ejercicio ni título rechazado'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes, title_override)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t2')::uuid, 90, 10,
            repeat('a', 81))$$,
  '23514', null,
  'título de ítem de 81 caracteres rechazado'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes, title_override)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t2')::uuid, 90, 10, '')$$,
  '23514', null,
  'título de ítem vacío rechazado'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes, title_override, phase)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t2')::uuid, 90, 10,
            'Fase larga', repeat('a', 41))$$,
  '23514', null,
  'fase de ítem de 41 caracteres rechazada'
);

select throws_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes, title_override, notes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t2')::uuid, 90, 10,
            'Notas largas', repeat('a', 501))$$,
  '23514', null,
  'notas de ítem de 501 caracteres rechazadas'
);

select lives_ok(
  $$insert into practice_items (organization_id, plan_id, sort, minutes, title_override, phase, notes)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.plan_t2')::uuid, 90, 10,
            repeat('a', 80), repeat('a', 40), repeat('a', 500))$$,
  'título de 80 caracteres, fase de 40 y notas de 500 aceptados'
);

-- events
select throws_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid, 'practice',
            '2026-10-13T15:00:00Z', '2026-10-13T16:00:00Z', repeat('a', 81))$$,
  '23514', null,
  'lugar de evento de 81 caracteres rechazado'
);

select lives_ok(
  $$insert into events (organization_id, team_id, kind, starts_at, ends_at, location)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid, 'practice',
            '2026-10-13T15:00:00Z', '2026-10-13T16:00:00Z', repeat('a', 80))$$,
  'lugar de evento de 80 caracteres aceptado'
);

-- ── updated_at avanza con cada cambio ────────────────────────────────────────────────
-- Es el testigo de la concurrencia optimista: tiene que avanzar aunque el cambio ocurra en
-- la misma transacción que el alta, donde `now()` vale siempre lo mismo.
do $$
begin
  perform set_config('fx.updated_at_antes', updated_at::text, true)
  from practice_plans where id = current_setting('fx.plan_t2')::uuid;
end
$$;

update practice_plans set title = 'Sesión de T2 retocada'
where id = current_setting('fx.plan_t2')::uuid;

select ok(
  (select updated_at from practice_plans where id = current_setting('fx.plan_t2')::uuid)
    > current_setting('fx.updated_at_antes')::timestamptz,
  'updated_at avanza al cambiar el título de un plan, dentro de la misma transacción'
);

select has_trigger(
  'public'::name, 'practice_plans'::name, 'practice_plans_set_updated_at'::name,
  'practice_plans tiene su trigger de updated_at'::text
);

-- ── La función de RLS nueva ──────────────────────────────────────────────────────────
-- `stable security definer` con `search_path` vacío, y fuera del alcance de anon (PUBLIC
-- incluido). Lo mismo de las dos que se reescriben lo comprueban sus tests de siempre:
-- calendar.test.sql (`can_see_plan`) y structure.test.sql (`can_see_person`).
select results_eq(
  $$select count(*)::int from pg_proc as f
    where f.pronamespace = 'private'::regnamespace
      and f.proname = 'can_manage_team'
      and f.prosecdef
      and f.provolatile = 's'
      and f.proconfig = array['search_path=""']$$,
  array[1],
  'can_manage_team es stable security definer con search_path vacío'
);

select is_empty(
  $$select f.oid::regprocedure::text from pg_proc as f
    where f.pronamespace = 'private'::regnamespace
      and f.proname = 'can_manage_team'
      and has_function_privilege('anon', f.oid, 'execute')$$,
  'anon no puede ejecutar can_manage_team'
);

select * from finish();

rollback;
