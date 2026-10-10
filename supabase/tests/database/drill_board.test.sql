-- La pizarra de un ejercicio (`drills.board`).
--
-- Qué se verifica aquí:
--   · El `check`: es un objeto, dice su versión (1) y no pasa de 32 kB.
--   · La ve quien ve el ejercicio y nadie más: otro entrenador del club ve la de un publicado
--     y no la de un borrador ajeno; otro club, ninguna; un jugador, ninguna.
--   · Con la sesión de un usuario no se cambia: ni la dirección, ni el autor de un borrador.
--   · `save_drill` no la toca: guardar un ejercicio conserva su pizarra.
--   · Por la API directa, un borrador nuevo puede traerla, y pasa por el mismo `check`.
--
-- Se ejecuta con `pnpm test:db`. Los helpers `tests.*` vienen de `supabase/seed.sql`. Todo
-- ocurre dentro de una transacción que se deshace al final. Los datos son ficticios.
begin;

select plan(16);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin uuid := tests.create_user('admin@board.pgtap.test');
  u_c1    uuid := tests.create_user('c1@board.pgtap.test');
  u_c2    uuid := tests.create_user('c2@board.pgtap.test');
  u_jugad uuid := tests.create_user('jugador@board.pgtap.test');
  u_cb    uuid := tests.create_user('coach-b@board.pgtap.test');

  p_p1 constant uuid := gen_random_uuid();

  d_pub   constant uuid := gen_random_uuid();
  d_draft constant uuid := gen_random_uuid();
  d_b     constant uuid := gen_random_uuid();

  board constant jsonb := '{
    "version": 1, "court": "half",
    "tokens": [{"id": "a1", "kind": "attacker", "label": "1", "at": {"x": 50, "y": 70}}],
    "steps": [{"note": "El 1 corta al aro", "moves": [{"token": "a1", "kind": "cut", "to": {"x": 50, "y": 20}}]}]
  }';
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_p1, club_a, 'p1', 'Ficticio', 2015);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin, 'admin',  null),
    (club_a, u_c1,    'coach',  null),
    (club_a, u_c2,    'coach',  null),
    (club_a, u_jugad, 'player', p_p1),
    (club_b, u_cb,    'coach',  null);

  insert into drills (
    id, organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age,
    status, created_by, board
  ) values
    (d_pub,   club_a, 'Publicado con pizarra', 4, 10, 10, 15, 10, 'published', u_admin, board),
    (d_draft, club_a, 'Borrador con pizarra',  4, 10, 10, 15, 10, 'draft',     u_c1,    board),
    (d_b,     club_b, 'Del club B',            4, 10, 10, 15, 10, 'published', u_cb,    board);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.admin', u_admin::text, true);
  perform set_config('fx.c1',    u_c1::text,    true);
  perform set_config('fx.c2',    u_c2::text,    true);
  perform set_config('fx.jugad', u_jugad::text, true);
  perform set_config('fx.cb',    u_cb::text,    true);
  perform set_config('fx.d_pub',   d_pub::text,   true);
  perform set_config('fx.d_draft', d_draft::text, true);
  perform set_config('fx.d_b',     d_b::text,     true);
  perform set_config('fx.board', board::text, true);
end
$$;

-- ── El check ──────────────────────────────────────────────────────────────────────────

-- 1. No es un objeto.
select throws_ok(
  $$update drills set board = '"una pizarra"'::jsonb where id = current_setting('fx.d_pub')::uuid$$,
  '23514', null,
  'un texto no es una pizarra'
);

select throws_ok(
  $$update drills set board = '[]'::jsonb where id = current_setting('fx.d_pub')::uuid$$,
  '23514', null,
  'una lista no es una pizarra'
);

-- 3. Otra versión, o ninguna.
select throws_ok(
  $$update drills set board = '{"version": 2, "tokens": []}'::jsonb
    where id = current_setting('fx.d_pub')::uuid$$,
  '23514', null,
  'una versión que no es la 1 se rechaza'
);

select throws_ok(
  $$update drills set board = '{"tokens": []}'::jsonb where id = current_setting('fx.d_pub')::uuid$$,
  '23514', null,
  'sin versión se rechaza'
);

-- 5. Demasiado grande.
select throws_ok(
  $$update drills set board = jsonb_build_object('version', 1, 'relleno', repeat('x', 40000))
    where id = current_setting('fx.d_pub')::uuid$$,
  '23514', null,
  'una pizarra de más de 32 kB se rechaza'
);

-- 6. Quitarla vale.
select lives_ok(
  $$update drills set board = null where id = current_setting('fx.d_b')::uuid;
    update drills set board = current_setting('fx.board')::jsonb where id = current_setting('fx.d_b')::uuid$$,
  'una pizarra se quita y se vuelve a poner'
);

-- ── Quién la ve ───────────────────────────────────────────────────────────────────────

-- 7-8. c2, entrenador del club: la del publicado sí, la del borrador de c1 no.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select results_eq(
  $$select board -> 'tokens' -> 0 ->> 'label' from drills where id = current_setting('fx.d_pub')::uuid$$,
  $$values ('1')$$,
  'otro entrenador del club ve la pizarra de un ejercicio publicado'
);

select is_empty(
  $$select board from drills where id = current_setting('fx.d_draft')::uuid$$,
  'y no ve la del borrador de otro'
);

-- 9. coachB, de otro club: ninguna de A.
select tests.authenticate_as(current_setting('fx.cb')::uuid);

select is_empty(
  $$select board from drills where organization_id = current_setting('fx.club_a')::uuid$$,
  'otro club no ve ninguna pizarra de A'
);

-- 10. Un jugador no ve ejercicios, ni sus pizarras.
select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select is_empty(
  $$select board from drills where organization_id = current_setting('fx.club_a')::uuid$$,
  'un jugador no ve ninguna pizarra'
);

-- ── Quién la escribe ──────────────────────────────────────────────────────────────────

-- 11. La dirección cambia el contenido de un ejercicio, pero no su pizarra.
select tests.authenticate_as(current_setting('fx.admin')::uuid);

select throws_ok(
  $$update drills set board = null where id = current_setting('fx.d_pub')::uuid$$,
  '42501', 'permission denied for table drills',
  'la dirección no cambia la pizarra con su sesión'
);

-- 12. Ni el autor de un borrador la suya.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$update drills set board = null where id = current_setting('fx.d_draft')::uuid$$,
  '42501', 'permission denied for table drills',
  'el autor de un borrador no cambia su pizarra con su sesión'
);

-- 13-14. `save_drill` guarda el ejercicio y deja la pizarra como estaba.
select lives_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid,
      current_setting('fx.d_draft')::uuid,
      (select updated_at from drills where id = current_setting('fx.d_draft')::uuid),
      jsonb_build_object(
        'title', 'Borrador retocado', 'min_players', 4, 'max_players', 10,
        'min_minutes', 10, 'max_minutes', 15, 'min_age', 10
      ))$$,
  'c1 guarda su borrador con save_drill'
);

select results_eq(
  $$select title, board from drills where id = current_setting('fx.d_draft')::uuid$$,
  $$values ('Borrador retocado', current_setting('fx.board')::jsonb)$$,
  'save_drill cambia el contenido y conserva la pizarra'
);

-- 15-16. Por la API directa, un borrador nuevo puede traer pizarra, y pasa por el check.
select lives_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, board)
    values (current_setting('fx.club_a')::uuid, 'Con pizarra de alta', 4, 10, 10, 15, 10,
            current_setting('fx.board')::jsonb)$$,
  'un borrador propio puede nacer con pizarra por la API directa'
);

select throws_ok(
  $$insert into drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, board)
    values (current_setting('fx.club_a')::uuid, 'Con pizarra rota', 4, 10, 10, 15, 10,
            '{"version": 3}'::jsonb)$$,
  '23514', null,
  'y una que no cumple el check no entra'
);

select * from finish();
rollback;
