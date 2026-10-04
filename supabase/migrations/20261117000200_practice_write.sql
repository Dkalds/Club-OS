-- Escritura de las sesiones de entrenamiento.
--
-- Hasta aquí `events`, `practice_plans` y `practice_items` solo se leían. Esta migración abre
-- su escritura a quien gestiona el equipo (`can_manage_team`, de la migración anterior: su
-- cuerpo técnico y el admin de su club) y a nadie más, y solo lo justo:
--
--   1. Solo entrenos. Un partido no se crea ni se cambia: los partidos llegan en su fase.
--   2. Solo sesiones abiertas. Un entreno `done` o `cancelled` es histórico: se lee, pero ni
--      él, ni su plan, ni sus ítems se cambian, no recibe un plan que no tuviera y no se
--      reabre. Cerrarlo sí es de quien gestiona el equipo.
--   3. Solo planes de equipo. Las plantillas privadas (planes sin equipo) siguen siendo de
--      solo lectura para los usuarios.
--   4. Ni los eventos ni los planes se borran: no hay `grant delete` ni política que lo abra.
--      Los ítems sí, porque guardar un plan es dejar su lista tal como llega.
--   5. Una fila no cambia de club, de equipo, de tipo, de evento, de plan ni de autor.
--
-- Son dos capas, y cada una cierra lo que la otra no puede. Las políticas deciden sobre qué
-- filas se escribe. Los privilegios, que aquí son siempre por columna, deciden qué se puede
-- tocar de ellas: una política de `update` pide gestionar el equipo de la fila (`using`) y el
-- de destino (`with check`), y quien gestiona dos equipos (un admin, o quien está en dos
-- cuerpos técnicos) cumple las dos. Sin la segunda capa podría pasar un entreno o un plan de un
-- equipo a otro. Es lo mismo que `20261021000100_methodology_integrity.sql` hizo con el club.
--
-- `service_role` (el seed y los e2e, nunca `src/`) conserva sus privilegios de tabla.

-- ── Función de RLS ───────────────────────────────────────────────────────────────────
-- Como `can_manage_team`: `security definer`, lee las tablas como su propietario sin pasar
-- por RLS, y solo responde por el usuario de la sesión (`auth.uid()`), a través de su
-- membresía ACTIVA en el club del equipo. Una membresía en otro club, o revocada, no cuenta.

-- ¿Puede el usuario cambiar este plan y sus ítems? Sí si el plan tiene equipo, el usuario
-- gestiona ese equipo y el evento del plan, cuando lo tiene, sigue programado. Un plan de
-- equipo sin evento (sin fecha todavía) lo edita quien gestiona el equipo. Un plan sin equipo
-- (una plantilla privada) no lo edita nadie, tampoco quien lo creó. Y un plan que no existe,
-- uno ajeno y uno cerrado responden lo mismo: `false`.
create function private.can_edit_plan(plan uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.practice_plans as pp
    where pp.id = can_edit_plan.plan
      and pp.team_id is not null
      and private.can_manage_team(pp.team_id)
      and (
        pp.event_id is null
        or exists (
          select 1
          from public.events as e
          where e.organization_id = pp.organization_id
            and e.id = pp.event_id
            and e.status = 'scheduled'
        )
      )
  );
$$;

revoke all on function private.can_edit_plan(uuid) from public, anon;
grant execute on function private.can_edit_plan(uuid) to authenticated;

-- ── Privilegios, por columna ─────────────────────────────────────────────────────────
-- `authenticated` ya tenía `select` sobre las tres tablas y nada más: no hay nada que revocar
-- antes. Recibe `insert` y `update` columna a columna, nunca sobre la tabla entera. Una
-- columna nueva nace sin privilegios: quien la añada la concede aquí si los usuarios la
-- escriben y la apunta en la lista de `posture.test.sql`, que falla mientras no esté.
--
-- Al crear no se eligen el `id`, el estado ni el autor, que salen de sus valores por defecto:
-- un evento nace `scheduled`, y un plan nace `draft`, de tipo `practice` y a nombre de quien lo
-- crea (`created_by` y `updated_by`). Al cambiar no se tocan el club, el equipo, el tipo, el
-- evento, el plan ni el autor.

-- De un evento se cambian las horas, el lugar y el estado (cerrarlo: `done` o `cancelled`).
grant insert (organization_id, team_id, kind, starts_at, ends_at, location)
  on table public.events to authenticated;
grant update (starts_at, ends_at, location, status)
  on table public.events to authenticated;

-- `updated_by` lo escriben las funciones de guardado (en la migración siguiente), que son
-- `security invoker`. `updated_at` no está: lo mueve el trigger, y es el testigo de la copia
-- obsoleta. Tampoco `is_template` ni `actual_minutes`, que nadie escribe todavía.
grant insert (
  organization_id, team_id, event_id, title, primary_focus_id, secondary_focus_id, notes
) on table public.practice_plans to authenticated;
grant update (title, primary_focus_id, secondary_focus_id, notes, status, updated_by)
  on table public.practice_plans to authenticated;

-- `completed` y `actual_minutes` (lo que pasó en la pista) no están: llegan con su fase.
grant insert (organization_id, plan_id, sort, phase, drill_id, title_override, minutes, notes)
  on table public.practice_items to authenticated;
grant update (sort, phase, drill_id, title_override, minutes, notes)
  on table public.practice_items to authenticated;
grant delete on table public.practice_items to authenticated;

-- ── Políticas de events ──────────────────────────────────────────────────────────────
-- Se crea un entreno programado en un equipo que se gestiona. El club de la fila no hace
-- falta mirarlo: la clave foránea compuesta `(organization_id, team_id)` lo ata al del equipo,
-- y una fila que diga ser de otro club es un 23503.
create policy events_insert_practice_managed
  on public.events
  for insert
  to authenticated
  with check (
    kind = 'practice'
    and status = 'scheduled'
    and private.can_manage_team(team_id)
  );

-- `using` mira la fila tal como está: un entreno, todavía programado, de un equipo que se
-- gestiona. `with check` mira la fila resultante y no pide `scheduled`: así se cierra una
-- sesión (`done` o `cancelled`), y una vez cerrada ya no cumple `using` y nadie la reabre.
create policy events_update_practice_managed
  on public.events
  for update
  to authenticated
  using (
    kind = 'practice'
    and status = 'scheduled'
    and private.can_manage_team(team_id)
  )
  with check (
    kind = 'practice'
    and private.can_manage_team(team_id)
  );

-- ── Políticas de practice_plans ──────────────────────────────────────────────────────
-- Se crea un plan de un equipo que se gestiona; sin equipo (una plantilla privada), no. Que el
-- evento sea un entreno de ese mismo equipo lo exige la clave foránea `practice_plans_event_fkey`.
--
-- Y si el plan lleva evento, el evento sigue programado: una sesión cerrada tampoco recibe un
-- plan que no tenía. Es la misma regla que `can_edit_plan`, que aquí no sirve porque el plan
-- todavía no existe. La subconsulta pasa por la política de lectura de `events` (admin o cuerpo
-- técnico del equipo), que no lee `practice_plans`: no hay recursión, y quien gestiona el
-- equipo del plan ve sus eventos. Por eso mismo el evento tiene que existir antes de la
-- sentencia que inserta el plan: en una sola sentencia con el alta del evento, no lo vería.
--
-- La política de lectura (`can_see_plan(id)`) busca el plan por su id. Con `insert … returning`
-- PostgreSQL la aplica a la fila nueva antes de escribirla, cuando todavía no está en la tabla:
-- el alta fallaría con 42501 (lo cuenta `20261103000100_drills.sql`). Quien inserte un plan con
-- la sesión de un usuario lo hace sin `returning` y lo lee después; `event_id` es único.
create policy practice_plans_insert_managed
  on public.practice_plans
  for insert
  to authenticated
  with check (
    team_id is not null
    and private.can_manage_team(team_id)
    and (
      event_id is null
      or exists (
        select 1
        from public.events as e
        where e.organization_id = practice_plans.organization_id
          and e.id = practice_plans.event_id
          and e.status = 'scheduled'
      )
    )
  );

create policy practice_plans_update_editable
  on public.practice_plans
  for update
  to authenticated
  using (private.can_edit_plan(id))
  with check (
    team_id is not null
    and private.can_manage_team(team_id)
  );

-- ── Políticas de practice_items ──────────────────────────────────────────────────────
-- Los ítems siguen a su plan: se añaden, se cambian y se borran si el plan se puede editar. La
-- clave foránea compuesta garantiza que el `organization_id` del ítem es el del plan, y la del
-- ejercicio, que es de ese mismo club.
create policy practice_items_insert_editable
  on public.practice_items
  for insert
  to authenticated
  with check (private.can_edit_plan(plan_id));

create policy practice_items_update_editable
  on public.practice_items
  for update
  to authenticated
  using (private.can_edit_plan(plan_id))
  with check (private.can_edit_plan(plan_id));

create policy practice_items_delete_editable
  on public.practice_items
  for delete
  to authenticated
  using (private.can_edit_plan(plan_id));
