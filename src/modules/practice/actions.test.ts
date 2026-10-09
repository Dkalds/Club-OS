import { notFound } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/lib/action-result";
import type { ClubContext } from "@/modules/tenancy/queries";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireClub: vi.fn(),
  revalidatePath: vi.fn(),
  searchDrills: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/guards", () => ({ requireClub: mocks.requireClub }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/drills/queries", () => ({ searchDrills: mocks.searchDrills }));

import type { DrillSummary } from "@/modules/drills/types";
import {
  addDrillToPractice,
  cancelPractice,
  createPractice,
  duplicatePractice,
  findDrills,
  savePracticeItems,
  updatePracticeMeta,
} from "./actions";
import type { CreatePracticeInput, UpdatePracticeMetaInput } from "./schema";
import type { PracticeItemDraft } from "./types";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ORG = clubContext("coach").org.id;
const TEAM = "00000000-0000-4000-8000-0000000000e1";
const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const PLAN = "00000000-0000-4000-8000-0000000000a1";
const NEW_EVENT = "00000000-0000-4000-8000-0000000000aa";
const F1 = "00000000-0000-4000-8000-0000000000f1";
const F2 = "00000000-0000-4000-8000-0000000000f2";
const DRILL = "00000000-0000-4000-8000-0000000000d1";
const ITEM = "00000000-0000-4000-8000-0000000000b1";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos y desfase. */
const STAMP = "2026-11-17T10:00:00.123456+00:00";
const NEXT_STAMP = "2026-11-17T10:05:00.654321+00:00";
/** El jsonb que devuelve `save_practice_items` a partir de la Task 1 de la Fase 5. */
const SAVE_RESULT = { updated_at: NEXT_STAMP, item_ids: [ITEM, "00000000-0000-4000-8000-0000000000b2"] };

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
  update = (...args: unknown[]) => this.record("update", args);
  eq = (...args: unknown[]) => this.record("eq", args);
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

  /** Cuántas veces se habló con la base de datos, por consulta o por función. */
  get calls(): number {
    return this.queries.length + this.rpcs.length;
  }
}

/** Prepara el cliente con las respuestas que irá dando, en orden. */
function useDb(...replies: Reply[]): FakeDb {
  const db = new FakeDb(replies);
  mocks.createClient.mockResolvedValue(db);
  return db;
}

const reply = (data: unknown): Reply => ({ data, error: null });
/**
 * La lectura previa «¿es un entreno de este club, con su plan?»: lo encuentra. PostgREST
 * devuelve el plan como lista de un elemento (clave foránea compuesta), o como objeto.
 */
const ownEvent = reply({ id: EVENT, practice_plans: [{ id: PLAN }] });
const ownEventObject = reply({ id: EVENT, practice_plans: { id: PLAN } });
/** ...o no lo encuentra, porque no existe o es de otro club... */
const noEvent = reply(null);
/** La lectura previa de `createPractice` «¿es un equipo de este club?»: lo encuentra... */
const ownTeam = reply({ id: TEAM });
/** ...o no, porque no existe o es de otro club. */
const noTeam = reply(null);
/** ...o lo encuentra sin plan (un entreno que no es una sesión). */
const noPlan = reply({ id: EVENT, practice_plans: [] });

/** Una fila de `practice_items` como la devuelve PostgREST. */
type ItemRow = {
  id: string;
  sort: number;
  drill_id: string | null;
  title_override: string | null;
  phase: string | null;
  minutes: number;
  notes: string | null;
};

function itemRow(n: number, overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: `00000000-0000-4000-8000-00000000b0${String(n).padStart(2, "0")}`,
    sort: n,
    drill_id: null,
    title_override: `Bloque ${n}`,
    phase: null,
    minutes: 10,
    notes: null,
    ...overrides,
  };
}

/**
 * La lectura previa de `addDrillToPractice`: el entreno de este club con su plan, la copia
 * vigente (`updated_at`, con microsegundos) y sus ítems, en el desorden que quiera PostgREST.
 */
function planWith(items: ItemRow[], updatedAt = STAMP): Reply {
  return reply({ id: EVENT, practice_plans: [{ id: PLAN, updated_at: updatedAt, practice_items: items }] });
}

/** El ejercicio que se añade, tal como lo lee la acción: publicado y de este club. */
const publishedDrill = reply({ id: DRILL, title: "Rebote y salida", min_minutes: 12 });
/** ...o no lo encuentra: no existe, es de otro club, es un borrador que no se ve o no está publicado. */
const noDrill = reply(null);

/** Un error de PostgREST: un `Error` con su código, y un mensaje que lleva datos de la fila. */
function dbError(code: string, message: string): Reply {
  return {
    data: null,
    error: Object.assign(new Error(message), { name: "PostgrestError", code }),
  };
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
  mocks.requireClub.mockResolvedValue(clubContext("coach"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Las entradas de cada acción ──────────────────────────────────────────────────────────

const create: CreatePracticeInput = {
  teamId: TEAM,
  date: "2026-11-17",
  time: "18:00",
  durationMinutes: 75,
  title: "Defensa en transición",
  primaryFocusId: null,
  secondaryFocusId: null,
  location: null,
};

const edit: UpdatePracticeMetaInput = {
  eventId: EVENT,
  expectedUpdatedAt: STAMP,
  date: "2026-11-17",
  time: "18:00",
  durationMinutes: 75,
  title: "Defensa en transición",
  primaryFocusId: F1,
  secondaryFocusId: F2,
  location: "Pista 2",
  notes: "Traer petos.",
};

const draft: PracticeItemDraft = {
  drillId: null,
  title: "Calentamiento",
  phase: null,
  minutes: 10,
  notes: null,
};

const save = { eventId: EVENT, expectedUpdatedAt: STAMP, saveId: "aaaaaaaa-0000-4000-8000-000000000099", items: [draft] };
const duplicate = { eventId: EVENT, date: "2026-11-24", time: "18:00" };
const addDrill = { eventId: EVENT, drillId: DRILL };

/**
 * Las seis acciones que escriben, cada una con una entrada válida. `findDrills` solo lee y
 * tiene su propio bloque más abajo.
 */
const ACTIONS: Array<[string, () => Promise<ActionResult<unknown>>]> = [
  ["createPractice", () => createPractice("club-a", create)],
  ["updatePracticeMeta", () => updatePracticeMeta("club-a", edit)],
  ["savePracticeItems", () => savePracticeItems("club-a", save)],
  ["duplicatePractice", () => duplicatePractice("club-a", duplicate)],
  ["cancelPractice", () => cancelPractice("club-a", { eventId: EVENT })],
  ["addDrillToPractice", () => addDrillToPractice("club-a", addDrill)],
];

// ── Quién gestiona y qué pasa después ────────────────────────────────────────────────────

describe("quién gestiona", () => {
  it("un jugador no gestiona", async () => {
    mocks.requireClub.mockResolvedValue(clubContext("player"));

    const result = await createPractice("club-a", create);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(ACTIONS)(
    "%s: quien no entrena recibe NOT_FOUND sin tocar la base de datos",
    async (_name, run) => {
      for (const role of ["player", "guardian"] as const) {
        mocks.requireClub.mockResolvedValue(clubContext(role));

        await expect(run()).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
      }

      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(logged).toEqual([]);
    },
  );

  it.each(["coach", "admin"] as const)("%s sí gestiona", async (role) => {
    mocks.requireClub.mockResolvedValue(clubContext(role));
    useDb(ownTeam, reply(NEW_EVENT));

    const result = await createPractice("club-a", create);

    expect(result).toEqual({ ok: true, data: { eventId: NEW_EVENT } });
  });

  it.each(ACTIONS)("%s: un club que no existe lanza el 404, no lo traga", async (_name, run) => {
    mocks.requireClub.mockRejectedValue(NOT_FOUND);

    await expect(run()).rejects.toBe(NOT_FOUND);

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("la acción pregunta por el club que le pasan", async () => {
    useDb(ownTeam, reply(NEW_EVENT));

    await createPractice("club-b", create);

    expect(mocks.requireClub).toHaveBeenCalledWith("club-b");
  });

  it("una entrada inválida no consulta el club ni la base de datos", async () => {
    const result = await createPractice("club-a", { ...create, title: "" });

    expect(result.ok).toBe(false);
    expect(mocks.requireClub).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("tras escribir", () => {
  const WRITES: Array<[string, Reply[], () => Promise<ActionResult<unknown>>]> = [
    ["createPractice", [ownTeam, reply(NEW_EVENT)], ACTIONS[0][1]],
    ["updatePracticeMeta", [ownEvent, reply(NEXT_STAMP)], ACTIONS[1][1]],
    ["savePracticeItems", [ownEvent, reply(SAVE_RESULT)], ACTIONS[2][1]],
    ["duplicatePractice", [ownEvent, reply(NEW_EVENT)], ACTIONS[3][1]],
    ["cancelPractice", [reply([{ id: EVENT }])], ACTIONS[4][1]],
    ["addDrillToPractice", [planWith([]), publishedDrill, reply(NEXT_STAMP)], ACTIONS[5][1]],
  ];

  it.each(WRITES)(
    "%s: revalida el patrón de ruta de la app y layout, no la URL del club",
    async (_name, replies, run) => {
      useDb(...replies);

      const result = await run();

      expect(result.ok).toBe(true);
      // Patrón de ruta (carpetas, con el grupo `(app)`) y `layout`: así lo documenta Next. Con
      // la URL concreta y `layout` Next arma una etiqueta que ninguna ruta lleva.
      expect(mocks.revalidatePath.mock.calls).toEqual([["/c/[club]/(app)", "layout"]]);
    },
  );

  it.each(WRITES)("%s: no revalida si la escritura falla", async (_name, replies, run) => {
    // La última respuesta es la de la escritura: se cambia por un error de la base de datos.
    useDb(...replies.slice(0, -1), dbError("XX000", "boom"));

    const result = await run();

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si el cliente lanza una excepción, la acción devuelve SAVE_FAILED sin romperse", async () => {
    mocks.createClient.mockRejectedValue(new TypeError("fetch failed"));

    const result = await createPractice("club-a", create);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[practice.create-practice] TypeError"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("lo que lanza notFound() lo recoge Next: no se convierte en SAVE_FAILED", async () => {
    const thrown = (() => {
      try {
        notFound();
      } catch (error) {
        return error;
      }
      throw new Error("el control de flujo de Next tenía que lanzar");
    })();
    mocks.createClient.mockRejectedValue(thrown);

    await expect(createPractice("club-a", create)).rejects.toBe(thrown);

    expect(logged).toEqual([]);
  });
});

describe("errores de la base de datos", () => {
  it("un fallo inesperado es SAVE_FAILED y se registra sin el contenido de la fila", async () => {
    useDb(ownEvent, dbError("XX000", 'fila con "texto del club"'));

    const result = await updatePracticeMeta("club-a", edit);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[practice.update-practice-meta] PostgrestError code=XX000"]);
  });

  it("un objetivo de otro club es una clave foránea rota (23503): SAVE_FAILED, y se registra", async () => {
    useDb(ownTeam, dbError("23503", "Key (primary_focus_id)=(...) is not present in table"));

    const result = await createPractice("club-a", { ...create, primaryFocusId: F1 });

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[practice.create-practice] PostgrestError code=23503"]);
  });

  it("un check de la tabla es INVALID y no se registra", async () => {
    useDb(ownTeam, dbError("23514", "check"));

    const result = await createPractice("club-a", create);

    expect(result).toEqual({ ok: false, error: "INVALID" });
    expect(logged).toEqual([]);
  });

  it("un equipo que no se gestiona es NOT_FOUND y no se registra", async () => {
    useDb(ownTeam, dbError("P0002", "NOT_FOUND"));

    const result = await createPractice("club-a", create);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual([]);
  });

  it("un permiso denegado tras pasar `can` es NOT_FOUND y se registra", async () => {
    useDb(ownTeam, dbError("42501", "new row violates row-level security policy"));

    const result = await createPractice("club-a", create);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual(["[practice.create-practice] PostgrestError code=42501"]);
  });

  it.each([
    ["updatePracticeMeta", () => updatePracticeMeta("club-a", edit)],
    ["savePracticeItems", () => savePracticeItems("club-a", save)],
  ] as const)("%s: copia obsoleta", async (_name, run) => {
    useDb(ownEvent, dbError("P0001", "STALE_COPY"));

    const result = await run();

    expect(result).toEqual({ ok: false, error: "STALE_COPY" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it.each([
    ["updatePracticeMeta", () => updatePracticeMeta("club-a", edit)],
    ["savePracticeItems", () => savePracticeItems("club-a", save)],
  ] as const)("%s: sesión cerrada", async (_name, run) => {
    useDb(ownEvent, dbError("P0001", "SESSION_CLOSED"));

    const result = await run();

    expect(result).toEqual({ ok: false, error: "SESSION_CLOSED" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("un P0001 con un mensaje que no es de la lista es SAVE_FAILED", async () => {
    useDb(ownEvent, dbError("P0001", "otra cosa"));

    const result = await savePracticeItems("club-a", save);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[practice.save-practice-items] PostgrestError code=P0001"]);
  });
});

// ── createPractice ───────────────────────────────────────────────────────────────────────

describe("createPractice", () => {
  it("crea a la hora del club", async () => {
    const db = useDb(ownTeam, reply(NEW_EVENT));

    const result = await createPractice("club-a", create);

    // 18:00 en Madrid, en noviembre (UTC+1), son las 17:00 en UTC; con 75 min acaba a las 18:15.
    expect(db.rpcs).toEqual([
      {
        name: "create_practice_session",
        args: {
          p_team: TEAM,
          p_starts_at: "2026-11-17T17:00:00.000Z",
          p_ends_at: "2026-11-17T18:15:00.000Z",
          p_title: "Defensa en transición",
        },
      },
    ]);
    expect(result).toEqual({ ok: true, data: { eventId: NEW_EVENT } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/c/[club]/(app)", "layout");
  });

  it("lee antes el equipo de este club, y la función recibe ese mismo equipo", async () => {
    const db = useDb(ownTeam, reply(NEW_EVENT));

    await createPractice("club-a", create);

    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("teams");
    expect(db.queries[0].sent("select")).toEqual(["id"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", TEAM],
    ]);
    expect(db.queries[0].calls.some((call) => call.method === "maybeSingle")).toBe(true);
    expect(db.rpcs[0].args.p_team).toBe(TEAM);
  });

  it("un equipo que no es de este club es NOT_FOUND y no llega a la función", async () => {
    const db = useDb(noTeam);

    const result = await createPractice("club-a", create);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("si falla esa lectura no llama a la función y se registra", async () => {
    const db = useDb(dbError("XX000", "boom"));

    const result = await createPractice("club-a", create);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual(["[practice.create-practice] PostgrestError code=XX000"]);
  });

  it("manda lo que se rellena, con los textos recortados", async () => {
    const db = useDb(ownTeam, reply(NEW_EVENT));

    await createPractice("club-a", {
      ...create,
      title: "  Defensa en transición  ",
      primaryFocusId: F1,
      secondaryFocusId: F2,
      location: "  Pista 2  ",
    });

    expect(db.rpcs[0].args).toStrictEqual({
      p_team: TEAM,
      p_starts_at: "2026-11-17T17:00:00.000Z",
      p_ends_at: "2026-11-17T18:15:00.000Z",
      p_title: "Defensa en transición",
      p_primary_focus: F1,
      p_secondary_focus: F2,
      p_location: "Pista 2",
    });
  });

  it("un opcional vacío, null o en blanco no se envía: la función lo toma como vacío", async () => {
    const db = useDb(ownTeam, reply(NEW_EVENT), ownTeam, reply(NEW_EVENT));

    await createPractice("club-a", create);
    await createPractice("club-a", {
      ...create,
      primaryFocusId: "",
      secondaryFocusId: "",
      location: "   ",
    });

    for (const { args } of db.rpcs) {
      expect(Object.keys(args).sort()).toEqual(["p_ends_at", "p_starts_at", "p_team", "p_title"]);
    }
  });

  it("la hora de verano no es la de invierno: el desfase sale de la fecha y la zona del club", async () => {
    const db = useDb(ownTeam, reply(NEW_EVENT));

    await createPractice("club-a", { ...create, date: "2026-07-14" });

    // 18:00 en Madrid, en julio (UTC+2).
    expect(db.rpcs[0].args).toMatchObject({
      p_starts_at: "2026-07-14T16:00:00.000Z",
      p_ends_at: "2026-07-14T17:15:00.000Z",
    });
  });

  it("la zona es la del club, no la del servidor ni la de Madrid", async () => {
    mocks.requireClub.mockResolvedValue({
      ...clubContext("coach"),
      org: { ...clubContext("coach").org, timezone: "America/Bogota" },
    } satisfies ClubContext);
    const db = useDb(ownTeam, reply(NEW_EVENT));

    await createPractice("club-a", create);

    // 18:00 en Bogotá (UTC-5, sin cambio de hora).
    expect(db.rpcs[0].args).toMatchObject({
      p_starts_at: "2026-11-17T23:00:00.000Z",
      p_ends_at: "2026-11-18T00:15:00.000Z",
    });
  });

  it("el fin es el inicio más la duración, también a través del cambio de hora", async () => {
    const db = useDb(ownTeam, reply(NEW_EVENT));

    // La noche del cambio a la hora de invierno (de las 03:00 a las 02:00 del domingo 25 oct).
    await createPractice("club-a", {
      ...create,
      date: "2026-10-24",
      time: "23:00",
      durationMinutes: 240,
    });

    // 23:00 de verano son las 21:00 UTC; cuatro horas después son las 01:00 UTC, que ya es
    // hora de invierno. Sumar cuatro horas al reloj de pared daría las 03:00.
    expect(db.rpcs[0].args).toMatchObject({
      p_starts_at: "2026-10-24T21:00:00.000Z",
      p_ends_at: "2026-10-25T01:00:00.000Z",
    });
  });

  it("si solo se elige el secundario, pasa a ser el principal", async () => {
    const db = useDb(ownTeam, reply(NEW_EVENT));

    await createPractice("club-a", { ...create, primaryFocusId: "", secondaryFocusId: F2 });

    expect(db.rpcs[0].args).toMatchObject({ p_primary_focus: F2 });
    expect(db.rpcs[0].args).not.toHaveProperty("p_secondary_focus");
  });

  it("el principal solo se queda como está", async () => {
    const db = useDb(ownTeam, reply(NEW_EVENT));

    await createPractice("club-a", { ...create, primaryFocusId: F1 });

    expect(db.rpcs[0].args).toMatchObject({ p_primary_focus: F1 });
    expect(db.rpcs[0].args).not.toHaveProperty("p_secondary_focus");
  });

  it("fecha imposible", async () => {
    const db = useDb();

    const result = await createPractice("club-a", { ...create, date: "2026-02-30" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { date: "Elige una fecha y una hora válidas." },
    });
    expect(db.calls).toBe(0);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it.each(["25:00", "18:60", "1800", "18:00:00", "tarde"])(
    "la hora %s no existe: el mismo error, sin llegar a la base de datos",
    async (time) => {
      const db = useDb();

      const result = await createPractice("club-a", { ...create, time });

      expect(result).toEqual({
        ok: false,
        error: "INVALID",
        fieldErrors: { date: "Elige una fecha y una hora válidas." },
      });
      expect(db.calls).toBe(0);
    },
  );

  it("sin fecha o sin hora", async () => {
    const result = await createPractice("club-a", { ...create, date: " ", time: "" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { date: "Elige una fecha.", time: "Elige una hora." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("la duración tiene que estar entre 15 y 240 minutos", async () => {
    const message = "La duración tiene que estar entre 15 y 240 minutos.";

    for (const durationMinutes of [5, 14, 241, 60.5, Number.NaN, -75]) {
      const result = await createPractice("club-a", { ...create, durationMinutes });

      expect(result).toEqual({
        ok: false,
        error: "INVALID",
        fieldErrors: { durationMinutes: message },
      });
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("una duración que llega como texto o ausente no se acepta", async () => {
    const message = "La duración tiene que estar entre 15 y 240 minutos.";

    const text = await createPractice("club-a", unsafe({ ...create, durationMinutes: "75" }));
    const missing = await createPractice("club-a", unsafe({ ...create, durationMinutes: undefined }));

    expect(text).toEqual({ ok: false, error: "INVALID", fieldErrors: { durationMinutes: message } });
    expect(missing).toEqual({ ok: false, error: "INVALID", fieldErrors: { durationMinutes: message } });
  });

  it.each([15, 240])("una duración de %s minutos vale", async (durationMinutes) => {
    const db = useDb(ownTeam, reply(NEW_EVENT));

    const result = await createPractice("club-a", { ...create, durationMinutes });

    expect(result.ok).toBe(true);
    expect(db.rpcs[0].args).toMatchObject({
      p_starts_at: "2026-11-17T17:00:00.000Z",
      p_ends_at: new Date(Date.parse("2026-11-17T17:00:00.000Z") + durationMinutes * 60_000).toISOString(),
    });
  });

  it("el mismo objetivo dos veces señala el secundario", async () => {
    const result = await createPractice("club-a", {
      ...create,
      primaryFocusId: F1,
      secondaryFocusId: F1,
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { secondaryFocusId: "El objetivo secundario tiene que ser distinto del principal." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("título vacío, en blanco, ausente o demasiado largo", async () => {
    for (const title of ["", "   ", null, undefined]) {
      const result = await createPractice("club-a", unsafe({ ...create, title }));

      expect(result).toEqual({
        ok: false,
        error: "INVALID",
        fieldErrors: { title: "Escribe un título." },
      });
    }

    const long = await createPractice("club-a", { ...create, title: "a".repeat(81) });
    expect(long).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Máximo 80 caracteres." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un título de 80 caracteres vale", async () => {
    const db = useDb(ownTeam, reply(NEW_EVENT));

    const result = await createPractice("club-a", { ...create, title: "a".repeat(80) });

    expect(result.ok).toBe(true);
    expect(db.rpcs[0].args.p_title).toBe("a".repeat(80));
  });

  it("un lugar de más de 80 caracteres", async () => {
    const result = await createPractice("club-a", { ...create, location: "a".repeat(81) });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { location: "Máximo 80 caracteres." },
    });
  });

  it("sin equipo, o con uno que no es un uuid", async () => {
    for (const teamId of ["", "no-es-un-uuid", null, undefined]) {
      const result = await createPractice("club-a", unsafe({ ...create, teamId }));

      expect(result).toEqual({
        ok: false,
        error: "INVALID",
        fieldErrors: { teamId: "Elige un equipo." },
      });
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un objetivo que no es un uuid señala su campo", async () => {
    const result = await createPractice("club-a", { ...create, primaryFocusId: "no-es-un-uuid" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { primaryFocusId: "Elige un objetivo de la lista." },
    });
  });

  it("sin ningún campo, cada uno dice lo suyo en español", async () => {
    const result = await createPractice("club-a", unsafe({}));

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        teamId: "Elige un equipo.",
        date: "Elige una fecha.",
        time: "Elige una hora.",
        durationMinutes: "La duración tiene que estar entre 15 y 240 minutos.",
        title: "Escribe un título.",
        primaryFocusId: "Elige un objetivo de la lista.",
        secondaryFocusId: "Elige un objetivo de la lista.",
        location: "Revisa este campo.",
      },
    });
  });
});

// ── updatePracticeMeta ───────────────────────────────────────────────────────────────────

describe("updatePracticeMeta", () => {
  it("lee antes el entreno de este club con su plan", async () => {
    const db = useDb(ownEvent, reply(NEXT_STAMP));

    await updatePracticeMeta("club-a", edit);

    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("events");
    expect(db.queries[0].sent("select")).toEqual(["id, practice_plans(id)"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", EVENT],
      ["kind", "practice"],
    ]);
    expect(db.queries[0].calls.some((call) => call.method === "maybeSingle")).toBe(true);
  });

  it("guarda el estado entero del formulario y devuelve el updated_at nuevo tal cual", async () => {
    const db = useDb(ownEvent, reply(NEXT_STAMP));

    const result = await updatePracticeMeta("club-a", {
      ...edit,
      title: "  Defensa en transición ",
      location: " Pista 2 ",
      notes: " Traer petos. ",
    });

    expect(db.rpcs).toEqual([
      {
        name: "update_practice_session",
        args: {
          p_event: EVENT,
          p_expected_updated_at: "2026-11-17T10:00:00.123456+00:00",
          p_starts_at: "2026-11-17T17:00:00.000Z",
          p_ends_at: "2026-11-17T18:15:00.000Z",
          p_title: "Defensa en transición",
          p_primary_focus: F1,
          p_secondary_focus: F2,
          p_location: "Pista 2",
          p_notes: "Traer petos.",
        },
      },
    ]);
    expect(result).toEqual({ ok: true, data: { updatedAt: NEXT_STAMP } });
  });

  it("un opcional vacío no se envía: editar es dejar la sesión como dice el formulario", async () => {
    const db = useDb(ownEvent, reply(NEXT_STAMP));

    await updatePracticeMeta("club-a", {
      ...edit,
      primaryFocusId: null,
      secondaryFocusId: "",
      location: "",
      notes: "  ",
    });

    expect(Object.keys(db.rpcs[0].args).sort()).toEqual([
      "p_ends_at",
      "p_event",
      "p_expected_updated_at",
      "p_starts_at",
      "p_title",
    ]);
  });

  it("si solo se elige el secundario, pasa a ser el principal", async () => {
    const db = useDb(ownEvent, reply(NEXT_STAMP));

    await updatePracticeMeta("club-a", { ...edit, primaryFocusId: null, secondaryFocusId: F2 });

    expect(db.rpcs[0].args).toMatchObject({ p_primary_focus: F2 });
    expect(db.rpcs[0].args).not.toHaveProperty("p_secondary_focus");
  });

  it("un entreno que no es de este club es NOT_FOUND y no llega a la función", async () => {
    const db = useDb(noEvent);

    const result = await updatePracticeMeta("club-a", edit);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("un entreno sin plan es NOT_FOUND y no llega a la función", async () => {
    const db = useDb(noPlan);

    const result = await updatePracticeMeta("club-a", edit);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
  });

  it("si falla esa lectura no llama a la función y se registra", async () => {
    const db = useDb(dbError("XX000", "boom"));

    const result = await updatePracticeMeta("club-a", edit);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
    expect(logged).toEqual(["[practice.update-practice-meta] PostgrestError code=XX000"]);
  });

  it("una fecha imposible no llega a la base de datos", async () => {
    const db = useDb();

    const result = await updatePracticeMeta("club-a", { ...edit, date: "2026-02-30" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { date: "Elige una fecha y una hora válidas." },
    });
    expect(db.calls).toBe(0);
  });

  it("sin la copia que se estaba editando no se guarda", async () => {
    const result = await updatePracticeMeta("club-a", { ...edit, expectedUpdatedAt: "" });

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(result.ok ? null : Object.keys(result.fieldErrors ?? {})).toEqual(["expectedUpdatedAt"]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("unas notas de más de 2000 caracteres", async () => {
    const result = await updatePracticeMeta("club-a", { ...edit, notes: "a".repeat(2001) });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { notes: "Máximo 2000 caracteres." },
    });
  });

  it("unas notas de 2000 caracteres valen", async () => {
    const db = useDb(ownEvent, reply(NEXT_STAMP));

    const result = await updatePracticeMeta("club-a", { ...edit, notes: "a".repeat(2000) });

    expect(result.ok).toBe(true);
    expect(db.rpcs[0].args.p_notes).toBe("a".repeat(2000));
  });

  it("un id de entreno que no es un uuid", async () => {
    const result = await updatePracticeMeta("club-a", { ...edit, eventId: "no-es-un-uuid" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { eventId: "No encontramos este contenido." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("valida igual que al crear", async () => {
    const result = await updatePracticeMeta("club-a", {
      ...edit,
      title: " ",
      durationMinutes: 5,
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        title: "Escribe un título.",
        durationMinutes: "La duración tiene que estar entre 15 y 240 minutos.",
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("el mismo objetivo dos veces señala el secundario", async () => {
    const result = await updatePracticeMeta("club-a", {
      ...edit,
      primaryFocusId: F1,
      secondaryFocusId: F1,
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { secondaryFocusId: "El objetivo secundario tiene que ser distinto del principal." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

// ── savePracticeItems ────────────────────────────────────────────────────────────────────

describe("savePracticeItems", () => {
  const withId: PracticeItemDraft = {
    id: ITEM,
    drillId: DRILL,
    title: "Tres contra dos",
    phase: "Parte principal",
    minutes: 20,
    notes: "Rotar cada minuto.",
  };
  const withoutId: PracticeItemDraft = {
    drillId: null,
    title: "Vuelta a la calma",
    phase: null,
    minutes: 5,
    notes: null,
  };

  it("guardar ítems", async () => {
    const db = useDb(ownEvent, reply(SAVE_RESULT));

    const result = await savePracticeItems("club-a", {
      eventId: EVENT,
      expectedUpdatedAt: "2026-11-17T10:00:00.123456+00:00",
      saveId: "aaaaaaaa-0000-4000-8000-000000000099",
      items: [withId, withoutId],
    });

    expect(db.rpcs).toEqual([
      {
        name: "save_practice_items",
        args: {
          p_plan: PLAN,
          p_expected_updated_at: "2026-11-17T10:00:00.123456+00:00",
          p_save_id: "aaaaaaaa-0000-4000-8000-000000000099",
          p_items: [
            {
              id: ITEM,
              drill_id: DRILL,
              title: "Tres contra dos",
              phase: "Parte principal",
              minutes: 20,
              notes: "Rotar cada minuto.",
            },
            {
              drill_id: null,
              title: "Vuelta a la calma",
              phase: null,
              minutes: 5,
              notes: null,
            },
          ],
        },
      },
    ]);
    expect(result).toEqual({
      ok: true,
      data: { updatedAt: NEXT_STAMP, itemIds: SAVE_RESULT.item_ids },
    });
  });

  it("un ítem nuevo no lleva la clave id, ni siquiera con valor vacío", async () => {
    const db = useDb(ownEvent, reply(SAVE_RESULT));

    await savePracticeItems("club-a", { ...save, items: [withoutId] });

    const [sent] = db.rpcs[0].args.p_items as Array<Record<string, unknown>>;
    expect(Object.keys(sent)).toEqual(["drill_id", "title", "phase", "minutes", "notes"]);
  });

  it("los ítems viajan en el orden en que llegan, sin reordenar por título ni por minutos", async () => {
    const db = useDb(ownEvent, reply(SAVE_RESULT));
    const titles = ["Zeta", "Alfa", "Mike", "Beta"];

    await savePracticeItems("club-a", {
      ...save,
      items: titles.map((title, index) => ({ ...draft, title, minutes: 40 - index * 5 })),
    });

    const sent = db.rpcs[0].args.p_items as Array<{ title: string }>;
    expect(sent.map((entry) => entry.title)).toEqual(titles);
  });

  it("el plan es el que devuelve la lectura previa, venga como lista o como objeto", async () => {
    const db = useDb(ownEvent, reply(SAVE_RESULT), ownEventObject, reply(SAVE_RESULT));

    await savePracticeItems("club-a", save);
    await savePracticeItems("club-a", save);

    expect(db.rpcs.map((rpc) => rpc.args.p_plan)).toEqual([PLAN, PLAN]);
  });

  it("lee antes el entreno de este club con su plan", async () => {
    const db = useDb(ownEvent, reply(SAVE_RESULT));

    await savePracticeItems("club-a", save);

    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("events");
    expect(db.queries[0].sent("select")).toEqual(["id, practice_plans(id)"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", EVENT],
      ["kind", "practice"],
    ]);
  });

  it("recorta los textos y guarda como null la fase y las notas vacías", async () => {
    const db = useDb(ownEvent, reply(SAVE_RESULT));

    await savePracticeItems("club-a", {
      ...save,
      items: [{ ...draft, title: "  Calentamiento  ", phase: "   ", notes: "" }],
    });

    expect(db.rpcs[0].args.p_items).toEqual([
      { drill_id: null, title: "Calentamiento", phase: null, minutes: 10, notes: null },
    ]);
  });

  it("una lista vacía se guarda: deja la sesión sin ítems", async () => {
    const db = useDb(ownEvent, reply(SAVE_RESULT));

    const result = await savePracticeItems("club-a", { ...save, items: [] });

    expect(result.ok).toBe(true);
    expect(db.rpcs[0].args.p_items).toEqual([]);
  });

  it("30 ítems se guardan", async () => {
    const db = useDb(ownEvent, reply(SAVE_RESULT));

    const result = await savePracticeItems("club-a", {
      ...save,
      items: Array.from({ length: 30 }, () => draft),
    });

    expect(result.ok).toBe(true);
    expect(db.rpcs[0].args.p_items).toHaveLength(30);
  });

  it("31 ítems", async () => {
    const result = await savePracticeItems("club-a", {
      ...save,
      items: Array.from({ length: 31 }, () => draft),
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { items: "Una sesión tiene como máximo 30 ejercicios." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un ítem con el título vacío señala su fila", async () => {
    const result = await savePracticeItems("club-a", {
      ...save,
      items: [{ ...draft, title: "  " }],
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { "items.0.title": "Escribe un título." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("los minutos de un ítem entre 1 y 120, y enteros", async () => {
    for (const minutes of [0, 121, -5, 2.5, Number.NaN]) {
      const result = await savePracticeItems("club-a", {
        ...save,
        items: [draft, { ...draft, minutes }],
      });

      expect(result).toEqual({
        ok: false,
        error: "INVALID",
        fieldErrors: { "items.1.minutes": "Entre 1 y 120 minutos." },
      });
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([1, 120])("%s minutos valen", async (minutes) => {
    const db = useDb(ownEvent, reply(SAVE_RESULT));

    const result = await savePracticeItems("club-a", { ...save, items: [{ ...draft, minutes }] });

    expect(result.ok).toBe(true);
    expect((db.rpcs[0].args.p_items as Array<{ minutes: number }>)[0].minutes).toBe(minutes);
  });

  it("título, fase y notas demasiado largos señalan cada uno el suyo", async () => {
    const result = await savePracticeItems("club-a", {
      ...save,
      items: [{ ...draft, title: "a".repeat(81), phase: "a".repeat(41), notes: "a".repeat(501) }],
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        "items.0.title": "Máximo 80 caracteres.",
        "items.0.phase": "Máximo 40 caracteres.",
        "items.0.notes": "Máximo 500 caracteres.",
      },
    });
  });

  it("un id de ítem o de ejercicio que no es un uuid señala su campo", async () => {
    const result = await savePracticeItems("club-a", {
      ...save,
      items: [{ ...draft, id: "no-es-un-uuid", drillId: "tampoco" }],
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        "items.0.id": "No encontramos este contenido.",
        "items.0.drillId": "No encontramos este contenido.",
      },
    });
  });

  it("un ítem sin ningún campo dice lo suyo en español", async () => {
    const result = await savePracticeItems("club-a", { ...save, items: [unsafe({})] });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        "items.0.drillId": "No encontramos este contenido.",
        "items.0.title": "Escribe un título.",
        "items.0.phase": "Revisa este campo.",
        "items.0.minutes": "Entre 1 y 120 minutos.",
        "items.0.notes": "Revisa este campo.",
      },
    });
  });

  it("unos ítems que no son una lista no llegan a la base de datos", async () => {
    const result = await savePracticeItems("club-a", { ...save, items: unsafe("Calentamiento") });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { items: "Revisa este campo." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("expectedUpdatedAt viaja intacto, con sus microsegundos", async () => {
    const db = useDb(ownEvent, reply(SAVE_RESULT));

    await savePracticeItems("club-a", { ...save, expectedUpdatedAt: "2026-11-17T10:00:00.123456+00:00" });

    expect(db.rpcs[0].args.p_expected_updated_at).toBe("2026-11-17T10:00:00.123456+00:00");
  });

  it("sin la copia que se estaba editando no se guarda", async () => {
    const result = await savePracticeItems("club-a", { ...save, expectedUpdatedAt: "" });

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(result.ok ? null : Object.keys(result.fieldErrors ?? {})).toEqual(["expectedUpdatedAt"]);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un entreno que no es de este club es NOT_FOUND y no llega a la función", async () => {
    const db = useDb(noEvent);

    const result = await savePracticeItems("club-a", save);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("un entreno sin plan es NOT_FOUND y no llega a la función", async () => {
    const db = useDb(noPlan, reply({ id: EVENT, practice_plans: null }));

    const withoutPlan = await savePracticeItems("club-a", save);
    const nullPlan = await savePracticeItems("club-a", save);

    expect(withoutPlan).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(nullPlan).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
  });

  it("un ítem que no es de este plan lo rechaza la función: INVALID, sin registro", async () => {
    useDb(ownEvent, dbError("22023", "INVALID"));

    const result = await savePracticeItems("club-a", save);

    expect(result).toEqual({ ok: false, error: "INVALID" });
    expect(logged).toEqual([]);
  });
});

// ── duplicatePractice ────────────────────────────────────────────────────────────────────

describe("duplicatePractice", () => {
  it("duplicar", async () => {
    const db = useDb(ownEvent, reply(NEW_EVENT));

    const result = await duplicatePractice("club-a", duplicate);

    // 18:00 en Madrid, el 24 de noviembre (UTC+1): las 17:00 en UTC.
    expect(db.rpcs).toEqual([
      {
        name: "duplicate_practice",
        args: { p_event: EVENT, p_starts_at: "2026-11-24T17:00:00.000Z" },
      },
    ]);
    expect(result).toEqual({ ok: true, data: { eventId: NEW_EVENT } });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/c/[club]/(app)", "layout");
  });

  it("la hora sale de la zona del club también en verano", async () => {
    const db = useDb(ownEvent, reply(NEW_EVENT));

    await duplicatePractice("club-a", { ...duplicate, date: "2026-07-14" });

    expect(db.rpcs[0].args.p_starts_at).toBe("2026-07-14T16:00:00.000Z");
  });

  it("lee antes el entreno de este club con su plan", async () => {
    const db = useDb(ownEvent, reply(NEW_EVENT));

    await duplicatePractice("club-a", duplicate);

    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("events");
    expect(db.queries[0].sent("select")).toEqual(["id, practice_plans(id)"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", EVENT],
      ["kind", "practice"],
    ]);
  });

  it("un entreno que no es de este club es NOT_FOUND y no llega a la función", async () => {
    const db = useDb(noEvent);

    const result = await duplicatePractice("club-a", duplicate);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un entreno sin plan es NOT_FOUND y no llega a la función", async () => {
    const db = useDb(noPlan);

    const result = await duplicatePractice("club-a", duplicate);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
  });

  it("una fecha imposible o una hora que no existe no llegan a la base de datos", async () => {
    const db = useDb();

    const date = await duplicatePractice("club-a", { ...duplicate, date: "2026-02-30" });
    const time = await duplicatePractice("club-a", { ...duplicate, time: "25:00" });

    const invalid = {
      ok: false,
      error: "INVALID",
      fieldErrors: { date: "Elige una fecha y una hora válidas." },
    };
    expect(date).toEqual(invalid);
    expect(time).toEqual(invalid);
    expect(db.calls).toBe(0);
  });

  it("sin fecha o sin hora", async () => {
    const result = await duplicatePractice("club-a", { ...duplicate, date: "", time: "" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { date: "Elige una fecha.", time: "Elige una hora." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un id de entreno que no es un uuid", async () => {
    const result = await duplicatePractice("club-a", { ...duplicate, eventId: "no-es-un-uuid" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { eventId: "No encontramos este contenido." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

// ── cancelPractice ───────────────────────────────────────────────────────────────────────

describe("cancelPractice", () => {
  it("cancelar", async () => {
    const db = useDb(reply([{ id: EVENT }]));

    const result = await cancelPractice("club-a", { eventId: EVENT });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.rpcs).toEqual([]);
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("events");
    expect(db.queries[0].sent("update")).toEqual([{ status: "cancelled" }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", EVENT],
      ["kind", "practice"],
      ["status", "scheduled"],
    ]);
    expect(db.queries[0].sent("select")).toEqual(["id"]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/c/[club]/(app)", "layout");
  });

  it("con 0 filas (no existe, es de otro club, no es un entreno o ya no está programado) es NOT_FOUND", async () => {
    useDb(reply([]));

    const result = await cancelPractice("club-a", { eventId: EVENT });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("un permiso denegado es NOT_FOUND y se registra", async () => {
    useDb(dbError("42501", "new row violates row-level security policy"));

    const result = await cancelPractice("club-a", { eventId: EVENT });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual(["[practice.cancel-practice] PostgrestError code=42501"]);
  });

  it("un id de entreno que no es un uuid no llega a la base de datos", async () => {
    const result = await cancelPractice("club-a", { eventId: "no-es-un-uuid" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { eventId: "No encontramos este contenido." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

// ── findDrills ───────────────────────────────────────────────────────────────────────────

describe("findDrills", () => {
  function drill(id: string, title: string, status: DrillSummary["status"] = "published"): DrillSummary {
    return {
      id,
      title,
      status,
      createdBy: null,
      minAge: 10,
      maxAge: null,
      minPlayers: 6,
      maxPlayers: 12,
      minMinutes: 10,
      maxMinutes: 15,
      focus: [],
    };
  }

  const PUBLISHED = drill("00000000-0000-4000-8000-0000000000d1", "Rebote y salida");
  const OTHER = drill("00000000-0000-4000-8000-0000000000d2", "Pase y va");
  const DRAFT = drill("00000000-0000-4000-8000-0000000000d3", "Borrador ajeno", "draft");
  const ARCHIVED = drill("00000000-0000-4000-8000-0000000000d4", "Ya no sirve", "archived");

  beforeEach(() => {
    mocks.searchDrills.mockResolvedValue({ drills: [PUBLISHED, DRAFT, OTHER, ARCHIVED], hasMore: false });
  });

  it("devuelve solo los publicados, en el orden en que llegan, como DrillSummary[]", async () => {
    const result = await findDrills("club-a", {});

    expect(result).toEqual({ ok: true, data: [PUBLISHED, OTHER] });
  });

  it("busca en el club de la sesión, con el texto y el objetivo que le dan", async () => {
    await findDrills("club-a", { q: "outlet", focus: "rebote" });

    expect(mocks.requireClub).toHaveBeenCalledWith("club-a");
    expect(mocks.searchDrills).toHaveBeenCalledTimes(1);
    expect(mocks.searchDrills).toHaveBeenCalledWith(clubContext("coach"), { q: "outlet", focus: "rebote" });
  });

  it("sin filtros busca sin ellos", async () => {
    await findDrills("club-a", {});

    expect(mocks.searchDrills).toHaveBeenCalledWith(clubContext("coach"), {});
  });

  it("limpia lo que no es una búsqueda: espacios, caracteres de control y un objetivo que no es un slug", async () => {
    await findDrills("club-a", { q: "  rebote\u0000 y salida  ", focus: "no es un slug" });

    expect(mocks.searchDrills).toHaveBeenCalledWith(clubContext("coach"), { q: "rebote  y salida" });
  });

  it("también lo hace la dirección", async () => {
    mocks.requireClub.mockResolvedValue(clubContext("admin"));

    const result = await findDrills("club-a", {});

    expect(result.ok).toBe(true);
  });

  it.each(["player", "guardian"] as const)("un %s recibe NOT_FOUND sin buscar nada", async (role) => {
    mocks.requireClub.mockResolvedValue(clubContext(role));

    const result = await findDrills("club-a", {});

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.searchDrills).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un club que no existe lanza el 404, no lo traga", async () => {
    mocks.requireClub.mockRejectedValue(NOT_FOUND);

    await expect(findDrills("club-a", {})).rejects.toBe(NOT_FOUND);

    expect(mocks.searchDrills).not.toHaveBeenCalled();
  });

  it("una entrada que no es texto es INVALID y no consulta el club ni busca", async () => {
    const result = await findDrills("club-a", unsafe({ q: 5 }));

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(mocks.requireClub).not.toHaveBeenCalled();
    expect(mocks.searchDrills).not.toHaveBeenCalled();
  });

  it("una lectura que falla es SAVE_FAILED y se registra sin el contenido del error", async () => {
    mocks.searchDrills.mockRejectedValue(Object.assign(new Error('fila con "texto del club"'), { code: "XX000" }));

    const result = await findDrills("club-a", {});

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[practice.find-drills] Error code=XX000"]);
  });

  it("solo lee: no revalida nada", async () => {
    await findDrills("club-a", {});

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

// ── addDrillToPractice ───────────────────────────────────────────────────────────────────

describe("addDrillToPractice", () => {
  const FIRST = itemRow(1, {
    drill_id: DRILL,
    title_override: "Tres contra dos",
    phase: "Parte principal",
    minutes: 20,
    notes: "Rotar.",
  });
  const SECOND = itemRow(2);

  it("añade el ejercicio al final, con su título y sus minutos mínimos, y devuelve el título", async () => {
    // Llegan desordenados: la lista se guarda por `sort`.
    const db = useDb(planWith([SECOND, FIRST]), publishedDrill, reply(NEXT_STAMP));

    const result = await addDrillToPractice("club-a", addDrill);

    expect(result).toEqual({ ok: true, data: { title: "Rebote y salida" } });
    expect(db.rpcs).toEqual([
      {
        name: "save_practice_items",
        args: {
          p_plan: PLAN,
          p_expected_updated_at: STAMP,
          p_items: [
            {
              id: FIRST.id,
              drill_id: DRILL,
              title: "Tres contra dos",
              phase: "Parte principal",
              minutes: 20,
              notes: "Rotar.",
            },
            { id: SECOND.id, drill_id: null, title: "Bloque 2", phase: null, minutes: 10, notes: null },
            { drill_id: DRILL, title: "Rebote y salida", phase: null, minutes: 12, notes: null },
          ],
        },
      },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/c/[club]/(app)", "layout");
  });

  it("en una sesión vacía el ejercicio es el único ítem, sin clave id", async () => {
    const db = useDb(planWith([]), publishedDrill, reply(NEXT_STAMP));

    await addDrillToPractice("club-a", addDrill);

    const [sent] = db.rpcs[0].args.p_items as Array<Record<string, unknown>>;
    expect(db.rpcs[0].args.p_items).toHaveLength(1);
    expect(Object.keys(sent)).toEqual(["drill_id", "title", "phase", "minutes", "notes"]);
  });

  it("la copia esperada es el updated_at leído, tal cual, con sus microsegundos", async () => {
    const odd = "2026-11-17T10:00:00.12+00:00";
    const db = useDb(planWith([], odd), publishedDrill, reply(NEXT_STAMP));

    await addDrillToPractice("club-a", addDrill);

    expect(db.rpcs[0].args.p_expected_updated_at).toBe(odd);
  });

  it("un ítem que ya estaba sin título propio lo conserva así: no se le inventa uno", async () => {
    const bare = itemRow(1, { drill_id: DRILL, title_override: null });
    const db = useDb(planWith([bare]), publishedDrill, reply(NEXT_STAMP));

    await addDrillToPractice("club-a", addDrill);

    expect((db.rpcs[0].args.p_items as Array<{ title: unknown }>)[0].title).toBeNull();
  });

  it("lee la sesión y el ejercicio acotados a este club", async () => {
    const db = useDb(planWith([]), publishedDrill, reply(NEXT_STAMP));

    await addDrillToPractice("club-a", addDrill);

    const [session, drill] = db.queries;
    expect(session.table).toBe("events");
    expect(session.sent("select")).toEqual([
      "id, practice_plans(id, updated_at, practice_items(id, sort, drill_id, title_override, phase, minutes, notes))",
    ]);
    expect(session.filters).toEqual([
      ["organization_id", ORG],
      ["id", EVENT],
      ["kind", "practice"],
    ]);
    expect(drill.table).toBe("drills");
    expect(drill.sent("select")).toEqual(["id, title, min_minutes"]);
    expect(drill.filters).toEqual([
      ["organization_id", ORG],
      ["id", DRILL],
      ["status", "published"],
    ]);
  });

  it("el plan sale igual si PostgREST lo devuelve como objeto", async () => {
    const db = useDb(
      reply({ id: EVENT, practice_plans: { id: PLAN, updated_at: STAMP, practice_items: [] } }),
      publishedDrill,
      reply(NEXT_STAMP),
    );

    await addDrillToPractice("club-a", addDrill);

    expect(db.rpcs[0].args.p_plan).toBe(PLAN);
  });

  it.each([
    ["una sesión que no es de este club o que no se ve", () => [noEvent]],
    ["un entreno sin plan", () => [noPlan]],
    ["un ejercicio en borrador de otro entrenador, de otro club, archivado o que no existe", () => [planWith([]), noDrill]],
  ])("%s es NOT_FOUND y no llega a la función", async (_name, replies) => {
    const db = useDb(...replies());

    const result = await addDrillToPractice("club-a", addDrill);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("con 30 ítems es INVALID en `items`, con el mismo mensaje que el constructor, y no llega a la función", async () => {
    const thirty = Array.from({ length: 30 }, (_, index) => itemRow(index + 1));
    const db = useDb(planWith(thirty), publishedDrill);

    const result = await addDrillToPractice("club-a", addDrill);

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { items: "Una sesión tiene como máximo 30 ejercicios." },
    });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("con 29 ítems cabe el que hace 30", async () => {
    const twentyNine = Array.from({ length: 29 }, (_, index) => itemRow(index + 1));
    const db = useDb(planWith(twentyNine), publishedDrill, reply(NEXT_STAMP));

    const result = await addDrillToPractice("club-a", addDrill);

    expect(result.ok).toBe(true);
    expect(db.rpcs[0].args.p_items).toHaveLength(30);
  });

  describe("copia obsoleta", () => {
    it("relee la sesión y repite una vez, con la copia y los ítems nuevos", async () => {
      const added = itemRow(3, { title_override: "Lo que guardó otra persona" });
      const db = useDb(
        planWith([FIRST]),
        publishedDrill,
        dbError("P0001", "STALE_COPY"),
        planWith([FIRST, added], NEXT_STAMP),
        reply("2026-11-17T10:09:00.000001+00:00"),
      );

      const result = await addDrillToPractice("club-a", addDrill);

      expect(result).toEqual({ ok: true, data: { title: "Rebote y salida" } });
      expect(db.rpcs).toHaveLength(2);
      expect(db.rpcs[0].args.p_expected_updated_at).toBe(STAMP);
      expect(db.rpcs[0].args.p_items).toHaveLength(2);
      expect(db.rpcs[1].args.p_expected_updated_at).toBe(NEXT_STAMP);
      const retried = db.rpcs[1].args.p_items as Array<{ title: string }>;
      expect(retried.map((entry) => entry.title)).toEqual([
        "Tres contra dos",
        "Lo que guardó otra persona",
        "Rebote y salida",
      ]);
      // Releer es solo de la sesión: el ejercicio no cambia.
      expect(db.queries.map((query) => query.table)).toEqual(["events", "drills", "events"]);
      expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
      expect(logged).toEqual([]);
    });

    it("una segunda copia obsoleta se devuelve: no hay un tercer intento", async () => {
      const db = useDb(
        planWith([]),
        publishedDrill,
        dbError("P0001", "STALE_COPY"),
        planWith([], NEXT_STAMP),
        dbError("P0001", "STALE_COPY"),
      );

      const result = await addDrillToPractice("club-a", addDrill);

      expect(result).toEqual({ ok: false, error: "STALE_COPY" });
      expect(db.rpcs).toHaveLength(2);
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(logged).toEqual([]);
    });

    it("si al releer la sesión ya está llena, es INVALID y no repite", async () => {
      const thirty = Array.from({ length: 30 }, (_, index) => itemRow(index + 1));
      const db = useDb(planWith([]), publishedDrill, dbError("P0001", "STALE_COPY"), planWith(thirty, NEXT_STAMP));

      const result = await addDrillToPractice("club-a", addDrill);

      expect(result).toMatchObject({ ok: false, error: "INVALID", fieldErrors: { items: expect.any(String) } });
      expect(db.rpcs).toHaveLength(1);
    });

    it("si al releer la sesión ya no existe, es NOT_FOUND y no repite", async () => {
      const db = useDb(planWith([]), publishedDrill, dbError("P0001", "STALE_COPY"), noEvent);

      const result = await addDrillToPractice("club-a", addDrill);

      expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
      expect(db.rpcs).toHaveLength(1);
    });
  });

  describe("lo que decide la función", () => {
    it("una sesión cerrada es SESSION_CLOSED, sin repetir ni revalidar", async () => {
      const db = useDb(planWith([]), publishedDrill, dbError("P0001", "SESSION_CLOSED"));

      const result = await addDrillToPractice("club-a", addDrill);

      expect(result).toEqual({ ok: false, error: "SESSION_CLOSED" });
      expect(db.rpcs).toHaveLength(1);
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(logged).toEqual([]);
    });

    it("un equipo que no se gestiona (otro entrenador del club) es NOT_FOUND", async () => {
      useDb(planWith([]), publishedDrill, dbError("P0002", "NOT_FOUND"));

      const result = await addDrillToPractice("club-a", addDrill);

      expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
      expect(logged).toEqual([]);
    });

    it("un fallo inesperado es SAVE_FAILED y se registra sin el contenido de la fila", async () => {
      useDb(planWith([]), publishedDrill, dbError("XX000", 'fila con "texto del club"'));

      const result = await addDrillToPractice("club-a", addDrill);

      expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
      expect(logged).toEqual(["[practice.add-drill-to-practice] PostgrestError code=XX000"]);
    });
  });

  it("si falla la lectura de la sesión no llama a la función y se registra", async () => {
    const db = useDb(dbError("XX000", "boom"));

    const result = await addDrillToPractice("club-a", addDrill);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
    expect(logged).toEqual(["[practice.add-drill-to-practice] PostgrestError code=XX000"]);
  });

  it("si falla la lectura del ejercicio no llama a la función y se registra", async () => {
    const db = useDb(planWith([]), dbError("XX000", "boom"));

    const result = await addDrillToPractice("club-a", addDrill);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
  });

  it("un id que no es un uuid señala su campo y no consulta el club ni la base de datos", async () => {
    const result = await addDrillToPractice("club-a", { eventId: "no-es-un-uuid", drillId: "tampoco" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { eventId: "No encontramos este contenido.", drillId: "No encontramos este contenido." },
    });
    expect(mocks.requireClub).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
