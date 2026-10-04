import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CTX,
  fakeSupabase,
  FAILURE,
  ORG,
  OTHER_ORG,
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

import {
  getSectionForAdmin,
  listPrinciplesForAdmin,
  listSectionsForAdmin,
  listStandardsForAdmin,
  listValuesForAdmin,
} from "./admin-queries";

// Las lecturas de Gestión, contra el mismo doble de la base de datos que las del entrenador
// (ver `test-support.ts`). Aquí hay borradores, que son justo lo que se va a editar, pero
// siempre y solo los del club: quien llama ya ha pasado por `requireAdmin`, y aun así la
// consulta no depende de RLS para no recorrer ni devolver filas de otro club.

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
/** Lo del club entero, publicado o no: sin filtro de estado. */
const WHOLE_CLUB = { organization_id: ORG };
/** Todo lo del club en Gestión: el borrador (con `sort` 0, el primero) y las cuatro de `SLOTS`. */
const ADMIN_IDS = [DRAFT_ID, ...SLOT_IDS];

describe("listSectionsForAdmin", () => {
  it("devuelve todas las secciones del club, borradores incluidos, en su orden y ninguna de otro club", async () => {
    install({ way_sections: listStore(sectionRow) });

    const sections = await listSectionsForAdmin(CTX);

    expect(sections.map((section) => section.id)).toEqual(ADMIN_IDS);
    expect(sections.map((section) => section.status)).toEqual([
      "draft",
      "published",
      "published",
      "published",
      "published",
    ]);
  });

  it("cada una con todos sus campos, el updatedAt tal cual lo da PostgREST", async () => {
    install({
      way_sections: [
        sectionRow(uuid(1), ORG, {
          number: 4,
          slug: "una",
          title: "Una",
          summary: null,
          body_md: "Texto.",
          content_kind: "principles",
          status: "draft",
        }),
      ],
    });

    await expect(listSectionsForAdmin(CTX)).resolves.toEqual([
      {
        id: uuid(1),
        number: 4,
        slug: "una",
        title: "Una",
        summary: null,
        bodyMd: "Texto.",
        contentKind: "principles",
        status: "draft",
        updatedAt: "2026-02-01T10:00:00.123456+00:00",
      },
    ]);
  });

  it("filtra por club y por nada más, y ordena por sort, created_at e id", async () => {
    const calls = install({ way_sections: listStore(sectionRow) });

    await listSectionsForAdmin(CTX);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("way_sections");
    expect(calls[0].eq).toEqual(WHOLE_CLUB);
    expect(calls[0].order).toEqual(ORDERED);
  });

  it("si falla la lectura, la registra y lanza", async () => {
    install({ way_sections: listStore(sectionRow) }, { way_sections: FAILURE });

    await expectReadError(() => listSectionsForAdmin(CTX), "methodology.admin.sections");
  });
});

describe("getSectionForAdmin", () => {
  const PUBLISHED = uuid(41);
  const DRAFT = uuid(42);
  const OF_ANOTHER_CLUB = uuid(43);

  function sectionStore(): Store {
    return {
      way_sections: [
        sectionRow(PUBLISHED, ORG, { title: "Publicada" }),
        sectionRow(DRAFT, ORG, { title: "En borrador", status: "draft" }),
        sectionRow(OF_ANOTHER_CLUB, OTHER_ORG, { title: "De otro club" }),
      ],
    };
  }

  it("devuelve una sección publicada por su id", async () => {
    install(sectionStore());

    const section = await getSectionForAdmin(CTX, PUBLISHED);

    expect(section).toMatchObject({ id: PUBLISHED, title: "Publicada", status: "published" });
  });

  it("devuelve también un borrador: es justo lo que se edita", async () => {
    install(sectionStore());

    const section = await getSectionForAdmin(CTX, DRAFT);

    expect(section).toMatchObject({ id: DRAFT, title: "En borrador", status: "draft" });
  });

  it("devuelve la sección con su updatedAt tal cual, para usarlo de expectedUpdatedAt", async () => {
    install(sectionStore());

    const section = await getSectionForAdmin(CTX, PUBLISHED);

    expect(section?.updatedAt).toBe("2026-02-01T10:00:00.123456+00:00");
  });

  it("es null para el id de una sección de otro club", async () => {
    install(sectionStore());

    await expect(getSectionForAdmin(CTX, OF_ANOTHER_CLUB)).resolves.toBeNull();
  });

  it("es null para un uuid que no existe", async () => {
    install(sectionStore());

    await expect(getSectionForAdmin(CTX, uuid(99))).resolves.toBeNull();
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it.each([
    ["vacío", ""],
    ["una palabra", "plan-de-temporada"],
    ["un número", "1234"],
    ["una ruta", "../way"],
    ["un uuid al que le falta un dígito", "00000000-0000-4000-8000-00000000004"],
    ["un uuid con letras que no son hexadecimales", "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"],
    ["un uuid con algo detrás", `${uuid(41)}'`],
  ])("%s no es un uuid: es null y ni siquiera se consulta", async (_, id) => {
    const calls = install(sectionStore());

    await expect(getSectionForAdmin(CTX, id)).resolves.toBeNull();

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("un uuid en mayúsculas sí se consulta", async () => {
    const calls = install(sectionStore());

    await getSectionForAdmin(CTX, PUBLISHED.toUpperCase());

    expect(calls).toHaveLength(1);
  });

  it("filtra por club y por id, y no por estado", async () => {
    const calls = install(sectionStore());

    await getSectionForAdmin(CTX, DRAFT);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("way_sections");
    expect(calls[0].eq).toEqual({ organization_id: ORG, id: DRAFT });
  });

  it("si falla la lectura, la registra y lanza", async () => {
    install(sectionStore(), { way_sections: FAILURE });

    await expectReadError(() => getSectionForAdmin(CTX, PUBLISHED), "methodology.admin.section");
  });
});

describe("listValuesForAdmin", () => {
  it("devuelve todos los valores del club, borradores incluidos, en su orden y ninguno de otro club", async () => {
    install({ club_values: listStore(valueRow) });

    const values = await listValuesForAdmin(CTX);

    expect(values.map((value) => value.id)).toEqual(ADMIN_IDS);
    expect(values[0].status).toBe("draft");
  });

  it("de cada uno, su código, su título (puede faltar), su descripción y su estado", async () => {
    install({
      club_values: [
        valueRow(uuid(1), ORG, { code: "RESPECT", title: "Respeto", description: "Con respeto.", status: "draft" }),
      ],
    });

    await expect(listValuesForAdmin(CTX)).resolves.toEqual([
      { id: uuid(1), code: "RESPECT", title: "Respeto", description: "Con respeto.", status: "draft" },
    ]);
  });

  it("filtra por club y por nada más, y ordena por sort, created_at e id", async () => {
    const calls = install({ club_values: listStore(valueRow) });

    await listValuesForAdmin(CTX);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("club_values");
    expect(calls[0].eq).toEqual(WHOLE_CLUB);
    expect(calls[0].order).toEqual(ORDERED);
  });

  it("si falla la lectura, la registra y lanza", async () => {
    install({ club_values: listStore(valueRow) }, { club_values: FAILURE });

    await expectReadError(() => listValuesForAdmin(CTX), "methodology.admin.values");
  });
});

describe("listStandardsForAdmin", () => {
  it("devuelve todos los Standards del club, borradores incluidos, en su orden y ninguno de otro club", async () => {
    install({ standards: listStore(standardRow) });

    const standards = await listStandardsForAdmin(CTX);

    expect(standards.map((standard) => standard.id)).toEqual(ADMIN_IDS);
  });

  it("de cada uno, su número, su título, su descripción y su estado", async () => {
    install({
      standards: [
        standardRow(uuid(1), ORG, { number: 6, title: "TALK", description: "Se habla.", status: "draft" }),
        standardRow(uuid(2), ORG, { number: 7, title: "RUN", description: "Se corre.", sort: 1 }),
      ],
    });

    await expect(listStandardsForAdmin(CTX)).resolves.toEqual([
      { id: uuid(1), number: 6, title: "TALK", description: "Se habla.", status: "draft" },
      { id: uuid(2), number: 7, title: "RUN", description: "Se corre.", status: "published" },
    ]);
  });

  it("filtra por club y por nada más, y ordena por sort, created_at e id", async () => {
    const calls = install({ standards: listStore(standardRow) });

    await listStandardsForAdmin(CTX);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("standards");
    expect(calls[0].eq).toEqual(WHOLE_CLUB);
    expect(calls[0].order).toEqual(ORDERED);
  });

  it("si falla la lectura, la registra y lanza", async () => {
    install({ standards: listStore(standardRow) }, { standards: FAILURE });

    await expectReadError(() => listStandardsForAdmin(CTX), "methodology.admin.standards");
  });
});

describe("listPrinciplesForAdmin", () => {
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

  it("devuelve todos los principios del club, borradores incluidos, en su orden y ninguno de otro club", async () => {
    install({ game_principles: listStore(principleRow) });

    const principles = await listPrinciplesForAdmin(CTX);

    expect(principles.map((principle) => principle.id)).toEqual(ADMIN_IDS);
    expect(principles[0].status).toBe("draft");
  });

  it("un borrador trae sus puntos: dirección los edita", async () => {
    install({
      game_principles: [
        principleRow(PRINCIPLE, ORG, {
          status: "draft",
          principle_points: [pointRow(uuid(1), ORG, PRINCIPLE, { text: "Del borrador" })],
        }),
      ],
    });

    await expect(listPrinciplesForAdmin(CTX)).resolves.toEqual([
      {
        id: PRINCIPLE,
        slug: "principio-20",
        title: "Principio 20",
        summary: null,
        status: "draft",
        points: [{ id: uuid(1), text: "Del borrador" }],
      },
    ]);
  });

  it("los puntos salen en su orden y solo los de este club", async () => {
    install(withPoints());

    const [principle] = await listPrinciplesForAdmin(CTX);

    expect(principle.points.map((point) => point.id)).toEqual(SLOT_IDS);
    expect(principle.points.map((point) => point.text)).toEqual([
      "Punto first",
      "Punto second",
      "Punto third",
      "Punto fourth",
    ]);
  });

  it("un principio sin puntos los devuelve vacíos", async () => {
    install({ game_principles: [principleRow(PRINCIPLE, ORG, { principle_points: null })] });

    const [principle] = await listPrinciplesForAdmin(CTX);

    expect(principle.points).toEqual([]);
  });

  it("filtra por club, también los puntos, y por nada más, y ordena unos y otros", async () => {
    const calls = install(withPoints());

    await listPrinciplesForAdmin(CTX);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("game_principles");
    expect(calls[0].eq).toEqual(WHOLE_CLUB);
    expect(calls[0].order).toEqual(ORDERED);
    expect(calls[0].embedded).toEqual({
      principle_points: { eq: { organization_id: ORG }, order: ORDERED },
    });
  });

  it("si falla la lectura, la registra y lanza", async () => {
    install({ game_principles: listStore(principleRow) }, { game_principles: FAILURE });

    await expectReadError(() => listPrinciplesForAdmin(CTX), "methodology.admin.principles");
  });
});
