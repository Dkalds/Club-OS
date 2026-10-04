-- Biblioteca de ejercicios: guardado atómico de un ejercicio con todos sus hijos.
--
-- `public.save_drill` crea un borrador o guarda un ejercicio existente, y reemplaza sus puntos
-- de coaching, variantes, objetivos, principios y Standards en la misma transacción. Las
-- Server Actions la invocan por RPC. Antes de ella, esta migración cierra dos huecos de la
-- tabla `drills` que la función no debe tapar por su cuenta:
--   · el diagrama de un ejercicio tiene que vivir en su propia carpeta de Storage, y lo exige
--     la tabla (un trigger), no solo la función;
--   · el cliente no reescribe el club, el autor ni las fechas de un ejercicio: el privilegio
--     `update` de `authenticated` pasa a ser por columnas.

-- ── El diagrama vive en la carpeta del propio ejercicio ──────────────────────────────
-- La política de `update` de `drills` no mira `diagram_media_id`, y la clave foránea compuesta
-- solo exige que la ficha sea del mismo club. Con eso, un entrenador podía apuntar su borrador
-- al medio sin ejercicio de otra persona del club con un `update` directo y, al ser entonces el
-- diagrama de un ejercicio que ve, ganar visibilidad de esa ficha. Lo que se exige es lo que
-- ya hacen las políticas de Storage: la ficha es del club del ejercicio y su ruta empieza por
-- `org/<club>/drills/<ejercicio>/`.
--
-- Es un trigger `after`, no `before`, y la búsqueda se acota al club de la fila. Las dos cosas
-- por lo mismo: la función es `security definer` (tiene que leer la ficha aunque quien guarda
-- no la vea, justo el caso que se rechaza) y, si respondiera antes que RLS o por fichas de otros
-- clubes, cualquiera con sesión sabría qué ids de ficha existen y en qué carpeta están, con un
-- `insert` que RLS acabaría rechazando. Un trigger `before` corre antes de la comprobación
-- `with check` de la política, y un `after` corre después: quien no puede escribir la fila
-- recibe el 42501 de RLS, sea cual sea el id de ficha. Y una ficha de otro club no se ve: se
-- comporta igual que una que no existe, y la responde la clave foránea compuesta con su
-- 23503. Lo único que contesta el trigger, entonces, es lo que ve alguien que sí puede
-- escribir la fila: una ficha de su club que no es de la carpeta del ejercicio, 22023.
--
-- No hace falta mirar el club de la ficha aparte: la búsqueda ya está acotada a él, y la ruta
-- de una ficha empieza por su club (CHECK de `media_assets`). La clave foránea
-- (`RI_ConstraintTrigger_*`) se dispara antes que este trigger por el orden alfabético de los
-- nombres, pero el resultado no depende de ese orden: sin el acotado, una ficha de otro club
-- sería un 22023 si el trigger llegara primero.
--
-- Se evalúa en cada insert o update: es una lectura por clave primaria, y la regla vale
-- también para quien escribe con la clave de servicio. Devuelve `null` porque el valor de un
-- trigger `after` se ignora; si alguien lo vuelve `before`, ese `null` descartaría la fila.
create function private.check_drill_diagram()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media_path text;
begin
  if new.diagram_media_id is null then
    return null;
  end if;

  select ma.path
  into v_media_path
  from public.media_assets as ma
  where ma.id = new.diagram_media_id
    and ma.organization_id = new.organization_id;

  -- Sin ficha en el club del ejercicio no hay nada que comprobar: la clave foránea compuesta
  -- rechaza el id con su 23503, exista o no en otro club.
  if not found then
    return null;
  end if;

  if not starts_with(
    v_media_path,
    'org/' || new.organization_id::text || '/drills/' || new.id::text || '/'
  ) then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  return null;
end;
$$;

-- Solo la ejecuta el trigger: al dispararlo no hace falta `execute`.
revoke all on function private.check_drill_diagram() from public, anon, authenticated;

create trigger drills_check_diagram
  after insert or update on public.drills
  for each row execute function private.check_drill_diagram();

-- ── Columnas que un cliente no reescribe ─────────────────────────────────────────────
-- Con `update` sobre toda la tabla, quien es entrenador o admin en dos clubes podía mover un
-- ejercicio suyo al otro cambiando `organization_id` (la política lo deja pasar si es admin
-- del club de destino) y hacerlo desaparecer del primero, cuando los ejercicios no se borran.
-- Tampoco se cambian a mano el autor, las fechas ni el id; `updated_at` lo fija el trigger y
-- `search` se genera sola. `authenticated` recibe `update` solo sobre el contenido, el estado
-- (publicar y archivar, que RLS reserva al admin) y el diagrama. Una columna de contenido
-- nueva en `drills` tiene que añadirse aquí. `service_role` conserva el privilegio de tabla.
revoke update on table public.drills from authenticated;

grant update (
  title, summary, objective, setup_md,
  min_players, max_players, min_minutes, max_minutes, min_age, max_age,
  equipment, video_url, diagram_media_id, status
) on table public.drills to authenticated;

-- ── save_drill ───────────────────────────────────────────────────────────────────────
-- Crea (`p_drill` null) o guarda un ejercicio y devuelve su `id` y su `updated_at` nuevo, que
-- es la copia que tendrá quien siga editando. Todos los parámetros menos `p_org` tienen
-- `default null`, sin cambiar su orden ni su tipo: así los tipos generados para el cliente los
-- marcan opcionales y crear es llamarla con solo `p_org` y `p_payload`. Sin `p_payload` es una
-- entrada inválida, como un payload nulo.
--
-- Es `security invoker`: se ejecuta con el usuario de la sesión y RLS decide, sin que la
-- función repita permisos. Crear exige ser admin o entrenador del club (la política de alta);
-- guardar exige poder editar el ejercicio: el admin, todos; un entrenador, sus borradores.
-- Quien no puede, y quien guarda con un `p_org` que no es el club del ejercicio, recibe el
-- mismo `NOT_FOUND`: `select … for update` no le devuelve la fila. `p_org` solo acota qué
-- club se mira; no autoriza nada, y los hijos nuevos llevan el club del ejercicio.
--
-- Los errores son parte del contrato con las Server Actions, que los traducen por SQLSTATE y
-- mensaje:
--   · `NOT_FOUND`  (P0002): no se ve, no se puede editar o no es de `p_org`;
--   · `STALE_COPY` (P0001): `p_expected_updated_at` ya no es el `updated_at` del ejercicio;
--   · `INVALID`    (22023): entrada que la función rechaza antes de escribir, o un diagrama
--     que no es de la carpeta del ejercicio (lo dice el trigger de arriba).
-- Los checks y claves foráneas de las tablas (23514, 23502, 23503…) se dejan pasar: un
-- Standard de otro club es un 23503. Una función que falla no escribe nada: es una sola
-- transacción, y los hijos anteriores se quedan como estaban.
--
-- La copia se compara exacta, en microsegundos y tal cual la devolvió el guardado anterior. El
-- `update` de `drills` se hace siempre, aunque solo hayan cambiado los hijos: `updated_at`
-- (que fija el trigger con `clock_timestamp()`) es la copia de todo el ejercicio, hijos
-- incluidos. Al crear, la copia esperada no cuenta.
--
-- `p_payload` es un objeto con las claves `title, summary, objective, setup_md, min_players,
-- max_players, min_minutes, max_minutes, min_age, max_age, equipment, video_url,
-- diagram_media_id, focus_area_ids, principle_ids, standard_ids, coaching_points
-- [{text, is_key}]` y `variants [{title, description}]`. Una clave ausente o null vale null
-- (`equipment` y las listas, lista vacía): guardar es dejar el ejercicio tal como dice el
-- payload, así que quien no cambia el diagrama reenvía el actual. Las listas son el estado
-- completo, no un añadido: una lista vacía borra los vínculos, y puntos y variantes quedan
-- con `sort` igual a su posición, desde 0. Un id repetido en una lista es un solo vínculo. Las
-- claves `status` y `created_by` no se leen nunca: publicar y archivar es del admin, con un
-- `update` de `status`, y el autor no cambia. Al crear tampoco se lee `diagram_media_id`: el
-- diagrama vive en la carpeta del ejercicio, que no existe hasta que existe su id.
create function public.save_drill(
  p_org uuid,
  p_drill uuid default null,
  p_expected_updated_at timestamptz default null,
  p_payload jsonb default null
)
returns table (id uuid, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Las listas del payload; ausentes o `null` valen lista vacía. Se leen antes de validar, y
  -- leer una clave de un valor que no es un objeto da null, no un error.
  v_equipment jsonb := coalesce(nullif(p_payload -> 'equipment', 'null'::jsonb), '[]'::jsonb);
  v_focus jsonb := coalesce(nullif(p_payload -> 'focus_area_ids', 'null'::jsonb), '[]'::jsonb);
  v_principles jsonb := coalesce(nullif(p_payload -> 'principle_ids', 'null'::jsonb), '[]'::jsonb);
  v_standards jsonb := coalesce(nullif(p_payload -> 'standard_ids', 'null'::jsonb), '[]'::jsonb);
  v_points jsonb := coalesce(nullif(p_payload -> 'coaching_points', 'null'::jsonb), '[]'::jsonb);
  v_variants jsonb := coalesce(nullif(p_payload -> 'variants', 'null'::jsonb), '[]'::jsonb);
  v_id uuid;
  v_current timestamptz;
  v_updated_at timestamptz;
begin
  -- Un `null` en el club o en el payload es entrada inválida, como un payload que no es un
  -- objeto o una lista que no es una lista. Un ejercicio lleva como mucho 3 puntos clave.
  if p_org is null
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(v_equipment) <> 'array'
     or jsonb_typeof(v_focus) <> 'array'
     or jsonb_typeof(v_principles) <> 'array'
     or jsonb_typeof(v_standards) <> 'array'
     or jsonb_typeof(v_points) <> 'array'
     or jsonb_typeof(v_variants) <> 'array' then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(v_points) as kp (item)
    where (kp.item ->> 'is_key')::boolean
  ) > 3 then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  if p_drill is null then
    -- `status` y `created_by` toman sus valores por defecto: un borrador del usuario. El
    -- `returning` pasa por la política de lectura, que está escrita para que la fila nueva
    -- la cumpla.
    insert into public.drills as d (
      organization_id, title, summary, objective, setup_md,
      min_players, max_players, min_minutes, max_minutes, min_age, max_age,
      equipment, video_url
    )
    values (
      p_org,
      p_payload ->> 'title',
      p_payload ->> 'summary',
      p_payload ->> 'objective',
      p_payload ->> 'setup_md',
      (p_payload ->> 'min_players')::smallint,
      (p_payload ->> 'max_players')::smallint,
      (p_payload ->> 'min_minutes')::smallint,
      (p_payload ->> 'max_minutes')::smallint,
      (p_payload ->> 'min_age')::smallint,
      (p_payload ->> 'max_age')::smallint,
      array(select jsonb_array_elements_text(v_equipment)),
      p_payload ->> 'video_url'
    )
    returning d.id, d.updated_at into v_id, v_updated_at;
  else
    -- La fila se busca por `id` y por club, y se bloquea hasta el final de la transacción: un
    -- segundo guardado simultáneo espera, y al despertar ve el `updated_at` nuevo. RLS filtra
    -- aquí lo que quien guarda no puede editar.
    select d.updated_at
    into v_current
    from public.drills as d
    where d.id = p_drill
      and d.organization_id = p_org
    for update;

    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_current is distinct from p_expected_updated_at then
      raise exception 'STALE_COPY' using errcode = 'P0001';
    end if;

    update public.drills as d
    set title = p_payload ->> 'title',
        summary = p_payload ->> 'summary',
        objective = p_payload ->> 'objective',
        setup_md = p_payload ->> 'setup_md',
        min_players = (p_payload ->> 'min_players')::smallint,
        max_players = (p_payload ->> 'max_players')::smallint,
        min_minutes = (p_payload ->> 'min_minutes')::smallint,
        max_minutes = (p_payload ->> 'max_minutes')::smallint,
        min_age = (p_payload ->> 'min_age')::smallint,
        max_age = (p_payload ->> 'max_age')::smallint,
        equipment = array(select jsonb_array_elements_text(v_equipment)),
        video_url = p_payload ->> 'video_url',
        diagram_media_id = (p_payload ->> 'diagram_media_id')::uuid
    where d.id = p_drill
      and d.organization_id = p_org
    returning d.id, d.updated_at into v_id, v_updated_at;
  end if;

  -- Los hijos se reemplazan en bloque: fuera los anteriores (al crear no hay), dentro los del
  -- payload. Llevan el club del ejercicio, y sus claves foráneas compuestas rechazan un
  -- objetivo, un principio o un Standard de otro club.
  delete from public.drill_coaching_points as c
  where c.organization_id = p_org and c.drill_id = v_id;
  delete from public.drill_variants as v
  where v.organization_id = p_org and v.drill_id = v_id;
  delete from public.drill_focus_areas as l
  where l.organization_id = p_org and l.drill_id = v_id;
  delete from public.drill_principles as l
  where l.organization_id = p_org and l.drill_id = v_id;
  delete from public.drill_standards as l
  where l.organization_id = p_org and l.drill_id = v_id;

  insert into public.drill_coaching_points (organization_id, drill_id, text, is_key, sort)
  select p_org, v_id, kp.item ->> 'text',
         coalesce((kp.item ->> 'is_key')::boolean, false), (kp.pos - 1)::smallint
  from jsonb_array_elements(v_points) with ordinality as kp (item, pos);

  insert into public.drill_variants (organization_id, drill_id, title, description, sort)
  select p_org, v_id, vr.item ->> 'title', vr.item ->> 'description', (vr.pos - 1)::smallint
  from jsonb_array_elements(v_variants) with ordinality as vr (item, pos);

  insert into public.drill_focus_areas (organization_id, drill_id, focus_area_id)
  select distinct p_org, v_id, f.link_id::uuid
  from jsonb_array_elements_text(v_focus) as f (link_id);

  insert into public.drill_principles (organization_id, drill_id, principle_id)
  select distinct p_org, v_id, g.link_id::uuid
  from jsonb_array_elements_text(v_principles) as g (link_id);

  insert into public.drill_standards (organization_id, drill_id, standard_id)
  select distinct p_org, v_id, s.link_id::uuid
  from jsonb_array_elements_text(v_standards) as s (link_id);

  return query select v_id, v_updated_at;
end;
$$;

-- Solo `authenticated`, como las demás funciones de escritura: Postgres da `execute` a PUBLIC
-- en toda función nueva y Supabase lo da además a anon, authenticated y service_role en
-- `public`; se quita lo que sobra. Guardar es de una sesión de usuario: los permisos salen de
-- `auth.uid()`, y la clave de servicio se salta RLS y guardaría cualquier ejercicio.
revoke all on function public.save_drill(uuid, uuid, timestamptz, jsonb)
  from public, anon, service_role;
grant execute on function public.save_drill(uuid, uuid, timestamptz, jsonb)
  to authenticated;
