-- Invitaciones (Fase 7, contrato «Fase 7 · … — produce» y regla 6 de CLAUDE.md: acceso solo
-- por invitación).
--
-- La cuenta de Auth se crea al INVITAR (`create_invitation`), no al aceptar: así el acceso
-- posterior usa el `signInWithOtp({ shouldCreateUser: false })` de siempre (`enable_signup =
-- false` del proyecto no lo afecta, porque no pasa por el autoservicio de Auth) y nadie
-- necesita la clave de servicio en `src/` para dar de alta una cuenta (regla 2). Insertar en
-- `auth.users` directamente, sin pasar por la API de Auth, es lo mismo que ya hace
-- `tests.create_user()` del seed.
--
-- `accept_pending_invitations()` es quien de verdad acepta: la llama `/select-club` en cada
-- entrada, identificando a quien llama por `auth.uid()` (nunca por un dato que mande el
-- cliente). Es `security definer` porque crea la primera membresía de alguien que, hasta ese
-- momento, no tiene ninguna fila en el club al que se une: ninguna política de RLS corriente
-- se la daría.
--
-- `before_user_created` (el hook de Postgres de Supabase Auth, `config.toml`) no se dispara
-- nunca para `create_invitation` (un `insert` directo no pasa por GoTrue): es un cierre de
-- seguridad para cualquier otro camino de alta, no el mecanismo principal.

-- ── invitations ──────────────────────────────────────────────────────────────────────
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  email text not null check (
    email = lower(email)
    and char_length(email) <= 254
    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  -- Solo hacen falta si no se invita a una persona ya dada de alta (person_id): el nombre con
  -- el que se crea la suya al aceptar ([D2]).
  first_name text check (first_name is null or char_length(first_name) between 1 and 80),
  last_name text check (last_name is null or char_length(last_name) between 1 and 80),
  role public.org_role not null check (role in ('admin', 'coach')),
  team_id uuid,
  staff_role public.staff_role,
  person_id uuid,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Un coach siempre lleva equipo y rol en él; un admin, ni uno ni otro.
  check ((role = 'coach') = (team_id is not null)),
  check ((role = 'coach') = (staff_role is not null)),
  -- Un coach nuevo necesita saber a quién crear: por persona ya dada de alta, o por nombre.
  check (role = 'admin' or person_id is not null or (first_name is not null and last_name is not null)),
  foreign key (organization_id, team_id) references public.teams (organization_id, id),
  foreign key (organization_id, person_id) references public.people (organization_id, id)
);

-- Como mucho una invitación pendiente por email y por club ([D3]): cancelada o aceptada, no
-- cuenta, y un nuevo intento para el mismo email entra sin chocar.
create unique index invitations_one_pending_per_email_idx
  on public.invitations (organization_id, email)
  where accepted_at is null and cancelled_at is null;

create index invitations_team_id_idx on public.invitations (team_id);
create index invitations_person_id_idx on public.invitations (person_id);

alter table public.invitations enable row level security;

create policy invitations_select_managed
  on public.invitations
  for select
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]));

-- Cancelar (`cancelled_at`) y reenviar (`token_hash`, `expires_at`) son el mismo `update`:
-- solo mientras sigue pendiente, y solo dirección de ese club.
create policy invitations_update_managed
  on public.invitations
  for update
  to authenticated
  using (
    accepted_at is null
    and private.has_org_role(organization_id, array['admin']::public.org_role[])
  )
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

revoke all on table public.invitations from anon, authenticated;
grant select on public.invitations to authenticated;
grant update (cancelled_at, token_hash, expires_at) on public.invitations to authenticated;

-- ── create_invitation ────────────────────────────────────────────────────────────────
-- Crea la cuenta de Auth si el email no tenía (reutiliza la que hubiera, de otra invitación o
-- de otro club) y la fila de la invitación. NOT_FOUND si quien llama no es dirección de
-- `p_org`, o si `p_team` no es un equipo de `p_org`. El resto de validaciones las hace el
-- CHECK de la tabla (22023/23514, INVALID por `fromDbError`) o el índice único (23505).
create function public.create_invitation(
  p_org uuid,
  p_email text,
  p_role public.org_role,
  p_token_hash text,
  p_expires_at timestamptz,
  p_team uuid default null,
  p_staff_role public.staff_role default null,
  p_person uuid default null,
  p_first_name text default null,
  p_last_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_invitation uuid;
begin
  if not private.has_org_role(p_org, array['admin']::public.org_role[]) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_team is not null and not exists (
    select 1 from public.teams as t where t.id = p_team and t.organization_id = p_org
  ) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not exists (select 1 from auth.users where email = v_email) then
    insert into auth.users (
      id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at
    )
    values (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
      'authenticated', v_email, now(), now(), now()
    );
  end if;

  insert into public.invitations (
    organization_id, email, first_name, last_name, role, team_id, staff_role, person_id,
    token_hash, expires_at, invited_by
  )
  values (
    p_org, v_email, p_first_name, p_last_name, p_role, p_team, p_staff_role, p_person,
    p_token_hash, p_expires_at, (select auth.uid())
  )
  returning id into v_invitation;

  return v_invitation;
end;
$$;

revoke all on function public.create_invitation(
  uuid, text, public.org_role, text, timestamptz, uuid, public.staff_role, uuid, text, text
) from public, anon;
grant execute on function public.create_invitation(
  uuid, text, public.org_role, text, timestamptz, uuid, public.staff_role, uuid, text, text
) to authenticated;

-- ── accept_pending_invitations ───────────────────────────────────────────────────────
-- Acepta, para el email de quien llama (`auth.uid()`, nunca un dato del cliente), toda
-- invitación pendiente y vigente: crea la persona si hacía falta, la membresía y, si es
-- coach, su fila de team_staff. Devuelve los slugs de los clubes nuevos. Sin invitaciones,
-- `{}`: no es un error, es el camino normal de quien ya estaba dentro.
create function public.accept_pending_invitations()
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_invitation record;
  v_person uuid;
  v_slugs text[] := array[]::text[];
begin
  select email into v_email from auth.users where id = (select auth.uid());
  if v_email is null then
    return v_slugs;
  end if;

  for v_invitation in
    select i.*, o.slug
    from public.invitations as i
    join public.organizations as o on o.id = i.organization_id
    where i.email = v_email
      and i.accepted_at is null
      and i.cancelled_at is null
      and i.expires_at > now()
    order by i.created_at
  loop
    if v_invitation.person_id is not null then
      v_person := v_invitation.person_id;
    elsif v_invitation.first_name is not null then
      insert into public.people (organization_id, first_name, last_name)
      values (v_invitation.organization_id, v_invitation.first_name, v_invitation.last_name)
      returning id into v_person;
    else
      -- Un admin invitado sin persona ni nombre: la membresía nace sin persona, como ya
      -- admite el esquema (`memberships.person_id` es opcional).
      v_person := null;
    end if;

    insert into public.memberships (organization_id, user_id, role, person_id)
    values (v_invitation.organization_id, (select auth.uid()), v_invitation.role, v_person)
    on conflict (organization_id, user_id)
    do update set status = 'active', role = excluded.role, person_id = excluded.person_id;

    if v_invitation.role = 'coach' then
      insert into public.team_staff (organization_id, team_id, person_id, staff_role)
      values (v_invitation.organization_id, v_invitation.team_id, v_person, v_invitation.staff_role)
      on conflict (team_id, person_id) do update set staff_role = excluded.staff_role;
    end if;

    update public.invitations set accepted_at = now() where id = v_invitation.id;

    v_slugs := v_slugs || v_invitation.slug;
  end loop;

  return v_slugs;
end;
$$;

revoke all on function public.accept_pending_invitations() from public, anon;
grant execute on function public.accept_pending_invitations() to authenticated;

-- ── before_user_created ──────────────────────────────────────────────────────────────
-- Hook de Postgres de Supabase Auth: se registra en config.toml (local) y en el panel del
-- proyecto (remoto; `supabase db push` no lo sincroniza). Contrato propio de la hook, no el
-- de ActionError: esto no lo ve nunca la app, solo quien intente crear una cuenta sin pasar
-- por `create_invitation`.
create function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_email text := lower(event -> 'user' ->> 'email');
begin
  if exists (
    select 1
    from public.invitations as i
    where i.email = v_email
      and i.accepted_at is null
      and i.cancelled_at is null
      and i.expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object('message', 'Esta cuenta no tiene una invitación pendiente.', 'http_code', 403)
  );
end;
$$;

revoke all on function private.before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.before_user_created(jsonb) to supabase_auth_admin;
