-- Invitaciones (Fase 7): quién invita, cómo se crea la cuenta y cómo se acepta.
--
-- Lo que se garantiza:
--   · solo dirección invita, con rol y, si es coach, equipo y staff_role (CHECK);
--   · la cuenta de Auth se crea al invitar, no al aceptar (`create_invitation`, security
--     definer): un email que ya tenía cuenta (de otra invitación) no se duplica;
--   · como mucho una invitación pendiente por email y por club (único parcial, [D3]);
--   · `accept_pending_invitations()` acepta, con la sesión de quien entra, solo lo suyo
--     (identificado por `auth.uid()` vía `auth.users`, nunca por un dato que mande el
--     cliente): crea la persona si hace falta, la membresía y, si es coach, team_staff;
--     es idempotente y nunca toca lo de otro email;
--   · `before_user_created` deja pasar solo un email con invitación pendiente y vigente.
--
-- Se ejecuta con `pnpm test:db`. Transacción que se deshace al final; datos ficticios.
begin;

select plan(34);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A: adminA (dirección), c1 (coach de T1). T1 y T2, dos equipos. Club B: adminB.
-- p_existing es una persona de T1 sin cuenta todavía (para [D2]).
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@invitations.pgtap.test');
  u_c1 uuid := tests.create_user('c1@invitations.pgtap.test');
  u_admin_b uuid := tests.create_user('admin-b@invitations.pgtap.test');

  p_admin_a constant uuid := gen_random_uuid();
  p_c1 constant uuid := gen_random_uuid();
  p_admin_b constant uuid := gen_random_uuid();
  p_existing constant uuid := gen_random_uuid();

  season_a constant uuid := gen_random_uuid();
  season_b constant uuid := gen_random_uuid();
  cat_a constant uuid := gen_random_uuid();
  cat_b constant uuid := gen_random_uuid();
  t1 constant uuid := gen_random_uuid();
  t2 constant uuid := gen_random_uuid();
  tb constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_admin_a, club_a, 'adminA', 'Ficticia', null),
    (p_c1, club_a, 'c1', 'Ficticia', null),
    (p_admin_b, club_b, 'adminB', 'Ficticio', null),
    (p_existing, club_a, 'Existente', 'Ficticia', null);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', p_admin_a),
    (club_a, u_c1, 'coach', p_c1),
    (club_b, u_admin_b, 'admin', p_admin_b);

  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, club_a, '2026/27', '2026-09-01', '2027-06-30', true),
    (season_b, club_b, '2026/27', '2026-09-01', '2027-06-30', true);

  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_a, club_a, 'Alevín', 'U12', 10),
    (cat_b, club_b, 'Infantil', 'U14', 10);

  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, club_a, season_a, cat_a, 'T1'),
    (t2, club_a, season_a, cat_a, 'T2'),
    (tb, club_b, season_b, cat_b, 'TB');

  insert into team_players (organization_id, team_id, person_id, jersey_number) values
    (club_a, t1, p_existing, 7);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.admin_b', u_admin_b::text, true);
  perform set_config('fx.p_existing', p_existing::text, true);
  perform set_config('fx.t1', t1::text, true);
  perform set_config('fx.t2', t2::text, true);
  perform set_config('fx.tb', tb::text, true);
end
$$;

-- Llamada a create_invitation con valores por defecto razonables.
create function pg_temp.invite_sql(
  org text, email text, role text, extra text default ''
) returns text
language sql
as $$
  select format(
    $f$select create_invitation(current_setting('fx.%s')::uuid, %L, %L::public.org_role,
                                 'hash-' || substr(md5(random()::text), 1, 12),
                                 now() + interval '7 days'%s)$f$,
    org, email, role, extra
  );
$$;

-- ── create_invitation ────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select lives_ok(
  pg_temp.invite_sql('club_a', 'nuevo-admin@invitations.pgtap.test', 'admin'),
  'adminA invita a otro admin, sin equipo ni persona'
);
select lives_ok(
  pg_temp.invite_sql(
    'club_a', 'nuevo-coach@invitations.pgtap.test', 'coach',
    format(
      $f$, p_team => current_setting('fx.t1')::uuid, p_staff_role => 'assistant'::public.staff_role,
          p_first_name => 'Nueva', p_last_name => 'Ficticia'$f$
    )
  ),
  'adminA invita a un coach nuevo, con equipo, rol y nombre'
);
select lives_ok(
  pg_temp.invite_sql(
    'club_a', 'existente@invitations.pgtap.test', 'coach',
    format(
      $f$, p_team => current_setting('fx.t1')::uuid, p_staff_role => 'head_coach'::public.staff_role,
          p_person => current_setting('fx.p_existing')::uuid$f$
    )
  ),
  'adminA invita a una persona que ya existe, por su id ([D2])'
);

select throws_ok(
  pg_temp.invite_sql('club_a', 'sin-equipo@invitations.pgtap.test', 'coach'),
  '23514', null, 'un coach sin equipo ni staff_role no pasa el CHECK'
);
select throws_ok(
  pg_temp.invite_sql(
    'club_a', 'admin-con-equipo@invitations.pgtap.test', 'admin',
    format($f$, p_team => current_setting('fx.t1')::uuid$f$)
  ),
  '23514', null, 'un admin con equipo no pasa el CHECK'
);
select throws_ok(
  pg_temp.invite_sql(
    'club_a', 'sin-nombre@invitations.pgtap.test', 'coach',
    format(
      $f$, p_team => current_setting('fx.t1')::uuid, p_staff_role => 'assistant'::public.staff_role$f$
    )
  ),
  '23514', null, 'un coach nuevo sin persona ni nombre no pasa el CHECK ([D2])'
);
select throws_ok(
  pg_temp.invite_sql(
    'club_a', 'equipo-ajeno@invitations.pgtap.test', 'coach',
    format(
      $f$, p_team => current_setting('fx.tb')::uuid, p_staff_role => 'assistant'::public.staff_role,
          p_first_name => 'X', p_last_name => 'Y'$f$
    )
  ),
  'P0002', 'NOT_FOUND', 'un equipo de otro club: NOT_FOUND'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);
select throws_ok(
  pg_temp.invite_sql('club_a', 'de-c1@invitations.pgtap.test', 'admin'),
  'P0002', 'NOT_FOUND', 'c1 (coach, no dirección) no invita'
);

select tests.authenticate_as(current_setting('fx.admin_b')::uuid);
select throws_ok(
  pg_temp.invite_sql('club_a', 'de-adminB@invitations.pgtap.test', 'admin'),
  'P0002', 'NOT_FOUND', 'adminB no invita en club A'
);

-- ── Una cuenta por email, nunca duplicada ───────────────────────────────────────────
reset role;
select is(
  (select count(*)::int from auth.users where email = 'existente@invitations.pgtap.test'),
  1, 'invitar a una persona existente crea su cuenta de Auth, una sola'
);
select is(
  (select count(*)::int from auth.users
    where email in ('nuevo-admin@invitations.pgtap.test', 'nuevo-coach@invitations.pgtap.test')),
  2, 'cada email nuevo tiene su propia cuenta'
);

-- ── Como mucho una pendiente por email y por club ([D3]) ────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select throws_ok(
  pg_temp.invite_sql('club_a', 'nuevo-admin@invitations.pgtap.test', 'admin'),
  '23505', null, 'dos invitaciones pendientes al mismo email en el mismo club chocan'
);

reset role;
update invitations set cancelled_at = now()
where email = 'nuevo-admin@invitations.pgtap.test' and organization_id = current_setting('fx.club_a')::uuid;

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select lives_ok(
  pg_temp.invite_sql('club_a', 'nuevo-admin@invitations.pgtap.test', 'admin'),
  'cancelada la primera, una nueva al mismo email sí entra'
);

-- ── accept_pending_invitations ───────────────────────────────────────────────────────
reset role;
select tests.authenticate_as(
  (select id from auth.users where email = 'nuevo-coach@invitations.pgtap.test')
);
select results_eq(
  $$select accept_pending_invitations()$$,
  $$values (array['club-a']::text[])$$,
  'nuevo-coach acepta su invitación pendiente de club A'
);

reset role;
select is(
  (select count(*)::int from memberships as m
    join people as p on p.id = m.person_id
    where m.organization_id = current_setting('fx.club_a')::uuid
      and p.first_name = 'Nueva' and p.last_name = 'Ficticia'),
  1, 'se creó su persona, con el nombre de la invitación, y su membresía'
);
select is(
  (select count(*)::int from team_staff as ts
    join people as p on p.id = ts.person_id
    where ts.team_id = current_setting('fx.t1')::uuid
      and ts.staff_role = 'assistant' and p.first_name = 'Nueva'),
  1, 'y quedó en team_staff de T1, como ayudante'
);

reset role;
select tests.authenticate_as(
  (select id from auth.users where email = 'nuevo-coach@invitations.pgtap.test')
);
select results_eq(
  $$select accept_pending_invitations()$$,
  $$values (array[]::text[])$$,
  'aceptar dos veces es idempotente: la segunda no encuentra nada pendiente'
);

reset role;
select tests.authenticate_as(
  (select id from auth.users where email = 'existente@invitations.pgtap.test')
);
select results_eq(
  $$select accept_pending_invitations()$$,
  $$values (array['club-a']::text[])$$,
  'existente acepta y usa la persona que ya tenía (p_existing), no crea otra'
);

reset role;
select is(
  (select count(*)::int from people where first_name = 'Existente' and last_name = 'Ficticia'),
  1, 'invitar por person_id no duplica la persona'
);
select is(
  (select count(*)::int from team_staff
    where team_id = current_setting('fx.t1')::uuid
      and person_id = current_setting('fx.p_existing')::uuid
      and staff_role = 'head_coach'),
  1, 'y queda como head_coach de T1'
);

reset role;
select tests.authenticate_as(
  (select id from auth.users where email = 'nuevo-admin@invitations.pgtap.test')
);
select results_eq(
  $$select accept_pending_invitations()$$,
  $$values (array['club-a']::text[])$$,
  'nuevo-admin acepta su invitación de admin, sin equipo'
);

reset role;
select is(
  (select count(*)::int from team_staff as ts
    join memberships as m on m.person_id = ts.person_id
    join auth.users as u on u.id = m.user_id
    where u.email = 'nuevo-admin@invitations.pgtap.test'),
  0, 'un admin invitado no entra en ningún team_staff'
);

select tests.authenticate_as(current_setting('fx.admin_b')::uuid);
select results_eq(
  $$select accept_pending_invitations()$$,
  $$values (array[]::text[])$$,
  'adminB (sin ninguna invitación pendiente a su nombre) no acepta nada'
);

-- ── before_user_created ──────────────────────────────────────────────────────────────
-- Una invitación propia para esta sección: las de arriba ya están aceptadas o canceladas.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select lives_ok(
  pg_temp.invite_sql('club_a', 'para-el-hook@invitations.pgtap.test', 'admin'),
  'una invitación nueva, pendiente, para probar antes de aceptar nada'
);

reset role;
select ok(
  (private.before_user_created(
    jsonb_build_object('user', jsonb_build_object('email', 'nadie-invitado@invitations.pgtap.test'))
  ) ? 'error'),
  'sin invitación pendiente: el hook devuelve un error'
);
select is(
  private.before_user_created(
    jsonb_build_object('user', jsonb_build_object('email', 'PARA-EL-HOOK@invitations.pgtap.test'))
  ),
  '{}'::jsonb,
  'con una pendiente y vigente (sin mirar mayúsculas): deja pasar'
);

update invitations set cancelled_at = now() where email = 'para-el-hook@invitations.pgtap.test';
select ok(
  (private.before_user_created(
    jsonb_build_object('user', jsonb_build_object('email', 'para-el-hook@invitations.pgtap.test'))
  ) ? 'error'),
  'cancelada: ya no deja pasar'
);

update invitations set cancelled_at = null, expires_at = now() - interval '1 minute'
where email = 'para-el-hook@invitations.pgtap.test';
select ok(
  (private.before_user_created(
    jsonb_build_object('user', jsonb_build_object('email', 'para-el-hook@invitations.pgtap.test'))
  ) ? 'error'),
  'caducada: tampoco'
);

-- ── cancelar y reenviar, bajo RLS (sin función) ──────────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select lives_ok(
  pg_temp.invite_sql(
    'club_a', 'para-cancelar@invitations.pgtap.test', 'admin'
  ),
  'una invitación más, para probar cancelar y reenviar'
);
select lives_ok(
  $$update invitations set cancelled_at = now()
    where email = 'para-cancelar@invitations.pgtap.test'
      and organization_id = current_setting('fx.club_a')::uuid$$,
  'adminA cancela una invitación pendiente de su club'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);
select lives_ok(
  $$update invitations set cancelled_at = now() where email = 'existente@invitations.pgtap.test'$$,
  'c1 lanza un cambio sobre invitaciones que no gestiona'
);
reset role;
select is(
  (select cancelled_at is null from invitations
    where person_id = current_setting('fx.p_existing')::uuid),
  true, 'c1 no canceló nada: su update no tocó ninguna fila'
);

-- ── anon ─────────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select throws_ok('select 1 from invitations', '42501', null, 'anon no lee invitaciones');
select throws_ok(
  pg_temp.invite_sql('club_a', 'de-anon@invitations.pgtap.test', 'admin'),
  '42501', null, 'anon no crea invitaciones (ni ejecuta create_invitation)'
);

select * from finish();

rollback;
