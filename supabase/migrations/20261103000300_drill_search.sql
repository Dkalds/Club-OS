-- Biblioteca de ejercicios: búsqueda sin tildes y filtros.
--
-- `public.search_drills` es la consulta de la lista de la biblioteca: los ejercicios de un
-- club que no están archivados, filtrados por texto, objetivo de trabajo, principio, edad,
-- jugadores y minutos. Es `security invoker`: se ejecuta con el usuario de la sesión y RLS de
-- `drills` decide qué ejercicios existen para él (un borrador solo lo ven su autor y el
-- admin; los jugadores y quien no es del club no ven nada). La función no repite esa regla,
-- solo añade las condiciones de la búsqueda.
--
-- Devuelve `setof public.drills` para que PostgREST pueda pedirle columnas, orden y relaciones
-- (`drill_focus_areas(focus_areas(…))`) como a una tabla. No ordena: quien llama lo hace.

-- ── Clave de búsqueda ────────────────────────────────────────────────────────────────
-- El texto del usuario o el título de un ejercicio, en una forma que se puede comparar sin
-- pensar en tildes, mayúsculas ni signos: sin tildes, en minúsculas, y con cada tramo de
-- cualquier otra cosa convertido en un solo espacio. El resultado solo lleva `[a-z0-9 ]`, así
-- que cabe en un `like` sin escapar `%`, `_` ni `\`. Un texto sin letras ni números da la
-- cadena vacía.
--
-- `immutable` por la misma razón que `f_unaccent`, de la que depende: todo lo que usa está
-- fijado.
create function private.f_search_key(text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(lower(private.f_unaccent($1)), '[^a-z0-9]+', ' ', 'g'));
$$;

revoke all on function private.f_search_key(text) from public, anon;
grant execute on function private.f_search_key(text) to authenticated;

-- ── search_drills ────────────────────────────────────────────────────────────────────
-- Todas las condiciones se suman (AND) y cada criterio a null no filtra:
--   · `p_org`: el club. RLS ya limita lo que se ve, pero quien es de dos clubes ve los dos y
--     la lista es de uno;
--   · el archivado no sale: sigue en su ficha y en los planes de sesión que lo usaron, pero
--     no se ofrece al buscar;
--   · `p_q`: el texto. Un ejercicio vale si lo encuentra el texto completo (`search`: título,
--     resumen, objetivo y organización, con las formas de la palabra) o si alguna palabra de
--     su título empieza como el texto, para escribir «outl» y encontrar «outlet» antes de
--     acabar de teclear. La consulta pasa por `f_unaccent` como el vector guardado, y con la
--     misma configuración, o las tildes no coincidirían. Si el texto no tiene letras ni
--     números (`%_'`, espacios) la clave es null y no se aplica ninguna condición de texto:
--     buscar «nada» es no buscar;
--   · `p_focus` y `p_principle`: el slug de un objetivo o de un principio del club del
--     ejercicio. Un slug que no existe no es un error: no hay ejercicios con él;
--   · `p_age`: la categoría (el número de la «U») tiene que caer dentro de la edad del
--     ejercicio, con la edad máxima abierta (null) sin tope por arriba;
--   · `p_players` y `p_minutes`: el valor tiene que caer dentro del rango del ejercicio,
--     extremos incluidos.
--
-- Una palabra vacía sola («de») es texto para la clave pero no deja ningún término en el texto
-- completo: la consulta queda vacía y no encuentra nada, y solo cuenta el prefijo del título.
-- Eso es lo esperado de quien está empezando a teclear.
--
-- `websearch_to_tsquery` avisa con un NOTICE («text-search query contains only stop words or
-- doesn't contain lexemes, ignored») cuando el texto solo trae palabras vacías, y no hay
-- manera de saberlo antes de analizarlo. El aviso no le sirve a quien llama, y menos en un
-- cuadro de búsqueda donde esas entradas son normales: se silencia mientras dura la llamada
-- con `client_min_messages`. Avisos y errores de verdad siguen pasando.
create function public.search_drills(
  p_org uuid,
  p_q text default null,
  p_focus text default null,
  p_principle text default null,
  p_age int default null,
  p_players int default null,
  p_minutes int default null
)
returns setof public.drills
language sql
stable
security invoker
set search_path = ''
set client_min_messages = warning
as $$
  -- La clave y la consulta se calculan una sola vez, no por ejercicio; la consulta solo si
  -- hay clave.
  with q as materialized (
    select s.k,
           case
             when s.k is not null
               then websearch_to_tsquery('spanish'::regconfig, private.f_unaccent(p_q))
           end as tsq
    from (select nullif(private.f_search_key(p_q), '') as k) as s
  )
  select d.*
  from public.drills as d
  cross join q
  where d.organization_id = p_org
    and d.status <> 'archived'
    and (
      q.k is null
      or d.search @@ q.tsq
      or (' ' || private.f_search_key(d.title)) like ('% ' || q.k || '%')
    )
    and (
      p_focus is null
      or exists (
        select 1
        from public.drill_focus_areas as l
        join public.focus_areas as f
          on f.organization_id = l.organization_id
         and f.id = l.focus_area_id
        where l.organization_id = d.organization_id
          and l.drill_id = d.id
          and f.slug = p_focus
      )
    )
    and (
      p_principle is null
      or exists (
        select 1
        from public.drill_principles as l
        join public.game_principles as g
          on g.organization_id = l.organization_id
         and g.id = l.principle_id
        where l.organization_id = d.organization_id
          and l.drill_id = d.id
          and g.slug = p_principle
      )
    )
    and (
      p_age is null
      or (d.min_age <= p_age and (d.max_age is null or d.max_age >= p_age))
    )
    and (p_players is null or p_players between d.min_players and d.max_players)
    and (p_minutes is null or p_minutes between d.min_minutes and d.max_minutes);
$$;

-- Solo `authenticated`, como las funciones de la metodología: Postgres da `execute` a PUBLIC
-- en toda función nueva y Supabase lo da además a anon, authenticated y service_role en
-- `public`; se quita lo que sobra. La búsqueda es de una sesión de usuario: sin sesión RLS no
-- deja ver nada, y la clave de servicio se salta RLS y devolvería también los borradores de
-- todos.
revoke all on function public.search_drills(uuid, text, text, text, int, int, int)
  from public, anon, service_role;
grant execute on function public.search_drills(uuid, text, text, text, int, int, int)
  to authenticated;
