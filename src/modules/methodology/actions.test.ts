import { notFound, redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/lib/action-result";
import { PLATFORM_BRAND_COLORS } from "@/modules/tenancy/branding";
import type { ClubContext } from "@/modules/tenancy/queries";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireClub: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/guards", () => ({ requireClub: mocks.requireClub }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  createPrinciple,
  createStandard,
  createValue,
  createWaySection,
  moveMethodologyItem,
  savePrinciple,
  setMethodologyStatus,
  updateStandard,
  updateValue,
  updateWaySection,
} from "./actions";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ORG = "org-a";
const ID = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const S1 = "00000000-0000-4000-8000-000000000001";
const S2 = "00000000-0000-4000-8000-000000000002";
const S3 = "00000000-0000-4000-8000-000000000003";
const NEW_ID = "00000000-0000-4000-8000-0000000000aa";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos. */
const STAMP = "2026-10-20T10:00:00.123456+00:00";
const NEXT_STAMP = "2026-10-20T10:05:00.654321+00:00";

function contextWithRole(role: ClubContext["membership"]["role"]): ClubContext {
  return {
    org: { id: ORG, slug: "club-a", name: "Club A", timezone: "Europe/Madrid" },
    branding: {
      displayName: "Club A",
      wordmarkSub: null,
      shortName: "CLA",
      wayName: "The Way",
      tagline: null,
      colors: { ...PLATFORM_BRAND_COLORS },
      terminology: {},
    },
    membership: { role, personId: role === "admin" ? null : "person-a" },
  };
}

/** Lo que lanza `notFound()` de verdad: corta la ejecución, no devuelve. */
const NOT_FOUND = new Error("NEXT_HTTP_ERROR_FALLBACK;404");

// ── Un cliente de Supabase de pega ──────────────────────────────────────────────────────
// Cada `from()` y cada `rpc()` consume, en orden, una respuesta preparada por el test, y
// guarda lo que se le pidió: los tests comprueban qué se envía a la base de datos y qué
// vuelve de ella, no que un mock haya sido llamado.

type Reply = { data: unknown; error: unknown };
type Call = { method: string; args: unknown[] };

/** Una consulta encadenada: anota cada llamada y, al esperarla, responde. */
class FakeQuery implements PromiseLike<Reply> {
  readonly calls: Call[] = [];

  constructor(
    readonly table: string,
    private readonly reply: Reply,
  ) {}

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args });
    return this;
  }

  select = (...args: unknown[]) => this.record("select", args);
  insert = (...args: unknown[]) => this.record("insert", args);
  update = (...args: unknown[]) => this.record("update", args);
  eq = (...args: unknown[]) => this.record("eq", args);
  order = (...args: unknown[]) => this.record("order", args);
  single = (...args: unknown[]) => this.record("single", args);
  maybeSingle = (...args: unknown[]) => this.record("maybeSingle", args);

  then<A = Reply, B = never>(
    onfulfilled?: ((value: Reply) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.reply).then(onfulfilled, onrejected);
  }

  /** Los argumentos de la primera llamada a `method`. */
  sent(method: string): unknown[] {
    const call = this.calls.find((c) => c.method === method);
    if (!call) throw new Error(`la consulta no llamó a ${method}`);
    return call.args;
  }

  /** Los filtros `eq`, en orden: `[columna, valor]`. */
  get filters(): unknown[][] {
    return this.calls.filter((c) => c.method === "eq").map((c) => c.args);
  }

  /** Las columnas por las que ordena, en orden. */
  get orderedBy(): unknown[] {
    return this.calls.filter((c) => c.method === "order").map((c) => c.args[0]);
  }
}

class FakeDb {
  readonly queries: FakeQuery[] = [];
  readonly rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];

  constructor(private readonly replies: Reply[]) {}

  private next(): Reply {
    const reply = this.replies.shift();
    if (!reply) throw new Error("llamada a la base de datos sin respuesta preparada");
    return reply;
  }

  from(table: string): FakeQuery {
    const query = new FakeQuery(table, this.next());
    this.queries.push(query);
    return query;
  }

  rpc(name: string, args: Record<string, unknown>): Promise<Reply> {
    this.rpcs.push({ name, args });
    return Promise.resolve(this.next());
  }
}

/** Prepara el cliente con las respuestas que irá dando, en orden. */
function useDb(...replies: Reply[]): FakeDb {
  const db = new FakeDb(replies);
  mocks.createClient.mockResolvedValue(db);
  return db;
}

const reply = (data: unknown): Reply => ({ data, error: null });
/** La consulta «¿es de este club?» de las acciones que escriben por RPC: encuentra la fila... */
const ownRow = reply({ id: ID });
/** ...o no la encuentra, porque no existe o es de otro club. */
const noRow = reply(null);

/** Un error de PostgREST: un `Error` con su código, y un mensaje que lleva datos de la fila. */
function dbError(code: string, message: string): Reply {
  return {
    data: null,
    error: Object.assign(new Error(message), { name: "PostgrestError", code }),
  };
}

const standardText = { title: "Standard", description: "Texto." };
const NUMBER_RANGE = "El número tiene que estar entre 1 y 99.";
const valueText = { title: null, description: "Texto." };

function moveSection(id: string, direction: "up" | "down") {
  return moveMethodologyItem("club-a", { kind: "way_sections", id, direction });
}

/** Una entrada que el tipo no deja escribir: lo que mandaría un cliente manipulado. */
function unsafe<T>(value: unknown): T {
  return value as T;
}

/** Líneas escritas en el log del servidor. */
let logged: string[];

beforeEach(() => {
  vi.resetAllMocks();
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  mocks.requireClub.mockResolvedValue(contextWithRole("admin"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Lo que comparten las diez acciones ──────────────────────────────────────────────────

const ACTIONS: Array<[string, () => Promise<ActionResult<unknown>>]> = [
  ["createWaySection", () => createWaySection("club-a", { title: "Sección", contentKind: "text" })],
  [
    "updateWaySection",
    () =>
      updateWaySection("club-a", {
        id: ID,
        expectedUpdatedAt: STAMP,
        title: "Sección",
        summary: null,
        contentKind: "text",
        bodyMd: "",
      }),
  ],
  [
    "setMethodologyStatus",
    () => setMethodologyStatus("club-a", { kind: "standards", id: ID, status: "published" }),
  ],
  [
    "moveMethodologyItem",
    () => moveMethodologyItem("club-a", { kind: "standards", id: ID, direction: "up" }),
  ],
  ["createValue", () => createValue("club-a", { code: "UNO", ...valueText })],
  ["createPrinciple", () => createPrinciple("club-a", { title: "Principio", summary: null })],
  ["createStandard", () => createStandard("club-a", { number: 1, ...standardText })],
  ["updateValue", () => updateValue("club-a", { id: ID, code: "UNO", ...valueText })],
  [
    "savePrinciple",
    () => savePrinciple("club-a", { id: ID, title: "Principio", summary: null, points: ["Uno"] }),
  ],
  [
    "updateStandard",
    () => updateStandard("club-a", { id: ID, number: 1, ...standardText }),
  ],
];

describe("quién escribe", () => {
  it.each(ACTIONS)(
    "%s: quien no administra recibe NOT_FOUND sin tocar la base de datos",
    async (_name, run) => {
      for (const role of ["coach", "player", "guardian"] as const) {
        mocks.requireClub.mockResolvedValue(contextWithRole(role));

        await expect(run()).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
      }

      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(logged).toEqual([]);
    },
  );

  it("un entrenador no gestiona", async () => {
    mocks.requireClub.mockResolvedValue(contextWithRole("coach"));

    const result = await createWaySection("club-a", { title: "Cómo jugamos", contentKind: "text" });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each(ACTIONS)("%s: un club que no existe lanza el 404, no lo traga", async (_name, run) => {
    mocks.requireClub.mockRejectedValue(NOT_FOUND);

    await expect(run()).rejects.toBe(NOT_FOUND);

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("la acción pregunta por el club que le pasan", async () => {
    useDb(reply([]), reply({ id: NEW_ID }));

    await createWaySection("club-b", { title: "Sección", contentKind: "text" });

    expect(mocks.requireClub).toHaveBeenCalledWith("club-b");
  });
});

describe("tras escribir", () => {
  it("revalida The Way y Gestión por patrón de ruta y layout, no por la URL del club", async () => {
    useDb(reply([]), reply({ id: NEW_ID }));

    const result = await createWaySection("club-a", { title: "Sección", contentKind: "text" });

    expect(result.ok).toBe(true);
    // Patrón de ruta (carpetas, con el grupo `(app)`) y `layout`: así lo documenta Next. Con
    // la URL concreta y `layout` Next arma una etiqueta que ninguna ruta lleva.
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/c/[club]/(app)/way", "layout"],
      ["/c/[club]/admin", "layout"],
    ]);
  });

  it("no revalida si la escritura falla", async () => {
    useDb(reply([]), dbError("23514", "check"));

    const result = await createWaySection("club-a", { title: "Sección", contentKind: "text" });

    expect(result.ok).toBe(false);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("una entrada inválida no consulta el club ni la base de datos", async () => {
    const result = await createWaySection("club-a", { title: "", contentKind: "text" });

    expect(result.ok).toBe(false);
    expect(mocks.requireClub).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("errores de la base de datos", () => {
  it("un fallo inesperado es SAVE_FAILED y se registra sin el contenido de la fila", async () => {
    useDb(ownRow, dbError("XX000", 'fila con "texto del club"'));

    const result = await updateWaySection("club-a", {
      id: ID,
      expectedUpdatedAt: STAMP,
      title: "Sección",
      summary: null,
      contentKind: "text",
      bodyMd: "",
    });

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[methodology.update-way-section] PostgrestError code=XX000"]);
  });

  it("un permiso denegado tras pasar `can` es NOT_FOUND y se registra", async () => {
    useDb(dbError("42501", "new row violates row-level security policy"));

    const result = await createValue("club-a", { code: "UNO", ...valueText });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual(["[methodology.create-value] PostgrestError code=42501"]);
  });

  it("lo esperado no se registra: copia obsoleta, número repetido, entrada rechazada", async () => {
    useDb(
      reply([{ id: S1 }, { id: S2 }]),
      dbError("P0001", "STALE_COPY"),
      dbError("23505", "duplicate"),
      ownRow,
      dbError("22023", "INVALID"),
    );

    const stale = await moveMethodologyItem("club-a", {
      kind: "standards",
      id: S2,
      direction: "up",
    });
    const duplicate = await updateStandard("club-a", { id: ID, number: 2, ...standardText });
    const rejected = await savePrinciple("club-a", {
      id: ID,
      title: "Principio",
      summary: null,
      points: [],
    });

    expect([stale.ok, duplicate.ok, rejected.ok]).toEqual([false, false, false]);
    expect(logged).toEqual([]);
  });

  it("si el cliente lanza una excepción, la acción devuelve SAVE_FAILED sin romperse", async () => {
    mocks.createClient.mockRejectedValue(new TypeError("fetch failed"));

    const result = await createValue("club-a", { code: "UNO", ...valueText });

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[methodology.create-value] TypeError"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  // `notFound()` y `redirect()` funcionan lanzando: si la acción los tragara como un fallo
  // cualquiera, la página no daría su 404 ni redirigiría, y quedaría un SAVE_FAILED. Hoy
  // ninguna escritura los lanza, pero las acciones de las fases siguientes copiarán el esqueleto.
  it.each([
    ["notFound()", () => notFound()],
    ["redirect()", () => redirect("/select-club")],
  ])("lo que lanza %s lo recoge Next: no se convierte en SAVE_FAILED ni se registra", async (_, control) => {
    const thrown = (() => {
      try {
        control();
      } catch (error) {
        return error;
      }
      throw new Error("el control de flujo de Next tenía que lanzar");
    })();
    mocks.createClient.mockRejectedValue(thrown);

    await expect(createValue("club-a", { code: "UNO", ...valueText })).rejects.toBe(thrown);

    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

// ── Secciones de The Way ────────────────────────────────────────────────────────────────

describe("createWaySection", () => {
  it("título vacío", async () => {
    for (const title of ["", "   "]) {
      const result = await createWaySection("club-a", { title, contentKind: "text" });

      expect(result).toEqual({
        ok: false,
        error: "INVALID",
        fieldErrors: { title: "Escribe un título." },
      });
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un título null no llega a la base de datos", async () => {
    const result = await createWaySection("club-a", unsafe({ title: null, contentKind: "text" }));

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Escribe un título." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un título de más de 80 caracteres", async () => {
    const result = await createWaySection("club-a", { title: "a".repeat(81), contentKind: "text" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Máximo 80 caracteres." },
    });
  });

  it("un tipo de contenido que no existe", async () => {
    const result = await createWaySection(
      "club-a",
      unsafe({ title: "Sección", contentKind: "otro" }),
    );

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(result.ok ? null : Object.keys(result.fieldErrors ?? {})).toEqual(["contentKind"]);
  });

  it("crea con el siguiente número y un slug libre", async () => {
    const db = useDb(reply([{ number: 5, sort: 5, slug: "como-jugamos" }]), reply({ id: NEW_ID }));

    const result = await createWaySection("club-a", {
      title: "Cómo jugamos",
      contentKind: "principles",
    });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries[0].table).toBe("way_sections");
    expect(db.queries[0].filters).toEqual([["organization_id", ORG]]);
    expect(db.queries[1].table).toBe("way_sections");
    expect(db.queries[1].sent("insert")).toEqual([
      {
        organization_id: ORG,
        number: 6,
        sort: 6,
        slug: "como-jugamos-2",
        title: "Cómo jugamos",
        content_kind: "principles",
        status: "draft",
      },
    ]);
  });

  it("la primera sección del club es la 1", async () => {
    const db = useDb(reply([]), reply({ id: NEW_ID }));

    await createWaySection("club-a", { title: "Cómo jugamos", contentKind: "text" });

    expect(db.queries[1].sent("insert")).toEqual([
      expect.objectContaining({ number: 1, sort: 1, slug: "como-jugamos" }),
    ]);
  });

  it("el número y el orden salen del máximo, no de cuántas hay", async () => {
    const db = useDb(
      reply([
        { number: 2, sort: 2, slug: "a" },
        { number: 9, sort: 7, slug: "b" },
        { number: 4, sort: 8, slug: "c" },
      ]),
      reply({ id: NEW_ID }),
    );

    await createWaySection("club-a", { title: "Nueva", contentKind: "text" });

    expect(db.queries[1].sent("insert")).toEqual([
      expect.objectContaining({ number: 10, sort: 9 }),
    ]);
  });

  it("un título sin letras ni números usa «seccion», y «standards» está reservado", async () => {
    const db = useDb(reply([]), reply({ id: NEW_ID }), reply([]), reply({ id: NEW_ID }));

    await createWaySection("club-a", { title: "¿¿??", contentKind: "text" });
    await createWaySection("club-a", { title: "Standards", contentKind: "text" });

    expect(db.queries[1].sent("insert")).toEqual([expect.objectContaining({ slug: "seccion" })]);
    expect(db.queries[3].sent("insert")).toEqual([
      expect.objectContaining({ slug: "standards-2" }),
    ]);
  });

  it("guarda el título recortado", async () => {
    const db = useDb(reply([]), reply({ id: NEW_ID }));

    await createWaySection("club-a", { title: "  Sección de valores  ", contentKind: "values" });

    expect(db.queries[1].sent("insert")).toEqual([
      expect.objectContaining({ title: "Sección de valores", slug: "seccion-de-valores" }),
    ]);
  });

  it("si falla leer las secciones del club, no inserta nada", async () => {
    const db = useDb(dbError("XX000", "boom"));

    const result = await createWaySection("club-a", { title: "Sección", contentKind: "text" });

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.queries).toHaveLength(1);
    expect(logged).toEqual(["[methodology.create-way-section] PostgrestError code=XX000"]);
  });

  // Leer la lista y escribir no son atómicos: otra alta puede colarse entre las dos y
  // quedarse con el número o con el slug recién calculados. El único de la tabla la rechaza.
  it("si otra alta se adelanta, vuelve a leer y crea con el número y el slug siguientes", async () => {
    const db = useDb(
      reply([{ number: 5, sort: 5, slug: "como-jugamos" }]),
      dbError("23505", "duplicate key value violates unique constraint"),
      reply([
        { number: 5, sort: 5, slug: "como-jugamos" },
        { number: 6, sort: 6, slug: "como-jugamos-2" },
      ]),
      reply({ id: NEW_ID }),
    );

    const result = await createWaySection("club-a", { title: "Cómo jugamos", contentKind: "text" });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries[1].sent("insert")).toEqual([
      expect.objectContaining({ number: 6, sort: 6, slug: "como-jugamos-2" }),
    ]);
    expect(db.queries[3].sent("insert")).toEqual([
      expect.objectContaining({ number: 7, sort: 7, slug: "como-jugamos-3" }),
    ]);
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("si el choque se repite tres veces lo deja: SAVE_FAILED, sin campo que marcar, y se registra", async () => {
    const taken = reply([{ number: 5, sort: 5, slug: "como-jugamos" }]);
    const clash = dbError("23505", "duplicate key value violates unique constraint");
    const db = useDb(taken, clash, taken, clash, taken, clash);

    const result = await createWaySection("club-a", { title: "Cómo jugamos", contentKind: "text" });

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.queries).toHaveLength(6);
    expect(logged).toEqual(["[methodology.create-way-section] PostgrestError code=23505"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("con la sección 99 ya creada no inserta nada: SECTION_LIMIT", async () => {
    const db = useDb(reply([{ number: 99, sort: 99, slug: "la-ultima" }]));

    const result = await createWaySection("club-a", { title: "Una más", contentKind: "text" });

    expect(result).toEqual({ ok: false, error: "SECTION_LIMIT" });
    expect(db.queries).toHaveLength(1);
    expect(logged).toEqual([]);
  });

  it("la sección 99 todavía se crea", async () => {
    const db = useDb(reply([{ number: 98, sort: 98, slug: "penultima" }]), reply({ id: NEW_ID }));

    const result = await createWaySection("club-a", { title: "La última", contentKind: "text" });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries[1].sent("insert")).toEqual([expect.objectContaining({ number: 99 })]);
  });
});

describe("updateWaySection", () => {
  const input = {
    id: ID,
    expectedUpdatedAt: STAMP,
    title: "Cómo jugamos",
    summary: "Lo que hacemos con el balón.",
    contentKind: "text" as const,
    bodyMd: "Un texto.",
  };

  it("un título vacío o un cuerpo de más de 20.000 caracteres", async () => {
    const empty = await updateWaySection("club-a", { ...input, title: " " });
    const long = await updateWaySection("club-a", { ...input, bodyMd: "a".repeat(20001) });

    expect(empty).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Escribe un título." },
    });
    expect(long).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { bodyMd: "El texto es demasiado largo (máximo 20.000 caracteres)." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un cuerpo de exactamente 20.000 caracteres se guarda", async () => {
    const db = useDb(ownRow, reply(NEXT_STAMP));

    const result = await updateWaySection("club-a", { ...input, bodyMd: "a".repeat(20000) });

    expect(result.ok).toBe(true);
    expect(db.rpcs[0].args.p_body_md).toBe("a".repeat(20000));
  });

  it("un resumen de más de 200 caracteres", async () => {
    const result = await updateWaySection("club-a", { ...input, summary: "a".repeat(201) });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { summary: "Máximo 200 caracteres." },
    });
  });

  it("sin la copia que se estaba editando no se guarda", async () => {
    const result = await updateWaySection("club-a", { ...input, expectedUpdatedAt: "" });

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(result.ok ? null : Object.keys(result.fieldErrors ?? {})).toEqual(["expectedUpdatedAt"]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("copia obsoleta", async () => {
    useDb(ownRow, dbError("P0001", "STALE_COPY"));

    const result = await updateWaySection("club-a", input);

    expect(result).toEqual({ ok: false, error: "STALE_COPY" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("expectedUpdatedAt viaja intacto", async () => {
    const db = useDb(ownRow, reply(NEXT_STAMP));

    const result = await updateWaySection("club-a", input);

    expect(db.rpcs).toHaveLength(1);
    expect(db.rpcs[0].name).toBe("update_way_section");
    expect(db.rpcs[0].args.p_expected_updated_at).toBe("2026-10-20T10:00:00.123456+00:00");
    expect(result).toEqual({ ok: true, data: { updatedAt: NEXT_STAMP } });
  });

  it("manda al RPC todos los campos con su nombre", async () => {
    const db = useDb(ownRow, reply(NEXT_STAMP));

    await updateWaySection("club-a", { ...input, title: "  Cómo jugamos  ", bodyMd: "Un texto." });

    expect(db.rpcs[0].args).toEqual({
      p_id: ID,
      p_expected_updated_at: STAMP,
      p_title: "Cómo jugamos",
      p_summary: "Lo que hacemos con el balón.",
      p_content_kind: "text",
      p_body_md: "Un texto.",
    });
  });

  it("un resumen vacío se guarda como null, no como texto vacío", async () => {
    const db = useDb(ownRow, reply(NEXT_STAMP), ownRow, reply(NEXT_STAMP));

    await updateWaySection("club-a", { ...input, summary: "   " });
    await updateWaySection("club-a", { ...input, summary: null });

    expect(db.rpcs[0].args.p_summary).toBeNull();
    expect(db.rpcs[1].args.p_summary).toBeNull();
  });

  it("solo escribe por la función: ningún update directo de las columnas de texto", async () => {
    const db = useDb(ownRow, reply(NEXT_STAMP));

    await updateWaySection("club-a", input);

    const direct = db.queries
      .flatMap((query) => query.calls)
      .filter((call) => call.method === "update" || call.method === "insert");
    expect(direct).toEqual([]);
  });

  it("sin permiso en la fila, NOT_FOUND", async () => {
    useDb(ownRow, dbError("P0002", "NOT_FOUND"));

    const result = await updateWaySection("club-a", input);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("una sección que no es de este club es NOT_FOUND y no llega a la función", async () => {
    const db = useDb(noRow);

    const result = await updateWaySection("club-a", input);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("antes de escribir mira si la sección es de este club, no de otro", async () => {
    const db = useDb(ownRow, reply(NEXT_STAMP));

    await updateWaySection("club-a", input);

    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("way_sections");
    expect(db.queries[0].sent("select")).toEqual(["id"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.queries[0].calls.some((call) => call.method === "maybeSingle")).toBe(true);
  });

  it("si falla esa comprobación no llama a la función y se registra", async () => {
    const db = useDb(dbError("XX000", "boom"));

    const result = await updateWaySection("club-a", input);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual(["[methodology.update-way-section] PostgrestError code=XX000"]);
  });
});

describe("setMethodologyStatus", () => {
  it.each([
    ["way_sections", "published"],
    ["club_values", "draft"],
    ["game_principles", "published"],
    ["standards", "draft"],
  ] as const)("%s pasa a %s: solo ese campo, solo en este club", async (kind, status) => {
    const db = useDb(reply([{ id: ID }]));

    const result = await setMethodologyStatus("club-a", { kind, id: ID, status });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries[0].table).toBe(kind);
    expect(db.queries[0].sent("update")).toEqual([{ status }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.queries[0].sent("select")).toEqual(["id"]);
  });

  it("una fila que no es del club afecta a 0 filas: NOT_FOUND", async () => {
    useDb(reply([]));

    const result = await setMethodologyStatus("club-a", {
      kind: "standards",
      id: ID,
      status: "published",
    });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un tipo que no es de la metodología no llega a la base de datos", async () => {
    const result = await setMethodologyStatus(
      "club-a",
      unsafe({ kind: "organizations", id: ID, status: "published" }),
    );

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un estado o un id inválidos", async () => {
    const status = await setMethodologyStatus(
      "club-a",
      unsafe({ kind: "standards", id: ID, status: "archived" }),
    );
    const id = await setMethodologyStatus("club-a", {
      kind: "standards",
      id: "no-es-un-uuid",
      status: "draft",
    });

    expect(status).toMatchObject({ ok: false, error: "INVALID" });
    expect(id).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { id: "No encontramos este contenido." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("moveMethodologyItem", () => {
  it("subir una sección", async () => {
    const db = useDb(reply([{ id: S1 }, { id: S2 }, { id: S3 }]), reply(null));

    const result = await moveSection(S2, "up");

    expect(result).toEqual({ ok: true, data: null });
    expect(db.rpcs).toEqual([
      {
        name: "reorder_methodology",
        args: { p_org: ORG, p_kind: "way_sections", p_ids: [S2, S1, S3] },
      },
    ]);
  });

  it("bajar una sección", async () => {
    const db = useDb(reply([{ id: S1 }, { id: S2 }, { id: S3 }]), reply(null));

    await moveSection(S2, "down");

    expect(db.rpcs[0].args.p_ids).toEqual([S1, S3, S2]);
  });

  it("en el extremo no cambia nada y no llama a la función", async () => {
    const db = useDb(
      reply([{ id: S1 }, { id: S2 }, { id: S3 }]),
      reply([{ id: S1 }, { id: S2 }, { id: S3 }]),
    );

    const top = await moveSection(S1, "up");
    const bottom = await moveSection(S3, "down");

    expect(top).toEqual({ ok: true, data: null });
    expect(bottom).toEqual({ ok: true, data: null });
    expect(db.rpcs).toEqual([]);
  });

  it("lee los ids del club con el mismo orden que las consultas de lectura", async () => {
    const db = useDb(reply([{ id: S1 }, { id: S2 }]), reply(null));

    await moveMethodologyItem("club-a", { kind: "club_values", id: S2, direction: "up" });

    expect(db.queries[0].table).toBe("club_values");
    expect(db.queries[0].sent("select")).toEqual(["id"]);
    expect(db.queries[0].filters).toEqual([["organization_id", ORG]]);
    expect(db.queries[0].orderedBy).toEqual(["sort", "created_at", "id"]);
  });

  it.each(["way_sections", "club_values", "game_principles", "standards"] as const)(
    "reordena %s con su tipo",
    async (kind) => {
      const db = useDb(reply([{ id: S1 }, { id: S2 }]), reply(null));

      await moveMethodologyItem("club-a", { kind, id: S1, direction: "down" });

      expect(db.queries[0].table).toBe(kind);
      expect(db.rpcs[0].args).toEqual({ p_org: ORG, p_kind: kind, p_ids: [S2, S1] });
    },
  );

  it("un id que no está en el club es NOT_FOUND, no un movimiento que no mueve nada", async () => {
    const db = useDb(reply([{ id: S1 }, { id: S2 }]));

    const result = await moveSection(S3, "up");

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
  });

  it("si alguien añadió algo mientras tanto, la función responde STALE_COPY", async () => {
    useDb(reply([{ id: S1 }, { id: S2 }]), dbError("P0001", "STALE_COPY"));

    const result = await moveSection(S2, "up");

    expect(result).toEqual({ ok: false, error: "STALE_COPY" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("si falla leer la lista, no llama a la función", async () => {
    const db = useDb(dbError("XX000", "boom"));

    const result = await moveSection(S2, "up");

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
    expect(logged).toEqual(["[methodology.move-methodology-item] PostgrestError code=XX000"]);
  });

  it("una dirección inválida no llega a la base de datos", async () => {
    const result = await moveMethodologyItem(
      "club-a",
      unsafe({ kind: "way_sections", id: S2, direction: "left" }),
    );

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

// ── Valores ─────────────────────────────────────────────────────────────────────────────

describe("createValue", () => {
  it("crea un borrador al final, con el código y la descripción recortados", async () => {
    const db = useDb(reply([{ sort: 2 }, { sort: 3 }]), reply({ id: NEW_ID }));

    const result = await createValue("club-a", {
      code: "  VALOR UNO ",
      title: "Título del valor",
      description: "  Descripción del valor.  ",
    });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries[0].table).toBe("club_values");
    expect(db.queries[0].filters).toEqual([["organization_id", ORG]]);
    expect(db.queries[1].table).toBe("club_values");
    expect(db.queries[1].sent("insert")).toEqual([
      {
        organization_id: ORG,
        code: "VALOR UNO",
        title: "Título del valor",
        description: "Descripción del valor.",
        status: "draft",
        sort: 4,
      },
    ]);
  });

  it("el primer valor tiene el orden 1, y un título vacío se guarda como null", async () => {
    const db = useDb(reply([]), reply({ id: NEW_ID }), reply([]), reply({ id: NEW_ID }));

    await createValue("club-a", { code: "UNO", title: "", description: "Texto." });
    await createValue("club-a", { code: "DOS", title: null, description: "Texto." });

    for (const query of [db.queries[1], db.queries[3]]) {
      expect(query.sent("insert")).toEqual([expect.objectContaining({ title: null, sort: 1 })]);
    }
  });

  it("código y descripción vacíos", async () => {
    const result = await createValue("club-a", { code: " ", title: null, description: "" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        code: "Escribe el código del valor.",
        description: "Escribe una descripción.",
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("código nulo o descripción nula no llegan a la base de datos", async () => {
    const result = await createValue(
      "club-a",
      unsafe({ code: null, title: null, description: null }),
    );

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        code: "Escribe el código del valor.",
        description: "Escribe una descripción.",
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("los límites de la tabla: código 40, título 80, descripción 500", async () => {
    const result = await createValue("club-a", {
      code: "a".repeat(41),
      title: "a".repeat(81),
      description: "a".repeat(501),
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        code: "Máximo 40 caracteres.",
        title: "Máximo 80 caracteres.",
        description: "Máximo 500 caracteres.",
      },
    });
  });
});

describe("updateValue", () => {
  it("actualiza solo ese valor de este club y devuelve null", async () => {
    const db = useDb(reply([{ id: ID }]));

    const result = await updateValue("club-a", {
      id: ID,
      code: " VALOR UNO ",
      title: " ",
      description: " Descripción del valor. ",
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries[0].table).toBe("club_values");
    expect(db.queries[0].sent("update")).toEqual([
      { code: "VALOR UNO", title: null, description: "Descripción del valor." },
    ]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.queries[0].sent("select")).toEqual(["id"]);
  });

  it("un valor de otro club afecta a 0 filas: NOT_FOUND", async () => {
    useDb(reply([]));

    const result = await updateValue("club-a", { id: ID, code: "UNO", ...valueText });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("valida igual que al crear", async () => {
    const result = await updateValue("club-a", { id: ID, code: "", title: null, description: "" });

    expect(result).toMatchObject({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        code: "Escribe el código del valor.",
        description: "Escribe una descripción.",
      },
    });
  });
});

// ── Principios ──────────────────────────────────────────────────────────────────────────

describe("createPrinciple", () => {
  it("crea un borrador al final con un slug libre", async () => {
    const db = useDb(reply([{ sort: 4, slug: "principio-uno" }]), reply({ id: NEW_ID }));

    const result = await createPrinciple("club-a", {
      title: " Principio uno ",
      summary: "  Resumen del principio.  ",
    });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries[0].table).toBe("game_principles");
    expect(db.queries[0].filters).toEqual([["organization_id", ORG]]);
    expect(db.queries[1].table).toBe("game_principles");
    expect(db.queries[1].sent("insert")).toEqual([
      {
        organization_id: ORG,
        slug: "principio-uno-2",
        title: "Principio uno",
        summary: "Resumen del principio.",
        status: "draft",
        sort: 5,
      },
    ]);
  });

  it("un título sin letras usa «principio», y un resumen vacío es null", async () => {
    const db = useDb(reply([]), reply({ id: NEW_ID }));

    await createPrinciple("club-a", { title: "¿?", summary: "" });

    expect(db.queries[1].sent("insert")).toEqual([
      expect.objectContaining({ slug: "principio", summary: null, sort: 1 }),
    ]);
  });

  it("si otra alta se queda con el slug, vuelve a leer y crea con el siguiente", async () => {
    const db = useDb(
      reply([{ sort: 4, slug: "otro" }]),
      dbError("23505", "duplicate key value violates unique constraint"),
      reply([
        { sort: 4, slug: "otro" },
        { sort: 5, slug: "principio-uno" },
      ]),
      reply({ id: NEW_ID }),
    );

    const result = await createPrinciple("club-a", { title: "Principio uno", summary: null });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries[1].sent("insert")).toEqual([
      expect.objectContaining({ slug: "principio-uno", sort: 5 }),
    ]);
    expect(db.queries[3].sent("insert")).toEqual([
      expect.objectContaining({ slug: "principio-uno-2", sort: 6 }),
    ]);
    expect(logged).toEqual([]);
  });

  it("si el choque se repite tres veces lo deja: SAVE_FAILED y se registra", async () => {
    const taken = reply([{ sort: 4, slug: "otro" }]);
    const clash = dbError("23505", "duplicate key value violates unique constraint");
    const db = useDb(taken, clash, taken, clash, taken, clash);

    const result = await createPrinciple("club-a", { title: "Principio uno", summary: null });

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.queries).toHaveLength(6);
    expect(logged).toEqual(["[methodology.create-principle] PostgrestError code=23505"]);
  });

  it("título vacío y resumen de más de 300 caracteres", async () => {
    const result = await createPrinciple("club-a", { title: "", summary: "a".repeat(301) });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Escribe un título.", summary: "Máximo 300 caracteres." },
    });
  });
});

describe("savePrinciple", () => {
  const input = {
    id: ID,
    title: "Principio uno",
    summary: "Resumen del principio.",
    points: ["Espacios", "Pase"],
  };

  it("puntos", async () => {
    const db = useDb(ownRow, reply(null));

    const result = await savePrinciple("club-a", { ...input, points: ["Espacios", "  ", "Pase"] });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.rpcs).toEqual([
      {
        name: "save_game_principle",
        args: {
          p_id: ID,
          p_title: "Principio uno",
          p_summary: "Resumen del principio.",
          p_points: ["Espacios", "Pase"],
        },
      },
    ]);
  });

  it("13 puntos", async () => {
    const points = Array.from({ length: 13 }, (_, i) => `Punto ${i + 1}`);

    const result = await savePrinciple("club-a", { ...input, points });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { points: "Un principio tiene como máximo 12 puntos." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("12 puntos más los huecos en blanco que haya entre ellos se guardan", async () => {
    const db = useDb(ownRow, reply(null));
    const points = Array.from({ length: 12 }, (_, i) => `Punto ${i + 1}`);

    const result = await savePrinciple("club-a", { ...input, points: [...points, "", "  "] });

    expect(result.ok).toBe(true);
    expect(db.rpcs[0].args.p_points).toEqual(points);
  });

  it("sin puntos deja la lista vacía", async () => {
    const db = useDb(ownRow, reply(null));

    await savePrinciple("club-a", { ...input, points: ["", " "] });

    expect(db.rpcs[0].args.p_points).toEqual([]);
  });

  it("un punto de más de 200 caracteres señala su fila", async () => {
    const result = await savePrinciple("club-a", { ...input, points: ["Corto", "a".repeat(201)] });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { "points.1": "Máximo 200 caracteres." },
    });
  });

  it("un punto null no llega a la base de datos", async () => {
    const result = await savePrinciple("club-a", unsafe({ ...input, points: ["Corto", null] }));

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("título vacío", async () => {
    const result = await savePrinciple("club-a", { ...input, title: "  " });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Escribe un título." },
    });
  });

  it("un resumen vacío se guarda como null, no como texto vacío", async () => {
    const db = useDb(ownRow, reply(null), ownRow, reply(null));

    await savePrinciple("club-a", { ...input, summary: "  " });
    await savePrinciple("club-a", { ...input, summary: null });

    expect(db.rpcs[0].args.p_summary).toBeNull();
    expect(db.rpcs[1].args.p_summary).toBeNull();
  });

  it("solo escribe por la función, que reemplaza los puntos en una transacción", async () => {
    const db = useDb(ownRow, reply(null));

    await savePrinciple("club-a", input);

    const direct = db.queries
      .flatMap((query) => query.calls)
      .filter((call) => call.method === "update" || call.method === "insert");
    expect(direct).toEqual([]);
  });

  it("un principio que no se ve o no se administra: NOT_FOUND", async () => {
    useDb(ownRow, dbError("P0002", "NOT_FOUND"));

    const result = await savePrinciple("club-a", input);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("un principio que no es de este club es NOT_FOUND y no llega a la función", async () => {
    const db = useDb(noRow);

    const result = await savePrinciple("club-a", input);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("antes de escribir mira si el principio es de este club, no de otro", async () => {
    const db = useDb(ownRow, reply(null));

    await savePrinciple("club-a", input);

    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("game_principles");
    expect(db.queries[0].sent("select")).toEqual(["id"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.queries[0].calls.some((call) => call.method === "maybeSingle")).toBe(true);
  });

  it("si falla esa comprobación no llama a la función y se registra", async () => {
    const db = useDb(dbError("XX000", "boom"));

    const result = await savePrinciple("club-a", input);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual(["[methodology.save-principle] PostgrestError code=XX000"]);
  });
});

// ── Standards ───────────────────────────────────────────────────────────────────────────

describe("createStandard", () => {
  it("crea un borrador al final con el número que elige la dirección", async () => {
    const db = useDb(reply([{ sort: 5 }]), reply({ id: NEW_ID }));

    const result = await createStandard("club-a", {
      number: 7,
      title: " Defensa primero ",
      description: " Texto. ",
    });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries[0].table).toBe("standards");
    expect(db.queries[0].filters).toEqual([["organization_id", ORG]]);
    expect(db.queries[1].table).toBe("standards");
    expect(db.queries[1].sent("insert")).toEqual([
      {
        organization_id: ORG,
        number: 7,
        title: "Defensa primero",
        description: "Texto.",
        status: "draft",
        sort: 6,
      },
    ]);
  });

  it("Standard duplicado", async () => {
    useDb(reply([]), dbError("23505", "Key (organization_id, number)=(org-a, 7) already exists."));

    const result = await createStandard("club-a", { number: 7, ...standardText });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { number: "Ya existe un Standard con ese número." },
    });
    expect(logged).toEqual([]);
  });

  const outOfRange = [0, 100, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];

  it.each(outOfRange)("el número %s no está entre 1 y 99", async (number) => {
    const result = await createStandard("club-a", { number, ...standardText });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { number: "El número tiene que estar entre 1 y 99." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([1, 99])("el número %s es válido", async (number) => {
    const db = useDb(reply([]), reply({ id: NEW_ID }));

    const result = await createStandard("club-a", { number, ...standardText });

    expect(result.ok).toBe(true);
    expect(db.queries[1].sent("insert")).toEqual([expect.objectContaining({ number })]);
  });

  it("un número que llega como texto o ausente no se acepta", async () => {
    const text = await createStandard("club-a", unsafe({ number: "5", ...standardText }));
    const missing = await createStandard("club-a", unsafe(standardText));
    const invalid = { ok: false, error: "INVALID", fieldErrors: { number: NUMBER_RANGE } };

    expect(text).toEqual(invalid);
    expect(missing).toEqual(invalid);
  });

  it("título y descripción vacíos, o demasiado largos", async () => {
    const empty = await createStandard("club-a", { number: 1, title: "", description: " " });
    const long = await createStandard("club-a", {
      number: 1,
      title: "a".repeat(81),
      description: "a".repeat(501),
    });

    expect(empty).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Escribe un título.", description: "Escribe una descripción." },
    });
    expect(long).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Máximo 80 caracteres.", description: "Máximo 500 caracteres." },
    });
  });
});

describe("updateStandard", () => {
  it("actualiza solo ese Standard de este club y devuelve null", async () => {
    const db = useDb(reply([{ id: ID }]));

    const result = await updateStandard("club-a", {
      id: ID,
      number: 3,
      title: " Defensa primero ",
      description: " Texto. ",
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries[0].table).toBe("standards");
    expect(db.queries[0].sent("update")).toEqual([
      { number: 3, title: "Defensa primero", description: "Texto." },
    ]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.queries[0].sent("select")).toEqual(["id"]);
  });

  it("Standard duplicado", async () => {
    useDb(dbError("23505", "duplicate key"));

    const result = await updateStandard("club-a", { id: ID, number: 3, ...standardText });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { number: "Ya existe un Standard con ese número." },
    });
  });

  it("un Standard de otro club afecta a 0 filas: NOT_FOUND", async () => {
    useDb(reply([]));

    const result = await updateStandard("club-a", { id: ID, number: 3, ...standardText });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});
