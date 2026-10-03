-- Helpers de test para pgTAP. Solo en local: `supabase db reset` carga este archivo
-- después de las migraciones. Nunca van en una migración ni llegan a un proyecto remoto.
-- Los datos de ejemplo no viven aquí: los crea `pnpm seed`.
--
-- Uso dentro de un test (`begin; … rollback;`):
--   select tests.authenticate_as(<uuid>);  -- sigue como ese usuario (rol authenticated)
--   select tests.clear_authentication();   -- sigue como visitante (rol anon)
--   reset role;                            -- vuelve a postgres para tocar fixtures

create schema if not exists tests;

-- Los tests llaman a los helpers también después de cambiar de rol.
grant usage on schema tests to anon, authenticated, service_role;

-- Crea un usuario de Auth y devuelve su id. Se llama como postgres, al montar fixtures.
create or replace function tests.create_user(email text)
returns uuid
language sql
set search_path = ''
as $$
  insert into auth.users (
    id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at
  )
  values (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    create_user.email,
    now(),
    now(),
    now()
  )
  returning id;
$$;

-- Simula una petición con sesión: rol `authenticated` y el `sub` del JWT que lee auth.uid().
-- Vale hasta el final de la transacción. No puede ser `security definer`: Postgres no
-- deja cambiar de rol dentro de una función así.
create or replace function tests.authenticate_as(uid uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
end;
$$;

-- Simula una petición sin sesión: rol `anon` y sin claims.
create or replace function tests.clear_authentication()
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant execute on function tests.authenticate_as(uuid) to anon, authenticated, service_role;
grant execute on function tests.clear_authentication() to anon, authenticated, service_role;
