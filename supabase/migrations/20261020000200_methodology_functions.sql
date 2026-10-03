-- Metodología: escrituras atómicas.
--
-- Tres operaciones que no se resuelven con un insert o un update suelto: guardar una
-- sección sin pisar lo que otro admin guardó antes, reordenar un conjunto de filas y
-- reemplazar los puntos de un principio. Cada una es una función de `public`, que las
-- Server Actions invocan por RPC.
--
-- Son `security invoker`: se ejecutan con el usuario de la sesión y RLS se aplica dentro,
-- como en cualquier otra escritura. Solo el admin del club escribe, y las funciones lo
-- comprueban de forma explícita antes de tocar nada: así, una fila que RLS no deja ver (el
-- admin de otro club) y una fila visible de la que quien llama no es admin (un coach del
-- mismo club) dan el mismo `NOT_FOUND`, y quien llama no sabe distinguirlos. Nunca un
-- `STALE_COPY` a quien no puede escribir.
--
-- Los errores son parte del contrato con las Server Actions, que los traducen por SQLSTATE
-- y mensaje:
--   · `NOT_FOUND`  (P0002): no se ve o no es admin;
--   · `STALE_COPY` (P0001): la copia de quien guarda ya no es la última;
--   · `INVALID`    (22023): entrada que la función rechaza antes de escribir.
-- Los checks de las tablas (23514, 23502…) no se traducen aquí: se dejan pasar. Una función
-- que falla no escribe nada: es una sola transacción.

-- ── update_way_section ───────────────────────────────────────────────────────────────
-- Guarda el contenido de una sección y devuelve su `updated_at` nuevo, que es la copia que
-- tendrá quien siga editando. Si `p_expected_updated_at` no es el `updated_at` de la fila,
-- alguien guardó antes: `STALE_COPY` y la fila queda con lo que guardó el otro. El valor
-- llega con microsegundos, tal cual lo devolvió el guardado anterior, y se compara exacto.
-- `now()` es el inicio de la transacción, y cada guardado por RPC es una transacción propia:
-- el `updated_at` de un guardado siempre es posterior al del anterior.
--
-- Es el único sitio que cambia `updated_at` (la tabla no tiene trigger); `number`, `slug`,
-- `status` y `sort` no se tocan aquí.
create function public.update_way_section(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_summary text,
  p_content_kind text,
  p_body_md text
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated_at timestamptz;
begin
  -- Primero el permiso: un coach que ve la fila (publicada) no debe enterarse de si su copia
  -- está al día. El `update` de abajo no distingue «no es admin» de «copia obsoleta».
  if not exists (
    select 1
    from public.way_sections as s
    where s.id = p_id
      and private.has_org_role(s.organization_id, array['admin']::public.org_role[])
  ) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.way_sections as s
  set title = p_title,
      summary = p_summary,
      content_kind = p_content_kind,
      body_md = p_body_md,
      updated_at = now(),
      updated_by = (select auth.uid())
  where s.id = p_id
    and s.updated_at = p_expected_updated_at
  returning s.updated_at into v_updated_at;

  if not found then
    raise exception 'STALE_COPY' using errcode = 'P0001';
  end if;

  return v_updated_at;
end;
$$;

-- ── reorder_methodology ──────────────────────────────────────────────────────────────
-- Renumera de golpe las filas de un club en una de las cuatro tablas con estado. `p_ids` es
-- la lista completa en el orden nuevo: tiene que ser exactamente el conjunto de filas del
-- club, cada una una vez (borradores incluidos, que el admin ve). Si falta alguna, sobra
-- otra o hay una repetida, alguien añadió o cambió algo mientras se reordenaba: `STALE_COPY`.
--
-- `sort` pasa a ser la posición en la lista (desde 1). En las secciones `number` también:
-- es la posición en la gestión del club. El número de un Standard lo elige la dirección y
-- no se toca. `updated_at` queda como está: reordenar no invalida la copia de quien edita.
--
-- Una rama estática por tabla: nada de SQL dinámico con el tipo que llega de fuera.
create function public.reorder_methodology(
  p_org uuid,
  p_kind text,
  p_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid[];
begin
  -- Un `null` en el tipo o en la lista es una entrada inválida: ni se toma una lista null por
  -- vacía ni se deja que una comparación con null pase en silencio.
  if p_kind is null
     or p_kind not in ('way_sections', 'club_values', 'game_principles', 'standards')
     or p_ids is null then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  if not private.has_org_role(p_org, array['admin']::public.org_role[]) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Las filas del club, ordenadas por id para compararlas con la lista como conjuntos.
  v_current := case p_kind
    when 'way_sections' then array(
      select t.id from public.way_sections as t where t.organization_id = p_org order by t.id)
    when 'club_values' then array(
      select t.id from public.club_values as t where t.organization_id = p_org order by t.id)
    when 'game_principles' then array(
      select t.id from public.game_principles as t where t.organization_id = p_org order by t.id)
    else array(
      select t.id from public.standards as t where t.organization_id = p_org order by t.id)
  end;

  -- Un id repetido o un null en la lista no cuadran con las filas del club, que no los
  -- tienen: `STALE_COPY`, como un id que falta o uno de otro club.
  if v_current is distinct from array(select i from unnest(p_ids) as i order by i) then
    raise exception 'STALE_COPY' using errcode = 'P0001';
  end if;

  if p_kind = 'way_sections' then
    update public.way_sections as t
    set sort = o.pos::int,
        number = o.pos::smallint
    from unnest(p_ids) with ordinality as o (id, pos)
    where t.organization_id = p_org
      and t.id = o.id;
  elsif p_kind = 'club_values' then
    update public.club_values as t
    set sort = o.pos::int
    from unnest(p_ids) with ordinality as o (id, pos)
    where t.organization_id = p_org
      and t.id = o.id;
  elsif p_kind = 'game_principles' then
    update public.game_principles as t
    set sort = o.pos::int
    from unnest(p_ids) with ordinality as o (id, pos)
    where t.organization_id = p_org
      and t.id = o.id;
  else
    update public.standards as t
    set sort = o.pos::int
    from unnest(p_ids) with ordinality as o (id, pos)
    where t.organization_id = p_org
      and t.id = o.id;
  end if;
end;
$$;

-- ── save_game_principle ──────────────────────────────────────────────────────────────
-- Guarda un principio de juego: cambia su título y su resumen y reemplaza todos sus puntos
-- por `p_points`, en ese orden (`sort` desde 1). Un principio lleva como mucho 12 puntos;
-- una lista vacía lo deja sin ellos. Los puntos nuevos llevan el `organization_id` del
-- principio, no uno que venga de fuera. El `status` y el orden del principio no se tocan.
create function public.save_game_principle(
  p_id uuid,
  p_title text,
  p_summary text,
  p_points text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select gp.organization_id
  into v_org
  from public.game_principles as gp
  where gp.id = p_id
    and private.has_org_role(gp.organization_id, array['admin']::public.org_role[]);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Una lista null no es una lista vacía: no borra los puntos.
  if p_points is null or cardinality(p_points) > 12 then
    raise exception 'INVALID' using errcode = '22023';
  end if;

  update public.game_principles as gp
  set title = p_title,
      summary = p_summary
  where gp.id = p_id;

  delete from public.principle_points as pp
  where pp.organization_id = v_org
    and pp.principle_id = p_id;

  insert into public.principle_points (organization_id, principle_id, text, sort)
  select v_org, p_id, pt.point, pt.pos::int
  from unnest(p_points) with ordinality as pt (point, pos);
end;
$$;

-- ── Privilegios ──────────────────────────────────────────────────────────────────────
-- Solo `authenticated`. Postgres da `execute` a PUBLIC en toda función nueva y Supabase lo
-- da además a anon, authenticated y service_role en `public`: se quita lo que sobra.
-- Ninguna de las tres sirve sin sesión de usuario (los permisos salen de `auth.uid()`).
revoke all on function public.update_way_section(uuid, timestamptz, text, text, text, text)
  from public, anon, service_role;
revoke all on function public.reorder_methodology(uuid, text, uuid[])
  from public, anon, service_role;
revoke all on function public.save_game_principle(uuid, text, text, text[])
  from public, anon, service_role;

grant execute on function public.update_way_section(uuid, timestamptz, text, text, text, text)
  to authenticated;
grant execute on function public.reorder_methodology(uuid, text, uuid[])
  to authenticated;
grant execute on function public.save_game_principle(uuid, text, text, text[])
  to authenticated;
