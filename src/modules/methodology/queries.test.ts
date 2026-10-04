import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CTX,
  fakeSupabase,
  FAILURE,
  ORG,
  OTHER_ORG,
  tag,
  uuid,
  type Failure,
  type Store,
} from "@/lib/test-support";
import {
  DRAFT_ID,
  listStore,
  pointRow,
  principleRow,
  sectionRow,
  SLOT_IDS,
  SLOTS,
  standardRow,
  valueRow,
} from "./test-support";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), logError: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { getPrinciples, getStandards, getValues, getWayIndex, getWaySection } from "./queries";

// Las lecturas del entrenador, contra un doble de la base de datos que aplica los filtros y el
// orden que recibe (ver `test-support.ts`). Lo que se fija aquí es lo que RLS no garantiza a
// quien es miembro de dos clubes o administra el suyo: que la app filtra por club y por estado
// por su cuenta, y que devuelve las filas en su orden.

type Calls = ReturnType<typeof fakeSupabase>["calls"];

function install(store: Store, failing: Record<string, Failure> = {}): Calls {
  const fake = fakeSupabase(store, failing);
  mocks.createClient.mockResolvedValue(fake.client);
  return fake.calls;
}

/** Que una lectura que falla se registra con su etiqueta, sin datos personales, y lanza. */
async function expectReadError(run: () => Promise<unknown>, expectedTag: string) {
  const error = await run().then(
    () => null,
    (thrown: unknown) => thrown,
  );

  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe(`${expectedTag}: no se pudo leer de la base de datos`);
  expect((error as Error).cause).toBeUndefined();
  expect(mocks.logError).toHaveBeenCalledTimes(1);
  expect(mocks.logError).toHaveBeenCalledWith(expectedTag, FAILURE);
}

beforeEach(() => {
  mocks.createClient.mockReset();
  mocks.logError.mockReset();
});

const ORDERED = ["sort", "created_at", "id"];
const PUBLISHED_OF_THIS_CLUB = { organization_id: ORG, status: "published" };

// ── El índice ────────────────────────────────────────────────────────────────────────

describe("getWayIndex", () => {
  /** Una sección de cada tipo, en `SLOTS`; el número 2 es de un borrador, así que hay un hueco. */
  function indexStore(): Store {
    const numbers = [1, 3, 4, 5];
    const kinds = ["text", "values", "principles", "standards"];
    const sections = SLOTS.map((slot, index) =>
      sectionRow(slot.id, ORG, {
        sort: slot.sort,
        created_at: slot.created_at,
        number: numbers[index],
        content_kind: kinds[index],
        summary: index === 0 ? "Su resumen." : null,
      }),
    ).reverse();

    return {
      way_sections: [
        ...sections,
        sectionRow(DRAFT_ID, ORG, { status: "draft", number: 2, sort: 0 }),
        sectionRow(uuid(92), OTHER_ORG, { sort: 0 }),
        sectionRow(uuid(93), OTHER_ORG, { status: "draft", sort: 0 }),
      ],
      // Lo publicado de cada lista, solo del club: 2 valores, 1 principio y 3 Standards.
      club_values: [
        valueRow(uuid(1), ORG),
        valueRow(uuid(2), ORG),
        valueRow(uuid(3), ORG, { status: "draft" }),
        ...[4, 5, 6, 7].map((n) => valueRow(uuid(n), OTHER_ORG)),
      ],
      game_principles: [
        principleRow(uuid(1), ORG),
        principleRow(uuid(2), ORG, { status: "draft" }),
        principleRow(uuid(3), OTHER_ORG),
        principleRow(uuid(4), OTHER_ORG),
      ],
      standards: [
        ...[1, 2, 3].map((n) => standardRow(uuid(n), ORG)),
        standardRow(uuid(4), ORG, { status: "draft" }),
        standardRow(uuid(5), OTHER_ORG),
        standardRow(uuid(6), OTHER_ORG),
      ],
    };
  }

  it("son las secciones publicadas de este club, en su orden y con el número de Gestión", async () => {
    install(indexStore());

    const index = await getWayIndex(CTX);

    expect(index.map((entry) => entry.id)).toEqual(SLOT_IDS);
    // El borrador del 2 deja un hueco, a propósito.
    expect(index.map((entry) => entry.number)).toEqual([1, 3, 4, 5]);
    expect(index[0]).toEqual({
      id: SLOT_IDS[0],
      number: 1,
      slug: "seccion-20",
      title: "Sección 20",
      subtitle: "Su resumen.",
    });
  });

  it("la línea de cada fila es su resumen o lo que hay publicado en su lista, solo de este club", async () => {
    install(indexStore());

    const index = await getWayIndex(CTX);

    expect(index.map((entry) => entry.subtitle)).toEqual([
      "Su resumen.",
      "2 valores",
      "1 principio",
      "3 Standards",
    ]);
  });

  it("filtra siempre por club y por estado, en las cuatro lecturas", async () => {
    const calls = install(indexStore());

    await getWayIndex(CTX);

    expect(calls.map((call) => call.table).sort()).toEqual([
      "club_values",
      "game_principles",
      "standards",
      "way_sections",
    ]);
    for (const call of calls) expect(call.eq, call.table).toEqual(PUBLISHED_OF_THIS_CLUB);
    expect(calls.find((call) => call.table === "way_sections")?.order).toEqual(ORDERED);
  });

  it("un club sin nada publicado devuelve la lista vacía, sin error", async () => {
    install({
      way_sections: [sectionRow(DRAFT_ID, ORG, { status: "draft" }), sectionRow(uuid(92), OTHER_ORG)],
    });

    await expect(getWayIndex(CTX)).resolves.toEqual([]);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it.each([
    ["way_sections", "methodology.index"],
    ["club_values", "methodology.index.values"],
    ["game_principles", "methodology.index.principles"],
    ["standards", "methodology.index.standards"],
  ])("si falla la lectura de %s, la registra y lanza", async (table, tagName) => {
    install(indexStore(), { [table]: FAILURE });

    await expectReadError(() => getWayIndex(CTX), tagName);
  });
});

// ── Una sección ──────────────────────────────────────────────────────────────────────

describe("getWaySection", () => {
  const SECTIONS = {
    text: uuid(41),
    values: uuid(42),
    principles: uuid(43),
    standards: uuid(44),
  };

  function sectionStore(): Store {
    return {
      way_sections: [
        sectionRow(SECTIONS.text, ORG, {
          number: 2,
          slug: "texto",
          title: "Una sección de texto",
          summary: "Su resumen.",
          body_md: "Algo **importante**.",
        }),
        sectionRow(SECTIONS.values, ORG, { slug: "valores", content_kind: "values" }),
        sectionRow(SECTIONS.principles, ORG, { slug: "principios", content_kind: "principles" }),
        sectionRow(SECTIONS.standards, ORG, { slug: "estandares", content_kind: "standards" }),
        sectionRow(uuid(45), ORG, { slug: "borrador", status: "draft" }),
        sectionRow(uuid(46), ORG, { slug: "rara", content_kind: "tipo-que-no-existe" }),
        sectionRow(uuid(47), OTHER_ORG, { slug: "solo-del-otro-club" }),
        sectionRow(uuid(48), OTHER_ORG, { slug: "compartida", title: "De otro club" }),
        sectionRow(uuid(49), ORG, { slug: "compartida", title: "De este club" }),
      ],
      club_values: listStore(valueRow),
      game_principles: listStore((id, org, overrides) =>
        principleRow(id, org, {
          ...overrides,
          principle_points: [pointRow(uuid(Number(tag(id)) + 100), org, id)],
        }),
      ),
      standards: listStore(standardRow),
    };
  }

  it("una sección de texto vuelve con todos sus campos, tal cual, y sin ninguna lista", async () => {
    const calls = install(sectionStore());

    const view = await getWaySection(CTX, "texto");

    expect(view).toEqual({
      section: {
        id: SECTIONS.text,
        number: 2,
        slug: "texto",
        title: "Una sección de texto",
        summary: "Su resumen.",
        bodyMd: "Algo **importante**.",
        contentKind: "text",
        status: "published",
        // La cadena de PostgREST, con sus microsegundos: nunca pasa por `Date`.
        updatedAt: "2026-02-01T10:00:00.123456+00:00",
      },
      values: [],
      principles: [],
      standards: [],
    });
    expect(calls.map((call) => call.table)).toEqual(["way_sections"]);
  });

  it("filtra por club, por estado y por el slug que se pide", async () => {
    const calls = install(sectionStore());

    await getWaySection(CTX, "texto");

    expect(calls[0].eq).toEqual({ ...PUBLISHED_OF_THIS_CLUB, slug: "texto" });
  });

  it("una sección de valores trae los valores publicados de este club, en su orden, y nada más", async () => {
    install(sectionStore());

    const view = await getWaySection(CTX, "valores");

    expect(view?.section.contentKind).toBe("values");
    expect(view?.values.map((value) => value.id)).toEqual(SLOT_IDS);
    expect(view?.principles).toEqual([]);
    expect(view?.standards).toEqual([]);
  });

  it("una sección de principios trae los principios publicados de este club, con sus puntos", async () => {
    install(sectionStore());

    const view = await getWaySection(CTX, "principios");

    expect(view?.section.contentKind).toBe("principles");
    expect(view?.principles.map((principle) => principle.id)).toEqual(SLOT_IDS);
    expect(view?.principles[0].points).toHaveLength(1);
    expect(view?.values).toEqual([]);
    expect(view?.standards).toEqual([]);
  });

  it("una sección de Standards trae los Standards publicados de este club, en su orden, y nada más", async () => {
    install(sectionStore());

    const view = await getWaySection(CTX, "estandares");

    expect(view?.section.contentKind).toBe("standards");
    expect(view?.standards.map((standard) => standard.id)).toEqual(SLOT_IDS);
    expect(view?.values).toEqual([]);
    expect(view?.principles).toEqual([]);
  });

  it.each([
    ["un borrador", "borrador"],
    ["un slug que no existe", "no-existe"],
    ["el slug de otro club", "solo-del-otro-club"],
  ])("%s es null, sin distinguirlo de los otros dos y sin leer ninguna lista", async (_, slug) => {
    const calls = install(sectionStore());

    await expect(getWaySection(CTX, slug)).resolves.toBeNull();

    expect(calls.map((call) => call.table)).toEqual(["way_sections"]);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("si el slug existe en dos clubes, la sección es la de este club", async () => {
    install(sectionStore());

    const view = await getWaySection(CTX, "compartida");

    expect(view?.section.title).toBe("De este club");
  });

  it("un tipo que la base de datos no reconoce se pinta como texto", async () => {
    install(sectionStore());

    const view = await getWaySection(CTX, "rara");

    expect(view?.section.contentKind).toBe("text");
    expect(view?.values).toEqual([]);
  });

  it("si falla la lectura de la sección, la registra y lanza", async () => {
    install(sectionStore(), { way_sections: FAILURE });

    await expectReadError(() => getWaySection(CTX, "texto"), "methodology.section");
  });

  it("si falla la lectura de su lista, también", async () => {
    install(sectionStore(), { club_values: FAILURE });

    await expectReadError(() => getWaySection(CTX, "valores"), "methodology.values");
  });
});

// ── Las listas ───────────────────────────────────────────────────────────────────────

describe("getStandards", () => {
  it("devuelve los Standards publicados de este club, en su orden", async () => {
    install({ standards: listStore(standardRow) });

    const standards = await getStandards(CTX);

    expect(standards.map((standard) => standard.id)).toEqual(SLOT_IDS);
  });

  it("de cada uno, solo lo que se pinta: id, número, título y descripción", async () => {
    install({
      standards: [
        standardRow(uuid(1), ORG, { number: 3, title: "FINISH", description: "Se acaba la posesión." }),
      ],
    });

    await expect(getStandards(CTX)).resolves.toEqual([
      { id: uuid(1), number: 3, title: "FINISH", description: "Se acaba la posesión." },
    ]);
  });

  it("filtra por club y por estado, y ordena por sort, created_at e id", async () => {
    const calls = install({ standards: listStore(standardRow) });

    await getStandards(CTX);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("standards");
    expect(calls[0].eq).toEqual(PUBLISHED_OF_THIS_CLUB);
    expect(calls[0].order).toEqual(ORDERED);
  });

  it("si falla la lectura, la registra y lanza", async () => {
    install({ standards: listStore(standardRow) }, { standards: FAILURE });

    await expectReadError(() => getStandards(CTX), "methodology.standards");
  });
});

describe("getValues", () => {
  it("devuelve los valores publicados de este club, en su orden", async () => {
    install({ club_values: listStore(valueRow) });

    const values = await getValues(CTX);

    expect(values.map((value) => value.id)).toEqual(SLOT_IDS);
  });

  it("de cada uno, su código, su título (puede faltar), su descripción y su estado", async () => {
    install({
      club_values: [
        valueRow(uuid(1), ORG, { code: "RESPECT", title: "Respeto", description: "Se juega con respeto." }),
        valueRow(uuid(2), ORG, { code: "EFFORT", title: null, sort: 1 }),
      ],
    });

    const values = await getValues(CTX);

    expect(values[0]).toEqual({
      id: uuid(1),
      code: "RESPECT",
      title: "Respeto",
      description: "Se juega con respeto.",
      status: "published",
    });
    expect(values[1].title).toBeNull();
  });

  it("filtra por club y por estado, y ordena por sort, created_at e id", async () => {
    const calls = install({ club_values: listStore(valueRow) });

    await getValues(CTX);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("club_values");
    expect(calls[0].eq).toEqual(PUBLISHED_OF_THIS_CLUB);
    expect(calls[0].order).toEqual(ORDERED);
  });

  it("si falla la lectura, la registra y lanza", async () => {
    install({ club_values: listStore(valueRow) }, { club_values: FAILURE });

    await expectReadError(() => getValues(CTX), "methodology.values");
  });
});

describe("getPrinciples", () => {
  const PRINCIPLE = uuid(20);

  /** Un principio con los cuatro puntos de `SLOTS` (desordenados), más uno de otro club colado. */
  function withPoints(): Store {
    const points = SLOTS.map((slot) =>
      pointRow(slot.id, ORG, PRINCIPLE, {
        text: `Punto ${slot.name}`,
        sort: slot.sort,
        created_at: slot.created_at,
      }),
    ).reverse();
    // La clave foránea compuesta lo impide en la base de datos: el filtro es defensa en profundidad.
    const foreign = pointRow(uuid(95), OTHER_ORG, PRINCIPLE, { text: "De otro club", sort: 0 });

    return { game_principles: [principleRow(PRINCIPLE, ORG, { principle_points: [foreign, ...points] })] };
  }

  it("devuelve los principios publicados de este club, en su orden", async () => {
    install({ game_principles: listStore(principleRow) });

    const principles = await getPrinciples(CTX);

    expect(principles.map((principle) => principle.id)).toEqual(SLOT_IDS);
  });

  it("de cada uno, su slug, su título, su resumen, su estado y sus puntos", async () => {
    install({
      game_principles: [
        principleRow(PRINCIPLE, ORG, {
          slug: "defensa",
          title: "Defensa",
          summary: "Se defiende juntos.",
          principle_points: [pointRow(uuid(1), ORG, PRINCIPLE, { text: "Ayuda al compañero." })],
        }),
      ],
    });

    await expect(getPrinciples(CTX)).resolves.toEqual([
      {
        id: PRINCIPLE,
        slug: "defensa",
        title: "Defensa",
        summary: "Se defiende juntos.",
        status: "published",
        points: [{ id: uuid(1), text: "Ayuda al compañero." }],
      },
    ]);
  });

  it("los puntos salen en su orden y solo los de este club", async () => {
    install(withPoints());

    const [principle] = await getPrinciples(CTX);

    expect(principle.points.map((point) => point.id)).toEqual(SLOT_IDS);
    expect(principle.points.map((point) => point.text)).toEqual([
      "Punto first",
      "Punto second",
      "Punto third",
      "Punto fourth",
    ]);
  });

  it("pide los puntos filtrados por club y ordenados, además de los principios", async () => {
    const calls = install(withPoints());

    await getPrinciples(CTX);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("game_principles");
    expect(calls[0].eq).toEqual(PUBLISHED_OF_THIS_CLUB);
    expect(calls[0].order).toEqual(ORDERED);
    expect(calls[0].embedded).toEqual({
      principle_points: { eq: { organization_id: ORG }, order: ORDERED },
    });
  });

  it("un principio sin puntos los devuelve vacíos", async () => {
    install({ game_principles: [principleRow(PRINCIPLE, ORG, { principle_points: null })] });

    const [principle] = await getPrinciples(CTX);

    expect(principle.points).toEqual([]);
  });

  it("un principio en borrador no sale, ni sus puntos", async () => {
    install({
      game_principles: [
        principleRow(PRINCIPLE, ORG, {
          status: "draft",
          principle_points: [pointRow(uuid(1), ORG, PRINCIPLE, { text: "Del borrador" })],
        }),
      ],
    });

    await expect(getPrinciples(CTX)).resolves.toEqual([]);
  });

  it("si falla la lectura, la registra y lanza", async () => {
    install({ game_principles: listStore(principleRow) }, { game_principles: FAILURE });

    await expectReadError(() => getPrinciples(CTX), "methodology.principles");
  });
});
