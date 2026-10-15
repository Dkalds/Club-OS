-- Tenancy: aislamiento entre clubes con RLS y controles de la marca.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). La CLI activa pgTAP en
-- el esquema `extensions` antes de lanzar los tests; los helpers `tests.*` vienen de
-- `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al final.
--
-- Los emails y los slugs son solo de este test, para que no choquen con los datos de
-- `pnpm seed` si la base local ya está sembrada.
begin;

select plan(45);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A: coachA (coach) y adminA (admin). Club B: coachB (coach). sinClub: sin membresía.
-- Los ids de usuario quedan en ajustes `fx.*` de la transacción para usarlos más abajo.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  coach_a uuid := tests.create_user('coach-a@tenancy.pgtap.test');
  admin_a uuid := tests.create_user('admin-a@tenancy.pgtap.test');
  coach_b uuid := tests.create_user('coach-b@tenancy.pgtap.test');
  sin_club uuid := tests.create_user('sin-club@tenancy.pgtap.test');
begin
  insert into organizations (id, slug, name, updated_at) values
    (club_a, 'club-a', 'Club A', '2000-01-01T00:00:00Z'),
    (club_b, 'club-b', 'Club B', '2000-01-01T00:00:00Z');

  insert into organization_branding (
    organization_id, display_name, short_name, way_name,
    color_accent, color_accent_pressed, color_on_accent, color_accent_soft, updated_at
  ) values
    (club_a, 'Club A', 'CA', 'The A Way', '#aabbcc', '#99aabb', '#000000', '#112233', '2000-01-01T00:00:00Z'),
    (club_b, 'Club B', 'CB', 'The B Way', '#ccbbaa', '#bbaa99', '#000000', '#332211', '2000-01-01T00:00:00Z');

  insert into memberships (organization_id, user_id, role) values
    (club_a, coach_a, 'coach'),
    (club_a, admin_a, 'admin'),
    (club_b, coach_b, 'coach');

  perform set_config('fx.coach_a', coach_a::text, true);
  perform set_config('fx.admin_a', admin_a::text, true);
  perform set_config('fx.coach_b', coach_b::text, true);
  perform set_config('fx.sin_club', sin_club::text, true);
end
$$;

-- ── coachA: solo su club ─────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.coach_a')::uuid);

select results_eq(
  'select slug from organizations',
  $$values ('club-a')$$,
  'coachA solo ve su club'
);

select results_eq(
  'select display_name from organization_branding',
  $$values ('Club A')$$,
  'coachA ve la marca de su club'
);

select is_empty(
  $$select 1 from organization_branding where organization_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'$$,
  'coachA no ve la marca de B'
);

select results_eq(
  'select user_id from memberships',
  $$values (current_setting('fx.coach_a')::uuid)$$,
  'coach ve solo su membresía'
);

select results_eq(
  'select user_id from profiles',
  $$values (current_setting('fx.coach_a')::uuid)$$,
  'coachA solo ve su perfil'
);

-- Desde Fase 7 Task 10 hay columnas de escritura para dirección (club_admin_write.test.sql
-- las cubre a fondo); un coach tiene el privilegio de columna pero RLS filtra su fila en
-- silencio, sin 42501: no es quien administra el club.
select is_empty(
  $$update organization_branding set color_accent = '#000000'
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    returning 1$$,
  'un coach no cambia la marca de su club: ni una fila'
);

select throws_ok(
  $$insert into memberships (organization_id, user_id, role)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', (select auth.uid()), 'admin')$$,
  '42501', null,
  'nadie se da de alta en otro club'
);

select throws_ok(
  $$update memberships set role = 'admin' where user_id = (select auth.uid())$$,
  '42501', null,
  'un coach no se asciende a admin'
);

-- ── adminA: todas las membresías de su club, ninguna de B ────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$select role::text from memberships
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' order by 1$$,
  $$values ('admin'), ('coach')$$,
  'admin ve todas las de su club'
);

select is_empty(
  $$select 1 from memberships where organization_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'admin no ve membresías de otros clubes'
);

-- Desde Fase 7 Task 10, dirección sí cambia el nombre de su club (club_admin_write.test.sql
-- lo cubre a fondo, incluido que no toca el de otro club).
select lives_ok(
  $$update organizations set name = 'Otro nombre' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'dirección cambia el nombre de su club'
);

-- ── coachB: el aislamiento vale en los dos sentidos ──────────────────────────────────
select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select results_eq(
  'select slug from organizations',
  $$values ('club-b')$$,
  'coachB solo ve su club'
);

select is_empty(
  $$select 1 from organization_branding where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'coachB no ve la marca de A'
);

select is_empty(
  $$select 1 from memberships where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'coachB no ve las membresías de A'
);

-- ── sinClub: con sesión pero sin membresía ───────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.sin_club')::uuid);

select is_empty('select * from organizations', 'sin membresía no ve clubes');
select is_empty('select * from organization_branding', 'sin membresía no ve marcas');
select is_empty('select * from memberships', 'sin membresía no ve membresías');

-- ── anon: sin privilegios sobre ninguna tabla ────────────────────────────────────────
select tests.clear_authentication();

select throws_ok('select * from organizations', '42501', null, 'anon no tiene acceso');
select throws_ok('select * from organization_branding', '42501', null, 'anon no tiene acceso a la marca');
select throws_ok('select * from profiles', '42501', null, 'anon no tiene acceso a los perfiles');
select throws_ok('select * from memberships', '42501', null, 'anon no tiene acceso a las membresías');
select throws_ok(
  $$select private.is_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$,
  '42501', null,
  'anon no puede usar las funciones de private'
);

-- ── Solo cuentan las membresías activas ──────────────────────────────────────────────
reset role;
update memberships set status = 'revoked' where user_id = current_setting('fx.coach_a')::uuid;
select tests.authenticate_as(current_setting('fx.coach_a')::uuid);

select is_empty('select * from organizations', 'membresía revocada pierde el acceso');
select is_empty('select * from organization_branding', 'membresía revocada no ve la marca');

reset role;
update memberships set status = 'revoked' where user_id = current_setting('fx.admin_a')::uuid;
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  'select user_id from memberships',
  $$values (current_setting('fx.admin_a')::uuid)$$,
  'admin revocado solo ve su propia fila'
);

-- ── Restricciones (como postgres) ────────────────────────────────────────────────────
reset role;

-- Los colores de marca acaban en un atributo style: el CHECK es un control de seguridad.
select throws_ok(
  $$update organization_branding set color_accent = 'red;background:url(x)'
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null,
  'color malformado rechazado'
);

select throws_ok(
  $$update organization_branding set color_accent_pressed = 'red;background:url(x)'
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null,
  'color malformado rechazado en color_accent_pressed'
);

select throws_ok(
  $$update organization_branding set color_on_accent = 'red;background:url(x)'
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null,
  'color malformado rechazado en color_on_accent'
);

select throws_ok(
  $$update organization_branding set color_accent_soft = 'red;background:url(x)'
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null,
  'color malformado rechazado en color_accent_soft'
);

select throws_ok(
  $$update organization_branding set color_accent = '#aabbcc;background:url(x)'
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null,
  'color válido seguido de CSS rechazado'
);

select throws_ok(
  $$update organization_branding set color_accent = E'#aabbcc\n'
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null,
  'color con salto de línea final rechazado'
);

select throws_ok(
  $$update organization_branding set color_accent = '#AABBCC'
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null,
  'color hex en mayúsculas rechazado'
);

select lives_ok(
  $$update organization_branding set color_accent = '#0a1b2c'
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  'color hex válido aceptado'
);

select throws_ok(
  $$insert into organizations (slug, name) values ('Club_A', 'Slug inválido')$$,
  '23514', null,
  'slug con formato inválido rechazado'
);

select throws_ok(
  $$update organization_branding set short_name = 'CLUBA'
    where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,
  '23514', null,
  'short_name de más de 4 caracteres rechazado'
);

-- ── Triggers ─────────────────────────────────────────────────────────────────────────
select results_eq(
  $$select count(*)::int from profiles where user_id in (
      current_setting('fx.coach_a')::uuid, current_setting('fx.admin_a')::uuid,
      current_setting('fx.coach_b')::uuid, current_setting('fx.sin_club')::uuid)$$,
  array[4],
  'cada usuario nuevo recibe su perfil'
);

update organizations set name = 'Club A renombrado' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Las fixtures dejan `updated_at` en el año 2000. El trigger lo fija con `clock_timestamp()`
-- (la biblioteca de ejercicios lo necesita así), que nunca es anterior al inicio de la
-- transacción, `now()`.
select ok(
  (select updated_at >= now() from organizations where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'organizations.updated_at se actualiza al modificar'
);

select ok(
  (select updated_at >= now() from organization_branding
   where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'organization_branding.updated_at se actualiza al modificar'
);

-- ── Privilegios y RLS de las cuatro tablas ───────────────────────────────────────────
select results_eq(
  $$select count(*)::int from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('organizations', 'organization_branding', 'profiles', 'memberships')
      and relrowsecurity$$,
  array[4],
  'RLS activado en las cuatro tablas'
);

select is_empty(
  $$select table_name, privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
      and table_name in ('organizations', 'organization_branding', 'profiles', 'memberships')$$,
  'anon no tiene ningún privilegio sobre las tablas'
);

select is_empty(
  $$select table_name, privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and table_name in ('organizations', 'organization_branding', 'profiles', 'memberships')
      and privilege_type <> 'SELECT'$$,
  'authenticated no tiene privilegios de escritura'
);

select results_eq(
  $$select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and table_name in ('organizations', 'organization_branding', 'profiles', 'memberships')
      and privilege_type = 'SELECT'$$,
  array[4],
  'authenticated puede leer las cuatro tablas'
);

-- Las funciones de private no son para anon: ni el esquema ni la ejecución.
select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon no tiene acceso al esquema private'
);

select is_empty(
  $$select p.oid::regprocedure::text from pg_proc as p
    where p.pronamespace = 'private'::regnamespace
      and has_function_privilege('anon', p.oid, 'execute')$$,
  'anon no puede ejecutar ninguna función de private'
);

-- El seed y los scripts escriben con la clave de servicio (nunca desde src/).
select results_eq(
  $$select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'service_role'
      and table_name in ('organizations', 'organization_branding', 'profiles', 'memberships')
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')$$,
  array[16],
  'service_role puede leer y escribir las cuatro tablas'
);

select * from finish();

rollback;
