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

import { DIAGRAM_ERROR, MAX_DIAGRAM_BYTES } from "@/modules/media/diagram-file";
import { archiveDrill, createDrill, publishDrill, updateDrill, uploadDrillDiagram } from "./actions";
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
/** Lo que devuelve Storage al firmar el diagrama recién subido. */
const SIGNED = "http://storage.test/object/sign/club-media/x.png?token=t";
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

  insert = (...args: unknown[]) => this.record("insert", args);
  update = (...args: unknown[]) => this.record("update", args);
  select = (...args: unknown[]) => this.record("select", args);
  eq = (...args: unknown[]) => this.record("eq", args);
  single = (...args: unknown[]) => this.record("single", args);

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

/** Lo que responde el Storage de pega: una respuesta, o un `Error` (la red cae: lanza). */
type StorageOutcome = Reply | Error;

/**
 * El bucket de pega: anota lo que se le pide y responde lo que el test haya preparado (por
 * defecto, que todo sale bien). `body` es lo que recibe de verdad `upload`, para comprobar qué
 * bytes y con qué opciones se envían a Storage.
 */
class FakeBucket {
  readonly uploads: Array<{ path: string; body: unknown; options: unknown }> = [];
  readonly removes: string[][] = [];
  readonly signs: Array<{ path: string; expiresIn: unknown }> = [];

  uploadOutcome: StorageOutcome = { data: { path: "ok" }, error: null };
  removeOutcome: StorageOutcome = { data: [], error: null };
  signOutcome: StorageOutcome = { data: { signedUrl: SIGNED }, error: null };

  private answer(outcome: StorageOutcome): Promise<Reply> {
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  }

  upload = (path: string, body: unknown, options: unknown) => {
    this.uploads.push({ path, body, options });
    return this.answer(this.uploadOutcome);
  };

  remove = (paths: string[]) => {
    this.removes.push(paths);
    return this.answer(this.removeOutcome);
  };

  createSignedUrl = (path: string, expiresIn: unknown) => {
    this.signs.push({ path, expiresIn });
    return this.answer(this.signOutcome);
  };
}

class FakeStorage {
  readonly bucket = new FakeBucket();
  readonly names: string[] = [];

  from(name: string): FakeBucket {
    this.names.push(name);
    return this.bucket;
  }
}

class FakeDb {
  readonly queries: FakeQuery[] = [];
  readonly rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
  readonly storage = new FakeStorage();

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

// ── uploadDrillDiagram ───────────────────────────────────────────────────────────────────

/** Una cabecera seguida de relleno: lo que mira `sniffImageType` son los primeros bytes. */
function imageBytes(kind: "png" | "jpg" | "webp", size = 1024): Uint8Array<ArrayBuffer> {
  const header = {
    png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    jpg: [0xff, 0xd8, 0xff, 0xe0],
    webp: [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
  }[kind];
  const bytes = new Uint8Array(size);
  bytes.set(header);
  return bytes;
}

const SVG_BYTES = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

function fileOf(bytes: Uint8Array<ArrayBuffer>, type = "image/png", name = "x.png"): File {
  return new File([bytes], name, { type });
}

/** El formulario que manda el cliente: `drillId` y `file`. Un campo `null` no se manda. */
function uploadForm(file: unknown, drillId: unknown = DRILL): FormData {
  const form = new FormData();
  if (drillId !== null) form.set("drillId", String(drillId));
  if (file !== null) form.set("file", file as string | Blob);
  return form;
}

function uploadWith(file: File, drillId: string = DRILL) {
  return uploadDrillDiagram("club-a", uploadForm(file, drillId));
}

/** Un error de Storage, con la forma que tiene de verdad: el `status` HTTP es 400 en todos. */
function storageError(statusCode: string, code: string): Reply {
  return {
    data: null,
    error: Object.assign(new Error('mensaje con datos del club "x"'), {
      name: "StorageApiError",
      status: 400,
      statusCode,
      code,
    }),
  };
}

/** Prepara la base de datos con la ficha que devolverá el insert. */
function installUploadDb() {
  return installDb(reply({ id: MEDIA }));
}

const PATH_RE = new RegExp(`^org/${ORG}/drills/${DRILL}/[0-9a-f-]{36}\\.(png|jpg|webp)$`);

describe("uploadDrillDiagram: quién sube", () => {
  it.each(["player", "guardian"] as const)(
    "%s recibe NOT_FOUND sin tocar la base de datos ni Storage",
    async (role) => {
      mocks.requireClub.mockResolvedValue(contextWithRole(role));

      await expect(uploadWith(fileOf(imageBytes("png")))).resolves.toEqual({ ok: false, error: "NOT_FOUND" });

      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(logged).toEqual([]);
    },
  );

  it.each(["coach", "admin"] as const)("%s puede (RLS de Storage decide qué ejercicio)", async (role) => {
    mocks.requireClub.mockResolvedValue(contextWithRole(role));
    installUploadDb();

    await expect(uploadWith(fileOf(imageBytes("png")))).resolves.toMatchObject({ ok: true });
  });

  it("un club que no existe lanza el 404, no lo traga", async () => {
    mocks.requireClub.mockRejectedValue(NOT_FOUND);

    await expect(uploadWith(fileOf(imageBytes("png")))).rejects.toBe(NOT_FOUND);

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("pregunta por el club que le pasan", async () => {
    installUploadDb();

    await uploadDrillDiagram("club-b", uploadForm(fileOf(imageBytes("png"))));

    expect(mocks.requireClub).toHaveBeenCalledWith("club-b");
  });
});

describe("uploadDrillDiagram: lo que sube", () => {
  it("un PNG válido: sube los bytes al bucket privado con el tipo detectado y sin pisar, e inserta la ficha", async () => {
    const bytes = imageBytes("png", 1500);
    const db = installUploadDb();

    const result = await uploadWith(fileOf(bytes));

    const [upload] = db.storage.bucket.uploads;
    expect(db.storage.names[0]).toBe("club-media");
    expect(db.storage.bucket.uploads).toHaveLength(1);
    expect(upload.path).toMatch(PATH_RE);
    expect(upload.options).toEqual({ contentType: "image/png", upsert: false });
    expect(upload.body).toEqual(bytes);

    expect(db.queries).toHaveLength(1);
    expect(db.queries[0].table).toBe("media_assets");
    expect(db.queries[0].sent("insert")).toEqual([
      { organization_id: ORG, path: upload.path, kind: "image", mime: "image/png", bytes: 1500 },
    ]);
    expect(db.queries[0].sent("select")).toEqual(["id"]);

    expect(result).toEqual({ ok: true, data: { mediaId: MEDIA, previewUrl: SIGNED } });
  });

  it("sube los bytes, no el File: con un File, Storage tomaría el tipo declarado por el cliente", async () => {
    const db = installUploadDb();

    await uploadWith(fileOf(imageBytes("png")));

    const { body } = db.storage.bucket.uploads[0];
    expect(body).toBeInstanceOf(Uint8Array);
    expect(body).not.toBeInstanceOf(Blob);
  });

  it.each([
    ["jpg", "image/jpeg"],
    ["webp", "image/webp"],
    ["png", "image/png"],
  ] as const)("un %s: la extensión y el tipo salen de lo detectado (%s)", async (kind, mime) => {
    const db = installUploadDb();

    await uploadWith(fileOf(imageBytes(kind), mime, `lo-que-sea.${kind}`));

    const [upload] = db.storage.bucket.uploads;
    expect(upload.path.endsWith(`.${kind}`)).toBe(true);
    expect(upload.options).toEqual({ contentType: mime, upsert: false });
    expect(db.queries[0].sent("insert")).toEqual([expect.objectContaining({ mime, path: upload.path })]);
  });

  it("la ruta sale del club de la sesión y del ejercicio de la entrada; el nombre del fichero no cuenta", async () => {
    const db = installUploadDb();
    const form = uploadForm(fileOf(imageBytes("png"), "image/png", "../../org/otro-club/drills/x/evil.svg"));
    form.set("organization_id", "otro-club");
    form.set("path", "org/otro-club/drills/x/evil.png");
    form.set("mime", "image/svg+xml");

    await uploadDrillDiagram("club-a", form);

    expect(db.storage.bucket.uploads[0].path).toMatch(PATH_RE);
    expect(db.storage.bucket.uploads[0].path).not.toContain("evil");
    expect(db.queries[0].sent("insert")).toEqual([
      expect.objectContaining({ organization_id: ORG, path: db.storage.bucket.uploads[0].path, mime: "image/png" }),
    ]);
  });

  it("cada subida saca un nombre nuevo: no pisa la anterior", async () => {
    const db = installDb(reply({ id: MEDIA }), reply({ id: MEDIA }));

    await uploadWith(fileOf(imageBytes("png")));
    await uploadWith(fileOf(imageBytes("png")));

    const [first, second] = db.storage.bucket.uploads;
    expect(first.path).not.toBe(second.path);
  });

  it("la ficha guarda el tamaño real de lo que se subió", async () => {
    const db = installUploadDb();

    await uploadWith(fileOf(imageBytes("webp", 777), "image/webp"));

    expect(db.queries[0].sent("insert")).toEqual([expect.objectContaining({ bytes: 777 })]);
  });

  it("2 MiB justos pasan", async () => {
    const db = installUploadDb();

    const result = await uploadWith(fileOf(imageBytes("png", MAX_DIAGRAM_BYTES)));

    expect(result.ok).toBe(true);
    expect(db.storage.bucket.uploads).toHaveLength(1);
  });

  it("no revalida nada: el diagrama no se ve hasta que el ejercicio se guarda con él", async () => {
    installUploadDb();

    await uploadWith(fileOf(imageBytes("png")));

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("uploadDrillDiagram: lo que se rechaza antes de tocar Storage", () => {
  const rejected = { ok: false, error: "INVALID", fieldErrors: { diagram: DIAGRAM_ERROR } };

  it("un SVG llamado x.png con tipo image/png y 20 MB: INVALID con el mensaje, sin leerlo ni subirlo", async () => {
    const svg = new Uint8Array(20 * 1024 * 1024);
    svg.set(SVG_BYTES);

    const result = await uploadWith(fileOf(svg, "image/png", "x.png"));

    expect(result).toEqual(rejected);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un SVG llamado x.png con tipo image/png y tamaño normal: los bytes lo delatan, no se sube", async () => {
    const db = installUploadDb();

    const result = await uploadWith(fileOf(SVG_BYTES, "image/png", "x.png"));

    expect(result).toEqual(rejected);
    expect(db.storage.bucket.uploads).toEqual([]);
    expect(db.queries).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un SVG declarado como image/svg+xml: INVALID por el tipo", async () => {
    const result = await uploadWith(fileOf(SVG_BYTES, "image/svg+xml", "x.svg"));

    expect(result).toEqual(rejected);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["png", "image/jpeg"],
    ["png", "image/webp"],
    ["jpg", "image/png"],
    ["webp", "image/jpeg"],
  ] as const)("bytes de %s declarados como %s: el tipo declarado y el detectado no coinciden", async (kind, declared) => {
    const db = installUploadDb();

    const result = await uploadWith(fileOf(imageBytes(kind), declared));

    expect(result).toEqual(rejected);
    expect(db.storage.bucket.uploads).toEqual([]);
    expect(db.queries).toEqual([]);
  });

  it("texto cualquiera declarado como image/png no se sube", async () => {
    const db = installUploadDb();

    const result = await uploadWith(fileOf(new TextEncoder().encode("esto no es una imagen"), "image/png"));

    expect(result).toEqual(rejected);
    expect(db.storage.bucket.uploads).toEqual([]);
  });

  it("2 MiB y un byte: INVALID sin tocar la base de datos", async () => {
    const result = await uploadWith(fileOf(imageBytes("png", MAX_DIAGRAM_BYTES + 1)));

    expect(result).toEqual(rejected);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un fichero vacío: INVALID", async () => {
    const result = await uploadWith(fileOf(new Uint8Array(0)));

    expect(result).toEqual(rejected);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("sin fichero, o con un texto en su lugar: INVALID en el diagrama", async () => {
    for (const file of [null, "x.png", ""]) {
      await expect(uploadDrillDiagram("club-a", uploadForm(file))).resolves.toEqual(rejected);
    }

    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("un ejercicio que no es un uuid, o ausente: INVALID en drillId", async () => {
    for (const drillId of ["no-es-un-uuid", "", null]) {
      await expect(uploadDrillDiagram("club-a", uploadForm(fileOf(imageBytes("png")), drillId))).resolves.toEqual({
        ok: false,
        error: "INVALID",
        fieldErrors: { drillId: "No encontramos este contenido." },
      });
    }

    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("los dos campos mal a la vez: los dos errores", async () => {
    const result = await uploadDrillDiagram("club-a", uploadForm("x.png", "no-es-un-uuid"));

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { drillId: "No encontramos este contenido.", diagram: DIAGRAM_ERROR },
    });
  });

  it("si la entrada no es un FormData (un cliente manipulado), INVALID y no lanza", async () => {
    for (const input of [null, undefined, "texto", { drillId: DRILL, file: fileOf(imageBytes("png")) }, 7]) {
      const result = await uploadDrillDiagram("club-a", input as unknown as FormData);

      expect(result.ok ? null : result.error).toBe("INVALID");
    }

    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("la validación va antes que el permiso y el club: nada del servidor se toca por una entrada inválida", async () => {
    await uploadDrillDiagram("club-a", uploadForm("x.png", "no-es-un-uuid"));

    expect(mocks.requireClub).not.toHaveBeenCalled();
  });
});

describe("uploadDrillDiagram: cuando Storage dice que no", () => {
  it("sin permiso (403 AccessDenied) es NOT_FOUND: no inserta nada ni deja rastro en el log", async () => {
    const db = installUploadDb();
    db.storage.bucket.uploadOutcome = storageError("403", "AccessDenied");

    const result = await uploadWith(fileOf(imageBytes("png")));

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.queries).toEqual([]);
    expect(db.storage.bucket.removes).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("el HTTP 400 no distingue nada: sin statusCode, el code AccessDenied basta", async () => {
    const db = installUploadDb();
    db.storage.bucket.uploadOutcome = {
      data: null,
      error: Object.assign(new Error("denegado"), { name: "StorageApiError", status: 400, code: "AccessDenied" }),
    };

    await expect(uploadWith(fileOf(imageBytes("png")))).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it.each([
    ["415", "InvalidMimeType"],
    ["413", "EntityTooLarge"],
  ])(
    "el bucket rechaza el fichero (%s %s): INVALID con el mismo mensaje, y se registra porque las constantes no coinciden con el bucket",
    async (statusCode, code) => {
      const db = installUploadDb();
      db.storage.bucket.uploadOutcome = storageError(statusCode, code);

      const result = await uploadWith(fileOf(imageBytes("png")));

      expect(result).toEqual({ ok: false, error: "INVALID", fieldErrors: { diagram: DIAGRAM_ERROR } });
      expect(db.queries).toEqual([]);
      expect(logged).toEqual([`[drills.upload-diagram] StorageApiError status=400 code=${code}`]);
    },
  );

  it.each([
    ["409", "KeyAlreadyExists"],
    ["500", "InternalError"],
  ])("cualquier otro error (%s %s) es SAVE_FAILED, registrado sin el mensaje", async (statusCode, code) => {
    const db = installUploadDb();
    db.storage.bucket.uploadOutcome = storageError(statusCode, code);

    const result = await uploadWith(fileOf(imageBytes("png")));

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.queries).toEqual([]);
    expect(logged).toEqual([`[drills.upload-diagram] StorageApiError status=400 code=${code}`]);
  });

  it("si la red cae al subir, SAVE_FAILED sin romperse y sin ficha", async () => {
    const db = installUploadDb();
    db.storage.bucket.uploadOutcome = new TypeError("fetch failed");

    const result = await uploadWith(fileOf(imageBytes("png")));

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.queries).toEqual([]);
    expect(logged).toEqual(["[drills.upload-diagram] TypeError"]);
  });
});

describe("uploadDrillDiagram: cuando la ficha no se puede crear", () => {
  it("la inserción falla: se borra el objeto recién subido y es SAVE_FAILED", async () => {
    const db = installDb(dbError("XX000", 'fila con "texto del club"'));

    const result = await uploadWith(fileOf(imageBytes("png")));

    const [{ path }] = db.storage.bucket.uploads;
    expect(db.storage.bucket.removes).toEqual([[path]]);
    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[drills.upload-diagram] PostgrestError code=XX000"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("borra el mismo objeto que subió, sea cual sea la extensión", async () => {
    const db = installDb(dbError("XX000", "boom"));

    await uploadWith(fileOf(imageBytes("webp"), "image/webp"));

    expect(db.storage.bucket.removes).toEqual([[db.storage.bucket.uploads[0].path]]);
    expect(db.storage.bucket.removes[0][0].endsWith(".webp")).toBe(true);
  });

  it("si RLS niega la ficha (42501) es NOT_FOUND, y también se limpia el objeto", async () => {
    const db = installDb(dbError("42501", "new row violates row-level security policy"));

    const result = await uploadWith(fileOf(imageBytes("png")));

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(db.storage.bucket.removes).toHaveLength(1);
  });

  it("una respuesta sin fila ni error es SAVE_FAILED y también limpia: nunca un id inventado", async () => {
    const db = installDb(reply(null));

    const result = await uploadWith(fileOf(imageBytes("png")));

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(db.storage.bucket.removes).toHaveLength(1);
    expect(logged).toHaveLength(1);
  });

  it("si además falla el borrado, el resultado sigue siendo el de la inserción y se registran los dos fallos", async () => {
    const db = installDb(dbError("XX000", "boom"));
    db.storage.bucket.removeOutcome = storageError("500", "InternalError");

    const result = await uploadWith(fileOf(imageBytes("png")));

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual([
      "[drills.upload-diagram] PostgrestError code=XX000",
      "[drills.upload-diagram.cleanup] StorageApiError status=400 code=InternalError",
    ]);
  });

  it("si el borrado lanza, la limpieza no tapa el motivo del fallo: 42501 sigue siendo NOT_FOUND", async () => {
    const db = installDb(dbError("42501", "denegado"));
    db.storage.bucket.removeOutcome = new TypeError("fetch failed");

    const result = await uploadWith(fileOf(imageBytes("png")));

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toContain("[drills.upload-diagram.cleanup] TypeError");
  });
});

describe("uploadDrillDiagram: la URL de vista previa", () => {
  it("se firma el objeto recién subido, con los 600 s por defecto", async () => {
    const db = installUploadDb();

    await uploadWith(fileOf(imageBytes("png")));

    expect(db.storage.bucket.signs).toEqual([{ path: db.storage.bucket.uploads[0].path, expiresIn: 600 }]);
  });

  it("si no se puede firmar, la subida cuenta igual: ok con el mediaId y previewUrl null, y no se borra nada", async () => {
    const db = installUploadDb();
    db.storage.bucket.signOutcome = storageError("404", "NoSuchKey");

    const result = await uploadWith(fileOf(imageBytes("png")));

    expect(result).toEqual({ ok: true, data: { mediaId: MEDIA, previewUrl: null } });
    expect(db.storage.bucket.removes).toEqual([]);
    expect(logged).toEqual(["[media.signed-url] StorageApiError status=400 code=NoSuchKey"]);
  });

  it("si firmar lanza, igual: ok con el mediaId y previewUrl null", async () => {
    const db = installUploadDb();
    db.storage.bucket.signOutcome = new TypeError("fetch failed");

    const result = await uploadWith(fileOf(imageBytes("png")));

    expect(result).toEqual({ ok: true, data: { mediaId: MEDIA, previewUrl: null } });
    expect(db.storage.bucket.removes).toEqual([]);
  });

  it("si ni siquiera se puede crear el cliente para firmar, igual: la ficha ya existe y su id no se pierde", async () => {
    const db = installUploadDb();
    mocks.createClient.mockResolvedValueOnce(db).mockRejectedValueOnce(new Error("sin cookies"));

    const result = await uploadWith(fileOf(imageBytes("png")));

    expect(result).toEqual({ ok: true, data: { mediaId: MEDIA, previewUrl: null } });
    expect(db.storage.bucket.removes).toEqual([]);
    expect(logged).toEqual(["[drills.upload-diagram] Error"]);
  });
});
