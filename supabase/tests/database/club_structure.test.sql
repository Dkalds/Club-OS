-- La estructura del club, en manos de su dirección: temporadas, categorías, equipos, cuerpos
-- técnicos, plantillas y personas (`20270302000100_club_structure.sql`).
--
-- Qué se verifica aquí:
--   · Quién escribe en las seis tablas: la dirección del club de la fila, operación por
--     operación. No escriben: quien entrena (tampoco el entrenador principal en su propio
--     equipo, su plantilla y su cuerpo técnico), un jugador, la dirección de OTRO club, quien
--     dirige otro club y aquí solo entrena, una dirección revocada, ni `anon`.
--   · Nada apunta a otro club: la dirección de A no crea una fila de A que use una temporada,
--     una categoría, un equipo o una persona de B (23503), ni una fila que diga ser de B.
--   · Las columnas que no se conceden: el club de una fila, la temporada de un equipo, y el
--     equipo y la persona de una plantilla o de un cuerpo técnico. `people` no se borra.
--   · Lo que la base garantiza: fechas de temporada, nombres de 1 a 60, posición hasta 30,
--     nombres sin repetir (temporadas y categorías por club, equipos por temporada; sin
--     distinguir mayúsculas ni espacios alrededor) y el dorsal único por equipo.
--   · La temporada actual no se borra; una con equipos, tampoco.
--   · Las cuatro funciones (`create_season`, `set_current_season`, `delete_team`,
--     `add_new_player`): lo que hacen, a quién contestan NOT_FOUND y el orden (C26):
--     NOT_FOUND antes que cualquier error de datos y antes que IN_USE; `anon` → 42501.
--   · Lo que lee quien entrena no cambia: ve a quien llega a su equipo y no a quien llega a
--     otro.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*` vienen
-- de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al final. Los
-- datos son ficticios y solo de este test; de las personas solo hay año de nacimiento.
begin;

select plan(144);

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

-- Los diecisiete intentos de escribir en el club A: por cada tabla, cada operación que la
-- migración concede. Los cambios y los borrados van a por filas que la dirección de A sí
-- podría cambiar o borrar (`s_old` no es la actual ni tiene equipos; `cat_free` y `t_past` no
-- los usa nadie), así que un «ok 0» es de la política, no de una clave foránea.
create function tests.attempts()
returns table (n int, op text, code text)
language sql
set search_path = ''
as $$
  values
    (1, 'people insert',
      $sql$insert into public.people (organization_id, first_name, last_name, birth_year)
           values (current_setting('fx.club_a')::uuid, 'Intrusa', 'Ficticia', 2015)$sql$),
    (2, 'people update',
      $sql$update public.people set last_name = 'Cambiado'
           where organization_id = current_setting('fx.club_a')::uuid$sql$),
    (3, 'seasons insert',
      $sql$insert into public.seasons (organization_id, name, starts_on, ends_on)
           values (current_setting('fx.club_a')::uuid, '2031/32', '2031-09-01', '2032-06-30')$sql$),
    (4, 'seasons update',
      $sql$update public.seasons set ends_on = ends_on + 1
           where organization_id = current_setting('fx.club_a')::uuid$sql$),
    (5, 'seasons delete',
      $sql$delete from public.seasons where id = current_setting('fx.s_old')::uuid$sql$),
    (6, 'categories insert',
      $sql$insert into public.categories (organization_id, name, age_band, sort)
           values (current_setting('fx.club_a')::uuid, 'Intrusa', 'U12', 99)$sql$),
    (7, 'categories update',
      $sql$update public.categories set sort = sort + 1
           where organization_id = current_setting('fx.club_a')::uuid$sql$),
    (8, 'categories delete',
      $sql$delete from public.categories where id = current_setting('fx.cat_free')::uuid$sql$),
    (9, 'teams insert',
      $sql$insert into public.teams (organization_id, season_id, category_id, name)
           values (current_setting('fx.club_a')::uuid, current_setting('fx.s_a')::uuid,
                   current_setting('fx.cat_ale')::uuid, 'Intruso A')$sql$),
    (10, 'teams update',
      $sql$update public.teams set name = name || ' bis'
           where organization_id = current_setting('fx.club_a')::uuid$sql$),
    (11, 'teams delete',
      $sql$delete from public.teams where id = current_setting('fx.t_past')::uuid$sql$),
    (12, 'team_staff insert',
      $sql$insert into public.team_staff (organization_id, team_id, person_id, staff_role)
           values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
                   current_setting('fx.p_free')::uuid, 'assistant')$sql$),
    (13, 'team_staff update',
      $sql$update public.team_staff set staff_role = 'assistant'
           where organization_id = current_setting('fx.club_a')::uuid$sql$),
    (14, 'team_staff delete',
      $sql$delete from public.team_staff
           where organization_id = current_setting('fx.club_a')::uuid$sql$),
    (15, 'team_players insert',
      $sql$insert into public.team_players (organization_id, team_id, person_id, jersey_number)
           values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
                   current_setting('fx.p_free')::uuid, 9)$sql$),
    (16, 'team_players update',
      $sql$update public.team_players set position = 'Pívot'
           where organization_id = current_setting('fx.club_a')::uuid$sql$),
    (17, 'team_players delete',
      $sql$delete from public.team_players
           where organization_id = current_setting('fx.club_a')::uuid$sql$);
$$;

-- De esos intentos, los que no acaban como se espera: las altas con `on_insert` y los cambios
-- y borrados con `on_rest`. Vacío quiere decir que nadie escribió nada.
create function tests.surprises(on_insert text, on_rest text)
returns table (op text, outcome text)
language sql
set search_path = ''
as $$
  select a.op, o.outcome
  from tests.attempts() as a
  cross join lateral tests.outcome(a.code) as o (outcome)
  where o.outcome <> case when a.op like '% insert' then surprises.on_insert else surprises.on_rest end
  order by a.n;
$$;

-- Una huella de las seis tablas enteras, las vea o no quien llama: para comprobar que tras
-- todos los intentos de quien no debe no ha cambiado ni una fila.
create function tests.snapshot()
returns text
language sql
security definer
set search_path = ''
as $$
  select md5(concat_ws('#',
    (select string_agg(x::text, ',' order by x.id) from public.people as x),
    (select string_agg(x::text, ',' order by x.id) from public.seasons as x),
    (select string_agg(x::text, ',' order by x.id) from public.categories as x),
    (select string_agg(x::text, ',' order by x.id) from public.teams as x),
    (select string_agg(x::text, ',' order by x.team_id, x.person_id) from public.team_staff as x),
    (select string_agg(x::text, ',' order by x.team_id, x.person_id) from public.team_players as x)
  ));
$$;

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A
--   Temporadas: `s_a` «2026/27» (actual), `s_old` «2025/26» (sin equipos) y `s_past`
--   «2024/25» (con un equipo, `t_past` «Viejo A», sin nadie).
--   Categorías: Alevín, Benjamín y Cadete (`cat_free`, sin equipos).
--   T1 «Alevín A»:   staff c1 (head coach) y as1 (ayudante, sin cuenta); jugador p1 (#4)
--   T2 «Benjamín A»: staff c2 (head coach); jugador p2 (#4). Tiene un entrenamiento.
--   `libre` es una persona sin equipo. adminA dirige el club. `jugador` es la cuenta de p1.
--   `ex` fue dirección: su membresía está revocada. `multi` solo entrena aquí, sin equipo.
-- Club B
--   Temporada `s_b` «2026/27» (actual): el mismo nombre que en A, en otro club, vale.
--   TB «Infantil A»: staff cb; jugador pb (#7). Lo dirigen adminB y `multi`.
-- Club C
--   Sin nada: solo su dirección, adminC. Sirve para la primera temporada de un club.
--
-- `people.first_name` hace de clave para leer las aserciones. Los ids quedan en ajustes
-- `fx.*` de la transacción.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  club_c constant uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

  u_admin uuid := tests.create_user('admin@clubstructure.pgtap.test');
  u_c1    uuid := tests.create_user('c1@clubstructure.pgtap.test');
  u_c2    uuid := tests.create_user('c2@clubstructure.pgtap.test');
  u_jugad uuid := tests.create_user('jugador@clubstructure.pgtap.test');
  u_ex    uuid := tests.create_user('ex@clubstructure.pgtap.test');
  u_multi uuid := tests.create_user('multi@clubstructure.pgtap.test');
  u_ab    uuid := tests.create_user('admin-b@clubstructure.pgtap.test');
  u_ac    uuid := tests.create_user('admin-c@clubstructure.pgtap.test');

  p_c1   constant uuid := gen_random_uuid();
  p_as1  constant uuid := gen_random_uuid();
  p_c2   constant uuid := gen_random_uuid();
  p_p1   constant uuid := gen_random_uuid();
  p_p2   constant uuid := gen_random_uuid();
  p_free constant uuid := gen_random_uuid();
  p_cb   constant uuid := gen_random_uuid();
  p_pb   constant uuid := gen_random_uuid();

  s_a    constant uuid := gen_random_uuid();
  s_old  constant uuid := gen_random_uuid();
  s_past constant uuid := gen_random_uuid();
  s_b    constant uuid := gen_random_uuid();

  cat_ale  constant uuid := gen_random_uuid();
  cat_ben  constant uuid := gen_random_uuid();
  cat_free constant uuid := gen_random_uuid();
  cat_b    constant uuid := gen_random_uuid();

  t1     constant uuid := gen_random_uuid();
  t2     constant uuid := gen_random_uuid();
  t_past constant uuid := gen_random_uuid();
  tb     constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B'),
    (club_c, 'club-c', 'Club C');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1,   club_a, 'c1',    'Ficticia', null),
    (p_as1,  club_a, 'as1',   'Ficticio', null),
    (p_c2,   club_a, 'c2',    'Ficticia', null),
    (p_p1,   club_a, 'p1',    'Ficticio', 2015),
    (p_p2,   club_a, 'p2',    'Ficticia', 2016),
    (p_free, club_a, 'libre', 'Ficticio', 2015),
    (p_cb,   club_b, 'cb',    'Ficticio', null),
    (p_pb,   club_b, 'pb',    'Ficticia', 2013);

  insert into memberships (organization_id, user_id, role, person_id, status) values
    (club_a, u_admin, 'admin',  null, 'active'),
    (club_a, u_c1,    'coach',  p_c1, 'active'),
    (club_a, u_c2,    'coach',  p_c2, 'active'),
    (club_a, u_jugad, 'player', p_p1, 'active'),
    (club_a, u_ex,    'admin',  null, 'revoked'),
    (club_a, u_multi, 'coach',  null, 'active'),
    (club_b, u_multi, 'admin',  null, 'active'),
    (club_b, u_ab,    'admin',  null, 'active'),
    (club_c, u_ac,    'admin',  null, 'active');

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (s_a,    club_a, '2026/27', '2026-09-01', '2027-06-30', true),
    (s_old,  club_a, '2025/26', '2025-09-01', '2026-06-30', false),
    (s_past, club_a, '2024/25', '2024-09-01', '2025-06-30', false),
    (s_b,    club_b, '2026/27', '2026-09-01', '2027-06-30', true);

  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_ben,  club_a, 'Benjamín', 'U10', 10),
    (cat_ale,  club_a, 'Alevín',   'U12', 20),
    (cat_free, club_a, 'Cadete',   'U16', 30),
    (cat_b,    club_b, 'Infantil', 'U14', 10);

  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1,     club_a, s_a,    cat_ale, 'Alevín A'),
    (t2,     club_a, s_a,    cat_ben, 'Benjamín A'),
    (t_past, club_a, s_past, cat_ale, 'Viejo A'),
    (tb,     club_b, s_b,    cat_b,   'Infantil A');

  insert into team_staff (organization_id, team_id, person_id, staff_role) values
    (club_a, t1, p_c1,  'head_coach'),
    (club_a, t1, p_as1, 'assistant'),
    (club_a, t2, p_c2,  'head_coach'),
    (club_b, tb, p_cb,  'head_coach');

  -- p1 y p2 llevan el mismo dorsal en equipos distintos: el dorsal es único por equipo.
  insert into team_players (organization_id, team_id, person_id, jersey_number, position) values
    (club_a, t1, p_p1, 4, 'Base'),
    (club_a, t2, p_p2, 4, 'Alero'),
    (club_b, tb, p_pb, 7, 'Alero');

  -- T2 ya se usa: tiene un entrenamiento. `delete_team` no lo borra.
  insert into events (organization_id, team_id, kind, starts_at, ends_at) values
    (club_a, t2, 'practice', '2026-10-06T16:00:00Z', '2026-10-06T17:15:00Z');

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.club_c', club_c::text, true);
  perform set_config('fx.admin', u_admin::text, true);
  perform set_config('fx.c1',    u_c1::text,    true);
  perform set_config('fx.c2',    u_c2::text,    true);
  perform set_config('fx.jugad', u_jugad::text, true);
  perform set_config('fx.ex',    u_ex::text,    true);
  perform set_config('fx.multi', u_multi::text, true);
  perform set_config('fx.ab',    u_ab::text,    true);
  perform set_config('fx.ac',    u_ac::text,    true);
  perform set_config('fx.p_c1',   p_c1::text,   true);
  perform set_config('fx.p_p1',   p_p1::text,   true);
  perform set_config('fx.p_p2',   p_p2::text,   true);
  perform set_config('fx.p_free', p_free::text, true);
  perform set_config('fx.p_cb',   p_cb::text,   true);
  perform set_config('fx.p_pb',   p_pb::text,   true);
  perform set_config('fx.s_a',    s_a::text,    true);
  perform set_config('fx.s_old',  s_old::text,  true);
  perform set_config('fx.s_past', s_past::text, true);
  perform set_config('fx.s_b',    s_b::text,    true);
  perform set_config('fx.cat_ale',  cat_ale::text,  true);
  perform set_config('fx.cat_ben',  cat_ben::text,  true);
  perform set_config('fx.cat_free', cat_free::text, true);
  perform set_config('fx.cat_b',    cat_b::text,    true);
  perform set_config('fx.t1',     t1::text,     true);
  perform set_config('fx.t2',     t2::text,     true);
  perform set_config('fx.t_past', t_past::text, true);
  perform set_config('fx.tb',     tb::text,     true);

  perform set_config('fx.before', tests.snapshot(), true);
end
$$;

-- ── Las cuatro funciones, en el catálogo ─────────────────────────────────────────────
-- `delete_team` y `add_new_player` son `security invoker`: escriben con la sesión de quien
-- llama, así que mandan las políticas. `create_season` y `set_current_season` son `security
-- definer`: son las únicas que escriben `seasons.is_current`, que nadie tiene concedida.
select results_eq(
  $$select f.proname::text collate "default", f.prosecdef from pg_proc as f
    where f.pronamespace = 'public'::regnamespace
      and f.proname in ('create_season', 'set_current_season', 'delete_team', 'add_new_player')
      and f.proconfig = array['search_path=""']
    order by 1$$,
  $$values ('add_new_player', false), ('create_season', true),
           ('delete_team', false), ('set_current_season', true)$$,
  'dos son security invoker y las dos de la temporada actual, security definer; todas con search_path vacío'
);

select results_eq(
  $$select count(*)::int from pg_proc as f
    where f.pronamespace = 'public'::regnamespace
      and f.proname in ('create_season', 'set_current_season', 'delete_team', 'add_new_player')
      and has_function_privilege('authenticated', f.oid, 'execute')$$,
  array[4],
  'authenticated ejecuta las cuatro'
);

select is_empty(
  $$select f.proname::text, r.rol
    from pg_proc as f
    cross join unnest(array['anon', 'service_role']) as r (rol)
    where f.pronamespace = 'public'::regnamespace
      and f.proname in ('create_season', 'set_current_season', 'delete_team', 'add_new_player')
      and has_function_privilege(r.rol, f.oid, 'execute')$$,
  'ni anon ni service_role ejecutan ninguna'
);

-- ── Quién no escribe ─────────────────────────────────────────────────────────────────

-- c1: entrena en el club A y es el entrenador principal de T1. Ve su equipo, su plantilla y
-- su cuerpo técnico, y no cambia nada de ellos. Las altas las para la política (privilegio
-- hay); los cambios y los borrados no encuentran ninguna fila.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  $$select a.op, tests.outcome(a.code) from tests.attempts() as a order by a.n$$,
  $$values ('people insert',       '42501 política'),
           ('people update',       'ok 0'),
           ('seasons insert',      '42501 política'),
           ('seasons update',      'ok 0'),
           ('seasons delete',      'ok 0'),
           ('categories insert',   '42501 política'),
           ('categories update',   'ok 0'),
           ('categories delete',   'ok 0'),
           ('teams insert',        '42501 política'),
           ('teams update',        'ok 0'),
           ('teams delete',        'ok 0'),
           ('team_staff insert',   '42501 política'),
           ('team_staff update',   'ok 0'),
           ('team_staff delete',   'ok 0'),
           ('team_players insert', '42501 política'),
           ('team_players update', 'ok 0'),
           ('team_players delete', 'ok 0')$$,
  'quien entrena no escribe en ninguna de las seis tablas, tampoco en su propio equipo'
);

select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2030/31', '2030-09-01', '2031-06-30')$$,
  'P0002', 'NOT_FOUND',
  'quien entrena no crea temporadas (NOT_FOUND)'
);

select throws_ok(
  $$select public.set_current_season(current_setting('fx.s_old')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'quien entrena no cambia la temporada actual (NOT_FOUND)'
);

select throws_ok(
  $$select public.delete_team(current_setting('fx.t1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'el entrenador principal no borra su propio equipo (NOT_FOUND)'
);

select throws_ok(
  $$select public.add_new_player(
      current_setting('fx.t1')::uuid, 'Intruso', 'Ficticio', 2015::smallint, 12::smallint, 'Base')$$,
  'P0002', 'NOT_FOUND',
  'el entrenador principal no da de alta jugadores en su propio equipo (NOT_FOUND)'
);

-- c2, en su T2, que tiene un entrenamiento. El orden (C26): NOT_FOUND, no IN_USE.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select throws_ok(
  $$select public.delete_team(current_setting('fx.t2')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'quien entrena un equipo con eventos recibe NOT_FOUND antes que IN_USE'
);

-- Un jugador.
select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select is_empty(
  $$select * from tests.surprises('42501 política', 'ok 0')$$,
  'un jugador no escribe en ninguna de las seis tablas'
);

select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2030/31', '2030-09-01', '2031-06-30')$$,
  'P0002', 'NOT_FOUND',
  'un jugador no crea temporadas (NOT_FOUND)'
);

select throws_ok(
  $$select public.set_current_season(current_setting('fx.s_old')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'un jugador no cambia la temporada actual (NOT_FOUND)'
);

select throws_ok(
  $$select public.delete_team(current_setting('fx.t1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'un jugador no borra su equipo (NOT_FOUND)'
);

select throws_ok(
  $$select public.add_new_player(
      current_setting('fx.t1')::uuid, 'Intruso', 'Ficticio', 2015::smallint, 12::smallint, 'Base')$$,
  'P0002', 'NOT_FOUND',
  'un jugador no da de alta jugadores (NOT_FOUND)'
);

-- La dirección de OTRO club: en el suyo escribe, así que aquí lo único que la para es el club.
-- Una fila que dice ser de A no pasa la política; las de A ni las ve.
select tests.authenticate_as(current_setting('fx.ab')::uuid);

select is_empty(
  $$select * from tests.surprises('42501 política', 'ok 0')$$,
  'la dirección del club B no escribe en ninguna de las seis tablas del club A'
);

select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2030/31', '2030-09-01', '2031-06-30')$$,
  'P0002', 'NOT_FOUND',
  'la dirección del club B no crea temporadas en A (NOT_FOUND)'
);

-- El orden (C26): con el nombre repetido, las fechas al revés y una temporada de origen que
-- no existe, sigue siendo NOT_FOUND.
select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2026/27', '2027-06-30', '2026-09-01',
      gen_random_uuid())$$,
  'P0002', 'NOT_FOUND',
  'quien no dirige el club recibe NOT_FOUND antes que cualquier error de datos de la temporada'
);

select throws_ok(
  $$select public.set_current_season(current_setting('fx.s_old')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'la dirección del club B no cambia la temporada actual de A (NOT_FOUND)'
);

select throws_ok(
  $$select public.delete_team(current_setting('fx.t1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'la dirección del club B no borra un equipo de A (NOT_FOUND)'
);

select throws_ok(
  $$select public.delete_team(current_setting('fx.t2')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'ni uno con eventos: NOT_FOUND antes que IN_USE'
);

select throws_ok(
  $$select public.add_new_player(
      current_setting('fx.t1')::uuid, 'Intruso', 'Ficticio', 2015::smallint, 12::smallint, 'Base')$$,
  'P0002', 'NOT_FOUND',
  'la dirección del club B no da de alta jugadores en un equipo de A (NOT_FOUND)'
);

-- El orden (C26): nombre en blanco, año imposible, dorsal repetido y posición demasiado larga.
select throws_ok(
  $$select public.add_new_player(
      current_setting('fx.t1')::uuid, '   ', '', 1800::smallint, 4::smallint, repeat('x', 40))$$,
  'P0002', 'NOT_FOUND',
  'quien no dirige el club recibe NOT_FOUND antes que cualquier error de datos del jugador'
);

-- `multi` dirige el club B y en A solo entrena: dirigir un club no da nada en otro.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select is_empty(
  $$select * from tests.surprises('42501 política', 'ok 0')$$,
  'quien dirige el club B y solo entrena en A no escribe en ninguna tabla de A'
);

select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2030/31', '2030-09-01', '2031-06-30')$$,
  'P0002', 'NOT_FOUND',
  'ni crea temporadas en A (NOT_FOUND)'
);

-- Solo cuentan las membresías activas.
select tests.authenticate_as(current_setting('fx.ex')::uuid);

select is_empty(
  $$select * from tests.surprises('42501 política', 'ok 0')$$,
  'una dirección con la membresía revocada no escribe en ninguna de las seis tablas'
);

select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2030/31', '2030-09-01', '2031-06-30')$$,
  'P0002', 'NOT_FOUND',
  'ni crea temporadas (NOT_FOUND)'
);

-- anon: sin privilegio sobre las tablas ni sobre las funciones.
select tests.clear_authentication();

select is_empty(
  $$select * from tests.surprises('42501 privilegio', '42501 privilegio')$$,
  'anon no tiene privilegio para ninguna escritura en las seis tablas'
);

select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2030/31', '2030-09-01', '2031-06-30')$$,
  '42501', 'permission denied for function create_season',
  'anon no puede llamar a create_season (42501)'
);

select throws_ok(
  $$select public.set_current_season(current_setting('fx.s_old')::uuid)$$,
  '42501', 'permission denied for function set_current_season',
  'anon no puede llamar a set_current_season (42501)'
);

select throws_ok(
  $$select public.delete_team(current_setting('fx.t1')::uuid)$$,
  '42501', 'permission denied for function delete_team',
  'anon no puede llamar a delete_team (42501)'
);

select throws_ok(
  $$select public.add_new_player(current_setting('fx.t1')::uuid, 'Intruso', 'Ficticio')$$,
  '42501', 'permission denied for function add_new_player',
  'anon no puede llamar a add_new_player (42501)'
);

-- Tras todos esos intentos, las seis tablas están como estaban.
reset role;

select is(
  tests.snapshot(), current_setting('fx.before'),
  'nadie que no sea la dirección del club ha cambiado una sola fila'
);

-- Control positivo de «la dirección de otro club»: en el suyo sí escribe.
select tests.authenticate_as(current_setting('fx.ab')::uuid);

select results_eq(
  $$with changed as (
      update categories set sort = 15 where id = current_setting('fx.cat_b')::uuid returning id
    ) select count(*)::int from changed$$,
  $$values (1)$$,
  'la dirección del club B sí cambia lo de su club'
);

-- ── La dirección del club A: tabla por tabla ─────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin')::uuid);

-- people: alta y cambio (archivar es un cambio). No se borra.
select lives_ok(
  $$insert into people (organization_id, first_name, last_name, birth_year)
    values (current_setting('fx.club_a')::uuid, 'Marta', 'Alta', 2014)$$,
  'la dirección da de alta a una persona'
);

select results_eq(
  $$with changed as (
      update people
      set first_name = 'Marta Inés', last_name = 'Cambiada', birth_year = 2013, archived_at = now()
      where last_name = 'Alta'
      returning first_name, last_name, birth_year::int, archived_at is not null
    ) select * from changed$$,
  $$values ('Marta Inés', 'Cambiada', 2013, true)$$,
  'la dirección cambia el nombre y el año de una persona, y la archiva'
);

select throws_ok(
  $$delete from people where last_name = 'Cambiada'$$,
  '42501', 'permission denied for table people',
  'las personas no se borran: ni la dirección tiene el privilegio'
);

-- seasons
select lives_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on)
    values (current_setting('fx.club_a')::uuid, '2027/28', '2027-09-01', '2028-06-30')$$,
  'la dirección crea una temporada'
);

select results_eq(
  $$with changed as (
      update seasons
      set name = 'Temporada 2027/28', starts_on = '2027-09-06', ends_on = '2028-06-25'
      where name = '2027/28'
      returning name, starts_on, ends_on, is_current
    ) select * from changed$$,
  $$values ('Temporada 2027/28', '2027-09-06'::date, '2028-06-25'::date, false)$$,
  'la dirección cambia el nombre y las fechas de una temporada'
);

select results_eq(
  $$with gone as (
      delete from seasons where id = current_setting('fx.s_old')::uuid returning id
    ) select count(*)::int from gone$$,
  $$values (1)$$,
  'la dirección borra una temporada que no es la actual ni tiene equipos'
);

-- categories
select lives_ok(
  $$insert into categories (organization_id, name, age_band, sort)
    values (current_setting('fx.club_a')::uuid, 'Junior', 'U18', 40)$$,
  'la dirección crea una categoría'
);

select results_eq(
  $$with changed as (
      update categories set name = 'Júnior', age_band = 'U17', sort = 45
      where name = 'Junior'
      returning name, age_band, sort
    ) select * from changed$$,
  $$values ('Júnior', 'U17', 45)$$,
  'la dirección cambia el nombre, la franja y el orden de una categoría'
);

select results_eq(
  $$with gone as (delete from categories where name = 'Júnior' returning id)
    select count(*)::int from gone$$,
  $$values (1)$$,
  'la dirección borra una categoría sin equipos'
);

-- teams
select lives_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.s_a')::uuid,
            current_setting('fx.cat_free')::uuid, 'Cadete A')$$,
  'la dirección crea un equipo'
);

select results_eq(
  $$with changed as (
      update teams set name = 'Cadete B', category_id = current_setting('fx.cat_ben')::uuid
      where name = 'Cadete A'
      returning name, category_id, season_id
    ) select * from changed$$,
  $$values ('Cadete B', current_setting('fx.cat_ben')::uuid, current_setting('fx.s_a')::uuid)$$,
  'la dirección cambia el nombre y la categoría de un equipo'
);

select results_eq(
  $$with gone as (delete from teams where name = 'Cadete B' returning id)
    select count(*)::int from gone$$,
  $$values (1)$$,
  'la dirección borra un equipo vacío'
);

-- team_staff
select lives_ok(
  $$insert into team_staff (organization_id, team_id, person_id, staff_role)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid,
            current_setting('fx.p_free')::uuid, 'assistant')$$,
  'la dirección añade a alguien a un cuerpo técnico'
);

select results_eq(
  $$with changed as (
      update team_staff set staff_role = 'head_coach'
      where team_id = current_setting('fx.t2')::uuid
        and person_id = current_setting('fx.p_free')::uuid
      returning staff_role::text
    ) select * from changed$$,
  $$values ('head_coach')$$,
  'la dirección cambia el papel de alguien en un cuerpo técnico'
);

select results_eq(
  $$with gone as (
      delete from team_staff
      where team_id = current_setting('fx.t2')::uuid
        and person_id = current_setting('fx.p_free')::uuid
      returning person_id
    ) select count(*)::int from gone$$,
  $$values (1)$$,
  'la dirección quita a alguien de un cuerpo técnico'
);

-- team_players
select lives_ok(
  $$insert into team_players (organization_id, team_id, person_id, jersey_number, position)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.p_free')::uuid, 9, 'Alero')$$,
  'la dirección añade a alguien a una plantilla'
);

select results_eq(
  $$with changed as (
      update team_players set jersey_number = 10, position = 'Pívot'
      where team_id = current_setting('fx.t1')::uuid
        and person_id = current_setting('fx.p_free')::uuid
      returning jersey_number::int, position
    ) select * from changed$$,
  $$values (10, 'Pívot')$$,
  'la dirección cambia el dorsal y la posición de un jugador'
);

select results_eq(
  $$with gone as (
      delete from team_players
      where team_id = current_setting('fx.t1')::uuid
        and person_id = current_setting('fx.p_free')::uuid
      returning person_id
    ) select count(*)::int from gone$$,
  $$values (1)$$,
  'la dirección quita a alguien de una plantilla'
);

-- ── Nada apunta a otro club ──────────────────────────────────────────────────────────
-- Una fila del club A, escrita por la dirección de A, que usa algo de B: pasa la política y
-- la paran las claves foráneas compuestas.
select throws_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.s_b')::uuid,
            current_setting('fx.cat_ale')::uuid, 'Equipo cruzado')$$,
  '23503', null,
  'un equipo de A no usa la temporada de B'
);

select throws_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.s_a')::uuid,
            current_setting('fx.cat_b')::uuid, 'Equipo cruzado')$$,
  '23503', null,
  'un equipo de A no usa la categoría de B'
);

select throws_ok(
  $$update teams set category_id = current_setting('fx.cat_b')::uuid
    where id = current_setting('fx.t1')::uuid$$,
  '23503', null,
  'un equipo de A no se cambia a una categoría de B'
);

select throws_ok(
  $$insert into team_staff (organization_id, team_id, person_id, staff_role)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.p_cb')::uuid, 'assistant')$$,
  '23503', null,
  'una persona de B no entra en un cuerpo técnico de A'
);

select throws_ok(
  $$insert into team_staff (organization_id, team_id, person_id, staff_role)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.tb')::uuid,
            current_setting('fx.p_free')::uuid, 'assistant')$$,
  '23503', null,
  'una persona de A no entra en el cuerpo técnico de un equipo de B'
);

select throws_ok(
  $$insert into team_players (organization_id, team_id, person_id, jersey_number)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.p_pb')::uuid, 12)$$,
  '23503', null,
  'una persona de B no entra en una plantilla de A'
);

select throws_ok(
  $$insert into team_players (organization_id, team_id, person_id, jersey_number)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.tb')::uuid,
            current_setting('fx.p_free')::uuid, 12)$$,
  '23503', null,
  'una persona de A no entra en la plantilla de un equipo de B'
);

-- Y una fila que dice ser de B no pasa la política, aunque todo lo que use sea de B.
select throws_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.s_b')::uuid,
            current_setting('fx.cat_b')::uuid, 'Equipo ajeno')$$,
  '42501', 'new row violates row-level security policy for table "teams"',
  'la dirección de A no crea un equipo en B'
);

select throws_ok(
  $$insert into team_players (organization_id, team_id, person_id, jersey_number)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.tb')::uuid,
            current_setting('fx.p_cb')::uuid, 8)$$,
  '42501', 'new row violates row-level security policy for table "team_players"',
  'ni mete a nadie en una plantilla de B'
);

select results_eq(
  $$with p  as (update people set last_name = 'Cambiado'
                where organization_id = current_setting('fx.club_b')::uuid returning 1),
         s  as (update seasons set ends_on = ends_on + 1
                where organization_id = current_setting('fx.club_b')::uuid returning 1),
         c  as (update categories set sort = sort + 1
                where organization_id = current_setting('fx.club_b')::uuid returning 1),
         t  as (update teams set name = name || ' bis'
                where organization_id = current_setting('fx.club_b')::uuid returning 1),
         ts as (update team_staff set staff_role = 'assistant'
                where organization_id = current_setting('fx.club_b')::uuid returning 1),
         tp as (update team_players set position = 'Pívot'
                where organization_id = current_setting('fx.club_b')::uuid returning 1)
    select (select count(*) from p)::int, (select count(*) from s)::int,
           (select count(*) from c)::int, (select count(*) from t)::int,
           (select count(*) from ts)::int, (select count(*) from tp)::int$$,
  $$values (0, 0, 0, 0, 0, 0)$$,
  'la dirección de A no cambia ninguna fila de B'
);

select results_eq(
  $$with s  as (delete from seasons
                where organization_id = current_setting('fx.club_b')::uuid returning 1),
         c  as (delete from categories
                where organization_id = current_setting('fx.club_b')::uuid returning 1),
         t  as (delete from teams
                where organization_id = current_setting('fx.club_b')::uuid returning 1),
         ts as (delete from team_staff
                where organization_id = current_setting('fx.club_b')::uuid returning 1),
         tp as (delete from team_players
                where organization_id = current_setting('fx.club_b')::uuid returning 1)
    select (select count(*) from s)::int, (select count(*) from c)::int,
           (select count(*) from t)::int, (select count(*) from ts)::int,
           (select count(*) from tp)::int$$,
  $$values (0, 0, 0, 0, 0)$$,
  'ni borra ninguna'
);

-- ── Columnas que no se conceden ──────────────────────────────────────────────────────
-- Ni la dirección: una fila no cambia de club, un equipo no cambia de temporada, y un sitio
-- en una plantilla o en un cuerpo técnico no cambia de equipo ni de persona. Tampoco se
-- eligen los ids al crear.
select results_eq(
  $$select v.what, tests.outcome(v.code)
    from (values
      (1, 'people.organization_id',
        $sql$update public.people set organization_id = current_setting('fx.club_b')::uuid$sql$),
      (2, 'seasons.organization_id',
        $sql$update public.seasons set organization_id = current_setting('fx.club_b')::uuid$sql$),
      (3, 'categories.organization_id',
        $sql$update public.categories set organization_id = current_setting('fx.club_b')::uuid$sql$),
      (4, 'teams.organization_id',
        $sql$update public.teams set organization_id = current_setting('fx.club_b')::uuid$sql$),
      (5, 'team_staff.organization_id',
        $sql$update public.team_staff set organization_id = current_setting('fx.club_b')::uuid$sql$),
      (6, 'team_players.organization_id',
        $sql$update public.team_players set organization_id = current_setting('fx.club_b')::uuid$sql$),
      (7, 'teams.season_id',
        $sql$update public.teams set season_id = current_setting('fx.s_past')::uuid
             where id = current_setting('fx.t1')::uuid$sql$),
      (8, 'team_staff.team_id',
        $sql$update public.team_staff set team_id = current_setting('fx.t2')::uuid
             where person_id = current_setting('fx.p_c1')::uuid$sql$),
      (9, 'team_staff.person_id',
        $sql$update public.team_staff set person_id = current_setting('fx.p_free')::uuid
             where person_id = current_setting('fx.p_c1')::uuid$sql$),
      (10, 'team_players.team_id',
        $sql$update public.team_players set team_id = current_setting('fx.t2')::uuid
             where person_id = current_setting('fx.p_p1')::uuid$sql$),
      (11, 'team_players.person_id',
        $sql$update public.team_players set person_id = current_setting('fx.p_free')::uuid
             where person_id = current_setting('fx.p_p1')::uuid$sql$),
      (12, 'people.id al crear',
        $sql$insert into public.people (id, organization_id, first_name, last_name)
             values (gen_random_uuid(), current_setting('fx.club_a')::uuid, 'Con', 'Id')$sql$),
      (13, 'teams.id al crear',
        $sql$insert into public.teams (id, organization_id, season_id, category_id, name)
             values (gen_random_uuid(), current_setting('fx.club_a')::uuid,
                     current_setting('fx.s_a')::uuid, current_setting('fx.cat_ale')::uuid,
                     'Con id')$sql$)
    ) as v (n, what, code)
    order by v.n$$,
  $$values ('people.organization_id',       '42501 privilegio'),
           ('seasons.organization_id',      '42501 privilegio'),
           ('categories.organization_id',   '42501 privilegio'),
           ('teams.organization_id',        '42501 privilegio'),
           ('team_staff.organization_id',   '42501 privilegio'),
           ('team_players.organization_id', '42501 privilegio'),
           ('teams.season_id',              '42501 privilegio'),
           ('team_staff.team_id',           '42501 privilegio'),
           ('team_staff.person_id',         '42501 privilegio'),
           ('team_players.team_id',         '42501 privilegio'),
           ('team_players.person_id',       '42501 privilegio'),
           ('people.id al crear',           '42501 privilegio'),
           ('teams.id al crear',            '42501 privilegio')$$,
  'ni la dirección cambia el club, la temporada de un equipo, ni el equipo o la persona de una plantilla o un cuerpo técnico'
);

-- ── Lo que la base garantiza ─────────────────────────────────────────────────────────

-- Fechas de temporada: el fin, después del inicio.
select throws_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on)
    values (current_setting('fx.club_a')::uuid, 'Al revés', '2029-06-30', '2028-09-01')$$,
  '23514', null,
  'una temporada no acaba antes de empezar'
);

select throws_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on)
    values (current_setting('fx.club_a')::uuid, 'De un día', '2028-09-01', '2028-09-01')$$,
  '23514', null,
  'ni el mismo día que empieza'
);

-- Nombres: de 1 a 60 caracteres, sin contar los espacios de alrededor.
select throws_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on)
    values (current_setting('fx.club_a')::uuid, '   ', '2028-09-01', '2029-06-30')$$,
  '23514', null,
  'una temporada no tiene el nombre en blanco'
);

select throws_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on)
    values (current_setting('fx.club_a')::uuid, repeat('x', 61), '2028-09-01', '2029-06-30')$$,
  '23514', null,
  'ni de más de 60 caracteres'
);

select throws_ok(
  $$insert into categories (organization_id, name, age_band)
    values (current_setting('fx.club_a')::uuid, '', 'U12')$$,
  '23514', null,
  'una categoría no tiene el nombre vacío'
);

select throws_ok(
  $$update categories set name = repeat('x', 61) where id = current_setting('fx.cat_free')::uuid$$,
  '23514', null,
  'ni de más de 60 caracteres'
);

select throws_ok(
  $$update teams set name = '  ' where id = current_setting('fx.t1')::uuid$$,
  '23514', null,
  'un equipo no tiene el nombre en blanco'
);

select throws_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.s_a')::uuid,
            current_setting('fx.cat_ale')::uuid, repeat('x', 61))$$,
  '23514', null,
  'ni de más de 60 caracteres'
);

select throws_ok(
  $$insert into people (organization_id, first_name, last_name)
    values (current_setting('fx.club_a')::uuid, ' ', 'Ficticio')$$,
  '23514', null,
  'una persona no tiene el nombre en blanco'
);

select throws_ok(
  $$update people set first_name = repeat('x', 61) where id = current_setting('fx.p_free')::uuid$$,
  '23514', null,
  'ni de más de 60 caracteres'
);

select throws_ok(
  $$update people set last_name = '' where id = current_setting('fx.p_free')::uuid$$,
  '23514', null,
  'una persona no tiene el apellido vacío'
);

select throws_ok(
  $$insert into people (organization_id, first_name, last_name)
    values (current_setting('fx.club_a')::uuid, 'Larga', repeat('x', 61))$$,
  '23514', null,
  'ni de más de 60 caracteres'
);

-- El límite entra: 60 justos.
select lives_ok(
  $$insert into people (organization_id, first_name, last_name)
    values (current_setting('fx.club_a')::uuid, repeat('n', 60), repeat('a', 60))$$,
  'un nombre y un apellido de 60 caracteres se aceptan'
);

-- Posición: hasta 30, y si está, no en blanco.
select throws_ok(
  $$update team_players set position = repeat('x', 31)
    where person_id = current_setting('fx.p_p1')::uuid$$,
  '23514', null,
  'una posición de más de 30 caracteres se rechaza'
);

select throws_ok(
  $$update team_players set position = '  '
    where person_id = current_setting('fx.p_p1')::uuid$$,
  '23514', null,
  'y una en blanco también: sin posición es null'
);

select results_eq(
  $$with changed as (
      update team_players set position = repeat('x', 30)
      where person_id = current_setting('fx.p_p1')::uuid
      returning char_length(position)
    ) select * from changed$$,
  $$values (30)$$,
  'una posición de 30 caracteres se acepta'
);

-- Nombres sin repetir, sin distinguir mayúsculas ni espacios alrededor.
select throws_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on)
    values (current_setting('fx.club_a')::uuid, '  TEMPORADA 2027/28 ', '2029-09-01', '2030-06-30')$$,
  '23505', null,
  'dos temporadas de un club no se llaman igual, ni cambiando mayúsculas y espacios'
);

select throws_ok(
  $$update seasons set name = '2026/27' where id = current_setting('fx.s_past')::uuid$$,
  '23505', null,
  'ni al cambiarle el nombre a una'
);

select throws_ok(
  $$insert into categories (organization_id, name, age_band)
    values (current_setting('fx.club_a')::uuid, ' CADETE  ', 'U15')$$,
  '23505', null,
  'dos categorías de un club no se llaman igual, ni cambiando mayúsculas y espacios'
);

-- En otro club el mismo nombre vale: «Infantil» es una categoría de B. (Con las temporadas
-- pasa lo mismo: «2026/27» está en A y en B desde las fixtures.)
select lives_ok(
  $$insert into categories (organization_id, name, age_band, sort)
    values (current_setting('fx.club_a')::uuid, 'Infantil', 'U14', 25)$$,
  'una categoría puede llamarse como la de otro club'
);

select throws_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.s_a')::uuid,
            current_setting('fx.cat_ben')::uuid, '  ALEVÍN a ')$$,
  '23505', null,
  'dos equipos de una temporada no se llaman igual, ni cambiando mayúsculas y espacios'
);

select throws_ok(
  $$update teams set name = 'Alevín A' where id = current_setting('fx.t2')::uuid$$,
  '23505', null,
  'ni al cambiarle el nombre a uno'
);

select lives_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.s_past')::uuid,
            current_setting('fx.cat_ale')::uuid, 'Alevín A')$$,
  'en otra temporada, un equipo sí puede llamarse igual'
);

-- El dorsal, único por equipo (ya lo era): p1 lleva el 4 en T1.
select throws_ok(
  $$insert into team_players (organization_id, team_id, person_id, jersey_number)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.p_free')::uuid, 4)$$,
  '23505', null,
  'dos jugadores de un equipo no llevan el mismo dorsal'
);

-- ── create_season ────────────────────────────────────────────────────────────────────

-- El club C no tiene ninguna temporada: la primera nace actual, y con el nombre recortado.
select tests.authenticate_as(current_setting('fx.ac')::uuid);

select lives_ok(
  $$select set_config('fx.sc1',
      public.create_season(
        current_setting('fx.club_c')::uuid, '  2026/27  ', '2026-09-01', '2027-06-30')::text,
      true)$$,
  'la dirección crea la primera temporada de su club'
);

select results_eq(
  $$select id, name, starts_on, ends_on, is_current from seasons$$,
  $$values (current_setting('fx.sc1', true)::uuid, '2026/27', '2026-09-01'::date,
            '2027-06-30'::date, true)$$,
  'nace actual, con el nombre sin espacios alrededor, y la función devuelve su id'
);

select lives_ok(
  $$select public.create_season(
      current_setting('fx.club_c')::uuid, '2027/28', '2027-09-01', '2028-06-30')$$,
  'y crea la siguiente'
);

select results_eq(
  $$select name, is_current from seasons order by name$$,
  $$values ('2026/27', true), ('2027/28', false)$$,
  'la siguiente no nace actual: la actual sigue siendo la primera'
);

-- En A, copiando los equipos de la actual.
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select lives_ok(
  $$select set_config('fx.s_copy',
      public.create_season(
        current_setting('fx.club_a')::uuid, '2028/29', '2028-09-01', '2029-06-30',
        current_setting('fx.s_a')::uuid)::text,
      true)$$,
  'la dirección crea una temporada copiando los equipos de otra'
);

select results_eq(
  $$select name, category_id from teams
    where season_id = current_setting('fx.s_copy', true)::uuid order by name$$,
  $$values ('Alevín A', current_setting('fx.cat_ale')::uuid),
           ('Benjamín A', current_setting('fx.cat_ben')::uuid)$$,
  'la temporada nueva trae los equipos de la de origen, con su nombre y su categoría'
);

select results_eq(
  $$select name, is_current from seasons where id = current_setting('fx.s_copy', true)::uuid$$,
  $$values ('2028/29', false)$$,
  'y no nace actual: el club ya tenía una'
);

select is_empty(
  $$select 'cuerpo técnico' from team_staff as ts
      join teams as t on t.id = ts.team_id
      where t.season_id = current_setting('fx.s_copy', true)::uuid
    union all
    select 'plantilla' from team_players as tp
      join teams as t on t.id = tp.team_id
      where t.season_id = current_setting('fx.s_copy', true)::uuid$$,
  'los equipos copiados llegan vacíos: ni cuerpo técnico ni plantilla'
);

select results_eq(
  $$select
      (select count(*) from team_staff as ts join teams as t on t.id = ts.team_id
       where t.season_id = current_setting('fx.s_a')::uuid)::int,
      (select count(*) from team_players as tp join teams as t on t.id = tp.team_id
       where t.season_id = current_setting('fx.s_a')::uuid)::int$$,
  $$values (3, 2)$$,
  'y los de origen conservan los suyos'
);

-- NOT_FOUND si la temporada de origen no es de este club o no existe.
select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2029/30', '2029-09-01', '2030-06-30',
      current_setting('fx.s_b')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'no se copian los equipos de una temporada de otro club (NOT_FOUND)'
);

select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2029/30', '2029-09-01', '2030-06-30',
      gen_random_uuid())$$,
  'P0002', 'NOT_FOUND',
  'ni los de una que no existe (NOT_FOUND)'
);

-- El orden (C26): con el origen de otro club, el nombre repetido y las fechas al revés.
select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2026/27', '2027-06-30', '2026-09-01',
      current_setting('fx.s_b')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'NOT_FOUND por el origen va antes que el nombre repetido y las fechas al revés'
);

-- Los errores de datos, con los códigos de siempre.
select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, ' 2026/27 ', '2029-09-01', '2030-06-30')$$,
  '23505', null,
  'un nombre de temporada repetido es 23505'
);

select throws_ok(
  $$select public.create_season(
      current_setting('fx.club_a')::uuid, '2029/30', '2030-06-30', '2029-09-01',
      current_setting('fx.s_a')::uuid)$$,
  '23514', null,
  'las fechas al revés son 23514'
);

select results_eq(
  $$select s.name, (select count(*) from teams as t where t.season_id = s.id)::int
    from seasons as s order by s.name$$,
  $$values ('2024/25', 2), ('2026/27', 2), ('2028/29', 2), ('Temporada 2027/28', 0)$$,
  'los intentos fallidos no dejan temporadas ni equipos'
);

-- ── set_current_season ───────────────────────────────────────────────────────────────
select lives_ok(
  $$select public.set_current_season(current_setting('fx.s_copy', true)::uuid)$$,
  'la dirección marca otra temporada como la actual'
);

select results_eq(
  $$select id from seasons where is_current$$,
  $$values (current_setting('fx.s_copy', true)::uuid)$$,
  'el club queda con una sola temporada actual: la nueva'
);

-- Llamarla sobre la que ya es la actual no rompe nada.
select lives_ok(
  $$select public.set_current_season(current_setting('fx.s_copy', true)::uuid)$$,
  'marcar la que ya es la actual no falla'
);

select results_eq(
  $$select id from seasons where is_current$$,
  $$values (current_setting('fx.s_copy', true)::uuid)$$,
  'y sigue habiendo exactamente una'
);

select throws_ok(
  $$select public.set_current_season(gen_random_uuid())$$,
  'P0002', 'NOT_FOUND',
  'una temporada que no existe es NOT_FOUND'
);

select throws_ok(
  $$select public.set_current_season(current_setting('fx.s_b')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'la de un club que no se dirige, también'
);

-- Los otros clubes, como estaban: cada uno con su temporada actual de siempre.
reset role;

select results_eq(
  $$select organization_id, id from seasons
    where is_current
      and organization_id in (current_setting('fx.club_a')::uuid, current_setting('fx.club_b')::uuid,
                              current_setting('fx.club_c')::uuid)
    order by organization_id$$,
  $$values (current_setting('fx.club_a')::uuid, current_setting('fx.s_copy', true)::uuid),
           (current_setting('fx.club_b')::uuid, current_setting('fx.s_b')::uuid),
           (current_setting('fx.club_c')::uuid, current_setting('fx.sc1', true)::uuid)$$,
  'cambiar la temporada actual de un club no toca la de los demás'
);

-- Y de vuelta.
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select lives_ok(
  $$select public.set_current_season(current_setting('fx.s_a')::uuid)$$,
  'la dirección vuelve a marcar la temporada de antes'
);

select results_eq(
  $$select id from seasons where is_current$$,
  $$values (current_setting('fx.s_a')::uuid)$$,
  'y vuelve a ser la única actual'
);

-- ── Qué se puede borrar ──────────────────────────────────────────────────────────────

-- La temporada actual no se borra, tenga equipos o no: la política no deja la fila.
select is_empty(
  $$delete from seasons where id = current_setting('fx.s_a')::uuid returning id$$,
  'la temporada actual no se borra'
);

select tests.authenticate_as(current_setting('fx.ac')::uuid);

select is_empty(
  $$delete from seasons where id = current_setting('fx.sc1', true)::uuid returning id$$,
  'tampoco si no tiene equipos'
);

select results_eq(
  $$select id from seasons where is_current$$,
  $$values (current_setting('fx.sc1', true)::uuid)$$,
  'y sigue ahí'
);

-- Lo que se usa no se borra: lo paran las claves foráneas.
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select throws_ok(
  $$delete from seasons where id = current_setting('fx.s_past')::uuid$$,
  '23503', null,
  'una temporada con equipos no se borra (23503)'
);

select throws_ok(
  $$delete from categories where id = current_setting('fx.cat_ale')::uuid$$,
  '23503', null,
  'una categoría con equipos no se borra (23503)'
);

select throws_ok(
  $$delete from teams where id = current_setting('fx.t1')::uuid$$,
  '23503', null,
  'un equipo con plantilla no se borra por la API directa (23503): para eso está delete_team'
);

-- ── Lo que lee quien entrena no cambia ───────────────────────────────────────────────
-- La dirección da de alta a dos personas y pone a q1 en T1 y a q2 en T2.
select lives_ok(
  $$insert into people (organization_id, first_name, last_name, birth_year) values
      (current_setting('fx.club_a')::uuid, 'q1', 'Recién Llegado', 2015),
      (current_setting('fx.club_a')::uuid, 'q2', 'Recién Llegada', 2016);
    insert into team_players (organization_id, team_id, person_id, jersey_number)
      select organization_id, current_setting('fx.t1')::uuid, id, 21 from people where first_name = 'q1';
    insert into team_players (organization_id, team_id, person_id, jersey_number)
      select organization_id, current_setting('fx.t2')::uuid, id, 22 from people where first_name = 'q2'$$,
  'la dirección da de alta a dos personas y las pone en dos plantillas'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  'select first_name from people order by 1',
  $$values ('as1'), ('c1'), ('p1'), ('q1')$$,
  'c1 ve a quien llega a su equipo y no a quien llega a otro'
);

select results_eq(
  $$select p.first_name, tp.jersey_number::int
    from team_players as tp join people as p on p.id = tp.person_id order by 1$$,
  $$values ('p1', 4), ('q1', 21)$$,
  'c1 ve la plantilla de T1 con el jugador nuevo, y no la de T2'
);

select results_eq(
  'select id from teams',
  $$values (current_setting('fx.t1')::uuid)$$,
  'c1 sigue viendo solo su equipo, no los de otras temporadas'
);

select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  'select first_name from people order by 1',
  $$values ('c2'), ('p2'), ('q2')$$,
  'c2 ve a quien llega a T2 y no a quien llega a T1'
);

select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select results_eq(
  $$select (select string_agg(first_name, ',') from people),
           (select count(*) from teams)::int, (select count(*) from team_players)::int$$,
  $$values ('p1', 0, 0)$$,
  'un jugador sigue viendo solo su propia persona, y ningún equipo ni plantilla'
);

-- ── add_new_player ───────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin')::uuid);

-- La persona y su sitio en la plantilla, con los textos recortados.
select lives_ok(
  $$select set_config('fx.np',
      public.add_new_player(
        current_setting('fx.t1')::uuid, '  Nora ', ' Alta Nueva  ', 2014::smallint, 11::smallint,
        '  Escolta ')::text,
      true)$$,
  'la dirección da de alta a un jugador en un equipo'
);

select results_eq(
  $$select first_name, last_name, birth_year::int, organization_id from people
    where id = current_setting('fx.np', true)::uuid$$,
  $$values ('Nora', 'Alta Nueva', 2014, current_setting('fx.club_a')::uuid)$$,
  'crea la persona, con el nombre y el apellido sin espacios alrededor, y devuelve su id'
);

select results_eq(
  $$select team_id, jersey_number::int, position from team_players
    where person_id = current_setting('fx.np', true)::uuid$$,
  $$values (current_setting('fx.t1')::uuid, 11, 'Escolta')$$,
  'y la pone en la plantilla, con su dorsal y su posición'
);

-- Sin año, sin dorsal y con la posición en blanco.
select lives_ok(
  $$select public.add_new_player(
      current_setting('fx.t1')::uuid, 'Olga', 'Sin Datos', null, null, '   ')$$,
  'un jugador entra sin año, sin dorsal y con la posición en blanco'
);

select results_eq(
  $$select p.birth_year is null, tp.jersey_number is null, tp.position is null
    from people as p join team_players as tp on tp.person_id = p.id
    where p.last_name = 'Sin Datos'$$,
  $$values (true, true, true)$$,
  'la posición en blanco queda a null'
);

-- Las dos cosas o ninguna: el dorsal 4 ya es de p1.
select throws_ok(
  $$select public.add_new_player(
      current_setting('fx.t1')::uuid, 'Pilar', 'Repetida', 2015::smallint, 4::smallint)$$,
  '23505', null,
  'un dorsal repetido es 23505'
);

select is_empty(
  $$select id from people where last_name = 'Repetida'$$,
  'y no deja a la persona suelta'
);

select throws_ok(
  $$select public.add_new_player(current_setting('fx.t1')::uuid, '   ', 'Sin Nombre')$$,
  '23514', null,
  'un nombre en blanco es 23514'
);

select throws_ok(
  $$select public.add_new_player(gen_random_uuid(), 'Nadie', 'Ficticio')$$,
  'P0002', 'NOT_FOUND',
  'un equipo que no existe es NOT_FOUND'
);

select throws_ok(
  $$select public.add_new_player(current_setting('fx.tb')::uuid, 'Nadie', 'Ficticio')$$,
  'P0002', 'NOT_FOUND',
  'el de un club que no se dirige, también'
);

-- ── delete_team ──────────────────────────────────────────────────────────────────────

-- T2 tiene un entrenamiento: IN_USE, y no se borra nada (ni su cuerpo técnico ni su plantilla).
select throws_ok(
  $$select public.delete_team(current_setting('fx.t2')::uuid)$$,
  'P0001', 'IN_USE',
  'un equipo con eventos no se borra: IN_USE'
);

select results_eq(
  $$select
      (select count(*) from teams where id = current_setting('fx.t2')::uuid)::int,
      (select count(*) from team_staff where team_id = current_setting('fx.t2')::uuid)::int,
      (select count(*) from team_players where team_id = current_setting('fx.t2')::uuid)::int$$,
  $$values (1, 1, 2)$$,
  'y su cuerpo técnico y su plantilla siguen enteros'
);

-- T1 no lo usa nada: se va con su cuerpo técnico y su plantilla. Las personas se quedan.
select lives_ok(
  $$select public.delete_team(current_setting('fx.t1')::uuid)$$,
  'la dirección borra un equipo que no se usa'
);

select is_empty(
  $$select 'equipo' from teams where id = current_setting('fx.t1')::uuid
    union all
    select 'cuerpo técnico' from team_staff where team_id = current_setting('fx.t1')::uuid
    union all
    select 'plantilla' from team_players where team_id = current_setting('fx.t1')::uuid$$,
  'se van el equipo, su cuerpo técnico y su plantilla'
);

select results_eq(
  $$select first_name from people where first_name in ('c1', 'as1', 'p1', 'q1') order by 1$$,
  $$values ('as1'), ('c1'), ('p1'), ('q1')$$,
  'y las personas se quedan'
);

select throws_ok(
  $$select public.delete_team(current_setting('fx.t1')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'un equipo que ya no existe es NOT_FOUND'
);

select throws_ok(
  $$select public.delete_team(current_setting('fx.tb')::uuid)$$,
  'P0002', 'NOT_FOUND',
  'el de un club que no se dirige, también'
);

-- ── La temporada actual solo la mueven las funciones ─────────────────────────────────
-- `is_current` no está concedida: por la API directa la dirección no deja a su club sin
-- temporada actual, ni se salta así «la actual no se borra».
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select throws_ok(
  $$update seasons set is_current = false where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '42501', null,
  'la dirección no quita la marca de actual por la API directa'
);

select throws_ok(
  $$update seasons set is_current = true where id = current_setting('fx.s_old')::uuid$$,
  '42501', null,
  'ni se la pone a otra'
);

select throws_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on, is_current)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Con marca', '2031-09-01', '2032-06-30', true)$$,
  '42501', null,
  'ni da de alta una temporada ya marcada'
);

select results_eq(
  $$select count(*)::int from seasons
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and is_current$$,
  array[1],
  'el club sigue con una temporada actual, y solo una'
);

select * from finish();

rollback;
