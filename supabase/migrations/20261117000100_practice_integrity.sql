-- Integridad de los planes de sesión y una sola regla de cuerpo técnico.
--
-- Hasta aquí `events`, `practice_plans` y `practice_items` solo se leían. La Fase 4 abre su
-- escritura al cuerpo técnico (en la migración siguiente), y antes hay que cerrar lo que
-- ninguna política puede cerrar por sí sola:
--
--   1. «Cuerpo técnico de un equipo» estaba escrito tres veces (`is_team_staff`,
--      `can_see_person` y `can_see_plan`). Queda una sola definición, `is_team_staff`, y
--      las otras dos se reescriben sobre ella. `can_manage_team` es la regla que usarán las
--      políticas de escritura: admin del club del equipo o su cuerpo técnico.
--   2. Quien creó un plan de equipo lo seguía viendo tras dejar su cuerpo técnico.
--      Decisión: deja de verlo. Los planes de un equipo son de su cuerpo técnico, no de
--      quien los escribió.
--   3. El esquema aceptaba un plan de un equipo sobre el evento de otro, y un plan sobre un
--      partido. `event_id` es único: con escritura de usuarios, el cuerpo técnico de otro
--      equipo podría ocupar un entreno ajeno. El plan queda atado al equipo y al tipo de su
--      evento con una clave foránea de cuatro columnas.
--   4. Borrar la cuenta de quien creó un plan fallaba con 23503.
--   5. Los textos no tenían tope, y un ítem podía no llevar ni ejercicio ni título.
--
-- Aquí no se abre ninguna escritura: no hay `grant` ni política nuevos para los usuarios.
-- Los datos que ya existen (los del seed) cumplen todas las restricciones: cada plan es del
-- equipo de su evento, cuelga de un entreno y sus ítems llevan título. Si una fila no las
-- cumpliera, la migración falla en vez de corregirla en silencio.

-- ── Funciones de RLS ─────────────────────────────────────────────────────────────────
-- Como las anteriores: `security definer`, leen las tablas como su propietario sin pasar
-- por RLS, y solo responden por el usuario de la sesión (`auth.uid()`), a través de su
-- membresía ACTIVA en el club del equipo, del plan o de la persona. Una membresía en otro
-- club, o revocada, no cuenta.
--
-- «Estar en el cuerpo técnico de un equipo» se decide en un solo sitio: `is_team_staff`
-- (20261005000200), que no cambia. Las tres de abajo la llaman en vez de repetirla.

-- ¿Puede el usuario gestionar este equipo, es decir, escribir sus sesiones? Sí si es admin
-- del club del equipo o está en su cuerpo técnico. Un equipo que no existe no lo gestiona
-- nadie.
create function private.can_manage_team(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teams as t
    where t.id = can_manage_team.team
      and (
        private.has_org_role(t.organization_id, array['admin']::public.org_role[])
        or private.is_team_staff(t.id)
      )
  );
$$;

-- ¿Puede el usuario ver este plan? Sí si es admin del club del plan; si el plan es de un
-- equipo y el usuario está en su cuerpo técnico; o si el plan no tiene equipo (una
-- plantilla privada) y lo creó él. Haber creado un plan de equipo ya no basta: quien deja
-- el cuerpo técnico deja de ver los planes del equipo, también los que escribió.
create or replace function private.can_see_plan(plan uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.practice_plans as pp
    join public.memberships as m
      on m.organization_id = pp.organization_id
    where pp.id = can_see_plan.plan
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role = 'admin'
        or (pp.team_id is not null and private.is_team_staff(pp.team_id))
        or (pp.team_id is null and pp.created_by = m.user_id)
      )
  );
$$;

-- ¿Puede el usuario ver a esta persona? Lo mismo que antes: sí si es admin del club de la
-- persona, si es su propia persona, o si la persona está en el cuerpo técnico o en la
-- plantilla de un equipo donde el usuario es staff. Cambia cómo se escribe, no lo que
-- responde.
create or replace function private.can_see_person(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people as p
    join public.memberships as m
      on m.organization_id = p.organization_id
    where p.id = can_see_person.person
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and (
        m.role = 'admin'
        or m.person_id = p.id
        or exists (
          select 1
          from public.team_staff as ts
          where ts.organization_id = p.organization_id
            and ts.person_id = p.id
            and private.is_team_staff(ts.team_id)
        )
        or exists (
          select 1
          from public.team_players as tp
          where tp.organization_id = p.organization_id
            and tp.person_id = p.id
            and private.is_team_staff(tp.team_id)
        )
      )
  );
$$;

-- `create or replace` conserva los privilegios de las dos que ya existían; se repiten para
-- que los de las tres se lean aquí.
revoke all on function private.can_manage_team(uuid) from public, anon;
revoke all on function private.can_see_plan(uuid) from public, anon;
revoke all on function private.can_see_person(uuid) from public, anon;
grant execute on function private.can_manage_team(uuid) to authenticated;
grant execute on function private.can_see_plan(uuid) to authenticated;
grant execute on function private.can_see_person(uuid) to authenticated;

-- ── Únicos ───────────────────────────────────────────────────────────────────────────
-- El destino de la clave foránea nueva de los planes: el equipo y el tipo del evento junto
-- a su club y su id. `id` ya es único por sí solo, así que este único no restringe nada:
-- solo deja que otra tabla apunte a las cuatro columnas a la vez.
alter table public.events
  add constraint events_organization_id_team_id_kind_id_key
    unique (organization_id, team_id, kind, id);

-- ── Columnas ─────────────────────────────────────────────────────────────────────────
-- `updated_at` es el testigo de la concurrencia optimista del constructor de sesiones, como
-- en `drills`: quien edita envía el que leyó. `updated_by` es quien guardó por última vez:
-- toma por defecto el usuario de la sesión y pasa a null si se borra su cuenta. En las
-- filas que ya existen, `updated_at` es el instante de esta migración y `updated_by` queda
-- a null.
--
-- `event_kind` vale siempre `practice`. No guarda información: existe para que la clave
-- foránea de abajo pueda exigir que el evento de un plan sea un entreno.
alter table public.practice_plans
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  add column event_kind public.event_kind not null default 'practice'
    check (event_kind = 'practice');

-- ── Claves foráneas ──────────────────────────────────────────────────────────────────
-- Borrar una cuenta no falla por los planes que creó: el plan se queda y `created_by` pasa
-- a null, como en `drills`. Una plantilla privada sin autor solo la ven los admins.
alter table public.practice_plans
  drop constraint practice_plans_created_by_fkey,
  add constraint practice_plans_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

-- El plan va atado al equipo y al tipo de su evento. La clave anterior solo comprobaba que
-- el evento era del mismo club; esta, que además es del mismo equipo y que es un entreno.
-- Un plan no ocupa el evento de otro equipo ni cuelga de un partido, ni al crearlo ni
-- después: tampoco cambian el equipo del plan, ni el equipo o el tipo de un evento que
-- tiene plan.
--
-- Se sustituye, no se añade: entre `practice_plans` y `events` tiene que haber una sola
-- clave foránea. PostgREST resuelve con ella los planes embebidos en sus eventos (Inicio),
-- y con dos el embed sería ambiguo.
alter table public.practice_plans
  drop constraint practice_plans_organization_id_event_id_fkey,
  add constraint practice_plans_event_fkey
    foreign key (organization_id, team_id, event_kind, event_id)
    references public.events (organization_id, team_id, kind, id);

-- ── Restricciones ────────────────────────────────────────────────────────────────────
-- Con `team_id` a null la clave foránea de arriba no se comprueba (MATCH SIMPLE), y un plan
-- sin equipo ocuparía un evento sin ser de nadie: un plan con evento tiene que tener
-- equipo. El resto: lo que se escribe a mano tiene tope, y el foco secundario no repite el
-- principal.
alter table public.practice_plans
  add constraint practice_plans_event_team_check
    check (event_id is null or team_id is not null),
  add constraint practice_plans_title_check
    check (char_length(title) between 1 and 80),
  add constraint practice_plans_notes_check
    check (notes is null or char_length(notes) <= 2000),
  add constraint practice_plans_secondary_focus_check
    check (secondary_focus_id is null or secondary_focus_id <> primary_focus_id);

-- Un ítem es un ejercicio de la biblioteca o un bloque libre con su título: sin ninguno de
-- los dos no hay nada que enseñar.
alter table public.practice_items
  add constraint practice_items_title_override_check
    check (title_override is null or char_length(title_override) between 1 and 80),
  add constraint practice_items_phase_check
    check (phase is null or char_length(phase) <= 40),
  add constraint practice_items_notes_check
    check (notes is null or char_length(notes) <= 500),
  add constraint practice_items_drill_or_title_check
    check (drill_id is not null or title_override is not null);

alter table public.events
  add constraint events_location_check
    check (location is null or char_length(location) <= 80);

-- ── updated_at ───────────────────────────────────────────────────────────────────────
-- Avanza en cada `update` del plan. `private.set_updated_at` usa `clock_timestamp()`
-- (20261103000100): el valor cambia aunque el `update` ocurra en la misma transacción que
-- el anterior, donde `now()` valdría lo mismo.
create trigger practice_plans_set_updated_at
  before update on public.practice_plans
  for each row execute function private.set_updated_at();
