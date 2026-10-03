-- Tenancy: organizaciones, marca, perfiles y membresías.
--
-- RLS es la garantía de aislamiento entre clubes: sin política no hay acceso.
-- En esta fase solo hay lectura para `authenticated`; las escrituras de usuario llegan
-- con su fase, su política y su `grant`. `service_role` (seed y scripts, nunca `src/`)
-- sí lee y escribe.
--
-- Los privilegios de cada tabla se fijan aquí de forma explícita, sin depender de los
-- privilegios por defecto del esquema `public`, que cambian según la versión de la CLI
-- y `api.auto_expose_new_tables`.

-- ── Esquema private ──────────────────────────────────────────────────────────────────
-- Funciones de apoyo para RLS y triggers. No se expone por la API (`[api] schemas`).
create schema private;

grant usage on schema private to authenticated;

-- ── Tipos ────────────────────────────────────────────────────────────────────────────
create type public.org_role as enum ('admin', 'coach', 'player', 'guardian');

-- ── Tablas ───────────────────────────────────────────────────────────────────────────
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  timezone text not null default 'Europe/Madrid',
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Los cuatro colores acaban en un atributo `style`. El CHECK es un control de seguridad:
-- solo entra `#rrggbb` en minúsculas, nada que pueda inyectar CSS.
create table public.organization_branding (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  display_name text not null,
  wordmark_sub text,
  short_name text not null check (char_length(short_name) between 2 and 4),
  way_name text not null,
  tagline text,
  color_accent text not null check (color_accent ~ '^#[0-9a-f]{6}$'),
  color_accent_pressed text not null check (color_accent_pressed ~ '^#[0-9a-f]{6}$'),
  color_on_accent text not null check (color_on_accent ~ '^#[0-9a-f]{6}$'),
  color_accent_soft text not null check (color_accent_soft ~ '^#[0-9a-f]{6}$'),
  terminology jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'es',
  created_at timestamptz not null default now()
);

-- `person_id` enlaza la cuenta con su persona en el club; la clave foránea compuesta
-- `(organization_id, person_id)` llega con la tabla `people`.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null,
  person_id uuid,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_organization_id_idx on public.memberships (organization_id);

-- ── Funciones de RLS ─────────────────────────────────────────────────────────────────
-- `security definer`: leen `memberships` como su propietario, sin pasar por RLS. Por eso
-- la política de `memberships` puede apoyarse en ellas sin recursión. Solo responden por
-- el usuario de la sesión (`auth.uid()`) y solo cuentan las membresías activas.
create function private.is_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as m
    where m.organization_id = is_member.org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function private.has_org_role(org uuid, roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships as m
    where m.organization_id = has_org_role.org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (has_org_role.roles)
  );
$$;

revoke all on function private.is_member(uuid) from public, anon;
revoke all on function private.has_org_role(uuid, public.org_role[]) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.org_role[]) to authenticated;

-- ── Triggers ─────────────────────────────────────────────────────────────────────────
-- Cada usuario de Auth recibe su perfil. Lo dispara el servicio de Auth al crear el
-- usuario; `security definer` para poder escribir en `public.profiles`.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

create trigger organization_branding_set_updated_at
  before update on public.organization_branding
  for each row execute function private.set_updated_at();

-- ── RLS y privilegios ────────────────────────────────────────────────────────────────
alter table public.organizations enable row level security;
alter table public.organization_branding enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_branding from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.memberships from anon, authenticated;

grant select on table public.organizations to authenticated;
grant select on table public.organization_branding to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.memberships to authenticated;

grant select, insert, update, delete on table public.organizations to service_role;
grant select, insert, update, delete on table public.organization_branding to service_role;
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.memberships to service_role;

-- ── Políticas (solo lectura en esta fase) ────────────────────────────────────────────
create policy organizations_select_member
  on public.organizations
  for select
  to authenticated
  using (private.is_member(id));

create policy organization_branding_select_member
  on public.organization_branding
  for select
  to authenticated
  using (private.is_member(organization_id));

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy memberships_select_own_or_admin
  on public.memberships
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.has_org_role(organization_id, array['admin']::public.org_role[])
  );
