import { notFound } from "next/navigation";
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
  createTeamSchedule,
  createVenue,
  deleteTeamSchedule,
  deleteVenue,
  renameVenue,
  updateTeamSchedule,
} from "./actions";

// Datos neutros y ficticios: los tests de `src/` no pueden nombrar a ningún club (pnpm
// check:guards).
const ORG = "org-a";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const NEW_ID = uuid(170);
const TEAM = uuid(4);
const VENUE = uuid(6);

function contextWithRole(role: ClubContext["membership"]["role"], orgId = ORG): ClubContext {
  return {
    org: { id: orgId, slug: "club-a", name: "Club A", timezone: "Europe/Madrid" },
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
// vuelve de ella, no que un mock haya sido llamado. El mismo doble que el de
// `structure/actions.test.ts`.

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
  delete = (...args: unknown[]) => this.record("delete", args);
  eq = (...args: unknown[]) => this.record("eq", args);
  single = (...args: unknown[]) => this.record("single", args);
  maybeSingle = (...args: unknown[]) => this.record("maybeSingle", args);

  then<A = Reply, B = never>(
    onfulfilled?: ((value: Reply) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.reply).then(onfulfilled, onrejected);
  }

  /** Si la consulta llamó a `method`. */
  did(method: string): boolean {
    return this.calls.some((c) => c.method === method);
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

  /** Qué hace la consulta con la tabla: escribe (`insert`, `update`, `delete`) o solo lee. */
  get verb(): "insert" | "update" | "delete" | "select" {
    for (const verb of ["insert", "update", "delete"] as const) if (this.did(verb)) return verb;
    return "select";
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

  /** Las consultas que escriben en una tabla (las funciones SQL van aparte, en `rpcs`). */
  get writes(): FakeQuery[] {
    return this.queries.filter((query) => query.verb !== "select");
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
/** Lo que devuelve un `update` o un `delete` con `.select()`: las filas tocadas, o ninguna. */
const oneRow = reply([{ id: ID }]);
const noRows = reply([]);

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
  mocks.requireClub.mockResolvedValue(contextWithRole("admin"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Las entradas ────────────────────────────────────────────────────────────────────────

const SLOT = { weekday: 2, time: "18:00", durationMinutes: 75, venueId: VENUE };
const CREATE_SCHEDULE = { teamId: TEAM, ...SLOT };
const UPDATE_SCHEDULE = { id: ID, ...SLOT };

const NAME_MISSING = "Escribe un nombre.";
const NOT_FOUND_COPY = "No encontramos este contenido.";
const DUPLICATE_VENUE = "Ya hay una pista con ese nombre.";
const DUPLICATE_SLOT = "Ese equipo ya entrena ese día a esa hora.";

// ── Lo que comparten las seis acciones ──────────────────────────────────────────────────

type Run = () => Promise<ActionResult<unknown>>;

type Case = {
  /** La etiqueta de la acción en el log: `calendar.<tag>`. */
  tag: string;
  /** La acción con una entrada válida. */
  run: Run;
  /** Lo que responde la base cuando todo va bien, en orden; la última es la de la escritura. */
  happy: () => Reply[];
  /** La acción con una entrada inválida, y el campo que tiene que señalar. */
  invalid: Run;
  field: string;
};

const CASES: Record<string, Case> = {
  createVenue: {
    tag: "create-venue",
    run: () => createVenue("club-a", { name: "Pista 1" }),
    happy: () => [reply({ id: NEW_ID })],
    invalid: () => createVenue("club-a", { name: " " }),
    field: "name",
  },
  renameVenue: {
    tag: "rename-venue",
    run: () => renameVenue("club-a", { id: ID, name: "Pista 1" }),
    happy: () => [oneRow],
    invalid: () => renameVenue("club-a", { id: ID, name: "a".repeat(61) }),
    field: "name",
  },
  deleteVenue: {
    tag: "delete-venue",
    run: () => deleteVenue("club-a", { id: ID }),
    happy: () => [oneRow],
    invalid: () => deleteVenue("club-a", { id: "no-es-un-id" }),
    field: "id",
  },
  createTeamSchedule: {
    tag: "create-team-schedule",
    run: () => createTeamSchedule("club-a", CREATE_SCHEDULE),
    happy: () => [reply({ id: TEAM }), reply({ id: NEW_ID, created: 32 })],
    invalid: () => createTeamSchedule("club-a", { ...CREATE_SCHEDULE, time: "24:00" }),
    field: "time",
  },
  updateTeamSchedule: {
    tag: "update-team-schedule",
    run: () => updateTeamSchedule("club-a", UPDATE_SCHEDULE),
    happy: () => [ownRow, reply(5)],
    invalid: () => updateTeamSchedule("club-a", { ...UPDATE_SCHEDULE, durationMinutes: Number.NaN }),
    field: "durationMinutes",
  },
  deleteTeamSchedule: {
    tag: "delete-team-schedule",
    run: () => deleteTeamSchedule("club-a", { id: ID }),
    happy: () => [ownRow, reply(3)],
    invalid: () => deleteTeamSchedule("club-a", { id: "" }),
    field: "id",
  },
};

const ACTIONS = Object.entries(CASES);
/** Las tres que escriben con una función SQL, tras leer que la fila es de este club. */
const BY_RPC = ACTIONS.filter(([name]) => name.endsWith("TeamSchedule"));

/** Las respuestas de cuando todo va bien, con la de la escritura cambiada por un error. */
function failingWrite(action: Case, error: Reply): Reply[] {
  return [...action.happy().slice(0, -1), error];
}

it("son las seis acciones del calendario: tres de pistas y tres de horarios", () => {
  expect(ACTIONS).toHaveLength(6);
  expect(BY_RPC).toHaveLength(3);
});

describe("quién escribe", () => {
  it.each(ACTIONS)("%s: quien no dirige el club recibe NOT_FOUND sin tocar la base de datos", async (_name, action) => {
    for (const role of ["coach", "player", "guardian"] as const) {
      mocks.requireClub.mockResolvedValue(contextWithRole(role));

      await expect(action.run()).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    }

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it.each(ACTIONS)("%s: la dirección puede", async (_name, action) => {
    useDb(...action.happy());

    await expect(action.run()).resolves.toMatchObject({ ok: true });
    expect(logged).toEqual([]);
  });

  it.each(ACTIONS)("%s: un club que no existe lanza el 404, no lo traga", async (_name, action) => {
    mocks.requireClub.mockRejectedValue(NOT_FOUND);

    await expect(action.run()).rejects.toBe(NOT_FOUND);

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("la acción pregunta por el club que le pasan", async () => {
    useDb(reply({ id: NEW_ID }));

    await createVenue("club-b", { name: "Pista 1" });

    expect(mocks.requireClub).toHaveBeenCalledTimes(1);
    expect(mocks.requireClub).toHaveBeenCalledWith("club-b");
  });
});

describe("todo va acotado al club de la URL", () => {
  it.each(ACTIONS)("%s: cada consulta lleva o filtra el `organization_id` del club", async (_name, action) => {
    // Otro club que el de los demás tests: el id sale del contexto, no de una constante.
    mocks.requireClub.mockResolvedValue(contextWithRole("admin", "org-b"));
    const db = useDb(...action.happy());

    await expect(action.run()).resolves.toMatchObject({ ok: true });

    for (const query of db.queries) {
      if (query.verb === "insert") {
        expect(query.sent("insert")[0]).toMatchObject({ organization_id: "org-b" });
      } else {
        expect(query.filters).toContainEqual(["organization_id", "org-b"]);
      }
    }
    // Una función SQL solo recibe un id: antes se ha leído su fila acotada al club (C25).
    for (const rpc of db.rpcs) {
      expect(rpc.args).not.toHaveProperty("p_org");
      expect(db.queries.some((query) => query.verb === "select")).toBe(true);
    }
    expect(db.queries.length + db.rpcs.length).toBeGreaterThan(0);
  });

  it.each(ACTIONS)("%s: ningún update cambia una fila de club", async (_name, action) => {
    const db = useDb(...action.happy());

    await action.run();

    for (const query of db.writes) {
      if (query.verb !== "update") continue;
      expect(query.sent("update")[0]).not.toHaveProperty("organization_id");
    }
  });

  it.each(BY_RPC)("%s: los horarios no se escriben por su tabla, solo con su función", async (_name, action) => {
    const db = useDb(...action.happy());

    await action.run();

    expect(db.writes).toEqual([]);
    expect(db.rpcs).toHaveLength(1);
  });
});

describe("tras escribir", () => {
  it.each(ACTIONS)(
    "%s: revalida Gestión y la app por patrón de ruta y layout, no por la URL del club",
    async (_name, action) => {
      useDb(...action.happy());

      const result = await action.run();

      expect(result.ok).toBe(true);
      // Un horario crea, mueve y borra entrenamientos de la Agenda: la app también se revalida.
      expect(mocks.revalidatePath.mock.calls).toEqual([
        ["/c/[club]/admin", "layout"],
        ["/c/[club]/(app)", "layout"],
      ]);
    },
  );

  it.each(ACTIONS)("%s: no revalida si la escritura falla", async (_name, action) => {
    useDb(...failingWrite(action, dbError("XX000", "boom")));

    const result = await action.run();

    expect(result.ok).toBe(false);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("la entrada se valida antes de tocar la base de datos", () => {
  it.each(ACTIONS)("%s: una entrada inválida es INVALID con su campo, sin club ni base de datos", async (_name, action) => {
    const result = await action.invalid();

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(Object.keys((result as { fieldErrors?: Record<string, string> }).fieldErrors ?? {})).toEqual([
      action.field,
    ]);
    expect(mocks.requireClub).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("createVenue: sin nombre, con su mensaje", async () => {
    await expect(createVenue("club-a", { name: "" })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { name: NAME_MISSING },
    });
  });

  it("createTeamSchedule: varios campos mal, todos con su mensaje", async () => {
    const result = await createTeamSchedule("club-a", {
      teamId: "no-es-un-id",
      weekday: 8,
      time: "9:00",
      durationMinutes: 241,
      venueId: "Pista 1",
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        teamId: NOT_FOUND_COPY,
        weekday: "Elige un día de la semana.",
        time: "Escribe una hora válida.",
        durationMinutes: "La duración tiene que estar entre 15 y 240 minutos.",
        venueId: NOT_FOUND_COPY,
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("updateTeamSchedule: un día que no es un número marca el día", async () => {
    await expect(updateTeamSchedule("club-a", unsafe({ ...UPDATE_SCHEDULE, weekday: "martes" }))).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { weekday: "Elige un día de la semana." },
    });
  });

  it("un id que no es un uuid no llega a la base (daría un 22P02): INVALID en el id", async () => {
    await expect(deleteTeamSchedule("club-a", { id: "1; drop table team_schedules" })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { id: NOT_FOUND_COPY },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("errores de la base de datos", () => {
  it.each(ACTIONS)("%s: un fallo inesperado es SAVE_FAILED y se registra sin el contenido de la fila", async (_name, action) => {
    useDb(...failingWrite(action, dbError("XX000", 'fila con "texto del club"')));

    await expect(action.run()).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual([`[calendar.${action.tag}] PostgrestError code=XX000`]);
  });

  it.each(ACTIONS)("%s: un permiso denegado tras pasar `can` (42501) es NOT_FOUND y se registra", async (_name, action) => {
    useDb(...failingWrite(action, dbError("42501", "new row violates row-level security policy")));

    await expect(action.run()).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual([`[calendar.${action.tag}] PostgrestError code=42501`]);
  });

  it.each(ACTIONS)("%s: una entrada que la base rechaza (23514) es INVALID, sin registrar", async (_name, action) => {
    useDb(...failingWrite(action, dbError("23514", "violates check constraint")));

    await expect(action.run()).resolves.toEqual({ ok: false, error: "INVALID" });
    expect(logged).toEqual([]);
  });

  it.each(ACTIONS)("%s: si el cliente lanza una excepción, devuelve SAVE_FAILED sin romperse", async (_name, action) => {
    mocks.createClient.mockRejectedValue(new TypeError("fetch failed"));

    await expect(action.run()).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual([`[calendar.${action.tag}] TypeError`]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(BY_RPC)("%s: si la función dice que no existe (P0002) es NOT_FOUND, sin registrar", async (_name, action) => {
    useDb(...failingWrite(action, dbError("P0002", "NOT_FOUND")));

    await expect(action.run()).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  // Lo que la función rechaza sin campo: la temporada acabada, el tope de horarios o un valor
  // fuera de rango que el esquema no hubiera parado.
  it.each(BY_RPC)("%s: si la función rechaza la entrada (22023) es INVALID sin campo, sin registrar", async (_name, action) => {
    useDb(...failingWrite(action, dbError("22023", "INVALID")));

    await expect(action.run()).resolves.toEqual({ ok: false, error: "INVALID" });
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(BY_RPC)("%s: si la lectura previa falla, no llama a la función", async (_name, action) => {
    const db = useDb(dbError("XX000", "boom"));

    await expect(action.run()).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
    expect(logged).toEqual([`[calendar.${action.tag}] PostgrestError code=XX000`]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(BY_RPC)("%s: lo que no es de este club es NOT_FOUND sin llamar a la función", async (_name, action) => {
    const db = useDb(noRow);

    await expect(action.run()).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(db.queries).toHaveLength(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("lo que lanza notFound() lo recoge Next: no se convierte en SAVE_FAILED", async () => {
    const thrown = (() => {
      try {
        notFound();
      } catch (error) {
        return error;
      }
      throw new Error("notFound() tenía que lanzar");
    })();
    mocks.createClient.mockRejectedValue(thrown);

    await expect(deleteVenue("club-a", { id: ID })).rejects.toBe(thrown);

    expect(logged).toEqual([]);
  });

  it("ningún resultado lleva el mensaje de la base de datos", async () => {
    useDb(dbError("23505", "Key (name)=(Pista de ana@club-a.test) already exists"));

    const result = await createVenue("club-a", { name: "Pista 1" });

    expect(JSON.stringify(result)).not.toContain("club-a.test");
  });
});

// ── Pistas ──────────────────────────────────────────────────────────────────────────────

describe("createVenue", () => {
  it("inserta la pista en el club de la URL, con el nombre recortado, y devuelve su id", async () => {
    const db = useDb(reply({ id: NEW_ID }));

    const result = await createVenue("club-a", { name: "  Pista 1 " });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries).toHaveLength(1);
    expect([db.queries[0].table, db.queries[0].verb]).toEqual(["venues", "insert"]);
    expect(db.queries[0].sent("insert")).toEqual([{ organization_id: ORG, name: "Pista 1" }]);
    expect(db.queries[0].sent("select")).toEqual(["id"]);
    expect(db.queries[0].did("single")).toBe(true);
    expect(db.rpcs).toEqual([]);
  });

  it("el club sale del contexto, no de la entrada, aunque el cliente lo mande", async () => {
    const db = useDb(reply({ id: NEW_ID }));

    await createVenue("club-a", unsafe({ name: "Pista 1", organization_id: "org-b", id: ID }));

    expect(db.queries[0].sent("insert")).toEqual([{ organization_id: ORG, name: "Pista 1" }]);
  });

  it("un nombre repetido (23505) marca el nombre, sin registrar ni revalidar", async () => {
    useDb(dbError("23505", "duplicate key value violates unique constraint"));

    await expect(createVenue("club-a", { name: "Pista 1" })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { name: DUPLICATE_VENUE },
    });
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("renameVenue", () => {
  it("cambia el nombre de la pista de este club, y nada más", async () => {
    const db = useDb(oneRow);

    const result = await renameVenue("club-a", { id: ID, name: " Pista 2 " });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries).toHaveLength(1);
    expect([db.queries[0].table, db.queries[0].verb]).toEqual(["venues", "update"]);
    expect(db.queries[0].sent("update")).toEqual([{ name: "Pista 2" }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.rpcs).toEqual([]);
  });

  it("sin fila tocada (no existe, o es de otro club) es NOT_FOUND, sin revalidar", async () => {
    useDb(noRows);

    await expect(renameVenue("club-a", { id: ID, name: "Pista 2" })).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("un nombre repetido (23505) marca el nombre", async () => {
    useDb(dbError("23505", "duplicate key value violates unique constraint"));

    await expect(renameVenue("club-a", { id: ID, name: "Pista 2" })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { name: DUPLICATE_VENUE },
    });
    expect(logged).toEqual([]);
  });
});

describe("deleteVenue", () => {
  it("borra la pista de este club", async () => {
    const db = useDb(oneRow);

    const result = await deleteVenue("club-a", { id: ID });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries).toHaveLength(1);
    expect([db.queries[0].table, db.queries[0].verb]).toEqual(["venues", "delete"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.rpcs).toEqual([]);
  });

  it("si algún horario la lleva (23503) es IN_USE, sin registrar ni revalidar", async () => {
    useDb(dbError("23503", "violates foreign key constraint on team_schedules"));

    await expect(deleteVenue("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "IN_USE" });
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin fila borrada (no existe, o es de otro club) es NOT_FOUND, sin revalidar", async () => {
    useDb(noRows);

    await expect(deleteVenue("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un 23505 al borrar no señala ningún campo: no hay nombre que corregir", async () => {
    useDb(dbError("23505", "duplicate key value"));

    await expect(deleteVenue("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "INVALID" });
  });
});

// ── Horarios semanales ──────────────────────────────────────────────────────────────────

describe("createTeamSchedule", () => {
  it("lee antes el equipo acotado al club y solo entonces llama a `create_team_schedule`", async () => {
    const db = useDb(reply({ id: TEAM }), reply({ id: NEW_ID, created: 32 }));

    const result = await createTeamSchedule("club-a", CREATE_SCHEDULE);

    expect(result).toEqual({ ok: true, data: { id: NEW_ID, created: 32 } });
    expect(db.queries).toHaveLength(1);
    expect([db.queries[0].table, db.queries[0].verb]).toEqual(["teams", "select"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", TEAM],
    ]);
    expect(db.queries[0].did("maybeSingle")).toBe(true);
    expect(db.rpcs).toEqual([
      {
        name: "create_team_schedule",
        args: { p_team: TEAM, p_weekday: 2, p_start_time: "18:00", p_duration_minutes: 75, p_venue: VENUE },
      },
    ]);
  });

  it("sin pista, `p_venue` va ausente y no null (C15)", async () => {
    const db = useDb(reply({ id: TEAM }), reply({ id: NEW_ID, created: 32 }));

    await createTeamSchedule("club-a", { ...CREATE_SCHEDULE, venueId: null });

    expect(db.rpcs[0]?.args).toEqual({ p_team: TEAM, p_weekday: 2, p_start_time: "18:00", p_duration_minutes: 75 });
    expect(db.rpcs[0]?.args).not.toHaveProperty("p_venue");
  });

  it("devuelve el id del horario y cuántos entrenamientos ha creado, también si son cero", async () => {
    useDb(reply({ id: TEAM }), reply({ id: NEW_ID, created: 0 }));

    await expect(createTeamSchedule("club-a", CREATE_SCHEDULE)).resolves.toEqual({
      ok: true,
      data: { id: NEW_ID, created: 0 },
    });
  });

  it("de lo que devuelve la función solo pasa el id y el recuento", async () => {
    useDb(reply({ id: TEAM }), reply({ id: NEW_ID, created: 4, organization_id: ORG, events: ["e-1"] }));

    await expect(createTeamSchedule("club-a", CREATE_SCHEDULE)).resolves.toEqual({
      ok: true,
      data: { id: NEW_ID, created: 4 },
    });
  });

  it("un equipo que no es de este club es NOT_FOUND sin llamar a la función: no se crea nada", async () => {
    const db = useDb(noRow);

    await expect(createTeamSchedule("club-a", CREATE_SCHEDULE)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("el mismo día a la misma hora (23505) marca la hora, sin registrar ni revalidar", async () => {
    useDb(reply({ id: TEAM }), dbError("23505", "duplicate key value violates unique constraint"));

    await expect(createTeamSchedule("club-a", CREATE_SCHEDULE)).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { time: DUPLICATE_SLOT },
    });
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("una pista que no es del club (P0002 de la función) es NOT_FOUND", async () => {
    useDb(reply({ id: TEAM }), dbError("P0002", "NOT_FOUND"));

    await expect(createTeamSchedule("club-a", CREATE_SCHEDULE)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("updateTeamSchedule", () => {
  it("lee antes el horario acotado al club y solo entonces llama a `update_team_schedule`", async () => {
    const db = useDb(ownRow, reply(5));

    const result = await updateTeamSchedule("club-a", { ...UPDATE_SCHEDULE, weekday: 4, time: "19:30", durationMinutes: 60 });

    expect(result).toEqual({ ok: true, data: { moved: 5 } });
    expect(db.queries).toHaveLength(1);
    expect([db.queries[0].table, db.queries[0].verb]).toEqual(["team_schedules", "select"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.queries[0].did("maybeSingle")).toBe(true);
    expect(db.rpcs).toEqual([
      {
        name: "update_team_schedule",
        args: { p_schedule: ID, p_weekday: 4, p_start_time: "19:30", p_duration_minutes: 60, p_venue: VENUE },
      },
    ]);
  });

  it("sin pista, `p_venue` va ausente y no null (C15): la función la quita", async () => {
    const db = useDb(ownRow, reply(0));

    await updateTeamSchedule("club-a", { ...UPDATE_SCHEDULE, venueId: null });

    expect(db.rpcs[0]?.args).toEqual({ p_schedule: ID, p_weekday: 2, p_start_time: "18:00", p_duration_minutes: 75 });
    expect(db.rpcs[0]?.args).not.toHaveProperty("p_venue");
  });

  it("devuelve cuántos entrenamientos ha movido, también si son cero", async () => {
    useDb(ownRow, reply(0));

    await expect(updateTeamSchedule("club-a", UPDATE_SCHEDULE)).resolves.toEqual({ ok: true, data: { moved: 0 } });
  });

  it("un horario que no es de este club es NOT_FOUND sin llamar a la función", async () => {
    const db = useDb(noRow);

    await expect(updateTeamSchedule("club-a", UPDATE_SCHEDULE)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
  });

  it("el mismo día a la misma hora que otro (23505) marca la hora", async () => {
    useDb(ownRow, dbError("23505", "duplicate key value violates unique constraint"));

    await expect(updateTeamSchedule("club-a", UPDATE_SCHEDULE)).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { time: DUPLICATE_SLOT },
    });
    expect(logged).toEqual([]);
  });

  it("el equipo no viaja: un horario no cambia de equipo, aunque el cliente lo mande", async () => {
    const db = useDb(ownRow, reply(0));

    await updateTeamSchedule("club-a", unsafe({ ...UPDATE_SCHEDULE, teamId: TEAM }));

    expect(Object.keys(db.rpcs[0]?.args ?? {})).toEqual([
      "p_schedule",
      "p_weekday",
      "p_start_time",
      "p_duration_minutes",
      "p_venue",
    ]);
  });
});

describe("deleteTeamSchedule", () => {
  it("lee antes el horario acotado al club y solo entonces llama a `delete_team_schedule`", async () => {
    const db = useDb(ownRow, reply(3));

    const result = await deleteTeamSchedule("club-a", { id: ID });

    expect(result).toEqual({ ok: true, data: { removed: 3 } });
    expect(db.queries).toHaveLength(1);
    expect([db.queries[0].table, db.queries[0].verb]).toEqual(["team_schedules", "select"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.queries[0].did("maybeSingle")).toBe(true);
    expect(db.rpcs).toEqual([{ name: "delete_team_schedule", args: { p_schedule: ID } }]);
  });

  it("devuelve cuántos entrenamientos ha borrado, también si son cero", async () => {
    useDb(ownRow, reply(0));

    await expect(deleteTeamSchedule("club-a", { id: ID })).resolves.toEqual({ ok: true, data: { removed: 0 } });
  });

  it("un horario que no es de este club es NOT_FOUND sin llamar a la función: no se borra ningún entrenamiento", async () => {
    const db = useDb(noRow);

    await expect(deleteTeamSchedule("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("nunca borra por la tabla: ni horarios ni eventos", async () => {
    const db = useDb(ownRow, reply(3));

    await deleteTeamSchedule("club-a", { id: ID });

    expect(db.queries.map((query) => query.verb)).toEqual(["select"]);
  });
});
