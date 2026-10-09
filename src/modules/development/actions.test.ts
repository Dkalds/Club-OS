import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubContext } from "@/modules/tenancy/queries";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireClub: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/guards", () => ({ requireClub: mocks.requireClub }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import {
  achieveGoal,
  archiveGoal,
  createGoal,
  createNote,
  deleteNote,
  updateGoal,
  updateNote,
} from "./actions";

// Un doble de la base que apunta cada operación (tabla, tipo, valores y filtros) y responde lo
// que diga `respond`. RLS no se simula: lo prueban pgTAP y la integración.
// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).

type Op = {
  table: string;
  kind: "select" | "insert" | "update" | "delete";
  values: unknown;
  eq: Record<string, unknown>;
};
type Reply = { data: unknown; error: { code: string; message: string } | null };

class FakeQuery implements PromiseLike<Reply> {
  private readonly op: Op;

  constructor(
    table: string,
    ops: Op[],
    private readonly respond: (op: Op) => Reply,
  ) {
    this.op = { table, kind: "select", values: null, eq: {} };
    ops.push(this.op);
  }

  select() {
    return this;
  }
  insert(values: unknown) {
    Object.assign(this.op, { kind: "insert", values });
    return this;
  }
  update(values: unknown) {
    Object.assign(this.op, { kind: "update", values });
    return this;
  }
  delete() {
    this.op.kind = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.op.eq[column] = value;
    return this;
  }
  maybeSingle() {
    return Promise.resolve(this.respond(this.op));
  }
  single() {
    return Promise.resolve(this.respond(this.op));
  }
  then<T1, T2 = never>(
    onfulfilled?: ((value: Reply) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.respond(this.op)).then(onfulfilled, onrejected);
  }
}

function installDatabase(respond: (op: Op) => Reply) {
  const ops: Op[] = [];
  mocks.createClient.mockResolvedValue({ from: (table: string) => new FakeQuery(table, ops, respond) });
  return ops;
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const COACH = clubContext("coach");
const PLAYER_CTX: ClubContext = { ...COACH, membership: { role: "player", personId: uuid(50) } };
const ORG = COACH.org.id;
const TEAM = uuid(1);
const PERSON = uuid(2);
const GOAL = uuid(3);
const NOTE = uuid(4);
const FOCUS = uuid(5);

/** La base de siempre: el jugador está en la plantilla y cada escritura toca una fila. */
const happy = (op: Op): Reply => {
  if (op.kind === "select") return { data: { person_id: PERSON }, error: null };
  if (op.kind === "insert") return { data: { id: op.table === "player_goals" ? GOAL : NOTE }, error: null };
  return { data: [{ id: GOAL }], error: null };
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireClub.mockResolvedValue(COACH);
});

describe("createGoal", () => {
  const input = {
    teamId: TEAM,
    personId: PERSON,
    title: "  Bote con mano débil  ",
    description: "",
    focusAreaId: FOCUS,
    standardId: "",
  };

  it("comprueba al jugador en la plantilla del club y crea el objetivo", async () => {
    const ops = installDatabase(happy);

    expect(await createGoal("club-a", input)).toEqual({ ok: true, data: { goalId: GOAL } });
    expect(ops[0]).toMatchObject({
      table: "team_players",
      kind: "select",
      eq: { organization_id: ORG, team_id: TEAM, person_id: PERSON },
    });
    expect(ops[1]).toMatchObject({
      table: "player_goals",
      kind: "insert",
      values: {
        organization_id: ORG,
        team_id: TEAM,
        person_id: PERSON,
        title: "Bote con mano débil",
        description: null,
        focus_area_id: FOCUS,
        standard_id: null,
      },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/c/[club]/(app)", "layout");
  });

  it("un jugador que no está en la plantilla de ese equipo del club: NOT_FOUND sin escribir", async () => {
    const ops = installDatabase((op) => (op.kind === "select" ? { data: null, error: null } : happy(op)));

    expect(await createGoal("club-a", input)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(ops.map((op) => op.kind)).toEqual(["select"]);
  });

  it("con tres activos, la base dice GOAL_LIMIT y no se registra como fallo", async () => {
    installDatabase((op) =>
      op.kind === "insert" ? { data: null, error: { code: "P0001", message: "GOAL_LIMIT" } } : happy(op),
    );

    expect(await createGoal("club-a", input)).toEqual({ ok: false, error: "GOAL_LIMIT" });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("sin título: INVALID con su campo, sin tocar la base", async () => {
    const ops = installDatabase(happy);

    const result = await createGoal("club-a", { ...input, title: "   " });
    expect(result).toMatchObject({ ok: false, error: "INVALID", fieldErrors: { title: "Escribe el objetivo." } });
    expect(ops).toEqual([]);
  });

  it("sin permiso (una cuenta de jugador): NOT_FOUND sin tocar la base", async () => {
    mocks.requireClub.mockResolvedValue(PLAYER_CTX);
    const ops = installDatabase(happy);

    expect(await createGoal("club-a", input)).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(ops).toEqual([]);
  });

  it("un fallo inesperado es SAVE_FAILED y el log no lleva el texto del objetivo", async () => {
    installDatabase((op) =>
      op.kind === "insert" ? { data: null, error: { code: "XX000", message: "boom" } } : happy(op),
    );

    expect(await createGoal("club-a", input)).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain("Bote con mano débil");
  });
});

describe("updateGoal, achieveGoal, archiveGoal", () => {
  it("cambian solo un objetivo activo del club", async () => {
    const ops = installDatabase(happy);

    expect(
      await updateGoal("club-a", { goalId: GOAL, title: "Nuevo", description: null, focusAreaId: null, standardId: null }),
    ).toEqual({ ok: true, data: null });
    expect(await achieveGoal("club-a", { goalId: GOAL })).toEqual({ ok: true, data: null });
    expect(await archiveGoal("club-a", { goalId: GOAL })).toEqual({ ok: true, data: null });

    for (const op of ops) {
      expect(op).toMatchObject({ table: "player_goals", kind: "update", eq: { organization_id: ORG, id: GOAL, status: "active" } });
    }
    expect(ops.map((op) => op.values)).toEqual([
      { title: "Nuevo", description: null, focus_area_id: null, standard_id: null },
      { status: "achieved" },
      { status: "archived" },
    ]);
  });

  it("si no tocan ninguna fila (cerrado, ajeno o de otro club): NOT_FOUND", async () => {
    installDatabase(() => ({ data: [], error: null }));

    expect(await achieveGoal("club-a", { goalId: GOAL })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await archiveGoal("club-a", { goalId: GOAL })).toEqual({ ok: false, error: "NOT_FOUND" });
  });
});

describe("notas", () => {
  it("createNote: comprueba la plantilla del club y crea la nota con su visibilidad", async () => {
    const ops = installDatabase(happy);

    expect(
      await createNote("club-a", { teamId: TEAM, personId: PERSON, body: " Mejor en defensa ", visibility: "staff" }),
    ).toEqual({ ok: true, data: { noteId: NOTE } });
    expect(ops[0]).toMatchObject({ table: "team_players", eq: { organization_id: ORG } });
    expect(ops[1]).toMatchObject({
      table: "coach_notes",
      kind: "insert",
      values: { organization_id: ORG, team_id: TEAM, person_id: PERSON, body: "Mejor en defensa", visibility: "staff" },
    });
  });

  it("la visibilidad tiene que ser una de las dos; una nota vacía o muy larga no vale", async () => {
    const ops = installDatabase(happy);
    const base = { teamId: TEAM, personId: PERSON, body: "Nota", visibility: "private" as const };

    expect(await createNote("club-a", { ...base, visibility: "public" as never })).toMatchObject({
      ok: false,
      error: "INVALID",
      fieldErrors: { visibility: "Elige quién puede leerla." },
    });
    expect(await createNote("club-a", { ...base, body: "" })).toMatchObject({
      fieldErrors: { body: "Escribe la nota." },
    });
    expect(await createNote("club-a", { ...base, body: "x".repeat(2001) })).toMatchObject({
      fieldErrors: { body: "Máximo 2000 caracteres." },
    });
    expect(ops).toEqual([]);
  });

  it("updateNote y deleteNote filtran por el club; una nota ajena es NOT_FOUND", async () => {
    const ops = installDatabase(() => ({ data: [], error: null }));

    expect(await updateNote("club-a", { noteId: NOTE, body: "Otra", visibility: "private" })).toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    expect(await deleteNote("club-a", { noteId: NOTE })).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(ops.map((op) => [op.table, op.kind, op.eq])).toEqual([
      ["coach_notes", "update", { organization_id: ORG, id: NOTE }],
      ["coach_notes", "delete", { organization_id: ORG, id: NOTE }],
    ]);
  });

  it("deleteNote de una nota propia: borrada", async () => {
    installDatabase(() => ({ data: [{ id: NOTE }], error: null }));

    expect(await deleteNote("club-a", { noteId: NOTE })).toEqual({ ok: true, data: null });
  });
});
