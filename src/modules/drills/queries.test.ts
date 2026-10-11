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
  type Row,
  type Store,
} from "@/lib/test-support";
import type { Board } from "@/modules/board/types";
import { pointRow, principleRow, sectionRow, standardRow } from "@/modules/methodology/test-support";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  logError: vi.fn(),
  signedUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));
vi.mock("@/modules/media/storage", () => ({ signedUrl: mocks.signedUrl }));

import { DETAIL_COLUMNS, RELATED_COLUMNS, SUMMARY_COLUMNS } from "./map-rows";
import { getDrill, getDrillFormOptions, getFocusAreas, getRelatedDrills, searchDrills } from "./queries";

// Las lecturas de la biblioteca, contra un doble de la base de datos que aplica los filtros y el
// orden que recibe (ver `lib/test-support.ts`). Lo que se fija aquí es lo que RLS no
// garantiza a quien es miembro de dos clubes o administra el suyo: que la app filtra por club y
// por estado por su cuenta, que devuelve las filas en su orden y que una avería no se confunde
// con «no existe». La función `search_drills` en sí se prueba en la base de datos (pgTAP).

const ME = "00000000-0000-4000-8000-0000000000e1";
const SOMEONE = "00000000-0000-4000-8000-0000000000e2";
const DRILL_ID = uuid(1);
const F1 = uuid(11);
const F2 = uuid(12);
const MEDIA = uuid(40);
const PATH = `org/${ORG}/drills/${DRILL_ID}/${uuid(41)}.png`;

type Calls = ReturnType<typeof fakeSupabase>["calls"];

type Options = {
  failing?: Record<string, Failure>;
  /** Quien tiene la sesión; `null` si Auth no devuelve a nadie. */
  userId?: string | null;
  claimsError?: Failure;
};

function install(store: Store, options: Options = {}): Calls {
  const fake = fakeSupabase(store, options.failing);
  const getClaims = async () =>
    options.claimsError
      ? { data: null, error: options.claimsError }
      : { data: options.userId ? { claims: { sub: options.userId } } : null, error: null };
  mocks.createClient.mockResolvedValue({ ...fake.client, auth: { getClaims } });
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
  mocks.signedUrl.mockReset();
  mocks.signedUrl.mockResolvedValue(null);
});

// ── Filas, ya con la forma que devuelve PostgREST ────────────────────────────────────────

function focusLink(id: string, sort: number): Row {
  return { focus_areas: { id, slug: `objetivo-${tag(id)}`, name: `Objetivo ${tag(id)}`, sort } };
}

/** Un vínculo con un principio: el id de la fila de vínculos y, anidado, el principio. */
function principleLink(id: string, slug: string, sort: number, status = "published"): Row {
  const title = slug.charAt(0).toUpperCase() + slug.slice(1);
  return { principle_id: id, game_principles: { id, slug, title, sort, status } };
}

/** Un vínculo con un Standard: el id de la fila de vínculos y, anidado, el Standard. */
function standardLink(id: string, number: number, status = "published"): Row {
  return {
    standard_id: id,
    standards: { id, number, title: `STANDARD ${number}`, description: `Texto ${number}.`, status },
  };
}

/** Un ejercicio tal como lo devuelve la lectura de la ficha; lo que no se pide, vacío. */
function drillRow(id: string, organization_id: string, overrides: Row = {}): Row {
  return {
    id,
    organization_id,
    title: `Ejercicio ${tag(id)}`,
    status: "published",
    created_by: null,
    min_age: 10,
    max_age: null,
    min_players: 6,
    max_players: 10,
    min_minutes: 10,
    max_minutes: 15,
    summary: null,
    objective: null,
    setup_md: null,
    equipment: [],
    video_url: null,
    diagram_media_id: null,
    updated_at: "2026-10-03T10:00:00.123456+00:00",
    drill_focus_areas: [],
    drill_principles: [],
    drill_standards: [],
    drill_coaching_points: [],
    drill_variants: [],
    media_assets: null,
    ...overrides,
  };
}

/** Una pizarra válida y pequeña: el 1 pasa al 2 y corta; después el 2 bota hacia el aro. */
const BOARD: Board = {
  version: 1,
  court: "half",
  tokens: [
    { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
    { id: "a2", kind: "attacker", label: "2", at: { x: 20, y: 60 } },
    { id: "ball", kind: "ball", at: { x: 53, y: 80 } },
  ],
  steps: [
    {
      note: "El 1 pasa al 2 y corta",
      moves: [
        { token: "ball", kind: "pass", to: { x: 23, y: 60 } },
        { token: "a1", kind: "cut", to: { x: 50, y: 30 } },
      ],
    },
    { moves: [{ token: "a2", kind: "dribble", to: { x: 30, y: 25 } }] },
  ],
};

/**
 * Lo que puede traer `drills.board` sin ser una pizarra: la base solo mira que sea un objeto de
 * la versión 1 y que no pase de 32 kB, así que la forma entera la comprueba la app al leer.
 */
const NOT_A_BOARD: Array<[string, unknown]> = [
  ["null (el ejercicio no tiene)", null],
  ["otra versión", { ...BOARD, version: 2 }],
  ["sin fichas", { ...BOARD, tokens: [] }],
  [
    "un movimiento de una ficha que no existe",
    { ...BOARD, steps: [{ moves: [{ token: "nadie", kind: "cut", to: { x: 1, y: 1 } }] }] },
  ],
  [
    "una ficha fuera de la pista",
    { ...BOARD, tokens: [{ id: "a1", kind: "attacker", at: { x: 50, y: 101 } }], steps: [] },
  ],
  ["un objeto de la versión 1 sin nada más", { version: 1 }],
  ["un texto", "una pizarra"],
];

/**
 * Las columnas de primer nivel de un `select`: lo anidado (entre paréntesis) fuera, de dentro
 * afuera. El doble de la base no mira la cadena del `select`, así que lo que se pide se
 * comprueba sobre la propia cadena.
 */
function topLevelColumns(columns: string): string[] {
  let flat = columns;
  while (/\([^()]*\)/.test(flat)) flat = flat.replace(/\([^()]*\)/g, "");
  return flat.split(",").map((column) => column.trim());
}

// ── Las columnas ─────────────────────────────────────────────────────────────────────────

describe("las columnas que se piden", () => {
  it.each([
    ["la lista (SUMMARY_COLUMNS)", SUMMARY_COLUMNS],
    ["la ficha (DETAIL_COLUMNS)", DETAIL_COLUMNS],
  ])("%s pide la pizarra del ejercicio, como columna suya", (_name, columns) => {
    expect(topLevelColumns(columns)).toContain("board");
  });

  it("los relacionados (RELATED_COLUMNS) no la piden: se leen hasta mil filas para enseñar unas pocas", () => {
    expect(topLevelColumns(RELATED_COLUMNS)).not.toContain("board");
  });
});

// ── searchDrills ─────────────────────────────────────────────────────────────────────────

describe("searchDrills", () => {
  const rows = [
    drillRow(uuid(2), ORG, {
      title: "Rebote + salida",
      created_by: SOMEONE,
      min_age: 12,
      max_age: 14,
      min_players: 6,
      max_players: 12,
      min_minutes: 10,
      max_minutes: 15,
      drill_focus_areas: [focusLink(F2, 2), focusLink(F1, 1)],
    }),
  ];

  it("llama a search_drills con las claves presentes y nada más", async () => {
    const calls = install({ search_drills: rows });

    await searchDrills(CTX, { q: "transicion", age: 12 });

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("search_drills");
    expect(calls[0].args).toEqual({ p_org: ORG, p_q: "transicion", p_age: 12 });
    expect(Object.keys(calls[0].args ?? {}).sort()).toEqual(["p_age", "p_org", "p_q"]);
  });

  it("sin filtros solo manda el club: ninguna clave a null", async () => {
    const calls = install({ search_drills: rows });

    await searchDrills(CTX, {});

    expect(calls[0].args).toEqual({ p_org: ORG });
    expect(Object.keys(calls[0].args ?? {})).toEqual(["p_org"]);
  });

  it("cada filtro va a su argumento", async () => {
    const calls = install({ search_drills: rows });

    await searchDrills(CTX, {
      q: "pase",
      focus: "rebote",
      principle: "transicion",
      age: 12,
      players: 8,
      minutes: 15,
    });

    expect(calls[0].args).toEqual({
      p_org: ORG,
      p_q: "pase",
      p_focus: "rebote",
      p_principle: "transicion",
      p_age: 12,
      p_players: 8,
      p_minutes: 15,
    });
  });

  it("un texto vacío o en blanco no es «ausente» para la función: no se manda", async () => {
    const calls = install({ search_drills: rows });

    await searchDrills(CTX, { q: "", focus: "", principle: "  " });
    await searchDrills(CTX, { q: "   " });

    expect(calls[0].args).toEqual({ p_org: ORG });
    expect(calls[1].args).toEqual({ p_org: ORG });
  });

  it("un filtro con undefined tampoco se manda", async () => {
    const calls = install({ search_drills: rows });

    await searchDrills(CTX, { q: undefined, age: undefined, focus: "rebote" });

    expect(calls[0].args).toEqual({ p_org: ORG, p_focus: "rebote" });
  });

  it("ordena por título y pide uno más que el tope para saber si hay más", async () => {
    const calls = install({ search_drills: rows });

    await searchDrills(CTX, {});

    expect(calls[0].order).toEqual(["title"]);
    expect(calls[0].limit).toBe(101);
  });

  it("devuelve los ejercicios en el orden del título", async () => {
    install({
      search_drills: [
        drillRow(uuid(3), ORG, { title: "Zona" }),
        drillRow(uuid(4), ORG, { title: "Ataque" }),
        drillRow(uuid(5), ORG, { title: "Defensa" }),
      ],
    });

    const { drills } = await searchDrills(CTX, {});

    expect(drills.map((drill) => drill.title)).toEqual(["Ataque", "Defensa", "Zona"]);
  });

  describe("el tope de 100", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        drillRow(uuid(1000 + i), ORG, { title: `Ejercicio ${String(i).padStart(3, "0")}` }),
      );

    it("con más de 100 se queda con los primeros 100 y dice que hay más", async () => {
      install({ search_drills: many(120) });

      const { drills, hasMore } = await searchDrills(CTX, {});

      expect(drills).toHaveLength(100);
      expect(drills[0].title).toBe("Ejercicio 000");
      expect(drills[99].title).toBe("Ejercicio 099");
      expect(hasMore).toBe(true);
    });

    it("con justo 101 enseña 100 y hay más: el 101 es la prueba", async () => {
      install({ search_drills: many(101) });

      const { drills, hasMore } = await searchDrills(CTX, {});

      expect(drills).toHaveLength(100);
      expect(drills.at(-1)?.title).toBe("Ejercicio 099");
      expect(hasMore).toBe(true);
    });

    it("con justo 100 los enseña todos y no hay más", async () => {
      install({ search_drills: many(100) });

      const { drills, hasMore } = await searchDrills(CTX, {});

      expect(drills).toHaveLength(100);
      expect(hasMore).toBe(false);
    });

    it("con menos de 100 no hay más", async () => {
      install({ search_drills: many(99) });

      const { drills, hasMore } = await searchDrills(CTX, {});

      expect(drills).toHaveLength(99);
      expect(hasMore).toBe(false);
    });
  });

  it("cada ejercicio sale como un DrillSummary, con sus objetivos en el orden del club", async () => {
    install({ search_drills: rows });

    const [drill] = (await searchDrills(CTX, {})).drills;

    expect(drill).toEqual({
      id: uuid(2),
      title: "Rebote + salida",
      status: "published",
      createdBy: SOMEONE,
      minAge: 12,
      maxAge: 14,
      minPlayers: 6,
      maxPlayers: 12,
      minMinutes: 10,
      maxMinutes: 15,
      focus: [
        { slug: `objetivo-${tag(F1)}`, name: `Objetivo ${tag(F1)}` },
        { slug: `objetivo-${tag(F2)}`, name: `Objetivo ${tag(F2)}` },
      ],
    });
  });

  it("la edad máxima abierta (null) y un autor desconocido (null) se conservan", async () => {
    install({ search_drills: [drillRow(uuid(2), ORG, { max_age: null, created_by: null })] });

    const [drill] = (await searchDrills(CTX, {})).drills;

    expect(drill.maxAge).toBeNull();
    expect(drill.createdBy).toBeNull();
  });

  it("un objetivo que no se ve (null) se descarta, y sin objetivos queda una lista vacía", async () => {
    install({
      search_drills: [
        drillRow(uuid(2), ORG, {
          drill_focus_areas: [{ focus_areas: null }, focusLink(F1, 1)],
        }),
        drillRow(uuid(3), ORG),
      ],
    });

    const { drills } = await searchDrills(CTX, {});

    expect(drills[0].focus.map((focus) => focus.slug)).toEqual([`objetivo-${tag(F1)}`]);
    expect(drills[1].focus).toEqual([]);
  });

  describe("la pizarra", () => {
    it("un ejercicio con pizarra la lleva, para la miniatura de su tarjeta", async () => {
      install({ search_drills: [drillRow(uuid(2), ORG, { board: BOARD })] });

      const [drill] = (await searchDrills(CTX, {})).drills;

      expect(drill.board).toEqual(BOARD);
    });

    it("llega ya validada: lo que la forma no conoce no viaja", async () => {
      const raw = { ...BOARD, autor: "alguien", tokens: BOARD.tokens.map((token) => ({ ...token, color: "x" })) };
      install({ search_drills: [drillRow(uuid(2), ORG, { board: raw })] });

      const [drill] = (await searchDrills(CTX, {})).drills;

      expect(drill.board).toEqual(BOARD);
      expect(drill.board).not.toHaveProperty("autor");
      expect(drill.board?.tokens[0]).not.toHaveProperty("color");
    });

    it("sin la columna en la fila, la clave `board` no está", async () => {
      install({ search_drills: [drillRow(uuid(2), ORG)] });

      const [drill] = (await searchDrills(CTX, {})).drills;

      expect(drill).not.toHaveProperty("board");
    });

    it.each(NOT_A_BOARD)("%s: la clave `board` no está, y el ejercicio sale igual", async (_name, board) => {
      install({ search_drills: [drillRow(uuid(2), ORG, { title: "Con la pizarra rota", board })] });

      const { drills } = await searchDrills(CTX, {});

      expect(drills).toHaveLength(1);
      // Ni `undefined` ni `null`: la clave no viaja.
      expect(drills[0]).not.toHaveProperty("board");
      expect(drills[0].title).toBe("Con la pizarra rota");
    });

    it("cada ejercicio lleva la suya: una rota no deja sin pizarra a los demás", async () => {
      install({
        search_drills: [
          drillRow(uuid(2), ORG, { title: "A", board: BOARD }),
          drillRow(uuid(3), ORG, { title: "B", board: { ...BOARD, version: 2 } }),
          drillRow(uuid(4), ORG, { title: "C", board: { ...BOARD, court: "full" } }),
        ],
      });

      const { drills } = await searchDrills(CTX, {});

      expect(drills.map((drill) => drill.board?.court ?? null)).toEqual(["half", null, "full"]);
    });
  });

  it("sin resultados, una lista vacía", async () => {
    install({ search_drills: [] });

    await expect(searchDrills(CTX, { q: "nada" })).resolves.toEqual({ drills: [], hasMore: false });
  });

  it("un error de la búsqueda se registra y lanza: no es «sin resultados»", async () => {
    install({}, { failing: { search_drills: FAILURE } });

    await expectReadError(() => searchDrills(CTX, {}), "drills.search");
  });
});

// ── getFocusAreas ────────────────────────────────────────────────────────────────────────

describe("getFocusAreas", () => {
  const focusRow = (id: string, organization_id: string, sort: number): Row => ({
    id,
    organization_id,
    slug: `objetivo-${tag(id)}`,
    name: `Objetivo ${tag(id)}`,
    sort,
  });

  it("son los objetivos de este club, en su orden, solo con id, slug y nombre", async () => {
    const calls = install({
      focus_areas: [
        focusRow(F2, ORG, 2),
        focusRow(uuid(13), OTHER_ORG, 0),
        focusRow(F1, ORG, 1),
      ],
    });

    const result = await getFocusAreas(CTX);

    expect(result).toEqual([
      { id: F1, slug: `objetivo-${tag(F1)}`, name: `Objetivo ${tag(F1)}` },
      { id: F2, slug: `objetivo-${tag(F2)}`, name: `Objetivo ${tag(F2)}` },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("focus_areas");
    expect(calls[0].eq).toEqual({ organization_id: ORG });
    expect(calls[0].order).toEqual(["sort", "id"]);
  });

  it("un error de lectura se registra y lanza", async () => {
    install({}, { failing: { focus_areas: FAILURE } });

    await expectReadError(() => getFocusAreas(CTX), "drills.focus-areas");
  });
});

// ── getDrill ─────────────────────────────────────────────────────────────────────────────

describe("getDrill", () => {
  it.each(["abc", "", "../x", "12345", `${DRILL_ID}x`, DRILL_ID.replaceAll("-", ""), "null"])(
    "«%s» no es un uuid: null, sin consultar nada",
    async (drillId) => {
      const calls = install({ drills: [drillRow(DRILL_ID, ORG)] });

      await expect(getDrill(CTX, drillId)).resolves.toBeNull();

      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      expect(mocks.signedUrl).not.toHaveBeenCalled();
    },
  );

  it("un uuid que no existe es null", async () => {
    install({ drills: [drillRow(uuid(2), ORG)] });

    await expect(getDrill(CTX, DRILL_ID)).resolves.toBeNull();
  });

  it("filtra por club y por id: el ejercicio de otro club es null, aunque RLS lo dejara ver", async () => {
    const calls = install({ drills: [drillRow(DRILL_ID, OTHER_ORG, { title: "De otro club" })] });

    const result = await getDrill(CTX, DRILL_ID);

    expect(result).toBeNull();
    expect(calls[0].table).toBe("drills");
    expect(calls[0].eq).toEqual({ organization_id: ORG, id: DRILL_ID });
  });

  it("un ejercicio que no se encuentra no consulta el resto", async () => {
    const calls = install({ drills: [] });

    await getDrill(CTX, DRILL_ID);

    expect(calls.map((call) => call.table)).toEqual(["drills"]);
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });

  describe("la ficha", () => {
    const full = drillRow(DRILL_ID, ORG, {
      title: "Rebote + salida",
      status: "draft",
      created_by: ME,
      min_age: 12,
      max_age: 14,
      min_players: 6,
      max_players: 12,
      min_minutes: 10,
      max_minutes: 15,
      summary: "Un resumen.",
      objective: "Asegurar el rebote.",
      setup_md: "Cinco jugadores.",
      equipment: ["Balones", "Conos"],
      video_url: "https://youtu.be/abc",
      diagram_media_id: MEDIA,
      updated_at: "2026-10-03T10:00:00.123456+00:00",
      drill_focus_areas: [focusLink(F2, 2), focusLink(F1, 1)],
      drill_principles: [
        {
          principle_id: uuid(22),
          game_principles: { id: uuid(22), slug: "segundo", title: "Segundo", sort: 2, status: "published" },
        },
        {
          principle_id: uuid(21),
          game_principles: { id: uuid(21), slug: "primero", title: "Primero", sort: 1, status: "published" },
        },
      ],
      drill_standards: [
        {
          standard_id: uuid(32),
          standards: { id: uuid(32), number: 5, title: "CINCO", description: "Texto cinco.", status: "published" },
        },
        {
          standard_id: uuid(31),
          standards: { id: uuid(31), number: 3, title: "TRES", description: "Texto tres.", status: "published" },
        },
      ],
      drill_coaching_points: [
        { text: "Tercero", is_key: false, sort: 2 },
        { text: "Primero", is_key: true, sort: 0 },
        { text: "Segundo", is_key: false, sort: 1 },
      ],
      drill_variants: [
        { title: "Segunda", description: null, sort: 1 },
        { title: "Primera", description: "Con un defensor más.", sort: 0 },
      ],
      media_assets: { path: PATH },
    });

    const sections = [sectionRow(uuid(50), ORG, { slug: "como-jugamos", content_kind: "principles" })];

    it("devuelve el DrillDetail completo, en su orden", async () => {
      install({ drills: [full], way_sections: sections }, { userId: ME });
      mocks.signedUrl.mockResolvedValue("http://storage.test/sign/x.png?token=t");

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail).toEqual({
        id: DRILL_ID,
        title: "Rebote + salida",
        status: "draft",
        createdBy: ME,
        minAge: 12,
        maxAge: 14,
        minPlayers: 6,
        maxPlayers: 12,
        minMinutes: 10,
        maxMinutes: 15,
        focus: [
          { slug: `objetivo-${tag(F1)}`, name: `Objetivo ${tag(F1)}` },
          { slug: `objetivo-${tag(F2)}`, name: `Objetivo ${tag(F2)}` },
        ],
        summary: "Un resumen.",
        objective: "Asegurar el rebote.",
        setupMd: "Cinco jugadores.",
        equipment: ["Balones", "Conos"],
        videoUrl: "https://youtu.be/abc",
        diagramMediaId: MEDIA,
        diagramUrl: "http://storage.test/sign/x.png?token=t",
        coachingPoints: [
          { text: "Primero", isKey: true },
          { text: "Segundo", isKey: false },
          { text: "Tercero", isKey: false },
        ],
        variants: [
          { title: "Primera", description: "Con un defensor más." },
          { title: "Segunda", description: null },
        ],
        focusAreaIds: [F1, F2],
        principleIds: [uuid(21), uuid(22)],
        standardIds: [uuid(31), uuid(32)],
        principles: [
          { id: uuid(21), slug: "primero", title: "Primero" },
          { id: uuid(22), slug: "segundo", title: "Segundo" },
        ],
        principlesSectionSlug: "como-jugamos",
        standards: [
          { id: uuid(31), number: 3, title: "TRES", description: "Texto tres." },
          { id: uuid(32), number: 5, title: "CINCO", description: "Texto cinco." },
        ],
        createdByMe: true,
        updatedAt: "2026-10-03T10:00:00.123456+00:00",
      });
    });

    it("updatedAt queda tal cual lo da PostgREST: microsegundos y desfase", async () => {
      install({ drills: [{ ...full, updated_at: "2026-10-03T10:00:00.100000+00:00" }] }, { userId: ME });

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail?.updatedAt).toBe("2026-10-03T10:00:00.100000+00:00");
    });

    it("un ejercicio sin nada más: listas vacías y nulos", async () => {
      install({ drills: [drillRow(DRILL_ID, ORG)] }, { userId: ME });

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail).toMatchObject({
        summary: null,
        objective: null,
        setupMd: null,
        equipment: [],
        videoUrl: null,
        diagramMediaId: null,
        diagramUrl: null,
        coachingPoints: [],
        variants: [],
        focusAreaIds: [],
        principleIds: [],
        standardIds: [],
        principles: [],
        principlesSectionSlug: null,
        standards: [],
      });
    });

    it("descarta un Standard o un principio que no se ve (null) o que no está publicado", async () => {
      install(
        {
          drills: [
            {
              ...full,
              drill_principles: [
                { principle_id: uuid(24), game_principles: null },
                principleLink(uuid(23), "borrador", 0, "draft"),
                principleLink(uuid(21), "primero", 1),
              ],
              drill_standards: [
                { standard_id: uuid(34), standards: null },
                standardLink(uuid(33), 1, "draft"),
                standardLink(uuid(31), 3),
              ],
            },
          ],
        },
        { userId: ME },
      );

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail?.principles).toEqual([{ id: uuid(21), slug: "primero", title: "Primero" }]);
      expect(detail?.standards).toEqual([
        { id: uuid(31), number: 3, title: "STANDARD 3", description: "Texto 3." },
      ]);
      // Lo que no se enseña sigue vinculado: ver «los ids vinculados no dependen de lo que se ve».
      expect(detail?.principleIds).toEqual([uuid(21), uuid(23), uuid(24)]);
      expect(detail?.standardIds).toEqual([uuid(31), uuid(33), uuid(34)]);
    });

    // «Archivar» un Standard o un principio es pasarlo a borrador, y puede volver a publicarse.
    // La ficha solo enseña lo publicado, pero un formulario de edición que reconstruyera los
    // vínculos desde lo que enseña desvincularía en silencio lo que está en borrador al
    // guardar: `principleIds` y `standardIds` llevan TODOS los vínculos, vea o no la persona el
    // elemento.
    describe("los ids vinculados no dependen de lo que se ve", () => {
      it("un Standard publicado y uno en borrador: se enseña uno, pero los dos siguen vinculados", async () => {
        const drill = drillRow(DRILL_ID, ORG, {
          drill_standards: [standardLink(uuid(32), 5, "draft"), standardLink(uuid(31), 3)],
        });
        install({ drills: [drill] }, { userId: ME });

        const detail = await getDrill(CTX, DRILL_ID);

        expect(detail?.standards.map((standard) => standard.id)).toEqual([uuid(31)]);
        expect(detail?.standardIds).toEqual([uuid(31), uuid(32)]);
      });

      it("un principio publicado y uno en borrador: igual", async () => {
        const drill = drillRow(DRILL_ID, ORG, {
          drill_principles: [principleLink(uuid(22), "segundo", 2, "draft"), principleLink(uuid(21), "primero", 1)],
        });
        install({ drills: [drill] }, { userId: ME });

        const detail = await getDrill(CTX, DRILL_ID);

        expect(detail?.principles.map((principle) => principle.id)).toEqual([uuid(21)]);
        expect(detail?.principleIds).toEqual([uuid(21), uuid(22)]);
      });

      it("lo que RLS esconde a quien entrena (llega null) también sigue vinculado", async () => {
        const drill = drillRow(DRILL_ID, ORG, {
          drill_principles: [{ principle_id: uuid(22), game_principles: null }, principleLink(uuid(21), "primero", 1)],
          drill_standards: [{ standard_id: uuid(32), standards: null }, standardLink(uuid(31), 3)],
        });
        install({ drills: [drill] }, { userId: ME });

        const detail = await getDrill(CTX, DRILL_ID);

        expect(detail?.principles).toHaveLength(1);
        expect(detail?.principleIds).toEqual([uuid(21), uuid(22)]);
        expect(detail?.standards).toHaveLength(1);
        expect(detail?.standardIds).toEqual([uuid(31), uuid(32)]);
      });

      it("un ejercicio sin vínculos: listas vacías", async () => {
        install({ drills: [drillRow(DRILL_ID, ORG)] }, { userId: ME });

        const detail = await getDrill(CTX, DRILL_ID);

        expect(detail?.principleIds).toEqual([]);
        expect(detail?.standardIds).toEqual([]);
      });
    });

    it("un objetivo que no se ve (null) se descarta de la lista y de los ids", async () => {
      install(
        { drills: [{ ...full, drill_focus_areas: [{ focus_areas: null }, focusLink(F1, 1)] }] },
        { userId: ME },
      );

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail?.focusAreaIds).toEqual([F1]);
      expect(detail?.focus).toHaveLength(1);
    });
  });

  describe("la pizarra", () => {
    it("la ficha de un ejercicio con pizarra la lleva, ya validada", async () => {
      const raw = { ...BOARD, autor: "alguien" };
      install({ drills: [drillRow(DRILL_ID, ORG, { board: raw })] }, { userId: ME });

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail?.board).toEqual(BOARD);
      expect(detail?.board).not.toHaveProperty("autor");
    });

    it("sin la columna en la fila, la clave `board` no está", async () => {
      install({ drills: [drillRow(DRILL_ID, ORG)] }, { userId: ME });

      expect(await getDrill(CTX, DRILL_ID)).not.toHaveProperty("board");
    });

    it.each(NOT_A_BOARD)("%s: la clave `board` no está, y la ficha sale entera", async (_name, board) => {
      install({ drills: [drillRow(DRILL_ID, ORG, { board, objective: "Asegurar el rebote." })] }, { userId: ME });

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail).not.toBeNull();
      expect(detail).not.toHaveProperty("board");
      expect(detail).toMatchObject({ id: DRILL_ID, objective: "Asegurar el rebote." });
    });

    it("no quita el diagrama: un ejercicio con las dos cosas trae la pizarra y la imagen firmada", async () => {
      // Quien pinta decide cuál enseña (en la ficha manda la pizarra); la lectura trae las dos,
      // porque el formulario de edición sigue enseñando la imagen subida.
      install({
        drills: [drillRow(DRILL_ID, ORG, { board: BOARD, diagram_media_id: MEDIA, media_assets: { path: PATH } })],
      });
      mocks.signedUrl.mockResolvedValue("http://storage.test/sign/x.png?token=t");

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail?.board).toEqual(BOARD);
      expect(detail?.diagramUrl).toBe("http://storage.test/sign/x.png?token=t");
      expect(detail?.diagramMediaId).toBe(MEDIA);
    });
  });

  describe("createdByMe", () => {
    it("es true si el autor es quien tiene la sesión", async () => {
      install({ drills: [drillRow(DRILL_ID, ORG, { created_by: ME })] }, { userId: ME });

      expect((await getDrill(CTX, DRILL_ID))?.createdByMe).toBe(true);
    });

    it("es false si lo escribió otra persona", async () => {
      install({ drills: [drillRow(DRILL_ID, ORG, { created_by: SOMEONE })] }, { userId: ME });

      expect((await getDrill(CTX, DRILL_ID))?.createdByMe).toBe(false);
    });

    it("es false si no consta el autor (el seed), también para quien no tiene usuario", async () => {
      install({ drills: [drillRow(DRILL_ID, ORG, { created_by: null })] }, { userId: ME });
      expect((await getDrill(CTX, DRILL_ID))?.createdByMe).toBe(false);

      install({ drills: [drillRow(DRILL_ID, ORG, { created_by: null })] }, { userId: null });
      expect((await getDrill(CTX, DRILL_ID))?.createdByMe).toBe(false);
    });

    it("es false si Auth no devuelve a nadie", async () => {
      install({ drills: [drillRow(DRILL_ID, ORG, { created_by: ME })] }, { userId: null });

      expect((await getDrill(CTX, DRILL_ID))?.createdByMe).toBe(false);
    });
  });

  describe("el diagrama", () => {
    it("se firma con la ruta de su ficha", async () => {
      install({
        drills: [drillRow(DRILL_ID, ORG, { diagram_media_id: MEDIA, media_assets: { path: PATH } })],
      });
      mocks.signedUrl.mockResolvedValue("http://storage.test/sign/x.png?token=t");

      const detail = await getDrill(CTX, DRILL_ID);

      expect(mocks.signedUrl).toHaveBeenCalledTimes(1);
      expect(mocks.signedUrl).toHaveBeenCalledWith(PATH);
      expect(detail?.diagramUrl).toBe("http://storage.test/sign/x.png?token=t");
      expect(detail?.diagramMediaId).toBe(MEDIA);
    });

    it("sin diagrama no se firma nada", async () => {
      install({ drills: [drillRow(DRILL_ID, ORG)] });

      const detail = await getDrill(CTX, DRILL_ID);

      expect(mocks.signedUrl).not.toHaveBeenCalled();
      expect(detail?.diagramUrl).toBeNull();
    });

    it("una ficha sin objeto en Storage (firmar da null) deja la ficha sin diagrama, sin romperla", async () => {
      install({
        drills: [drillRow(DRILL_ID, ORG, { diagram_media_id: MEDIA, media_assets: { path: PATH } })],
      });
      mocks.signedUrl.mockResolvedValue(null);

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail).not.toBeNull();
      expect(detail?.diagramUrl).toBeNull();
      expect(detail?.diagramMediaId).toBe(MEDIA);
    });

    it("un diagrama cuya ficha no se ve (media_assets null) no se firma", async () => {
      install({ drills: [drillRow(DRILL_ID, ORG, { diagram_media_id: MEDIA, media_assets: null })] });

      const detail = await getDrill(CTX, DRILL_ID);

      expect(mocks.signedUrl).not.toHaveBeenCalled();
      expect(detail?.diagramUrl).toBeNull();
    });
  });

  describe("principlesSectionSlug", () => {
    const withSections = (sections: Row[]) =>
      install({ drills: [drillRow(DRILL_ID, ORG)], way_sections: sections });

    it("es el slug de la sección publicada de principios del club", async () => {
      const calls = withSections([sectionRow(uuid(50), ORG, { slug: "como-jugamos", content_kind: "principles" })]);

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail?.principlesSectionSlug).toBe("como-jugamos");
      const query = calls.find((call) => call.table === "way_sections");
      expect(query?.eq).toEqual({
        organization_id: ORG,
        status: "published",
        content_kind: "principles",
      });
      expect(query?.limit).toBe(1);
    });

    it("si hay varias, la primera por orden", async () => {
      withSections([
        sectionRow(uuid(52), ORG, { slug: "tercera", content_kind: "principles", sort: 3 }),
        sectionRow(uuid(51), ORG, { slug: "primera", content_kind: "principles", sort: 1 }),
        sectionRow(uuid(53), ORG, { slug: "segunda", content_kind: "principles", sort: 2 }),
      ]);

      expect((await getDrill(CTX, DRILL_ID))?.principlesSectionSlug).toBe("primera");
    });

    it("ignora los borradores, otros tipos de sección y las de otro club", async () => {
      const calls = withSections([
        sectionRow(uuid(54), ORG, { slug: "borrador", content_kind: "principles", status: "draft", sort: 0 }),
        sectionRow(uuid(55), ORG, { slug: "valores", content_kind: "values", sort: 0 }),
        sectionRow(uuid(56), OTHER_ORG, { slug: "de-otro-club", content_kind: "principles", sort: 0 }),
      ]);

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail?.principlesSectionSlug).toBeNull();
      expect(calls.some((call) => call.table === "way_sections")).toBe(true);
    });

    it("sin secciones es null", async () => {
      withSections([]);

      expect((await getDrill(CTX, DRILL_ID))?.principlesSectionSlug).toBeNull();
    });
  });

  describe("una avería no es «no existe»", () => {
    it("un error al leer el ejercicio lanza", async () => {
      install({}, { failing: { drills: FAILURE } });

      await expectReadError(() => getDrill(CTX, DRILL_ID), "drills.detail");
    });

    it("un error al leer la sección de principios lanza", async () => {
      install({ drills: [drillRow(DRILL_ID, ORG)] }, { failing: { way_sections: FAILURE } });

      await expectReadError(() => getDrill(CTX, DRILL_ID), "drills.principles-section");
    });

    it("un error al comprobar quién es el usuario lanza", async () => {
      install({ drills: [drillRow(DRILL_ID, ORG)] }, { claimsError: FAILURE });

      await expectReadError(() => getDrill(CTX, DRILL_ID), "drills.viewer");
    });
  });
});

// ── getRelatedDrills ─────────────────────────────────────────────────────────────────────

describe("getRelatedDrills", () => {
  const P1 = uuid(21);
  const P2 = uuid(22);
  const P3 = uuid(23);
  const NOT_ASKED = uuid(29);

  /**
   * Un ejercicio tal como lo devuelve la lectura de relacionados: su fila de lista y, anidados,
   * los vínculos con los principios pedidos (la consulta solo trae esos).
   */
  function related(n: number, title: string, principleIds: string[], overrides: Row = {}): Row {
    return drillRow(uuid(200 + n), ORG, {
      title,
      drill_principles: principleIds.map((principle_id) => ({ principle_id })),
      ...overrides,
    });
  }

  it("sin principios no consulta nada: un objeto vacío", async () => {
    const calls = install({ drills: [related(1, "Un ejercicio", [P1])] });

    await expect(getRelatedDrills(CTX, [])).resolves.toEqual({});

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("una sola consulta para todos los principios, del club y publicados", async () => {
    const calls = install({ drills: [related(1, "Un ejercicio", [P1, P2])] });

    await getRelatedDrills(CTX, [P1, P2, P3]);

    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("drills");
    // Filtra por club y por estado ella misma: RLS también deja ver al autor sus borradores y a
    // dirección todo, y aquí solo cuenta lo publicado.
    expect(calls[0].eq).toEqual({ organization_id: ORG, status: "published" });
    expect(calls[0].embedded.drill_principles.in).toEqual({ principle_id: [P1, P2, P3] });
  });

  it("lee por título (y por id, para desempatar) y con un tope", async () => {
    const calls = install({ drills: [related(1, "Un ejercicio", [P1])] });

    await getRelatedDrills(CTX, [P1]);

    expect(calls[0].order).toEqual(["title", "id"]);
    // El tope es el de la API (`max_rows`): explícito, para que no sea un corte silencioso.
    expect(calls[0].limit).toBe(1000);
  });

  it("tiene una entrada por cada principio pedido, también los que no tienen ejercicios", async () => {
    install({ drills: [related(1, "Un ejercicio", [P1])] });

    const result = await getRelatedDrills(CTX, [P1, P2, P3]);

    expect(Object.keys(result).sort()).toEqual([P1, P2, P3].sort());
    expect(result[P1].map((drill) => drill.title)).toEqual(["Un ejercicio"]);
    expect(result[P2]).toEqual([]);
    expect(result[P3]).toEqual([]);
  });

  it("sin ningún ejercicio, todas las entradas vacías", async () => {
    install({ drills: [] });

    await expect(getRelatedDrills(CTX, [P1, P2])).resolves.toEqual({ [P1]: [], [P2]: [] });
  });

  it("un principio repetido en la petición es una sola entrada", async () => {
    install({ drills: [related(1, "Un ejercicio", [P1])] });

    const result = await getRelatedDrills(CTX, [P1, P1]);

    expect(Object.keys(result)).toEqual([P1]);
    expect(result[P1]).toHaveLength(1);
  });

  it("solo salen los publicados: ni borradores ni archivados", async () => {
    install({
      drills: [
        related(1, "Publicado", [P1]),
        related(2, "Borrador", [P1], { status: "draft" }),
        related(3, "Archivado", [P1], { status: "archived" }),
      ],
    });

    const result = await getRelatedDrills(CTX, [P1]);

    expect(result[P1].map((drill) => drill.title)).toEqual(["Publicado"]);
  });

  it("solo salen los del club: el ejercicio de otro club no, aunque RLS lo dejara ver", async () => {
    install({
      drills: [
        related(1, "Del club", [P1]),
        related(2, "De otro club", [P1], { organization_id: OTHER_ORG }),
      ],
    });

    const result = await getRelatedDrills(CTX, [P1]);

    expect(result[P1].map((drill) => drill.title)).toEqual(["Del club"]);
  });

  it("un ejercicio de un principio que no se ha pedido no sale", async () => {
    install({
      drills: [
        related(1, "Del principio pedido", [P1]),
        related(2, "De otro principio", [NOT_ASKED]),
        related(3, "Sin principios", []),
      ],
    });

    const result = await getRelatedDrills(CTX, [P1]);

    expect(Object.keys(result)).toEqual([P1]);
    expect(result[P1].map((drill) => drill.title)).toEqual(["Del principio pedido"]);
  });

  it("corta en tres por principio, en orden de título", async () => {
    install({
      drills: [
        related(1, "Delta", [P1]),
        related(2, "Alfa", [P1]),
        related(3, "Echo", [P1]),
        related(4, "Bravo", [P1]),
        related(5, "Charlie", [P1]),
      ],
    });

    const result = await getRelatedDrills(CTX, [P1]);

    expect(result[P1].map((drill) => drill.title)).toEqual(["Alfa", "Bravo", "Charlie"]);
  });

  it("el corte es de cada principio: los de uno no gastan el cupo de otro", async () => {
    install({
      drills: [
        related(1, "Alfa", [P1]),
        related(2, "Bravo", [P1]),
        related(3, "Charlie", [P1]),
        related(4, "Delta", [P1]),
        related(5, "Echo", [P2]),
        related(6, "Foxtrot", [P2]),
      ],
    });

    const result = await getRelatedDrills(CTX, [P1, P2]);

    expect(result[P1].map((drill) => drill.title)).toEqual(["Alfa", "Bravo", "Charlie"]);
    expect(result[P2].map((drill) => drill.title)).toEqual(["Echo", "Foxtrot"]);
  });

  it("un ejercicio de varios principios sale en cada uno, y cuenta en el cupo de cada uno", async () => {
    install({
      drills: [
        related(1, "Alfa", [P1, P2]),
        related(2, "Bravo", [P2]),
        related(3, "Charlie", [P1, P2]),
        related(4, "Delta", [P2]),
      ],
    });

    const result = await getRelatedDrills(CTX, [P1, P2]);

    expect(result[P1].map((drill) => drill.title)).toEqual(["Alfa", "Charlie"]);
    expect(result[P2].map((drill) => drill.title)).toEqual(["Alfa", "Bravo", "Charlie"]);
  });

  it("el orden es el del título aunque las filas lleguen de otro modo, y a igualdad, el del id", async () => {
    install({
      drills: [related(3, "Misma", [P1]), related(2, "Zeta", [P1]), related(1, "Misma", [P1])],
    });

    const result = await getRelatedDrills(CTX, [P1]);

    expect(result[P1].map((drill) => [drill.title, drill.id])).toEqual([
      ["Misma", uuid(201)],
      ["Misma", uuid(203)],
      ["Zeta", uuid(202)],
    ]);
  });

  it("cada ejercicio sale como un DrillSummary, con sus objetivos en el orden del club", async () => {
    install({
      drills: [
        related(1, "Rebote + salida", [P1], {
          created_by: SOMEONE,
          min_age: 12,
          max_age: 14,
          min_players: 6,
          max_players: 12,
          min_minutes: 10,
          max_minutes: 15,
          drill_focus_areas: [focusLink(F2, 2), focusLink(F1, 1)],
        }),
      ],
    });

    const result = await getRelatedDrills(CTX, [P1]);

    expect(result[P1]).toEqual([
      {
        id: uuid(201),
        title: "Rebote + salida",
        status: "published",
        createdBy: SOMEONE,
        minAge: 12,
        maxAge: 14,
        minPlayers: 6,
        maxPlayers: 12,
        minMinutes: 10,
        maxMinutes: 15,
        focus: [
          { slug: `objetivo-${tag(F1)}`, name: `Objetivo ${tag(F1)}` },
          { slug: `objetivo-${tag(F2)}`, name: `Objetivo ${tag(F2)}` },
        ],
      },
    ]);
  });

  it("un ejercicio con pizarra la lleva, en cada principio en el que sale", async () => {
    install({ drills: [related(1, "Con pizarra", [P1, P2], { board: BOARD })] });

    const result = await getRelatedDrills(CTX, [P1, P2]);

    expect(result[P1][0].board).toEqual(BOARD);
    expect(result[P2][0].board).toEqual(BOARD);
  });

  it("sin pizarra, o con una que no cumple la forma, la clave `board` no está", async () => {
    install({
      drills: [
        related(1, "A sin columna", [P1]),
        related(2, "B a null", [P1], { board: null }),
        related(3, "C rota", [P1], { board: { ...BOARD, version: 2 } }),
      ],
    });

    const result = await getRelatedDrills(CTX, [P1]);

    expect(result[P1]).toHaveLength(3);
    for (const drill of result[P1]) expect(drill, drill.title).not.toHaveProperty("board");
  });

  it("un error de lectura se registra y lanza: no es «sin ejercicios»", async () => {
    install({}, { failing: { drills: FAILURE } });

    await expectReadError(() => getRelatedDrills(CTX, [P1]), "drills.related");
  });
});

// ── getDrillFormOptions ──────────────────────────────────────────────────────────────────

describe("getDrillFormOptions", () => {
  const store = (): Store => ({
    focus_areas: [
      { id: F2, organization_id: ORG, slug: "tiro", name: "Tiro", sort: 2 },
      { id: F1, organization_id: ORG, slug: "rebote", name: "Rebote", sort: 1 },
      { id: uuid(13), organization_id: OTHER_ORG, slug: "ajeno", name: "Ajeno", sort: 0 },
    ],
    game_principles: [
      principleRow(uuid(21), ORG, { sort: 2, title: "Segundo" }),
      principleRow(uuid(22), ORG, { sort: 1, title: "Primero", principle_points: [pointRow(uuid(61), ORG, uuid(22))] }),
      principleRow(uuid(23), ORG, { sort: 0, status: "draft", title: "Borrador" }),
      principleRow(uuid(24), OTHER_ORG, { sort: 0, title: "Ajeno" }),
    ],
    standards: [
      standardRow(uuid(31), ORG, { sort: 2, number: 4 }),
      standardRow(uuid(32), ORG, { sort: 1, number: 3 }),
      standardRow(uuid(33), ORG, { sort: 0, number: 1, status: "draft" }),
      standardRow(uuid(34), OTHER_ORG, { sort: 0, number: 2 }),
    ],
  });

  it("junta los objetivos, los principios y los Standards publicados de este club, en su orden", async () => {
    install(store());

    const options = await getDrillFormOptions(CTX);

    expect(options.focusAreas.map((focus) => focus.slug)).toEqual(["rebote", "tiro"]);
    expect(options.principles.map((principle) => principle.title)).toEqual(["Primero", "Segundo"]);
    expect(options.principles[0].points).toHaveLength(1);
    expect(options.standards.map((standard) => standard.number)).toEqual([3, 4]);
  });

  it("un error de lectura en cualquiera de las tres lanza", async () => {
    install(store(), { failing: { standards: FAILURE } });

    await expectReadError(() => getDrillFormOptions(CTX), "methodology.standards");
  });
});
