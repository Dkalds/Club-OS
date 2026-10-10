-- Integraciones externas (Fase 7, Task 5): esqueleto vacío, decisión 10 de la spec. El core
-- nunca llama a un proveedor; un conector (fuera de este esquema, `src/modules/integrations`)
-- deja datos crudos en `external_records`, un normalizador los traduce a entidades propias y
-- `external_links` guarda la correspondencia externo-local. Nada de esto se implementa en el
-- MVP: las tablas nacen con RLS activado y sin ningún privilegio para `authenticated` ni
-- `anon`, del todo cerradas. Solo la clave de servicio (en `scripts/`, nunca en `src/`) podrá
-- escribirlas cuando llegue el primer conector real.

create table public.external_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  provider text not null check (char_length(provider) > 0),
  capabilities text[] not null default '{}',
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

alter table public.external_connections enable row level security;
revoke all on table public.external_connections from anon, authenticated;

-- Tal como llega del proveedor, sin interpretar: fecha y checksum para no volver a procesar lo
-- mismo. Nada del core lee esta tabla directamente (decisión 10 de la spec).
create table public.external_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  connection_id uuid not null,
  capability text not null check (char_length(capability) > 0),
  external_id text not null check (char_length(external_id) > 0),
  checksum text not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  foreign key (organization_id, connection_id)
    references public.external_connections (organization_id, id)
);

create index external_records_connection_id_idx on public.external_records (connection_id);

alter table public.external_records enable row level security;
revoke all on table public.external_records from anon, authenticated;

-- La correspondencia externo-local, para que normalizar sea idempotente: el mismo registro
-- externo no crea dos veces la misma fila propia.
create table public.external_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  connection_id uuid not null,
  capability text not null check (char_length(capability) > 0),
  external_id text not null check (char_length(external_id) > 0),
  entity_table text not null check (char_length(entity_table) > 0),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, connection_id)
    references public.external_connections (organization_id, id)
);

create unique index external_links_one_per_external_record_idx
  on public.external_links (organization_id, connection_id, capability, external_id);

alter table public.external_links enable row level security;
revoke all on table public.external_links from anon, authenticated;

-- El historial de ejecuciones de un conector: cuándo empezó, cuándo acabó, cuántos registros,
-- y el error si lo hubo.
create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  connection_id uuid not null,
  capability text not null check (char_length(capability) > 0),
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  records_count integer,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  foreign key (organization_id, connection_id)
    references public.external_connections (organization_id, id)
);

create index sync_runs_connection_id_idx on public.sync_runs (connection_id);

alter table public.sync_runs enable row level security;
revoke all on table public.sync_runs from anon, authenticated;
