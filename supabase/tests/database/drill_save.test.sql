-- Biblioteca de ejercicios: guardado atómico (`public.save_drill`) y las dos reglas de la tabla
-- `drills` que llegan con él.
--
-- `save_drill` crea un borrador o guarda un ejercicio con todos sus hijos (puntos de coaching,
-- variantes, objetivos, principios y Standards) en una sola transacción, con concurrencia
-- optimista: el guardado solo vale si `updated_at` sigue siendo el que leyó quien guarda. Es
-- `security invoker`: los permisos los decide RLS, y la función no los repite. Este test
-- comprueba:
--   · el contrato: crear, reemplazar hijos en orden, copia obsoleta, límites del payload y
--     atomicidad (un error deja lo anterior como estaba);
--   · el aislamiento: por autor (un entrenador solo guarda sus borradores), por club (`p_org`
--     acota, no autoriza) y por estado (publicar y archivar no se cuelan en el payload);
--   · el diagrama: vive en la carpeta del propio ejercicio, lo exige la tabla y no solo la
--     función, y lo exige después de RLS y sin delatar fichas de otros clubes;
--   · las columnas que un cliente no reescribe (club, autor, fechas): privilegio por columnas.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove). Los helpers `tests.*`
-- vienen de `supabase/seed.sql`. Todo ocurre dentro de una transacción que se deshace al
-- final. Los datos son ficticios y solo de este test; los emails y los ids de club no chocan
-- con los de `pnpm seed` ni con los de los otros tests.
begin;

select plan(109);

-- ── Ayudas (solo existen en esta transacción) ────────────────────────────────────────
-- Un payload válido y completo en lo obligatorio, sin listas. Cada prueba le mezcla lo suyo:
-- una clave de `extra` pisa la base, y `null` en `extra` vacía la columna.
create function tests.payload(extra jsonb default '{}'::jsonb)
returns jsonb
language sql
set search_path = ''
as $$
  select jsonb_build_object(
    'title', 'Rueda de pases',
    'summary', 'Pases rápidos en círculo.',
    'objective', 'Pasar y cortar sin perder el balón.',
    'setup_md', 'Cinco jugadores por rueda.',
    'min_players', 4,
    'max_players', 10,
    'min_minutes', 10,
    'max_minutes', 15,
    'min_age', 10,
    'max_age', 14,
    'equipment', jsonb_build_array('balones', 'conos'),
    'video_url', 'https://youtu.be/abc123'
  ) || payload.extra;
$$;

-- El `updated_at` real de un ejercicio, lo vea o no quien llama. Las pruebas de permiso lo
-- usan como copia esperada: si la función dejara pasar a quien no debe, el guardado valdría y
-- el test lo vería; con una copia errónea, un `STALE_COPY` tapado como error esperado lo
-- escondería.
create function tests.token(d uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  select dr.updated_at from public.drills as dr where dr.id = token.d;
$$;

-- Cuántos hijos de cada clase ve quien llama en un ejercicio, como «puntos/variantes/
-- objetivos/principios/standards».
create function tests.counts(d uuid)
returns text
language sql
set search_path = ''
as $$
  select (select count(*) from public.drill_coaching_points where drill_id = counts.d)
         || '/' || (select count(*) from public.drill_variants where drill_id = counts.d)
         || '/' || (select count(*) from public.drill_focus_areas where drill_id = counts.d)
         || '/' || (select count(*) from public.drill_principles where drill_id = counts.d)
         || '/' || (select count(*) from public.drill_standards where drill_id = counts.d);
$$;

-- Ejecuta una sentencia como quien llama y devuelve cómo acabó: su SQLSTATE si falla, o «ok N»
-- con las filas que tocó. Sirve para comparar de un golpe lo que contesta la base a varias
-- peticiones que solo se diferencian en un valor.
create function tests.outcome(code text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_rows bigint;
begin
  execute outcome.code;
  get diagnostics v_rows = row_count;
  return 'ok ' || v_rows;
exception when others then
  return sqlstate;
end;
$$;

-- Tres ids de ficha que un intruso podría probar: una de otro club, una de este club pero de la
-- carpeta de otro ejercicio y una que no existe.
create function tests.probe_media()
returns setof uuid
language sql
set search_path = ''
as $$
  select current_setting('fx.m_b')::uuid
  union all select current_setting('fx.m_pub')::uuid
  union all select gen_random_uuid();
$$;

-- Una ruta de Storage de la carpeta de un ejercicio, con un nombre de fichero nuevo.
create function tests.folder_path(org uuid, drill uuid)
returns text
language sql
set search_path = ''
as $$
  select 'org/' || folder_path.org || '/drills/' || folder_path.drill || '/'
         || gen_random_uuid()::text || '.png';
$$;

-- ── Fixtures (como postgres) ─────────────────────────────────────────────────────────
-- Club A
--   adminA es admin; c1 y c2 son entrenadores; jugA es un jugador (rol player). `multi` es
--   entrenador de A y admin de B: en B puede lo que un admin, y en A solo lo de un
--   entrenador que no es autor de nada.
--   Ejercicios: `d_pub` (publicado, adminA; con un punto, un objetivo y un Standard) y `d_c1`
--   (borrador de c1, sin hijos). `d_pre` es el id de un ejercicio que todavía no existe.
--   Objetivos fA1 y fA2, principio gA1, Standard sA1.
--   Medios: `m_c1_ok` (en la carpeta de d_c1, de c1), `m_pub` (en la de d_pub, de adminA: el
--   medio de otro, sin ejercicio) y `m_pre` (en la de d_pre, de c1).
-- Club B
--   coachB es coach. `d_b` (publicado, coachB; con un punto). Objetivo fB, principio gB,
--   Standard sB y el medio `m_b` (en la carpeta de d_b, de multi).
-- `out` tiene cuenta pero no es miembro de ningún club.
--
-- Los ids quedan en ajustes `fx.*` de la transacción. Los fixtures se insertan sin sesión
-- (`auth.uid()` es null), así que el autor va siempre explícito.
do $$
declare
  club_a constant uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  club_b constant uuid := 'ffffffff-ffff-4fff-8fff-ffffffffffff';

  u_admin_a uuid := tests.create_user('admin-a@drillsave.pgtap.test');
  u_c1 uuid := tests.create_user('c1@drillsave.pgtap.test');
  u_c2 uuid := tests.create_user('c2@drillsave.pgtap.test');
  u_jug_a uuid := tests.create_user('jug-a@drillsave.pgtap.test');
  u_coach_b uuid := tests.create_user('coach-b@drillsave.pgtap.test');
  u_multi uuid := tests.create_user('multi@drillsave.pgtap.test');
  u_out uuid := tests.create_user('out@drillsave.pgtap.test');

  f_a1 constant uuid := gen_random_uuid();
  f_a2 constant uuid := gen_random_uuid();
  f_b constant uuid := gen_random_uuid();
  g_a1 constant uuid := gen_random_uuid();
  g_b constant uuid := gen_random_uuid();
  s_a1 constant uuid := gen_random_uuid();
  s_b constant uuid := gen_random_uuid();

  d_pub constant uuid := gen_random_uuid();
  d_c1 constant uuid := gen_random_uuid();
  d_b constant uuid := gen_random_uuid();
  d_pre constant uuid := gen_random_uuid();

  m_c1_ok constant uuid := gen_random_uuid();
  m_pub constant uuid := gen_random_uuid();
  m_b constant uuid := gen_random_uuid();
  m_pre constant uuid := gen_random_uuid();
begin
  insert into organizations (id, slug, name) values
    (club_a, 'club-a', 'Club A'),
    (club_b, 'club-b', 'Club B');

  insert into memberships (organization_id, user_id, role, person_id) values
    (club_a, u_admin_a, 'admin', null),
    (club_a, u_c1, 'coach', null),
    (club_a, u_c2, 'coach', null),
    (club_a, u_jug_a, 'player', null),
    (club_b, u_coach_b, 'coach', null),
    (club_a, u_multi, 'coach', null),
    (club_b, u_multi, 'admin', null);

  insert into focus_areas (id, organization_id, slug, name, sort) values
    (f_a1, club_a, 'rebote', 'Rebote', 10),
    (f_a2, club_a, 'equilibrio', 'Equilibrio', 20),
    (f_b, club_b, 'rebote', 'Rebote B', 10);

  insert into game_principles (id, organization_id, slug, title, status) values
    (g_a1, club_a, 'principio-a', 'Principio de A', 'published'),
    (g_b, club_b, 'principio-b', 'Principio de B', 'published');

  insert into standards (id, organization_id, number, title, description, status) values
    (s_a1, club_a, 1, 'Standard 1 de A', 'Descripción del Standard 1 de A.', 'published'),
    (s_b, club_b, 1, 'Standard 1 de B', 'Descripción del Standard 1 de B.', 'published');

  insert into drills (
    id, organization_id, title, summary, min_players, max_players, min_minutes, max_minutes,
    min_age, max_age, status, created_by
  ) values
    (d_pub, club_a, 'Pase y corte', 'Transición rápida tras el rebote.', 4, 10, 10, 15, 10, 14,
     'published', u_admin_a),
    (d_c1, club_a, 'Borrador de c1', null, 4, 8, 10, 15, 10, null, 'draft', u_c1),
    (d_b, club_b, 'Ejercicio de B', null, 4, 8, 10, 15, 10, null, 'published', u_coach_b);

  insert into drill_coaching_points (organization_id, drill_id, text, is_key, sort) values
    (club_a, d_pub, 'Mira antes de pasar', true, 0),
    (club_b, d_b, 'Punto de B', false, 0);

  insert into drill_focus_areas (organization_id, drill_id, focus_area_id) values
    (club_a, d_pub, f_a1);

  insert into drill_standards (organization_id, drill_id, standard_id) values
    (club_a, d_pub, s_a1);

  insert into media_assets (id, organization_id, path, kind, mime, bytes, created_by) values
    (m_c1_ok, club_a, tests.folder_path(club_a, d_c1), 'image', 'image/png', 1000, u_c1),
    (m_pub, club_a, tests.folder_path(club_a, d_pub), 'image', 'image/png', 1000, u_admin_a),
    (m_b, club_b, tests.folder_path(club_b, d_b), 'image', 'image/png', 1000, u_multi),
    (m_pre, club_a, tests.folder_path(club_a, d_pre), 'image', 'image/png', 1000, u_c1);

  perform set_config('fx.club_a', club_a::text, true);
  perform set_config('fx.club_b', club_b::text, true);
  perform set_config('fx.admin_a', u_admin_a::text, true);
  perform set_config('fx.c1', u_c1::text, true);
  perform set_config('fx.c2', u_c2::text, true);
  perform set_config('fx.jug_a', u_jug_a::text, true);
  perform set_config('fx.coach_b', u_coach_b::text, true);
  perform set_config('fx.multi', u_multi::text, true);
  perform set_config('fx.out', u_out::text, true);
  perform set_config('fx.f_a1', f_a1::text, true);
  perform set_config('fx.f_a2', f_a2::text, true);
  perform set_config('fx.f_b', f_b::text, true);
  perform set_config('fx.g_a1', g_a1::text, true);
  perform set_config('fx.g_b', g_b::text, true);
  perform set_config('fx.s_a1', s_a1::text, true);
  perform set_config('fx.s_b', s_b::text, true);
  perform set_config('fx.d_pub', d_pub::text, true);
  perform set_config('fx.d_c1', d_c1::text, true);
  perform set_config('fx.d_b', d_b::text, true);
  perform set_config('fx.d_pre', d_pre::text, true);
  perform set_config('fx.m_c1_ok', m_c1_ok::text, true);
  perform set_config('fx.m_pub', m_pub::text, true);
  perform set_config('fx.m_b', m_b::text, true);
  perform set_config('fx.m_pre', m_pre::text, true);
end
$$;

-- ── c1 crea un borrador ──────────────────────────────────────────────────────────────
-- El payload trae a propósito un `status`, un `created_by` y un diagrama: al crear no cuentan.
-- Los ids y el `updated_at` devuelto se guardan en ajustes para encadenar los guardados.
select tests.authenticate_as(current_setting('fx.c1')::uuid);

select lives_ok(
  $$select set_config('fx.d_new', s.id::text, true),
           set_config('fx.u_new', s.updated_at::text, true)
    from public.save_drill(
      current_setting('fx.club_a')::uuid, null, null,
      tests.payload(jsonb_build_object(
        'focus_area_ids', jsonb_build_array(current_setting('fx.f_a1')),
        'principle_ids', jsonb_build_array(current_setting('fx.g_a1')),
        'standard_ids', jsonb_build_array(current_setting('fx.s_a1')),
        'coaching_points', '[{"text":"Mira antes de pasar","is_key":true},
                             {"text":"Cuenta hasta tres","is_key":false}]'::jsonb,
        'variants', '[{"title":"A una mano","description":"Pase con una sola mano."}]'::jsonb,
        'status', 'published',
        'created_by', current_setting('fx.c2'),
        'diagram_media_id', current_setting('fx.m_c1_ok')
      ))
    ) as s$$,
  'c1 crea un borrador con hijos'
);

select results_eq(
  $$select d.status::text, d.created_by, d.organization_id, d.diagram_media_id
    from public.drills as d where d.id = current_setting('fx.d_new')::uuid$$,
  $$values ('draft', current_setting('fx.c1')::uuid, current_setting('fx.club_a')::uuid, null::uuid)$$,
  'el ejercicio nace en borrador, de c1, en A y sin diagrama, diga lo que diga el payload'
);

select results_eq(
  $$select d.title, d.min_players, d.max_players, d.min_minutes, d.max_minutes, d.min_age,
           d.max_age, d.equipment, d.video_url
    from public.drills as d where d.id = current_setting('fx.d_new')::uuid$$,
  $$values ('Rueda de pases', 4::smallint, 10::smallint, 10::smallint, 15::smallint, 10::smallint,
            14::smallint, array['balones', 'conos'], 'https://youtu.be/abc123')$$,
  'las columnas del ejercicio salen del payload'
);

select results_eq(
  $$select p.text, p.is_key, p.sort
    from public.drill_coaching_points as p
    where p.drill_id = current_setting('fx.d_new')::uuid order by p.sort$$,
  $$values ('Mira antes de pasar', true, 0::smallint), ('Cuenta hasta tres', false, 1::smallint)$$,
  'los puntos de coaching se guardan con sort 0 y 1, en el orden del payload'
);

select results_eq(
  $$select v.title, v.description, v.sort
    from public.drill_variants as v where v.drill_id = current_setting('fx.d_new')::uuid$$,
  $$values ('A una mano', 'Pase con una sola mano.', 0::smallint)$$,
  'la variante se guarda con sort 0'
);

select results_eq(
  $$select (select focus_area_id from public.drill_focus_areas where drill_id = current_setting('fx.d_new')::uuid),
           (select principle_id from public.drill_principles where drill_id = current_setting('fx.d_new')::uuid),
           (select standard_id from public.drill_standards where drill_id = current_setting('fx.d_new')::uuid)$$,
  $$values (current_setting('fx.f_a1')::uuid, current_setting('fx.g_a1')::uuid, current_setting('fx.s_a1')::uuid)$$,
  'el objetivo, el principio y el Standard quedan vinculados, con el club del ejercicio'
);

select is(
  current_setting('fx.u_new')::timestamptz,
  (select updated_at from public.drills where id = current_setting('fx.d_new')::uuid),
  'el updated_at devuelto es el de la fila'
);

-- Sin listas en el payload no hay hijos, y la copia esperada no cuenta al crear.
select lives_ok(
  $$select set_config('fx.d_bare', s.id::text, true)
    from public.save_drill(
      current_setting('fx.club_a')::uuid, null, '2000-01-01T00:00:00Z', tests.payload()
    ) as s$$,
  'c1 crea otro borrador sin listas, con una copia esperada que se ignora'
);

select is(
  tests.counts(current_setting('fx.d_bare')::uuid),
  '0/0/0/0/0',
  'las listas ausentes del payload dejan el ejercicio sin hijos'
);

-- Los tres últimos parámetros tienen `default null`: crear es pasar solo el club y el payload,
-- por nombre. Sin payload, entrada inválida.
select lives_ok(
  $$select set_config('fx.d_named', s.id::text, true)
    from public.save_drill(
      p_org => current_setting('fx.club_a')::uuid, p_payload => tests.payload()
    ) as s$$,
  'c1 crea un ejercicio pasando solo p_org y p_payload por nombre'
);

select results_eq(
  $$select d.status::text, d.created_by, d.title
    from public.drills as d where d.id = current_setting('fx.d_named')::uuid$$,
  $$values ('draft', current_setting('fx.c1')::uuid, 'Rueda de pases')$$,
  'el ejercicio creado por nombre es un borrador de c1 con el payload'
);

select throws_ok(
  $$select public.save_drill(p_org => current_setting('fx.club_a')::uuid)$$,
  '22023', 'INVALID',
  'sin payload es entrada inválida'
);

-- ── Reemplazar los hijos, en orden ───────────────────────────────────────────────────
-- Con el `updated_at` que devolvió la creación, los puntos invertidos, otro objetivo, el
-- principio vacío, sin Standards (ausente) y dos variantes. Los hijos anteriores se van.
select lives_ok(
  $$select set_config('fx.u_new2', s.updated_at::text, true)
    from public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new')::timestamptz,
      tests.payload(jsonb_build_object(
        'title', 'Rueda de pases v2',
        'summary', null,
        'video_url', null,
        'equipment', '[]'::jsonb,
        'focus_area_ids', jsonb_build_array(current_setting('fx.f_a2')),
        'principle_ids', '[]'::jsonb,
        'coaching_points', '[{"text":"Cuenta hasta tres","is_key":false},
                             {"text":"Mira antes de pasar","is_key":true}]'::jsonb,
        'variants', '[{"title":"Con un defensor"},{"title":"Con dos balones","description":"Dos a la vez."}]'::jsonb
      ))
    ) as s$$,
  'c1 guarda con el updated_at devuelto y los puntos invertidos'
);

select results_eq(
  $$select p.text, p.sort
    from public.drill_coaching_points as p
    where p.drill_id = current_setting('fx.d_new')::uuid order by p.sort$$,
  $$values ('Cuenta hasta tres', 0::smallint), ('Mira antes de pasar', 1::smallint)$$,
  'los puntos quedan en el orden invertido, con sort 0 y 1'
);

select results_eq(
  $$select v.title, v.description, v.sort
    from public.drill_variants as v
    where v.drill_id = current_setting('fx.d_new')::uuid order by v.sort$$,
  $$values ('Con un defensor', null::text, 0::smallint), ('Con dos balones', 'Dos a la vez.', 1::smallint)$$,
  'las variantes anteriores se van y las nuevas quedan en orden, con la descripción a null si falta'
);

select results_eq(
  $$select (select focus_area_id from public.drill_focus_areas where drill_id = current_setting('fx.d_new')::uuid),
           tests.counts(current_setting('fx.d_new')::uuid)$$,
  $$values (current_setting('fx.f_a2')::uuid, '2/2/1/0/0')$$,
  'el objetivo se reemplaza; el principio vacío y los Standards ausentes borran los vínculos'
);

select results_eq(
  $$select d.title, d.summary, d.video_url, d.equipment
    from public.drills as d where d.id = current_setting('fx.d_new')::uuid$$,
  $$values ('Rueda de pases v2', null::text, null::text, '{}'::text[])$$,
  'una columna nula o ausente en el payload se vacía'
);

select ok(
  current_setting('fx.u_new2')::timestamptz > current_setting('fx.u_new')::timestamptz,
  'cada guardado avanza el updated_at'
);

select is(
  current_setting('fx.u_new2')::timestamptz,
  (select updated_at from public.drills where id = current_setting('fx.d_new')::uuid),
  'el updated_at devuelto por el reemplazo es el de la fila'
);

-- ── Copia obsoleta ───────────────────────────────────────────────────────────────────
-- Lo que sigue lleva un título distinto: si algún guardado pasara, el título lo delataría.
select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new')::timestamptz,
      tests.payload(jsonb_build_object('title', 'Copia antigua')))$$,
  'P0001', 'STALE_COPY',
  'una copia antigua da STALE_COPY'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new2')::timestamptz + interval '1 microsecond',
      tests.payload(jsonb_build_object('title', 'Copia casi igual')))$$,
  'P0001', 'STALE_COPY',
  'la copia se compara exacta: un microsegundo de diferencia ya es obsoleta'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid, null,
      tests.payload(jsonb_build_object('title', 'Sin copia')))$$,
  'P0001', 'STALE_COPY',
  'guardar sin copia esperada también es STALE_COPY'
);

select results_eq(
  $$select d.title, d.updated_at, tests.counts(d.id)
    from public.drills as d where d.id = current_setting('fx.d_new')::uuid$$,
  $$values ('Rueda de pases v2', current_setting('fx.u_new2')::timestamptz, '2/2/1/0/0')$$,
  'tras los STALE_COPY el ejercicio y sus hijos siguen como estaban'
);

-- ── Límites del payload ──────────────────────────────────────────────────────────────
-- Tres puntos clave valen (control positivo, y de paso es el guardado vigente: se guarda con
-- la copia que devolvió el reemplazo); cuatro, no. Se vuelven a vincular el principio y el
-- Standard para que el ejercicio tenga hijos de las cinco clases.
select lives_ok(
  $$select set_config('fx.u_new3', s.updated_at::text, true)
    from public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new2')::timestamptz,
      tests.payload(jsonb_build_object(
        'title', 'Rueda de pases v3',
        'focus_area_ids', jsonb_build_array(current_setting('fx.f_a2')),
        'principle_ids', jsonb_build_array(current_setting('fx.g_a1')),
        'standard_ids', jsonb_build_array(current_setting('fx.s_a1')),
        'coaching_points', '[{"text":"Uno","is_key":true},{"text":"Dos","is_key":true},
                             {"text":"Tres","is_key":true},{"text":"Cuatro"}]'::jsonb,
        'variants', '[{"title":"Con un defensor"},{"title":"Con dos balones"}]'::jsonb
      ))
    ) as s$$,
  'tres puntos clave valen, y is_key ausente es false'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new3')::timestamptz,
      tests.payload(jsonb_build_object(
        'title', 'Cuatro claves',
        'coaching_points', '[{"text":"Uno","is_key":true},{"text":"Dos","is_key":true},
                             {"text":"Tres","is_key":true},{"text":"Cuatro","is_key":true}]'::jsonb
      )))$$,
  '22023', 'INVALID',
  'cuatro puntos clave dan INVALID'
);

select results_eq(
  $$select d.title, d.updated_at, tests.counts(d.id)
    from public.drills as d where d.id = current_setting('fx.d_new')::uuid$$,
  $$values ('Rueda de pases v3', current_setting('fx.u_new3')::timestamptz, '4/2/1/1/1')$$,
  'tras el INVALID el ejercicio sigue como estaba'
);

-- Un payload que no es un objeto, una lista que no es lista y un club nulo son entrada
-- inválida; los CHECK de la tabla salen con su propio código.
select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new3')::timestamptz, null)$$,
  '22023', 'INVALID',
  'un payload nulo da INVALID'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new3')::timestamptz, '[]'::jsonb)$$,
  '22023', 'INVALID',
  'un payload que no es un objeto da INVALID'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new3')::timestamptz,
      tests.payload(jsonb_build_object('focus_area_ids', 'rebote')))$$,
  '22023', 'INVALID',
  'una lista que no es una lista da INVALID'
);

select throws_ok(
  $$select public.save_drill(null, null, null, tests.payload())$$,
  '22023', 'INVALID',
  'sin club da INVALID'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new3')::timestamptz,
      tests.payload(jsonb_build_object('title', 'ab')))$$,
  '23514', null,
  'un título demasiado corto sale con el 23514 del CHECK'
);

-- ── Atomicidad ───────────────────────────────────────────────────────────────────────
-- Un Standard de B (con el título nuevo y un solo punto) falla en el último paso: ni el
-- ejercicio ni los hijos anteriores cambian, y el updated_at tampoco avanza.
select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new3')::timestamptz,
      tests.payload(jsonb_build_object(
        'title', 'No debe guardarse',
        'standard_ids', jsonb_build_array(current_setting('fx.s_b')),
        'coaching_points', '[{"text":"Único"}]'::jsonb
      )))$$,
  '23503', null,
  'un Standard de otro club da 23503'
);

select results_eq(
  $$select d.title, d.updated_at, tests.counts(d.id)
    from public.drills as d where d.id = current_setting('fx.d_new')::uuid$$,
  $$values ('Rueda de pases v3', current_setting('fx.u_new3')::timestamptz, '4/2/1/1/1')$$,
  'tras el 23503 el ejercicio, su updated_at y todos los hijos anteriores siguen como estaban'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new3')::timestamptz,
      tests.payload(jsonb_build_object('focus_area_ids', jsonb_build_array(current_setting('fx.f_b')))))$$,
  '23503', null,
  'un objetivo de otro club da 23503'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new3')::timestamptz,
      tests.payload(jsonb_build_object('principle_ids', jsonb_build_array(current_setting('fx.g_b')))))$$,
  '23503', null,
  'un principio de otro club da 23503'
);

select is(
  tests.counts(current_setting('fx.d_new')::uuid),
  '4/2/1/1/1',
  'tras los tres 23503 los hijos siguen como estaban'
);

-- Un id repetido en una lista es el mismo vínculo una vez, no un error. El ejercicio no cambia
-- (el mismo título y las mismas columnas) y solo cambian los hijos: el updated_at avanza igual,
-- porque es la copia de todo el ejercicio. Se guarda con la copia del último guardado que
-- valió, la del 22023 y los 23503 de arriba no la movieron.
select lives_ok(
  $$select set_config('fx.u_new4', s.updated_at::text, true)
    from public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      current_setting('fx.u_new3')::timestamptz,
      tests.payload(jsonb_build_object(
        'title', 'Rueda de pases v3',
        'focus_area_ids', jsonb_build_array(current_setting('fx.f_a1'), current_setting('fx.f_a1')),
        'coaching_points', '[{"text":"Uno","is_key":true},{"text":"Dos"},{"text":"Tres"},{"text":"Cuatro"}]'::jsonb
      ))
    ) as s$$,
  'un id repetido en una lista no rompe el guardado'
);

select is(
  tests.counts(current_setting('fx.d_new')::uuid),
  '4/0/1/0/0',
  'el id repetido es un solo vínculo'
);

select ok(
  current_setting('fx.u_new4')::timestamptz > current_setting('fx.u_new3')::timestamptz,
  'si solo cambian los hijos, el updated_at avanza igual'
);

-- ── status y created_by no se escriben desde el payload ──────────────────────────────
select lives_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      tests.token(current_setting('fx.d_new')::uuid),
      tests.payload(jsonb_build_object(
        'status', 'published',
        'created_by', current_setting('fx.c2')
      )))$$,
  'un status y un created_by en el payload de c1 no hacen fallar el guardado'
);

select results_eq(
  $$select d.status::text, d.created_by
    from public.drills as d where d.id = current_setting('fx.d_new')::uuid$$,
  $$values ('draft', current_setting('fx.c1')::uuid)$$,
  'el borrador de c1 sigue siendo borrador y de c1'
);

-- ── Quién guarda ─────────────────────────────────────────────────────────────────────
-- Para quien no puede editar el ejercicio, NOT_FOUND: ni se entera de si existe (con la copia
-- esperada correcta, para que un guardado que se colara no lo tape un STALE_COPY).
select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid,
      tests.token(current_setting('fx.d_pub')::uuid),
      tests.payload(jsonb_build_object('title', 'Publicado por c1')))$$,
  'P0002', 'NOT_FOUND',
  'c1 no guarda un ejercicio publicado, que sí ve'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_b')::uuid, current_setting('fx.d_new')::uuid,
      tests.token(current_setting('fx.d_new')::uuid),
      tests.payload(jsonb_build_object('title', 'Con el club de B')))$$,
  'P0002', 'NOT_FOUND',
  'c1 no guarda su borrador con otro club en p_org'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, gen_random_uuid(), now(), tests.payload())$$,
  'P0002', 'NOT_FOUND',
  'un ejercicio que no existe da NOT_FOUND'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_b')::uuid, null, null, tests.payload())$$,
  '42501', null,
  'c1 no crea un borrador en B'
);

-- c2 es del mismo club y entrena otro equipo, pero un borrador es de su autor.
select tests.authenticate_as(current_setting('fx.c2')::uuid);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      tests.token(current_setting('fx.d_new')::uuid),
      tests.payload(jsonb_build_object('title', 'Robado por c2')))$$,
  'P0002', 'NOT_FOUND',
  'c2 no guarda el borrador de c1'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_c1')::uuid,
      tests.token(current_setting('fx.d_c1')::uuid),
      tests.payload(jsonb_build_object('title', 'Robado por c2')))$$,
  'P0002', 'NOT_FOUND',
  'c2 no guarda el otro borrador de c1, el de los fixtures'
);

select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid,
      tests.token(current_setting('fx.d_pub')::uuid), tests.payload())$$,
  'P0002', 'NOT_FOUND',
  'un jugador no guarda un ejercicio'
);

select throws_ok(
  $$select public.save_drill(current_setting('fx.club_a')::uuid, null, null, tests.payload())$$,
  '42501', null,
  'un jugador no crea un ejercicio'
);

select tests.authenticate_as(current_setting('fx.coach_b')::uuid);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      tests.token(current_setting('fx.d_new')::uuid), tests.payload())$$,
  'P0002', 'NOT_FOUND',
  'coachB no guarda un borrador de A con p_org = A'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_b')::uuid, current_setting('fx.d_new')::uuid,
      tests.token(current_setting('fx.d_new')::uuid), tests.payload())$$,
  'P0002', 'NOT_FOUND',
  'coachB no guarda un borrador de A con p_org = B'
);

-- ── adminA: guarda sin cambiar el estado ni el autor ─────────────────────────────────
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select lives_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid,
      tests.token(current_setting('fx.d_pub')::uuid),
      tests.payload(jsonb_build_object(
        'title', 'Pase y corte v2',
        'status', 'archived',
        'created_by', current_setting('fx.c2'),
        'coaching_points', '[{"text":"Hombros a la canasta"},{"text":"Voz al pasar"}]'::jsonb
      )))$$,
  'adminA guarda un ejercicio publicado'
);

select results_eq(
  $$select d.title, d.status::text, d.created_by, tests.counts(d.id)
    from public.drills as d where d.id = current_setting('fx.d_pub')::uuid$$,
  $$values ('Pase y corte v2', 'published', current_setting('fx.admin_a')::uuid, '2/0/0/0/0')$$,
  'sigue publicado y de su autor aunque el payload diga otra cosa, con los hijos reemplazados'
);

select lives_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_c1')::uuid,
      tests.token(current_setting('fx.d_c1')::uuid),
      tests.payload(jsonb_build_object('title', 'Borrador de c1, revisado')))$$,
  'adminA guarda el borrador de c1'
);

select results_eq(
  $$select d.status::text, d.created_by
    from public.drills as d where d.id = current_setting('fx.d_c1')::uuid$$,
  $$values ('draft', current_setting('fx.c1')::uuid)$$,
  'el borrador de c1 sigue siendo borrador y de c1'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_b')::uuid, current_setting('fx.d_pub')::uuid,
      tests.token(current_setting('fx.d_pub')::uuid), tests.payload())$$,
  'P0002', 'NOT_FOUND',
  'adminA no guarda un ejercicio de A con p_org = B'
);

select lives_ok(
  $$select set_config('fx.d_adm', s.id::text, true)
    from public.save_drill(
      current_setting('fx.club_a')::uuid, null, null,
      tests.payload(jsonb_build_object('status', 'published'))
    ) as s$$,
  'adminA crea un borrador, aunque el payload pida otro estado'
);

select results_eq(
  $$select d.status::text, d.created_by
    from public.drills as d where d.id = current_setting('fx.d_adm')::uuid$$,
  $$values ('draft', current_setting('fx.admin_a')::uuid)$$,
  'el ejercicio de adminA nace en borrador y de adminA'
);

-- ── multi: entrenador de A y admin de B ──────────────────────────────────────────────
-- Es el caso que `p_org` podría confundir. Ningún p_org le abre un ejercicio de A que no es
-- suyo; en B, donde es admin, guarda lo de B, pero no lo de B con el club de A.
select tests.authenticate_as(current_setting('fx.multi')::uuid);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid,
      tests.token(current_setting('fx.d_pub')::uuid),
      tests.payload(jsonb_build_object('title', 'Publicado por multi')))$$,
  'P0002', 'NOT_FOUND',
  'multi no guarda el publicado de A con p_org = A (es entrenador)'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_b')::uuid, current_setting('fx.d_pub')::uuid,
      tests.token(current_setting('fx.d_pub')::uuid),
      tests.payload(jsonb_build_object('title', 'Publicado por multi')))$$,
  'P0002', 'NOT_FOUND',
  'multi no guarda el publicado de A con p_org = B (es admin de B, no de A)'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_b')::uuid, current_setting('fx.d_c1')::uuid,
      tests.token(current_setting('fx.d_c1')::uuid),
      tests.payload(jsonb_build_object('title', 'Borrador robado por multi')))$$,
  'P0002', 'NOT_FOUND',
  'multi no guarda el borrador de c1 con p_org = B'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_b')::uuid,
      tests.token(current_setting('fx.d_b')::uuid),
      tests.payload(jsonb_build_object('title', 'Ejercicio de B con el club de A')))$$,
  'P0002', 'NOT_FOUND',
  'multi, admin de B, no guarda el ejercicio de B con p_org = A'
);

select lives_ok(
  $$select public.save_drill(
      current_setting('fx.club_b')::uuid, current_setting('fx.d_b')::uuid,
      tests.token(current_setting('fx.d_b')::uuid),
      tests.payload(jsonb_build_object('title', 'Ejercicio de B revisado')))$$,
  'multi guarda el ejercicio de B con p_org = B (control positivo)'
);

-- Dos borradores de multi: uno en A (como entrenador) y uno en B (como admin).
select lives_ok(
  $$select set_config('fx.d_multi', s.id::text, true)
    from public.save_drill(current_setting('fx.club_a')::uuid, null, null, tests.payload()) as s$$,
  'multi crea un borrador en A'
);

select lives_ok(
  $$select set_config('fx.d_multi_b', s.id::text, true)
    from public.save_drill(current_setting('fx.club_b')::uuid, null, null, tests.payload()) as s$$,
  'multi crea un borrador en B'
);

-- ── Columnas que un cliente no reescribe ─────────────────────────────────────────────
-- `authenticated` tiene `update` solo sobre las columnas de contenido, `status` y el
-- diagrama. Sin esto, multi sacaría su borrador de A pasándolo a B, donde es admin y la
-- política de `update` lo deja pasar: el ejercicio desaparecería de A.
select throws_ok(
  $$update public.drills set organization_id = current_setting('fx.club_b')::uuid
    where id = current_setting('fx.d_multi')::uuid$$,
  '42501', null,
  'multi no pasa su borrador de A a B'
);

select throws_ok(
  $$update public.drills set created_by = current_setting('fx.c2')::uuid
    where id = current_setting('fx.d_multi')::uuid$$,
  '42501', null,
  'multi no cede su borrador a otro autor'
);

select throws_ok(
  $$update public.drills set id = gen_random_uuid()
    where id = current_setting('fx.d_multi')::uuid$$,
  '42501', null,
  'multi no cambia el id de su borrador'
);

select throws_ok(
  $$update public.drills set updated_at = now()
    where id = current_setting('fx.d_multi')::uuid$$,
  '42501', null,
  'multi no fija a mano el updated_at, que es el testigo de la concurrencia'
);

select throws_ok(
  $$update public.drills set created_at = now()
    where id = current_setting('fx.d_multi')::uuid$$,
  '42501', null,
  'multi no cambia created_at'
);

select results_eq(
  $$with u as (update public.drills set summary = 'Resumen editado a mano.'
               where id = current_setting('fx.d_multi')::uuid returning 1)
    select count(*)::int from u$$,
  array[1],
  'multi sí edita el contenido de su borrador con un update directo'
);

select results_eq(
  $$select d.organization_id, d.created_by
    from public.drills as d where d.id = current_setting('fx.d_multi')::uuid$$,
  $$values (current_setting('fx.club_a')::uuid, current_setting('fx.multi')::uuid)$$,
  'el borrador de multi sigue en A y de multi'
);

-- Publicar y archivar siguen siendo un `update` del admin.
select results_eq(
  $$with u as (update public.drills set status = 'published'
               where id = current_setting('fx.d_multi_b')::uuid returning status::text)
    select * from u$$,
  $$values ('published')$$,
  'multi, admin de B, publica un ejercicio de B con un update directo'
);

select results_eq(
  $$with u as (update public.drills set status = 'archived'
               where id = current_setting('fx.d_multi_b')::uuid returning status::text)
    select * from u$$,
  $$values ('archived')$$,
  'multi, admin de B, archiva un ejercicio de B con un update directo'
);

select throws_ok(
  $$update public.drills set status = 'published' where id = current_setting('fx.d_multi')::uuid$$,
  '42501', null,
  'multi, entrenador en A, no publica su borrador de A'
);

-- adminA publica el ejercicio de c1; desde entonces c1 ya no lo guarda.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select results_eq(
  $$with u as (update public.drills set status = 'published'
               where id = current_setting('fx.d_new')::uuid returning status::text)
    select * from u$$,
  $$values ('published')$$,
  'adminA publica el ejercicio de c1 con un update directo'
);

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_new')::uuid,
      tests.token(current_setting('fx.d_new')::uuid),
      tests.payload(jsonb_build_object('title', 'Editado tras publicar')))$$,
  'P0002', 'NOT_FOUND',
  'c1 ya no guarda su ejercicio una vez publicado'
);

-- ── El diagrama vive en la carpeta del propio ejercicio ──────────────────────────────
-- La regla es de la tabla, no solo de la función: un `update` directo tampoco puede apuntar
-- un ejercicio a un medio ajeno. c1 trabaja con su borrador `d_c1`. Una ficha de otro club se
-- comporta como una que no existe (23503 de la clave foránea); una de su club pero de la
-- carpeta de otro ejercicio, 22023.
select throws_ok(
  $$update public.drills set diagram_media_id = current_setting('fx.m_pub')::uuid
    where id = current_setting('fx.d_c1')::uuid$$,
  '22023', 'INVALID',
  'un update directo no apunta un borrador al medio de la carpeta de otro ejercicio'
);

select is_empty(
  $$select 1 from public.media_assets where id = current_setting('fx.m_pub')::uuid$$,
  'c1 sigue sin ver el medio ajeno al que intentó apuntar'
);

select throws_ok(
  $$update public.drills set diagram_media_id = current_setting('fx.m_b')::uuid
    where id = current_setting('fx.d_c1')::uuid$$,
  '23503', null,
  'un update directo a un medio de otro club responde como a uno que no existe: 23503'
);

select throws_ok(
  $$update public.drills set diagram_media_id = gen_random_uuid()
    where id = current_setting('fx.d_c1')::uuid$$,
  '23503', null,
  'un medio que no existe lo rechaza la clave foránea, con su 23503'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_c1')::uuid,
      tests.token(current_setting('fx.d_c1')::uuid),
      tests.payload(jsonb_build_object('diagram_media_id', current_setting('fx.m_pub'))))$$,
  '22023', 'INVALID',
  'save_drill rechaza un diagrama de la carpeta de otro ejercicio'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_c1')::uuid,
      tests.token(current_setting('fx.d_c1')::uuid),
      tests.payload(jsonb_build_object('diagram_media_id', current_setting('fx.m_b'))))$$,
  '23503', null,
  'save_drill con un diagrama de otro club responde como con uno que no existe: 23503'
);

select throws_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_c1')::uuid,
      tests.token(current_setting('fx.d_c1')::uuid),
      tests.payload(jsonb_build_object('diagram_media_id', gen_random_uuid())))$$,
  '23503', null,
  'save_drill con un medio que no existe da 23503'
);

select lives_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_c1')::uuid,
      tests.token(current_setting('fx.d_c1')::uuid),
      tests.payload(jsonb_build_object('diagram_media_id', current_setting('fx.m_c1_ok'))))$$,
  'save_drill acepta un diagrama de la carpeta del propio ejercicio'
);

select results_eq(
  $$select d.diagram_media_id from public.drills as d where d.id = current_setting('fx.d_c1')::uuid$$,
  $$values (current_setting('fx.m_c1_ok')::uuid)$$,
  'el diagrama queda fijado'
);

select lives_ok(
  $$select public.save_drill(
      current_setting('fx.club_a')::uuid, current_setting('fx.d_c1')::uuid,
      tests.token(current_setting('fx.d_c1')::uuid),
      tests.payload())$$,
  'c1 guarda sin la clave del diagrama'
);

select results_eq(
  $$select d.diagram_media_id from public.drills as d where d.id = current_setting('fx.d_c1')::uuid$$,
  $$values (null::uuid)$$,
  'sin la clave diagram_media_id en el payload el ejercicio se queda sin diagrama'
);

select results_eq(
  $$with u as (update public.drills set diagram_media_id = current_setting('fx.m_c1_ok')::uuid
               where id = current_setting('fx.d_c1')::uuid returning 1)
    select count(*)::int from u$$,
  array[1],
  'un update directo sí apunta el borrador a un medio de su propia carpeta'
);

-- También al crear: el trigger es de `insert or update`.
select throws_ok(
  $$insert into public.drills (
      id, organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age,
      diagram_media_id
    ) values (
      current_setting('fx.d_pre')::uuid, current_setting('fx.club_a')::uuid, 'Borrador con diagrama ajeno',
      4, 8, 10, 15, 10, current_setting('fx.m_pub')::uuid
    )$$,
  '22023', 'INVALID',
  'un insert no crea un ejercicio con el diagrama de otra carpeta'
);

select lives_ok(
  $$insert into public.drills (
      id, organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age,
      diagram_media_id
    ) values (
      current_setting('fx.d_pre')::uuid, current_setting('fx.club_a')::uuid, 'Borrador con su diagrama',
      4, 8, 10, 15, 10, current_setting('fx.m_pre')::uuid
    )$$,
  'un insert sí crea un ejercicio con un medio de su propia carpeta'
);

-- ── Quien no puede escribir la fila recibe lo de RLS, sea cual sea la ficha ───────────
-- El trigger corre después de RLS y busca solo en el club del ejercicio: no sirve para
-- averiguar qué ids de ficha existen ni en qué carpeta. Se prueba con tres ids (de otro club,
-- de este club en otra carpeta e inexistente), que tienen que dar la misma respuesta.
-- c1 puede escribir `d_c1` pero no dejarlo publicado: la comprobación `with check` de la
-- política salta aquí, con el id de ficha que sea.
select results_eq(
  $$select tests.outcome(format(
      'update public.drills set status = ''published'', diagram_media_id = %L where id = %L',
      m, current_setting('fx.d_c1')))
    from tests.probe_media() as m$$,
  $$values ('42501'), ('42501'), ('42501')$$,
  'c1 no publica su borrador: 42501 de RLS con una ficha de otro club, de otra carpeta o inexistente'
);

-- Quien no es miembro de ningún club, y un jugador del club A, no crean ni ven nada: el insert
-- da el 42501 de la política, y el update no toca ninguna fila (no ven el ejercicio).
select tests.authenticate_as(current_setting('fx.out')::uuid);

select results_eq(
  $$select tests.outcome(format(
      'insert into public.drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, diagram_media_id)
       values (%L, ''Intruso'', 4, 8, 10, 15, 10, %L)',
      current_setting('fx.club_a'), m))
    from tests.probe_media() as m$$,
  $$values ('42501'), ('42501'), ('42501')$$,
  'un usuario sin club recibe el 42501 de RLS al crear con cualquier ficha, no un 22023 ni un 23503'
);

select results_eq(
  $$select tests.outcome(format(
      'update public.drills set diagram_media_id = %L where id = %L', m, current_setting('fx.d_c1')))
    from tests.probe_media() as m$$,
  $$values ('ok 0'), ('ok 0'), ('ok 0')$$,
  'un usuario sin club no toca ninguna fila al actualizar, con cualquier ficha'
);

select tests.authenticate_as(current_setting('fx.jug_a')::uuid);

select results_eq(
  $$select tests.outcome(format(
      'insert into public.drills (organization_id, title, min_players, max_players, min_minutes, max_minutes, min_age, diagram_media_id)
       values (%L, ''Intruso'', 4, 8, 10, 15, 10, %L)',
      current_setting('fx.club_a'), m))
    from tests.probe_media() as m$$,
  $$values ('42501'), ('42501'), ('42501')$$,
  'un jugador recibe el 42501 de RLS al crear con cualquier ficha, no un 22023 ni un 23503'
);

select results_eq(
  $$select tests.outcome(format(
      'update public.drills set diagram_media_id = %L where id = %L', m, current_setting('fx.d_c1')))
    from tests.probe_media() as m$$,
  $$values ('ok 0'), ('ok 0'), ('ok 0')$$,
  'un jugador no toca ninguna fila al actualizar, con cualquier ficha'
);

-- Tampoco el admin ni el dueño de la base saltan la regla.
select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select throws_ok(
  $$update public.drills set diagram_media_id = current_setting('fx.m_pub')::uuid
    where id = current_setting('fx.d_c1')::uuid$$,
  '22023', 'INVALID',
  'adminA tampoco apunta un borrador al medio de otro ejercicio'
);

reset role;

select throws_ok(
  $$update public.drills set diagram_media_id = current_setting('fx.m_pub')::uuid
    where id = current_setting('fx.d_c1')::uuid$$,
  '22023', 'INVALID',
  'ni el propietario de la base: la regla es de la tabla'
);

-- ── Anon ─────────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();

select throws_ok(
  $$select public.save_drill(current_setting('fx.club_a')::uuid, null, null, tests.payload())$$,
  '42501', 'permission denied for function save_drill',
  'anon no ejecuta save_drill'
);

reset role;

-- ── El trigger vale en cualquier insert o update ────────────────────────────────────
-- No solo cuando cambia `diagram_media_id`. `d_pre` tiene de diagrama `m_pre`, de su carpeta;
-- se traslada la ficha a la de otro ejercicio (como postgres: `media_assets` no tiene el
-- trigger) y el diagrama deja de cumplir la regla. Tocar cualquier otra columna del ejercicio
-- tiene que fallar.
update public.media_assets
set path = tests.folder_path(current_setting('fx.club_a')::uuid, current_setting('fx.d_pub')::uuid)
where id = current_setting('fx.m_pre')::uuid;

select throws_ok(
  $$update public.drills set summary = 'Solo cambia el resumen'
    where id = current_setting('fx.d_pre')::uuid$$,
  '22023', 'INVALID',
  'un update de otra columna también comprueba el diagrama que el ejercicio ya tenía'
);

-- ── Catálogo: privilegios y forma ────────────────────────────────────────────────────
select set_eq(
  $$select a.attname::text collate "default"
    from pg_attribute as a
    where a.attrelid = 'public.drills'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and has_column_privilege('authenticated', a.attrelid, a.attnum, 'update')$$,
  $$values ('title'), ('summary'), ('objective'), ('setup_md'), ('min_players'), ('max_players'),
           ('min_minutes'), ('max_minutes'), ('min_age'), ('max_age'), ('equipment'),
           ('video_url'), ('diagram_media_id'), ('status')$$,
  'authenticated actualiza solo el contenido, el estado y el diagrama: ni club, autor, id ni fechas'
);

select results_eq(
  $$select has_table_privilege('authenticated', 'public.drills', 'select'),
           has_table_privilege('authenticated', 'public.drills', 'insert'),
           has_table_privilege('authenticated', 'public.drills', 'update'),
           has_table_privilege('authenticated', 'public.drills', 'delete'),
           has_table_privilege('service_role', 'public.drills', 'update')$$,
  $$values (true, true, false, false, true)$$,
  'authenticated lee y crea ejercicios, y su update es por columnas; service_role conserva el de tabla'
);

select results_eq(
  $$select p.provolatile::text collate "default", p.prosecdef, l.lanname::text collate "default",
           p.proconfig = array['search_path=""'],
           pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
    from pg_proc as p
    join pg_language as l on l.oid = p.prolang
    where p.oid = 'public.save_drill(uuid, uuid, timestamptz, jsonb)'::regprocedure$$,
  $$values (
    'v', false, 'plpgsql', true,
    'p_org uuid, p_drill uuid DEFAULT NULL::uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_payload jsonb DEFAULT NULL::jsonb',
    'TABLE(id uuid, updated_at timestamp with time zone)'
  )$$,
  'save_drill es plpgsql security invoker con search_path vacío, con la firma del contrato y los tres últimos parámetros a null por defecto'
);

select results_eq(
  $$select
      has_function_privilege('public', 'public.save_drill(uuid, uuid, timestamptz, jsonb)', 'execute'),
      has_function_privilege('anon', 'public.save_drill(uuid, uuid, timestamptz, jsonb)', 'execute'),
      has_function_privilege('service_role', 'public.save_drill(uuid, uuid, timestamptz, jsonb)', 'execute'),
      has_function_privilege('authenticated', 'public.save_drill(uuid, uuid, timestamptz, jsonb)', 'execute')$$,
  $$values (false, false, false, true)$$,
  'save_drill la ejecuta authenticated, y no PUBLIC, anon ni service_role'
);

select results_eq(
  $$select p.prosecdef, p.proconfig = array['search_path=""'],
           has_function_privilege('public', p.oid, 'execute'),
           has_function_privilege('anon', p.oid, 'execute'),
           has_function_privilege('authenticated', p.oid, 'execute')
    from pg_proc as p
    where p.oid = 'private.check_drill_diagram()'::regprocedure$$,
  $$values (true, true, false, false, false)$$,
  'la función del trigger del diagrama es security definer, con search_path vacío, y solo la ejecuta el trigger'
);

select results_eq(
  $$select (t.tgtype & 23) = 21, t.tgenabled::text collate "default"
    from pg_trigger as t
    where t.tgrelid = 'public.drills'::regclass and t.tgname = 'drills_check_diagram'$$,
  $$values (true, 'O')$$,
  'drills_check_diagram es un trigger por fila, después de insert o update (tras RLS), y está activo'
);

-- ── Defensa en profundidad: la política de update ────────────────────────────────────
-- El privilegio por columnas rechaza antes que RLS, y los dos errores comparten código (42501):
-- los 42501 de arriba no dicen cuál de las dos capas actuó. Para ver que la política de
-- `update` sigue sosteniendo por sí sola lo que ya sostenía (no ceder el borrador a otro autor
-- ni sacar un ejercicio a un club donde no se es miembro, ni siendo admin), se concede el
-- privilegio de esas dos columnas dentro de esta transacción y se exige el mensaje de RLS: con
-- el privilegio quitado, el mensaje sería «permission denied for table drills» y estas
-- aserciones fallarían. No cubre a quien es miembro de los dos clubes, como multi: ese caso es
-- justo el que cierra el privilegio por columnas.
grant update (organization_id, created_by) on table public.drills to authenticated;

select tests.authenticate_as(current_setting('fx.c1')::uuid);

select throws_ok(
  $$update public.drills set organization_id = current_setting('fx.club_b')::uuid
    where id = current_setting('fx.d_bare')::uuid$$,
  '42501', 'new row violates row-level security policy for table "drills"',
  'la política impide que c1 saque su borrador a B'
);

select throws_ok(
  $$update public.drills set created_by = current_setting('fx.c2')::uuid
    where id = current_setting('fx.d_bare')::uuid$$,
  '42501', 'new row violates row-level security policy for table "drills"',
  'la política impide que c1 ceda su borrador a otro autor'
);

select tests.authenticate_as(current_setting('fx.admin_a')::uuid);

select throws_ok(
  $$update public.drills set organization_id = current_setting('fx.club_b')::uuid
    where id = current_setting('fx.d_pub')::uuid$$,
  '42501', 'new row violates row-level security policy for table "drills"',
  'la política impide que adminA pase un ejercicio de A a B, donde no es miembro'
);

select * from finish();

rollback;
