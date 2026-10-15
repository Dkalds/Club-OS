-- `grant_terms_consent` es `security definer` y se salta RLS: sin esta comprobación,
-- cualquier cuenta autenticada podía dejar una fila de términos (y su auditoría) en un club
-- del que no es miembro, llamando a la función por PostgREST. Mismo 404 opaco que un club que
-- no existe (`NOT_FOUND`).
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
  if not private.is_member(p_org) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

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
