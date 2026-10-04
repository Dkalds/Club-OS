import { notFound, redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { PLATFORM_BRAND_COLORS } from "@/modules/tenancy/branding";
import type { ClubContext } from "@/modules/tenancy/queries";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireClub: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/guards", () => ({ requireClub: mocks.requireClub }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { createMutate, UNIQUE_VIOLATION, type DbError, type Write } from "./mutate";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
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

/** El cliente de la base de datos: la escritura solo lo recibe, aquí no se usa. */
const DB = { from: "un cliente de pega" };

const ROUTES = ["/c/[club]/uno", "/c/[club]/dos"] as const;
const schema = z.object({ title: z.string().trim().min(1, "Escribe un título.") });

// `way.manage` es de administración y `practice.manage` también del entrenador: así se ve que
// el permiso es el que se pasa a `createMutate`, no uno fijo.
const mutate = createMutate({ module: "sample", permission: "way.manage", revalidate: ROUTES });
const mutateAsCoach = createMutate({
  module: "sample",
  permission: "practice.manage",
  revalidate: ROUTES,
});

const INPUT = { title: "Hola" };

/** Lanza `mutate` con la escritura dada: lo único que cambia de un test a otro. */
function run<T>(write: (run: Write<{ title: string }>) => Promise<ActionResult<T>>, input: unknown = INPUT) {
  return mutate("do-thing", "club-a", schema, input, write);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireClub.mockResolvedValue(contextWithRole("admin"));
  mocks.createClient.mockResolvedValue(DB);
});

describe("createMutate: validar y autorizar", () => {
  it("una entrada inválida es INVALID con su campo, sin pedir el club ni crear el cliente", async () => {
    const write = vi.fn();

    const result = await run(write, { title: "   " });

    expect(result).toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Escribe un título." },
    });
    expect(mocks.requireClub).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["coach", "player", "guardian"] as const)(
    "sin permiso (%s) es NOT_FOUND, sin crear el cliente ni escribir",
    async (role) => {
      mocks.requireClub.mockResolvedValue(contextWithRole(role));
      const write = vi.fn();

      await expect(run(write)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });

      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.logError).not.toHaveBeenCalled();
    },
  );

  it("el permiso es el de createMutate: un entrenador gestiona sesiones y no la metodología", async () => {
    mocks.requireClub.mockResolvedValue(contextWithRole("coach"));

    const allowed = await mutateAsCoach("do-thing", "club-a", schema, INPUT, async () => ok(null));
    const denied = await run(async () => ok(null));

    expect(allowed).toEqual({ ok: true, data: null });
    expect(denied).toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("pide el club de la URL", async () => {
    await run(async () => ok(null));

    expect(mocks.requireClub).toHaveBeenCalledWith("club-a");
  });

  it("un club que no existe lanza el 404, no lo traga", async () => {
    mocks.requireClub.mockRejectedValue(NOT_FOUND);
    const write = vi.fn();

    await expect(run(write)).rejects.toBe(NOT_FOUND);

    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(mocks.logError).not.toHaveBeenCalled();
  });
});

describe("createMutate: escribir", () => {
  it("la escritura recibe el cliente, el contexto y la entrada que deja Zod", async () => {
    const write = vi.fn(async () => ok(null));

    await run(write, { title: "  Hola  " });

    expect(write).toHaveBeenCalledTimes(1);
    const received = (write.mock.calls[0] as unknown as [Write<{ title: string }>])[0];
    expect(received.db).toBe(DB);
    expect(received.ctx).toEqual(contextWithRole("admin"));
    expect(received.data).toEqual({ title: "Hola" });
  });

  it("devuelve tal cual lo que devuelve la escritura", async () => {
    await expect(run(async () => ok({ id: "uno" }))).resolves.toEqual({
      ok: true,
      data: { id: "uno" },
    });
    await expect(run(async () => fail("STALE_COPY"))).resolves.toEqual({
      ok: false,
      error: "STALE_COPY",
    });
  });

  it("una escritura que lanza es SAVE_FAILED y se registra con módulo.nombre", async () => {
    const boom = new TypeError("fetch failed");

    const result = await run(async () => {
      throw boom;
    });

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith("sample.do-thing", boom);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("un cliente que no se puede crear es SAVE_FAILED, no una excepción", async () => {
    const boom = new TypeError("fetch failed");
    mocks.createClient.mockRejectedValue(boom);
    const write = vi.fn();

    await expect(run(write)).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });

    expect(write).not.toHaveBeenCalled();
    expect(mocks.logError).toHaveBeenCalledWith("sample.do-thing", boom);
  });

  // `notFound()` y `redirect()` funcionan lanzando: si se tragaran como un fallo cualquiera, la
  // página no daría su 404 ni redirigiría, y quedaría un SAVE_FAILED.
  it.each([
    ["notFound()", () => notFound()],
    ["redirect()", () => redirect("/select-club")],
  ])("lo que lanza %s dentro de la escritura se relanza, sin registrarlo", async (_, control) => {
    const thrown = (() => {
      try {
        control();
      } catch (error) {
        return error;
      }
      throw new Error("el control de flujo de Next tenía que lanzar");
    })();

    await expect(
      run(async () => {
        throw thrown;
      }),
    ).rejects.toBe(thrown);

    expect(mocks.logError).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("createMutate: revalidar", () => {
  it("con ok revalida cada ruta con 'layout', en el orden dado", async () => {
    await run(async () => ok(null));

    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/c/[club]/uno", "layout"],
      ["/c/[club]/dos", "layout"],
    ]);
  });

  it("con un fallo no revalida ninguna", async () => {
    await run(async () => fail("NOT_FOUND"));

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalida las rutas de cada createMutate, no las de otro", async () => {
    const other = createMutate({ module: "other", permission: "way.manage", revalidate: ["/c/[club]/tres"] });

    await other("do-thing", "club-a", schema, INPUT, async () => ok(null));

    expect(mocks.revalidatePath.mock.calls).toEqual([["/c/[club]/tres", "layout"]]);
  });
});

describe("fromDb", () => {
  /** Lanza `fromDb` con el error dado y devuelve su resultado. */
  function translate(error: DbError, unique?: { field: string; message: string }) {
    return run(async ({ fromDb }) => fromDb(error, unique));
  }

  it("traduce con fromDbError: copia obsoleta, no encontrado, entrada rechazada, sin rastro", async () => {
    const unique = { field: "number", message: "Ese número ya está en uso." };

    await expect(translate({ code: "P0001", message: "STALE_COPY" })).resolves.toEqual({
      ok: false,
      error: "STALE_COPY",
    });
    await expect(translate({ code: "P0002", message: "x" })).resolves.toEqual({
      ok: false,
      error: "NOT_FOUND",
    });
    await expect(translate({ code: UNIQUE_VIOLATION, message: "x" }, unique)).resolves.toEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { number: "Ese número ya está en uso." },
    });
    await expect(translate({ code: "23514", message: "x" })).resolves.toEqual({
      ok: false,
      error: "INVALID",
    });
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("un error inesperado es SAVE_FAILED y se registra", async () => {
    const error = { code: "XX000", message: "internal error" };

    await expect(translate(error)).resolves.toEqual({ ok: false, error: "SAVE_FAILED" });

    expect(mocks.logError).toHaveBeenCalledWith("sample.do-thing", error);
  });

  it("un 42501 es NOT_FOUND pero se registra: tras pasar `can` es un permiso de esquema roto", async () => {
    const error = { code: "42501", message: "permission denied" };

    await expect(translate(error)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });

    expect(mocks.logError).toHaveBeenCalledWith("sample.do-thing", error);
  });
});

describe("retryOnConflict", () => {
  const conflict: DbError = { code: UNIQUE_VIOLATION, message: "duplicate key value" };

  it("sin choque devuelve el resultado del primer intento", async () => {
    const attempt = vi.fn(async () => ({ result: ok({ id: "uno" }) }));

    const result = await run(({ retryOnConflict }) => retryOnConflict(attempt));

    expect(result).toEqual({ ok: true, data: { id: "uno" } });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("tras un choque repite el intento entero y devuelve el del siguiente", async () => {
    const attempt = vi
      .fn<() => Promise<{ result: ActionResult<{ id: string }> } | { conflict: DbError }>>()
      .mockResolvedValueOnce({ conflict })
      .mockResolvedValueOnce({ result: ok({ id: "dos" }) });

    const result = await run(({ retryOnConflict }) => retryOnConflict(attempt));

    expect(result).toEqual({ ok: true, data: { id: "dos" } });
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("un intento que da un resultado de fallo lo devuelve sin repetir", async () => {
    const attempt = vi.fn(async () => ({ result: fail("SECTION_LIMIT") }));

    const result = await run(({ retryOnConflict }) => retryOnConflict(attempt));

    expect(result).toEqual({ ok: false, error: "SECTION_LIMIT" });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("si choca tres veces ya no es una carrera: SAVE_FAILED, registrado y sin revalidar", async () => {
    const attempt = vi.fn(async () => ({ conflict }));

    const result = await run(({ retryOnConflict }) => retryOnConflict(attempt));

    expect(result).toEqual({ ok: false, error: "SAVE_FAILED" });
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith("sample.do-thing", conflict);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
