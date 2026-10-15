-- `save_drill_board`: guardar y quitar la pizarra de un ejercicio.
--
-- Qué se verifica aquí:
--   · La dirección guarda la pizarra de un ejercicio publicado; el autor, la de su borrador.
--   · No la guardan: otro entrenador (ni en un publicado ni en el borrador de otro), el autor
--     en su ejercicio ya publicado, otro club, un jugador (NOT_FOUND opaco); anon → 42501.
--   · La copia: con un `updated_at` que no es el vigente, STALE_COPY, y no se escribe nada.
--     Guardar mueve la copia del ejercicio.
--   · Una pizarra que no pasa el `check` es INVALID.
--   · Sin pizarra (ausente o `null` de JSON) la quita.
--   · Por la API directa: quien edita el ejercicio cambia la columna; quien no, no.
--   · El club: la dirección de OTRO club no guarda ni cambia nada de este.
--   · El orden (C26): quien no puede editar recibe NOT_FOUND también con una copia obsoleta
--     o con una pizarra inválida.
--
-- Se ejecuta con `pnpm test:db`. Los helpers `tests.*` vienen de `supabase/seed.sql`. Todo
-- ocurre dentro de una transacción que se deshace al final. Los datos son ficticios.
begin;

select plan(28);

-- ── Fixtures ──────────────────────────────────────────────────────────────────────────
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin uuid := tests.create_user('admin@boardsave.pgtap.test');
  u_c1    uuid := tests.create_user('c1@boardsave.pgtap.test');
  u_c2    uuid := tests.create_user('c2@boardsave.pgtap.test');
  u_jugad uuid := tests.create_user('jugador@boardsave.pgtap.test');
  u_cb    uuid := tests.create_user('coach-b@boardsave.pgtap.test');
  u_ab    uuid := tests.create_user('admin-b@boardsave.pgtap.test');

  p_p1 constant uuid := gen_random_uuid();

  d_pub    constant uuid := gen_random_uuid();
  d_draft  constant uuid := gen_random_uuid();
  d_c1_pub constant uuid := gen_random_uuid();

  board constant jsonb := '{
    "version": 1, "court": "half",
    "tokens": [{"id": "a1", "kind": "attacker", "label": "1", "at": {"x": 50, "y": 70}}],
    "steps": []
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
    (club_b, u_cb,    'coach',  null),
    (club_b, u_ab,    'admin',  null);

  insert into drills (
    id, organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age,
    status, created_by
  ) values
    (d_pub,    club_a, 'Publicado de dirección', 4, 10, 10, 15, 10, 'published', u_admin),
    (d_draft,  club_a, 'Borrador de c1',         4, 10, 10, 15, 10, 'draft',     u_c1),
    (d_c1_pub, club_a, 'Publicado de c1',        4, 10, 10, 15, 10, 'published', u_c1);

  perform set_config('fx.admin', u_admin::text, true);
  perform set_config('fx.c1',    u_c1::text,    true);
  perform set_config('fx.c2',    u_c2::text,    true);
  perform set_config('fx.jugad', u_jugad::text, true);
  perform set_config('fx.cb',    u_cb::text,    true);
  perform set_config('fx.ab',    u_ab::text,    true);
  perform set_config('fx.d_pub',    d_pub::text,    true);
  perform set_config('fx.d_draft',  d_draft::text,  true);
  perform set_config('fx.d_c1_pub', d_c1_pub::text, true);
  perform set_config('fx.board', board::text, true);
end
$$;

-- El `updated_at` vigente de un ejercicio, lo vea o no quien llama: las pruebas de permiso lo
-- usan como copia esperada, para que un NOT_FOUND no sea en realidad una copia obsoleta.
create function tests.token(d uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  select updated_at from public.drills where id = d;
$$;

-- ── Quién guarda ──────────────────────────────────────────────────────────────────────

-- 1-2. c1, en su borrador.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select lives_ok(
  $$select set_config('fx.u_draft',
      public.save_drill_board(
        current_setting('fx.d_draft')::uuid, tests.token(current_setting('fx.d_draft')::uuid),
        current_setting('fx.board')::jsonb)::text, true)$$,
  'el autor guarda la pizarra de su borrador'
);

select results_eq(
  $$select board, updated_at from drills where id = current_setting('fx.d_draft')::uuid$$,
  $$values (current_setting('fx.board')::jsonb, current_setting('fx.u_draft')::timestamptz)$$,
  'la pizarra queda guardada y la función devuelve la copia nueva del ejercicio'
);

-- Guardar mueve la copia: la de antes ya no vale.
select throws_like(
  $$select public.save_drill_board(
      current_setting('fx.d_draft')::uuid,
      current_setting('fx.u_draft')::timestamptz - interval '1 microsecond',
      current_setting('fx.board')::jsonb)$$,
  '%STALE_COPY%',
  'la copia de antes de guardar ya es obsoleta'
);

-- 3. Su propio ejercicio, ya publicado, no: publicar es de la dirección, y cambiarlo también.
select throws_like(
  $$select public.save_drill_board(
      current_setting('fx.d_c1_pub')::uuid, tests.token(current_setting('fx.d_c1_pub')::uuid),
      current_setting('fx.board')::jsonb)$$,
  '%NOT_FOUND%',
  'el autor no guarda la pizarra de su ejercicio ya publicado'
);

-- Tampoco por la API directa: la política no le deja la fila de su publicado.
select is_empty(
  $$update drills set board = current_setting('fx.board')::jsonb
    where id = current_setting('fx.d_c1_pub')::uuid returning id$$,
  'el autor no cambia por la API directa la pizarra de su ejercicio ya publicado'
);

-- El orden (C26): sin permiso es NOT_FOUND aunque la copia sea obsoleta o la pizarra inválida.
select throws_like(
  $$select public.save_drill_board(
      current_setting('fx.d_c1_pub')::uuid, '2000-01-01T00:00:00Z', '{"version": 2}'::jsonb)$$,
  '%NOT_FOUND%',
  'quien no puede editar recibe NOT_FOUND antes que STALE_COPY o INVALID'
);

-- 4. Ni la de un publicado de otro.
select throws_like(
  $$select public.save_drill_board(
      current_setting('fx.d_pub')::uuid, tests.token(current_setting('fx.d_pub')::uuid),
      current_setting('fx.board')::jsonb)$$,
  '%NOT_FOUND%',
  'un entrenador no guarda la pizarra de un ejercicio publicado'
);

-- 5. La copia obsoleta: no se escribe nada.
select throws_like(
  $$select public.save_drill_board(
      current_setting('fx.d_draft')::uuid, '2000-01-01T00:00:00Z', null)$$,
  '%STALE_COPY%',
  'con una copia que no es la vigente, STALE_COPY'
);

select results_eq(
  $$select board from drills where id = current_setting('fx.d_draft')::uuid$$,
  $$values (current_setting('fx.board')::jsonb)$$,
  'y la pizarra sigue como estaba'
);

-- 7. Una pizarra que no pasa el check.
select throws_ok(
  $$select public.save_drill_board(
      current_setting('fx.d_draft')::uuid, tests.token(current_setting('fx.d_draft')::uuid),
      '{"version": 2}'::jsonb)$$,
  '22023', 'INVALID',
  'una pizarra que no pasa el check es INVALID'
);

-- 8-9. Quitarla: sin el argumento.
select lives_ok(
  $$select public.save_drill_board(
      current_setting('fx.d_draft')::uuid, tests.token(current_setting('fx.d_draft')::uuid))$$,
  'sin pizarra, la quita'
);

select results_eq(
  $$select board is null from drills where id = current_setting('fx.d_draft')::uuid$$,
  $$values (true)$$,
  'el ejercicio se queda sin pizarra'
);

-- 10. Y con un `null` de JSON, lo mismo: no se guarda «null» como pizarra.
select lives_ok(
  $$select public.save_drill_board(
      current_setting('fx.d_draft')::uuid, tests.token(current_setting('fx.d_draft')::uuid),
      current_setting('fx.board')::jsonb);
    select public.save_drill_board(
      current_setting('fx.d_draft')::uuid, tests.token(current_setting('fx.d_draft')::uuid),
      'null'::jsonb)$$,
  'un null de JSON también la quita'
);

select results_eq(
  $$select board is null from drills where id = current_setting('fx.d_draft')::uuid$$,
  $$values (true)$$,
  'no queda «null» guardado como pizarra'
);

-- ── Quién no ──────────────────────────────────────────────────────────────────────────

-- 12. c2: el borrador de c1 ni lo ve.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select throws_like(
  $$select public.save_drill_board(
      current_setting('fx.d_draft')::uuid, tests.token(current_setting('fx.d_draft')::uuid),
      current_setting('fx.board')::jsonb)$$,
  '%NOT_FOUND%',
  'otro entrenador no guarda la pizarra del borrador de c1'
);

-- 13. Por la API directa tampoco cambia la de un publicado: la política no le deja la fila.
select is_empty(
  $$update drills set board = current_setting('fx.board')::jsonb
    where id = current_setting('fx.d_pub')::uuid returning id$$,
  'un entrenador no cambia por la API directa la pizarra de un publicado'
);

-- 14. Otro club.
select tests.authenticate_as(current_setting('fx.cb')::uuid);

select throws_like(
  $$select public.save_drill_board(
      current_setting('fx.d_pub')::uuid, tests.token(current_setting('fx.d_pub')::uuid),
      current_setting('fx.board')::jsonb)$$,
  '%NOT_FOUND%',
  'otro club recibe NOT_FOUND'
);

-- La dirección de OTRO club: aquí lo único que la para es el club, porque en el suyo edita
-- cualquier ejercicio.
select tests.authenticate_as(current_setting('fx.ab')::uuid);

select throws_like(
  $$select public.save_drill_board(
      current_setting('fx.d_pub')::uuid, tests.token(current_setting('fx.d_pub')::uuid),
      current_setting('fx.board')::jsonb)$$,
  '%NOT_FOUND%',
  'la dirección de otro club recibe NOT_FOUND en un publicado de este'
);

select throws_like(
  $$select public.save_drill_board(
      current_setting('fx.d_draft')::uuid, tests.token(current_setting('fx.d_draft')::uuid),
      current_setting('fx.board')::jsonb)$$,
  '%NOT_FOUND%',
  'y en un borrador de este'
);

select is_empty(
  $$update drills set board = current_setting('fx.board')::jsonb
    where id in (current_setting('fx.d_pub')::uuid, current_setting('fx.d_draft')::uuid) returning id$$,
  'la dirección de otro club no cambia nada por la API directa'
);

select is_empty(
  $$select id from drills where id in (current_setting('fx.d_pub')::uuid, current_setting('fx.d_draft')::uuid)$$,
  'ni ve esos ejercicios'
);

-- 15. Un jugador.
select tests.authenticate_as(current_setting('fx.jugad')::uuid);

select throws_like(
  $$select public.save_drill_board(
      current_setting('fx.d_pub')::uuid, tests.token(current_setting('fx.d_pub')::uuid),
      current_setting('fx.board')::jsonb)$$,
  '%NOT_FOUND%',
  'un jugador recibe NOT_FOUND'
);

-- 16. anon no ejecuta la función.
select tests.clear_authentication();

select throws_ok(
  $$select public.save_drill_board(current_setting('fx.d_pub')::uuid, now(), null)$$,
  '42501', 'permission denied for function save_drill_board',
  'anon no puede llamar a save_drill_board (42501)'
);

-- ── La dirección ──────────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin')::uuid);

-- 17-18. Guarda la de un publicado, y la del borrador de otro.
select lives_ok(
  $$select public.save_drill_board(
      current_setting('fx.d_pub')::uuid, tests.token(current_setting('fx.d_pub')::uuid),
      current_setting('fx.board')::jsonb)$$,
  'la dirección guarda la pizarra de un ejercicio publicado'
);

select lives_ok(
  $$select public.save_drill_board(
      current_setting('fx.d_draft')::uuid, tests.token(current_setting('fx.d_draft')::uuid),
      current_setting('fx.board')::jsonb)$$,
  'y la del borrador de un entrenador'
);

-- 19. Por la API directa también: la columna está concedida y la política le deja la fila.
select results_eq(
  $$with changed as (
      update drills set board = null where id = current_setting('fx.d_pub')::uuid returning id
    ) select count(*)::int from changed$$,
  $$values (1)$$,
  'la dirección cambia la pizarra por la API directa'
);

-- 20-21. `save_drill` sigue sin tocarla.
select lives_ok(
  $$select public.save_drill(
      (select organization_id from drills where id = current_setting('fx.d_draft')::uuid),
      current_setting('fx.d_draft')::uuid,
      tests.token(current_setting('fx.d_draft')::uuid),
      jsonb_build_object(
        'title', 'Borrador retocado', 'min_players', 4, 'max_players', 10,
        'min_minutes', 10, 'max_minutes', 15, 'min_age', 10))$$,
  'la dirección guarda el ejercicio con save_drill'
);

select results_eq(
  $$select title, board from drills where id = current_setting('fx.d_draft')::uuid$$,
  $$values ('Borrador retocado', current_setting('fx.board')::jsonb)$$,
  'save_drill cambia el contenido y conserva la pizarra'
);

select * from finish();
rollback;
