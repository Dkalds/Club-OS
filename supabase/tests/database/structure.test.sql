-- Estructura deportiva: personas, temporadas, categorías, equipos y plantillas.
--
-- RLS aísla por club y, dentro del club, por equipo: quien entrena un equipo no ve la
-- plantilla ni el cuerpo técnico de otro, aunque sea del mismo club.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*`
-- vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al
-- final. Los datos son ficticios y solo de este test; de las personas solo hay año de
-- nacimiento.
begin;

select plan(75);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A
--   T1 «Alevín A»:   staff c1 (head coach) y as1 (ayudante, sin cuenta); jugador p1 (#4)
--   T2 «Benjamín A»: staff c2 (head coach) y multia (ayudante);          jugador p2 (#4)
--   adminA es admin y no está en ningún equipo. `jugador` es la cuenta de p1 (rol player).
-- Club B
--   TB «Infantil A»: staff cb (head coach); jugador pb (#7)
-- `multi` tiene membresía en los dos clubes: staff de T2 en A (persona multia) y sin
-- equipo en B (persona multib).
--
-- `people.first_name` hace de clave para leer las aserciones. Los ids quedan en ajustes
-- `fx.*` de la transacción: `fx.c1` es un usuario, `fx.p_c1` su persona.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_c1 uuid := tests.create_user('c1@structure.pgtap.test');
  u_c2 uuid := tests.create_user('c2@structure.pgtap.test');
  u_admin_a uuid := tests.create_user('admin-a@structure.pgtap.test');
  u_jugador uuid := tests.create_user('jugador@structure.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@structure.pgtap.test');
  u_multi uuid := tests.create_user('multi@structure.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_as1 constant uuid := gen_random_uuid();
  p_c2 constant uuid := gen_random_uuid();
  p_multia constant uuid := gen_random_uuid();
  p_admin constant uuid := gen_random_uuid();
  p_p1 constant uuid := gen_random_uuid();
  p_p2 constant uuid := gen_random_uuid();
  p_cb constant uuid := gen_random_uuid();
  p_multib constant uuid := gen_random_uuid();
  p_pb constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  season_b constant uuid := gen_random_uuid();
  cat_alevin constant uuid := gen_random_uuid();
  cat_benjamin constant uuid := gen_random_uuid();
  cat_infantil constant uuid := gen_random_uuid();
  t1 constant uuid := gen_random_uuid();
  t2 constant uuid := gen_random_uuid();
  tb constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_as1, club_a, 'as1', 'Ficticio', null),
    (p_c2, club_a, 'c2', 'Ficticia', null),
    (p_multia, club_a, 'multia', 'Ficticia', null),
    (p_admin, club_a, 'admin', 'Ficticio', null),
    (p_p1, club_a, 'p1', 'Ficticio', 2015),
    (p_p2, club_a, 'p2', 'Ficticia', 2017),
    (p_cb, club_b, 'cb', 'Ficticio', null),
    (p_multib, club_b, 'multib', 'Ficticia', null),
    (p_pb, club_b, 'pb', 'Ficticia', 2013);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_c1, 'coach', p_c1),
    (club_a, u_c2, 'coach', p_c2),
    (club_a, u_admin_a, 'admin', p_admin),
    (club_a, u_jugador, 'player', p_p1),
    (club_a, u_multi, 'coach', p_multia),
    (club_b, u_coach_b, 'coach', p_cb),
    (club_b, u_multi, 'coach', p_multib);

  -- Los dos clubes tienen su temporada actual a la vez: el índice único es por club.
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
    (club_a, t1, p_as1, 'assistant'),
    (club_a, t2, p_c2, 'head_coach'),
    (club_a, t2, p_multia, 'assistant'),
    (club_b, tb, p_cb, 'head_coach');

  -- p1 y p2 llevan el mismo dorsal en equipos distintos: el dorsal es único por equipo.
  insert into team_players (organization_id, team_id, person_id, jersey_number, position) values
    (club_a, t1, p_p1, 4, 'Base'),
    (club_a, t2, p_p2, 4, 'Base'),
    (club_b, tb, p_pb, 7, 'Alero');

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.c2', u_c2::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.jugador', u_jugador::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.multi', u_multi::text, true);
  perform set_config('fx.p_c1', p_c1::text, true);
  perform set_config('fx.p_p1', p_p1::text, true);
  perform set_config('fx.p_p2', p_p2::text, true);
  perform set_config('fx.p_cb', p_cb::text, true);
  perform set_config('fx.p_pb', p_pb::text, true);
  perform set_config('fx.season_a', season_a::text, true);
  perform set_config('fx.season_b', season_b::text, true);
  perform set_config('fx.cat_alevin', cat_alevin::text, true);
  perform set_config('fx.cat_infantil', cat_infantil::text, true);
  perform set_config('fx.t1', t1::text, true);
  perform set_config('fx.t2', t2::text, true);
  perform set_config('fx.tb', tb::text, true);
end
$$;

-- ── c1: staff de T1 ──────────────────────────────────────────────────────────────────
-- Cada conjunto es exacto: lo que c1 ve y, a la vez, que no ve nada más (ni T2 ni B).
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select results_eq(
  'select id from teams',
  $$values (current_setting('fx.t1')::uuid)$$,
  'c1 ve solo su equipo'
);

select results_eq(
  'select person_id from team_players',
  $$values (current_setting('fx.p_p1')::uuid)$$,
  'c1 ve la plantilla de T1 y no la de T2'
);

select results_eq(
  'select first_name from people order by 1',
  $$values ('as1'), ('c1'), ('p1')$$,
  'c1 ve a su gente'
);

select results_eq(
  'select team_id, staff_role::text from team_staff order by 2',
  $$values (current_setting('fx.t1')::uuid, 'assistant'),
           (current_setting('fx.t1')::uuid, 'head_coach')$$,
  'c1 ve el cuerpo técnico de T1 y no el de T2'
);

select results_eq(
  'select organization_id from seasons',
  $$values (current_setting('fx.club_a')::uuid)$$,
  'c1 ve la temporada de su club y no la de B'
);

select results_eq(
  'select name from categories order by sort',
  $$values ('Benjamín'), ('Alevín')$$,
  'c1 ve las categorías de su club y no las de B'
);

-- En esta fase no hay escrituras para usuarios: ni política ni privilegio.
select throws_ok(
  $$insert into team_staff (organization_id, team_id, person_id, staff_role)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t2')::uuid,
            current_setting('fx.p_c1')::uuid, 'assistant')$$,
  '42501', null,
  'nadie se añade al cuerpo técnico de otro equipo'
);

select throws_ok(
  $$update people set last_name = 'Cambiado'$$,
  '42501', null,
  'nadie edita personas en esta fase'
);

select throws_ok(
  $$delete from team_players$$,
  '42501', null,
  'nadie edita plantillas en esta fase'
);

-- ── c2: staff de T2, mismo club (Review Focus 3) ─────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c2')::uuid);

-- Control positivo: c2 sí ve su plantilla, así que los `is_empty` de abajo no pasan en vacío.
select results_eq(
  'select person_id from team_players',
  $$values (current_setting('fx.p_p2')::uuid)$$,
  'c2 ve la plantilla de T2'
);

select is_empty(
  $$select 1 from team_players where team_id = current_setting('fx.t1')::uuid$$,
  'c2 no ve la plantilla de Alevín A'
);

select is_empty(
  $$select 1 from team_staff where team_id = current_setting('fx.t1')::uuid$$,
  'c2 no ve el cuerpo técnico de Alevín A'
);

select results_eq(
  'select id from teams',
  $$values (current_setting('fx.t2')::uuid)$$,
  'c2 no ve el equipo Alevín A'
);

select results_eq(
  'select first_name from people order by 1',
  $$values ('c2'), ('multia'), ('p2')$$,
  'c2 no ve a la gente de Alevín A'
);

-- ── adminA: todo su club, nada de B ──────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  'select name from teams order by 1',
  $$values ('Alevín A'), ('Benjamín A')$$,
  'admin ve los dos equipos de su club y nada de B'
);

select results_eq(
  'select organization_id, count(*)::int from team_players group by 1',
  $$values (current_setting('fx.club_a')::uuid, 2)$$,
  'admin ve las plantillas de su club y ninguna de B'
);

select results_eq(
  'select organization_id, count(*)::int from team_staff group by 1',
  $$values (current_setting('fx.club_a')::uuid, 4)$$,
  'admin ve los cuerpos técnicos de su club y ninguno de B'
);

select results_eq(
  'select first_name from people order by 1',
  $$values ('admin'), ('as1'), ('c1'), ('c2'), ('multia'), ('p1'), ('p2')$$,
  'admin ve a todas las personas de su club y a nadie de B'
);

-- Desde Fase 7 Task 10, dirección edita los equipos de su club (sin where, solo toca los
-- suyos: RLS filtra en silencio los de B, no hace falta un 42501 para protegerlos).
select results_eq(
  $$update teams set name = name || ' (editado)' returning organization_id$$,
  $$values (current_setting('fx.club_a')::uuid), (current_setting('fx.club_a')::uuid)$$,
  'admin edita los equipos de su club con un update sin where, y solo los suyos'
);

-- ── coachB: el aislamiento entre clubes vale en los dos sentidos ─────────────────────
select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select results_eq(
  'select id from teams',
  $$values (current_setting('fx.tb')::uuid)$$,
  'coach de B no ve los equipos de A'
);

select results_eq(
  'select person_id from team_players',
  $$values (current_setting('fx.p_pb')::uuid)$$,
  'coach de B no ve las plantillas de A'
);

select results_eq(
  'select person_id from team_staff',
  $$values (current_setting('fx.p_cb')::uuid)$$,
  'coach de B no ve los cuerpos técnicos de A'
);

select results_eq(
  'select first_name from people order by 1',
  $$values ('cb'), ('pb')$$,
  'coach de B no ve a nadie de A'
);

select results_eq(
  'select organization_id from seasons',
  $$values (current_setting('fx.club_b')::uuid)$$,
  'coach de B no ve las temporadas de A'
);

select results_eq(
  'select name from categories',
  $$values ('Infantil')$$,
  'coach de B no ve las categorías de A'
);

-- ── multi: una cuenta con membresía en los dos clubes ────────────────────────────────
-- Cada club se resuelve con su propia membresía: ser staff en A no abre el equipo de B.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select results_eq(
  'select id from teams',
  $$values (current_setting('fx.t2')::uuid)$$,
  'ser staff en un club no da acceso a los equipos de otro'
);

select results_eq(
  'select person_id from team_players',
  $$values (current_setting('fx.p_p2')::uuid)$$,
  'ser staff en un club no da acceso a las plantillas de otro'
);

select results_eq(
  'select first_name from people order by 1',
  $$values ('c2'), ('multia'), ('multib'), ('p2')$$,
  'con dos clubes ve a su gente de A y solo su propia persona en B'
);

select results_eq(
  'select count(*)::int from seasons',
  array[2],
  'con dos clubes ve la temporada de cada uno'
);

-- ── jugador: miembro del club que no es staff de ningún equipo ───────────────────────
select tests.authenticate_as(current_setting('fx.jugador')::uuid);

-- Control positivo: es miembro activo, ve lo que ve cualquier miembro.
select results_eq(
  'select organization_id from seasons',
  $$values (current_setting('fx.club_a')::uuid)$$,
  'un miembro sin equipo ve la temporada de su club'
);

select results_eq(
  'select first_name from people',
  $$values ('p1')$$,
  'un miembro sin equipo solo ve su propia persona'
);

select is_empty('select * from teams', 'un miembro sin equipo no ve equipos');
select is_empty('select * from team_players', 'un miembro sin equipo no ve plantillas');
select is_empty('select * from team_staff', 'un miembro sin equipo no ve cuerpos técnicos');

-- ── anon: sin privilegios sobre ninguna tabla ────────────────────────────────────────
select tests.clear_authentication();

select throws_ok('select * from people', '42501', null, 'anon no tiene acceso a las personas');
select throws_ok('select * from seasons', '42501', null, 'anon no tiene acceso a las temporadas');
select throws_ok('select * from categories', '42501', null, 'anon no tiene acceso a las categorías');
select throws_ok('select * from teams', '42501', null, 'anon no tiene acceso a los equipos');
select throws_ok('select * from team_staff', '42501', null, 'anon no tiene acceso a los cuerpos técnicos');
select throws_ok('select * from team_players', '42501', null, 'anon no tiene acceso a las plantillas');

select throws_ok(
  $$select private.is_team_staff(current_setting('fx.t1')::uuid)$$,
  '42501', null,
  'anon no puede usar is_team_staff'
);

select throws_ok(
  $$select private.can_see_person(current_setting('fx.p_p1')::uuid)$$,
  '42501', null,
  'anon no puede usar can_see_person'
);

-- ── Solo cuentan las membresías activas ──────────────────────────────────────────────
-- Control positivo: es el mismo c1 que arriba veía su equipo, su plantilla y a su gente.
reset role;
update memberships set status = 'revoked' where user_id = current_setting('fx.c1')::uuid;
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select is_empty('select * from teams', 'membresía revocada no ve equipos');
select is_empty('select * from team_players', 'membresía revocada no ve plantillas');
select is_empty('select * from team_staff', 'membresía revocada no ve cuerpos técnicos');
select is_empty('select * from people', 'membresía revocada no ve personas, ni la suya');
select is_empty('select * from seasons', 'membresía revocada no ve temporadas');
select is_empty('select * from categories', 'membresía revocada no ve categorías');

-- ── Claves foráneas compuestas (como postgres) ───────────────────────────────────────
-- Control positivo: las fixtures de arriba, todas dentro de su club, se insertaron.
reset role;

-- El equipo es de A: decir que la fila es de B no basta para meter a alguien de B.
select throws_ok(
  $$insert into team_players (organization_id, team_id, person_id)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.p_pb')::uuid)$$,
  '23503', null,
  'FK compuesta impide mezclar clubes'
);

select throws_ok(
  $$insert into team_players (organization_id, team_id, person_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.p_pb')::uuid)$$,
  '23503', null,
  'una persona de otro club no entra en la plantilla'
);

select throws_ok(
  $$insert into team_staff (organization_id, team_id, person_id, staff_role)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.p_cb')::uuid, 'assistant')$$,
  '23503', null,
  'el cuerpo técnico de un equipo no admite filas de otro club'
);

select throws_ok(
  $$insert into team_staff (organization_id, team_id, person_id, staff_role)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.p_cb')::uuid, 'assistant')$$,
  '23503', null,
  'una persona de otro club no entra en el cuerpo técnico'
);

select throws_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.season_a')::uuid,
            current_setting('fx.cat_infantil')::uuid, 'Equipo cruzado')$$,
  '23503', null,
  'un equipo no usa la temporada de otro club'
);

select throws_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_b')::uuid, current_setting('fx.season_b')::uuid,
            current_setting('fx.cat_alevin')::uuid, 'Equipo cruzado')$$,
  '23503', null,
  'un equipo no usa la categoría de otro club'
);

select throws_ok(
  $$update memberships set person_id = current_setting('fx.p_pb')::uuid
    where user_id = current_setting('fx.c2')::uuid$$,
  '23503', null,
  'una membresía no enlaza con una persona de otro club'
);

-- ── Restricciones (como postgres) ────────────────────────────────────────────────────
select lives_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on)
    values (current_setting('fx.club_a')::uuid, '2027/28', '2027-09-01', '2028-06-30')$$,
  'una segunda temporada que no es la actual se acepta'
);

select throws_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on, is_current)
    values (current_setting('fx.club_a')::uuid, '2028/29', '2028-09-01', '2029-06-30', true)$$,
  '23505', null,
  'una sola temporada actual por club'
);

select throws_ok(
  $$insert into team_players (organization_id, team_id, person_id, jersey_number)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.t1')::uuid,
            current_setting('fx.p_p2')::uuid, 4)$$,
  '23505', null,
  'dorsal único por equipo'
);

select throws_ok(
  $$update team_players set jersey_number = 100
    where person_id = current_setting('fx.p_p1')::uuid$$,
  '23514', null,
  'dorsal por encima de 99 rechazado'
);

select throws_ok(
  $$update team_players set jersey_number = -1
    where person_id = current_setting('fx.p_p1')::uuid$$,
  '23514', null,
  'dorsal negativo rechazado'
);

select throws_ok(
  $$update people set birth_year = 1899 where id = current_setting('fx.p_p1')::uuid$$,
  '23514', null,
  'año de nacimiento anterior a 1900 rechazado'
);

select throws_ok(
  $$update people set birth_year = 2101 where id = current_setting('fx.p_p1')::uuid$$,
  '23514', null,
  'año de nacimiento posterior a 2100 rechazado'
);

select throws_ok(
  $$update categories set age_band = 'Sub12' where id = current_setting('fx.cat_alevin')::uuid$$,
  '23514', null,
  'franja de edad con formato inválido rechazada'
);

select throws_ok(
  $$update categories set age_band = 'U123' where id = current_setting('fx.cat_alevin')::uuid$$,
  '23514', null,
  'franja de edad de tres cifras rechazada'
);

select throws_ok(
  $$update categories set age_band = 'u12' where id = current_setting('fx.cat_alevin')::uuid$$,
  '23514', null,
  'franja de edad en minúsculas rechazada'
);

-- ── Menores: solo el año de nacimiento ───────────────────────────────────────────────
-- Añadir un dato personal a `people` obliga a tocar este test a propósito.
select columns_are(
  'public', 'people',
  array['id', 'organization_id', 'first_name', 'last_name', 'birth_year', 'created_at', 'archived_at',
        'photo_media_id'],
  'people guarda el año de nacimiento, nunca la fecha completa'
);

select col_type_is(
  'public', 'people', 'birth_year', 'smallint'::text,
  'birth_year es un año, no una fecha'::text
);

-- ── RLS, privilegios y funciones de las seis tablas ──────────────────────────────────
select results_eq(
  $$select count(*)::int from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('people', 'seasons', 'categories', 'teams', 'team_staff', 'team_players')
      and relrowsecurity$$,
  array[6],
  'RLS activado en las seis tablas'
);

select is_empty(
  $$select c.relname, p.privilege
    from pg_class as c
    cross join unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'])
      as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('people', 'seasons', 'categories', 'teams', 'team_staff', 'team_players')
      and has_table_privilege('anon', c.oid, p.privilege)$$,
  'anon no tiene ningún privilegio sobre las tablas'
);

-- seasons, categories y teams tienen insert y update desde Fase 7 Task 10 (dirección);
-- esas tres quedan fuera de aquí y las cubre club_admin_write.test.sql y posture.test.sql.
select is_empty(
  $$select c.relname, p.privilege
    from pg_class as c
    cross join unnest(array['insert', 'update', 'delete', 'truncate', 'references', 'trigger'])
      as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('people', 'team_staff', 'team_players')
      and has_table_privilege('authenticated', c.oid, p.privilege)$$,
  'authenticated no tiene privilegios de escritura sobre las tablas que siguen de solo lectura'
);
select is_empty(
  $$select c.relname, p.privilege
    from pg_class as c
    cross join unnest(array['delete', 'truncate', 'references', 'trigger'])
      as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('seasons', 'categories', 'teams')
      and has_table_privilege('authenticated', c.oid, p.privilege)$$,
  'y ni seasons, categories ni teams se borran (sin grant de delete)'
);

select results_eq(
  $$select count(*)::int from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('people', 'seasons', 'categories', 'teams', 'team_staff', 'team_players')
      and has_table_privilege('authenticated', c.oid, 'select')$$,
  array[6],
  'authenticated puede leer las seis tablas'
);

-- El seed y los scripts escriben con la clave de servicio (nunca desde src/).
select results_eq(
  $$select count(*)::int
    from pg_class as c
    cross join unnest(array['select', 'insert', 'update', 'delete']) as p (privilege)
    where c.relnamespace = 'public'::regnamespace
      and c.relname in ('people', 'seasons', 'categories', 'teams', 'team_staff', 'team_players')
      and has_table_privilege('service_role', c.oid, p.privilege)$$,
  array[24],
  'service_role puede leer y escribir las seis tablas'
);

-- Las dos funciones de RLS: `stable security definer` con `search_path` vacío, y fuera
-- del alcance de anon (PUBLIC incluido).
select results_eq(
  $$select count(*)::int from pg_proc as f
    where f.pronamespace = 'private'::regnamespace
      and f.proname in ('is_team_staff', 'can_see_person')
      and f.prosecdef
      and f.provolatile = 's'
      and f.proconfig = array['search_path=""']$$,
  array[2],
  'is_team_staff y can_see_person son stable security definer con search_path vacío'
);

select is_empty(
  $$select f.oid::regprocedure::text from pg_proc as f
    where f.pronamespace = 'private'::regnamespace
      and f.proname in ('is_team_staff', 'can_see_person')
      and has_function_privilege('anon', f.oid, 'execute')$$,
  'anon no puede ejecutar is_team_staff ni can_see_person'
);

select * from finish();

rollback;
