-- Metodología: lo que las políticas de la migración anterior no cierran por sí solas.
--
--   1. Una fila no cambia de club. Las políticas de `update` piden ser admin del club de la
--      fila (`using`) y del club de destino (`with check`): quien administra dos clubes
--      cumple las dos y podía pasar una sección, un valor o un Standard de uno a otro por la
--      API, sin pasar por ninguna acción. El comentario de `20261020000100_methodology.sql`
--      que dice que el `with check` lo impide vale solo para quien administra un club.
--   2. El número es único por club también en las secciones, y en las dos tablas se
--      comprueba al acabar la sentencia, no fila a fila.

-- ── 1. `update` por columna ──────────────────────────────────────────────────────────
-- `authenticated` deja de tener `update` sobre la tabla entera y lo recibe columna a columna:
-- solo las que la app cambia. Fuera quedan `organization_id` (ninguna política puede
-- cerrarlo: la decide quién llama, no qué columna toca), `id`, `created_at`, el slug de
-- secciones y principios (su dirección y su ancla: no cambian nunca) y el principio de un
-- punto. Una columna nueva nace sin `update`: quien la añada la concede aquí si se edita.
--
-- Las políticas siguen igual y siguen decidiendo sobre qué filas: esto solo acota qué se
-- puede cambiar de ellas. `service_role` (el seed) conserva el `update` de la tabla entera.
revoke update on table public.way_sections from authenticated;
revoke update on table public.club_values from authenticated;
revoke update on table public.game_principles from authenticated;
revoke update on table public.principle_points from authenticated;
revoke update on table public.standards from authenticated;

-- `updated_at` y `updated_by` los escribe `update_way_section`, que es `security invoker`.
grant update (
  number, title, summary, body_md, content_kind, sort, status, updated_at, updated_by
) on table public.way_sections to authenticated;
grant update (code, title, description, sort, status) on table public.club_values to authenticated;
grant update (title, summary, sort, status) on table public.game_principles to authenticated;
grant update (text, sort) on table public.principle_points to authenticated;
grant update (number, title, description, sort, status) on table public.standards to authenticated;

-- ── 2. El número, único por club y diferible ─────────────────────────────────────────
-- El número de una sección es su posición en la lista. El alta lo calcula leyendo antes las
-- secciones del club: dos altas a la vez calculaban el mismo y quedaban dos secciones con el
-- mismo número. Con el único, la segunda recibe un 23505 y la acción vuelve a calcular.
--
-- Diferible e inmediato: se comprueba al acabar cada sentencia. Un único normal se comprueba
-- fila a fila, y eso rompería lo que renumera varias filas a la vez: `reorder_methodology`
-- (toda la lista de un club en un `update`) y el seed (que devuelve su número a todas sus
-- filas en un `upsert`). Por lo segundo se rehace también el de `standards`: con dos
-- Standards intercambiados por dirección, el seed fallaba al devolver el primero a su sitio.
-- Un único diferible no puede ser el árbitro de un `on conflict`; nadie lo usa así.

-- Antes de añadirlo, cada sección recibe su posición real (el orden de las lecturas: `sort`,
-- `created_at`, `id`), por si ya hay números repetidos.
update public.way_sections as s
set number = p.position
from (
  select
    w.id,
    row_number() over (
      partition by w.organization_id
      order by w.sort, w.created_at, w.id
    ) as position
  from public.way_sections as w
) as p
where s.id = p.id
  and s.number is distinct from p.position;

alter table public.way_sections
  add constraint way_sections_organization_id_number_key
  unique (organization_id, number) deferrable initially immediate;

alter table public.standards
  drop constraint standards_organization_id_number_key,
  add constraint standards_organization_id_number_key
  unique (organization_id, number) deferrable initially immediate;
