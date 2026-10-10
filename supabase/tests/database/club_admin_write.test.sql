-- Escritura de dirección sobre su propio club (Fase 7, Task 10). Lo que se garantiza:
--   · dirección cambia el nombre y la zona horaria de SU club, nunca el de otro;
--   · ni dirección ni nadie cambia `slug` ni `status` (sin columna, sin política de verdad);
--   · dirección cambia la marca, la terminología y los dos textos de consentimiento de su
--     club;
--   · dirección da de alta y edita temporadas, categorías y equipos de su club, nunca de
--     otro, y no los borra (sin grant de delete);
--   · un entrenador no escribe nada de esto.
--
-- Se ejecuta con `pnpm test:db`. Transacción que se deshace al final; datos ficticios.
begin;

select plan(17);

do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@club-admin-write.pgtap.test');
  u_coach_a uuid := tests.create_user('coach-a@club-admin-write.pgtap.test');

  p_admin_a constant uuid := gen_random_uuid();
  p_coach_a constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  cat_a constant uuid := gen_random_uuid();
  team_a constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'), (club_b, 'club-b', 'Club B');

  insert into organization_branding (
    organization_id, display_name, short_name, way_name,
    color_accent, color_accent_pressed, color_on_accent, color_accent_soft,
    terms_text, image_consent_text
  ) values
    (club_a, 'Club A', 'CLA', 'El camino', '#5aa9e6', '#4a90c8', '#0a0a0b', '#14283a',
     'Condiciones de Club A.', 'Imagen de Club A.'),
    (club_b, 'Club B', 'CLB', 'El camino', '#5aa9e6', '#4a90c8', '#0a0a0b', '#14283a',
     'Condiciones de Club B.', 'Imagen de Club B.');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_admin_a, club_a, 'adminA', 'Ficticia', null),
    (p_coach_a, club_a, 'coachA', 'Ficticio', null);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', p_admin_a),
    (club_a, u_coach_a, 'coach', p_coach_a);

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true);
  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_a, club_a, 'Alevín', 'U12', 10);
  insert into teams (id, organization_id, season_id, category_id, name) values
    (team_a, club_a, season_a, cat_a, 'T1');

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.coach_a', u_coach_a::text, true);
  perform set_config('fx.season_a', season_a::text, true);
  perform set_config('fx.cat_a', cat_a::text, true);
  perform set_config('fx.team_a', team_a::text, true);
end
$$;

-- ── organizations ─────────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select lives_ok(
  $$update organizations set name = 'Club A (editado)', timezone = 'Atlantic/Canary'
    where id = current_setting('fx.club_a')::uuid$$,
  'dirección cambia el nombre y la zona horaria de su club'
);
select is_empty(
  $$update organizations set name = 'Hostil' where id = current_setting('fx.club_b')::uuid returning 1$$,
  'dirección de A no cambia el club B: ni una fila, RLS la filtra en silencio'
);
select throws_ok(
  $$update organizations set slug = 'otro-slug' where id = current_setting('fx.club_a')::uuid$$,
  '42501', null, 'ni dirección cambia el slug: no hay columna concedida'
);
select throws_ok(
  $$update organizations set status = 'suspended' where id = current_setting('fx.club_a')::uuid$$,
  '42501', null, 'ni dirección cambia el estado: es soporte de plataforma'
);

select tests.authenticate_as(current_setting('fx.coach_a')::uuid);
select is_empty(
  $$update organizations set name = 'Hostil' where id = current_setting('fx.club_a')::uuid returning 1$$,
  'un entrenador no cambia los datos del club: ni una fila'
);

-- ── organization_branding ─────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select lives_ok(
  $$update organization_branding
      set display_name = 'Club A', color_accent = '#000000', terms_text = 'Nuevas condiciones.'
    where organization_id = current_setting('fx.club_a')::uuid$$,
  'dirección cambia la marca y los textos de consentimiento de su club'
);
select is_empty(
  $$update organization_branding set display_name = 'Hostil'
    where organization_id = current_setting('fx.club_b')::uuid returning 1$$,
  'dirección de A no cambia la marca del club B: ni una fila'
);

select tests.authenticate_as(current_setting('fx.coach_a')::uuid);
select is_empty(
  $$update organization_branding set display_name = 'Hostil'
    where organization_id = current_setting('fx.club_a')::uuid returning 1$$,
  'un entrenador no cambia la marca de su club: ni una fila'
);

-- ── seasons, categories, teams: alta y edición, nunca borrado ────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select lives_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on)
    values (current_setting('fx.club_a')::uuid, '2027/28', '2027-09-01', '2028-06-30')$$,
  'dirección da de alta una temporada de su club'
);
select lives_ok(
  $$update seasons set name = '2026/27 (editada)' where id = current_setting('fx.season_a')::uuid$$,
  'dirección edita una temporada de su club'
);
select throws_ok(
  $$insert into seasons (organization_id, name, starts_on, ends_on)
    values (current_setting('fx.club_b')::uuid, 'Hostil', '2027-09-01', '2028-06-30')$$,
  '42501', null, 'dirección de A no da de alta una temporada en el club B'
);
select throws_ok(
  $$delete from seasons where id = current_setting('fx.season_a')::uuid$$,
  '42501', null, 'nadie borra una temporada: sin grant de delete'
);

select lives_ok(
  $$insert into categories (organization_id, name, age_band, sort)
    values (current_setting('fx.club_a')::uuid, 'Infantil', 'U14', 20)$$,
  'dirección da de alta una categoría de su club'
);
select lives_ok(
  $$update categories set name = 'Alevín (editada)' where id = current_setting('fx.cat_a')::uuid$$,
  'dirección edita una categoría de su club'
);

select lives_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.season_a')::uuid,
            current_setting('fx.cat_a')::uuid, 'T2')$$,
  'dirección da de alta un equipo de su club'
);
select lives_ok(
  $$update teams set name = 'T1 (editado)' where id = current_setting('fx.team_a')::uuid$$,
  'dirección edita un equipo de su club'
);

select tests.authenticate_as(current_setting('fx.coach_a')::uuid);
select throws_ok(
  $$insert into teams (organization_id, season_id, category_id, name)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.season_a')::uuid,
            current_setting('fx.cat_a')::uuid, 'Hostil')$$,
  '42501', null, 'un entrenador no da de alta equipos'
);

select * from finish();

rollback;
