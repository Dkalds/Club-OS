-- Auditoría y soporte de plataforma (Fase 7, Task 4).
--
-- `audit_log` guarda quién, qué acción, sobre qué fila y cuándo: nunca el contenido (ni el
-- cuerpo de una nota, ni un texto de consentimiento, ni un email completo). No se instrumenta
-- todo el sistema, solo lo que esta fase añade y toca algo sensible: invitar, aceptar, dar o
-- revocar un consentimiento.
--
-- `platform_admins` es soporte de plataforma, no un apartado de Gestión ([D14]): no hay
-- interfaz en el MVP, se puebla a mano con la clave de servicio. Sin política de escritura
-- para `authenticated`; cada cuenta solo se lee a sí misma.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  actor_id uuid not null references auth.users (id),
  action text not null check (char_length(action) > 0 and char_length(action) <= 100),
  entity_table text not null check (char_length(entity_table) > 0 and char_length(entity_table) <= 100),
  entity_id uuid not null,
  created_at timestamptz not null default now()
);

create index audit_log_organization_id_created_at_idx
  on public.audit_log (organization_id, created_at desc);

alter table public.audit_log enable row level security;

create table public.platform_admins (
  user_id uuid primary key references auth.users (id),
  granted_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create policy platform_admins_select_own
  on public.platform_admins
  for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated;

-- ¿Es la cuenta de la sesión soporte de plataforma? `security definer`: lo usa la política de
-- `audit_log`, que de otro modo tendría que repetir la subconsulta en cada fila.
create function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins where user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

create policy audit_log_select_platform_admin
  on public.audit_log
  for select
  to authenticated
  using (private.is_platform_admin());

revoke all on table public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

-- Quién, qué, sobre qué fila y cuándo. La llaman las funciones de esta fase que cambian algo
-- sensible, nunca el cliente directamente: sin `grant` a `authenticated`, solo a quien ya
-- tiene privilegios de propietario dentro de una función `security definer`.
create function private.record_audit(p_org uuid, p_action text, p_entity_table text, p_entity_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (organization_id, actor_id, action, entity_table, entity_id)
  values (p_org, (select auth.uid()), p_action, p_entity_table, p_entity_id);
$$;

revoke all on function private.record_audit(uuid, text, text, uuid) from public, anon, authenticated;

-- ── Retroinstrumentación de la Task 1 (invitaciones) ─────────────────────────────────
create or replace function public.create_invitation(
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

  perform private.record_audit(p_org, 'invite.create', 'invitations', v_invitation);

  return v_invitation;
end;
$$;

create or replace function public.accept_pending_invitations()
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

    perform private.record_audit(
      v_invitation.organization_id, 'invite.accept', 'invitations', v_invitation.id
    );

    v_slugs := v_slugs || v_invitation.slug;
  end loop;

  return v_slugs;
end;
$$;

-- ── Retroinstrumentación de la Task 2 (consentimientos) ──────────────────────────────
create or replace function public.grant_terms_consent(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text;
  v_consent uuid;
begin
  select terms_text into v_text
  from public.organization_branding
  where organization_id = p_org;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.consents (organization_id, kind, granted_by, body_snapshot)
  values (p_org, 'terms', (select auth.uid()), v_text)
  returning id into v_consent;

  perform private.record_audit(p_org, 'consent.grant_terms', 'consents', v_consent);

  return v_consent;
end;
$$;

create or replace function public.grant_image_consent(p_person uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_text text;
  v_consent uuid;
begin
  select g.organization_id into v_org
  from public.guardianships as g
  where g.child_person_id = p_person
    and exists (
      select 1
      from public.memberships as m
      where m.organization_id = g.organization_id
        and m.person_id = g.guardian_person_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    );

  if not found then
    raise exception 'CONSENT_GRANTOR' using errcode = 'P0001';
  end if;

  select image_consent_text into v_text
  from public.organization_branding
  where organization_id = v_org;

  insert into public.consents (organization_id, kind, person_id, granted_by, body_snapshot)
  values (v_org, 'image', p_person, (select auth.uid()), v_text)
  returning id into v_consent;

  perform private.record_audit(v_org, 'consent.grant_image', 'consents', v_consent);

  return v_consent;
end;
$$;

create or replace function public.revoke_image_consent(p_consent uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  update public.consents
  set revoked_at = now()
  where id = p_consent
    and kind = 'image'
    and revoked_at is null
    and private.has_org_role(organization_id, array['admin']::public.org_role[])
  returning organization_id into v_org;

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  perform private.record_audit(v_org, 'consent.revoke_image', 'consents', p_consent);
end;
$$;
