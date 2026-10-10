-- Consentimientos (Fase 7, decisión 9 de la spec y memoria del propietario confirmada
-- 2026-10-10): términos generales (cualquier usuario, primer login) e imagen de menores
-- (tutores, vía `guardianships`), cada uno con su texto por club y su propia copia por
-- autor, sin tabla de versiones ([D9]: cambiar el texto no toca lo ya consentido).

alter table public.organization_branding
  add column terms_text text not null
    default 'Al entrar aceptas las condiciones de uso de este club.',
  add column image_consent_text text not null
    default 'Autorizo el uso de la imagen de mi hijo o hija en fotos y vídeos del club.';

-- ── guardianships ─────────────────────────────────────────────────────────────────────
create table public.guardianships (
  organization_id uuid not null references public.organizations (id),
  guardian_person_id uuid not null,
  child_person_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (guardian_person_id, child_person_id),
  check (guardian_person_id <> child_person_id),
  foreign key (organization_id, guardian_person_id) references public.people (organization_id, id),
  foreign key (organization_id, child_person_id) references public.people (organization_id, id)
);

create index guardianships_child_person_id_idx on public.guardianships (child_person_id);

alter table public.guardianships enable row level security;

-- Dirección, y el propio tutor sobre sus tutelas: lo necesita el primer login ([D8]) para
-- saber si ofrece el paso de imagen.
create policy guardianships_select_managed_or_own
  on public.guardianships
  for select
  to authenticated
  using (
    private.has_org_role(organization_id, array['admin']::public.org_role[])
    or exists (
      select 1
      from public.memberships as m
      where m.organization_id = guardianships.organization_id
        and m.person_id = guardianships.guardian_person_id
        and m.user_id = (select auth.uid())
        and m.status = 'active'
    )
  );

create policy guardianships_write_managed
  on public.guardianships
  for all
  to authenticated
  using (private.has_org_role(organization_id, array['admin']::public.org_role[]))
  with check (private.has_org_role(organization_id, array['admin']::public.org_role[]));

revoke all on table public.guardianships from anon, authenticated;
grant select, insert, delete on public.guardianships to authenticated;

-- ── consents ─────────────────────────────────────────────────────────────────────────
-- `person_id`: a quién se refiere. En `terms`, a nadie en concreto (son los términos de la
-- cuenta que entra, no de una ficha): null. En `image`, al menor cuya foto se consiente.
-- `granted_by`: quien lo dio, siempre (en `terms`, la misma persona que entra).
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  kind text not null check (kind in ('terms', 'image')),
  person_id uuid,
  granted_by uuid not null references auth.users (id),
  body_snapshot text not null check (char_length(body_snapshot) > 0),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((kind = 'image') = (person_id is not null)),
  foreign key (organization_id, person_id) references public.people (organization_id, id)
);

-- Una sola vez por club y por cuenta ([D7]): no hay un segundo «al entrar aceptas...».
create unique index consents_one_terms_per_account_idx
  on public.consents (organization_id, granted_by)
  where kind = 'terms';

create index consents_person_id_idx on public.consents (person_id) where kind = 'image';

alter table public.consents enable row level security;

create policy consents_select_own_or_managed
  on public.consents
  for select
  to authenticated
  using (
    granted_by = (select auth.uid())
    or private.has_org_role(organization_id, array['admin']::public.org_role[])
  );

revoke all on table public.consents from anon, authenticated;
grant select on public.consents to authenticated;

-- ── grant_terms_consent ──────────────────────────────────────────────────────────────
-- `security definer`: toma el texto vigente del club directamente (RLS de
-- `organization_branding` ya lo deja leer a cualquier miembro, pero la copia tiene que ser
-- exacta e inmediata, sin depender de una segunda llamada del cliente).
create function public.grant_terms_consent(p_org uuid)
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

  return v_consent;
end;
$$;

revoke all on function public.grant_terms_consent(uuid) from public, anon;
grant execute on function public.grant_terms_consent(uuid) to authenticated;

-- ── grant_image_consent ──────────────────────────────────────────────────────────────
-- Solo quien tiene una `guardianship` activa sobre `p_person`. `security definer`, como
-- `grant_terms_consent`: así no hace falta ninguna política de escritura en `consents` (la
-- comprobación de quién puede dar el consentimiento la hace la función, no RLS).
create function public.grant_image_consent(p_person uuid)
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

  return v_consent;
end;
$$;

revoke all on function public.grant_image_consent(uuid) from public, anon;
grant execute on function public.grant_image_consent(uuid) to authenticated;

-- ── revoke_image_consent ─────────────────────────────────────────────────────────────
-- [D9]: en el MVP solo dirección revoca (no hay cuentas de familia con interfaz propia).
-- `security definer` por el mismo motivo: sin política de `update` en `consents`.
create function public.revoke_image_consent(p_consent uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.consents
  set revoked_at = now()
  where id = p_consent
    and kind = 'image'
    and revoked_at is null
    and private.has_org_role(organization_id, array['admin']::public.org_role[]);

  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.revoke_image_consent(uuid) from public, anon;
grant execute on function public.revoke_image_consent(uuid) to authenticated;
