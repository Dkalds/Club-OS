-- save_practice_items: los ids de los ítems son estables entre guardados.
--
-- La función cambia su firma: devuelve jsonb con `updated_at` y `item_ids` (en el orden de
-- `p_items`), y acepta `p_save_id uuid default null` (Task 2; aquí ignorado). Este test
-- comprueba:
--   · el guardado devuelve los ids reales en el orden enviado;
--   · guardar de nuevo con los ids conserva el estado en pista (`completed`, `actual_minutes`);
--   · los errores de la Fase 4 siguen funcionando con la firma nueva.
begin;

select plan(22);

-- ── Ayudas ───────────────────────────────────────────────────────────────────────────

create function tests.token_spi(p uuid)
returns timestamptz
language sql security definer set search_path = ''
as $$
  select pp.updated_at from public.practice_plans as pp where pp.id = token_spi.p;
$$;

create function tests.item_ids_of(p uuid)
returns uuid[]
language sql security definer set search_path = ''
as $$
  select array_agg(pi.id order by pi.sort)
  from public.practice_items as pi
  where pi.plan_id = item_ids_of.p;
$$;

-- ── Fixtures ─────────────────────────────────────────────────────────────────────────
-- Club A, un equipo T1 con c1 (entrenador), y un entreno programado e1.

do $$
declare
  club_a constant uuid := 'aabbccdd-0000-4000-8000-aabbccdd0001';
  u_c1 uuid := tests.create_user('c1@save-ids.pgtap.test');
  t1 constant uuid := gen_random_uuid();
  season_a constant uuid := gen_random_uuid();
  cat_a constant uuid := gen_random_uuid();
  e1 constant uuid := gen_random_uuid();
  p1 constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name)
    values (club_a, 'save-ids-a', 'Save IDs A');

  insert into people (id, organization_id, first_name, last_name, birth_year)
    values (p1, club_a, 'Coach', 'Uno', null);

  insert into memberships (organization_id, user_id, role, person_id)
    values (club_a, u_c1, 'coach', p1);

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current)
    values (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true);

  insert into categories (id, organization_id, name, age_band, sort)
    values (cat_a, club_a, 'Alevín', 'U12', 10);

  insert into teams (id, organization_id, season_id, category_id, name)
    values (t1, club_a, season_a, cat_a, 'Alevín A');

  insert into team_staff (organization_id, team_id, person_id, staff_role)
    values (club_a, t1, p1, 'head_coach');

  insert into events (id, organization_id, team_id, kind, starts_at, ends_at, status)
    values (e1, club_a, t1, 'practice', '2026-12-01T16:00:00Z', '2026-12-01T17:15:00Z', 'scheduled');

  insert into practice_plans (organization_id, team_id, event_id, title, status, created_by)
    values (club_a, t1, e1, 'Sesión IDs', 'draft', u_c1);

  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.e1', e1::text, true);
  perform set_config('fx.plan', (
    select id::text from practice_plans where event_id = e1
  ), true);
end
$$;

-- ── Tests ─────────────────────────────────────────────────────────────────────────────

select tests.authenticate_as(current_setting('fx.c1')::uuid);

-- 1. Guardar dos ítems nuevos devuelve sus ids reales, en el orden enviado.
select lives_ok(
  $$select set_config('fx.save1',
      public.save_practice_items(
        current_setting('fx.plan')::uuid,
        current_setting('fx.u0')::timestamptz,
        '[{"title":"A","minutes":10},{"title":"B","minutes":15}]'::jsonb
      )::text, true)$$,
  'primer guardado: dos ítems nuevos'
) from (
  select set_config('fx.u0', tests.token_spi(current_setting('fx.plan')::uuid)::text, true)
) as _init;

-- El resultado lleva `updated_at` y `item_ids` con dos uuids.
select ok(
  (current_setting('fx.save1')::jsonb ->> 'updated_at') is not null,
  'save1: el resultado lleva updated_at'
);

select ok(
  jsonb_array_length(current_setting('fx.save1')::jsonb -> 'item_ids') = 2,
  'save1: item_ids tiene dos entradas'
);

-- Los ids devueltos coinciden con las filas reales (en orden).
select ok(
  (current_setting('fx.save1')::jsonb -> 'item_ids') =
  to_jsonb(tests.item_ids_of(current_setting('fx.plan')::uuid)),
  'save1: item_ids coincide con los ids de las filas reales en orden'
);

-- 2. Guardar de nuevo con los ids: reordenamos [B, A] y añadimos C.
--    Antes ponemos completed/actual_minutes a mano como el rol de servicio haría en un Live.
do $$
declare
  ids jsonb := current_setting('fx.save1')::jsonb -> 'item_ids';
  id_a uuid := (ids ->> 0)::uuid;
  id_b uuid := (ids ->> 1)::uuid;
begin
  -- Simula lo que record_live_progress haría: marcar A como completada.
  update public.practice_items
  set completed = true, actual_minutes = 9
  where id = id_a;

  perform set_config('fx.id_a', id_a::text, true);
  perform set_config('fx.id_b', id_b::text, true);
end
$$;

select lives_ok(
  $$select set_config('fx.save2',
      public.save_practice_items(
        current_setting('fx.plan')::uuid,
        (current_setting('fx.save1')::jsonb ->> 'updated_at')::timestamptz,
        jsonb_build_array(
          jsonb_build_object('id', current_setting('fx.id_b'), 'title', 'B', 'minutes', 15),
          jsonb_build_object('id', current_setting('fx.id_a'), 'title', 'A cambiada', 'minutes', 10),
          jsonb_build_object('title', 'C', 'minutes', 20)
        )
      )::text, true)$$,
  'segundo guardado: [B(id), A(id) con cambio, C nuevo]'
);

select ok(
  jsonb_array_length(current_setting('fx.save2')::jsonb -> 'item_ids') = 3,
  'save2: item_ids tiene tres entradas'
);

-- B conserva su id en la posición 1, A en la 2.
select ok(
  (current_setting('fx.save2')::jsonb -> 'item_ids' ->> 0)::uuid = current_setting('fx.id_b')::uuid,
  'save2: B conserva su id en la posición 1'
);

select ok(
  (current_setting('fx.save2')::jsonb -> 'item_ids' ->> 1)::uuid = current_setting('fx.id_a')::uuid,
  'save2: A conserva su id en la posición 2'
);

-- A conserva su completed y actual_minutes (lo que pasó en la pista no se pierde).
select ok(
  exists (
    select 1 from public.practice_items
    where id = current_setting('fx.id_a')::uuid
      and completed = true
      and actual_minutes = 9
      and title_override = 'A cambiada'
  ),
  'save2: A conserva completed/actual_minutes y recibe el título nuevo'
);

-- 3. Lista vacía devuelve item_ids vacío.
select lives_ok(
  $$select set_config('fx.save3',
      public.save_practice_items(
        current_setting('fx.plan')::uuid,
        (current_setting('fx.save2')::jsonb ->> 'updated_at')::timestamptz,
        '[]'::jsonb
      )::text, true)$$,
  'tercer guardado: lista vacía'
);

select ok(
  jsonb_array_length(current_setting('fx.save3')::jsonb -> 'item_ids') = 0,
  'save3: item_ids está vacío con lista vacía'
);

-- 4. updated_at del resultado coincide con el del plan (mismo texto que PostgREST daría).
select ok(
  (current_setting('fx.save3')::jsonb ->> 'updated_at')::timestamptz =
    tests.token_spi(current_setting('fx.plan')::uuid),
  'save3: updated_at del resultado coincide con el del plan'
);

-- 5. p_save_id null (el parámetro de la Task 2 ya existe pero se ignora aquí): STALE_COPY
--    con copia incorrecta.
select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan')::uuid,
      '2000-01-01T00:00:00Z'::timestamptz,
      '[]'::jsonb,
      null::uuid
    )$$,
  'P0001', 'STALE_COPY',
  'save_practice_items acepta p_save_id null y sigue dando STALE_COPY con copia incorrecta'
);

-- 6. NOT_FOUND: alguien que no gestiona el equipo (anon).
select tests.authenticate_as_anon();

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan')::uuid,
      '2000-01-01T00:00:00Z'::timestamptz,
      '[]'::jsonb
    )$$,
  '42501', null,
  'anon no puede llamar a save_practice_items'
);

-- 7. SESSION_CLOSED: sesión no scheduled.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

do $$
begin
  -- Cerramos la sesión directamente como postgres (sin RLS).
  update public.events
  set status = 'done'
  where id = current_setting('fx.e1')::uuid;
end
$$;

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan')::uuid,
      tests.token_spi(current_setting('fx.plan')::uuid),
      '[]'::jsonb
    )$$,
  'P0001', 'SESSION_CLOSED',
  'SESSION_CLOSED: la sesión ya está cerrada'
);

-- 8. INVALID: p_items no es una lista.
do $$
begin
  -- Reabrimos para poder llamar a la función.
  update public.events
  set status = 'scheduled'
  where id = current_setting('fx.e1')::uuid;
end
$$;

select throws_ok(
  $$select public.save_practice_items(
      current_setting('fx.plan')::uuid,
      tests.token_spi(current_setting('fx.plan')::uuid),
      '{"title":"x"}'::jsonb
    )$$,
  '22023', 'INVALID',
  'INVALID: p_items no es un array'
);

select * from finish();
rollback;
