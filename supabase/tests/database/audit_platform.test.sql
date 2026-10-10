-- Auditoría y soporte de plataforma (Fase 7, Task 4). Lo que se garantiza:
--   · invitar, aceptar, dar y revocar un consentimiento dejan su fila en `audit_log`, sin
--     ninguna columna de contenido (columnas exactas: quién, qué, sobre qué, cuándo);
--   · solo quien está en `platform_admins` lee `audit_log`; nadie, ni dirección de su club,
--     tiene ninguna política de insert/update sobre `platform_admins` ([D14]).
--
-- Se ejecuta con `pnpm test:db`. Transacción que se deshace al final; datos ficticios.
begin;

select plan(12);

do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  u_admin uuid := tests.create_user('admin@audit.pgtap.test');
  u_tutor uuid := tests.create_user('tutor@audit.pgtap.test');
  u_platform uuid := tests.create_user('platform@audit.pgtap.test');

  p_admin constant uuid := gen_random_uuid();
  p_tutor constant uuid := gen_random_uuid();
  p_child constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values (club_a, 'club-a', 'Club A');

  insert into organization_branding (
    organization_id, display_name, short_name, way_name,
    color_accent, color_accent_pressed, color_on_accent, color_accent_soft,
    terms_text, image_consent_text
  ) values (
    club_a, 'Club A', 'CLA', 'El camino', '#5aa9e6', '#4a90c8', '#0a0a0b', '#14283a',
    'Condiciones de Club A.', 'Imagen de Club A.'
  );

  insert into people (id, organization_id, first_name, last_name, birth_year) values
    (p_admin, club_a, 'Admin', 'Ficticia', null),
    (p_tutor, club_a, 'Tutor', 'Ficticio', null),
    (p_child, club_a, 'Hijo', 'Ficticio', 2016);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin, 'admin', p_admin),
    (club_a, u_tutor, 'coach', p_tutor);

  insert into guardianships (organization_id, guardian_person_id, child_person_id) values
    (club_a, p_tutor, p_child);

  insert into platform_admins (user_id) values (u_platform);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.admin', u_admin::text, true);
  perform set_config('fx.tutor', u_tutor::text, true);
  perform set_config('fx.platform', u_platform::text, true);
  perform set_config('fx.p_child', p_child::text, true);
end
$$;

-- ── Columnas exactas: quién, qué, sobre qué, cuándo. Nunca contenido. ────────────────
select columns_are(
  'public', 'audit_log',
  array['id', 'organization_id', 'actor_id', 'action', 'entity_table', 'entity_id', 'created_at'],
  'audit_log no guarda ninguna columna de contenido'
);

-- ── invite.create y invite.accept ────────────────────────────────────────────────────
-- Un equipo, para poder invitar a un coach de verdad.
do $$
declare
  season_a constant uuid := gen_random_uuid();
  cat_a constant uuid := gen_random_uuid();
  t1 constant uuid := gen_random_uuid();
begin
  insert into seasons (id, organization_id, name, starts_on, ends_on, is_current) values
    (season_a, current_setting('fx.club_a')::uuid, '2026/27', '2026-09-01', '2027-06-30', true);
  insert into categories (id, organization_id, name, age_band, sort) values
    (cat_a, current_setting('fx.club_a')::uuid, 'Alevín', 'U12', 10);
  insert into teams (id, organization_id, season_id, category_id, name) values
    (t1, current_setting('fx.club_a')::uuid, season_a, cat_a, 'T1');
  perform set_config('fx.t1', t1::text, true);
end
$$;

select tests.authenticate_as(current_setting('fx.admin')::uuid);
select lives_ok(
  $f$select create_invitation(
    current_setting('fx.club_a')::uuid, 'coach2@audit.pgtap.test', 'coach',
    'hash2', now() + interval '7 days',
    current_setting('fx.t1')::uuid, 'assistant', null, 'Coach', 'Nuevo'
  )$f$,
  'dirección invita a un coach nuevo, con equipo real'
);

reset role;
select results_eq(
  $$select action::text, entity_table::text from audit_log where action = 'invite.create'$$,
  $$values ('invite.create', 'invitations')$$,
  'invitar deja su fila, sobre la tabla de invitaciones'
);

select tests.authenticate_as(
  (select id from auth.users where email = 'coach2@audit.pgtap.test')
);
select lives_ok(
  $f$select accept_pending_invitations()$f$,
  'el coach invitado acepta al entrar'
);

reset role;
select results_eq(
  $$select action::text, entity_table::text from audit_log where action = 'invite.accept'$$,
  $$values ('invite.accept', 'invitations')$$,
  'aceptar deja su fila, sobre la tabla de invitaciones'
);

-- ── consent.grant_terms, consent.grant_image, consent.revoke_image ──────────────────
select tests.authenticate_as(current_setting('fx.tutor')::uuid);
select lives_ok(
  $f$select grant_terms_consent(current_setting('fx.club_a')::uuid)$f$,
  'el tutor acepta los términos'
);
select lives_ok(
  $f$select grant_image_consent(current_setting('fx.p_child')::uuid)$f$,
  'el tutor da el consentimiento de imagen de su hijo'
);

reset role;
select results_eq(
  $$select action::text, entity_table::text from audit_log where action = 'consent.grant_terms'$$,
  $$values ('consent.grant_terms', 'consents')$$,
  'dar los términos deja su fila'
);
select results_eq(
  $$select action::text, entity_table::text from audit_log where action = 'consent.grant_image'$$,
  $$values ('consent.grant_image', 'consents')$$,
  'dar el consentimiento de imagen deja su fila'
);

select tests.authenticate_as(current_setting('fx.admin')::uuid);
select lives_ok(
  $f$select revoke_image_consent(
    (select id from consents where kind = 'image' and person_id = current_setting('fx.p_child')::uuid)
  )$f$,
  'dirección revoca el consentimiento de imagen'
);

reset role;
select results_eq(
  $$select action::text, entity_table::text from audit_log where action = 'consent.revoke_image'$$,
  $$values ('consent.revoke_image', 'consents')$$,
  'revocar el consentimiento de imagen deja su fila'
);

-- ── platform_admins: sin escritura para authenticated ([D14]) ───────────────────────
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'platform_admins'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')),
  0,
  'platform_admins no tiene ninguna política de insert, update ni delete'
);

select * from finish();

rollback;
