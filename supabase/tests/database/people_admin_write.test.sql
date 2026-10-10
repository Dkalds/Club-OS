-- Escritura de dirección sobre las personas de su club (Fase 7, Task 11). Lo que se
-- garantiza:
--   · dirección da de alta, edita y archiva personas de SU club, nunca de otro;
--   · nadie borra una persona de verdad (sin grant de delete);
--   · nadie cambia su club ni su id (sin columna concedida);
--   · un entrenador no escribe nada de esto.
--
-- Se ejecuta con `pnpm test:db`. Transacción que se deshace al final; datos ficticios.
begin;

select plan(10);

do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@people-write.pgtap.test');
  u_coach_a uuid := tests.create_user('coach-a@people-write.pgtap.test');

  p_admin_a constant uuid := gen_random_uuid();
  p_coach_a constant uuid := gen_random_uuid();
  p_player constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'), (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_admin_a, club_a, 'adminA', 'Ficticia', null),
    (p_coach_a, club_a, 'coachA', 'Ficticio', null),
    (p_player, club_a, 'Jugador', 'Ficticio', 2015);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', p_admin_a),
    (club_a, u_coach_a, 'coach', p_coach_a);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.coach_a', u_coach_a::text, true);
  perform set_config('fx.p_player', p_player::text, true);
end
$$;

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select lives_ok(
  $$insert into people (organization_id, first_name, last_name, birth_year)
    values (current_setting('fx.club_a')::uuid, 'Nueva', 'Ficticia', 2014)$$,
  'dirección da de alta una persona de su club'
);
select lives_ok(
  $$update people set first_name = 'Jugador2', birth_year = 2016
    where id = current_setting('fx.p_player')::uuid$$,
  'dirección edita el nombre y el año de nacimiento de una persona de su club'
);
select lives_ok(
  $$update people set archived_at = now() where id = current_setting('fx.p_player')::uuid$$,
  'dirección archiva una persona de su club'
);
select throws_ok(
  $$insert into people (organization_id, first_name, last_name)
    values (current_setting('fx.club_b')::uuid, 'Hostil', 'Ficticia')$$,
  '42501', null,
  'dirección de A no da de alta una persona en el club B'
);
select is_empty(
  $$update people set first_name = 'Hostil'
    where organization_id = current_setting('fx.club_b')::uuid
    returning id$$,
  'dirección de A no edita a nadie del club B: ni una fila, RLS la filtra en silencio'
);
select throws_ok(
  $$update people set organization_id = current_setting('fx.club_b')::uuid
    where id = current_setting('fx.p_player')::uuid$$,
  '42501', null,
  'ni dirección cambia el club de una persona: no hay columna concedida'
);
select throws_ok(
  $$delete from people where id = current_setting('fx.p_player')::uuid$$,
  '42501', null,
  'nadie borra una persona de verdad: sin grant de delete'
);

select tests.authenticate_as(current_setting('fx.coach_a')::uuid);
select throws_ok(
  $$insert into people (organization_id, first_name, last_name)
    values (current_setting('fx.club_a')::uuid, 'Hostil', 'Ficticia')$$,
  '42501', null,
  'un entrenador no da de alta personas'
);
select is_empty(
  $$update people set first_name = 'Hostil'
    where id = current_setting('fx.p_player')::uuid
    returning id$$,
  'un entrenador no edita personas: ni una fila'
);
select is_empty(
  $$update people set archived_at = now()
    where id = current_setting('fx.p_player')::uuid
    returning id$$,
  'un entrenador no archiva personas: ni una fila'
);

select * from finish();

rollback;
