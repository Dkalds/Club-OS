-- Consentimientos (Fase 7): términos generales y tutelas; imagen de menores, con su texto por
-- club y su propia copia por autor (sin versionado, [D9]).
--
-- Lo que se garantiza:
--   · `grant_terms_consent()` los da para quien llama, una vez por club (único parcial);
--     guarda la copia del texto de ese club en ese instante, sin tocarse si el texto cambia
--     después;
--   · `grant_image_consent(persona)` solo lo da quien tiene una `guardianship` activa sobre
--     esa persona, y queda a nombre de quien lo dio (`granted_by`), no de la persona;
--   · `revoke_image_consent` solo dirección, y no borra la fila ([D9]);
--   · las guardianships las lee dirección y el propio tutor; las escribe solo dirección.
--
-- Se ejecuta con `pnpm test:db`. Transacción que se deshace al final; datos ficticios.
begin;

select plan(24);

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A: adminA (dirección), tutor (coach, y tutor de child por guardianship). Club B: adminB.
do $$
declare
  club_a constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  club_b constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  u_admin_a uuid := tests.create_user('admin-a@consents.pgtap.test');
  u_tutor uuid := tests.create_user('tutor@consents.pgtap.test');
  u_otro uuid := tests.create_user('otro@consents.pgtap.test');
  u_admin_b uuid := tests.create_user('admin-b@consents.pgtap.test');

  p_admin_a constant uuid := gen_random_uuid();
  p_tutor constant uuid := gen_random_uuid();
  p_otro constant uuid := gen_random_uuid();
  p_child constant uuid := gen_random_uuid();
  p_child_b constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

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
    (p_tutor, club_a, 'Tutor', 'Ficticio', null),
    (p_otro, club_a, 'Otro', 'Ficticio', null),
    (p_child, club_a, 'Hijo', 'Ficticio', 2016),
    (p_child_b, club_b, 'Hijo', 'DeB', 2016);

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', p_admin_a),
    (club_a, u_tutor, 'coach', p_tutor),
    (club_a, u_otro, 'coach', p_otro),
    (club_b, u_admin_b, 'admin', null);

  insert into guardianships (organization_id, guardian_person_id, child_person_id) values
    (club_a, p_tutor, p_child);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.tutor', u_tutor::text, true);
  perform set_config('fx.otro', u_otro::text, true);
  perform set_config('fx.admin_b', u_admin_b::text, true);
  perform set_config('fx.p_child', p_child::text, true);
  perform set_config('fx.p_child_b', p_child_b::text, true);
end
$$;

-- ── guardianships ─────────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.tutor')::uuid);
select results_eq(
  $$select count(*)::int from guardianships$$, $$values (1)$$,
  'el tutor lee su propia tutela'
);

select tests.authenticate_as(current_setting('fx.otro')::uuid);
select results_eq(
  $$select count(*)::int from guardianships$$, $$values (0)$$,
  'otro coach, sin tutelas propias, no ve la del tutor'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select results_eq(
  $$select count(*)::int from guardianships$$, $$values (1)$$,
  'dirección ve las tutelas de su club'
);
select throws_ok(
  $$insert into guardianships (organization_id, guardian_person_id, child_person_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p_child')::uuid, gen_random_uuid())$$,
  '23503', null, 'una tutela no se puede dar sobre una persona que no existe'
);

select tests.authenticate_as(current_setting('fx.tutor')::uuid);
select throws_ok(
  $$insert into guardianships (organization_id, guardian_person_id, child_person_id)
    values (current_setting('fx.club_a')::uuid, current_setting('fx.p_child')::uuid, gen_random_uuid())$$,
  '42501', null, 'el tutor no da de alta tutelas: solo dirección'
);

-- ── grant_terms_consent ──────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.tutor')::uuid);
select lives_ok(
  format($f$select grant_terms_consent(current_setting('fx.club_a')::uuid)$f$),
  'el tutor acepta los términos de club A'
);

reset role;
select results_eq(
  $$select kind::text, body_snapshot, revoked_at is null
    from consents where organization_id = current_setting('fx.club_a')::uuid
      and granted_by = (select id from auth.users where email = 'tutor@consents.pgtap.test')
      and kind = 'terms'$$,
  $$values ('terms', 'Condiciones de Club A.', true)$$,
  'guarda una copia del texto vigente del club, y nace sin revocar'
);

select tests.authenticate_as(current_setting('fx.tutor')::uuid);
select throws_ok(
  format($f$select grant_terms_consent(current_setting('fx.club_a')::uuid)$f$),
  '23505', null, 'aceptar los términos dos veces en el mismo club choca'
);

reset role;
update organization_branding set terms_text = 'Condiciones NUEVAS de Club A.'
where organization_id = current_setting('fx.club_a')::uuid;

select is(
  (select body_snapshot from consents
    where granted_by = (select id from auth.users where email = 'tutor@consents.pgtap.test')
      and kind = 'terms'),
  'Condiciones de Club A.',
  'cambiar el texto del club no toca la copia ya dada (sin versionado, [D9])'
);

select tests.authenticate_as(current_setting('fx.otro')::uuid);
select lives_ok(
  format($f$select grant_terms_consent(current_setting('fx.club_a')::uuid)$f$),
  'otro coach acepta los suyos, sin chocar con los del tutor'
);

-- ── grant_image_consent ──────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.otro')::uuid);
select throws_ok(
  format($f$select grant_image_consent(current_setting('fx.p_child')::uuid)$f$),
  'P0001', 'CONSENT_GRANTOR', 'quien no es tutor de esa persona no puede darlo'
);

select tests.authenticate_as(current_setting('fx.tutor')::uuid);
select throws_ok(
  format($f$select grant_image_consent(current_setting('fx.p_child_b')::uuid)$f$),
  'P0001', 'CONSENT_GRANTOR', 'ni sobre una persona de otro club'
);
select lives_ok(
  format($f$select grant_image_consent(current_setting('fx.p_child')::uuid)$f$),
  'el tutor da el consentimiento de imagen de su hijo'
);

reset role;
select results_eq(
  $$select kind::text, person_id, granted_by, body_snapshot, revoked_at is null
    from consents where kind = 'image' and person_id = current_setting('fx.p_child')::uuid$$,
  $$values ('image', current_setting('fx.p_child')::uuid,
            (select id from auth.users where email = 'tutor@consents.pgtap.test'),
            'Imagen de Club A.', true)$$,
  'queda a nombre del tutor (granted_by), sobre el hijo (person_id), con su copia del texto'
);

-- ── Quién lo lee ─────────────────────────────────────────────────────────────────────
select tests.authenticate_as(current_setting('fx.tutor')::uuid);
select results_eq(
  $$select count(*)::int from consents where kind = 'image'$$, $$values (1)$$,
  'el tutor lee el consentimiento que dio'
);

select tests.authenticate_as(current_setting('fx.otro')::uuid);
select results_eq(
  $$select count(*)::int from consents where kind = 'image'$$, $$values (0)$$,
  'otro coach, que no lo dio, no lo ve'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select results_eq(
  $$select count(*)::int from consents where kind = 'image'$$, $$values (1)$$,
  'dirección sí lo ve: es quien lo revoca ([D9])'
);

select tests.authenticate_as(current_setting('fx.admin_b')::uuid);
select results_eq(
  $$select count(*)::int from consents$$, $$values (0)$$,
  'dirección de otro club no ve nada'
);

-- ── revoke_image_consent ([D9]: solo dirección) ─────────────────────────────────────
select tests.authenticate_as(current_setting('fx.tutor')::uuid);
select throws_ok(
  format(
    $f$select revoke_image_consent(
      (select id from consents where kind = 'image' and person_id = current_setting('fx.p_child')::uuid)
    )$f$
  ),
  'P0002', 'NOT_FOUND', 'el propio tutor no revoca: en el MVP, solo dirección'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select lives_ok(
  format(
    $f$select revoke_image_consent(
      (select id from consents where kind = 'image' and person_id = current_setting('fx.p_child')::uuid)
    )$f$
  ),
  'dirección revoca el consentimiento de imagen'
);

reset role;
select results_eq(
  $$select revoked_at is not null from consents
    where kind = 'image' and person_id = current_setting('fx.p_child')::uuid$$,
  $$values (true)$$,
  'la fila sigue existiendo, solo marcada: no se borra ([D9])'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);
select throws_ok(
  format(
    $f$select revoke_image_consent(
      (select id from consents where kind = 'image' and person_id = current_setting('fx.p_child')::uuid)
    )$f$
  ),
  'P0002', 'NOT_FOUND', 'revocar uno ya revocado no encuentra nada que revocar'
);

-- ── anon ─────────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select throws_ok('select 1 from consents', '42501', null, 'anon no lee consentimientos');
select throws_ok('select 1 from guardianships', '42501', null, 'anon no lee tutelas');

select * from finish();

rollback;
