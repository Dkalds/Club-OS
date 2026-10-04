import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok, type ActionResult } from "@/lib/action-result";
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

import { mutate, type MutateConfig, type Write } from "./mutate";

// El esqueleto compartido por las Server Actions de todos los módulos. Los tests de cada
// módulo (`methodology/actions.test.ts`, `drills/actions.test.ts`) prueban lo suyo a través de
// él; aquí se fija lo que es de todos y lo que cambia de un módulo a otro: el permiso, la
// etiqueta del log y las rutas que se revalidan. Datos neutros (pnpm check:guards).

function contextWithRole(role: ClubContext["membership"]["role"]): ClubContext {
  return {
    org: { id: "org-a", slug: "club-a", name: "Club A", timezone: "Europe/Madrid" },
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

const schema = z.object({ name: z.string().trim().min(1, "Escribe un nombre.") });

const config: MutateConfig = {
  tag: "demo.save",
  permission: "drill.create",
  routes: ["/c/[club]/(app)/uno", "/c/[club]/(app)/dos"],
};

/** Un `write` que devuelve lo que se le diga y anota con qué lo llamaron. */
function writing<T>(result: ActionResult<T>) {
  return vi.fn<(run: Write<unknown>) => Promise<ActionResult<T>>>(async () => result);
}

/** Un error de PostgREST: un `Error` con su código, y un mensaje que lleva datos de la fila. */
function dbError(code: string, message: string) {
  return Object.assign(new Error(message), { name: "PostgrestError", code });
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
  mocks.createClient.mockResolvedValue({ marker: "db" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("el orden: validar, club, permiso, escribir, revalidar", () => {
  it("una entrada inválida vuelve con sus errores de campo, sin pedir el club ni escribir", async () => {
    const write = writing(ok(null));

    const result = await mutate(config, "club-a", schema, { name: " " }, write);

    expect(result).toEqual({ ok: false, error: "INVALID", fieldErrors: { name: "Escribe un nombre." } });
    expect(mocks.requireClub).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("pregunta por el club que le pasan", async () => {
    await mutate(config, "club-b", schema, { name: "Uno" }, writing(ok(null)));

    expect(mocks.requireClub).toHaveBeenCalledWith("club-b");
  });

  it("un club que no existe lanza el 404, no lo traga", async () => {
    mocks.requireClub.mockRejectedValue(NOT_FOUND);

    await expect(mutate(config, "club-a", schema, { name: "Uno" }, writing(ok(null)))).rejects.toBe(
      NOT_FOUND,
    );

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("la escritura recibe el cliente, el club y la entrada ya validada (recortada)", async () => {
    const write = writing(ok("hecho"));

    const result = await mutate(config, "club-a", schema, { name: "  Uno  ", extra: 1 }, write);

    expect(result).toEqual({ ok: true, data: "hecho" });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toMatchObject({
      db: { marker: "db" },
      ctx: { org: { id: "org-a" } },
      data: { name: "Uno" },
    });
  });
});

describe("el permiso es el de cada acción", () => {
  it("sin el permiso configurado: NOT_FOUND, sin cliente, sin escribir ni revalidar", async () => {
    const write = writing(ok(null));
    // El entrenador puede `drill.create` pero no `drill.publish`.
    mocks.requireClub.mockResolvedValue(contextWithRole("coach"));

    const result = await mutate(
      { ...config, permission: "drill.publish" },
      "club-a",
      schema,
      { name: "Uno" },
      write,
    );

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(logged).toEqual([]);
  });

  it("el mismo rol escribe cuando el permiso configurado se lo da", async () => {
    mocks.requireClub.mockResolvedValue(contextWithRole("coach"));

    const result = await mutate(config, "club-a", schema, { name: "Uno" }, writing(ok(null)));

    expect(result).toEqual({ ok: true, data: null });
  });

  it.each(["player", "guardian"] as const)("un %s no escribe con ninguno de los dos", async (role) => {
    mocks.requireClub.mockResolvedValue(contextWithRole(role));

    for (const permission of ["drill.create", "drill.publish"] as const) {
      const result = await mutate({ ...config, permission }, "club-a", schema, { name: "Uno" }, writing(ok(null)));

      expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    }
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});

describe("tras escribir", () => {
  it("revalida cada ruta configurada, por patrón y layout, en su orden", async () => {
    await mutate(config, "club-a", schema, { name: "Uno" }, writing(ok(null)));

    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/c/[club]/(app)/uno", "layout"],
      ["/c/[club]/(app)/dos", "layout"],
    ]);
  });

  it("no revalida si la escritura devuelve un error", async () => {
    const result = await mutate(config, "club-a", schema, { name: "Uno" }, writing(fail("NOT_FOUND")));

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("errores de la base de datos (fromDb)", () => {
  /** Una escritura que traduce el error que se le dé con el `fromDb` del esqueleto. */
  function failingWith(error: { code?: string; message?: string }, unique?: { field: string; message: string }) {
    return async ({ fromDb }: { fromDb: (e: typeof error, u?: typeof unique) => ActionResult<never> }) =>
      fromDb(error, unique);
  }

  it("un fallo inesperado es SAVE_FAILED y se registra con la etiqueta, sin el contenido de la fila", async () => {
    const error = dbError("XX000", 'fila con "texto del club"');

    const result = await mutate(config, "club-a", schema, { name: "Uno" }, failingWith(error));

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[demo.save] PostgrestError code=XX000"]);
  });

  it("un permiso denegado tras pasar `can` es NOT_FOUND y se registra", async () => {
    const result = await mutate(config, "club-a", schema, { name: "Uno" }, failingWith(dbError("42501", "rls")));

    expect(result).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(logged).toEqual(["[demo.save] PostgrestError code=42501"]);
  });

  it("lo esperado no se registra: copia obsoleta, no encontrado, entrada rechazada, repetido", async () => {
    const codes: Array<[string, string]> = [
      ["P0001", "STALE_COPY"],
      ["P0002", "NOT_FOUND"],
      ["22023", "INVALID"],
      ["23514", "check"],
      ["23505", "duplicate"],
    ];

    const results = [];
    for (const [code, message] of codes) {
      results.push(await mutate(config, "club-a", schema, { name: "Uno" }, failingWith(dbError(code, message))));
    }

    expect(results.map((result) => (result.ok ? "ok" : result.error))).toEqual([
      "STALE_COPY",
      "NOT_FOUND",
      "INVALID",
      "INVALID",
      "INVALID",
    ]);
    expect(logged).toEqual([]);
  });

  it("un duplicado señala el campo que dice quien escribe", async () => {
    const unique = { field: "name", message: "Ese nombre ya existe." };

    const result = await mutate(
      config,
      "club-a",
      schema,
      { name: "Uno" },
      failingWith(dbError("23505", "duplicate"), unique),
    );

    expect(result).toEqual({ ok: false, error: "INVALID", fieldErrors: { name: "Ese nombre ya existe." } });
  });
});

// Las altas que leen la lista del club para calcular un número o un slug y después insertan:
// otra alta puede colarse entre las dos. El esqueleto repite el intento entero; lo que cada
// módulo calcula en él lo prueban sus tests (`methodology/actions.test.ts`).
describe("altas que chocan con otra (retryOnConflict)", () => {
  const clash = dbError("23505", "duplicate key value violates unique constraint");

  /** Una escritura que es un alta con reintento: cada intento devuelve lo siguiente de `outcomes`. */
  function creating<T>(...outcomes: Array<{ result: ActionResult<T> } | { conflict: typeof clash }>) {
    const attempt = vi.fn(async () => {
      const outcome = outcomes.shift();
      if (outcome === undefined) throw new Error("un intento de más");
      return outcome;
    });
    const write = ({ retryOnConflict }: Write<unknown>) => retryOnConflict(attempt);
    return { attempt, write };
  }

  it("sin choque, un solo intento y su resultado", async () => {
    const { attempt, write } = creating({ result: ok({ id: "uno" }) });

    const result = await mutate(config, "club-a", schema, { name: "Uno" }, write);

    expect(result).toEqual({ ok: true, data: { id: "uno" } });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("si otra alta se adelanta, repite el intento entero y vuelve con su resultado, sin registrar", async () => {
    const { attempt, write } = creating({ conflict: clash }, { result: ok({ id: "dos" }) });

    const result = await mutate(config, "club-a", schema, { name: "Uno" }, write);

    expect(result).toEqual({ ok: true, data: { id: "dos" } });
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(config.routes.length);
  });

  it("un intento que devuelve un error no se repite", async () => {
    const { attempt, write } = creating({ result: fail("INVALID", { name: "Ese nombre ya existe." }) });

    const result = await mutate(config, "club-a", schema, { name: "Uno" }, write);

    expect(result).toEqual({ ok: false, error: "INVALID", fieldErrors: { name: "Ese nombre ya existe." } });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("si el choque se repite tres veces lo deja: SAVE_FAILED, registrado con la etiqueta, sin revalidar", async () => {
    const { attempt, write } = creating({ conflict: clash }, { conflict: clash }, { conflict: clash });

    const result = await mutate(config, "club-a", schema, { name: "Uno" }, write);

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(logged).toEqual(["[demo.save] PostgrestError code=23505"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un intento que lanza corta los reintentos: SAVE_FAILED, como cualquier escritura que lanza", async () => {
    const attempt = vi.fn(async (): Promise<{ result: ActionResult<null> }> => {
      throw new TypeError("fetch failed");
    });

    const result = await mutate(config, "club-a", schema, { name: "Uno" }, ({ retryOnConflict }) =>
      retryOnConflict(attempt),
    );

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(logged).toEqual(["[demo.save] TypeError"]);
  });
});

describe("una escritura que lanza", () => {
  it("se registra con la etiqueta y vuelve como SAVE_FAILED, sin revalidar", async () => {
    mocks.createClient.mockRejectedValue(new TypeError("fetch failed"));

    const result = await mutate(config, "club-a", schema, { name: "Uno" }, writing(ok(null)));

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(logged).toEqual(["[demo.save] TypeError"]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  // `notFound()` y `redirect()` funcionan lanzando: si el esqueleto los tragara como un fallo
  // cualquiera, la página no daría su 404 ni redirigiría, y quedaría un SAVE_FAILED.
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

    await expect(
      mutate(config, "club-a", schema, { name: "Uno" }, async () => {
        throw thrown;
      }),
    ).rejects.toBe(thrown);

    expect(logged).toEqual([]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
