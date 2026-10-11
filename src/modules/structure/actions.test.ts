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
  addNewPlayer,
  addPlayer,
  addStaff,
  createCategory,
  createPerson,
  createSeason,
  createTeam,
  deleteCategory,
  deleteSeason,
  deleteTeam,
  removePlayer,
  removeStaff,
  setCurrentSeason,
  setPersonArchived,
  setStaffRole,
  updateCategory,
  updatePerson,
  updatePlayer,
  updateSeason,
  updateTeam,
} from "./actions";

// Datos neutros y ficticios: los tests de `src/` no pueden nombrar a ningún club (pnpm
// check:guards). De las personas, solo el año de nacimiento.
const ORG = "org-a";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const NEW_ID = uuid(170);
const SEASON = uuid(1);
const OTHER_SEASON = uuid(2);
const CATEGORY = uuid(3);
const TEAM = uuid(4);
const PERSON = uuid(5);
/** El instante en que corren estos tests: el reloj está parado (ver `beforeEach`). */
const NOW = "2026-10-11T12:00:00.000Z";

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
  delete = (...args: unknown[]) => this.record("delete", args);
  eq = (...args: unknown[]) => this.record("eq", args);
  limit = (...args: unknown[]) => this.record("limit", args);
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
  // Solo el reloj: el año de nacimiento se compara con el año en curso, y archivar pone la hora.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
  mocks.requireClub.mockResolvedValue(contextWithRole("admin"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Las entradas ────────────────────────────────────────────────────────────────────────

const SEASON_INPUT = { name: "2027/28", startsOn: "2027-09-01", endsOn: "2028-06-30" };
const CATEGORY_INPUT = { name: "Categoría A", age: 12, sort: 10 };
const TEAM_INPUT = { name: "Equipo A", categoryId: CATEGORY };
const SEAT = { teamId: TEAM, personId: PERSON };
const PLAYER_INPUT = { ...SEAT, jerseyNumber: 7, position: "Base" };
const PERSON_INPUT = { firstName: "Ana", lastName: "García López", birthYear: 2014 };
const NEW_PLAYER_INPUT = { teamId: TEAM, ...PERSON_INPUT, jerseyNumber: 7, position: "Base" };

const NAME_MISSING = "Escribe un nombre.";
const NOT_FOUND_COPY = "No encontramos este contenido.";

// ── Lo que comparten las veinte acciones ────────────────────────────────────────────────

type Run = () => Promise<ActionResult<unknown>>;

type Case = {
  /** La etiqueta de la acción en el log: `structure.<tag>`. */
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
  createSeason: {
    tag: "create-season",
    run: () => createSeason("club-a", { ...SEASON_INPUT, copyTeamsFrom: null }),
    happy: () => [reply(NEW_ID)],
    invalid: () => createSeason("club-a", { ...SEASON_INPUT, name: " ", copyTeamsFrom: null }),
    field: "name",
  },
  updateSeason: {
    tag: "update-season",
    run: () => updateSeason("club-a", { id: ID, ...SEASON_INPUT }),
    happy: () => [oneRow],
    invalid: () => updateSeason("club-a", { id: ID, ...SEASON_INPUT, endsOn: SEASON_INPUT.startsOn }),
    field: "endsOn",
  },
  setCurrentSeason: {
    tag: "set-current-season",
    run: () => setCurrentSeason("club-a", { id: ID }),
    happy: () => [ownRow, reply(null)],
    invalid: () => setCurrentSeason("club-a", { id: "no-es-un-id" }),
    field: "id",
  },
  deleteSeason: {
    tag: "delete-season",
    run: () => deleteSeason("club-a", { id: ID }),
    happy: () => [reply({ id: ID, is_current: false }), oneRow],
    invalid: () => deleteSeason("club-a", { id: "" }),
    field: "id",
  },
  createCategory: {
    tag: "create-category",
    run: () => createCategory("club-a", CATEGORY_INPUT),
    happy: () => [reply({ id: NEW_ID })],
    invalid: () => createCategory("club-a", { ...CATEGORY_INPUT, age: Number.NaN }),
    field: "age",
  },
  updateCategory: {
    tag: "update-category",
    run: () => updateCategory("club-a", { id: ID, ...CATEGORY_INPUT }),
    happy: () => [oneRow],
    invalid: () => updateCategory("club-a", { id: ID, ...CATEGORY_INPUT, sort: -1 }),
    field: "sort",
  },
  deleteCategory: {
    tag: "delete-category",
    run: () => deleteCategory("club-a", { id: ID }),
    happy: () => [oneRow],
    invalid: () => deleteCategory("club-a", { id: "no-es-un-id" }),
    field: "id",
  },
  createTeam: {
    tag: "create-team",
    run: () => createTeam("club-a", { seasonId: SEASON, ...TEAM_INPUT }),
    happy: () => [reply({ id: NEW_ID })],
    invalid: () => createTeam("club-a", { seasonId: SEASON, ...TEAM_INPUT, categoryId: "" }),
    field: "categoryId",
  },
  updateTeam: {
    tag: "update-team",
    run: () => updateTeam("club-a", { id: ID, ...TEAM_INPUT }),
    happy: () => [oneRow],
    invalid: () => updateTeam("club-a", { id: ID, ...TEAM_INPUT, name: "a".repeat(61) }),
    field: "name",
  },
  deleteTeam: {
    tag: "delete-team",
    run: () => deleteTeam("club-a", { id: ID }),
    happy: () => [ownRow, reply(null)],
    invalid: () => deleteTeam("club-a", { id: "no-es-un-id" }),
    field: "id",
  },
  addStaff: {
    tag: "add-staff",
    run: () => addStaff("club-a", { ...SEAT, role: "head_coach" }),
    happy: () => [reply(null)],
    invalid: () => addStaff("club-a", { teamId: TEAM, personId: "", role: "head_coach" }),
    field: "personId",
  },
  setStaffRole: {
    tag: "set-staff-role",
    run: () => setStaffRole("club-a", { ...SEAT, role: "assistant" }),
    happy: () => [reply([{ person_id: PERSON }])],
    invalid: () => setStaffRole("club-a", unsafe({ ...SEAT, role: "director" })),
    field: "role",
  },
  removeStaff: {
    tag: "remove-staff",
    run: () => removeStaff("club-a", SEAT),
    happy: () => [reply([{ person_id: PERSON }])],
    invalid: () => removeStaff("club-a", { teamId: "no-es-un-id", personId: PERSON }),
    field: "teamId",
  },
  addPlayer: {
    tag: "add-player",
    run: () => addPlayer("club-a", PLAYER_INPUT),
    happy: () => [reply(null)],
    invalid: () => addPlayer("club-a", { ...PLAYER_INPUT, jerseyNumber: 100 }),
    field: "jerseyNumber",
  },
  addNewPlayer: {
    tag: "add-new-player",
    run: () => addNewPlayer("club-a", NEW_PLAYER_INPUT),
    happy: () => [ownRow, reply(NEW_ID)],
    invalid: () => addNewPlayer("club-a", { ...NEW_PLAYER_INPUT, lastName: "" }),
    field: "lastName",
  },
  updatePlayer: {
    tag: "update-player",
    run: () => updatePlayer("club-a", PLAYER_INPUT),
    happy: () => [reply([{ person_id: PERSON }])],
    invalid: () => updatePlayer("club-a", { ...PLAYER_INPUT, position: "a".repeat(31) }),
    field: "position",
  },
  removePlayer: {
    tag: "remove-player",
    run: () => removePlayer("club-a", SEAT),
    happy: () => [reply([{ person_id: PERSON }])],
    invalid: () => removePlayer("club-a", { teamId: TEAM, personId: "no-es-un-id" }),
    field: "personId",
  },
  createPerson: {
    tag: "create-person",
    run: () => createPerson("club-a", PERSON_INPUT),
    happy: () => [reply({ id: NEW_ID })],
    invalid: () => createPerson("club-a", { ...PERSON_INPUT, birthYear: 1899 }),
    field: "birthYear",
  },
  updatePerson: {
    tag: "update-person",
    run: () => updatePerson("club-a", { id: ID, ...PERSON_INPUT }),
    happy: () => [oneRow],
    invalid: () => updatePerson("club-a", { id: ID, ...PERSON_INPUT, firstName: "" }),
    field: "firstName",
  },
  setPersonArchived: {
    tag: "set-person-archived",
    run: () => setPersonArchived("club-a", { id: ID, archived: true }),
    happy: () => [reply([]), reply([]), oneRow],
    invalid: () => setPersonArchived("club-a", unsafe({ id: ID, archived: "sí" })),
    field: "archived",
  },
};

const ACTIONS = Object.entries(CASES);

/** Las respuestas de cuando todo va bien, con la de la escritura cambiada por un error. */
function failingWrite(action: Case, error: Reply): Reply[] {
  return [...action.happy().slice(0, -1), error];
}

it("son las veinte acciones de la estructura", () => {
  expect(ACTIONS).toHaveLength(20);
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

    await createPerson("club-b", PERSON_INPUT);

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
    // Una función SQL recibe el club (`p_org`), o antes se ha leído su fila acotada al club.
    for (const rpc of db.rpcs) {
      const scopedByArgument = rpc.args.p_org === "org-b";
      const scopedByRead = db.queries.some((query) => query.verb === "select");
      expect(scopedByArgument || scopedByRead).toBe(true);
    }
    expect(db.queries.length + db.rpcs.length).toBeGreaterThan(0);
  });

  it.each(ACTIONS)("%s: ningún insert ni update cambia una fila de club", async (_name, action) => {
    const db = useDb(...action.happy());

    await action.run();

    for (const query of db.writes) {
      if (query.verb !== "update") continue;
      expect(query.sent("update")[0]).not.toHaveProperty("organization_id");
    }
  });
});

describe("tras escribir", () => {
  it.each(ACTIONS)(
    "%s: revalida Gestión y la app por patrón de ruta y layout, no por la URL del club",
    async (_name, action) => {
      useDb(...action.happy());

      const result = await action.run();

      expect(result.ok).toBe(true);
      // Patrones de ruta (carpetas, con el grupo `(app)`) y `layout`: con la URL concreta y
      // `layout` Next arma una etiqueta que ninguna ruta lleva (ver `@/lib/mutate`).
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

  it("createSeason: el fin igual o anterior al inicio marca el fin", async () => {
    for (const endsOn of ["2027-09-01", "2027-08-31"]) {
      await expect(createSeason("club-a", { ...SEASON_INPUT, endsOn, copyTeamsFrom: null })).resolves.toEqual({
        ok: false,
        error: "INVALID",
        fieldErrors: { endsOn: "El fin tiene que ser posterior al inicio." },
      });
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("createSeason: una fecha que no existe marca su campo", async () => {
    const result = await createSeason("club-a", { ...SEASON_INPUT, startsOn: "2027-02-30", copyTeamsFrom: null });

    expect(result).toEqual({ ok: false, error: "INVALID", fieldErrors: { startsOn: "Elige una fecha." } });
  });

  it("createSeason: copiar de algo que no es un id es INVALID, sin llegar a la función", async () => {
    const result = await createSeason("club-a", { ...SEASON_INPUT, copyTeamsFrom: "otra" });

    expect(result).toEqual({ ok: false, error: "INVALID", fieldErrors: { copyTeamsFrom: NOT_FOUND_COPY } });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("createCategory: varios campos mal, todos con su mensaje", async () => {
    const result = await createCategory("club-a", { name: "", age: 0, sort: 10_000 });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        name: NAME_MISSING,
        age: "La edad tiene que estar entre 1 y 99.",
        sort: "El orden tiene que estar entre 0 y 9999.",
      },
    });
  });

  it("addNewPlayer: varios campos mal, todos con su mensaje", async () => {
    const result = await addNewPlayer("club-a", {
      teamId: TEAM,
      firstName: " ",
      lastName: "",
      birthYear: 2027,
      jerseyNumber: -1,
      position: "a".repeat(31),
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        firstName: NAME_MISSING,
        lastName: "Escribe los apellidos.",
        birthYear: "Escribe un año de nacimiento válido.",
        jerseyNumber: "El dorsal tiene que estar entre 0 y 99.",
        position: "Máximo 30 caracteres.",
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un id que no es un uuid no llega a la base (daría un 22P02): INVALID en el id", async () => {
    await expect(deleteTeam("club-a", { id: "1; drop table teams" })).resolves.toEqual({
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
    expect(logged).toEqual([`[structure.${action.tag}] PostgrestError code=XX000`]);
  });

  it.each(ACTIONS)("%s: un permiso denegado tras pasar `can` (42501) es NOT_FOUND y se registra", async (_name, action) => {
    useDb(...failingWrite(action, dbError("42501", "new row violates row-level security policy")));

    await expect(action.run()).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual([`[structure.${action.tag}] PostgrestError code=42501`]);
  });

  it.each(ACTIONS)("%s: una entrada que la base rechaza (23514) es INVALID, sin registrar", async (_name, action) => {
    useDb(...failingWrite(action, dbError("23514", "violates check constraint")));

    await expect(action.run()).resolves.toEqual({ ok: false, error: "INVALID" });
    expect(logged).toEqual([]);
  });

  it.each(ACTIONS)("%s: si el cliente lanza una excepción, devuelve SAVE_FAILED sin romperse", async (_name, action) => {
    mocks.createClient.mockRejectedValue(new TypeError("fetch failed"));

    await expect(action.run()).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual([`[structure.${action.tag}] TypeError`]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
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

    await expect(deleteCategory("club-a", { id: ID })).rejects.toBe(thrown);

    expect(logged).toEqual([]);
  });

  it("ningún resultado lleva el mensaje de la base de datos", async () => {
    useDb(dbError("23505", "Key (name)=(Equipo de ana@club-a.test) already exists"));

    const result = await createTeam("club-a", { seasonId: SEASON, ...TEAM_INPUT });

    expect(JSON.stringify(result)).not.toContain("club-a.test");
  });
});

// ── Temporadas ──────────────────────────────────────────────────────────────────────────

describe("createSeason", () => {
  it("llama a `create_season` con el club de la URL, el nombre recortado y las fechas", async () => {
    const db = useDb(reply(NEW_ID));

    const result = await createSeason("club-a", { ...SEASON_INPUT, name: "  2027/28 ", copyTeamsFrom: null });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.rpcs).toEqual([
      {
        name: "create_season",
        args: { p_org: ORG, p_name: "2027/28", p_starts_on: "2027-09-01", p_ends_on: "2028-06-30" },
      },
    ]);
    expect(db.queries).toEqual([]);
  });

  it("sin copiar equipos, `p_copy_teams_from` va ausente y no null", async () => {
    const db = useDb(reply(NEW_ID));

    await createSeason("club-a", { ...SEASON_INPUT, copyTeamsFrom: null });

    expect(db.rpcs[0].args).not.toHaveProperty("p_copy_teams_from");
  });

  it("copiando equipos, manda de qué temporada", async () => {
    const db = useDb(reply(NEW_ID));

    await createSeason("club-a", { ...SEASON_INPUT, copyTeamsFrom: OTHER_SEASON });

    expect(db.rpcs[0].args).toEqual({
      p_org: ORG,
      p_name: "2027/28",
      p_starts_on: "2027-09-01",
      p_ends_on: "2028-06-30",
      p_copy_teams_from: OTHER_SEASON,
    });
  });

  it("no decide si nace actual: eso lo hace la función", async () => {
    const db = useDb(reply(NEW_ID));

    await createSeason("club-a", { ...SEASON_INPUT, copyTeamsFrom: null });

    expect(Object.keys(db.rpcs[0].args).some((key) => key.includes("current"))).toBe(false);
  });

  it("un nombre repetido (23505) marca el nombre", async () => {
    useDb(dbError("23505", "duplicate key value violates unique constraint \"seasons_name_key\""));

    await expect(createSeason("club-a", { ...SEASON_INPUT, copyTeamsFrom: null })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { name: "Ya hay una temporada con ese nombre." },
    });
    expect(logged).toEqual([]);
  });

  it("copiar de una temporada que no es del club (P0002) es NOT_FOUND", async () => {
    useDb(dbError("P0002", "NOT_FOUND"));

    await expect(createSeason("club-a", { ...SEASON_INPUT, copyTeamsFrom: OTHER_SEASON })).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateSeason", () => {
  it("cambia nombre y fechas de la temporada de este club, y nada más", async () => {
    const db = useDb(oneRow);

    const result = await updateSeason("club-a", { id: ID, ...SEASON_INPUT, name: " 2027/28 " });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("seasons");
    expect(db.queries[0].sent("update")).toEqual([
      { name: "2027/28", starts_on: "2027-09-01", ends_on: "2028-06-30" },
    ]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.rpcs).toEqual([]);
  });

  it("sin fila tocada (no existe, o es de otro club) es NOT_FOUND, sin revalidar", async () => {
    useDb(noRows);

    await expect(updateSeason("club-a", { id: ID, ...SEASON_INPUT })).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un nombre repetido (23505) marca el nombre", async () => {
    useDb(dbError("23505", "duplicate key"));

    await expect(updateSeason("club-a", { id: ID, ...SEASON_INPUT })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { name: "Ya hay una temporada con ese nombre." },
    });
  });
});

describe("setCurrentSeason", () => {
  it("lee antes la temporada acotada al club y solo entonces llama a `set_current_season`", async () => {
    const db = useDb(ownRow, reply(null));

    const result = await setCurrentSeason("club-a", { id: ID });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("seasons");
    expect(db.queries[0].verb).toBe("select");
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.queries[0].did("maybeSingle")).toBe(true);
    expect(db.rpcs).toEqual([{ name: "set_current_season", args: { p_season: ID } }]);
  });

  it("una temporada que no es de este club es NOT_FOUND sin llamar a la función", async () => {
    const db = useDb(noRow);

    await expect(setCurrentSeason("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("si la lectura falla, no llama a la función", async () => {
    const db = useDb(dbError("XX000", "boom"));

    await expect(setCurrentSeason("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
    expect(logged).toEqual(["[structure.set-current-season] PostgrestError code=XX000"]);
  });

  it("si la función dice que no existe (P0002) es NOT_FOUND", async () => {
    useDb(ownRow, dbError("P0002", "NOT_FOUND"));

    await expect(setCurrentSeason("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual([]);
  });
});

describe("deleteSeason", () => {
  it("borra la temporada de este club que no es la actual", async () => {
    const db = useDb(reply({ id: ID, is_current: false }), oneRow);

    const result = await deleteSeason("club-a", { id: ID });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries.map((query) => [query.table, query.verb])).toEqual([
      ["seasons", "select"],
      ["seasons", "delete"],
    ]);
    for (const query of db.queries) {
      expect(query.filters).toEqual([
        ["organization_id", ORG],
        ["id", ID],
      ]);
    }
    expect(db.rpcs).toEqual([]);
  });

  it("la actual no se borra: IN_USE sin llegar al delete", async () => {
    const db = useDb(reply({ id: ID, is_current: true }));

    await expect(deleteSeason("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "IN_USE" });
    expect(db.queries).toHaveLength(1);
    expect(db.writes).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("una que no es de este club es NOT_FOUND sin llegar al delete", async () => {
    const db = useDb(noRow);

    await expect(deleteSeason("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.writes).toEqual([]);
  });

  it("con equipos (23503) es IN_USE, sin registrar", async () => {
    useDb(reply({ id: ID, is_current: false }), dbError("23503", "violates foreign key constraint on teams"));

    await expect(deleteSeason("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "IN_USE" });
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin fila borrada (alguien la marcó como actual o la borró entre medias) es IN_USE", async () => {
    useDb(reply({ id: ID, is_current: false }), noRows);

    await expect(deleteSeason("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "IN_USE" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si la lectura falla, no borra", async () => {
    const db = useDb(dbError("XX000", "boom"));

    await expect(deleteSeason("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.writes).toEqual([]);
  });
});

// ── Categorías ──────────────────────────────────────────────────────────────────────────

describe("createCategory", () => {
  it("inserta la categoría en el club de la URL, con la edad como `U12`", async () => {
    const db = useDb(reply({ id: NEW_ID }));

    const result = await createCategory("club-a", { name: " Categoría A ", age: 12, sort: 10 });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("categories");
    expect(db.queries[0].sent("insert")).toEqual([
      { organization_id: ORG, name: "Categoría A", age_band: "U12", sort: 10 },
    ]);
  });

  it("una edad de una cifra se guarda sin cero delante", async () => {
    const db = useDb(reply({ id: NEW_ID }));

    await createCategory("club-a", { ...CATEGORY_INPUT, age: 8 });

    expect(db.queries[0].sent("insert")[0]).toMatchObject({ age_band: "U8" });
  });

  it("un nombre repetido (23505) marca el nombre", async () => {
    useDb(dbError("23505", "duplicate key"));

    await expect(createCategory("club-a", CATEGORY_INPUT)).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { name: "Ya hay una categoría con ese nombre." },
    });
    expect(logged).toEqual([]);
  });
});

describe("updateCategory", () => {
  it("cambia nombre, edad y orden de la categoría de este club", async () => {
    const db = useDb(oneRow);

    const result = await updateCategory("club-a", { id: ID, name: "Categoría B", age: 14, sort: 20 });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries[0].table).toBe("categories");
    expect(db.queries[0].sent("update")).toEqual([{ name: "Categoría B", age_band: "U14", sort: 20 }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
  });

  it("sin fila tocada es NOT_FOUND", async () => {
    useDb(noRows);

    await expect(updateCategory("club-a", { id: ID, ...CATEGORY_INPUT })).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("un nombre repetido (23505) marca el nombre", async () => {
    useDb(dbError("23505", "duplicate key"));

    await expect(updateCategory("club-a", { id: ID, ...CATEGORY_INPUT })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { name: "Ya hay una categoría con ese nombre." },
    });
  });
});

describe("deleteCategory", () => {
  it("borra la categoría de este club", async () => {
    const db = useDb(oneRow);

    const result = await deleteCategory("club-a", { id: ID });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries).toHaveLength(1);
    expect([db.queries[0].table, db.queries[0].verb]).toEqual(["categories", "delete"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
  });

  it("si algún equipo la lleva (23503) es IN_USE, sin registrar", async () => {
    useDb(dbError("23503", "violates foreign key constraint on teams"));

    await expect(deleteCategory("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "IN_USE" });
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("sin fila borrada (no existe, o es de otro club) es NOT_FOUND", async () => {
    useDb(noRows);

    await expect(deleteCategory("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

// ── Equipos ─────────────────────────────────────────────────────────────────────────────

describe("createTeam", () => {
  it("inserta el equipo en el club de la URL, con su temporada y su categoría", async () => {
    const db = useDb(reply({ id: NEW_ID }));

    const result = await createTeam("club-a", { seasonId: SEASON, name: " Equipo A ", categoryId: CATEGORY });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries[0].table).toBe("teams");
    expect(db.queries[0].sent("insert")).toEqual([
      { organization_id: ORG, season_id: SEASON, category_id: CATEGORY, name: "Equipo A" },
    ]);
  });

  it("una temporada o una categoría de otro club (23503) es NOT_FOUND, sin registrar", async () => {
    useDb(dbError("23503", "violates foreign key constraint"));

    await expect(createTeam("club-a", { seasonId: SEASON, ...TEAM_INPUT })).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un nombre repetido en la temporada (23505) marca el nombre", async () => {
    useDb(dbError("23505", "duplicate key"));

    await expect(createTeam("club-a", { seasonId: SEASON, ...TEAM_INPUT })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { name: "Ya hay un equipo con ese nombre en esta temporada." },
    });
  });
});

describe("updateTeam", () => {
  it("cambia nombre y categoría del equipo de este club; la temporada no se toca", async () => {
    const db = useDb(oneRow);

    const result = await updateTeam("club-a", unsafe({ id: ID, ...TEAM_INPUT, seasonId: OTHER_SEASON }));

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries[0].table).toBe("teams");
    expect(db.queries[0].sent("update")).toEqual([{ name: "Equipo A", category_id: CATEGORY }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
  });

  it("una categoría de otro club (23503) es NOT_FOUND", async () => {
    useDb(dbError("23503", "violates foreign key constraint"));

    await expect(updateTeam("club-a", { id: ID, ...TEAM_INPUT })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual([]);
  });

  it("un nombre repetido (23505) marca el nombre", async () => {
    useDb(dbError("23505", "duplicate key"));

    await expect(updateTeam("club-a", { id: ID, ...TEAM_INPUT })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { name: "Ya hay un equipo con ese nombre en esta temporada." },
    });
  });

  it("sin fila tocada es NOT_FOUND", async () => {
    useDb(noRows);

    await expect(updateTeam("club-a", { id: ID, ...TEAM_INPUT })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("deleteTeam", () => {
  it("lee antes el equipo acotado al club y solo entonces llama a `delete_team`", async () => {
    const db = useDb(ownRow, reply(null));

    const result = await deleteTeam("club-a", { id: ID });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries).toHaveLength(1);
    expect([db.queries[0].table, db.queries[0].verb]).toEqual(["teams", "select"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
    expect(db.rpcs).toEqual([{ name: "delete_team", args: { p_team: ID } }]);
  });

  it("un equipo que no es de este club es NOT_FOUND sin llamar a la función", async () => {
    const db = useDb(noRow);

    await expect(deleteTeam("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si la lectura falla, no llama a la función", async () => {
    const db = useDb(dbError("XX000", "boom"));

    await expect(deleteTeam("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
  });

  it("con actividad (P0001 IN_USE) es IN_USE, sin registrar", async () => {
    useDb(ownRow, dbError("P0001", "IN_USE"));

    await expect(deleteTeam("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "IN_USE" });
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si la función dice que no existe (P0002) es NOT_FOUND", async () => {
    useDb(ownRow, dbError("P0002", "NOT_FOUND"));

    await expect(deleteTeam("club-a", { id: ID })).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

// ── Cuerpo técnico ──────────────────────────────────────────────────────────────────────

describe("addStaff", () => {
  it.each(["head_coach", "assistant"] as const)("inserta a la persona en el cuerpo técnico como %s", async (role) => {
    const db = useDb(reply(null));

    const result = await addStaff("club-a", { ...SEAT, role });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("team_staff");
    expect(db.queries[0].sent("insert")).toEqual([
      { organization_id: ORG, team_id: TEAM, person_id: PERSON, staff_role: role },
    ]);
  });

  it("un equipo o una persona de otro club (23503) es NOT_FOUND, sin registrar", async () => {
    useDb(dbError("23503", "violates foreign key constraint"));

    await expect(addStaff("club-a", { ...SEAT, role: "assistant" })).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(logged).toEqual([]);
  });

  it("quien ya está (23505) marca la persona", async () => {
    useDb(dbError("23505", "duplicate key value violates unique constraint \"team_staff_pkey\""));

    await expect(addStaff("club-a", { ...SEAT, role: "assistant" })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { personId: "Ya está en el cuerpo técnico." },
    });
    expect(logged).toEqual([]);
  });
});

describe("setStaffRole", () => {
  it("cambia el papel de esa persona en ese equipo de este club", async () => {
    const db = useDb(reply([{ person_id: PERSON }]));

    const result = await setStaffRole("club-a", { ...SEAT, role: "assistant" });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries[0].table).toBe("team_staff");
    expect(db.queries[0].sent("update")).toEqual([{ staff_role: "assistant" }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["team_id", TEAM],
      ["person_id", PERSON],
    ]);
  });

  it("sin fila tocada (no está en ese cuerpo técnico) es NOT_FOUND", async () => {
    useDb(noRows);

    await expect(setStaffRole("club-a", { ...SEAT, role: "assistant" })).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("removeStaff", () => {
  it("quita a esa persona del cuerpo técnico de ese equipo de este club", async () => {
    const db = useDb(reply([{ person_id: PERSON }]));

    const result = await removeStaff("club-a", SEAT);

    expect(result).toEqual({ ok: true, data: null });
    expect([db.queries[0].table, db.queries[0].verb]).toEqual(["team_staff", "delete"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["team_id", TEAM],
      ["person_id", PERSON],
    ]);
  });

  it("solo toca el cuerpo técnico: la persona sigue en el club", async () => {
    const db = useDb(reply([{ person_id: PERSON }]));

    await removeStaff("club-a", SEAT);

    expect(db.queries.map((query) => query.table)).toEqual(["team_staff"]);
    expect(db.rpcs).toEqual([]);
  });

  it("sin fila borrada es NOT_FOUND", async () => {
    useDb(noRows);

    await expect(removeStaff("club-a", SEAT)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

// ── Plantilla ───────────────────────────────────────────────────────────────────────────

describe("addPlayer", () => {
  it("inserta a la persona en la plantilla con su dorsal y su posición", async () => {
    const db = useDb(reply(null));

    const result = await addPlayer("club-a", { ...SEAT, jerseyNumber: 7, position: " Base " });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("team_players");
    expect(db.queries[0].sent("insert")).toEqual([
      { organization_id: ORG, team_id: TEAM, person_id: PERSON, jersey_number: 7, position: "Base" },
    ]);
  });

  it("sin dorsal y con la posición en blanco, los dos van como null", async () => {
    const db = useDb(reply(null));

    await addPlayer("club-a", { ...SEAT, jerseyNumber: null, position: "   " });

    expect(db.queries[0].sent("insert")[0]).toMatchObject({ jersey_number: null, position: null });
  });

  it("el dorsal 0 viaja como 0", async () => {
    const db = useDb(reply(null));

    await addPlayer("club-a", { ...SEAT, jerseyNumber: 0, position: null });

    expect(db.queries[0].sent("insert")[0]).toMatchObject({ jersey_number: 0 });
  });

  it("un equipo o una persona de otro club (23503) es NOT_FOUND, sin registrar", async () => {
    useDb(dbError("23503", "violates foreign key constraint"));

    await expect(addPlayer("club-a", PLAYER_INPUT)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual([]);
  });

  it("un 23505 cuyo mensaje nombra `jersey_number` marca el dorsal", async () => {
    useDb(
      dbError("23505", 'duplicate key value violates unique constraint "team_players_team_id_jersey_number_key"'),
    );

    await expect(addPlayer("club-a", PLAYER_INPUT)).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { jerseyNumber: "Ese dorsal ya lo lleva otra persona del equipo." },
    });
    expect(logged).toEqual([]);
  });

  it("cualquier otro 23505 es que la persona ya estaba: marca la persona", async () => {
    useDb(dbError("23505", 'duplicate key value violates unique constraint "team_players_pkey"'));

    await expect(addPlayer("club-a", PLAYER_INPUT)).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { personId: "Ya está en la plantilla." },
    });
  });

  it("un 23505 sin mensaje marca la persona", async () => {
    useDb({ data: null, error: { code: "23505" } });

    await expect(addPlayer("club-a", PLAYER_INPUT)).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { personId: "Ya está en la plantilla." },
    });
  });
});

describe("addNewPlayer", () => {
  it("lee antes el equipo acotado al club y solo entonces llama a `add_new_player`", async () => {
    const db = useDb(ownRow, reply(NEW_ID));

    const result = await addNewPlayer("club-a", { ...NEW_PLAYER_INPUT, firstName: " Ana ", position: " Base " });

    expect(result).toEqual({ ok: true, data: { personId: NEW_ID } });
    expect(db.queries).toHaveLength(1);
    expect([db.queries[0].table, db.queries[0].verb]).toEqual(["teams", "select"]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", TEAM],
    ]);
    expect(db.rpcs).toEqual([
      {
        name: "add_new_player",
        args: {
          p_team: TEAM,
          p_first_name: "Ana",
          p_last_name: "García López",
          p_birth_year: 2014,
          p_jersey_number: 7,
          p_position: "Base",
        },
      },
    ]);
  });

  it("sin año, sin dorsal y sin posición, esos argumentos van ausentes y no null", async () => {
    const db = useDb(ownRow, reply(NEW_ID));

    await addNewPlayer("club-a", {
      teamId: TEAM,
      firstName: "Ana",
      lastName: "García López",
      birthYear: null,
      jerseyNumber: null,
      position: null,
    });

    expect(db.rpcs[0].args).toEqual({ p_team: TEAM, p_first_name: "Ana", p_last_name: "García López" });
    expect(db.rpcs[0].args).not.toHaveProperty("p_birth_year");
    expect(db.rpcs[0].args).not.toHaveProperty("p_jersey_number");
    expect(db.rpcs[0].args).not.toHaveProperty("p_position");
  });

  it("la posición en blanco también va ausente", async () => {
    const db = useDb(ownRow, reply(NEW_ID));

    await addNewPlayer("club-a", { ...NEW_PLAYER_INPUT, position: "   " });

    expect(db.rpcs[0].args).not.toHaveProperty("p_position");
  });

  it("el dorsal 0 no es «sin dorsal»: viaja como 0", async () => {
    const db = useDb(ownRow, reply(NEW_ID));

    await addNewPlayer("club-a", { ...NEW_PLAYER_INPUT, jerseyNumber: 0 });

    expect(db.rpcs[0].args.p_jersey_number).toBe(0);
  });

  it("de la persona solo viaja el año de nacimiento, nunca una fecha", async () => {
    const db = useDb(ownRow, reply(NEW_ID));

    await addNewPlayer("club-a", unsafe({ ...NEW_PLAYER_INPUT, birthDate: "2014-05-06" }));

    expect(JSON.stringify(db.rpcs[0].args)).not.toContain("2014-05-06");
    expect(db.rpcs[0].args.p_birth_year).toBe(2014);
  });

  it("un equipo que no es de este club es NOT_FOUND sin llamar a la función: no se da de alta a nadie", async () => {
    const db = useDb(noRow);

    await expect(addNewPlayer("club-a", NEW_PLAYER_INPUT)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.rpcs).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si la lectura falla, no llama a la función", async () => {
    const db = useDb(dbError("XX000", "boom"));

    await expect(addNewPlayer("club-a", NEW_PLAYER_INPUT)).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.rpcs).toEqual([]);
  });

  it("un dorsal repetido (23505) marca el dorsal", async () => {
    useDb(ownRow, dbError("23505", "duplicate key"));

    await expect(addNewPlayer("club-a", NEW_PLAYER_INPUT)).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { jerseyNumber: "Ese dorsal ya lo lleva otra persona del equipo." },
    });
    expect(logged).toEqual([]);
  });
});

describe("updatePlayer", () => {
  it("cambia el dorsal y la posición de esa persona en ese equipo de este club", async () => {
    const db = useDb(reply([{ person_id: PERSON }]));

    const result = await updatePlayer("club-a", { ...SEAT, jerseyNumber: 9, position: " Alero " });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries[0].table).toBe("team_players");
    expect(db.queries[0].sent("update")).toEqual([{ jersey_number: 9, position: "Alero" }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["team_id", TEAM],
      ["person_id", PERSON],
    ]);
  });

  it("quitar el dorsal y la posición los guarda como null", async () => {
    const db = useDb(reply([{ person_id: PERSON }]));

    await updatePlayer("club-a", { ...SEAT, jerseyNumber: null, position: "" });

    expect(db.queries[0].sent("update")).toEqual([{ jersey_number: null, position: null }]);
  });

  it("un dorsal repetido (23505) marca el dorsal", async () => {
    useDb(dbError("23505", "duplicate key"));

    await expect(updatePlayer("club-a", PLAYER_INPUT)).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { jerseyNumber: "Ese dorsal ya lo lleva otra persona del equipo." },
    });
  });

  it("sin fila tocada (no está en esa plantilla) es NOT_FOUND", async () => {
    useDb(noRows);

    await expect(updatePlayer("club-a", PLAYER_INPUT)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("removePlayer", () => {
  it("quita a esa persona de la plantilla de ese equipo de este club, y nada más", async () => {
    const db = useDb(reply([{ person_id: PERSON }]));

    const result = await removePlayer("club-a", SEAT);

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries.map((query) => [query.table, query.verb])).toEqual([["team_players", "delete"]]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["team_id", TEAM],
      ["person_id", PERSON],
    ]);
    expect(db.rpcs).toEqual([]);
  });

  it("sin fila borrada es NOT_FOUND", async () => {
    useDb(noRows);

    await expect(removePlayer("club-a", SEAT)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

// ── Personas ────────────────────────────────────────────────────────────────────────────

describe("createPerson", () => {
  it("inserta a la persona en el club de la URL, con solo su año de nacimiento", async () => {
    const db = useDb(reply({ id: NEW_ID }));

    const result = await createPerson("club-a", { firstName: " Ana ", lastName: " García López ", birthYear: 2014 });

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("people");
    expect(db.queries[0].sent("insert")).toEqual([
      { organization_id: ORG, first_name: "Ana", last_name: "García López", birth_year: 2014 },
    ]);
  });

  it("sin año de nacimiento, null", async () => {
    const db = useDb(reply({ id: NEW_ID }));

    await createPerson("club-a", { ...PERSON_INPUT, birthYear: null });

    expect(db.queries[0].sent("insert")[0]).toMatchObject({ birth_year: null });
  });

  it("una fecha de nacimiento completa no viaja a la base, aunque el cliente la mande", async () => {
    const db = useDb(reply({ id: NEW_ID }));

    await createPerson("club-a", unsafe({ ...PERSON_INPUT, birthDate: "2014-05-06" }));

    expect(JSON.stringify(db.queries[0].sent("insert"))).not.toContain("2014-05-06");
  });

  it("dos personas pueden llamarse igual: un 23505 no señala ningún campo", async () => {
    useDb(dbError("23505", "duplicate key"));

    await expect(createPerson("club-a", PERSON_INPUT)).resolves.toEqual({ ok: false, error: "INVALID" });
  });
});

describe("updatePerson", () => {
  it("cambia nombre, apellidos y año de la persona de este club", async () => {
    const db = useDb(oneRow);

    const result = await updatePerson("club-a", { id: ID, firstName: "Bea", lastName: "Ruiz", birthYear: null });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries[0].table).toBe("people");
    expect(db.queries[0].sent("update")).toEqual([{ first_name: "Bea", last_name: "Ruiz", birth_year: null }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
  });

  it("no archiva ni recupera: `archived_at` no se toca", async () => {
    const db = useDb(oneRow);

    await updatePerson("club-a", unsafe({ id: ID, ...PERSON_INPUT, archived: true, archivedAt: NOW }));

    expect(db.queries[0].sent("update")[0]).not.toHaveProperty("archived_at");
  });

  it("sin fila tocada (no existe, o es de otro club) es NOT_FOUND", async () => {
    useDb(noRows);

    await expect(updatePerson("club-a", { id: ID, ...PERSON_INPUT })).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });
});

describe("setPersonArchived", () => {
  /** Los sitios de la persona en este club, en la plantilla o en el cuerpo técnico. */
  const SEATS_OF_PERSON = [
    ["organization_id", ORG],
    ["person_id", ID],
  ];
  const STILL_IN_TEAM =
    "Sigue en un equipo de la temporada actual o de una que no ha acabado. Quítala antes de ese equipo.";
  /** Un sitio en un equipo de una temporada así. */
  const seat = (season: { is_current: boolean; ends_on: string }) => ({ team_id: TEAM, teams: { seasons: season } });
  const CURRENT = { is_current: true, ends_on: "2000-06-30" };
  const NOT_ENDED = { is_current: false, ends_on: "2999-06-30" };
  const ENDED = { is_current: false, ends_on: "2000-06-30" };

  it("archivar mira antes los equipos de la persona, como jugadora y en el cuerpo técnico, con su temporada", async () => {
    const db = useDb(reply([]), reply([]), oneRow);

    const result = await setPersonArchived("club-a", { id: ID, archived: true });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries.map((query) => [query.table, query.verb])).toEqual([
      ["team_players", "select"],
      ["team_staff", "select"],
      ["people", "update"],
    ]);
    for (const read of db.queries.slice(0, 2)) {
      expect(read.filters).toEqual(SEATS_OF_PERSON);
      // De cada equipo, lo que decide: si su temporada es la actual y cuándo acaba.
      expect(read.sent("select")[0]).toContain("teams(seasons(is_current, ends_on))");
    }
  });

  it("a quien solo está en equipos de temporadas pasadas que ya acabaron sí se la archiva", async () => {
    const db = useDb(reply([seat(ENDED)]), reply([seat(ENDED)]), oneRow);

    await expect(setPersonArchived("club-a", { id: ID, archived: true })).resolves.toEqual({ ok: true, data: null });
    expect(db.writes).toHaveLength(1);
  });

  it.each([
    ["la temporada actual, aunque su fecha de fin ya haya pasado", CURRENT],
    ["una temporada que no es la actual pero aún no ha acabado", NOT_ENDED],
  ])("a quien sigue en un equipo de %s no se la archiva", async (_case, season) => {
    const db = useDb(reply([]), reply([seat(season)]));

    await expect(setPersonArchived("club-a", { id: ID, archived: true })).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { archived: STILL_IN_TEAM },
    });
    expect(db.writes).toEqual([]);
  });

  it("lee igual la temporada cuando la relación llega como lista de un elemento", async () => {
    const db = useDb(reply([{ team_id: TEAM, teams: [{ seasons: [NOT_ENDED] }] }]), reply([]));

    const result = await setPersonArchived("club-a", { id: ID, archived: true });

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(db.writes).toEqual([]);
  });

  it("la base tiene la última palabra: si rechaza el archivado (23514), es INVALID y no se revalida", async () => {
    // Entre la lectura y la escritura alguien la añadió a un equipo: lo para `people_guard_archive`.
    useDb(reply([]), reply([]), dbError("23514", "STILL_IN_TEAM"));

    await expect(setPersonArchived("club-a", { id: ID, archived: true })).resolves.toEqual({
      ok: false,
      error: "INVALID",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("archivar pone la hora en la persona de este club", async () => {
    const db = useDb(reply([]), reply([]), oneRow);

    await setPersonArchived("club-a", { id: ID, archived: true });

    const update = db.queries[2];
    expect(update.sent("update")).toEqual([{ archived_at: NOW }]);
    expect(update.filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
  });

  it("a quien sigue en la plantilla de un equipo de la temporada actual no se la archiva: el error va en `archived`", async () => {
    const db = useDb(reply([seat(CURRENT)]), reply([]));

    const result = await setPersonArchived("club-a", { id: ID, archived: true });

    expect(result).toEqual({ ok: false, error: "INVALID", fieldErrors: { archived: STILL_IN_TEAM } });
    expect(db.writes).toEqual([]);
    expect(db.queries.map((query) => query.table)).toEqual(["team_players", "team_staff"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("a quien sigue en el cuerpo técnico de un equipo de la temporada actual, tampoco", async () => {
    const db = useDb(reply([]), reply([seat(CURRENT)]));

    const result = await setPersonArchived("club-a", { id: ID, archived: true });

    expect(result).toEqual({ ok: false, error: "INVALID", fieldErrors: { archived: STILL_IN_TEAM } });
    expect(db.writes).toEqual([]);
  });

  it.each([
    ["la plantilla", [dbError("XX000", "boom"), reply([])]],
    ["el cuerpo técnico", [reply([]), dbError("XX000", "boom")]],
  ])("si no se puede saber si sigue en un equipo (falla la lectura de %s), no se archiva", async (_case, replies) => {
    const db = useDb(...replies);

    await expect(setPersonArchived("club-a", { id: ID, archived: true })).resolves.toEqual({
      ok: false,
      error: "SAVE_FAILED",
    });
    expect(db.writes).toEqual([]);
    expect(logged).toEqual(["[structure.set-person-archived] PostgrestError code=XX000"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("recuperar no mira equipos: solo quita la hora de archivo", async () => {
    const db = useDb(oneRow);

    const result = await setPersonArchived("club-a", { id: ID, archived: false });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries.map((query) => [query.table, query.verb])).toEqual([["people", "update"]]);
    expect(db.queries[0].sent("update")).toEqual([{ archived_at: null }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", ID],
    ]);
  });

  it("nunca borra a la persona", async () => {
    const archiving = useDb(reply([]), reply([]), oneRow);
    await setPersonArchived("club-a", { id: ID, archived: true });
    const recovering = useDb(oneRow);
    await setPersonArchived("club-a", { id: ID, archived: false });

    for (const db of [archiving, recovering]) {
      expect(db.queries.some((query) => query.verb === "delete")).toBe(false);
      expect(db.rpcs).toEqual([]);
    }
  });

  it.each([true, false])("sin fila tocada (archived: %s) es NOT_FOUND", async (archived) => {
    useDb(...(archived ? [reply([]), reply([]), noRows] : [noRows]));

    await expect(setPersonArchived("club-a", { id: ID, archived })).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
