-- Integraciones externas (Fase 7, Task 5): esqueleto vacío, decisión 10 de la spec. Lo que se
-- garantiza: las cuatro tablas tienen RLS activado, y ni `authenticated` ni `anon` tienen
-- ningún privilegio sobre ninguna, del todo cerradas hasta que llegue el primer conector real.
--
-- Se ejecuta con `pnpm test:db`. Transacción que se deshace al final.
begin;

select plan(5);

select results_eq(
  $$select relname::text collate "default"
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('external_connections', 'external_records', 'external_links', 'sync_runs')
      and relrowsecurity
    order by relname$$,
  $$values ('external_connections'), ('external_links'), ('external_records'), ('sync_runs')$$,
  'las cuatro tablas de integraciones tienen RLS activado'
);

select is(
  (select count(*)::int
    from unnest(array['external_connections', 'external_records', 'external_links', 'sync_runs']) as t (tabla)
    cross join unnest(array['select', 'insert', 'update', 'delete']) as p (privilegio)
    where has_table_privilege('authenticated', format('public.%I', t.tabla), p.privilegio)),
  0,
  'authenticated no tiene ningún privilegio sobre ninguna tabla de integraciones'
);

select is(
  (select count(*)::int
    from unnest(array['external_connections', 'external_records', 'external_links', 'sync_runs']) as t (tabla)
    cross join unnest(array['select', 'insert', 'update', 'delete']) as p (privilegio)
    where has_table_privilege('anon', format('public.%I', t.tabla), p.privilegio)),
  0,
  'anon tampoco tiene ningún privilegio sobre ninguna tabla de integraciones'
);

select is(
  (select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename in ('external_connections', 'external_records', 'external_links', 'sync_runs')),
  0,
  'ninguna de las cuatro tiene ninguna política: sin política no hay acceso'
);

select tests.authenticate_as(tests.create_user('alguien@integrations.pgtap.test'));
select throws_ok(
  $$select count(*) from external_connections$$,
  '42501', null, 'ni siquiera dirección puede leer una conexión externa todavía'
);

select * from finish();

rollback;
