-- El editor de pizarra: quien puede editar un ejercicio guarda su pizarra.
--
-- `drills.board` existe desde `20270202000100_drill_board.sql`, pero hasta ahora nadie la
-- escribía con la sesión de un usuario. Aquí:
--
--   1. `grant update (board)`: lo que la app escribe se concede (C17, C27). Quién puede cambiar
--      la fila lo sigue diciendo la política `drills_update_editable`: la dirección, y quien
--      entrena en un borrador propio.
--   2. `save_drill_board`: guarda (o quita) la pizarra de un ejercicio con la copia esperada.
--
-- La forma entera de la pizarra (fichas, pasos, movimientos) la valida la app con `parseBoard`
-- antes de llamar, y la vuelve a validar quien la lee. La base mantiene lo suyo: el `check`
-- `drills_board_check` (objeto, versión 1, 32 kB).

grant update (board) on table public.drills to authenticated;

-- ── public.save_drill_board ─────────────────────────────────────────────────────────────
-- Deja la pizarra del ejercicio como llega; con `p_board` ausente o null, la quita. Devuelve el
-- `updated_at` nuevo del ejercicio: la pizarra comparte copia con el resto de la ficha, así que
-- un formulario abierto en otro móvil recibe `STALE_COPY` al guardar, y no la pisa.
--
-- Reglas (C26):
--   1. NOT_FOUND si el ejercicio no existe, no se ve o no se puede editar.
--   2. STALE_COPY si `p_expected_updated_at` ya no es el del ejercicio.
--   3. INVALID si la pizarra no pasa el `check`.
create function public.save_drill_board(
  p_drill uuid,
  p_expected_updated_at timestamptz,
  p_board jsonb default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current    timestamptz;
  v_updated_at timestamptz;
begin
  select d.updated_at
  into v_current
  from public.drills as d
  where d.id = p_drill
    and private.can_edit_drill(d.id);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_current is distinct from p_expected_updated_at then
    raise exception 'STALE_COPY' using errcode = 'P0001';
  end if;

  -- Un `null` de JSON («null» como valor) es lo mismo que no traer pizarra.
  begin
    update public.drills as d
    set board = nullif(p_board, 'null'::jsonb)
    where d.id = p_drill
    returning d.updated_at into v_updated_at;
  exception
    when check_violation then
      raise exception 'INVALID' using errcode = '22023';
  end;

  return v_updated_at;
end;
$$;

revoke all on function public.save_drill_board(uuid, timestamptz, jsonb) from public, anon, service_role;
grant execute on function public.save_drill_board(uuid, timestamptz, jsonb) to authenticated;
