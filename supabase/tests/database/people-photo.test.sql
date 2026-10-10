-- Foto de persona (Fase 7, [D10]): la columna y el Storage nacen listos, pero nadie sube
-- nada en esta fase. Solo se comprueba que:
--   · `people.photo_media_id` liga con el club de la persona (clave compuesta, como el
--     diagrama de un ejercicio);
--   · se puede leer la carpeta de una persona que se puede ver (aunque hoy esté vacía), y no
--     la de una que no;
--   · nadie, con ningún rol, puede subir ni borrar ahí: sin política no hay acceso.
--
-- Se ejecuta con `pnpm test:db`. Transacción que se deshace al final; datos ficticios.
begin;

select plan(8);

do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_c1 uuid := tests.create_user('c1@people-photo.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@people-photo.pgtap.test');

  p_c1 constant uuid := gen_random_uuid();
  p_cb constant uuid := gen_random_uuid();
  p_player constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  season_b constant uuid := gen_random_uuid();
  cat_a constant uuid := gen_random_uuid();
  cat_b constant uuid := gen_random_uuid();
  t1 constant uuid := gen_random_uuid();
  tb constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'), (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_cb, club_b, 'cb', 'Ficticio', null),
    (p_player, club_a, 'Jugador', 'Ficticio', 2015);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_c1, 'coach', p_c1),
    (club_b, u_coach_b, 'coach', p_cb);

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true),
    (season_b, club_b, '2026/27', '2026-09-01', '2027-06-30', true);
  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_a, club_a, 'Alevín', 'U12', 10), (cat_b, club_b, 'Infantil', 'U14', 10);
  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, club_a, season_a, cat_a, 'T1'), (tb, club_b, season_b, cat_b, 'TB');
  insert into team_staff (organization_id, team_id, person_id, staff_role) values
    (club_a, t1, p_c1, 'head_coach'), (club_b, tb, p_cb, 'head_coach');
  insert into team_players (organization_id, team_id, person_id, jersey_number) values
    (club_a, t1, p_player, 9);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.p_player', p_player::text, true);
end
$$;

-- ── Clave foránea compuesta ───────────────────────────────────────────────────────────
reset role;
select lives_ok(
  $f$insert into media_assets (organization_id, path, kind, mime, bytes)
     values (current_setting('fx.club_a')::uuid,
             'org/' || current_setting('fx.club_a') || '/people/' ||
               current_setting('fx.p_player') || '/x.png',
             'image', 'image/png', 1000)$f$,
  'de paso, se puede registrar una ficha bajo people/ (el CHECK de path no lo impide)'
);
select lives_ok(
  $f$update people set photo_media_id =
    (select id from media_assets where path like 'org/%/people/%')
    where id = current_setting('fx.p_player')::uuid$f$,
  'una ficha de media_assets del mismo club se puede enlazar como foto'
);

-- ── Lectura: sigue a can_see_person ──────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);
select results_eq(
  $f$select private.can_see_person_media(
    'org/' || current_setting('fx.club_a') || '/people/' || current_setting('fx.p_player') || '/x.png'
  )$f$,
  $$values (true)$$,
  'c1 (cuerpo técnico del equipo del jugador) puede leer su carpeta'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);
select results_eq(
  $f$select private.can_see_person_media(
    'org/' || current_setting('fx.club_a') || '/people/' || current_setting('fx.p_player') || '/x.png'
  )$f$,
  $$values (false)$$,
  'coachB, de otro club, no'
);
select results_eq(
  $$select private.can_see_person_media('org/no-es-un-uuid/people/x/y.png')$$,
  $$values (false)$$,
  'una ruta que no tiene la forma esperada: false, nunca un error'
);

-- ── Nadie sube ni borra ([D10]) ───────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.c1')::uuid);
select throws_ok(
  $f$insert into storage.objects (bucket_id, name)
     values ('club-media', 'org/' || current_setting('fx.club_a') || '/people/' ||
               current_setting('fx.p_player') || '/nueva.png')$f$,
  '42501', null, 'ni el propio cuerpo técnico del jugador puede subir una foto todavía'
);

-- ── anon ─────────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select throws_ok(
  $f$select private.can_see_person_media(
    'org/' || current_setting('fx.club_a') || '/people/' || current_setting('fx.p_player') || '/x.png'
  )$f$,
  '42501', null, 'anon no ejecuta can_see_person_media'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'club-media' and name like '%/people/%'),
  0, 'control: nadie ha conseguido crear un objeto bajo people/, ni el intento rechazado arriba'
);

select * from finish();

rollback;
