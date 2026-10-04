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

import { archiveDrill, createDrill, publishDrill, updateDrill } from "./actions";
import type { DrillInput } from "./schema";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ORG = "org-a";
const DRILL = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const NEW_ID = "00000000-0000-4000-8000-0000000000aa";
const F1 = "00000000-0000-4000-8000-0000000000f1";
const F2 = "00000000-0000-4000-8000-0000000000f2";
const P1 = "00000000-0000-4000-8000-0000000000a1";
const S1 = "00000000-0000-4000-8000-0000000000b1";
const MEDIA = "00000000-0000-4000-8000-0000000000c1";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos y desfase. */
const STAMP = "2026-10-03T10:00:00.123456+00:00";
const NEXT_STAMP = "2026-10-03T10:05:00.654321+00:00";

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
// guarda lo que se le pidió: los tests comprueban qué se envía a la base de datos y qué vuelve
// de ella, no que un mock haya sido llamado.

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

  update = (...args: unknown[]) => this.record("update", args);
  select = (...args: unknown[]) => this.record("select", args);
  eq = (...args: unknown[]) => this.record("eq", args);

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
}

/** Prepara el cliente con las respuestas que irá dando, en orden. */
function installDb(...replies: Reply[]): FakeDb {
  const db = new FakeDb(replies);
  mocks.createClient.mockResolvedValue(db);
  return db;
}

const reply = (data: unknown): Reply => ({ data, error: null });
/** Lo que devuelve `save_drill`: un conjunto de una fila, que PostgREST entrega como lista. */
const saved = (id: string, updatedAt: string) => reply([{ id, updated_at: updatedAt }]);

/** Un error de PostgREST: un `Error` con su código, y un mensaje que lleva datos de la fila. */
function dbError(code: string, message: string): Reply {
  return {
    data: null,
    error: Object.assign(new Error(message), { name: "PostgrestError", code }),
  };
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

// ── La entrada ───────────────────────────────────────────────────────────────────────────

const INPUT: DrillInput = {
  title: "Rebote y salida",
  summary: "Un resumen corto.",
  objective: "Asegurar el rebote.",
  setupMd: "Cinco jugadores en la pintura.",
  minPlayers: 6,
  maxPlayers: 12,
  minMinutes: 10,
  maxMinutes: 15,
  minAge: 12,
  maxAge: 14,
  equipment: ["Balones", "Conos"],
  videoUrl: "https://youtu.be/abc123",
  diagramMediaId: MEDIA,
  coachingPoints: [
    { text: "Bloquea antes de ir al balón.", isKey: true },
    { text: "Cabeza arriba.", isKey: false },
  ],
  variants: [{ title: "Con un defensor más", description: "Entra un cuarto defensor." }],
  focusAreaIds: [F1, F2],
  principleIds: [P1],
  standardIds: [S1],
};

/** Lo que `save_drill` espera en `p_payload`: las mismas claves, en snake_case. */
const PAYLOAD = {
  title: "Rebote y salida",
  summary: "Un resumen corto.",
  objective: "Asegurar el rebote.",
  setup_md: "Cinco jugadores en la pintura.",
  min_players: 6,
  max_players: 12,
  min_minutes: 10,
  max_minutes: 15,
  min_age: 12,
  max_age: 14,
  equipment: ["Balones", "Conos"],
  video_url: "https://youtu.be/abc123",
  diagram_media_id: MEDIA,
  focus_area_ids: [F1, F2],
  principle_ids: [P1],
  standard_ids: [S1],
  coaching_points: [
    { text: "Bloquea antes de ir al balón.", is_key: true },
    { text: "Cabeza arriba.", is_key: false },
  ],
  variants: [{ title: "Con un defensor más", description: "Entra un cuarto defensor." }],
};

/** Una entrada que el tipo no deja escribir: lo que mandaría un cliente manipulado. */
function unsafe<T>(value: unknown): T {
  return value as T;
}

function update(overrides: Partial<DrillInput> = {}, expectedUpdatedAt = STAMP) {
  return updateDrill("club-a", { drillId: DRILL, expectedUpdatedAt, drill: { ...INPUT, ...overrides } });
}

// ── Lo que comparten las cuatro acciones ─────────────────────────────────────────────────

const ACTIONS: Array<[string, () => Promise<ActionResult<unknown>>]> = [
  ["createDrill", () => createDrill("club-a", INPUT)],
  ["updateDrill", () => update()],
  ["publishDrill", () => publishDrill("club-a", { drillId: DRILL })],
  ["archiveDrill", () => archiveDrill("club-a", { drillId: DRILL })],
];

describe("quién escribe", () => {
  const WRITERS = ACTIONS.filter(([name]) => name === "createDrill" || name === "updateDrill");
  const MANAGERS = ACTIONS.filter(([name]) => name === "publishDrill" || name === "archiveDrill");

  it.each(WRITERS)("%s: un jugador o una familia reciben NOT_FOUND sin tocar la base de datos", async (_n, run) => {
    for (const role of ["player", "guardian"] as const) {
      mocks.requireClub.mockResolvedValue(contextWithRole(role));

      await expect(run()).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    }

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it.each(WRITERS)("%s: el entrenador y la dirección pueden (RLS decide qué ejercicio)", async (_n, run) => {
    for (const role of ["coach", "admin"] as const) {
      mocks.requireClub.mockResolvedValue(contextWithRole(role));
      installDb(saved(NEW_ID, NEXT_STAMP));

      await expect(run()).resolves.toMatchObject({ ok: true });
    }
  });

  it.each(MANAGERS)(
    "%s: solo la dirección; un entrenador, un jugador o una familia reciben NOT_FOUND sin tocar la base de datos",
    async (_n, run) => {
      for (const role of ["coach", "player", "guardian"] as const) {
        mocks.requireClub.mockResolvedValue(contextWithRole(role));

        await expect(run()).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
      }

      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(logged).toEqual([]);
    },
  );

  it.each(ACTIONS)("%s: un club que no existe lanza el 404, no lo traga", async (_n, run) => {
    mocks.requireClub.mockRejectedValue(NOT_FOUND);

    await expect(run()).rejects.toBe(NOT_FOUND);

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("la acción pregunta por el club que le pasan", async () => {
    installDb(saved(NEW_ID, NEXT_STAMP));

    await createDrill("club-b", INPUT);

    expect(mocks.requireClub).toHaveBeenCalledWith("club-b");
  });
});

describe("tras escribir", () => {
  it.each(ACTIONS)(
    "%s: revalida la biblioteca y The Way por patrón de ruta y layout, no por la URL del club",
    async (_n, run) => {
      installDb(saved(NEW_ID, NEXT_STAMP), reply([{ id: DRILL }]));

      const result = await run();

      expect(result.ok).toBe(true);
      // Patrones de ruta (carpetas, con el grupo `(app)`) y `layout`: con la URL concreta y
      // `layout` Next arma una etiqueta que ninguna ruta lleva (ver `@/lib/mutate`).
      expect(mocks.revalidatePath.mock.calls).toEqual([
        ["/c/[club]/(app)/drills", "layout"],
        ["/c/[club]/(app)/way", "layout"],
      ]);
    },
  );

  it.each(ACTIONS)("%s: no revalida si la escritura falla", async (_n, run) => {
    installDb(dbError("XX000", "boom"));

    const result = await run();

    expect(result.ok).toBe(false);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("errores de la base de datos", () => {
  it.each(ACTIONS.slice(0, 2))("%s: copia obsoleta (P0001 STALE_COPY)", async (_n, run) => {
    installDb(dbError("P0001", "STALE_COPY"));

    await expect(run()).resolves.toEqual({ ok: false, error: "STALE_COPY" });
    expect(logged).toEqual([]);
  });

  it.each(ACTIONS)("%s: no encontrado o sin permiso (P0002) es NOT_FOUND", async (_n, run) => {
    installDb(dbError("P0002", "NOT_FOUND"));

    await expect(run()).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual([]);
  });

  it.each(ACTIONS)("%s: cualquier otro error es SAVE_FAILED y se registra sin el contenido de la fila", async (_n, run) => {
    installDb(dbError("XX000", 'fila con "texto del club"'));

    await expect(run()).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^\[drills\.[a-z-]+\] PostgrestError code=XX000$/);
  });

  it.each(ACTIONS)("%s: una entrada que la base rechaza (22023) es INVALID, sin registrar", async (_n, run) => {
    installDb(dbError("22023", "INVALID"));

    await expect(run()).resolves.toEqual({ ok: false, error: "INVALID" });
    expect(logged).toEqual([]);
  });

  it("un permiso denegado tras pasar `can` (42501) es NOT_FOUND y se registra", async () => {
    installDb(dbError("42501", "new row violates row-level security policy"));

    const result = await createDrill("club-a", INPUT);

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual(["[drills.create-drill] PostgrestError code=42501"]);
  });

  it("si el cliente lanza una excepción, la acción devuelve SAVE_FAILED sin romperse", async () => {
    mocks.createClient.mockRejectedValue(new TypeError("fetch failed"));

    const result = await createDrill("club-a", INPUT);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[drills.create-drill] TypeError"]);
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

    await expect(publishDrill("club-a", { drillId: DRILL })).rejects.toBe(thrown);

    expect(logged).toEqual([]);
  });
});

// ── Validación: antes de la base de datos ────────────────────────────────────────────────

describe("la entrada se valida antes de tocar la base de datos", () => {
  it("el máximo de jugadores menor que el mínimo: INVALID en maxPlayers, sin RPC", async () => {
    const result = await createDrill("club-a", { ...INPUT, minPlayers: 8, maxPlayers: 4 });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { maxPlayers: "El máximo de jugadores no puede ser menor que el mínimo." },
    });
    expect(mocks.requireClub).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un enlace que solo parece de YouTube: INVALID en videoUrl, sin RPC", async () => {
    const result = await createDrill("club-a", { ...INPUT, videoUrl: "https://youtube.com.evil.com/x" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { videoUrl: "Pega un enlace de YouTube o Vimeo que empiece por https://." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("varios campos mal: todos con su mensaje", async () => {
    const result = await createDrill("club-a", {
      ...INPUT,
      title: "",
      minMinutes: 0,
      focusAreaIds: [],
      setupMd: "a".repeat(5001),
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        title: "Escribe un título de 3 a 80 caracteres.",
        minMinutes: "Elige entre 1 y 120 minutos.",
        focusAreaIds: "Elige al menos un objetivo.",
        setupMd: "La organización admite hasta 5000 caracteres.",
      },
    });
  });

  it("un error en una lista no esconde los de orden: todos a la vez, sin RPC", async () => {
    const result = await createDrill("club-a", {
      ...INPUT,
      coachingPoints: [{ text: "", isKey: false }],
      variants: [{ title: "", description: null }],
      minPlayers: 8,
      maxPlayers: 4,
      minMinutes: 20,
      maxMinutes: 10,
      minAge: 14,
      maxAge: 10,
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        coachingPoints: "Escribe el punto o quítalo.",
        variants: "Escribe el título de la variante o quítala.",
        maxPlayers: "El máximo de jugadores no puede ser menor que el mínimo.",
        maxMinutes: "La duración máxima no puede ser menor que la mínima.",
        maxAge: "La edad máxima no puede ser menor que la mínima.",
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("al editar, una lista mal y un rango al revés dan los dos errores", async () => {
    const result = await update({
      coachingPoints: Array.from({ length: 4 }, (_, i) => ({ text: `Punto ${i + 1}`, isKey: true })),
      minPlayers: 8,
      maxPlayers: 4,
    });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        coachingPoints: "Marca como clave 3 puntos como máximo.",
        maxPlayers: "El máximo de jugadores no puede ser menor que el mínimo.",
      },
    });
  });

  it("al editar, los errores de campo llevan las mismas claves que al crear", async () => {
    const result = await update({ title: "", maxMinutes: 5 });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        title: "Escribe un título de 3 a 80 caracteres.",
        maxMinutes: "La duración máxima no puede ser menor que la mínima.",
      },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("sin diagramMediaId la acción no guarda: ausente quitaría el diagrama", async () => {
    const { diagramMediaId: _omitted, ...withoutDiagram } = INPUT;
    void _omitted;

    const result = await updateDrill("club-a", {
      drillId: DRILL,
      expectedUpdatedAt: STAMP,
      drill: unsafe(withoutDiagram),
    });

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un id que no es uuid no llega a la base de datos", async () => {
    const result = await createDrill("club-a", { ...INPUT, standardIds: ["no-es-un-uuid"] });

    expect(result).toMatchObject({ ok: false, error: "INVALID" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

// ── createDrill ──────────────────────────────────────────────────────────────────────────

describe("createDrill", () => {
  it("llama a save_drill sin p_drill ni p_expected_updated_at, y devuelve el id nuevo", async () => {
    const db = installDb(saved(NEW_ID, STAMP));

    const result = await createDrill("club-a", INPUT);

    expect(result).toEqual({ ok: true, data: { id: NEW_ID } });
    expect(db.rpcs).toEqual([{ name: "save_drill", args: { p_org: ORG, p_payload: PAYLOAD } }]);
    expect(Object.keys(db.rpcs[0].args).sort()).toEqual(["p_org", "p_payload"]);
  });

  it("solo escribe por la función, en una sola llamada: ningún insert directo", async () => {
    const db = installDb(saved(NEW_ID, STAMP));

    await createDrill("club-a", INPUT);

    expect(db.queries).toEqual([]);
    expect(db.rpcs).toHaveLength(1);
  });

  it("el club es el de la sesión, no el que traiga la entrada", async () => {
    const db = installDb(saved(NEW_ID, STAMP));

    await createDrill("club-a", unsafe({ ...INPUT, organization_id: "otro", organizationId: "otro" }));

    expect(db.rpcs[0].args.p_org).toBe(ORG);
    expect(db.rpcs[0].args.p_payload).not.toHaveProperty("organization_id");
  });

  it("estado, autor y fechas de la entrada no viajan: nace como borrador de quien lo crea", async () => {
    const db = installDb(saved(NEW_ID, STAMP));

    await createDrill(
      "club-a",
      unsafe({ ...INPUT, status: "published", createdBy: "otro", created_by: "otro", updatedAt: STAMP }),
    );

    expect(db.rpcs[0].args.p_payload).toEqual(PAYLOAD);
  });

  it("recorta los textos y manda null en vez de texto vacío", async () => {
    const db = installDb(saved(NEW_ID, STAMP));

    await createDrill("club-a", {
      ...INPUT,
      title: "  Rebote y salida  ",
      summary: "  ",
      objective: "",
      setupMd: "",
      videoUrl: "",
      maxAge: null,
      equipment: [" Balones ", ""],
      coachingPoints: [{ text: "  Cabeza arriba.  ", isKey: false }],
      variants: [{ title: " Variante ", description: "" }],
    });

    expect(db.rpcs[0].args.p_payload).toEqual({
      ...PAYLOAD,
      title: "Rebote y salida",
      summary: null,
      objective: null,
      setup_md: null,
      video_url: null,
      max_age: null,
      equipment: ["Balones"],
      coaching_points: [{ text: "Cabeza arriba.", is_key: false }],
      variants: [{ title: "Variante", description: null }],
    });
  });

  it("sin diagrama manda diagram_media_id a null", async () => {
    const db = installDb(saved(NEW_ID, STAMP));

    await createDrill("club-a", { ...INPUT, diagramMediaId: null });

    expect(db.rpcs[0].args.p_payload).toMatchObject({ diagram_media_id: null });
  });

  it("una respuesta sin fila es SAVE_FAILED y se registra: nunca un id inventado", async () => {
    installDb(reply([]));

    const result = await createDrill("club-a", INPUT);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toHaveLength(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

// ── updateDrill ──────────────────────────────────────────────────────────────────────────

describe("updateDrill", () => {
  it("pasa la copia esperada intacta, con sus microsegundos, y devuelve el updated_at nuevo", async () => {
    const db = installDb(saved(DRILL, NEXT_STAMP));

    const result = await update({}, "2026-10-03T10:00:00.123456+00:00");

    expect(db.rpcs).toHaveLength(1);
    expect(db.rpcs[0].name).toBe("save_drill");
    expect(db.rpcs[0].args.p_expected_updated_at).toBe("2026-10-03T10:00:00.123456+00:00");
    expect(result).toEqual({ ok: true, data: { updatedAt: "2026-10-03T10:05:00.654321+00:00" } });
  });

  it("manda el club, el ejercicio, la copia y el payload completo: nunca omite p_drill", async () => {
    const db = installDb(saved(DRILL, NEXT_STAMP));

    await update();

    expect(db.rpcs[0].args).toEqual({
      p_org: ORG,
      p_drill: DRILL,
      p_expected_updated_at: STAMP,
      p_payload: PAYLOAD,
    });
  });

  it("reenvía el diagrama actual (null lo quitaría)", async () => {
    const db = installDb(saved(DRILL, NEXT_STAMP), saved(DRILL, NEXT_STAMP));

    await update({ diagramMediaId: MEDIA });
    await update({ diagramMediaId: null });

    expect(db.rpcs[0].args.p_payload).toMatchObject({ diagram_media_id: MEDIA });
    expect(db.rpcs[1].args.p_payload).toMatchObject({ diagram_media_id: null });
  });

  it.each(["", "   "])("sin la copia que se estaba editando («%s») no se guarda", async (stamp) => {
    const result = await update({}, stamp);

    // Una copia en blanco tampoco vale: sin ella `save_drill` respondería STALE_COPY siempre.
    expect(result.ok ? null : result.error).toBe("INVALID");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("sin el id del ejercicio, o con uno que no es uuid, no se guarda", async () => {
    const empty = await updateDrill("club-a", { drillId: "", expectedUpdatedAt: STAMP, drill: INPUT });
    const bad = await updateDrill("club-a", { drillId: "no-es-un-uuid", expectedUpdatedAt: STAMP, drill: INPUT });

    expect(empty).toMatchObject({ ok: false, error: "INVALID" });
    expect(bad).toEqual({ ok: false, error: "INVALID", fieldErrors: { drillId: "No encontramos este contenido." } });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("una respuesta sin fila es SAVE_FAILED y se registra", async () => {
    installDb(reply([]));

    const result = await update();

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toHaveLength(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

// ── publishDrill y archiveDrill ──────────────────────────────────────────────────────────

describe.each([
  ["publishDrill", publishDrill, "published"],
  ["archiveDrill", archiveDrill, "archived"],
] as const)("%s", (name, run, status) => {
  it(`pasa el ejercicio a «${status}»: solo ese campo, solo en este club`, async () => {
    const db = installDb(reply([{ id: DRILL }]));

    const result = await run("club-a", { drillId: DRILL });

    expect(result).toEqual({ ok: true, data: null });
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("drills");
    expect(db.queries[0].sent("update")).toEqual([{ status }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", DRILL],
    ]);
    expect(db.queries[0].sent("select")).toEqual(["id"]);
    expect(db.rpcs).toEqual([]);
  });

  it("un ejercicio que no existe, es de otro club o no se puede editar afecta a 0 filas: NOT_FOUND", async () => {
    installDb(reply([]));

    const result = await run("club-a", { drillId: DRILL });

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("un id que no es uuid no llega a la base de datos", async () => {
    const result = await run("club-a", { drillId: "no-es-un-uuid" });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { drillId: "No encontramos este contenido." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("lo demás que traiga la entrada (estado, club) no cuenta", async () => {
    const db = installDb(reply([{ id: DRILL }]));

    await run("club-a", unsafe({ drillId: DRILL, status: "draft", organization_id: "otro" }));

    expect(db.queries[0].sent("update")).toEqual([{ status }]);
    expect(db.queries[0].filters).toEqual([
      ["organization_id", ORG],
      ["id", DRILL],
    ]);
  });

  it(`${name} por un error de lectura de la fila no inventa un éxito`, async () => {
    installDb(dbError("XX000", "boom"));

    await expect(run("club-a", { drillId: DRILL })).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });
  });
});
