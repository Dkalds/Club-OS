-- El calendario del club: pistas, horarios semanales y el registro de cambios
-- (`20270316000100_calendar.sql`).
--
-- Qué se verifica aquí:
--   · Pistas (`venues`): las escribe la dirección de su club y nadie más (quien entrena, un
--     jugador, la dirección de OTRO club, `anon`); las lee cualquier miembro del club. El
--     nombre: de 1 a 60, sin repetir en el club (sin distinguir mayúsculas ni espacios
--     alrededor); el mismo nombre en otro club vale. Una pista con horarios no se borra.
--   · El vínculo de un evento con su pista (`events.venue_id`): lo pone la base a partir del
--     lugar, lo escriba quien lo escriba, y solo dentro del club. Nadie escribe `venue_id` ni
--     `schedule_id` por la API. Crear una pista vincula los eventos que ya tenían ese lugar;
--     cambiarle el nombre se lo cambia a sus eventos programados que aún no han empezado, sin
--     dejar rastro en el registro de cambios; borrarla deja el lugar como texto.
--   · Horarios (`team_schedules`): nadie los escribe por la tabla. Los leen la dirección y el
--     cuerpo técnico de ese equipo.
--   · `create_team_schedule`: cuántos entrenamientos crea y cómo nacen; la hora del reloj del
--     club a cada lado del cambio de hora; sin duplicar; sin pasar del final de la temporada;
--     desde el inicio de una temporada que aún no ha empezado.
--   · `update_team_schedule`: qué mueve (los que siguen en su sitio) y qué no (el movido a
--     mano, el cancelado, el hecho, otro horario, otro equipo), y lo que registra.
--   · `delete_team_schedule`: qué borra (los que nadie ha tocado) y qué se queda.
--   · Las tres: NOT_FOUND para quien no dirige el club (también el entrenador principal del
--     equipo), antes que INVALID (C26); el horario repetido es un 23505; `anon` → 42501.
--   · El registro de cambios (`event_changes`): qué se registra (hora, lugar, cancelación),
--     qué no (guardar sin cambios, pasar a hecho, un evento que ya no está programado, lo que
--     se escribe sin usuario), que nadie lo escribe por la API y quién lo lee.
--   · El club: nada del club B cambia con todo lo anterior.
--   · Al final, lo que encontraron estos tests en la primera versión de la migración, ya
--     arreglado (ver «Sesiones tocadas a mano»).
--
-- El tiempo: las funciones miran `now()`, que dentro de una transacción no se mueve. Las
-- temporadas y las fechas son relativas a hoy (el día del club, en `Europe/Madrid`) y lo que se
-- espera se calcula en SQL, sin fechas escritas a mano que caduquen.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*` vienen
-- de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al final. Los
-- datos son ficticios y solo de este test.
begin;

select plan(202);

-- ── Ayudas (solo existen en esta transacción) ────────────────────────────────────────
-- Ejecuta una sentencia como quien llama y devuelve cómo acabó: «ok N» con las filas que tocó
-- o su SQLSTATE si falla. Un 42501 dice además quién lo paró: la política de la tabla (hay
-- privilegio, pero la fila no pasa) o la falta de privilegio.
create function tests.outcome(code text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_rows bigint;
begin
  execute outcome.code;
  get diagnostics v_rows = row_count;
  return 'ok ' || v_rows;
exception when others then
  return sqlstate || case
    when sqlstate <> '42501' then ''
    when sqlerrm like 'new row violates row-level security policy%' then ' política'
    else ' privilegio'
  end;
end;
$$;

-- Tras `reset role` sigue puesto el usuario de la última sesión (`auth.uid()` lee los claims,
-- no el rol). Esto lo quita: lo que se escriba después es de nadie, como lo que escribe el seed.
create function tests.no_user()
returns void
language sql
set search_path = ''
as $$
  select set_config('request.jwt.claims', '', true);
$$;

-- Hoy, en el reloj del club.
create function tests.today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Madrid')::date;
$$;

-- Un instante, en el reloj del club.
create function tests.local(ts timestamptz)
returns timestamp
language sql
immutable
set search_path = ''
as $$
  select local.ts at time zone 'Europe/Madrid';
$$;

-- La enésima vez que cae ese día de la semana a esa hora del club, contando desde mañana: es
-- siempre futuro, se ejecute el test a la hora que se ejecute.
create function tests.slot(p_weekday int, p_time time, p_n int)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((tests.today() + i) + p_time) at time zone 'Europe/Madrid'
  from generate_series(1, 7 * p_n) as i
  where extract(isodow from tests.today() + i)::int = p_weekday
  order by i
  offset p_n - 1
  limit 1;
$$;

-- Cuántos entrenamientos tiene que crear un horario: los días de esa semana entre hoy (o el
-- inicio de la temporada, si es posterior) y el final de la temporada cuya hora aún no ha
-- pasado. Recorre los días uno a uno; la migración salta de siete en siete.
create function tests.expected_slots(p_from date, p_until date, p_weekday int, p_time time)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::int
  from generate_series(0, p_until - greatest(p_from, tests.today())) as i
  cross join lateral (select greatest(p_from, tests.today()) + i as d) as x
  where extract(isodow from x.d)::int = p_weekday
    and ((x.d + p_time) at time zone 'Europe/Madrid') > now();
$$;

-- El `updated_at` vigente del plan de una sesión, lo vea o no quien llama: es la copia que
-- pide `update_practice_session`.
create function tests.token(p_event uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  select pp.updated_at from public.practice_plans as pp where pp.event_id = p_event;
$$;

-- El registro de cambios «visto hasta ahora»: `tests.mark_changes()` apunta todas las filas
-- que hay y `tests.new_changes()` devuelve las que han llegado después a los dos clubes de
-- este test, las vea o no quien llama. Así cada paso comprueba solo lo que él ha dejado.
create table tests.seen_changes (id uuid primary key);

create function tests.mark_changes()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into tests.seen_changes (id)
  select c.id from public.event_changes as c
  on conflict do nothing;
$$;

create function tests.new_changes()
returns table (event_id uuid, what text, old_starts_at timestamptz, old_ends_at timestamptz, old_location text)
language sql
security definer
set search_path = ''
as $$
  select c.event_id, c.what, c.old_starts_at, c.old_ends_at, c.old_location
  from public.event_changes as c
  where c.id not in (select s.id from tests.seen_changes as s)
    and c.organization_id in (current_setting('fx.club_a')::uuid, current_setting('fx.club_b')::uuid);
$$;

-- Una huella de todo lo del club B en las tablas que toca esta migración, lo vea o no quien
-- llama: al final tiene que ser la misma que al principio.
create function tests.snapshot_b()
returns text
language sql
security definer
set search_path = ''
as $$
  select md5(concat_ws('#',
    (select string_agg(x::text, ',' order by x.id) from public.venues as x
      where x.organization_id = current_setting('fx.club_b')::uuid),
    (select string_agg(x::text, ',' order by x.id) from public.team_schedules as x
      where x.organization_id = current_setting('fx.club_b')::uuid),
    (select string_agg(x::text, ',' order by x.id) from public.events as x
      where x.organization_id = current_setting('fx.club_b')::uuid),
    (select string_agg(x::text, ',' order by x.id) from public.event_changes as x
      where x.organization_id = current_setting('fx.club_b')::uuid),
    (select string_agg(x::text, ',' order by x.id) from public.practice_plans as x
      where x.organization_id = current_setting('fx.club_b')::uuid)
  ));
$$;

-- Los intentos de escribir en las tres tablas del club A, y en las dos columnas de `events`
-- que nadie tiene concedidas.
create function tests.venue_attempts()
returns table (n int, op text, code text)
language sql
set search_path = ''
as $$
  values
    (1, 'insert',
      $sql$insert into public.venues (organization_id, name)
           values (current_setting('fx.club_a')::uuid, 'Pista intrusa')$sql$),
    (2, 'update',
      $sql$update public.venues set name = name || ' bis'
           where organization_id = current_setting('fx.club_a')::uuid$sql$),
    (3, 'delete',
      $sql$delete from public.venues
           where organization_id = current_setting('fx.club_a')::uuid$sql$);
$$;

create function tests.schedule_attempts()
returns table (n int, op text, code text)
language sql
set search_path = ''
as $$
  values
    (1, 'insert',
      $sql$insert into public.team_schedules (organization_id, team_id, weekday, start_time, duration_minutes)
           values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 3, '10:00', 60)$sql$),
    (2, 'update',
      $sql$update public.team_schedules set duration_minutes = 30
           where organization_id = current_setting('fx.club_a')::uuid$sql$),
    (3, 'delete',
      $sql$delete from public.team_schedules
           where organization_id = current_setting('fx.club_a')::uuid$sql$);
$$;

create function tests.change_attempts()
returns table (n int, op text, code text)
language sql
set search_path = ''
as $$
  values
    (1, 'insert',
      $sql$insert into public.event_changes
             (organization_id, event_id, team_id, what, old_starts_at, old_ends_at)
           values (current_setting('fx.club_a')::uuid, current_setting('fx.e_none')::uuid,
                   current_setting('fx.t1')::uuid, 'time', now(), now() + interval '1 hour')$sql$),
    (2, 'update',
      $sql$update public.event_changes set what = 'cancelled'
           where organization_id = current_setting('fx.club_a')::uuid$sql$),
    (3, 'delete',
      $sql$delete from public.event_changes
           where organization_id = current_setting('fx.club_a')::uuid$sql$);
$$;

create function tests.event_column_attempts()
returns table (n int, op text, code text)
language sql
set search_path = ''
as $$
  values
    (1, 'update venue_id',
      $sql$update public.events set venue_id = current_setting('fx.v1')::uuid
           where id = current_setting('fx.e_none')::uuid$sql$),
    (2, 'update schedule_id',
      $sql$update public.events set schedule_id = null
           where id = current_setting('fx.e_none')::uuid$sql$),
    (3, 'insert venue_id',
      $sql$insert into public.events (organization_id, team_id, kind, starts_at, ends_at, venue_id)
           values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
                   tests.slot(3, '08:00', 1), tests.slot(3, '09:00', 1), current_setting('fx.v1')::uuid)$sql$),
    (4, 'insert schedule_id',
      $sql$insert into public.events (organization_id, team_id, kind, starts_at, ends_at, schedule_id)
           values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid, 'practice',
                   tests.slot(3, '08:00', 1), tests.slot(3, '09:00', 1), gen_random_uuid())$sql$);
$$;

-- ── Fixtures (como postgres, sin usuario) ────────────────────────────────────────────
-- Club A (Europe/Madrid). Temporadas, todas relativas a hoy:
--   `s_a`    actual: de hace 30 días a dentro de 200.
--   `s_long` 365 días (de hace 30 a dentro de 335): cruza al menos un cambio de hora.
--   `s_next` aún no ha empezado: de dentro de 20 días a dentro de 150.
--   `s_past` ya acabó: terminó hace 10 días.
--   `s_mini` dos semanas (de hace 5 días a dentro de 9): para llegar al tope de horarios.
-- Equipos:
--   T1 «Alevín A»   (s_a):    entrenador principal c1; jugador p1 (su cuenta es `jugador`).
--   T2 «Benjamín A» (s_a):    entrenador principal c2.
--   T3 «Cadete A»   (s_long), T4 «Infantil A» (s_next), T5 «Viejo A» (s_past) y T6 «Mini A»
--   (s_mini): sin cuerpo técnico; solo los toca la dirección.
--   T7 «Junior A»   (s_a):    entrenador principal c3. Solo para «Sesiones tocadas a mano».
-- adminA dirige el club. Las pistas de A las crea la dirección en los tests.
--
-- Club B: TB «Infantil B», con cb. Lo dirige adminB. Tiene de todo, para la huella del final:
--   dos pistas («Pabellón 1», el mismo nombre que tendrá una de A, y «Solo de B»), un horario,
--   un entrenamiento de ese horario en su pista, otro en «Pista Nueva» (un lugar que en B no
--   es una pista y en A lo será), sus planes y un cambio registrado.
--
-- Los ids quedan en ajustes `fx.*` de la transacción.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  today  constant date := tests.today();

  u_admin uuid := tests.create_user('admin@teamschedules.pgtap.test');
  u_c1    uuid := tests.create_user('c1@teamschedules.pgtap.test');
  u_c2    uuid := tests.create_user('c2@teamschedules.pgtap.test');
  u_c3    uuid := tests.create_user('c3@teamschedules.pgtap.test');
  u_jugad uuid := tests.create_user('jugador@teamschedules.pgtap.test');
  u_ab    uuid := tests.create_user('admin-b@teamschedules.pgtap.test');
  u_cb    uuid := tests.create_user('coach-b@teamschedules.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_c2 constant uuid := gen_random_uuid();
  p_c3 constant uuid := gen_random_uuid();
  p_p1 constant uuid := gen_random_uuid();
  p_cb constant uuid := gen_random_uuid();

  s_a    constant uuid := gen_random_uuid();
  s_long constant uuid := gen_random_uuid();
  s_next constant uuid := gen_random_uuid();
  s_past constant uuid := gen_random_uuid();
  s_mini constant uuid := gen_random_uuid();
  s_b    constant uuid := gen_random_uuid();

  cat_a constant uuid := gen_random_uuid();
  cat_b constant uuid := gen_random_uuid();
  fa1   constant uuid := gen_random_uuid();

  t1 constant uuid := gen_random_uuid();
  t2 constant uuid := gen_random_uuid();
  t3 constant uuid := gen_random_uuid();
  t4 constant uuid := gen_random_uuid();
  t5 constant uuid := gen_random_uuid();
  t6 constant uuid := gen_random_uuid();
  t7 constant uuid := gen_random_uuid();
  tb constant uuid := gen_random_uuid();

  vb1 constant uuid := gen_random_uuid();
  vb2 constant uuid := gen_random_uuid();
  sb  constant uuid := gen_random_uuid();
  eb1 constant uuid := gen_random_uuid();
  eb2 constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name, timezone) values
    (club_a, 'club-a', 'Club A', 'Europe/Madrid'),
    (club_b, 'club-b', 'Club B', 'Europe/Madrid');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_c2, club_a, 'c2', 'Ficticio', null),
    (p_c3, club_a, 'c3', 'Ficticia', null),
    (p_p1, club_a, 'p1', 'Ficticio', 2015),
    (p_cb, club_b, 'cb', 'Ficticio', null);

  insert into memberships (organization_id, user_id, role, person_id, status) values
    (club_a, u_admin, 'admin',  null, 'active'),
    (club_a, u_c1,    'coach',  p_c1, 'active'),
    (club_a, u_c2,    'coach',  p_c2, 'active'),
    (club_a, u_c3,    'coach',  p_c3, 'active'),
    (club_a, u_jugad, 'player', p_p1, 'active'),
    (club_b, u_ab,    'admin',  null, 'active'),
    (club_b, u_cb,    'coach',  p_cb, 'active');

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (s_a,    club_a, 'Actual',      today - 30,  today + 200, true),
    (s_long, club_a, 'Larga',       today - 30,  today + 335, false),
    (s_next, club_a, 'Siguiente',   today + 20,  today + 150, false),
    (s_past, club_a, 'Pasada',      today - 400, today - 10,  false),
    (s_mini, club_a, 'Dos semanas', today - 5,   today + 9,   false),
    (s_b,    club_b, 'Actual',      today - 30,  today + 200, true);

  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_a, club_a, 'Formación', 'U12', 10),
    (cat_b, club_b, 'Formación', 'U14', 10);

  insert into focus_areas (id, organization_id, slug, name, sort) values
    (fa1, club_a, 'tiro', 'Tiro', 10);

  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, club_a, s_a,    cat_a, 'Alevín A'),
    (t2, club_a, s_a,    cat_a, 'Benjamín A'),
    (t3, club_a, s_long, cat_a, 'Cadete A'),
    (t4, club_a, s_next, cat_a, 'Infantil A'),
    (t5, club_a, s_past, cat_a, 'Viejo A'),
    (t6, club_a, s_mini, cat_a, 'Mini A'),
    (t7, club_a, s_a,    cat_a, 'Junior A'),
    (tb, club_b, s_b,    cat_b, 'Infantil B');

  insert into team_staff (organization_id, team_id, person_id, staff_role) values
    (club_a, t1, p_c1, 'head_coach'),
    (club_a, t2, p_c2, 'head_coach'),
    (club_a, t7, p_c3, 'head_coach'),
    (club_b, tb, p_cb, 'head_coach');

  insert into team_players (organization_id, team_id, person_id, jersey_number) values
    (club_a, t1, p_p1, 4);

  -- El club B, entero.
  insert into venues (id, organization_id, name) values
    (vb1, club_b, 'Pabellón 1'),
    (vb2, club_b, 'Solo de B');

  insert into team_schedules (id, organization_id, team_id, weekday, start_time, duration_minutes, venue_id)
  values (sb, club_b, tb, 2, '18:00', 75, vb1);

  insert into events (id, organization_id, team_id, kind, starts_at, ends_at, location, schedule_id) values
    (eb1, club_b, tb, 'practice', tests.slot(2, '18:00', 2),
      tests.slot(2, '18:00', 2) + interval '75 minutes', 'Pabellón 1', sb),
    (eb2, club_b, tb, 'practice', tests.slot(4, '18:00', 2),
      tests.slot(4, '18:00', 2) + interval '60 minutes', 'Pista Nueva', null);

  insert into practice_plans (organization_id, team_id, event_id, title, created_by) values
    (club_b, tb, eb1, 'Entrenamiento', u_cb),
    (club_b, tb, eb2, 'Plan de TB', u_cb);

  insert into event_changes (organization_id, event_id, team_id, what, old_starts_at, old_ends_at, old_location)
  values (club_b, eb1, tb, 'time', tests.slot(2, '17:00', 2),
          tests.slot(2, '17:00', 2) + interval '75 minutes', 'Pabellón 1');

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin', u_admin::text, true);
  perform set_config('fx.c1',    u_c1::text,    true);
  perform set_config('fx.c2',    u_c2::text,    true);
  perform set_config('fx.c3',    u_c3::text,    true);
  perform set_config('fx.jugad', u_jugad::text, true);
  perform set_config('fx.ab',    u_ab::text,    true);
  perform set_config('fx.cb',    u_cb::text,    true);
  perform set_config('fx.fa1', fa1::text, true);
  perform set_config('fx.t1', t1::text, true);
  perform set_config('fx.t2', t2::text, true);
  perform set_config('fx.t3', t3::text, true);
  perform set_config('fx.t4', t4::text, true);
  perform set_config('fx.t5', t5::text, true);
  perform set_config('fx.t6', t6::text, true);
  perform set_config('fx.t7', t7::text, true);
  perform set_config('fx.tb', tb::text, true);
  perform set_config('fx.vb1', vb1::text, true);
  perform set_config('fx.vb2', vb2::text, true);
  perform set_config('fx.sb',  sb::text,  true);
  perform set_config('fx.eb1', eb1::text, true);
  perform set_config('fx.eb2', eb2::text, true);

  perform set_config('fx.before_b', tests.snapshot_b(), true);
end
$$;

-- El cambio de B que hay en los fixtures ya está visto.
select tests.mark_changes();

-- ── En el catálogo ───────────────────────────────────────────────────────────────────
select results_eq(
  $$select c.relname::text collate "default", c.relrowsecurity
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('venues', 'team_schedules', 'event_changes')
    order by 1$$,
  $$values ('event_changes', true), ('team_schedules', true), ('venues', true)$$,
  'las tres tablas tienen RLS activado'
);

-- Las tres son `security definer`: escriben `team_schedules` y `events.schedule_id`, que nadie
-- tiene concedidas, y la última borra eventos.
select results_eq(
  $$select f.proname::text collate "default", f.prosecdef
    from pg_proc as f
    where f.pronamespace = 'public'::regnamespace
      and f.proname in ('create_team_schedule', 'update_team_schedule', 'delete_team_schedule')
      and f.proconfig = array['search_path=""']
    order by 1$$,
  $$values ('create_team_schedule', true), ('delete_team_schedule', true),
           ('update_team_schedule', true)$$,
  'las tres funciones de los horarios son security definer con search_path vacío'
);

select results_eq(
  $$select count(*)::int from pg_proc as f
    where f.pronamespace = 'public'::regnamespace
      and f.proname in ('create_team_schedule', 'update_team_schedule', 'delete_team_schedule')
      and has_function_privilege('authenticated', f.oid, 'execute')$$,
  array[3],
  'authenticated ejecuta las tres'
);

select is_empty(
  $$select f.proname::text, r.rol
    from pg_proc as f
    cross join unnest(array['anon', 'service_role']) as r (rol)
    where f.pronamespace = 'public'::regnamespace
      and f.proname in ('create_team_schedule', 'update_team_schedule', 'delete_team_schedule')
      and has_function_privilege(r.rol, f.oid, 'execute')$$,
  'ni anon ni service_role ejecutan ninguna'
);

-- Las privadas: las dos que usan las funciones y las tres de los triggers. Nadie las llama
-- por su cuenta; saltarían la comprobación de quién dirige.
select results_eq(
  $$select f.proname::text collate "default", f.prosecdef,
           has_function_privilege('authenticated', f.oid, 'execute')
             or has_function_privilege('anon', f.oid, 'execute')
    from pg_proc as f
    where f.pronamespace = 'private'::regnamespace
      and f.proname in ('generate_schedule_practices', 'check_schedule_input',
                        'link_event_venue', 'sync_venue_events', 'log_event_change')
      and f.proconfig = array['search_path=""']
    order by 1$$,
  $$values ('check_schedule_input', true, false), ('generate_schedule_practices', true, false),
           ('link_event_venue', true, false), ('log_event_change', true, false),
           ('sync_venue_events', true, false)$$,
  'las cinco privadas son security definer y ni authenticated ni anon las ejecutan'
);

-- ── Pistas: quién las escribe y quién las lee ────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin')::uuid);

-- «Pabellón 1» ya existe en el club B: el nombre es único por club, no en toda la base.
select lives_ok(
  $$with nueva as (
      insert into venues (organization_id, name)
      values (current_setting('fx.club_a')::uuid, 'Pabellón 1') returning id
    ) select set_config('fx.v1', (select id::text from nueva), true)$$,
  'la dirección crea una pista, con el mismo nombre que una de otro club'
);

select lives_ok(
  $$with nueva as (
      insert into venues (organization_id, name)
      values (current_setting('fx.club_a')::uuid, 'Pabellón 2') returning id
    ) select set_config('fx.v2', (select id::text from nueva), true)$$,
  'y otra'
);

select results_eq(
  $$select name from venues order by name$$,
  $$values ('Pabellón 1'), ('Pabellón 2')$$,
  'la dirección lee las pistas de su club, y no las de otro'
);

-- El nombre.
select throws_ok(
  $$insert into venues (organization_id, name) values (current_setting('fx.club_a')::uuid, '')$$,
  '23514', null, 'una pista sin nombre no vale'
);

select throws_ok(
  $$insert into venues (organization_id, name) values (current_setting('fx.club_a')::uuid, '   ')$$,
  '23514', null, 'ni con un nombre de solo espacios'
);

select throws_ok(
  $$insert into venues (organization_id, name)
    values (current_setting('fx.club_a')::uuid, E'\t \t')$$,
  '23514', null, 'ni de tabuladores'
);

select throws_ok(
  $$insert into venues (organization_id, name)
    values (current_setting('fx.club_a')::uuid, repeat('p', 61))$$,
  '23514', null, 'ni de más de 60 caracteres'
);

select throws_ok(
  $$insert into venues (organization_id, name)
    values (current_setting('fx.club_a')::uuid, '  PABELLÓN 1 ')$$,
  '23505', null, 'dos pistas del club no comparten nombre, sin distinguir mayúsculas ni espacios'
);

select throws_ok(
  $$update venues set name = 'pabellón 1' where id = current_setting('fx.v2')::uuid$$,
  '23505', null, 'tampoco al cambiar el nombre'
);

-- Con 60 justos vale; y la dirección la renombra y la borra.
select results_eq(
  $$select a.op, tests.outcome(a.code)
    from (values
      (1, 'insert', $sql$insert into public.venues (organization_id, name)
                         values (current_setting('fx.club_a')::uuid, repeat('p', 60))$sql$),
      (2, 'update', $sql$update public.venues set name = 'Pista de paso'
                         where name = repeat('p', 60)$sql$),
      (3, 'delete', $sql$delete from public.venues where name = 'Pista de paso'$sql$)
    ) as a (n, op, code)
    order by a.n$$,
  $$values ('insert', 'ok 1'), ('update', 'ok 1'), ('delete', 'ok 1')$$,
  'la dirección crea una pista de 60 caracteres, le cambia el nombre y la borra'
);

-- Las columnas que no se conceden: el club no se cambia y el id lo pone la base.
select results_eq(
  $$select a.op, tests.outcome(a.code)
    from (values
      (1, 'update organization_id',
        $sql$update public.venues set organization_id = current_setting('fx.club_b')::uuid
             where id = current_setting('fx.v2')::uuid$sql$),
      (2, 'insert id',
        $sql$insert into public.venues (id, organization_id, name)
             values (gen_random_uuid(), current_setting('fx.club_a')::uuid, 'Con id')$sql$),
      (3, 'update created_at',
        $sql$update public.venues set created_at = now()
             where id = current_setting('fx.v2')::uuid$sql$)
    ) as a (n, op, code)
    order by a.n$$,
  $$values ('update organization_id', '42501 privilegio'), ('insert id', '42501 privilegio'),
           ('update created_at', '42501 privilegio')$$,
  'una pista no cambia de club, y ni el id ni la fecha se escriben (42501)'
);

-- Tampoco nace en un club que no se dirige.
select is(
  tests.outcome($sql$insert into public.venues (organization_id, name)
                     values (current_setting('fx.club_b')::uuid, 'De A en B')$sql$),
  '42501 política',
  'la dirección de A no crea pistas en el club B'
);

-- c1: entrena en el club. Las ve; no las escribe.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$select name from venues order by name$$,
  $$values ('Pabellón 1'), ('Pabellón 2')$$,
  'quien entrena lee las pistas de su club'
);

select results_eq(
  $$select a.op, tests.outcome(a.code) from tests.venue_attempts() as a order by a.n$$,
  $$values ('insert', '42501 política'), ('update', 'ok 0'), ('delete', 'ok 0')$$,
  'quien entrena no crea, cambia ni borra pistas'
);

-- Un jugador.
select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select results_eq(
  $$select name from venues order by name$$,
  $$values ('Pabellón 1'), ('Pabellón 2')$$,
  'un jugador lee las pistas de su club'
);

select results_eq(
  $$select a.op, tests.outcome(a.code) from tests.venue_attempts() as a order by a.n$$,
  $$values ('insert', '42501 política'), ('update', 'ok 0'), ('delete', 'ok 0')$$,
  'un jugador no crea, cambia ni borra pistas'
);

-- La dirección de OTRO club: en el suyo las escribe; aquí lo único que la para es el club.
select tests.authenticate_as(current_setting('fx.ab')::uuid);

select results_eq(
  $$select name from venues order by name$$,
  $$values ('Pabellón 1'), ('Solo de B')$$,
  'la dirección de B solo lee las pistas de B'
);

select results_eq(
  $$select a.op, tests.outcome(a.code) from tests.venue_attempts() as a order by a.n$$,
  $$values ('insert', '42501 política'), ('update', 'ok 0'), ('delete', 'ok 0')$$,
  'la dirección de B no crea, cambia ni borra pistas de A'
);

select tests.authenticate_as(current_setting('fx.cb')::uuid);

select is_empty(
  $$select name from venues where organization_id = current_setting('fx.club_a')::uuid$$,
  'quien entrena en B no ve las pistas de A'
);

-- anon: ni leer.
select tests.clear_authentication();

select results_eq(
  $$select a.op, tests.outcome(a.code)
    from (
      select n, op, code from tests.venue_attempts()
      union all
      select 4, 'select', 'select 1 from public.venues'
    ) as a
    order by a.n$$,
  $$values ('insert', '42501 privilegio'), ('update', '42501 privilegio'),
           ('delete', '42501 privilegio'), ('select', '42501 privilegio')$$,
  'anon no lee ni escribe pistas'
);

reset role;
select results_eq(
  $$select name from venues where organization_id = current_setting('fx.club_a')::uuid order by name$$,
  $$values ('Pabellón 1'), ('Pabellón 2')$$,
  'tras todos los intentos, las pistas de A son las que creó su dirección'
);

-- ── El vínculo de un evento con su pista ─────────────────────────────────────────────
-- c1 crea sesiones de T1 con la función de siempre. El lugar es un texto: cuando es el nombre
-- de una pista del club (con otras mayúsculas y espacios alrededor, da igual), la base pone
-- `venue_id`. «Solo de B» es una pista, pero de otro club.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

do $$
declare
  t1 constant uuid := current_setting('fx.t1')::uuid;
begin
  perform set_config('fx.e_link', public.create_practice_session(
    t1, tests.slot(3, '10:00', 1), tests.slot(3, '11:00', 1), 'Con pista', null, null,
    '  pabellón 1 ')::text, true);
  perform set_config('fx.e_other', public.create_practice_session(
    t1, tests.slot(3, '10:00', 2), tests.slot(3, '11:00', 2), 'Otro texto', null, null,
    'Parque del barrio')::text, true);
  perform set_config('fx.e_none', public.create_practice_session(
    t1, tests.slot(3, '10:00', 3), tests.slot(3, '11:00', 3), 'Sin lugar')::text, true);
  perform set_config('fx.e_club_b', public.create_practice_session(
    t1, tests.slot(3, '10:00', 4), tests.slot(3, '11:00', 4), 'Otro club', null, null,
    'Solo de B')::text, true);
  perform set_config('fx.g_link', public.create_game(
    t1, tests.slot(6, '10:00', 1), tests.slot(6, '11:30', 1), 'Rival con pista', null, 'home',
    'PABELLÓN 2')::text, true);
end
$$;

select results_eq(
  $$select coalesce(pp.title, g.opponent_name), e.venue_id
    from events as e
    left join practice_plans as pp on pp.event_id = e.id
    left join games as g on g.event_id = e.id
    where e.team_id = current_setting('fx.t1')::uuid
    order by 1$$,
  $$values ('Con pista',       current_setting('fx.v1')::uuid),
           ('Otro club',       null),
           ('Otro texto',      null),
           ('Rival con pista', current_setting('fx.v2')::uuid),
           ('Sin lugar',       null)$$,
  'un evento cuyo lugar es el nombre de una pista del club queda vinculado; con otro texto, sin lugar o con una pista de otro club, no'
);

-- Cambiar el lugar lo revincula…
select lives_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_other')::uuid, tests.token(current_setting('fx.e_other')::uuid),
      tests.slot(3, '10:00', 2), tests.slot(3, '11:00', 2), 'Otro texto', null, null,
      'Pabellón 2', null)$$,
  'quien entrena cambia el lugar de su sesión al nombre de una pista'
);

select results_eq(
  $$select location, venue_id from events where id = current_setting('fx.e_other')::uuid$$,
  $$values ('Pabellón 2', current_setting('fx.v2')::uuid)$$,
  'y la sesión queda vinculada a esa pista'
);

-- … o lo suelta.
select lives_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_link')::uuid, tests.token(current_setting('fx.e_link')::uuid),
      tests.slot(3, '10:00', 1), tests.slot(3, '11:00', 1), 'Con pista', null, null,
      'Casa de la cultura', null)$$,
  'quien entrena cambia el lugar a un texto que no es una pista'
);

select results_eq(
  $$select location, venue_id from events where id = current_setting('fx.e_link')::uuid$$,
  $$values ('Casa de la cultura', null::uuid)$$,
  'y la sesión se queda sin pista'
);

select lives_ok(
  $$select public.update_game(
      current_setting('fx.g_link')::uuid, tests.slot(6, '10:00', 1), tests.slot(6, '11:30', 1),
      'Rival con pista', null, 'home', null)$$,
  'quien entrena deja un partido sin lugar'
);

select results_eq(
  $$select location, venue_id from events where id = current_setting('fx.g_link')::uuid$$,
  $$values (null::text, null::uuid)$$,
  'y el partido se queda sin pista'
);

-- Las dos columnas no se conceden: ni quien gestiona el equipo ni la dirección las escriben.
select results_eq(
  $$select a.op, tests.outcome(a.code) from tests.event_column_attempts() as a order by a.n$$,
  $$values ('update venue_id', '42501 privilegio'), ('update schedule_id', '42501 privilegio'),
           ('insert venue_id', '42501 privilegio'), ('insert schedule_id', '42501 privilegio')$$,
  'quien entrena no escribe venue_id ni schedule_id por la API (42501)'
);

select tests.authenticate_as(current_setting('fx.admin')::uuid);

select results_eq(
  $$select a.op, tests.outcome(a.code) from tests.event_column_attempts() as a order by a.n$$,
  $$values ('update venue_id', '42501 privilegio'), ('update schedule_id', '42501 privilegio'),
           ('insert venue_id', '42501 privilegio'), ('insert schedule_id', '42501 privilegio')$$,
  'la dirección tampoco (42501)'
);

-- Crear una pista vincula los eventos del club que ya tenían ese lugar. Cinco de T1 en «Pista
-- Nueva», que aún no es una pista: uno futuro (escrito con otras mayúsculas), uno pasado, uno
-- cancelado, uno hecho y un partido. En el club B hay otro con ese mismo lugar (`eb2`).
select tests.authenticate_as(current_setting('fx.c1')::uuid);

do $$
declare
  t1 constant uuid := current_setting('fx.t1')::uuid;
  v_past constant timestamptz := ((tests.today() - 3) + time '12:00') at time zone 'Europe/Madrid';
begin
  perform set_config('fx.e_pn', public.create_practice_session(
    t1, tests.slot(3, '12:00', 1), tests.slot(3, '13:00', 1), 'Pista futura', null, null,
    ' pista nueva')::text, true);
  perform set_config('fx.e_pn_past', public.create_practice_session(
    t1, v_past, v_past + interval '1 hour', 'Pista pasada', null, null, 'Pista Nueva')::text, true);
  perform set_config('fx.e_pn_canc', public.create_practice_session(
    t1, tests.slot(3, '12:00', 2), tests.slot(3, '13:00', 2), 'Pista cancelada', null, null,
    'Pista Nueva')::text, true);
  perform set_config('fx.e_pn_done', public.create_practice_session(
    t1, tests.slot(3, '12:00', 3), tests.slot(3, '13:00', 3), 'Pista hecha', null, null,
    'Pista Nueva')::text, true);
  perform set_config('fx.g_pn', public.create_game(
    t1, tests.slot(6, '12:00', 1), tests.slot(6, '13:30', 1), 'Rival ficticio', null, 'home',
    'Pista Nueva')::text, true);

  update public.events set status = 'cancelled' where id = current_setting('fx.e_pn_canc')::uuid;
end
$$;

-- La hecha, sin usuario: cerrar una sesión no es lo que se prueba aquí.
reset role;
select tests.no_user();
update events set status = 'done' where id = current_setting('fx.e_pn_done')::uuid;

select tests.authenticate_as(current_setting('fx.admin')::uuid);

select is_empty(
  $$select id from events
    where id in (current_setting('fx.e_pn')::uuid, current_setting('fx.e_pn_past')::uuid,
                 current_setting('fx.e_pn_canc')::uuid, current_setting('fx.e_pn_done')::uuid,
                 current_setting('fx.g_pn')::uuid)
      and venue_id is not null$$,
  'antes de existir la pista, ninguno de los cinco tiene pista'
);

select lives_ok(
  $$with nueva as (
      insert into venues (organization_id, name)
      values (current_setting('fx.club_a')::uuid, 'Pista Nueva') returning id
    ) select set_config('fx.v3', (select id::text from nueva), true)$$,
  'la dirección crea la pista «Pista Nueva»'
);

select results_eq(
  $$select count(*)::int from events
    where id in (current_setting('fx.e_pn')::uuid, current_setting('fx.e_pn_past')::uuid,
                 current_setting('fx.e_pn_canc')::uuid, current_setting('fx.e_pn_done')::uuid,
                 current_setting('fx.g_pn')::uuid)
      and venue_id = current_setting('fx.v3')::uuid$$,
  array[5],
  'y los eventos del club que ya tenían ese lugar quedan vinculados a ella'
);

reset role;
select results_eq(
  $$select location, venue_id from events where id = current_setting('fx.eb2')::uuid$$,
  $$values ('Pista Nueva', null::uuid)$$,
  'el del club B con ese mismo lugar, no'
);

-- Cambiarle el nombre: se lo cambia a sus eventos programados que aún no han empezado (la
-- sesión futura y el partido). El pasado, el cancelado y el hecho conservan el que tenía
-- entonces. No es un cambio de lugar: no deja nada en el registro.
select tests.mark_changes();
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select is(
  tests.outcome($sql$update public.venues set name = 'Pista Central'
                     where id = current_setting('fx.v3')::uuid$sql$),
  'ok 1',
  'la dirección cambia el nombre de la pista'
);

select results_eq(
  $$select coalesce(pp.title, g.opponent_name), e.location, e.venue_id = current_setting('fx.v3')::uuid
    from events as e
    left join practice_plans as pp on pp.event_id = e.id
    left join games as g on g.event_id = e.id
    where e.id in (current_setting('fx.e_pn')::uuid, current_setting('fx.e_pn_past')::uuid,
                   current_setting('fx.e_pn_canc')::uuid, current_setting('fx.e_pn_done')::uuid,
                   current_setting('fx.g_pn')::uuid)
    order by 1$$,
  $$values ('Pista cancelada', 'Pista Nueva',   true),
           ('Pista futura',    'Pista Central', true),
           ('Pista hecha',     'Pista Nueva',   true),
           ('Pista pasada',    'Pista Nueva',   true),
           ('Rival ficticio',  'Pista Central', true)$$,
  'el nombre nuevo llega a sus eventos programados que no han empezado, y no al pasado, al cancelado ni al hecho'
);

select is_empty(
  $$select * from tests.new_changes()$$,
  'cambiar el nombre de una pista no deja nada en el registro de cambios'
);

-- Borrarla (ningún horario la usa): los eventos conservan el lugar como texto.
select is(
  tests.outcome($sql$delete from public.venues where id = current_setting('fx.v3')::uuid$sql$),
  'ok 1',
  'la dirección borra una pista que ningún horario usa'
);

select results_eq(
  $$select coalesce(pp.title, g.opponent_name), e.location, e.venue_id
    from events as e
    left join practice_plans as pp on pp.event_id = e.id
    left join games as g on g.event_id = e.id
    where e.id in (current_setting('fx.e_pn')::uuid, current_setting('fx.e_pn_past')::uuid,
                   current_setting('fx.e_pn_canc')::uuid, current_setting('fx.e_pn_done')::uuid,
                   current_setting('fx.g_pn')::uuid)
    order by 1$$,
  $$values ('Pista cancelada', 'Pista Nueva',   null::uuid),
           ('Pista futura',    'Pista Central', null),
           ('Pista hecha',     'Pista Nueva',   null),
           ('Pista pasada',    'Pista Nueva',   null),
           ('Rival ficticio',  'Pista Central', null)$$,
  'sus eventos conservan el lugar y pierden la pista'
);

select is_empty(
  $$select * from tests.new_changes()$$,
  'borrar una pista tampoco deja nada en el registro de cambios'
);

-- ── Horarios: nadie los escribe por la tabla ─────────────────────────────────────────
select results_eq(
  $$select a.op, tests.outcome(a.code) from tests.schedule_attempts() as a order by a.n$$,
  $$values ('insert', '42501 privilegio'), ('update', '42501 privilegio'),
           ('delete', '42501 privilegio')$$,
  'la dirección no escribe team_schedules por la tabla (42501)'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$select a.op, tests.outcome(a.code) from tests.schedule_attempts() as a order by a.n$$,
  $$values ('insert', '42501 privilegio'), ('update', '42501 privilegio'),
           ('delete', '42501 privilegio')$$,
  'quien entrena tampoco (42501)'
);

-- ── create_team_schedule ─────────────────────────────────────────────────────────────
-- Antes de que T1 tenga horario, c1 ya tiene dos sesiones hechas a mano en martes a las 18:00:
-- la del tercer martes sigue en pie y la del quinto está cancelada.
do $$
declare
  t1 constant uuid := current_setting('fx.t1')::uuid;
begin
  perform set_config('fx.e_manual', public.create_practice_session(
    t1, tests.slot(2, '18:00', 3), tests.slot(2, '19:15', 3), 'A mano', null, null,
    'Pabellón 1')::text, true);
  perform set_config('fx.e_manual_canc', public.create_practice_session(
    t1, tests.slot(2, '18:00', 5), tests.slot(2, '19:15', 5), 'A mano cancelado', null, null,
    'Pabellón 1')::text, true);

  update public.events set status = 'cancelled' where id = current_setting('fx.e_manual_canc')::uuid;
end
$$;

-- Quién no: el entrenador principal de ese equipo recibe NOT_FOUND, y lo recibe antes que
-- INVALID (C26): quien no dirige no llega a saber si sus datos valían.
select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t1')::uuid, 2::smallint, '18:00', 75::smallint)$$,
  'P0002', 'NOT_FOUND',
  'el entrenador principal no crea horarios en su propio equipo (NOT_FOUND)'
);

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t1')::uuid, 0::smallint, null, 500::smallint)$$,
  'P0002', 'NOT_FOUND',
  'quien no dirige recibe NOT_FOUND antes que INVALID'
);

select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t1')::uuid, 2::smallint, '18:00', 75::smallint)$$,
  'P0002', 'NOT_FOUND',
  'un jugador no crea horarios (NOT_FOUND)'
);

select tests.clear_authentication();

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t1')::uuid, 2::smallint, '18:00', 75::smallint)$$,
  '42501', 'permission denied for function create_team_schedule',
  'anon no puede llamar a create_team_schedule (42501)'
);

reset role;
select is_empty(
  $$select id from team_schedules where organization_id = current_setting('fx.club_a')::uuid$$,
  'ninguno de esos intentos ha creado un horario'
);

-- La dirección: T1 entrena los martes a las 18:00, 75 minutos, en «Pabellón 1».
select tests.mark_changes();
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select lives_ok(
  $$select set_config('fx.r1', public.create_team_schedule(
      current_setting('fx.t1')::uuid, 2::smallint, '18:00', 75::smallint,
      current_setting('fx.v1')::uuid)::text, true)$$,
  'la dirección crea un horario semanal'
);

-- El horario, y los entrenamientos de las semanas que se van a tocar más abajo, por su martes.
do $$
declare
  s1 constant uuid := (current_setting('fx.r1')::jsonb ->> 'id')::uuid;
  n int;
begin
  perform set_config('fx.s1', s1::text, true);

  foreach n in array array[2, 4, 6, 7, 8, 9, 10, 11, 12] loop
    perform set_config(
      'fx.e' || n,
      (select e.id::text from public.events as e
       where e.schedule_id = s1 and e.starts_at = tests.slot(2, '18:00', n)),
      true
    );
  end loop;
end
$$;

select results_eq(
  $$select array(select jsonb_object_keys(current_setting('fx.r1')::jsonb) order by 1),
           (current_setting('fx.r1')::jsonb ->> 'created')::int$$,
  $$values (array['created', 'id'],
            tests.expected_slots(tests.today() - 30, tests.today() + 200, 2, '18:00') - 1)$$,
  'devuelve { id, created }: un entrenamiento por martes desde hoy hasta el final de la temporada, menos el que ya había'
);

select results_eq(
  $$select team_id, weekday::int, start_time, duration_minutes::int, venue_id
    from team_schedules where id = current_setting('fx.s1')::uuid$$,
  $$values (current_setting('fx.t1')::uuid, 2, time '18:00', 75, current_setting('fx.v1')::uuid)$$,
  'el horario queda guardado'
);

select results_eq(
  $$select count(*)::int from events where schedule_id = current_setting('fx.s1')::uuid$$,
  $$values ((current_setting('fx.r1')::jsonb ->> 'created')::int)$$,
  'hay tantos entrenamientos del horario como dice haber creado'
);

select is_empty(
  $$select id from events
    where schedule_id = current_setting('fx.s1')::uuid
      and (kind <> 'practice' or status <> 'scheduled'
        or team_id <> current_setting('fx.t1')::uuid
        or ends_at - starts_at <> interval '75 minutes'
        or location is distinct from 'Pabellón 1'
        or venue_id is distinct from current_setting('fx.v1')::uuid)$$,
  'cada uno es un entrenamiento programado de 75 minutos, en la pista del horario y vinculado a ella'
);

select is_empty(
  $$select id from events
    where schedule_id = current_setting('fx.s1')::uuid
      and (starts_at <= now()
        or tests.local(starts_at)::date < tests.today()
        or tests.local(starts_at)::date > tests.today() + 200)$$,
  'ninguno en el pasado ni después del final de la temporada'
);

select is_empty(
  $$select id from events
    where schedule_id = current_setting('fx.s1')::uuid
      and (tests.local(starts_at)::time <> time '18:00'
        or extract(isodow from tests.local(starts_at))::int <> 2)$$,
  'todos caen en martes a las 18:00 del reloj del club'
);

-- Cada uno con su plan: una sesión normal, lista para que quien entrena la prepare.
select is_empty(
  $$select e.id from events as e
    where e.schedule_id = current_setting('fx.s1')::uuid
      and not exists (
        select 1 from practice_plans as pp
        where pp.event_id = e.id
          and pp.organization_id = e.organization_id
          and pp.team_id = e.team_id
          and pp.title = 'Entrenamiento'
          and pp.status = 'draft'
          and not pp.is_template
          and pp.notes is null
          and pp.primary_focus_id is null
          and pp.secondary_focus_id is null
          and pp.live_started_at is null
          and pp.created_by = current_setting('fx.admin')::uuid
          and not exists (select 1 from practice_items as pi where pi.plan_id = pp.id)
      )$$,
  'cada uno tiene su plan: «Entrenamiento», en borrador, sin ítems y a nombre de quien llama'
);

select results_eq(
  $$select count(*)::int from practice_plans as pp
    join events as e on e.id = pp.event_id
    where e.schedule_id = current_setting('fx.s1')::uuid$$,
  $$values ((current_setting('fx.r1')::jsonb ->> 'created')::int)$$,
  'un plan por entrenamiento, ni uno más'
);

-- No duplica: el tercer martes ya tenía una sesión hecha a mano y sigue siendo la única. El
-- quinto tenía una cancelada: ahí sí crea.
select results_eq(
  $$select tests.local(e.starts_at)::date - tests.local(tests.slot(2, '18:00', 3))::date,
           pp.title, e.status::text, e.schedule_id is not null
    from events as e
    join practice_plans as pp on pp.event_id = e.id
    where e.team_id = current_setting('fx.t1')::uuid
      and e.starts_at in (tests.slot(2, '18:00', 3), tests.slot(2, '18:00', 5))
    order by 1, 2$$,
  $$values (0,  'A mano',           'scheduled', false),
           (14, 'A mano cancelado', 'cancelled', false),
           (14, 'Entrenamiento',    'scheduled', true)$$,
  'no crea donde el equipo ya tenía un entrenamiento a esa hora; sí donde el que había está cancelado'
);

select ok(
  current_setting('fx.e2') <> '' and current_setting('fx.e4') <> '' and current_setting('fx.e6') <> ''
    and current_setting('fx.e7') <> '' and current_setting('fx.e8') <> '' and current_setting('fx.e9') <> ''
    and current_setting('fx.e10') <> '' and current_setting('fx.e11') <> '' and current_setting('fx.e12') <> '',
  'control: hay entrenamiento del horario en cada una de las semanas que usan los tests de abajo'
);

select is_empty(
  $$select * from tests.new_changes()$$,
  'crear un horario no deja nada en el registro de cambios'
);

-- Repetido: el mismo equipo, día y hora, aunque cambien la duración y la pista. No crea nada.
do $$
begin
  perform set_config('fx.n_events_t1',
    (select count(*)::text from public.events where team_id = current_setting('fx.t1')::uuid), true);
end
$$;

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t1')::uuid, 2::smallint, '18:00:00', 60::smallint)$$,
  '23505', null,
  'un equipo no tiene dos horarios el mismo día a la misma hora (23505)'
);

select results_eq(
  $$select (select count(*)::int from team_schedules where team_id = current_setting('fx.t1')::uuid),
           (select count(*)::int from events where team_id = current_setting('fx.t1')::uuid)$$,
  $$values (1, current_setting('fx.n_events_t1')::int)$$,
  'y el intento repetido no deja ni horario ni entrenamientos'
);

-- El mismo día y la misma hora en OTRO equipo sí vale. Y sin pista: ni lugar ni vínculo.
select lives_ok(
  $$select set_config('fx.r2', public.create_team_schedule(
      current_setting('fx.t2')::uuid, 2::smallint, '18:00', 60::smallint)::text, true)$$,
  'otro equipo sí puede entrenar ese mismo día a esa misma hora, y sin pista'
);

do $$
begin
  perform set_config('fx.s2', current_setting('fx.r2')::jsonb ->> 'id', true);
end
$$;

select results_eq(
  $$select count(*)::int,
           count(*) filter (where location is null and venue_id is null
                              and ends_at - starts_at = interval '60 minutes')::int
    from events where schedule_id = current_setting('fx.s2')::uuid$$,
  $$select n, n from (select tests.expected_slots(tests.today() - 30, tests.today() + 200, 2, '18:00')) as x (n)$$,
  'sin pista, sus entrenamientos nacen sin lugar y sin vínculo; y son todos los martes que quedan'
);

-- Un segundo horario para T1 (viernes a las 17:00): es «otro horario» en lo que sigue.
select lives_ok(
  $$select set_config('fx.s1b', public.create_team_schedule(
      current_setting('fx.t1')::uuid, 5::smallint, '17:00', 60::smallint) ->> 'id', true)$$,
  'un equipo tiene más de un horario'
);

-- La hora es la del reloj del club también al cruzar el cambio de hora. T3 es de una temporada
-- de 365 días: entre hoy y su final hay al menos un cambio (nunca pasan más de 217 días entre
-- dos). Jueves a las 18:00.
select lives_ok(
  $$select set_config('fx.r3', public.create_team_schedule(
      current_setting('fx.t3')::uuid, 4::smallint, '18:00', 90::smallint,
      current_setting('fx.v1')::uuid)::text, true)$$,
  'la dirección crea un horario en un equipo de una temporada larga'
);

do $$
begin
  perform set_config('fx.s3', current_setting('fx.r3')::jsonb ->> 'id', true);
end
$$;

select results_eq(
  $$select (current_setting('fx.r3')::jsonb ->> 'created')::int, count(*)::int
    from events where schedule_id = current_setting('fx.s3')::uuid$$,
  $$select n, n from (select tests.expected_slots(tests.today() - 30, tests.today() + 335, 4, '18:00')) as x (n)$$,
  'crea un entrenamiento por jueves hasta el final de la temporada'
);

select is_empty(
  $$select id from events
    where schedule_id = current_setting('fx.s3')::uuid
      and (tests.local(starts_at)::time <> time '18:00'
        or extract(isodow from tests.local(starts_at))::int <> 4)$$,
  'todos a las 18:00 del reloj del club y en jueves, a cada lado del cambio de hora'
);

select is_empty(
  $$select id from (
      select id, tests.local(starts_at)::date - lag(tests.local(starts_at)::date) over (order by starts_at) as gap
      from events where schedule_id = current_setting('fx.s3')::uuid
    ) as x
    where x.gap <> 7$$,
  'entre dos consecutivos hay exactamente siete días de calendario'
);

-- Control: de verdad se cruza el cambio. La misma hora del club son dos horas UTC distintas.
select results_eq(
  $$select count(distinct (starts_at at time zone 'UTC')::time)::int
    from events where schedule_id = current_setting('fx.s3')::uuid$$,
  array[2],
  'control: esos entrenamientos están a dos horas UTC distintas (hay cambio de hora por medio)'
);

select results_eq(
  $$select min(tests.local(starts_at)::date) >= tests.today(),
           max(tests.local(starts_at)::date) between tests.today() + 329 and tests.today() + 335
    from events where schedule_id = current_setting('fx.s3')::uuid$$,
  $$values (true, true)$$,
  'el primero no es anterior a hoy y el último cae en la última semana de la temporada, sin pasarse'
);

-- Una temporada que aún no ha empezado: empieza en su primer día, no hoy. Sábados a las 10:00.
select lives_ok(
  $$select set_config('fx.r4', public.create_team_schedule(
      current_setting('fx.t4')::uuid, 6::smallint, '10:00', 60::smallint)::text, true)$$,
  'la dirección crea un horario en un equipo de una temporada que aún no ha empezado'
);

select results_eq(
  $$select count(*)::int, min(tests.local(starts_at)::date), max(tests.local(starts_at)::date) <= tests.today() + 150
    from events where schedule_id = (current_setting('fx.r4')::jsonb ->> 'id')::uuid$$,
  $$select tests.expected_slots(tests.today() + 20, tests.today() + 150, 6, '10:00'),
           (select min(tests.today() + i) from generate_series(20, 26) as i
            where extract(isodow from tests.today() + i)::int = 6),
           true$$,
  'sus entrenamientos van del primer sábado de la temporada al último, ninguno antes de que empiece'
);

select is(
  (current_setting('fx.r4')::jsonb ->> 'created')::int,
  tests.expected_slots(tests.today() + 20, tests.today() + 150, 6, '10:00'),
  'y dice haber creado esos'
);

-- INVALID (22023). T5 es de una temporada que ya acabó: no habría nada que crear.
select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t5')::uuid, 2::smallint, '18:00', 75::smallint)$$,
  '22023', 'INVALID',
  'en un equipo de una temporada ya acabada no se crean horarios (INVALID)'
);

select results_eq(
  $$select a.caso, tests.outcome(format(
      'select public.create_team_schedule(%L::uuid, %s::smallint, %s::time, %s::smallint)',
      current_setting('fx.t2'), a.dia, a.hora, a.minutos))
    from (values
      (1, 'día 0',        '0',    quote_literal('09:00'), '60'),
      (2, 'día 8',        '8',    quote_literal('09:00'), '60'),
      (3, 'día null',     'null', quote_literal('09:00'), '60'),
      (4, 'hora null',    '3',    'null',                 '60'),
      (5, '14 minutos',   '3',    quote_literal('09:00'), '14'),
      (6, '241 minutos',  '3',    quote_literal('09:00'), '241'),
      (7, 'minutos null', '3',    quote_literal('09:00'), 'null')
    ) as a (n, caso, dia, hora, minutos)
    order by a.n$$,
  $$values ('día 0', '22023'), ('día 8', '22023'), ('día null', '22023'), ('hora null', '22023'),
           ('14 minutos', '22023'), ('241 minutos', '22023'), ('minutos null', '22023')$$,
  'un día fuera de 1 a 7, una duración fuera de 15 a 240 o un dato sin poner son INVALID'
);

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t2')::uuid, 0::smallint, '09:00', 60::smallint)$$,
  '22023', 'INVALID',
  'y el mensaje es INVALID'
);

-- NOT_FOUND (P0002): el equipo o la pista no son de un club que quien llama dirige.
select throws_ok(
  $$select public.create_team_schedule(gen_random_uuid(), 3::smallint, '09:00', 60::smallint)$$,
  'P0002', 'NOT_FOUND',
  'un equipo que no existe es NOT_FOUND'
);

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t2')::uuid, 3::smallint, '09:00', 60::smallint,
      current_setting('fx.vb1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'la pista de otro club es NOT_FOUND'
);

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t2')::uuid, 3::smallint, '09:00', 60::smallint, gen_random_uuid())$$,
  'P0002', 'NOT_FOUND',
  'una pista que no existe es NOT_FOUND'
);

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t2')::uuid, 0::smallint, null, 500::smallint,
      current_setting('fx.vb1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'con la pista de otro club y datos que no valen, NOT_FOUND antes que INVALID'
);

select results_eq(
  $$select count(*)::int from team_schedules where team_id = current_setting('fx.t2')::uuid$$,
  array[1],
  'ninguno de esos intentos ha dejado un horario en T2'
);

-- El tope: 14 horarios por equipo. T6, de una temporada de dos semanas, llega a 14 con los
-- extremos que sí valen (lunes y domingo, 15 y 240 minutos); el que hace 15 es INVALID.
select lives_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t6')::uuid, d::smallint, h.hora::time, h.minutos::smallint)
    from generate_series(1, 7) as d
    cross join (values ('17:00', 15), ('19:00', 240)) as h (hora, minutos)$$,
  'un equipo llega a 14 horarios, de lunes a domingo y de 15 a 240 minutos'
);

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t6')::uuid, 1::smallint, '21:30', 60::smallint)$$,
  '22023', 'INVALID',
  'el horario número 15 de un equipo es INVALID'
);

select results_eq(
  $$select count(*)::int from team_schedules where team_id = current_setting('fx.t6')::uuid$$,
  array[14],
  'y el equipo se queda con 14'
);

-- ── Horarios: quién los lee ──────────────────────────────────────────────────────────
-- En A hay 19: dos de T1, uno de T2, uno de T3, uno de T4 y catorce de T6.
select results_eq(
  $$select count(*)::int, count(*) filter (where organization_id = current_setting('fx.club_a')::uuid)::int
    from team_schedules$$,
  $$values (19, 19)$$,
  'la dirección lee todos los horarios de su club, y ninguno de otro'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$select id from team_schedules order by weekday$$,
  $$values (current_setting('fx.s1')::uuid), (current_setting('fx.s1b')::uuid)$$,
  'quien entrena lee los horarios de su equipo, y no los de otro equipo del club'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  $$select id from team_schedules$$,
  $$values (current_setting('fx.s2')::uuid)$$,
  'el entrenador de otro equipo solo lee los del suyo'
);

select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select is_empty(
  $$select id from team_schedules$$,
  'un jugador no lee horarios, tampoco los de su equipo'
);

select tests.authenticate_as(current_setting('fx.ab')::uuid);

select results_eq(
  $$select id from team_schedules$$,
  $$values (current_setting('fx.sb')::uuid)$$,
  'la dirección de B solo lee los horarios de B'
);

select tests.authenticate_as(current_setting('fx.cb')::uuid);

select results_eq(
  $$select id from team_schedules$$,
  $$values (current_setting('fx.sb')::uuid)$$,
  'quien entrena en B solo lee los de su equipo'
);

select tests.clear_authentication();

select throws_ok(
  $$select id from team_schedules$$,
  '42501', null,
  'anon no lee horarios (42501)'
);

-- ── Una pista con horarios no se borra ───────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select is(
  tests.outcome($sql$delete from public.venues where id = current_setting('fx.v1')::uuid$sql$),
  '23503',
  'la dirección no borra una pista que usa un horario (23503)'
);

-- ── update_team_schedule ─────────────────────────────────────────────────────────────
-- Antes de cambiar el horario de T1 (martes 18:00, 75 minutos, «Pabellón 1»), c1 toca tres de
-- sus entrenamientos con lo de siempre:
--   · el del 2.º martes lo mueve a mano a las 19:00;
--   · el del 4.º lo cancela;
--   · al del 7.º le cambia solo el lugar («Parque del barrio»): sigue en su sitio en el tiempo.
-- Y el del 6.º queda hecho (sin usuario: cerrar una sesión no es lo que se prueba aquí).
select tests.authenticate_as(current_setting('fx.c1')::uuid);

do $$
begin
  perform public.update_practice_session(
    current_setting('fx.e2')::uuid, tests.token(current_setting('fx.e2')::uuid),
    tests.slot(2, '19:00', 2), tests.slot(2, '20:15', 2), 'Entrenamiento', null, null,
    'Pabellón 1', null);

  update public.events set status = 'cancelled' where id = current_setting('fx.e4')::uuid;

  perform public.update_practice_session(
    current_setting('fx.e7')::uuid, tests.token(current_setting('fx.e7')::uuid),
    tests.slot(2, '18:00', 7), tests.slot(2, '19:15', 7), 'Entrenamiento', null, null,
    'Parque del barrio', null);
end
$$;

-- Quién no: mientras, nadie que no dirija el club cambia el horario.
select throws_ok(
  $$select public.update_team_schedule(
      current_setting('fx.s1')::uuid, 4::smallint, '19:30', 90::smallint)$$,
  'P0002', 'NOT_FOUND',
  'el entrenador principal no cambia el horario de su equipo (NOT_FOUND)'
);

select throws_ok(
  $$select public.update_team_schedule(
      current_setting('fx.s1')::uuid, 0::smallint, null, 500::smallint)$$,
  'P0002', 'NOT_FOUND',
  'y recibe NOT_FOUND antes que INVALID'
);

select throws_ok(
  $$select public.update_team_schedule(
      current_setting('fx.s1')::uuid, 5::smallint, '17:00', 60::smallint)$$,
  'P0002', 'NOT_FOUND',
  'y antes que el 23505 de chocar con otro horario'
);

select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select throws_ok(
  $$select public.update_team_schedule(
      current_setting('fx.s1')::uuid, 4::smallint, '19:30', 90::smallint)$$,
  'P0002', 'NOT_FOUND',
  'un jugador no cambia horarios (NOT_FOUND)'
);

select tests.clear_authentication();

select throws_ok(
  $$select public.update_team_schedule(
      current_setting('fx.s1')::uuid, 4::smallint, '19:30', 90::smallint)$$,
  '42501', 'permission denied for function update_team_schedule',
  'anon no puede llamar a update_team_schedule (42501)'
);

-- La foto de antes: todos los eventos del club A, y el registro de cambios visto hasta aquí.
reset role;
select tests.no_user();
update events set status = 'done' where id = current_setting('fx.e6')::uuid;

create temp table before_ev as
  select * from public.events where organization_id = current_setting('fx.club_a')::uuid;
select tests.mark_changes();

select tests.authenticate_as(current_setting('fx.admin')::uuid);

-- INVALID, NOT_FOUND y el 23505 de la dirección, antes del cambio bueno: no dejan nada.
select results_eq(
  $$select a.caso, tests.outcome(format(
      'select public.update_team_schedule(%L::uuid, %s::smallint, %s::time, %s::smallint)',
      current_setting('fx.s1'), a.dia, a.hora, a.minutos))
    from (values
      (1, 'día 0',        '0',    quote_literal('19:30'), '90'),
      (2, 'día 8',        '8',    quote_literal('19:30'), '90'),
      (3, 'día null',     'null', quote_literal('19:30'), '90'),
      (4, 'hora null',    '4',    'null',                 '90'),
      (5, '14 minutos',   '4',    quote_literal('19:30'), '14'),
      (6, '241 minutos',  '4',    quote_literal('19:30'), '241'),
      (7, 'minutos null', '4',    quote_literal('19:30'), 'null')
    ) as a (n, caso, dia, hora, minutos)
    order by a.n$$,
  $$values ('día 0', '22023'), ('día 8', '22023'), ('día null', '22023'), ('hora null', '22023'),
           ('14 minutos', '22023'), ('241 minutos', '22023'), ('minutos null', '22023')$$,
  'al cambiar un horario, los mismos datos que no valen son INVALID'
);

select throws_ok(
  $$select public.update_team_schedule(gen_random_uuid(), 4::smallint, '19:30', 90::smallint)$$,
  'P0002', 'NOT_FOUND',
  'un horario que no existe es NOT_FOUND'
);

select throws_ok(
  $$select public.update_team_schedule(
      current_setting('fx.s1')::uuid, 4::smallint, '19:30', 90::smallint,
      current_setting('fx.vb1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'cambiar a la pista de otro club es NOT_FOUND'
);

select throws_ok(
  $$select public.update_team_schedule(
      current_setting('fx.s1')::uuid, 0::smallint, null, 500::smallint,
      current_setting('fx.vb1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'y lo es antes que INVALID'
);

-- T1 ya entrena los viernes a las 17:00 (`s1b`).
select throws_ok(
  $$select public.update_team_schedule(
      current_setting('fx.s1')::uuid, 5::smallint, '17:00', 75::smallint,
      current_setting('fx.v1')::uuid)$$,
  '23505', null,
  'cambiar un horario al día y la hora de otro del mismo equipo es un 23505'
);

reset role;
select results_eq(
  $$select (select count(*)::int from (
              (select * from before_ev except select * from public.events)
              union all
              (select * from public.events where organization_id = current_setting('fx.club_a')::uuid
               except select * from before_ev)) as x),
           (select count(*)::int from tests.new_changes()),
           (select row(weekday, start_time, duration_minutes, venue_id)::text
            from team_schedules where id = current_setting('fx.s1')::uuid)$$,
  $$values (0, 0, row(2::smallint, time '18:00', 75::smallint, current_setting('fx.v1')::uuid)::text)$$,
  'ninguno de esos intentos ha movido un entrenamiento, registrado un cambio ni tocado el horario'
);

-- El cambio: a los jueves a las 19:30, 90 minutos, en «Pabellón 2».
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select lives_ok(
  $$select set_config('fx.moved', public.update_team_schedule(
      current_setting('fx.s1')::uuid, 4::smallint, '19:30', 90::smallint,
      current_setting('fx.v2')::uuid)::text, true)$$,
  'la dirección cambia el día, la hora, la duración y la pista de un horario'
);

reset role;

select results_eq(
  $$select weekday::int, start_time, duration_minutes::int, venue_id
    from team_schedules where id = current_setting('fx.s1')::uuid$$,
  $$values (4, time '19:30', 90, current_setting('fx.v2')::uuid)$$,
  'el horario queda cambiado'
);

-- Se mueven los que seguían en su sitio: todos menos el movido a mano, el cancelado y el hecho.
select results_eq(
  $$select current_setting('fx.moved')::int$$,
  $$select count(*)::int from before_ev
    where schedule_id = current_setting('fx.s1')::uuid
      and status = 'scheduled'
      and tests.local(starts_at)::time = time '18:00'
      and extract(isodow from tests.local(starts_at))::int = 2$$,
  'devuelve cuántos ha movido: los programados que seguían en el día y la hora del horario'
);

select is(
  current_setting('fx.moved')::int,
  (current_setting('fx.r1')::jsonb ->> 'created')::int - 3,
  'que son todos menos tres'
);

-- Cada uno: al jueves de su misma semana, a las 19:30 del club, 90 minutos. El lugar cambia
-- solo en los que seguían en la pista del horario: el del «Parque del barrio» se queda allí.
select is_empty(
  $$select b.id
    from before_ev as b
    join events as e on e.id = b.id
    where b.schedule_id = current_setting('fx.s1')::uuid
      and b.status = 'scheduled'
      and b.id <> current_setting('fx.e2')::uuid
      and (e.starts_at <> ((tests.local(b.starts_at)::date + 2) + time '19:30') at time zone 'Europe/Madrid'
        or e.ends_at <> e.starts_at + interval '90 minutes'
        or e.location is distinct from
             case when b.id = current_setting('fx.e7')::uuid then 'Parque del barrio' else 'Pabellón 2' end
        or e.venue_id is distinct from
             case when b.id = current_setting('fx.e7')::uuid then null else current_setting('fx.v2')::uuid end
        or e.status <> 'scheduled'
        or e.schedule_id is distinct from b.schedule_id
        or e.team_id <> b.team_id or e.kind <> b.kind)$$,
  'cada uno pasa al jueves de su semana a las 19:30, con 90 minutos; el lugar, solo en los que seguían en la pista del horario'
);

select results_eq(
  $$select tests.local(starts_at), tests.local(ends_at), location
    from events where id = current_setting('fx.e8')::uuid$$,
  $$values ((tests.local(tests.slot(2, '18:00', 8))::date + 2) + time '19:30',
            (tests.local(tests.slot(2, '18:00', 8))::date + 2) + time '21:00',
            'Pabellón 2')$$,
  'el del 8.º martes, por ejemplo, es ahora ese jueves de 19:30 a 21:00 en «Pabellón 2»'
);

-- Lo demás no se ha tocado: el movido a mano (sigue el martes a las 19:00), el cancelado, el
-- hecho, los del otro horario de T1, los hechos a mano y los de los demás equipos.
select is_empty(
  $$(select * from before_ev as b
     where not (b.schedule_id is not distinct from current_setting('fx.s1')::uuid
                and b.status = 'scheduled' and b.id <> current_setting('fx.e2')::uuid))
    except
    select * from public.events$$,
  'no se mueven el que alguien movió a mano, el cancelado, el hecho, ni nada de otro horario o de otro equipo'
);

select is(
  (select count(*)::int from events where organization_id = current_setting('fx.club_a')::uuid),
  (select count(*)::int from before_ev),
  'ni se crea ni se borra ningún evento'
);

-- Lo que registra: por cada movido, una fila `time` con lo de antes; y otra `location` si
-- cambió de pista (todos menos el del «Parque del barrio»).
select set_eq(
  $$select event_id, what, old_starts_at, old_ends_at, old_location from tests.new_changes()$$,
  $$select b.id, w.what, b.starts_at, b.ends_at, b.location
    from before_ev as b
    cross join (values ('time'), ('location')) as w (what)
    where b.schedule_id = current_setting('fx.s1')::uuid
      and b.status = 'scheduled'
      and b.id <> current_setting('fx.e2')::uuid
      and (w.what = 'time' or b.id <> current_setting('fx.e7')::uuid)$$,
  'cada entrenamiento movido deja un cambio de hora, y uno de lugar si cambió de pista, con lo que había antes'
);

select is_empty(
  $$select c.id from event_changes as c
    join events as e on e.id = c.event_id
    where c.team_id <> e.team_id or c.organization_id <> e.organization_id$$,
  'cada cambio registrado lleva el club y el equipo de su evento'
);

-- Con los mismos valores no hay nada que mover.
select tests.mark_changes();
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select results_eq(
  $$select public.update_team_schedule(
      current_setting('fx.s1')::uuid, 4::smallint, '19:30', 90::smallint,
      current_setting('fx.v2')::uuid)$$,
  array[0],
  'llamarla otra vez con los mismos valores no mueve nada (devuelve 0)'
);

select is_empty(
  $$select * from tests.new_changes()$$,
  'ni registra nada'
);

-- Al cruzar el cambio de hora: el horario de T3 pasa de las 18:00 a las 19:30, y se queda sin
-- pista. Todos se mueven, todos a las 19:30 del reloj del club.
select results_eq(
  $$select public.update_team_schedule(
      current_setting('fx.s3')::uuid, 4::smallint, '19:30', 90::smallint)$$,
  $$values ((current_setting('fx.r3')::jsonb ->> 'created')::int)$$,
  'cambiar solo la hora (y quitar la pista) mueve todos los entrenamientos del horario'
);

select is_empty(
  $$select id from events
    where schedule_id = current_setting('fx.s3')::uuid
      and (tests.local(starts_at)::time <> time '19:30'
        or extract(isodow from tests.local(starts_at))::int <> 4
        or ends_at - starts_at <> interval '90 minutes'
        or location is not null or venue_id is not null)$$,
  'todos quedan a las 19:30 del reloj del club a cada lado del cambio de hora, y sin lugar'
);

select is_empty(
  $$select id from (
      select id, tests.local(starts_at)::date - lag(tests.local(starts_at)::date) over (order by starts_at) as gap
      from events where schedule_id = current_setting('fx.s3')::uuid
    ) as x
    where x.gap <> 7$$,
  'y siguen a siete días de calendario uno de otro'
);

-- Un día anterior de la misma semana puede caer ya en el pasado: ese no se mueve. T2 entrena
-- también «hoy» (el día de la semana de hoy) a las 23:59:59, y el horario pasa a las 00:00 del
-- día anterior de esa semana (o de ese mismo día, si hoy es lunes): el entrenamiento de hoy,
-- que iría a parar al pasado, se queda donde está.
select lives_ok(
  $$select set_config('fx.s_hoy', public.create_team_schedule(
      current_setting('fx.t2')::uuid, extract(isodow from tests.today())::smallint, '23:59:59',
      15::smallint) ->> 'id', true)$$,
  'la dirección crea un horario cuyo primer entrenamiento es hoy mismo'
);

select is(
  (select count(*)::int from events
   where schedule_id = current_setting('fx.s_hoy')::uuid
     and tests.local(starts_at)::date = tests.today()),
  case when (tests.today() + time '23:59:59') at time zone 'Europe/Madrid' > now() then 1 else 0 end,
  'control: el entrenamiento de hoy existe (si aún no ha pasado su hora)'
);

select lives_ok(
  $$select set_config('fx.moved_hoy', public.update_team_schedule(
      current_setting('fx.s_hoy')::uuid,
      greatest(extract(isodow from tests.today())::int - 1, 1)::smallint, '00:00',
      15::smallint)::text, true)$$,
  'y lo cambia a un día y una hora anteriores de la misma semana'
);

select results_eq(
  $$select current_setting('fx.moved_hoy')::int,
           count(*) filter (where starts_at <= now())::int,
           count(*) filter (where tests.local(starts_at)::date = tests.today()
                              and tests.local(starts_at)::time <> time '23:59:59')::int
    from events where schedule_id = current_setting('fx.s_hoy')::uuid$$,
  $$select count(*)::int, 0, 0 from events
    where schedule_id = current_setting('fx.s_hoy')::uuid
      and tests.local(starts_at)::date > tests.today()$$,
  'se mueven los de las semanas siguientes; el de hoy, que caería en el pasado, se queda donde está'
);

-- ── delete_team_schedule ─────────────────────────────────────────────────────────────
-- El horario de T1 (ahora jueves 19:30). Antes de quitarlo, c1 prepara cinco de sus sesiones,
-- cada una con una cosa distinta, con lo de siempre:
--   · la que movió a mano (2.º martes): notas;
--   · la del «Parque del barrio» (7.ª semana): un ítem;
--   · la de la 9.ª semana: un objetivo;
--   · la de la 10.ª: otro título;
--   · la de la 11.ª: empezada en directo.
-- Además están la cancelada (4.ª), la hecha (6.ª) y una que ya ha pasado (la de la 12.ª semana,
-- llevada al pasado sin usuario). Esas ocho se quedan; todas las demás, que nadie ha tocado,
-- se borran.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

do $$
begin
  perform public.update_practice_session(
      e.id, tests.token(e.id), e.starts_at, e.ends_at, 'Entrenamiento', null, null, e.location,
      'Traer petos')
  from public.events as e where e.id = current_setting('fx.e2')::uuid;

  insert into public.practice_items (organization_id, plan_id, sort, title_override, minutes)
  select pp.organization_id, pp.id, 0, 'Rueda de entradas', 10
  from public.practice_plans as pp where pp.event_id = current_setting('fx.e7')::uuid;

  perform public.update_practice_session(
      e.id, tests.token(e.id), e.starts_at, e.ends_at, 'Entrenamiento',
      current_setting('fx.fa1')::uuid, null, e.location, null)
  from public.events as e where e.id = current_setting('fx.e9')::uuid;

  perform public.update_practice_session(
      e.id, tests.token(e.id), e.starts_at, e.ends_at, 'Tiro y bote', null, null, e.location, null)
  from public.events as e where e.id = current_setting('fx.e10')::uuid;

  update public.practice_plans set live_started_at = now()
  where event_id = current_setting('fx.e11')::uuid;
end
$$;

-- Quién no.
select throws_ok(
  $$select public.delete_team_schedule(current_setting('fx.s1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'el entrenador principal no quita el horario de su equipo (NOT_FOUND)'
);

select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select throws_ok(
  $$select public.delete_team_schedule(current_setting('fx.s1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'un jugador no quita horarios (NOT_FOUND)'
);

select tests.clear_authentication();

select throws_ok(
  $$select public.delete_team_schedule(current_setting('fx.s1')::uuid)$$,
  '42501', 'permission denied for function delete_team_schedule',
  'anon no puede llamar a delete_team_schedule (42501)'
);

-- La foto de antes.
reset role;
select tests.no_user();

update events
set starts_at = ((tests.today() - 3) + time '19:30') at time zone 'Europe/Madrid',
    ends_at   = ((tests.today() - 3) + time '21:00') at time zone 'Europe/Madrid'
where id = current_setting('fx.e12')::uuid;

-- Las ocho que se tienen que quedar, con su etiqueta y lo que las distingue.
create function tests.kept()
returns table (n int, label text, id uuid)
language sql
stable
set search_path = ''
as $$
  select k.n, k.label, current_setting(k.setting)::uuid
  from (values
    (1, 'con notas',           'fx.e2'),
    (2, 'cancelada',           'fx.e4'),
    (3, 'hecha',               'fx.e6'),
    (4, 'con un ítem',         'fx.e7'),
    (5, 'con objetivo',        'fx.e9'),
    (6, 'con otro título',     'fx.e10'),
    (7, 'empezada en directo', 'fx.e11'),
    (8, 'ya pasada',           'fx.e12')
  ) as k (n, label, setting);
$$;

create function tests.kept_state()
returns table (
  label text, status text, suelta boolean, title text, notes text, con_objetivo boolean,
  en_directo boolean, items int, pasada boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.label, e.status::text, e.schedule_id is null, pp.title, pp.notes,
         pp.primary_focus_id is not null, pp.live_started_at is not null,
         (select count(*)::int from public.practice_items as pi where pi.plan_id = pp.id),
         e.starts_at <= now()
  from tests.kept() as k
  join public.events as e on e.id = k.id
  join public.practice_plans as pp on pp.event_id = e.id
  order by k.n;
$$;

create temp table before_del as
  select * from public.events where organization_id = current_setting('fx.club_a')::uuid;
create temp table before_del_plans as
  select pp.id, pp.event_id from public.practice_plans as pp where pp.organization_id = current_setting('fx.club_a')::uuid;
create temp table before_del_changes as
  select c.id, c.event_id from public.event_changes as c where c.organization_id = current_setting('fx.club_a')::uuid;

select results_eq(
  $$select * from tests.kept_state()$$,
  $$values
    ('con notas',           'scheduled', false, 'Entrenamiento', 'Traer petos', false, false, 0, false),
    ('cancelada',           'cancelled', false, 'Entrenamiento', null,          false, false, 0, false),
    ('hecha',               'done',      false, 'Entrenamiento', null,          false, false, 0, false),
    ('con un ítem',         'scheduled', false, 'Entrenamiento', null,          false, false, 1, false),
    ('con objetivo',        'scheduled', false, 'Entrenamiento', null,          true,  false, 0, false),
    ('con otro título',     'scheduled', false, 'Tiro y bote',   null,          false, false, 0, false),
    ('empezada en directo', 'scheduled', false, 'Entrenamiento', null,          false, true,  0, false),
    ('ya pasada',           'scheduled', false, 'Entrenamiento', null,          false, false, 0, true)$$,
  'control: antes de quitar el horario, ocho de sus sesiones están tocadas, cerradas o pasadas, y siguen siendo suyas'
);

-- Las que se van a borrar tienen cambios registrados (los de cuando se movió el horario): así
-- se ve que se van con ellas.
select cmp_ok(
  (select count(*)::int from before_del_changes as c
   join before_del as b on b.id = c.event_id
   where b.schedule_id = current_setting('fx.s1')::uuid
     and b.id not in (select k.id from tests.kept() as k)),
  '>', 0,
  'control: las sesiones que nadie ha tocado tienen cambios registrados'
);

select tests.authenticate_as(current_setting('fx.admin')::uuid);

select lives_ok(
  $$select set_config('fx.deleted',
      public.delete_team_schedule(current_setting('fx.s1')::uuid)::text, true)$$,
  'la dirección quita un horario'
);

reset role;

select results_eq(
  $$select current_setting('fx.deleted')::int, current_setting('fx.deleted')::int > 0$$,
  $$select count(*)::int - 8, true from before_del where schedule_id = current_setting('fx.s1')::uuid$$,
  'devuelve cuántos entrenamientos ha borrado: todos los del horario menos esos ocho'
);

select is_empty(
  $$select id from team_schedules where id = current_setting('fx.s1')::uuid$$,
  'el horario ya no existe'
);

-- Las ocho se quedan como sesiones sueltas, con todo lo suyo.
select results_eq(
  $$select * from tests.kept_state()$$,
  $$values
    ('con notas',           'scheduled', true, 'Entrenamiento', 'Traer petos', false, false, 0, false),
    ('cancelada',           'cancelled', true, 'Entrenamiento', null,          false, false, 0, false),
    ('hecha',               'done',      true, 'Entrenamiento', null,          false, false, 0, false),
    ('con un ítem',         'scheduled', true, 'Entrenamiento', null,          false, false, 1, false),
    ('con objetivo',        'scheduled', true, 'Entrenamiento', null,          true,  false, 0, false),
    ('con otro título',     'scheduled', true, 'Tiro y bote',   null,          false, false, 0, false),
    ('empezada en directo', 'scheduled', true, 'Entrenamiento', null,          false, true,  0, false),
    ('ya pasada',           'scheduled', true, 'Entrenamiento', null,          false, false, 0, true)$$,
  'se quedan, sueltas (sin horario): la que tiene notas, un ítem, un objetivo, otro título o está empezada, la cancelada, la hecha y la pasada'
);

select is_empty(
  $$(select id, organization_id, team_id, kind, starts_at, ends_at, location, status, venue_id
     from before_del where id in (select k.id from tests.kept() as k))
    except
    select id, organization_id, team_id, kind, starts_at, ends_at, location, status, venue_id
    from public.events$$,
  'y lo único que cambia en ellas es que dejan de ser del horario'
);

select is(
  (select count(*)::int from event_changes where event_id in (select k.id from tests.kept() as k)),
  (select count(*)::int from before_del_changes where event_id in (select k.id from tests.kept() as k)),
  'conservan sus cambios registrados'
);

-- Las demás, fuera: el evento, su plan y sus cambios.
select is_empty(
  $$select b.id from before_del as b
    where b.schedule_id = current_setting('fx.s1')::uuid
      and b.id not in (select k.id from tests.kept() as k)
      and (exists (select 1 from public.events as e where e.id = b.id)
        or exists (select 1 from public.practice_plans as pp where pp.event_id = b.id)
        or exists (select 1 from public.event_changes as c where c.event_id = b.id))$$,
  'de las que nadie había tocado no queda ni el evento, ni el plan, ni sus cambios'
);

-- Y nada más: los del otro horario de T1 siguen siendo suyos, y los hechos a mano y los de los
-- demás equipos, igual.
select is_empty(
  $$(select * from before_del where schedule_id is distinct from current_setting('fx.s1')::uuid)
    except
    select * from public.events$$,
  'no toca los entrenamientos de otro horario, los hechos a mano ni los de otro equipo'
);

select results_eq(
  $$select (select count(*)::int from events where organization_id = current_setting('fx.club_a')::uuid),
           (select count(*)::int from practice_plans where organization_id = current_setting('fx.club_a')::uuid),
           (select count(*)::int from events where schedule_id = current_setting('fx.s1b')::uuid)$$,
  $$select (select count(*)::int from before_del) - current_setting('fx.deleted')::int,
           (select count(*)::int from before_del_plans) - current_setting('fx.deleted')::int,
           (select count(*)::int from before_del where schedule_id = current_setting('fx.s1b')::uuid)$$,
  'se han ido exactamente esos eventos y esos planes'
);

select tests.authenticate_as(current_setting('fx.admin')::uuid);

select throws_ok(
  $$select public.delete_team_schedule(current_setting('fx.s1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'quitar un horario que ya no existe es NOT_FOUND'
);

select throws_ok(
  $$select public.delete_team_schedule(gen_random_uuid())$$,
  'P0002', 'NOT_FOUND',
  'y uno que nunca existió, también'
);

-- ── El registro de cambios: qué se registra ──────────────────────────────────────────
-- c2, con una sesión y dos partidos de T2 (uno de ellos, de hace dos días), y las funciones de
-- siempre. Después de cada paso se mira solo lo que ese paso ha dejado.
select tests.mark_changes();
select tests.authenticate_as(current_setting('fx.c2')::uuid);

do $$
declare
  t2 constant uuid := current_setting('fx.t2')::uuid;
  v_past constant timestamptz := ((tests.today() - 2) + time '11:00') at time zone 'Europe/Madrid';
begin
  perform set_config('fx.e_ch', public.create_practice_session(
    t2, tests.slot(3, '16:00', 2), tests.slot(3, '17:00', 2), 'Cambios', null, null,
    'Pabellón 1')::text, true);
  perform set_config('fx.g_ch', public.create_game(
    t2, tests.slot(6, '11:00', 2), tests.slot(6, '12:30', 2), 'Rival de cambios', 'Liga', 'home',
    'Pabellón 1')::text, true);
  perform set_config('fx.g_old', public.create_game(
    t2, v_past, v_past + interval '90 minutes', 'Rival pasado', null, 'away',
    'Pabellón 1')::text, true);
  perform set_config('fx.g_old_start', v_past::text, true);
end
$$;

select is_empty(
  $$select * from tests.new_changes()$$,
  'crear una sesión o un partido no deja nada en el registro'
);

-- Una sesión.
select lives_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_ch')::uuid, tests.token(current_setting('fx.e_ch')::uuid),
      tests.slot(3, '16:00', 2), tests.slot(3, '17:00', 2), 'Cambios, retocada', null, null,
      'Pabellón 1', 'Con notas')$$,
  'guardar una sesión cambiando solo el título y las notas'
);

select is_empty(
  $$select * from tests.new_changes()$$,
  'guardar sin cambiar la hora ni el lugar no deja nada'
);

select lives_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_ch')::uuid, tests.token(current_setting('fx.e_ch')::uuid),
      tests.slot(3, '17:00', 2), tests.slot(3, '18:00', 2), 'Cambios, retocada', null, null,
      'Pabellón 1', 'Con notas')$$,
  'mover la hora de una sesión'
);

select results_eq(
  $$select * from tests.new_changes()$$,
  $$values (current_setting('fx.e_ch')::uuid, 'time', tests.slot(3, '16:00', 2),
            tests.slot(3, '17:00', 2), 'Pabellón 1')$$,
  'deja un cambio de hora con el inicio, el fin y el lugar de antes'
);

select tests.mark_changes();

select lives_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_ch')::uuid, tests.token(current_setting('fx.e_ch')::uuid),
      tests.slot(3, '17:00', 2), tests.slot(3, '18:00', 2), 'Cambios, retocada', null, null,
      'Pabellón 2', 'Con notas')$$,
  'cambiar solo el lugar'
);

select results_eq(
  $$select * from tests.new_changes()$$,
  $$values (current_setting('fx.e_ch')::uuid, 'location', tests.slot(3, '17:00', 2),
            tests.slot(3, '18:00', 2), 'Pabellón 1')$$,
  'deja un cambio de lugar, y ninguno de hora'
);

select tests.mark_changes();

select lives_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_ch')::uuid, tests.token(current_setting('fx.e_ch')::uuid),
      tests.slot(3, '16:00', 2), tests.slot(3, '17:00', 2), 'Cambios, retocada', null, null,
      'Parque del barrio', 'Con notas')$$,
  'cambiar la hora y el lugar a la vez'
);

select results_eq(
  $$select * from tests.new_changes() order by what$$,
  $$values (current_setting('fx.e_ch')::uuid, 'location', tests.slot(3, '17:00', 2),
            tests.slot(3, '18:00', 2), 'Pabellón 2'),
           (current_setting('fx.e_ch')::uuid, 'time', tests.slot(3, '17:00', 2),
            tests.slot(3, '18:00', 2), 'Pabellón 2')$$,
  'deja dos: uno de hora y uno de lugar'
);

select tests.mark_changes();

select lives_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_ch')::uuid, tests.token(current_setting('fx.e_ch')::uuid),
      tests.slot(3, '16:00', 2), tests.slot(3, '17:30', 2), 'Cambios, retocada', null, null,
      null, 'Con notas')$$,
  'alargar la sesión (solo el fin) y dejarla sin lugar'
);

select results_eq(
  $$select * from tests.new_changes() order by what$$,
  $$values (current_setting('fx.e_ch')::uuid, 'location', tests.slot(3, '16:00', 2),
            tests.slot(3, '17:00', 2), 'Parque del barrio'),
           (current_setting('fx.e_ch')::uuid, 'time', tests.slot(3, '16:00', 2),
            tests.slot(3, '17:00', 2), 'Parque del barrio')$$,
  'cambiar solo el fin es un cambio de hora, y quitar el lugar, uno de lugar'
);

select tests.mark_changes();

select lives_ok(
  $$select public.update_practice_session(
      current_setting('fx.e_ch')::uuid, tests.token(current_setting('fx.e_ch')::uuid),
      tests.slot(3, '16:00', 2), tests.slot(3, '17:30', 2), 'Cambios, retocada', null, null,
      'Pabellón 1', 'Con notas')$$,
  'poner lugar a una sesión que no tenía'
);

select results_eq(
  $$select * from tests.new_changes()$$,
  $$values (current_setting('fx.e_ch')::uuid, 'location', tests.slot(3, '16:00', 2),
            tests.slot(3, '17:30', 2), null::text)$$,
  'deja un cambio de lugar en el que antes no había ninguno'
);

-- Cancelar: una sola fila, aunque en la misma escritura cambien también el fin y el lugar.
select tests.mark_changes();

select is(
  tests.outcome($sql$update public.events
                     set status = 'cancelled', ends_at = ends_at + interval '5 minutes', location = 'Ninguno'
                     where id = current_setting('fx.e_ch')::uuid$sql$),
  'ok 1',
  'quien entrena cancela su sesión'
);

select results_eq(
  $$select * from tests.new_changes()$$,
  $$values (current_setting('fx.e_ch')::uuid, 'cancelled', tests.slot(3, '16:00', 2),
            tests.slot(3, '17:30', 2), 'Pabellón 1')$$,
  'cancelar deja una sola fila, `cancelled`, y ninguna de hora ni de lugar'
);

-- Un partido, igual.
select tests.mark_changes();

select lives_ok(
  $$select public.update_game(
      current_setting('fx.g_ch')::uuid, tests.slot(6, '11:00', 2), tests.slot(6, '12:30', 2),
      'Rival corregido', 'Copa', 'away', 'Pabellón 1', 'Presionan a toda pista')$$,
  'guardar un partido cambiando el rival, la competición y las notas'
);

select is_empty(
  $$select * from tests.new_changes()$$,
  'no deja nada'
);

select lives_ok(
  $$select public.update_game(
      current_setting('fx.g_ch')::uuid, tests.slot(6, '12:00', 2), tests.slot(6, '13:30', 2),
      'Rival corregido', 'Copa', 'away', 'Pabellón 1', null)$$,
  'mover la hora de un partido'
);

select results_eq(
  $$select * from tests.new_changes()$$,
  $$values (current_setting('fx.g_ch')::uuid, 'time', tests.slot(6, '11:00', 2),
            tests.slot(6, '12:30', 2), 'Pabellón 1')$$,
  'deja un cambio de hora'
);

select tests.mark_changes();

select lives_ok(
  $$select public.update_game(
      current_setting('fx.g_ch')::uuid, tests.slot(6, '12:00', 2), tests.slot(6, '13:30', 2),
      'Rival corregido', 'Copa', 'away', 'Pabellón 2', null)$$,
  'cambiar el lugar de un partido'
);

select results_eq(
  $$select * from tests.new_changes()$$,
  $$values (current_setting('fx.g_ch')::uuid, 'location', tests.slot(6, '12:00', 2),
            tests.slot(6, '13:30', 2), 'Pabellón 1')$$,
  'deja un cambio de lugar'
);

select tests.mark_changes();

select lives_ok(
  $$select public.update_game(
      current_setting('fx.g_ch')::uuid, tests.slot(6, '17:00', 2), tests.slot(6, '18:30', 2),
      'Rival corregido', 'Copa', 'away', 'Polideportivo del rival', null)$$,
  'cambiar la hora y el lugar de un partido a la vez'
);

select results_eq(
  $$select * from tests.new_changes() order by what$$,
  $$values (current_setting('fx.g_ch')::uuid, 'location', tests.slot(6, '12:00', 2),
            tests.slot(6, '13:30', 2), 'Pabellón 2'),
           (current_setting('fx.g_ch')::uuid, 'time', tests.slot(6, '12:00', 2),
            tests.slot(6, '13:30', 2), 'Pabellón 2')$$,
  'deja dos'
);

select tests.mark_changes();

select lives_ok(
  $$select public.cancel_game(current_setting('fx.g_ch')::uuid)$$,
  'cancelar un partido'
);

select results_eq(
  $$select * from tests.new_changes()$$,
  $$values (current_setting('fx.g_ch')::uuid, 'cancelled', tests.slot(6, '17:00', 2),
            tests.slot(6, '18:30', 2), 'Polideportivo del rival')$$,
  'deja una sola fila, `cancelled`'
);

-- ── El registro de cambios: qué no se registra ───────────────────────────────────────
-- Pasar a hecho no es un cambio. Y lo que cambie después en un evento que ya no está
-- programado (un partido ya jugado se puede corregir), tampoco.
select tests.mark_changes();

select lives_ok(
  $$select public.record_game_result(current_setting('fx.g_old')::uuid, 60, 50)$$,
  'apuntar el resultado de un partido ya empezado lo deja hecho'
);

select is_empty(
  $$select * from tests.new_changes()$$,
  'pasar a hecho no deja nada en el registro'
);

select lives_ok(
  $$select public.update_game(
      current_setting('fx.g_old')::uuid,
      current_setting('fx.g_old_start')::timestamptz + interval '1 hour',
      current_setting('fx.g_old_start')::timestamptz + interval '3 hours',
      'Rival pasado', null, 'away', 'Pabellón 2', null)$$,
  'corregir la hora y el lugar de un partido ya jugado'
);

select results_eq(
  $$select e.status::text, e.location, (select count(*)::int from tests.new_changes())
    from events as e where e.id = current_setting('fx.g_old')::uuid$$,
  $$values ('done', 'Pabellón 2', 0)$$,
  'cambiar un evento que ya no está programado no deja nada'
);

-- Una sesión cancelada ya no la cambia quien entrena: no hay nada que registrar.
select results_eq(
  $$select tests.outcome($sql$update public.events set location = 'Otra vez'
                               where id = current_setting('fx.e_ch')::uuid$sql$),
           (select count(*)::int from tests.new_changes())$$,
  $$values ('ok 0', 0)$$,
  'una sesión cancelada no se cambia, y no deja nada'
);

-- Sin usuario (lo que hace el seed o un script): mover, cambiar de lugar y cancelar un
-- entrenamiento programado de T2 no deja nada.
reset role;
select tests.no_user();

do $$
begin
  perform set_config('fx.e_seed',
    (select e.id::text from public.events as e
     where e.schedule_id = current_setting('fx.s2')::uuid
     order by e.starts_at desc limit 1), true);
end
$$;

update events
set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '2 hours', location = 'Sin usuario'
where id = current_setting('fx.e_seed')::uuid;

update events set status = 'cancelled' where id = current_setting('fx.e_seed')::uuid;

select results_eq(
  $$select e.status::text, e.location, tests.local(e.starts_at)::time, (select count(*)::int from tests.new_changes())
    from events as e where e.id = current_setting('fx.e_seed')::uuid$$,
  $$values ('cancelled', 'Sin usuario', time '19:00', 0)$$,
  'un cambio hecho sin usuario no deja nada en el registro'
);

-- ── El registro de cambios: nadie lo escribe y quién lo lee ──────────────────────────
do $$
begin
  perform set_config('fx.n_ch_a', (select count(*)::text from public.event_changes
    where organization_id = current_setting('fx.club_a')::uuid), true);
  perform set_config('fx.n_ch_t1', (select count(*)::text from public.event_changes
    where team_id = current_setting('fx.t1')::uuid), true);
  perform set_config('fx.n_ch_t2', (select count(*)::text from public.event_changes
    where team_id = current_setting('fx.t2')::uuid), true);
end
$$;

select ok(
  current_setting('fx.n_ch_t1')::int > 0 and current_setting('fx.n_ch_t2')::int > 0
    and current_setting('fx.n_ch_a')::int > current_setting('fx.n_ch_t1')::int + current_setting('fx.n_ch_t2')::int,
  'control: hay cambios registrados de T1, de T2 y de otros equipos de A'
);

select tests.authenticate_as(current_setting('fx.admin')::uuid);

select results_eq(
  $$select a.op, tests.outcome(a.code) from tests.change_attempts() as a order by a.n$$,
  $$values ('insert', '42501 privilegio'), ('update', '42501 privilegio'),
           ('delete', '42501 privilegio')$$,
  'la dirección no escribe el registro de cambios por la API (42501)'
);

select results_eq(
  $$select count(*)::int, count(*) filter (where organization_id = current_setting('fx.club_a')::uuid)::int
    from event_changes$$,
  $$values (current_setting('fx.n_ch_a')::int, current_setting('fx.n_ch_a')::int)$$,
  'la dirección lee todos los cambios de su club, y ninguno de otro'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  $$select a.op, tests.outcome(a.code) from tests.change_attempts() as a order by a.n$$,
  $$values ('insert', '42501 privilegio'), ('update', '42501 privilegio'),
           ('delete', '42501 privilegio')$$,
  'quien entrena tampoco lo escribe (42501)'
);

select results_eq(
  $$select count(*)::int, count(*) filter (where team_id = current_setting('fx.t2')::uuid)::int
    from event_changes$$,
  $$values (current_setting('fx.n_ch_t2')::int, current_setting('fx.n_ch_t2')::int)$$,
  'quien entrena lee los cambios de los eventos de su equipo, y no los de otro equipo del club'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$select count(*)::int, count(*) filter (where team_id = current_setting('fx.t1')::uuid)::int
    from event_changes$$,
  $$values (current_setting('fx.n_ch_t1')::int, current_setting('fx.n_ch_t1')::int)$$,
  'el entrenador de otro equipo solo lee los del suyo'
);

select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select is_empty(
  $$select id from event_changes$$,
  'un jugador no lee cambios, tampoco los de su equipo'
);

select tests.authenticate_as(current_setting('fx.ab')::uuid);

select results_eq(
  $$select event_id from event_changes$$,
  $$values (current_setting('fx.eb1')::uuid)$$,
  'la dirección de B solo lee los cambios de B'
);

select tests.authenticate_as(current_setting('fx.cb')::uuid);

select results_eq(
  $$select event_id from event_changes$$,
  $$values (current_setting('fx.eb1')::uuid)$$,
  'quien entrena en B solo lee los de su equipo'
);

select tests.clear_authentication();

select throws_ok(
  $$select id from event_changes$$,
  '42501', null,
  'anon no lee el registro de cambios (42501)'
);

-- ── El club: nada de esto cruza a otro ───────────────────────────────────────────────
-- La dirección de B, con ids de A: las tres funciones responden NOT_FOUND. Y en su propio
-- equipo no puede usar una pista de A.
select tests.authenticate_as(current_setting('fx.ab')::uuid);

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.t1')::uuid, 3::smallint, '09:00', 60::smallint)$$,
  'P0002', 'NOT_FOUND',
  'la dirección de B no crea horarios en un equipo de A (NOT_FOUND)'
);

select throws_ok(
  $$select public.update_team_schedule(
      current_setting('fx.s1b')::uuid, 3::smallint, '09:00', 60::smallint)$$,
  'P0002', 'NOT_FOUND',
  'ni cambia un horario de A (NOT_FOUND)'
);

select throws_ok(
  $$select public.delete_team_schedule(current_setting('fx.s1b')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'ni lo quita (NOT_FOUND)'
);

select throws_ok(
  $$select public.create_team_schedule(
      current_setting('fx.tb')::uuid, 3::smallint, '09:00', 60::smallint,
      current_setting('fx.v1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'ni usa una pista de A en un horario de su propio equipo (NOT_FOUND)'
);

select throws_ok(
  $$select public.update_team_schedule(
      current_setting('fx.sb')::uuid, 2::smallint, '18:00', 75::smallint,
      current_setting('fx.v1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'ni al cambiar uno suyo (NOT_FOUND)'
);

select tests.authenticate_as(current_setting('fx.cb')::uuid);

select results_eq(
  $$select a.fn, tests.outcome(a.code)
    from (values
      (1, 'create', format('select public.create_team_schedule(%L::uuid, 3::smallint, time ''09:00'', 60::smallint)',
                           current_setting('fx.t1'))),
      (2, 'update', format('select public.update_team_schedule(%L::uuid, 3::smallint, time ''09:00'', 60::smallint)',
                           current_setting('fx.s1b'))),
      (3, 'delete', format('select public.delete_team_schedule(%L::uuid)', current_setting('fx.s1b')))
    ) as a (n, fn, code)
    order by a.n$$,
  $$values ('create', 'P0002'), ('update', 'P0002'), ('delete', 'P0002')$$,
  'quien entrena en B recibe NOT_FOUND de las tres'
);

reset role;

select results_eq(
  $$select weekday::int, start_time, duration_minutes::int, venue_id
    from team_schedules where id = current_setting('fx.s1b')::uuid$$,
  $$values (5, time '17:00', 60, null::uuid)$$,
  'el horario de A sigue como estaba'
);

select is(
  tests.snapshot_b(), current_setting('fx.before_b'),
  'tras todo lo anterior, nada del club B ha cambiado: ni pistas, ni horarios, ni eventos, ni cambios, ni planes'
);

-- ── Sesiones tocadas a mano: un horario no las pisa ──────────────────────────────────
-- Lo que la primera versión de la migración hacía mal y estos tests destaparon: cambiar o quitar
-- un horario cuando quien entrena ya había tocado alguna de sus sesiones. Van al final y en un
-- equipo aparte (T7, que entrena c3; lunes a las 18:00, 75 minutos, sin pista) para no depender
-- de nada de lo anterior.
select tests.authenticate_as(current_setting('fx.admin')::uuid);

do $$
begin
  perform set_config('fx.s7', public.create_team_schedule(
    current_setting('fx.t7')::uuid, 1::smallint, '18:00', 75::smallint) ->> 'id', true);
end
$$;

-- 1. Quien entrena alarga a mano una sesión del horario (de 75 a 120 minutos, sin moverla de
--    hora). Después la dirección guarda el horario SIN CAMBIAR NADA: devuelve 0 y no toca la
--    sesión. La duración de una sesión solo sigue al horario mientras es la del horario.
select tests.authenticate_as(current_setting('fx.c3')::uuid);

do $$
begin
  perform set_config('fx.e7a',
    (select e.id::text from public.events as e
     where e.schedule_id = current_setting('fx.s7')::uuid and e.starts_at = tests.slot(1, '18:00', 3)),
    true);

  perform public.update_practice_session(
    current_setting('fx.e7a')::uuid, tests.token(current_setting('fx.e7a')::uuid),
    tests.slot(1, '18:00', 3), tests.slot(1, '20:00', 3), 'Entrenamiento', null, null, null, null);
end
$$;

select tests.authenticate_as(current_setting('fx.admin')::uuid);

do $$
begin
  perform set_config('fx.moved7', public.update_team_schedule(
    current_setting('fx.s7')::uuid, 1::smallint, '18:00', 75::smallint)::text, true);
end
$$;

select results_eq(
  $$select current_setting('fx.moved7')::int, e.ends_at - e.starts_at
    from events as e where e.id = current_setting('fx.e7a')::uuid$$,
  $$values (0, interval '120 minutes')$$,
  'guardar un horario sin cambiarlo no toca la sesión que alguien alargó a mano'
);

-- 2. Quien entrena pasa a mano la sesión de la 5.ª semana al lunes de la 6.ª, a las 19:30
--    (en la 6.ª quedan dos del horario: la suya de las 18:00 y esta). Después la dirección
--    cambia el horario a las 19:30. Vale: la de las 18:00 de esa semana no cabe en un hueco
--    ya ocupado y se queda donde está. (No hay un único de horario e inicio: daba un 23505 que
--    no era el «horario repetido» del contrato, y el horario no se podía cambiar.)
select tests.authenticate_as(current_setting('fx.c3')::uuid);

do $$
declare
  v_event constant uuid := (
    select e.id from public.events as e
    where e.schedule_id = current_setting('fx.s7')::uuid and e.starts_at = tests.slot(1, '18:00', 5));
begin
  perform public.update_practice_session(
    v_event, tests.token(v_event), tests.slot(1, '19:30', 6), tests.slot(1, '20:45', 6),
    'Entrenamiento', null, null, null, null);
end
$$;

select tests.authenticate_as(current_setting('fx.admin')::uuid);

select lives_ok(
  $$select public.update_team_schedule(
      current_setting('fx.s7')::uuid, 1::smallint, '19:30', 75::smallint)$$,
  'cambiar un horario a una hora en la que ya hay una sesión suya movida a mano no da un 23505'
);

-- 3. Quien entrena tiene una sesión hecha a mano el miércoles de la 10.ª semana a las 18:00.
--    Después la dirección pasa el horario a los miércoles a las 18:00. Como al crearlo, un
--    horario no pone un entrenamiento donde el equipo ya tiene uno: el de esa semana se queda
--    donde estaba.
select tests.authenticate_as(current_setting('fx.c3')::uuid);

do $$
begin
  perform public.create_practice_session(
    current_setting('fx.t7')::uuid, tests.slot(3, '18:00', 10), tests.slot(3, '19:15', 10),
    'Extra a mano');
end
$$;

select tests.authenticate_as(current_setting('fx.admin')::uuid);

do $$
begin
  perform public.update_team_schedule(
    current_setting('fx.s7')::uuid, 3::smallint, '18:00', 75::smallint);
end
$$;

select is_empty(
  $$select tests.local(starts_at), count(*)::int
    from events
    where team_id = current_setting('fx.t7')::uuid and kind = 'practice' and status <> 'cancelled'
    group by starts_at
    having count(*) > 1$$,
  'cambiar un horario no deja al equipo con dos entrenamientos a la misma hora'
);

-- 4. Quien tiene una sesión abierta en el formulario guarda con la copia de antes del cambio de
--    horario: STALE_COPY. Sin esto, su guardado devolvía la sesión a la hora antigua sin avisar.
do $$
declare
  v_event uuid;
begin
  select e.id
  into v_event
  from public.events as e
  where e.schedule_id = current_setting('fx.s7')::uuid
    and e.status = 'scheduled'
    and e.starts_at > now() + interval '30 days'
    and (e.starts_at at time zone 'Europe/Madrid')::time = '18:00'
    and extract(isodow from e.starts_at at time zone 'Europe/Madrid')::int = 3
  order by e.starts_at
  limit 1;

  if v_event is null then
    raise exception 'el test necesita una sesión del horario en su sitio';
  end if;

  perform set_config('fx.e7open', v_event::text, true);
  perform set_config('fx.e7copy', tests.token(v_event)::text, true);
  perform set_config('fx.moved7b', public.update_team_schedule(
    current_setting('fx.s7')::uuid, 3::smallint, '18:15', 75::smallint)::text, true);
end
$$;

select cmp_ok(
  current_setting('fx.moved7b')::int, '>', 0,
  'el cambio de horario mueve sesiones'
);

select isnt(
  tests.token(current_setting('fx.e7open')::uuid), current_setting('fx.e7copy')::timestamptz,
  'y avanza la copia del plan de cada sesión que mueve'
);

select tests.authenticate_as(current_setting('fx.c3')::uuid);

select throws_ok(
  $$select public.update_practice_session(
      current_setting('fx.e7open')::uuid, current_setting('fx.e7copy')::timestamptz,
      (select starts_at - interval '15 minutes' from events where id = current_setting('fx.e7open')::uuid),
      (select ends_at - interval '15 minutes' from events where id = current_setting('fx.e7open')::uuid),
      'Entrenamiento', null, null, null, 'Notas escritas con la sesión abierta')$$,
  'P0001', 'STALE_COPY',
  'quien guarda una sesión con la copia de antes del cambio de horario recibe STALE_COPY'
);

select tests.authenticate_as(current_setting('fx.admin')::uuid);

-- 5. Pasar el horario a otro día de la semana puede sacar una sesión de la temporada, por
--    delante o por detrás: esa no se mueve.
do $$
begin
  perform public.update_team_schedule(
    current_setting('fx.s7')::uuid, 7::smallint, '18:00', 75::smallint);
  perform public.update_team_schedule(
    current_setting('fx.s7')::uuid, 1::smallint, '18:00', 75::smallint);
  perform public.update_team_schedule(
    current_setting('fx.s7')::uuid, 7::smallint, '18:00', 75::smallint);
end
$$;

select is_empty(
  $$select tests.local(e.starts_at)
    from events as e
    join teams as t on t.id = e.team_id
    join seasons as s on s.id = t.season_id
    where e.schedule_id = current_setting('fx.s7')::uuid
      and ((e.starts_at at time zone 'Europe/Madrid')::date > s.ends_on
        or (e.starts_at at time zone 'Europe/Madrid')::date < s.starts_on)$$,
  'cambiar un horario no deja ninguna sesión fuera de la temporada, ni antes ni después'
);

-- 6. Quitar el horario no borra la sesión que quien entrena movió a mano, aunque no le haya
--    puesto contenido: reprogramarla ya es haberla tocado. Las que siguen en su sitio y sin
--    tocar sí se borran.
select tests.authenticate_as(current_setting('fx.c3')::uuid);

do $$
declare
  v_event uuid;
begin
  -- Una del horario que sigue en su sitio, sin tocar, de aquí a unas semanas.
  select e.id
  into v_event
  from public.events as e
  join public.practice_plans as pp on pp.event_id = e.id
  where e.schedule_id = current_setting('fx.s7')::uuid
    and e.status = 'scheduled'
    and e.starts_at > now() + interval '60 days'
    and (e.starts_at at time zone 'Europe/Madrid')::time = '18:00'
    and extract(isodow from e.starts_at at time zone 'Europe/Madrid')::int = 7
    and pp.notes is null
  order by e.starts_at
  limit 1;

  if v_event is null then
    raise exception 'el test necesita una sesión del horario en su sitio';
  end if;

  perform set_config('fx.e7moved', v_event::text, true);
  perform set_config('fx.e7kept',
    (select count(*)::text from public.events as e
     where e.team_id = current_setting('fx.t7')::uuid and e.schedule_id is null), true);

  -- La pasa al día siguiente por la mañana, sin tocar nada más.
  perform public.update_practice_session(
    v_event, tests.token(v_event),
    (select e.starts_at + interval '16 hours' from public.events as e where e.id = v_event),
    (select e.ends_at + interval '16 hours' from public.events as e where e.id = v_event),
    'Entrenamiento', null, null, null, null);
end
$$;

select tests.authenticate_as(current_setting('fx.admin')::uuid);

select lives_ok(
  $$select public.delete_team_schedule(current_setting('fx.s7')::uuid)$$,
  'la dirección quita el horario'
);

select results_eq(
  $$select (select count(*)::int from events where id = current_setting('fx.e7moved')::uuid and schedule_id is null),
           (select count(*)::int from events
            where team_id = current_setting('fx.t7')::uuid and kind = 'practice' and status = 'scheduled'
              and starts_at > now()
              and (starts_at at time zone 'Europe/Madrid')::time = '18:00'
              and extract(isodow from starts_at at time zone 'Europe/Madrid')::int = 7
              and not exists (select 1 from practice_plans as pp
                              where pp.event_id = events.id and pp.notes is not null))$$,
  $$values (1, 0)$$,
  'la sesión que alguien movió a mano se queda, como suelta; las que seguían en su sitio sin tocar se borran'
);

-- ── Un horario no crea más de un año de entrenamientos ───────────────────────────────
-- Una temporada con el final a diez años vista (un error, o adrede): el horario crea los de un
-- año y no más.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_season uuid;
  v_team   uuid;
begin
  v_season := public.create_season(club_a, 'Sin final', current_date, current_date + 3650);
  insert into teams (organization_id, season_id, category_id, name)
  values (club_a, v_season, (select id from categories where organization_id = club_a order by sort limit 1), 'Eterno A')
  returning id into v_team;

  perform set_config('fx.long', public.create_team_schedule(v_team, 2::smallint, '18:00', 60::smallint) ->> 'created', true);
end
$$;

select cmp_ok(
  current_setting('fx.long')::int, '<=', 54,
  'un horario crea como mucho un año de entrenamientos, dure lo que dure la temporada'
);

select * from finish();

rollback;
