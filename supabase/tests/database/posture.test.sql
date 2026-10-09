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

select plan(8);

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
      ('coach_notes', array['select', 'delete'])
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
      ('coach_notes', 'update', array['body', 'visibility'])
    ) as t (tabla, privilegio, columnas)
    cross join unnest(t.columnas) as c (columna)$$,
  'los privilegios de columna de authenticated en public son exactamente los de la lista'
);

select * from finish();

rollback;
