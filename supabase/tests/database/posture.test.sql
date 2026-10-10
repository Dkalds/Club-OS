-- Postura de seguridad del esquema `public` entero.
--
-- Cada fase comprueba los privilegios de sus tablas nombrándolas una a una, así que una tabla
-- nueva solo queda cubierta si alguien se acuerda de añadirla. Este test no nombra nada donde
-- no hace falta: recorre el catálogo, y una tabla, una columna o una función que llegue sin
-- pasar por aquí lo hace fallar.
--   · toda tabla de `public` tiene RLS activado;
--   · `anon` no tiene ningún privilegio sobre ninguna tabla ni columna de `public`, ni puede
--     ejecutar ninguna función de `public` ni de `private`;
--   · los privilegios de `authenticated` en `public`, de tabla y de columna, son exactamente
--     los de las dos listas de abajo.
--
-- Las listas no se generan: están escritas a mano a partir de los `grant` y `revoke` de las
-- migraciones, y son lo que se quiere, no lo que hay. Quien conceda un privilegio nuevo tiene
-- que añadirlo aquí, y eso es justo lo que se revisa. No cuentan tablas: comparan conjuntos, y
-- la salida de un fallo nombra la tabla, el privilegio y la columna que sobran o que faltan.
--
-- Se pregunta por el privilegio efectivo (`has_table_privilege` y compañía), no por las filas
-- de `information_schema`: así cuenta también lo que llegue por PUBLIC, que `anon` y
-- `authenticated` heredan, y `maintain`, que esas vistas no enseñan.
--
-- Se ejecuta con `pnpm test:db` (`supabase test db` → pg_prove), como postgres. No necesita
-- datos ni cambia nada.
begin;

select plan(9);

-- ── RLS ──────────────────────────────────────────────────────────────────────────────
-- Sin RLS, el `grant` de una tabla la abre entera a cualquier club.
select is_empty(
  $$select c.relname::text collate "default"
    from pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity$$,
  'toda tabla de public tiene RLS activado'
);

-- ── anon ─────────────────────────────────────────────────────────────────────────────
-- El acceso es solo por invitación: sin sesión no se lee ni se escribe nada. Se miran también
-- vistas, vistas materializadas y tablas foráneas, por si un día hay alguna. `maintain` existe
-- como privilegio desde PostgreSQL 17.
select is_empty(
  $$select c.relname::text collate "default", p.privilegio
    from pg_class as c
    cross join unnest(
      array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']
      || case when current_setting('server_version_num')::int >= 170000
           then array['maintain'] else array[]::text[] end
    ) as p (privilegio)
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('anon', c.oid, p.privilegio)$$,
  'anon no tiene ningún privilegio de tabla en public'
);

-- Un `grant select (columna)` no aparece en los privilegios de tabla.
select is_empty(
  $$select c.relname::text collate "default", a.attname::text collate "default", p.privilegio
    from pg_class as c
    join pg_attribute as a
      on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join unnest(array['select', 'insert', 'update', 'references']) as p (privilegio)
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_column_privilege('anon', c.oid, a.attnum, p.privilegio)$$,
  'anon no tiene ningún privilegio de columna en public'
);

-- Una función nace ejecutable por PUBLIC, y en `public` además por `anon` (privilegios por
-- defecto del esquema): cada una necesita su `revoke`. Las de `public` se llaman por la API.
select is_empty(
  $$select f.oid::regprocedure::text collate "default"
    from pg_proc as f
    where f.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and has_function_privilege('anon', f.oid, 'execute')$$,
  'anon no puede ejecutar ninguna función de public ni de private'
);

-- Control positivo de la aserción anterior: la consulta sí ve las funciones de los dos
-- esquemas, y sí distingue quién las ejecuta.
select set_eq(
  $$select distinct n.nspname::text collate "default"
    from pg_proc as f
    join pg_namespace as n on n.oid = f.pronamespace
    where f.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and has_function_privilege('authenticated', f.oid, 'execute')$$,
  $$values ('public'), ('private')$$,
  'control: authenticated sí ejecuta funciones de public y de private'
);

-- `anon` tampoco entra en `private`: aunque una función se quedara sin su `revoke`, no podría
-- nombrarla.
select is(
  has_schema_privilege('anon', 'private', 'usage'), false,
  'anon no tiene acceso al esquema private'
);

-- ── authenticated: privilegios de tabla ──────────────────────────────────────────────
-- Lo que `authenticated` puede hacer sobre la tabla entera. Que una operación esté aquí no
-- quiere decir que cualquiera la haga: decide la política de cada tabla. Sí quiere decir que,
-- si la política falla, no hay nada detrás.
select set_eq(
  $$select c.relname::text collate "default", p.privilegio
    from pg_class as c
    cross join unnest(
      array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']
      || case when current_setting('server_version_num')::int >= 170000
           then array['maintain'] else array[]::text[] end
    ) as p (privilegio)
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege('authenticated', c.oid, p.privilegio)$$,
  $$select t.tabla, p.privilegio
    from (values
      -- Tenancy y estructura deportiva (20261005000100, 20261005000200): solo lectura.
      ('organizations', array['select']),
      ('organization_branding', array['select']),
      ('profiles', array['select']),
      ('memberships', array['select']),
      ('people', array['select']),
      ('seasons', array['select']),
      ('categories', array['select']),
      ('teams', array['select']),
      ('team_staff', array['select']),
      ('team_players', array['select']),
      -- Calendario (20261005000300): los focos y los partidos, solo lectura.
      ('focus_areas', array['select']),
      ('games', array['select']),
      -- Sesiones (20261117000200): el alta y el cambio van por columnas, abajo. Solo se
      -- borran los ítems; ni eventos ni planes.
      ('events', array['select']),
      ('practice_plans', array['select']),
      ('practice_items', array['select', 'delete']),
      -- Metodología (20261020000100, 20261021000100): el cambio va por columnas, abajo. El
      -- `delete` solo tiene política en `principle_points`: en las otras cuatro no encuentra
      -- filas, y así lo dejó escrito su migración.
      ('way_sections', array['select', 'insert', 'delete']),
      ('club_values', array['select', 'insert', 'delete']),
      ('game_principles', array['select', 'insert', 'delete']),
      ('principle_points', array['select', 'insert', 'delete']),
      ('standards', array['select', 'insert', 'delete']),
      -- Biblioteca (20261103000100, 20261103000400): los ejercicios no se borran y su cambio
      -- va por columnas, abajo. Sus hijos se reemplazan en bloque al guardar.
      ('drills', array['select', 'insert']),
      ('drill_coaching_points', array['select', 'insert', 'update', 'delete']),
      ('drill_variants', array['select', 'insert', 'update', 'delete']),
      ('drill_focus_areas', array['select', 'insert', 'update', 'delete']),
      ('drill_principles', array['select', 'insert', 'update', 'delete']),
      ('drill_standards', array['select', 'insert', 'update', 'delete']),
      -- Medios (20261103000200): una ficha se crea al subir y ya.
      ('media_assets', array['select', 'insert']),
      -- Desarrollo (20261215000100): el alta y el cambio van por columnas, abajo. Los
      -- objetivos no se borran (se archivan); las notas sí, de verdad.
      ('player_goals', array['select']),
      ('coach_notes', array['select', 'delete']),
      -- Invitaciones (20270112000100): la cuenta de Auth y la aceptación van por
      -- create_invitation y accept_pending_invitations, security definer. Cancelar y
      -- reenviar son update directos (por columnas, abajo); nunca insert ni delete.
      ('invitations', array['select']),
      -- Consentimientos (20270112000200): dar y revocar van por funciones, security
      -- definer; las tutelas las da de alta solo dirección, por columnas, abajo.
      ('consents', array['select']),
      ('guardianships', array['select', 'insert', 'delete']),
      -- Auditoría y soporte de plataforma (20270112000400): el alta de `audit_log` va por
      -- `record_audit`, security definer, sin grant a authenticated. `platform_admins` no
      -- tiene ninguna política de insert ni update para authenticated ([D14]).
      ('audit_log', array['select']),
      ('platform_admins', array['select'])
    ) as t (tabla, privilegios)
    cross join unnest(t.privilegios) as p (privilegio)$$,
  'los privilegios de tabla de authenticated en public son exactamente los de la lista'
);

-- ── authenticated: privilegios de columna ────────────────────────────────────────────
-- Lo que `authenticated` puede hacer solo sobre algunas columnas: las que tiene sin tener el
-- privilegio de la tabla entera (que ya las daría todas, y está en la lista de arriba). Una
-- columna que no está aquí no la escribe ningún usuario, la deje pasar o no la política: el
-- club, el equipo, el autor, el id y las fechas de una fila.
select set_eq(
  $$select c.relname::text collate "default", p.privilegio, a.attname::text collate "default"
    from pg_class as c
    join pg_attribute as a
      on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    cross join unnest(array['select', 'insert', 'update', 'references']) as p (privilegio)
    where c.relnamespace = 'public'::regnamespace
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_column_privilege('authenticated', c.oid, a.attnum, p.privilegio)
      and not has_table_privilege('authenticated', c.oid, p.privilegio)$$,
  $$select t.tabla, t.privilegio, c.columna
    from (values
      -- Sesiones (20261117000200). Al crear no se eligen el id, el estado ni el autor: los
      -- ponen los valores por defecto. Al cambiar no se tocan el club, el equipo, el tipo, el
      -- evento, el plan ni el autor. `updated_at` y `updated_by` de un plan los fijan sus
      -- triggers, no quien guarda.
      ('events', 'insert',
        array['organization_id', 'team_id', 'kind', 'starts_at', 'ends_at', 'location']),
      ('events', 'update', array['starts_at', 'ends_at', 'location', 'status']),
      ('practice_plans', 'insert',
        array['organization_id', 'team_id', 'event_id', 'title', 'primary_focus_id',
              'secondary_focus_id', 'notes']),
      ('practice_plans', 'update',
        array['title', 'primary_focus_id', 'secondary_focus_id', 'notes', 'status',
              'last_save_id', 'actual_minutes']),
      ('practice_items', 'insert',
        array['organization_id', 'plan_id', 'sort', 'phase', 'drill_id', 'title_override',
              'minutes', 'notes']),
      ('practice_items', 'update',
        array['sort', 'phase', 'drill_id', 'title_override', 'minutes', 'notes',
              'completed', 'actual_minutes']),
      -- Metodología (20261021000100). `updated_at` y `updated_by` de las secciones los escribe
      -- `update_way_section`, que es `security invoker`.
      ('way_sections', 'update',
        array['number', 'title', 'summary', 'body_md', 'content_kind', 'sort', 'status',
              'updated_at', 'updated_by']),
      ('club_values', 'update', array['code', 'title', 'description', 'sort', 'status']),
      ('game_principles', 'update', array['title', 'summary', 'sort', 'status']),
      ('principle_points', 'update', array['text', 'sort']),
      ('standards', 'update', array['number', 'title', 'description', 'sort', 'status']),
      -- Biblioteca (20261103000400): el contenido, el estado y el diagrama.
      ('drills', 'update',
        array['title', 'summary', 'objective', 'setup_md', 'min_players', 'max_players',
              'min_minutes', 'max_minutes', 'min_age', 'max_age', 'equipment', 'video_url',
              'diagram_media_id', 'status']),
      -- Desarrollo (20261215000100). Ni el id, ni el autor, ni las fechas: los pone la base.
      -- Un objetivo nace activo; al cambiar no cambia de club, de jugador ni de equipo.
      -- Partidos (20261215000200): el alta y los cambios van por `create_game`,
      -- `update_game`, `record_game_result` y `cancel_game`, que son `security invoker`.
      ('games', 'insert',
        array['event_id', 'organization_id', 'opponent_name', 'competition_name', 'home_away']),
      ('games', 'update',
        array['opponent_name', 'competition_name', 'home_away', 'score_for', 'score_against',
              'opponent_notes']),
      ('player_goals', 'insert',
        array['organization_id', 'person_id', 'team_id', 'title', 'description', 'focus_area_id',
              'standard_id']),
      ('player_goals', 'update',
        array['title', 'description', 'focus_area_id', 'standard_id', 'status']),
      ('coach_notes', 'insert',
        array['organization_id', 'person_id', 'team_id', 'body', 'visibility']),
      ('coach_notes', 'update', array['body', 'visibility']),
      -- Invitaciones (20270112000100): cancelar pone cancelled_at; reenviar, un token y una
      -- caducidad nuevos. Ninguna otra columna, y RLS exige que siga pendiente para las dos.
      ('invitations', 'update', array['cancelled_at', 'token_hash', 'expires_at'])
    ) as t (tabla, privilegio, columnas)
    cross join unnest(t.columnas) as c (columna)$$,
  'los privilegios de columna de authenticated en public son exactamente los de la lista'
);

-- ── authenticated: qué funciones ejecuta (C27) ───────────────────────────────────────
-- Lo que quedaba abierto: antes solo se comprobaba que `anon` no ejecuta nada (arriba). Esta
-- lista, escrita a mano como las dos de tabla y columna, es exactamente qué puede llamar
-- `authenticated` en `public` y en `private`, de cualquier fase. Una función nueva sin su
-- `grant` no aparece aquí y no la ejecuta nadie; una de más la delata esta lista.
select set_eq(
  $$select n.nspname::text collate "default", p.proname::text collate "default",
      pg_get_function_identity_arguments(p.oid)::text collate "default"
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and has_function_privilege('authenticated', p.oid, 'execute')$$,
  $$values
    -- Reglas de visibilidad y gestión (Fase 1-6): quien ve o gestiona qué fila.
    ('private', 'has_org_role', 'org uuid, roles org_role[]'),
    ('private', 'is_member', 'org uuid'),
    ('private', 'is_team_staff', 'team uuid'),
    ('private', 'is_on_roster', 'team uuid, person uuid'),
    ('private', 'can_see_person', 'person uuid'),
    ('private', 'can_manage_team', 'team uuid'),
    ('private', 'can_see_plan', 'plan uuid'),
    ('private', 'can_edit_plan', 'plan uuid'),
    ('private', 'can_see_drill', 'drill uuid'),
    ('private', 'can_edit_drill', 'drill uuid'),
    ('private', 'is_linkable_standard', 'standard uuid'),
    ('private', 'can_see_media', 'media uuid'),
    ('private', 'storage_org_id', 'path text'),
    ('private', 'can_upload_drill_media', 'path text'),
    ('private', 'can_see_drill_media', 'path text'),
    ('private', 'can_see_person_media', 'path text'),
    ('private', 'check_game_input',
      'p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_opponent text, p_competition text, p_home_away text, p_location text'),
    ('private', 'f_search_key', 'text'),
    ('private', 'f_unaccent', 'text'),
    ('private', 'open_game', 'p_event uuid'),
    ('private', 'open_session', 'p_event uuid'),
    -- Auditoría y soporte de plataforma (Fase 7, Task 4): la lee la política de audit_log.
    ('private', 'is_platform_admin', ''),
    -- Metodología, biblioteca, sesiones, partidos y desarrollo (Fase 1-6): las escrituras
    -- que no van por una política directa de tabla.
    ('public', 'reorder_methodology', 'p_org uuid, p_kind text, p_ids uuid[]'),
    ('public', 'update_way_section',
      'p_id uuid, p_expected_updated_at timestamp with time zone, p_title text, p_summary text, p_content_kind text, p_body_md text'),
    ('public', 'save_game_principle', 'p_id uuid, p_title text, p_summary text, p_points text[]'),
    ('public', 'save_drill',
      'p_org uuid, p_drill uuid, p_expected_updated_at timestamp with time zone, p_payload jsonb'),
    ('public', 'search_drills',
      'p_org uuid, p_q text, p_focus text, p_principle text, p_age integer, p_players integer, p_minutes integer'),
    ('public', 'create_practice_session',
      'p_team uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_title text, p_primary_focus uuid, p_secondary_focus uuid, p_location text'),
    ('public', 'update_practice_session',
      'p_event uuid, p_expected_updated_at timestamp with time zone, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_title text, p_primary_focus uuid, p_secondary_focus uuid, p_location text, p_notes text'),
    ('public', 'duplicate_practice', 'p_event uuid, p_starts_at timestamp with time zone'),
    ('public', 'save_practice_items',
      'p_plan uuid, p_expected_updated_at timestamp with time zone, p_items jsonb, p_save_id uuid'),
    ('public', 'record_live_progress',
      'p_event uuid, p_items jsonb, p_finished boolean, p_actual_minutes integer'),
    ('public', 'create_game',
      'p_team uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_opponent text, p_competition text, p_home_away text, p_location text'),
    ('public', 'update_game',
      'p_event uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_opponent text, p_competition text, p_home_away text, p_location text, p_opponent_notes text'),
    ('public', 'record_game_result', 'p_event uuid, p_score_for integer, p_score_against integer'),
    ('public', 'cancel_game', 'p_event uuid'),
    -- Invitaciones y consentimientos (Fase 7, Task 1 y 2): la cuenta de Auth, la aceptación,
    -- y dar o revocar un consentimiento, siempre por función, nunca por insert/update directo.
    ('public', 'create_invitation',
      'p_org uuid, p_email text, p_role org_role, p_token_hash text, p_expires_at timestamp with time zone, p_team uuid, p_staff_role staff_role, p_person uuid, p_first_name text, p_last_name text'),
    ('public', 'accept_pending_invitations', ''),
    ('public', 'grant_terms_consent', 'p_org uuid'),
    ('public', 'grant_image_consent', 'p_person uuid'),
    ('public', 'revoke_image_consent', 'p_consent uuid')
  $$,
  'authenticated ejecuta exactamente estas funciones de public y de private'
);

select * from finish();

rollback;
