-- Funciones de sesión: crear, editar, guardar los ítems y duplicar un entrenamiento.
--
-- Las cuatro son `security invoker`: corren con la sesión de quien llama, bajo los privilegios
-- por columna y las políticas de `practice_write`. Este test comprueba:
--   · el contrato de cada una: qué escribe, qué devuelve y qué deja como estaba;
--   · el orden de los errores: `NOT_FOUND` antes que nada, `SESSION_CLOSED` antes que
--     `STALE_COPY`, y los dos antes que `INVALID`;
--   · el aislamiento: quien no gestiona el equipo (otro equipo del club, otro club, un jugador)
--     recibe siempre `NOT_FOUND`, también con la copia correcta, sobre una sesión cerrada y con
--     una entrada inválida: no llega a saber nada de la sesión;
--   · la copia obsoleta (Review Focus 2) y la sesión cerrada (Review Focus 5);
--   · la atomicidad: una llamada que falla a medias no deja nada escrito.
--
-- Las pruebas de permiso usan la copia real del plan (`tests.token`): si una función dejara
-- pasar a quien no debe, el guardado valdría y el test lo vería; con una copia errónea, un
-- `STALE_COPY` tomado por el error esperado lo escondería.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*` de
-- sesión vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace
-- al final: por eso la posición única de los ítems, que se comprueba al cerrar la transacción,
-- se fuerza aquí a mano (`set constraints`). Los datos son ficticios y solo de este test.
begin;

select plan(162);

-- ── Ayudas (solo existen en esta transacción) ────────────────────────────────────────
-- Leen como el propietario, sin RLS: dicen lo que hay en la base, lo vea o no quien llama.

-- El `updated_at` real de un plan: la copia con la que se guarda.
create function tests.token(p uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  select pp.updated_at from public.practice_plans as pp where pp.id = token.p;
$$;

-- El plan de un evento.
create function tests.plan_of(e uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select pp.id from public.practice_plans as pp where pp.event_id = plan_of.e;
$$;

-- Los ítems de un plan, en orden, como «posición·título·minutos» separados por « | ».
create function tests.items(p uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select coalesce(
    string_agg(
      pi.sort || '·' || coalesce(pi.title_override, '∅') || '·' || pi.minutes,
      ' | ' order by pi.sort
    ),
    ''
  )
  from public.practice_items as pi
  where pi.plan_id = items.p;
$$;

-- El id de un ítem, por su plan y su título.
create function tests.item_id(p uuid, title text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select pi.id
  from public.practice_items as pi
  where pi.plan_id = item_id.p and pi.title_override = item_id.title;
$$;

-- Una sesión de un vistazo: «día inicio–fin (UTC) · lugar · estado · título · estado del plan».
create function tests.summary(e uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select to_char(ev.starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
         || '–' || to_char(ev.ends_at at time zone 'UTC', 'HH24:MI')
         || ' · ' || coalesce(ev.location, '∅')
         || ' · ' || ev.status::text
         || ' · ' || coalesce(pp.title, '∅')
         || ' · ' || coalesce(pp.status, '∅')
  from public.events as ev
  left join public.practice_plans as pp on pp.event_id = ev.id
  where ev.id = summary.e;
$$;

-- Cuántos eventos hay en total.
create function tests.event_count()
returns int
language sql
security definer
set search_path = ''
as $$
  select count(*)::int from public.events;
$$;

-- Un elemento de `p_items`: título y minutos, el `id` si es un ítem que ya existe, y lo que
-- traiga `extra` (que pisa lo anterior).
create function tests.item(
  title text,
  minutes int default 10,
  id uuid default null,
  extra jsonb default '{}'::jsonb
)
returns jsonb
language sql
set search_path = ''
as $$
  select jsonb_build_object('title', item.title, 'minutes', item.minutes)
         || case when item.id is null then '{}'::jsonb else jsonb_build_object('id', item.id) end
         || item.extra;
$$;

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Los de practice_write.test.sql, más un entreno de 26 horas:
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
--   «T1 largo»          → T1, entreno, programado → «Sesión larga» (sin ítems); dura 26 horas
--   «T1 hecho»          → T1, entreno, hecho      → «Sesión hecha» (un ítem, completado)
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

  u_admin_a uuid := tests.create_user('admin-a@practice-functions.pgtap.test');
  u_c1 uuid := tests.create_user('c1@practice-functions.pgtap.test');
  u_c1b uuid := tests.create_user('c1b@practice-functions.pgtap.test');
  u_c2 uuid := tests.create_user('c2@practice-functions.pgtap.test');
  u_jugador uuid := tests.create_user('jugador@practice-functions.pgtap.test');
  u_admin_b uuid := tests.create_user('admin-b@practice-functions.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@practice-functions.pgtap.test');

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
  e_t1_largo constant uuid := gen_random_uuid();
  e_t1_done constant uuid := gen_random_uuid();
  e_t1_done_libre constant uuid := gen_random_uuid();
  e_t1_cancelled constant uuid := gen_random_uuid();
  e_t1_game constant uuid := gen_random_uuid();
  e_t2 constant uuid := gen_random_uuid();
  e_tb constant uuid := gen_random_uuid();

  plan_t1 constant uuid := gen_random_uuid();
  plan_largo constant uuid := gen_random_uuid();
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
    (e_t1_game, club_a, t1, 'game', '2026-10-10T08:30:00Z', '2026-10-10T10:00:00Z', 'T1 partido', 'scheduled'),
    (e_t1_largo, club_a, t1, 'practice', '2026-10-11T16:00:00Z', '2026-10-12T18:00:00Z', 'T1 largo', 'scheduled');

  -- Los fixtures se insertan sin sesión (`auth.uid()` es null): el autor va explícito.
  insert into practice_plans (
    id, organization_id, team_id, event_id, title, is_template, status, created_by
  ) values
    (plan_t1, club_a, t1, e_t1, 'Sesión de T1', false, 'ready', u_c1),
    (plan_largo, club_a, t1, e_t1_largo, 'Sesión larga', false, 'draft', u_c1),
    (plan_done, club_a, t1, e_t1_done, 'Sesión hecha', false, 'done', u_c1),
    (plan_cancelled, club_a, t1, e_t1_cancelled, 'Sesión cancelada', false, 'ready', u_c1),
    (plan_t2, club_a, t2, e_t2, 'Sesión de T2', false, 'ready', u_c2),
    (plan_tb, club_b, tb, e_tb, 'Sesión de TB', false, 'ready', u_coach_b),
    (plan_suelto, club_a, t1, null, 'Plan suelto de T1', false, 'draft', u_c1),
    (tpl_c1, club_a, null, null, 'Plantilla privada de c1', true, 'draft', u_c1);

  insert into practice_items (
    organization_id, plan_id, sort, phase, title_override, minutes, completed, actual_minutes
  ) values
    (club_a, plan_t1, 1, 'Activación', 'sesion-t1-1', 10, null, null),
    (club_a, plan_t1, 2, 'Técnica', 'sesion-t1-2', 15, null, null),
    (club_a, plan_done, 1, 'Activación', 'hecha-1', 10, true, 12),
    (club_a, plan_cancelled, 1, 'Activación', 'cancelada-1', 10, null, null),
    (club_a, plan_t2, 1, 'Activación', 'sesion-t2-1', 10, null, null),
    (club_b, plan_tb, 1, 'Activación', 'sesion-tb-1', 10, null, null),
    (club_a, plan_suelto, 1, null, 'suelto-1', 10, null, null),
    (club_a, tpl_c1, 1, null, 'privada-c1-1', 10, null, null);

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
  perform set_config('fx.e_t1_largo', e_t1_largo::text, true);
  perform set_config('fx.e_t1_done', e_t1_done::text, true);
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

  -- Cómo están, antes de que nadie llame a nada, las sesiones que los intrusos no deben tocar.
  perform set_config('fx.u_t1', tests.token(plan_t1)::text, true);
  perform set_config('fx.u_done', tests.token(plan_done)::text, true);
  perform set_config('fx.u_cancelled', tests.token(plan_cancelled)::text, true);
end
$$;

-- ── c1 crea una sesión ───────────────────────────────────────────────────────────────
-- El id del evento que devuelve la función queda en un ajuste, para encadenar lo demás.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select lives_ok(
  $$select set_config('fx.e_new', public.create_practice_session(
      current_setting('fx.t1')::uuid, '2026-10-13T16:00:00Z', '2026-10-13T17:15:00Z',
      'Sesión nueva', current_setting('fx.f_tecnica')::uuid,
      current_setting('fx.f_rebote')::uuid, 'Pista 1')::text, true)$$,
  'c1 crea una sesión en T1, su equipo'
);

select results_eq(
  $$select organization_id, team_id, kind::text, status::text, starts_at, ends_at, location
    from events where id = current_setting('fx.e_new')::uuid$$,
  $$values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            'practice', 'scheduled', '2026-10-13T16:00:00Z'::timestamptz,
            '2026-10-13T17:15:00Z'::timestamptz, 'Pista 1')$$,
  'el evento es un entreno programado de T1, en su club, con sus horas y su lugar'
);

select results_eq(
  $$select organization_id, team_id, title, primary_focus_id, secondary_focus_id, notes,
           status, created_by, updated_by, is_template
    from practice_plans where event_id = current_setting('fx.e_new')::uuid$$,
  $$values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            'Sesión nueva', current_setting('fx.f_tecnica')::uuid,
            current_setting('fx.f_rebote')::uuid, null::text,
            'draft', current_setting('fx.c1')::uuid, current_setting('fx.c1')::uuid, false)$$,
  'su plan lleva el título y los focos, es de T1, a nombre de c1 y nace como borrador'
);

select is(
  tests.items(tests.plan_of(current_setting('fx.e_new')::uuid)),
  '',
  'la sesión nace sin ítems'
);

-- Los tres últimos parámetros tienen `default null`: crear es pasar equipo, horas y título.
select lives_ok(
  $$select set_config('fx.e_min', public.create_practice_session(
      p_team => current_setting('fx.t1')::uuid,
      p_starts_at => '2026-10-15T16:00:00Z',
      p_ends_at => '2026-10-15T17:00:00Z',
      p_title => 'Sesión mínima')::text, true)$$,
  'c1 crea otra pasando solo equipo, horas y título, por nombre'
);

select results_eq(
  $$select e.location, pp.title, pp.primary_focus_id, pp.secondary_focus_id, pp.notes
    from events as e
    join practice_plans as pp on pp.event_id = e.id
    where e.id = current_setting('fx.e_min')::uuid$$,
  $$values (null::text, 'Sesión mínima', null::uuid, null::uuid, null::text)$$,
  'sin lugar ni focos, la sesión queda sin ellos'
);

-- Lo que la función no decide lo deciden las tablas, con su propio código.
select throws_ok(
  $$select public.create_practice_session(
      current_setting('fx.t1')::uuid, '2026-10-16T16:00:00Z', '2026-10-16T16:00:00Z',
      'No debe quedar', null, null, 'No debe quedar')$$,
  '23514', null,
  'una sesión que no acaba después de empezar sale con el 23514 del check'
);

-- El evento ya está insertado cuando falla el plan: no debe quedar (más abajo).
select throws_ok(
  $$select public.create_practice_session(
      current_setting('fx.t1')::uuid, '2026-10-16T16:00:00Z', '2026-10-16T17:00:00Z',
      '', null, null, 'No debe quedar')$$,
  '23514', null,
  'un título vacío sale con el 23514 del check'
);

select throws_ok(
  $$select public.create_practice_session(
      current_setting('fx.t1')::uuid, '2026-10-16T16:00:00Z', '2026-10-16T17:00:00Z',
      'No debe quedar', current_setting('fx.f_b')::uuid, null, 'No debe quedar')$$,
  '23503', null,
  'un foco de otro club sale con el 23503 de la clave foránea'
);

select throws_ok(
  $$select public.create_practice_session(
      gen_random_uuid(), '2026-10-16T16:00:00Z', '2026-10-16T17:00:00Z', 'No debe quedar',
      null, null, 'No debe quedar')$$,
  'P0002', 'NOT_FOUND',
  'un equipo que no existe da NOT_FOUND'
);

select throws_ok(
  $$select public.create_practice_session(
      null, '2026-10-16T16:00:00Z', '2026-10-16T17:00:00Z', 'No debe quedar',
      null, null, 'No debe quedar')$$,
  'P0002', 'NOT_FOUND',
  'sin equipo también'
);

-- adminA gestiona T2 por ser admin, sin estar en su cuerpo técnico.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select lives_ok(
  $$select set_config('fx.e_admin', public.create_practice_session(
      current_setting('fx.t2')::uuid, '2026-10-13T15:00:00Z', '2026-10-13T16:00:00Z',
      'Sesión de adminA')::text, true)$$,
  'adminA crea una sesión en T2'
);

select results_eq(
  $$select e.team_id, pp.team_id, pp.created_by
    from events as e
    join practice_plans as pp on pp.event_id = e.id
    where e.id = current_setting('fx.e_admin')::uuid$$,
  $$values (current_setting('fx.t2')::uuid, current_setting('fx.t2')::uuid,
            current_setting('fx.admin_a')::uuid)$$,
  'la sesión y su plan son de T2, a nombre de adminA'
);

-- Mismo club, otro equipo. En el suyo sí crea: el NOT_FOUND de después no es de alguien que no
-- escribe en ningún sitio.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select lives_ok(
  $$select public.create_practice_session(
      current_setting('fx.t2')::uuid, '2026-10-14T15:00:00Z', '2026-10-14T16:00:00Z',
      'Sesión de c2')$$,
  'control: c2 crea una sesión en T2, su equipo'
);

select throws_ok(
  $$select public.create_practice_session(
      current_setting('fx.t1')::uuid, '2026-10-16T16:00:00Z', '2026-10-16T17:00:00Z',
      'No debe quedar', null, null, 'No debe quedar')$$,
  'P0002', 'NOT_FOUND',
  'c2 no crea una sesión en T1'
);

-- Otro club. El club de la sesión sale del equipo, no de quien llama.
select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select lives_ok(
  $$select set_config('fx.e_coach_b', public.create_practice_session(
      current_setting('fx.tb')::uuid, '2026-10-14T16:00:00Z', '2026-10-14T17:00:00Z',
      'Sesión de coachB')::text, true)$$,
  'control: coachB crea una sesión en TB, su equipo'
);

select results_eq(
  $$select e.organization_id, pp.organization_id
    from events as e
    join practice_plans as pp on pp.event_id = e.id
    where e.id = current_setting('fx.e_coach_b')::uuid$$,
  $$values (current_setting('fx.club_b')::uuid, current_setting('fx.club_b')::uuid)$$,
  'la sesión de coachB y su plan son del club B'
);

select throws_ok(
  $$select public.create_practice_session(
      current_setting('fx.t1')::uuid, '2026-10-16T16:00:00Z', '2026-10-16T17:00:00Z',
      'No debe quedar', null, null, 'No debe quedar')$$,
  'P0002', 'NOT_FOUND',
  'coachB no crea una sesión en un equipo de A'
);

select tests.authenticate_as(current_setting('fx.jugador')::uuid);

select throws_ok(
  $$select public.create_practice_session(
      current_setting('fx.t1')::uuid, '2026-10-16T16:00:00Z', '2026-10-16T17:00:00Z',
      'No debe quedar', null, null, 'No debe quedar')$$,
  'P0002', 'NOT_FOUND',
  'una cuenta de jugador no crea una sesión de su equipo'
);

reset role;

select is_empty(
  $$select id from events where location = 'No debe quedar'$$,
  'ninguna de las llamadas rechazadas deja un evento, tampoco la que falló al insertar el plan'
);

-- ── Guardar ordena y reemplaza ───────────────────────────────────────────────────────
-- Sobre la sesión que c1 acaba de crear. `u0` es la copia con la que nació su plan; cada
-- guardado devuelve la siguiente (`u1`, `u2`…).
do $$
begin
  perform set_config(
    'fx.p_new', tests.plan_of(current_setting('fx.e_new')::uuid)::text, true);
  perform set_config(
    'fx.p_min', tests.plan_of(current_setting('fx.e_min')::uuid)::text, true);
  perform set_config(
    'fx.u0', tests.token(current_setting('fx.p_new')::uuid)::text, true);
end
$$;

select tests.authenticate_as(current_setting('fx.c1')::uuid);

-- Un ejercicio de la biblioteca con su título copiado, y dos bloques libres.
select lives_ok(
  $$select set_config('fx.u1', public.save_practice_items(
      current_setting('fx.p_new')::uuid, current_setting('fx.u0')::timestamptz,
      jsonb_build_array(
        tests.item('Ejercicio de A', 10, null, jsonb_build_object(
          'drill_id', current_setting('fx.d_a'), 'phase', 'Activación', 'notes', 'Nota A')),
        tests.item('Bloque B', 15, null, '{"phase": "Técnica"}'),
        tests.item('Bloque C', 20)
      ))::text, true)$$,
  'c1 guarda tres ítems en su sesión'
);

select results_eq(
  $$select sort, title_override, phase, drill_id, minutes, notes, completed, actual_minutes
    from practice_items where plan_id = current_setting('fx.p_new')::uuid order by sort$$,
  $$values
      (1, 'Ejercicio de A', 'Activación', current_setting('fx.d_a')::uuid, 10::smallint,
       'Nota A', null::boolean, null::smallint),
      (2, 'Bloque B', 'Técnica', null::uuid, 15::smallint,
       null::text, null::boolean, null::smallint),
      (3, 'Bloque C', null::text, null::uuid, 20::smallint,
       null::text, null::boolean, null::smallint)$$,
  'los tres quedan con sort 1, 2 y 3, el título en title_override y nada registrado'
);

select results_eq(
  $$select status, updated_by, updated_at
    from practice_plans where id = current_setting('fx.p_new')::uuid$$,
  $$values ('ready', current_setting('fx.c1')::uuid, current_setting('fx.u1')::timestamptz)$$,
  'el plan pasa a ready y su updated_at es el que devolvió el guardado'
);

select ok(
  current_setting('fx.u1')::timestamptz > current_setting('fx.u0')::timestamptz,
  'el guardado avanza el updated_at del plan'
);

do $$
begin
  perform set_config('fx.i_a',
    tests.item_id(current_setting('fx.p_new')::uuid, 'Ejercicio de A')::text, true);
  perform set_config('fx.i_b',
    tests.item_id(current_setting('fx.p_new')::uuid, 'Bloque B')::text, true);
  perform set_config('fx.i_c',
    tests.item_id(current_setting('fx.p_new')::uuid, 'Bloque C')::text, true);
end
$$;

-- Con sus ids en orden inverso, y el segundo con todo cambiado.
select lives_ok(
  $$select set_config('fx.u2', public.save_practice_items(
      current_setting('fx.p_new')::uuid, current_setting('fx.u1')::timestamptz,
      jsonb_build_array(
        tests.item('Bloque C', 20, current_setting('fx.i_c')::uuid),
        tests.item('Bloque B bis', 25, current_setting('fx.i_b')::uuid, jsonb_build_object(
          'drill_id', current_setting('fx.d_a'), 'phase', 'Juego', 'notes', 'Nota B')),
        tests.item('Ejercicio de A', 10, current_setting('fx.i_a')::uuid, jsonb_build_object(
          'drill_id', current_setting('fx.d_a'), 'phase', 'Activación', 'notes', 'Nota A'))
      ))::text, true)$$,
  'c1 guarda los mismos tres ítems en orden inverso'
);

select results_eq(
  $$select sort, id from practice_items
    where plan_id = current_setting('fx.p_new')::uuid order by sort$$,
  $$values (1, current_setting('fx.i_c')::uuid), (2, current_setting('fx.i_b')::uuid),
           (3, current_setting('fx.i_a')::uuid)$$,
  'son los mismos ítems, con el sort invertido'
);

select results_eq(
  $$select title_override, phase, drill_id, minutes, notes
    from practice_items where id = current_setting('fx.i_b')::uuid$$,
  $$values ('Bloque B bis', 'Juego', current_setting('fx.d_a')::uuid, 25::smallint, 'Nota B')$$,
  'el ítem que llega con su id cambia de título, fase, ejercicio, minutos y notas'
);

-- La posición única por plan se comprueba al cerrar la transacción; aquí, al momento.
select lives_ok(
  'set constraints all immediate',
  'tras reordenar no quedan dos ítems en la misma posición'
);
set constraints all deferred;

select lives_ok(
  $$select set_config('fx.u3', public.save_practice_items(
      current_setting('fx.p_new')::uuid, current_setting('fx.u2')::timestamptz,
      jsonb_build_array(
        tests.item('Bloque C', 20, current_setting('fx.i_c')::uuid),
        tests.item('Ejercicio de A', 10, current_setting('fx.i_a')::uuid)
      ))::text, true)$$,
  'c1 guarda sin el segundo'
);

select results_eq(
  $$select sort, id from practice_items
    where plan_id = current_setting('fx.p_new')::uuid order by sort$$,
  $$values (1, current_setting('fx.i_c')::uuid), (2, current_setting('fx.i_a')::uuid)$$,
  'el que no llega queda borrado, y los otros dos se renumeran'
);

select lives_ok(
  $$select set_config('fx.u4', public.save_practice_items(
      current_setting('fx.p_new')::uuid, current_setting('fx.u3')::timestamptz,
      jsonb_build_array(
        tests.item('Bloque C', 20, current_setting('fx.i_c')::uuid),
        tests.item('Ejercicio de A', 10, current_setting('fx.i_a')::uuid),
        tests.item('Bloque D', 5)
      ))::text, true)$$,
  'c1 guarda con uno más, sin id'
);

select results_eq(
  $$select sort, title_override,
           id in (current_setting('fx.i_a')::uuid, current_setting('fx.i_b')::uuid,
                  current_setting('fx.i_c')::uuid)
    from practice_items where plan_id = current_setting('fx.p_new')::uuid order by sort$$,
  $$values (1, 'Bloque C', true), (2, 'Ejercicio de A', true), (3, 'Bloque D', false)$$,
  'el que llega sin id se inserta al final, con un id nuevo'
);

select ok(
  current_setting('fx.u4')::timestamptz > current_setting('fx.u3')::timestamptz
    and current_setting('fx.u3')::timestamptz > current_setting('fx.u2')::timestamptz
    and current_setting('fx.u2')::timestamptz > current_setting('fx.u1')::timestamptz,
  'cada guardado devuelve una copia posterior a la anterior'
);

-- ── Conserva lo registrado ───────────────────────────────────────────────────────────
-- `completed` y `actual_minutes` (lo que pasó en la pista) no los escribe ningún usuario
-- todavía: se anotan aquí como postgres. Un ítem que sigue en la lista los mantiene aunque
-- cambie de posición y de minutos. El ítem nuevo trae claves que no son del contrato: no se
-- leen.
reset role;
update practice_items set completed = true, actual_minutes = 9
where id = current_setting('fx.i_a')::uuid;
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select lives_ok(
  $$select set_config('fx.u5', public.save_practice_items(
      current_setting('fx.p_new')::uuid, current_setting('fx.u4')::timestamptz,
      jsonb_build_array(
        tests.item('Bloque E', 10, null, jsonb_build_object(
          'completed', true, 'actual_minutes', 5, 'sort', 99,
          'plan_id', current_setting('fx.plan_t2'),
          'organization_id', current_setting('fx.club_b'))),
        tests.item('Ejercicio de A', 12, current_setting('fx.i_a')::uuid),
        tests.item('Bloque C', 20, current_setting('fx.i_c')::uuid)
      ))::text, true)$$,
  'c1 guarda con uno nuevo delante, el completado en medio y sin el último'
);

select results_eq(
  $$select sort, title_override, minutes, completed, actual_minutes
    from practice_items where plan_id = current_setting('fx.p_new')::uuid order by sort$$,
  $$values (1, 'Bloque E', 10::smallint, null::boolean, null::smallint),
           (2, 'Ejercicio de A', 12::smallint, true, 9::smallint),
           (3, 'Bloque C', 20::smallint, null::boolean, null::smallint)$$,
  'el ítem completado sigue completado y con sus minutos reales; el nuevo nace sin nada registrado'
);

select results_eq(
  $$select organization_id, plan_id from practice_items
    where id = tests.item_id(current_setting('fx.p_new')::uuid, 'Bloque E')$$,
  $$values (current_setting('fx.club_a')::uuid, current_setting('fx.p_new')::uuid)$$,
  'el club y el plan de un ítem nuevo son los del plan que se guarda, diga lo que diga el elemento'
);

-- ── Copia obsoleta (Review Focus 2) ──────────────────────────────────────────────────
-- c1 y su ayudante tienen abierta la misma sesión, los dos con la copia `u5`. Guarda primero
-- c1b; el guardado de c1, con la misma copia, ya no vale.
select tests.authenticate_as(current_setting('fx.c1b')::uuid);

select lives_ok(
  $$select set_config('fx.u6', public.save_practice_items(
      current_setting('fx.p_new')::uuid, current_setting('fx.u5')::timestamptz,
      jsonb_build_array(
        tests.item('Ejercicio de A', 12, current_setting('fx.i_a')::uuid),
        tests.item('Bloque C', 20, current_setting('fx.i_c')::uuid)
      ))::text, true)$$,
  'c1b, ayudante de T1, guarda la sesión que creó c1'
);

select results_eq(
  $$select created_by, updated_by from practice_plans
    where id = current_setting('fx.p_new')::uuid$$,
  $$values (current_setting('fx.c1')::uuid, current_setting('fx.c1b')::uuid)$$,
  'el plan sigue a nombre de c1 y anota a c1b como quien lo guardó'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, current_setting('fx.u5')::timestamptz,
      jsonb_build_array(tests.item('No debe quedar')))$$,
  'P0001', 'STALE_COPY',
  'el segundo guardado con la misma copia da STALE_COPY'
);

select results_eq(
  $$select tests.items(pp.id), pp.updated_at, pp.updated_by
    from practice_plans as pp where pp.id = current_setting('fx.p_new')::uuid$$,
  $$values ('1·Ejercicio de A·12 | 2·Bloque C·20', current_setting('fx.u6')::timestamptz,
            current_setting('fx.c1b')::uuid)$$,
  'quedan los ítems del primero, con su copia y a su nombre'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, null, jsonb_build_array(tests.item('No debe quedar')))$$,
  'P0001', 'STALE_COPY',
  'guardar sin copia esperada también es STALE_COPY'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid,
      current_setting('fx.u6')::timestamptz + interval '1 microsecond',
      jsonb_build_array(tests.item('No debe quedar')))$$,
  'P0001', 'STALE_COPY',
  'la copia se compara exacta: un microsegundo de diferencia ya es obsoleta'
);

-- ── Entrada inválida ─────────────────────────────────────────────────────────────────
-- Todas con la copia vigente: lo que se rechaza es la entrada.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid), null)$$,
  '22023', 'INVALID',
  'una lista nula da INVALID: no es una lista vacía'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid), '{}')$$,
  '22023', 'INVALID',
  'un objeto en vez de una lista da INVALID'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid), 'null')$$,
  '22023', 'INVALID',
  'un null de JSON en vez de una lista da INVALID'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid), '[7]')$$,
  '22023', 'INVALID',
  'un elemento que no es un objeto da INVALID'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid),
      (select jsonb_agg(tests.item('Bloque ' || n)) from generate_series(1, 31) as n))$$,
  '22023', 'INVALID',
  '31 ítems dan INVALID'
);

-- Un `id` tiene que ser de un ítem de este plan. El de otro plan del mismo equipo, el de un
-- plan de otro club y uno que no existe dan lo mismo.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid),
      jsonb_build_array(tests.item('Robado', 10,
        tests.item_id(current_setting('fx.plan_suelto')::uuid, 'suelto-1'))))$$,
  '22023', 'INVALID',
  'el id de un ítem de otro plan del mismo equipo da INVALID'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid),
      jsonb_build_array(tests.item('Robado', 10,
        tests.item_id(current_setting('fx.plan_tb')::uuid, 'sesion-tb-1'))))$$,
  '22023', 'INVALID',
  'el id de un ítem de un plan de otro club da INVALID'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid),
      jsonb_build_array(tests.item('Inventado', 10, gen_random_uuid())))$$,
  '22023', 'INVALID',
  'un id que no existe da INVALID'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid),
      jsonb_build_array(
        tests.item('Ejercicio de A', 12, current_setting('fx.i_a')::uuid),
        tests.item('Ejercicio de A otra vez', 12, current_setting('fx.i_a')::uuid)))$$,
  '22023', 'INVALID',
  'el mismo id dos veces da INVALID'
);

-- Los checks y las claves foráneas de la tabla salen con su propio código.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid),
      jsonb_build_array(tests.item('Sin minutos', 0)))$$,
  '23514', null,
  '0 minutos salen con el 23514 del check'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid),
      jsonb_build_array(tests.item('Demasiados minutos', 121)))$$,
  '23514', null,
  '121 minutos salen con el 23514 del check'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid),
      jsonb_build_array(tests.item(null, 10)))$$,
  '23514', null,
  'un ítem sin ejercicio ni título sale con el 23514 del check'
);

-- El payload borra los dos ítems que hay y añade uno con un ejercicio de B: la inserción
-- falla cuando el borrado ya está hecho.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, tests.token(current_setting('fx.p_new')::uuid),
      jsonb_build_array(tests.item('Con un ejercicio de B', 10, null,
        jsonb_build_object('drill_id', current_setting('fx.d_b')))))$$,
  '23503', null,
  'un ejercicio de otro club sale con el 23503 de la clave foránea'
);

select results_eq(
  $$select tests.items(pp.id), pp.updated_at, pp.status
    from practice_plans as pp where pp.id = current_setting('fx.p_new')::uuid$$,
  $$values ('1·Ejercicio de A·12 | 2·Bloque C·20', current_setting('fx.u6')::timestamptz, 'ready')$$,
  'tras los rechazos, los ítems, la copia y el estado del plan siguen como estaban'
);

-- 30 ítems valen (el tope), y una lista vacía también: deja el plan sin ítems y en borrador.
select lives_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_min')::uuid, tests.token(current_setting('fx.p_min')::uuid),
      (select jsonb_agg(tests.item('Bloque ' || n) order by n) from generate_series(1, 30) as n))$$,
  '30 ítems se guardan'
);

select results_eq(
  $$select (select count(*)::int from practice_items as pi where pi.plan_id = pp.id),
           (select min(pi.sort) from practice_items as pi where pi.plan_id = pp.id),
           (select max(pi.sort) from practice_items as pi where pi.plan_id = pp.id),
           (select pi.sort from practice_items as pi
            where pi.plan_id = pp.id and pi.title_override = 'Bloque 17'),
           pp.status
    from practice_plans as pp where pp.id = current_setting('fx.p_min')::uuid$$,
  $$values (30, 1, 30, 17, 'ready')$$,
  'los 30 quedan en su posición, del 1 al 30, y el plan en ready'
);

select lives_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_min')::uuid, tests.token(current_setting('fx.p_min')::uuid), '[]')$$,
  'una lista vacía se guarda'
);

select results_eq(
  $$select tests.items(pp.id), pp.status
    from practice_plans as pp where pp.id = current_setting('fx.p_min')::uuid$$,
  $$values ('', 'draft')$$,
  'la lista vacía deja el plan sin ítems y en borrador'
);

-- ── Planes sin evento ────────────────────────────────────────────────────────────────
-- Un plan del equipo sin fecha todavía lo guarda quien gestiona el equipo: no hay sesión que
-- pueda estar cerrada. Una plantilla privada (sin equipo) no la guarda nadie, tampoco su autor.
select lives_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_suelto')::uuid,
      tests.token(current_setting('fx.plan_suelto')::uuid),
      jsonb_build_array(
        tests.item('Bloque nuevo', 5),
        tests.item('suelto-1', 10,
          tests.item_id(current_setting('fx.plan_suelto')::uuid, 'suelto-1'))))$$,
  'c1 guarda los ítems de un plan de su equipo que no tiene evento'
);

select results_eq(
  $$select tests.items(pp.id), pp.status
    from practice_plans as pp where pp.id = current_setting('fx.plan_suelto')::uuid$$,
  $$values ('1·Bloque nuevo·5 | 2·suelto-1·10', 'ready')$$,
  'el plan sin evento queda con sus dos ítems y en ready'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.tpl_c1')::uuid, tests.token(current_setting('fx.tpl_c1')::uuid), '[]')$$,
  'P0002', 'NOT_FOUND',
  'c1 no guarda su plantilla privada, que sí ve: un plan sin equipo no lo gestiona nadie'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.tpl_c1')::uuid, tests.token(current_setting('fx.tpl_c1')::uuid), '[]')$$,
  'P0002', 'NOT_FOUND',
  'adminA tampoco guarda una plantilla privada'
);

-- ── El admin del club ────────────────────────────────────────────────────────────────
-- adminA gestiona los equipos de su club sin estar en ningún cuerpo técnico: guarda y edita la
-- sesión que creó en T2, donde el cuerpo técnico es c2.
select lives_ok(
  $$select public.save_practice_items(
      tests.plan_of(current_setting('fx.e_admin')::uuid),
      tests.token(tests.plan_of(current_setting('fx.e_admin')::uuid)),
      jsonb_build_array(tests.item('Bloque de adminA', 20)))$$,
  'adminA guarda los ítems de una sesión de T2'
);

select lives_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_admin')::uuid,
      tests.token(tests.plan_of(current_setting('fx.e_admin')::uuid)),
      '2026-10-13T15:30:00Z', '2026-10-13T16:30:00Z', 'Sesión de adminA editada',
      null, null, 'Pista de T2')$$,
  'adminA edita los datos de una sesión de T2'
);

select results_eq(
  $$select tests.summary(e.id), tests.items(pp.id), pp.updated_by
    from events as e
    join practice_plans as pp on pp.event_id = e.id
    where e.id = current_setting('fx.e_admin')::uuid$$,
  $$values ('2026-10-13 15:30–16:30 · Pista de T2 · scheduled · Sesión de adminA editada · ready',
            '1·Bloque de adminA·20', current_setting('fx.admin_a')::uuid)$$,
  'la sesión de T2 queda con el ítem, las horas, el lugar y el título de adminA, y a su nombre'
);

-- ── Sesión cerrada (Review Focus 5) ──────────────────────────────────────────────────
-- Un entreno hecho o cancelado es histórico. Con la copia correcta, para que el error sea por
-- estar cerrada y no por la copia.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_done')::uuid, current_setting('fx.u_done')::timestamptz, '[]')$$,
  'P0001', 'SESSION_CLOSED',
  'c1 no guarda los ítems de un entreno hecho'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_cancelled')::uuid,
      current_setting('fx.u_cancelled')::timestamptz, '[]')$$,
  'P0001', 'SESSION_CLOSED',
  'c1 no guarda los ítems de un entreno cancelado'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1_done')::uuid, current_setting('fx.u_done')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Reabierta')$$,
  'P0001', 'SESSION_CLOSED',
  'c1 no edita los datos de un entreno hecho'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1_cancelled')::uuid, current_setting('fx.u_cancelled')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Reabierta')$$,
  'P0001', 'SESSION_CLOSED',
  'c1 no edita los datos de un entreno cancelado'
);

-- Con una copia antigua también: que la sesión esté cerrada se dice antes que la copia.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_done')::uuid, '2000-01-01T00:00:00Z', '[]')$$,
  'P0001', 'SESSION_CLOSED',
  'con una copia antigua, guardar un entreno hecho da SESSION_CLOSED y no STALE_COPY'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1_cancelled')::uuid, '2000-01-01T00:00:00Z',
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Reabierta')$$,
  'P0001', 'SESSION_CLOSED',
  'con una copia antigua, editar un entreno cancelado da SESSION_CLOSED y no STALE_COPY'
);

-- El admin tampoco: cerrada es cerrada para todos.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_done')::uuid, current_setting('fx.u_done')::timestamptz, '[]')$$,
  'P0001', 'SESSION_CLOSED',
  'adminA tampoco guarda los ítems de un entreno hecho'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1_cancelled')::uuid, current_setting('fx.u_cancelled')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Reabierta')$$,
  'P0001', 'SESSION_CLOSED',
  'adminA tampoco edita los datos de un entreno cancelado'
);

select results_eq(
  $$select tests.summary(current_setting('fx.e_t1_done')::uuid),
           tests.items(current_setting('fx.plan_done')::uuid),
           tests.summary(current_setting('fx.e_t1_cancelled')::uuid),
           tests.items(current_setting('fx.plan_cancelled')::uuid)$$,
  $$values ('2026-09-29 16:00–17:15 · T1 hecho · done · Sesión hecha · done',
            '1·hecha-1·10',
            '2026-10-01 16:00–17:15 · T1 cancelado · cancelled · Sesión cancelada · ready',
            '1·cancelada-1·10')$$,
  'las dos sesiones cerradas y sus ítems siguen como estaban'
);

-- Y una que se cierra ahora: c1 cancela la sesión mínima, que hasta aquí se guardaba.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$with u as (update events set status = 'cancelled'
               where id = current_setting('fx.e_min')::uuid returning 1)
    select count(*)::int from u$$,
  array[1],
  'c1 cancela la sesión mínima'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_min')::uuid, tests.token(current_setting('fx.p_min')::uuid),
      jsonb_build_array(tests.item('No debe quedar')))$$,
  'P0001', 'SESSION_CLOSED',
  'c1 ya no guarda los ítems de la sesión que acaba de cancelar'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_min')::uuid, tests.token(current_setting('fx.p_min')::uuid),
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Reabierta')$$,
  'P0001', 'SESSION_CLOSED',
  'ni edita ya sus datos'
);

-- ── Quien no gestiona no sabe nada ───────────────────────────────────────────────────
-- c2 es del mismo club y entrena otro equipo. En el suyo sí guarda.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select lives_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t2')::uuid, tests.token(current_setting('fx.plan_t2')::uuid),
      jsonb_build_array(
        tests.item('sesion-t2-1', 10,
          tests.item_id(current_setting('fx.plan_t2')::uuid, 'sesion-t2-1')),
        tests.item('sesion-t2-2', 15)))$$,
  'control: c2 guarda los ítems de la sesión de T2, su equipo'
);

-- Con una copia antigua: NOT_FOUND, no STALE_COPY. No se entera de si su copia está al día.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t1')::uuid, '2000-01-01T00:00:00Z',
      jsonb_build_array(tests.item('c2 estuvo aquí')))$$,
  'P0002', 'NOT_FOUND',
  'c2 con una copia antigua no guarda la sesión de T1: NOT_FOUND, no STALE_COPY'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1')::uuid, '2000-01-01T00:00:00Z',
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'c2 estuvo aquí')$$,
  'P0002', 'NOT_FOUND',
  'c2 con una copia antigua no edita la sesión de T1: NOT_FOUND, no STALE_COPY'
);

-- Con la copia correcta: si la función le dejara pasar, el guardado valdría.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      jsonb_build_array(tests.item('c2 estuvo aquí')))$$,
  'P0002', 'NOT_FOUND',
  'c2 con la copia correcta tampoco guarda la sesión de T1'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'c2 estuvo aquí')$$,
  'P0002', 'NOT_FOUND',
  'c2 con la copia correcta tampoco edita la sesión de T1'
);

-- Sobre una sesión cerrada: NOT_FOUND, no SESSION_CLOSED. Tampoco se entera de su estado.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_done')::uuid, current_setting('fx.u_done')::timestamptz, '[]')$$,
  'P0002', 'NOT_FOUND',
  'c2 sobre un entreno hecho de T1: NOT_FOUND, no SESSION_CLOSED'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1_done')::uuid, current_setting('fx.u_done')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'c2 estuvo aquí')$$,
  'P0002', 'NOT_FOUND',
  'c2 al editar un entreno hecho de T1: NOT_FOUND, no SESSION_CLOSED'
);

-- Con una entrada inválida: NOT_FOUND, no INVALID.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t1')::uuid, current_setting('fx.u_t1')::timestamptz, null)$$,
  'P0002', 'NOT_FOUND',
  'c2 con una lista nula sobre la sesión de T1: NOT_FOUND, no INVALID'
);

-- Otro club.
select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select lives_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_tb')::uuid, tests.token(current_setting('fx.plan_tb')::uuid),
      '2026-10-07T17:00:00Z', '2026-10-07T18:00:00Z', 'Sesión de TB editada')$$,
  'control: coachB edita los datos de la sesión de TB, su equipo'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t1')::uuid, '2000-01-01T00:00:00Z',
      jsonb_build_array(tests.item('coachB estuvo aquí')))$$,
  'P0002', 'NOT_FOUND',
  'coachB con una copia antigua no guarda una sesión de A: NOT_FOUND, no STALE_COPY'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1')::uuid, '2000-01-01T00:00:00Z',
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'coachB estuvo aquí')$$,
  'P0002', 'NOT_FOUND',
  'coachB con una copia antigua no edita una sesión de A: NOT_FOUND, no STALE_COPY'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      jsonb_build_array(tests.item('coachB estuvo aquí')))$$,
  'P0002', 'NOT_FOUND',
  'coachB con la copia correcta tampoco guarda una sesión de A'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'coachB estuvo aquí')$$,
  'P0002', 'NOT_FOUND',
  'coachB con la copia correcta tampoco edita una sesión de A'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_cancelled')::uuid,
      current_setting('fx.u_cancelled')::timestamptz, '[]')$$,
  'P0002', 'NOT_FOUND',
  'coachB sobre un entreno cancelado de A: NOT_FOUND, no SESSION_CLOSED'
);

-- Ser admin de un club no da nada en otro.
select tests.authenticate_as(current_setting('fx.admin_b')::uuid);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      jsonb_build_array(tests.item('adminB estuvo aquí')))$$,
  'P0002', 'NOT_FOUND',
  'adminB no guarda una sesión de A'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'adminB estuvo aquí')$$,
  'P0002', 'NOT_FOUND',
  'adminB no edita una sesión de A'
);

-- Está en la plantilla de T1, no en su cuerpo técnico.
select tests.authenticate_as(current_setting('fx.jugador')::uuid);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      jsonb_build_array(tests.item('jugador estuvo aquí')))$$,
  'P0002', 'NOT_FOUND',
  'una cuenta de jugador no guarda la sesión de su equipo'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'jugador estuvo aquí')$$,
  'P0002', 'NOT_FOUND',
  'una cuenta de jugador no edita la sesión de su equipo'
);

-- Y lo que no es una sesión, para quien sí gestiona el equipo.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$select public.save_practice_items(gen_random_uuid(), now(), '[]')$$,
  'P0002', 'NOT_FOUND',
  'un plan que no existe da NOT_FOUND'
);

select throws_ok(
  $$select public.update_practice_session(
      gen_random_uuid(), now(), '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Nada')$$,
  'P0002', 'NOT_FOUND',
  'un evento que no existe da NOT_FOUND'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1_game')::uuid, now(),
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Partido movido')$$,
  'P0002', 'NOT_FOUND',
  'c1 no edita un partido de su equipo: no es una sesión'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1_libre')::uuid, now(),
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Sin plan')$$,
  'P0002', 'NOT_FOUND',
  'c1 no edita un entreno sin plan: no hay sesión que editar'
);

-- Solo cuentan las membresías activas. c1 sigue en el cuerpo técnico de T1: lo que cambia es
-- su membresía, que después vuelve a quedar activa para el resto del test.
reset role;
update memberships set status = 'revoked' where user_id = current_setting('fx.c1')::uuid;
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      jsonb_build_array(tests.item('c1 revocado')))$$,
  'P0002', 'NOT_FOUND',
  'c1 con la membresía revocada no guarda la sesión de T1'
);

select throws_ok(
  $$select public.create_practice_session(
      current_setting('fx.t1')::uuid, '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z',
      'No debe quedar', null, null, 'No debe quedar')$$,
  'P0002', 'NOT_FOUND',
  'c1 con la membresía revocada no crea una sesión en T1'
);

reset role;
update memberships set status = 'active' where user_id = current_setting('fx.c1')::uuid;

select results_eq(
  $$select tests.summary(current_setting('fx.e_t1')::uuid),
           tests.items(current_setting('fx.plan_t1')::uuid),
           tests.token(current_setting('fx.plan_t1')::uuid),
           tests.summary(current_setting('fx.e_t1_game')::uuid),
           tests.summary(current_setting('fx.e_t1_libre')::uuid)$$,
  $$values ('2026-10-06 16:00–17:15 · T1 entreno · scheduled · Sesión de T1 · ready',
            '1·sesion-t1-1·10 | 2·sesion-t1-2·15',
            current_setting('fx.u_t1')::timestamptz,
            '2026-10-10 08:30–10:00 · T1 partido · scheduled · ∅ · ∅',
            '2026-10-08 16:00–17:15 · T1 sin plan · scheduled · ∅ · ∅')$$,
  'la sesión de T1, sus ítems y su copia, el partido y el entreno sin plan siguen como estaban'
);

-- ── Con la lectura abierta: el permiso lo comprueba la función ───────────────────────
-- Hoy quien no gestiona un equipo tampoco ve sus sesiones, así que los NOT_FOUND de arriba
-- podrían venir solo de que la lectura no devuelve fila. Si una fase posterior abre el
-- calendario a más miembros, las funciones no deben empezar a contestar STALE_COPY o
-- SESSION_CLOSED a quien no puede escribir. Se simula con políticas temporales de lectura
-- para cualquier miembro del club, como en practice_write.test.sql; aquí también sobre
-- `teams`, que es lo que lee `create_practice_session`.
reset role;

create policy teams_select_member_simulada
  on teams for select to authenticated
  using (private.is_member(organization_id));

create policy events_select_member_simulada
  on events for select to authenticated
  using (private.is_member(organization_id));

create policy practice_plans_select_member_simulada
  on practice_plans for select to authenticated
  using (private.is_member(organization_id));

create policy practice_items_select_member_simulada
  on practice_items for select to authenticated
  using (private.is_member(organization_id));

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  $$select
      (select count(*) from teams where id = current_setting('fx.t1')::uuid)::int,
      (select count(*) from events
       where id in (current_setting('fx.e_t1')::uuid, current_setting('fx.e_t1_done')::uuid))::int,
      (select count(*) from practice_plans
       where id in (current_setting('fx.plan_t1')::uuid,
                    current_setting('fx.plan_done')::uuid))::int,
      (select count(*) from practice_items
       where plan_id = current_setting('fx.plan_t1')::uuid)::int$$,
  $$values (1, 2, 2, 2)$$,
  'control: con la lectura abierta a los miembros, c2 ve T1, sus sesiones, sus planes y sus ítems'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t1')::uuid, '2000-01-01T00:00:00Z',
      jsonb_build_array(tests.item('c2 estuvo aquí')))$$,
  'P0002', 'NOT_FOUND',
  'con la lectura abierta, c2 con una copia antigua sigue recibiendo NOT_FOUND al guardar'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      jsonb_build_array(tests.item('c2 estuvo aquí')))$$,
  'P0002', 'NOT_FOUND',
  'con la lectura abierta, c2 con la copia correcta sigue sin guardar la sesión de T1'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1')::uuid, '2000-01-01T00:00:00Z',
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'c2 estuvo aquí')$$,
  'P0002', 'NOT_FOUND',
  'con la lectura abierta, c2 con una copia antigua sigue recibiendo NOT_FOUND al editar'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1')::uuid, current_setting('fx.u_t1')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'c2 estuvo aquí')$$,
  'P0002', 'NOT_FOUND',
  'con la lectura abierta, c2 con la copia correcta sigue sin editar la sesión de T1'
);

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan_done')::uuid, current_setting('fx.u_done')::timestamptz, '[]')$$,
  'P0002', 'NOT_FOUND',
  'con la lectura abierta, c2 sobre un entreno hecho sigue recibiendo NOT_FOUND, no SESSION_CLOSED'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1_done')::uuid, current_setting('fx.u_done')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'c2 estuvo aquí')$$,
  'P0002', 'NOT_FOUND',
  'con la lectura abierta, c2 al editar un entreno hecho sigue recibiendo NOT_FOUND'
);

select throws_ok(
  $$select public.duplicate_practice(
      current_setting('fx.e_t1')::uuid, '2026-11-03T16:00:00Z')$$,
  'P0002', 'NOT_FOUND',
  'con la lectura abierta, c2 sigue sin duplicar la sesión de T1'
);

select throws_ok(
  $$select public.create_practice_session(
      current_setting('fx.t1')::uuid, '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z',
      'No debe quedar', null, null, 'No debe quedar')$$,
  'P0002', 'NOT_FOUND',
  'con la lectura abierta, c2 sigue sin crear una sesión en T1'
);

reset role;

drop policy teams_select_member_simulada on teams;
drop policy events_select_member_simulada on events;
drop policy practice_plans_select_member_simulada on practice_plans;
drop policy practice_items_select_member_simulada on practice_items;

select results_eq(
  $$select tests.summary(current_setting('fx.e_t1')::uuid),
           tests.items(current_setting('fx.plan_t1')::uuid),
           tests.token(current_setting('fx.plan_t1')::uuid),
           tests.items(current_setting('fx.plan_done')::uuid)$$,
  $$values ('2026-10-06 16:00–17:15 · T1 entreno · scheduled · Sesión de T1 · ready',
            '1·sesion-t1-1·10 | 2·sesion-t1-2·15',
            current_setting('fx.u_t1')::timestamptz,
            '1·hecha-1·10')$$,
  'con la lectura abierta tampoco cambió nada de T1'
);

-- ── Editar datos ─────────────────────────────────────────────────────────────────────
-- Sobre la sesión de c1, que tiene dos ítems, focos y lugar. Primero c1b, pasando solo lo
-- obligatorio por nombre: lo que no llega se vacía, porque editar es dejar la sesión tal como
-- dice la llamada.
select tests.authenticate_as(current_setting('fx.c1b')::uuid);

select lives_ok(
  $$select set_config('fx.u7', public.update_practice_session(
      p_event => current_setting('fx.e_new')::uuid,
      p_expected_updated_at => current_setting('fx.u6')::timestamptz,
      p_starts_at => '2026-10-14T17:00:00Z',
      p_ends_at => '2026-10-14T18:00:00Z',
      p_title => 'Sesión editada')::text, true)$$,
  'c1b edita los datos de la sesión pasando solo horas y título, por nombre'
);

select results_eq(
  $$select e.starts_at, e.ends_at, e.location, e.status::text,
           pp.title, pp.primary_focus_id, pp.secondary_focus_id, pp.notes, pp.status,
           pp.updated_by, pp.updated_at
    from events as e
    join practice_plans as pp on pp.event_id = e.id
    where e.id = current_setting('fx.e_new')::uuid$$,
  $$values ('2026-10-14T17:00:00Z'::timestamptz, '2026-10-14T18:00:00Z'::timestamptz,
            null::text, 'scheduled',
            'Sesión editada', null::uuid, null::uuid, null::text, 'ready',
            current_setting('fx.c1b')::uuid, current_setting('fx.u7')::timestamptz)$$,
  'cambian las horas y el título; el lugar, los focos y las notas que no llegan quedan vacíos; el estado no cambia y la copia devuelta es la del plan'
);

select ok(
  current_setting('fx.u7')::timestamptz > current_setting('fx.u6')::timestamptz,
  'editar los datos avanza el updated_at del plan'
);

select is(
  tests.items(current_setting('fx.p_new')::uuid),
  '1·Ejercicio de A·12 | 2·Bloque C·20',
  'editar los datos no toca los ítems'
);

-- Lo que rechazan las tablas. El evento se cambia antes que el plan: cuando falla el plan,
-- las horas nuevas no deben quedar.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_new')::uuid, current_setting('fx.u7')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T16:00:00Z', 'No debe quedar')$$,
  '23514', null,
  'una sesión que no acaba después de empezar sale con el 23514 del check'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_new')::uuid, current_setting('fx.u7')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', '')$$,
  '23514', null,
  'un título vacío sale con el 23514 del check'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_new')::uuid, current_setting('fx.u7')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'No debe quedar',
      current_setting('fx.f_b')::uuid)$$,
  '23503', null,
  'un foco de otro club sale con el 23503 de la clave foránea'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_new')::uuid, current_setting('fx.u7')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'No debe quedar',
      current_setting('fx.f_tecnica')::uuid, current_setting('fx.f_tecnica')::uuid)$$,
  '23514', null,
  'el mismo foco dos veces sale con el 23514 del check'
);

select results_eq(
  $$select tests.summary(current_setting('fx.e_new')::uuid),
           tests.token(current_setting('fx.p_new')::uuid)$$,
  $$values ('2026-10-14 17:00–18:00 · ∅ · scheduled · Sesión editada · ready',
            current_setting('fx.u7')::timestamptz)$$,
  'tras los rechazos la sesión sigue como estaba: ni las horas ni la copia cambiaron'
);

-- Ahora c1, con todo.
select lives_ok(
  $$select set_config('fx.u8', public.update_practice_session(
      current_setting('fx.e_new')::uuid, current_setting('fx.u7')::timestamptz,
      '2026-10-20T16:00:00Z', '2026-10-20T17:15:00Z', 'Sesión completa',
      current_setting('fx.f_rebote')::uuid, current_setting('fx.f_tecnica')::uuid,
      'Pista 2', 'Notas nuevas')::text, true)$$,
  'c1 edita las horas, el lugar, el título, los focos y las notas'
);

select results_eq(
  $$select e.starts_at, e.ends_at, e.location,
           pp.title, pp.primary_focus_id, pp.secondary_focus_id, pp.notes,
           pp.updated_by, pp.updated_at
    from events as e
    join practice_plans as pp on pp.event_id = e.id
    where e.id = current_setting('fx.e_new')::uuid$$,
  $$values ('2026-10-20T16:00:00Z'::timestamptz, '2026-10-20T17:15:00Z'::timestamptz, 'Pista 2',
            'Sesión completa', current_setting('fx.f_rebote')::uuid,
            current_setting('fx.f_tecnica')::uuid, 'Notas nuevas',
            current_setting('fx.c1')::uuid, current_setting('fx.u8')::timestamptz)$$,
  'la sesión queda con todo lo nuevo, anota a c1 y devuelve la copia del plan'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_new')::uuid, current_setting('fx.u7')::timestamptz,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Copia antigua')$$,
  'P0001', 'STALE_COPY',
  'editar con la copia anterior da STALE_COPY'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_new')::uuid, null,
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Sin copia')$$,
  'P0001', 'STALE_COPY',
  'editar sin copia esperada también es STALE_COPY'
);

-- La copia es una sola para los datos y para los ítems: quien tiene abierto el constructor con
-- la copia de antes de la edición tampoco guarda.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.p_new')::uuid, current_setting('fx.u7')::timestamptz,
      jsonb_build_array(tests.item('No debe quedar')))$$,
  'P0001', 'STALE_COPY',
  'guardar los ítems con la copia anterior a la edición también da STALE_COPY'
);

select results_eq(
  $$select tests.summary(current_setting('fx.e_new')::uuid),
           tests.items(current_setting('fx.p_new')::uuid),
           tests.token(current_setting('fx.p_new')::uuid)$$,
  $$values ('2026-10-20 16:00–17:15 · Pista 2 · scheduled · Sesión completa · ready',
            '1·Ejercicio de A·12 | 2·Bloque C·20',
            current_setting('fx.u8')::timestamptz)$$,
  'tras los STALE_COPY la sesión, sus ítems y su copia siguen como estaban'
);

-- ── Duplicar ─────────────────────────────────────────────────────────────────────────
-- La sesión de c1 dura 75 minutos y uno de sus dos ítems está completado. Antes de duplicarla
-- se guardan en orden descendente de id, cada uno con su fase, su ejercicio y sus notas: así el
-- orden de la sesión no coincide con el de los ids, y una copia que no siguiera `sort` saldría
-- al revés.
select lives_ok(
  $$select set_config('fx.u9', public.save_practice_items(
      current_setting('fx.p_new')::uuid, current_setting('fx.u8')::timestamptz,
      (select jsonb_agg(
         tests.item(pi.title_override, pi.minutes::int, pi.id, jsonb_build_object(
           'drill_id', current_setting('fx.d_a'),
           'phase', 'Fase de ' || pi.title_override,
           'notes', 'Notas de ' || pi.title_override))
         order by pi.id desc)
       from practice_items as pi
       where pi.plan_id = current_setting('fx.p_new')::uuid))::text, true)$$,
  'c1 guarda los dos ítems en orden descendente de id, con fase, ejercicio y notas'
);

do $$
begin
  perform set_config(
    'fx.items_src', tests.items(current_setting('fx.p_new')::uuid), true);
end
$$;

select lives_ok(
  $$select set_config('fx.e_dup', public.duplicate_practice(
      current_setting('fx.e_new')::uuid, '2026-10-27T17:00:00Z')::text, true)$$,
  'c1 duplica su sesión para la semana siguiente'
);

select results_eq(
  $$select organization_id, team_id, kind::text, status::text, starts_at, ends_at, location,
           id <> current_setting('fx.e_new')::uuid
    from events where id = current_setting('fx.e_dup')::uuid$$,
  $$values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            'practice', 'scheduled', '2026-10-27T17:00:00Z'::timestamptz,
            '2026-10-27T18:15:00Z'::timestamptz, 'Pista 2', true)$$,
  'el evento nuevo es un entreno programado de T1, con la misma duración y el mismo lugar'
);

select results_eq(
  $$select organization_id, team_id, title, primary_focus_id, secondary_focus_id, notes,
           status, created_by, updated_by
    from practice_plans where event_id = current_setting('fx.e_dup')::uuid$$,
  $$values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            'Sesión completa', current_setting('fx.f_rebote')::uuid,
            current_setting('fx.f_tecnica')::uuid, 'Notas nuevas',
            'ready', current_setting('fx.c1')::uuid, current_setting('fx.c1')::uuid)$$,
  'su plan lleva el mismo título, focos y notas, a nombre de c1, y queda en ready porque tiene ítems'
);

select results_eq(
  $$select sort, phase, drill_id, title_override, minutes, notes
    from practice_items
    where plan_id = tests.plan_of(current_setting('fx.e_dup')::uuid) order by sort$$,
  $$select sort, phase, drill_id, title_override, minutes, notes
    from practice_items
    where plan_id = current_setting('fx.p_new')::uuid order by sort$$,
  'los ítems de la copia son los del origen, en el mismo orden'
);

select results_eq(
  $$select
      (select count(*) from practice_items
       where plan_id = current_setting('fx.p_new')::uuid
         and completed and actual_minutes = 9)::int,
      (select count(*) from practice_items
       where plan_id = tests.plan_of(current_setting('fx.e_dup')::uuid))::int,
      (select count(*) from practice_items
       where plan_id = tests.plan_of(current_setting('fx.e_dup')::uuid)
         and (completed is not null or actual_minutes is not null))::int$$,
  $$values (1, 2, 0)$$,
  'el origen tiene un ítem completado; en la copia ninguno lleva completed ni actual_minutes'
);

select results_eq(
  $$select tests.summary(current_setting('fx.e_new')::uuid),
           tests.items(current_setting('fx.p_new')::uuid),
           tests.token(current_setting('fx.p_new')::uuid)$$,
  $$values ('2026-10-20 16:00–17:15 · Pista 2 · scheduled · Sesión completa · ready',
            current_setting('fx.items_src'),
            current_setting('fx.u9')::timestamptz)$$,
  'el origen no cambia: ni la sesión, ni sus ítems, ni su copia'
);

-- Desde una sesión cerrada también: se lee, no se toca.
select lives_ok(
  $$select set_config('fx.e_dup_done', public.duplicate_practice(
      current_setting('fx.e_t1_done')::uuid, '2026-10-28T16:00:00Z')::text, true)$$,
  'c1 duplica un entreno hecho'
);

select results_eq(
  $$select tests.summary(current_setting('fx.e_dup_done')::uuid),
           tests.items(tests.plan_of(current_setting('fx.e_dup_done')::uuid)),
           (select count(*) from practice_items
            where plan_id = tests.plan_of(current_setting('fx.e_dup_done')::uuid)
              and (completed is not null or actual_minutes is not null))::int$$,
  $$values ('2026-10-28 16:00–17:15 · T1 hecho · scheduled · Sesión hecha · ready',
            '1·hecha-1·10', 0)$$,
  'la copia de un entreno hecho nace programada, con el plan en ready y sin nada registrado'
);

select lives_ok(
  $$select set_config('fx.e_dup_cancelled', public.duplicate_practice(
      current_setting('fx.e_t1_cancelled')::uuid, '2026-10-29T16:00:00Z')::text, true)$$,
  'c1 duplica un entreno cancelado'
);

select is(
  tests.summary(current_setting('fx.e_dup_cancelled')::uuid),
  '2026-10-29 16:00–17:15 · T1 cancelado · scheduled · Sesión cancelada · ready',
  'la copia de un entreno cancelado nace programada'
);

select results_eq(
  $$select tests.summary(current_setting('fx.e_t1_done')::uuid),
           tests.items(current_setting('fx.plan_done')::uuid),
           tests.token(current_setting('fx.plan_done')::uuid),
           (select count(*) from practice_items
            where plan_id = current_setting('fx.plan_done')::uuid
              and completed and actual_minutes = 12)::int,
           tests.summary(current_setting('fx.e_t1_cancelled')::uuid),
           tests.token(current_setting('fx.plan_cancelled')::uuid)$$,
  $$values ('2026-09-29 16:00–17:15 · T1 hecho · done · Sesión hecha · done',
            '1·hecha-1·10',
            current_setting('fx.u_done')::timestamptz,
            1,
            '2026-10-01 16:00–17:15 · T1 cancelado · cancelled · Sesión cancelada · ready',
            current_setting('fx.u_cancelled')::timestamptz)$$,
  'los dos orígenes cerrados siguen cerrados, con sus ítems, lo registrado y su copia'
);

-- Sin ítems, el plan de la copia se queda en borrador. La sesión mínima la canceló c1 arriba.
select lives_ok(
  $$select set_config('fx.e_dup_min', public.duplicate_practice(
      current_setting('fx.e_min')::uuid, '2026-10-22T16:00:00Z')::text, true)$$,
  'c1 duplica una sesión sin ítems'
);

select results_eq(
  $$select tests.summary(current_setting('fx.e_dup_min')::uuid),
           tests.items(tests.plan_of(current_setting('fx.e_dup_min')::uuid))$$,
  $$values ('2026-10-22 16:00–17:00 · ∅ · scheduled · Sesión mínima · draft', '')$$,
  'la copia de una sesión sin ítems queda sin ítems y en borrador'
);

-- La duración es tiempo real, no días de calendario. «T1 largo» dura 26 horas y se duplica
-- a través del cambio de hora del 25 de octubre, con la sesión de base de datos en la zona de
-- Madrid: sumar «1 día y 2 horas» daría una hora de más.
set local timezone = 'Europe/Madrid';

select lives_ok(
  $$select set_config('fx.e_dup_largo', public.duplicate_practice(
      current_setting('fx.e_t1_largo')::uuid, '2026-10-24T16:00:00Z')::text, true)$$,
  'c1 duplica un entreno de 26 horas a través del cambio de hora'
);

select is(
  (select ends_at from events where id = current_setting('fx.e_dup_largo')::uuid),
  '2026-10-25T18:00:00Z'::timestamptz,
  'la copia dura las mismas 26 horas, sea cual sea la zona horaria de la sesión'
);

set local timezone = 'UTC';

-- La copia es del equipo del origen: adminA, que gestiona T1 y T2, duplica la de T2.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select lives_ok(
  $$select set_config('fx.e_dup_t2', public.duplicate_practice(
      current_setting('fx.e_t2')::uuid, '2026-10-13T15:00:00Z')::text, true)$$,
  'adminA duplica la sesión de T2'
);

select results_eq(
  $$select e.team_id, pp.team_id, pp.created_by, tests.items(pp.id)
    from events as e
    join practice_plans as pp on pp.event_id = e.id
    where e.id = current_setting('fx.e_dup_t2')::uuid$$,
  $$values (current_setting('fx.t2')::uuid, current_setting('fx.t2')::uuid,
            current_setting('fx.admin_a')::uuid, '1·sesion-t2-1·10 | 2·sesion-t2-2·15')$$,
  'la copia es de T2, a nombre de adminA, con los ítems que guardó c2'
);

-- Quien no gestiona el equipo no duplica, y lo que no es una sesión no se duplica.
do $$
begin
  perform set_config('fx.n_events', tests.event_count()::text, true);
end
$$;

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select throws_ok(
  $$select public.duplicate_practice(
      current_setting('fx.e_t1')::uuid, '2026-11-03T16:00:00Z')$$,
  'P0002', 'NOT_FOUND',
  'c2 no duplica la sesión de T1'
);

select throws_ok(
  $$select public.duplicate_practice(current_setting('fx.e_t1')::uuid, null)$$,
  'P0002', 'NOT_FOUND',
  'c2 sin fecha sobre la sesión de T1: NOT_FOUND, no INVALID'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select throws_ok(
  $$select public.duplicate_practice(
      current_setting('fx.e_t1')::uuid, '2026-11-03T16:00:00Z')$$,
  'P0002', 'NOT_FOUND',
  'coachB no duplica una sesión de A'
);

select tests.authenticate_as(current_setting('fx.jugador')::uuid);

select throws_ok(
  $$select public.duplicate_practice(
      current_setting('fx.e_t1')::uuid, '2026-11-03T16:00:00Z')$$,
  'P0002', 'NOT_FOUND',
  'una cuenta de jugador no duplica la sesión de su equipo'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$select public.duplicate_practice(
      current_setting('fx.e_t1_game')::uuid, '2026-11-03T16:00:00Z')$$,
  'P0002', 'NOT_FOUND',
  'c1 no duplica un partido de su equipo'
);

select throws_ok(
  $$select public.duplicate_practice(
      current_setting('fx.e_t1_libre')::uuid, '2026-11-03T16:00:00Z')$$,
  'P0002', 'NOT_FOUND',
  'c1 no duplica un entreno sin plan'
);

select throws_ok(
  $$select public.duplicate_practice(gen_random_uuid(), '2026-11-03T16:00:00Z')$$,
  'P0002', 'NOT_FOUND',
  'un evento que no existe da NOT_FOUND'
);

select throws_ok(
  $$select public.duplicate_practice(current_setting('fx.e_t1')::uuid, null)$$,
  '22023', 'INVALID',
  'c1 sin fecha de inicio: INVALID'
);

select is(
  tests.event_count(),
  current_setting('fx.n_events')::int,
  'ninguna de las duplicaciones rechazadas deja un evento'
);

-- ── anon ─────────────────────────────────────────────────────────────────────────────
-- Sin sesión no se ejecuta ninguna: falla el privilegio, antes de entrar en la función.
select tests.clear_authentication();

select throws_ok(
  $$select public.create_practice_session(
      current_setting('fx.t1')::uuid, '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Anon')$$,
  '42501', 'permission denied for function create_practice_session',
  'anon no ejecuta create_practice_session'
);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_t1')::uuid, now(),
      '2026-11-03T16:00:00Z', '2026-11-03T17:00:00Z', 'Anon')$$,
  '42501', 'permission denied for function update_practice_session',
  'anon no ejecuta update_practice_session'
);

select throws_ok(
  $$select public.save_practice_items(current_setting('fx.plan_t1')::uuid, now(), '[]')$$,
  '42501', 'permission denied for function save_practice_items',
  'anon no ejecuta save_practice_items'
);

select throws_ok(
  $$select public.duplicate_practice(
      current_setting('fx.e_t1')::uuid, '2026-11-03T16:00:00Z')$$,
  '42501', 'permission denied for function duplicate_practice',
  'anon no ejecuta duplicate_practice'
);

reset role;

-- ── Catálogo: forma y privilegios ────────────────────────────────────────────────────
-- Las cuatro son plpgsql `security invoker` con `search_path` vacío, con la firma del contrato
-- (los opcionales al final, a null por defecto: los tipos generados los marcan opcionales).
select results_eq(
  $$select p.proname::text collate "default", p.provolatile::text collate "default",
           p.prosecdef, l.lanname::text collate "default",
           p.proconfig = array['search_path=""'],
           pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
    from pg_proc as p
    join pg_language as l on l.oid = p.prolang
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('create_practice_session', 'update_practice_session',
                        'save_practice_items', 'duplicate_practice')
    order by p.proname$$,
  $$values
      ('create_practice_session', 'v', false, 'plpgsql', true,
       'p_team uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_title text, p_primary_focus uuid DEFAULT NULL::uuid, p_secondary_focus uuid DEFAULT NULL::uuid, p_location text DEFAULT NULL::text',
       'uuid'),
      ('duplicate_practice', 'v', false, 'plpgsql', true,
       'p_event uuid, p_starts_at timestamp with time zone',
       'uuid'),
      ('save_practice_items', 'v', false, 'plpgsql', true,
       'p_plan uuid, p_expected_updated_at timestamp with time zone, p_items jsonb',
       'timestamp with time zone'),
      ('update_practice_session', 'v', false, 'plpgsql', true,
       'p_event uuid, p_expected_updated_at timestamp with time zone, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_title text, p_primary_focus uuid DEFAULT NULL::uuid, p_secondary_focus uuid DEFAULT NULL::uuid, p_location text DEFAULT NULL::text, p_notes text DEFAULT NULL::text',
       'timestamp with time zone')$$,
  'las cuatro funciones son plpgsql security invoker con search_path vacío y la firma del contrato'
);

-- Guardar es de una sesión de usuario: la clave de servicio se salta RLS y escribiría en
-- cualquier equipo.
select results_eq(
  $$select p.proname::text collate "default",
           has_function_privilege('public', p.oid, 'execute'),
           has_function_privilege('anon', p.oid, 'execute'),
           has_function_privilege('service_role', p.oid, 'execute'),
           has_function_privilege('authenticated', p.oid, 'execute')
    from pg_proc as p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('create_practice_session', 'update_practice_session',
                        'save_practice_items', 'duplicate_practice')
    order by p.proname$$,
  $$values
      ('create_practice_session', false, false, false, true),
      ('duplicate_practice', false, false, false, true),
      ('save_practice_items', false, false, false, true),
      ('update_practice_session', false, false, false, true)$$,
  'las cuatro las ejecuta authenticated, y no PUBLIC, anon ni service_role'
);

select * from finish();

rollback;
