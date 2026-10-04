// Las filas de la metodología para los tests de sus lecturas (`queries.test.ts`,
// `admin-queries.test.ts`) y los escenarios de orden que solo ellas necesitan. Solo lo importan
// tests. El doble de la base de datos y lo que comparten todos los módulos (`fakeSupabase`,
// `CTX`, `uuid`…) están en `@/lib/test-support`.
//
// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

import { ORG, OTHER_ORG, tag, uuid, type Row } from "@/lib/test-support";

/** Las filas de estos tests nacen en la misma fecha, salvo las que prueban el orden. */
export const CREATED = "2026-01-03T09:00:00+00:00";

/**
 * Cuatro filas, en el orden en que deben salir, que solo salen bien con los tres criterios de
 * orden a la vez (`sort`, `created_at`, `id`): la primera es la única con `sort` 1 pero la más
 * reciente; las otras tres empatan en `sort`, y dos de ellas también en `created_at`. Los ids
 * están en el orden contrario al de `created_at` en la segunda y la tercera.
 */
export const SLOTS = [
  { name: "first", id: uuid(20), sort: 1, created_at: "2026-01-05T09:00:00+00:00" },
  { name: "second", id: uuid(30), sort: 2, created_at: "2026-01-01T09:00:00+00:00" },
  { name: "third", id: uuid(10), sort: 2, created_at: "2026-01-02T09:00:00+00:00" },
  { name: "fourth", id: uuid(11), sort: 2, created_at: "2026-01-02T09:00:00+00:00" },
] as const;

export const SLOT_IDS = SLOTS.map((slot) => slot.id);

/** El borrador del club que `listStore` añade: con `sort` 0, en Gestión sale el primero. */
export const DRAFT_ID = uuid(91);

/**
 * Las filas de una tabla para probar una lectura: las cuatro de `SLOTS` del club, publicadas y
 * desordenadas (al revés de como deben salir), y las que no deben colarse en The Way: un
 * borrador del mismo club y una fila publicada y otra en borrador de otro club. Las tres con
 * `sort` 0, así que saldrían las primeras si la consulta dejara de filtrar.
 */
export function listStore(make: (id: string, organizationId: string, overrides: Row) => Row): Row[] {
  const wanted = SLOTS.map(({ id, sort, created_at }) => make(id, ORG, { sort, created_at }));
  return [
    ...wanted.reverse(),
    make(DRAFT_ID, ORG, { status: "draft", sort: 0 }),
    make(uuid(92), OTHER_ORG, { sort: 0 }),
    make(uuid(93), OTHER_ORG, { status: "draft", sort: 0 }),
  ];
}

// ── Filas, ya con la forma que devuelve PostgREST ────────────────────────────────────────

export function sectionRow(id: string, organization_id: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id,
    number: 1,
    slug: `seccion-${tag(id)}`,
    title: `Sección ${tag(id)}`,
    summary: null,
    body_md: "",
    content_kind: "text",
    status: "published",
    sort: 0,
    created_at: CREATED,
    updated_at: "2026-02-01T10:00:00.123456+00:00",
    ...overrides,
  };
}

export function valueRow(id: string, organization_id: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id,
    code: `VALOR ${tag(id)}`,
    title: null,
    description: `Descripción ${tag(id)}.`,
    status: "published",
    sort: 0,
    created_at: CREATED,
    ...overrides,
  };
}

export function standardRow(id: string, organization_id: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id,
    number: 1,
    title: `STANDARD ${tag(id)}`,
    description: `Descripción ${tag(id)}.`,
    status: "published",
    sort: 0,
    created_at: CREATED,
    ...overrides,
  };
}

export function pointRow(id: string, organization_id: string, principle_id: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id,
    principle_id,
    text: `Punto ${tag(id)}`,
    sort: 0,
    created_at: CREATED,
    ...overrides,
  };
}

export function principleRow(id: string, organization_id: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id,
    slug: `principio-${tag(id)}`,
    title: `Principio ${tag(id)}`,
    summary: null,
    status: "published",
    sort: 0,
    created_at: CREATED,
    principle_points: [],
    ...overrides,
  };
}
