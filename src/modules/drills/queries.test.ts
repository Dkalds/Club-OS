import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CTX,
  fakeSupabase,
  FAILURE,
  ORG,
  OTHER_ORG,
  pointRow,
  principleRow,
  sectionRow,
  standardRow,
  tag,
  uuid,
  type Failure,
  type Row,
  type Store,
} from "@/modules/methodology/test-support";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  logError: vi.fn(),
  signedUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));
vi.mock("@/modules/media/storage", () => ({ signedUrl: mocks.signedUrl }));

import { getDrill, getDrillFormOptions, getFocusAreas, searchDrills } from "./queries";

// Las lecturas de la biblioteca, contra un doble de la base de datos que aplica los filtros y el
// orden que recibe (ver `methodology/test-support.ts`). Lo que se fija aquí es lo que RLS no
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

  it("ordena por título y se queda con 100 como mucho", async () => {
    const calls = install({ search_drills: rows });

    await searchDrills(CTX, {});

    expect(calls[0].order).toEqual(["title"]);
    expect(calls[0].limit).toBe(100);
  });

  it("devuelve los ejercicios en el orden del título", async () => {
    install({
      search_drills: [
        drillRow(uuid(3), ORG, { title: "Zona" }),
        drillRow(uuid(4), ORG, { title: "Ataque" }),
        drillRow(uuid(5), ORG, { title: "Defensa" }),
      ],
    });

    const result = await searchDrills(CTX, {});

    expect(result.map((drill) => drill.title)).toEqual(["Ataque", "Defensa", "Zona"]);
  });

  it("se queda con los primeros 100", async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      drillRow(uuid(1000 + i), ORG, { title: `Ejercicio ${String(i).padStart(3, "0")}` }),
    );
    install({ search_drills: many });

    const result = await searchDrills(CTX, {});

    expect(result).toHaveLength(100);
    expect(result[0].title).toBe("Ejercicio 000");
    expect(result[99].title).toBe("Ejercicio 099");
  });

  it("cada ejercicio sale como un DrillSummary, con sus objetivos en el orden del club", async () => {
    install({ search_drills: rows });

    const [drill] = await searchDrills(CTX, {});

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

    const [drill] = await searchDrills(CTX, {});

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

    const result = await searchDrills(CTX, {});

    expect(result[0].focus.map((focus) => focus.slug)).toEqual([`objetivo-${tag(F1)}`]);
    expect(result[1].focus).toEqual([]);
  });

  it("sin resultados, una lista vacía", async () => {
    install({ search_drills: [] });

    await expect(searchDrills(CTX, { q: "nada" })).resolves.toEqual([]);
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
        { game_principles: { id: uuid(22), slug: "segundo", title: "Segundo", sort: 2, status: "published" } },
        { game_principles: { id: uuid(21), slug: "primero", title: "Primero", sort: 1, status: "published" } },
      ],
      drill_standards: [
        { standards: { id: uuid(32), number: 5, title: "CINCO", description: "Texto cinco.", status: "published" } },
        { standards: { id: uuid(31), number: 3, title: "TRES", description: "Texto tres.", status: "published" } },
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
                { game_principles: null },
                { game_principles: { id: uuid(23), slug: "borrador", title: "Borrador", sort: 0, status: "draft" } },
                { game_principles: { id: uuid(21), slug: "primero", title: "Primero", sort: 1, status: "published" } },
              ],
              drill_standards: [
                { standards: null },
                { standards: { id: uuid(33), number: 1, title: "UNO", description: "Texto.", status: "draft" } },
                { standards: { id: uuid(31), number: 3, title: "TRES", description: "Texto tres.", status: "published" } },
              ],
            },
          ],
        },
        { userId: ME },
      );

      const detail = await getDrill(CTX, DRILL_ID);

      expect(detail?.principles).toEqual([{ id: uuid(21), slug: "primero", title: "Primero" }]);
      expect(detail?.standards).toEqual([
        { id: uuid(31), number: 3, title: "TRES", description: "Texto tres." },
      ]);
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
