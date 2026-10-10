import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ACTION_ERROR_COPY,
  fail,
  fromDbError,
  fromZodError,
  ok,
  type ActionError,
  type ActionResult,
} from "./action-result";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).

/** Los errores de Zod de un `safeParse` que tiene que fallar. */
function zodErrorOf<T extends z.ZodType>(schema: T, input: unknown): z.ZodError {
  const parsed = schema.safeParse(input);
  if (parsed.success) throw new Error("el esquema debía rechazar la entrada");
  return parsed.error;
}

describe("ok y fail", () => {
  it("ok lleva los datos y nada más", () => {
    expect(ok({ id: "a" })).toStrictEqual({ ok: true, data: { id: "a" } });
  });

  it("fail sin errores de campo no deja la clave fieldErrors", () => {
    expect(fail("SAVE_FAILED")).toStrictEqual({ ok: false, error: "SAVE_FAILED" });
  });

  it("fail con errores de campo los incluye", () => {
    expect(fail("INVALID", { title: "Escribe un título." })).toStrictEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Escribe un título." },
    });
  });

  it("el resultado se puede estrechar por `ok`", () => {
    const result: ActionResult<{ id: string }> = ok({ id: "a" });
    if (result.ok) expect(result.data.id).toBe("a");
    else expect.unreachable("debía ser un éxito");
  });
});

describe("ACTION_ERROR_COPY", () => {
  it("tiene el texto del contrato para cada error", () => {
    expect(ACTION_ERROR_COPY).toStrictEqual({
      SAVE_FAILED: "No se pudo guardar. Inténtalo de nuevo.",
      STALE_COPY: "Alguien ha cambiado esto mientras editabas. Recarga para ver la última versión.",
      INVALID: "Revisa los campos marcados.",
      NOT_FOUND: "No encontramos este contenido.",
      SECTION_LIMIT: "Ya hay 99 secciones, el máximo. Reutiliza una que tengas en borrador.",
      SESSION_CLOSED: "Esta sesión ya está cerrada y no se puede cambiar. Duplícala para reutilizarla.",
      GOAL_LIMIT:
        "Este jugador ya tiene 3 objetivos activos. Marca uno como logrado o archívalo para añadir otro.",
      GAME_CLOSED: "Este partido está cancelado y no se puede cambiar.",
      TEMPLATE_LIMIT: "Ya tienes 50 plantillas, el máximo. Borra alguna para guardar otra.",
    });
  });

  it("cada texto es una frase en español sin exclamaciones", () => {
    for (const copy of Object.values(ACTION_ERROR_COPY)) {
      expect(copy).not.toMatch(/[!¡]/);
      expect(copy.endsWith(".")).toBe(true);
    }
  });
});

describe("fromDbError", () => {
  it("P0001 con un mensaje que es un ActionError devuelve ese código", () => {
    expect(fromDbError({ code: "P0001", message: "STALE_COPY" })).toStrictEqual({
      ok: false,
      error: "STALE_COPY",
    });
  });

  it("P0001 con SESSION_CLOSED devuelve SESSION_CLOSED", () => {
    expect(fromDbError({ code: "P0001", message: "SESSION_CLOSED" })).toStrictEqual({
      ok: false,
      error: "SESSION_CLOSED",
    });
  });

  it.each(["GOAL_LIMIT", "GAME_CLOSED"] as const)("P0001 con %s devuelve ese código", (error) => {
    expect(fromDbError({ code: "P0001", message: error })).toStrictEqual({ ok: false, error });
  });

  // Las fases siguientes amplían `ActionError`: el traductor tiene que seguir a la copia
  // de textos sin tocarse. Se recorre la propia tabla en vez de una lista escrita aquí.
  it.each(Object.keys(ACTION_ERROR_COPY) as ActionError[])(
    "P0001 con el mensaje %s devuelve ese mismo error",
    (error) => {
      expect(fromDbError({ code: "P0001", message: error })).toStrictEqual({ ok: false, error });
    },
  );

  it.each([
    ["un texto que no es un ActionError", "OTRA_COSA"],
    ["el mensaje en minúsculas", "stale_copy"],
    ["el código con espacios", " STALE_COPY "],
    ["una clave heredada de Object", "toString"],
    ["texto vacío", ""],
  ])("P0001 con %s es SAVE_FAILED", (_case, message) => {
    expect(fromDbError({ code: "P0001", message })).toStrictEqual({ ok: false, error: "SAVE_FAILED" });
  });

  it("P0001 sin mensaje es SAVE_FAILED", () => {
    expect(fromDbError({ code: "P0001" })).toStrictEqual({ ok: false, error: "SAVE_FAILED" });
  });

  it.each([
    ["P0002", "no encontrado"],
    ["42501", "RLS"],
  ])("%s (%s) es NOT_FOUND", (code) => {
    expect(fromDbError({ code, message: "cualquier texto" })).toStrictEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("23505 es INVALID", () => {
    expect(fromDbError({ code: "23505", message: "duplicate key value" })).toStrictEqual({
      ok: false,
      error: "INVALID",
    });
  });

  it("23505 con el campo único lo marca con su mensaje", () => {
    const unique = { field: "number", message: "Ese número ya está en uso." };

    expect(fromDbError({ code: "23505", message: "duplicate key value" }, unique)).toStrictEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { number: "Ese número ya está en uso." },
    });
  });

  it.each([
    ["23514", "check"],
    ["22023", "parámetro inválido"],
  ])("%s (%s) es INVALID, también si llega un campo único", (code) => {
    const unique = { field: "number", message: "Ese número ya está en uso." };

    expect(fromDbError({ code, message: "cualquier texto" })).toStrictEqual({ ok: false, error: "INVALID" });
    // El campo único solo se marca para una violación de único.
    expect(fromDbError({ code, message: "cualquier texto" }, unique)).toStrictEqual({
      ok: false,
      error: "INVALID",
    });
  });

  it.each([
    ["un código que no se traduce", { code: "XX000", message: "internal error" }],
    ["un código de PostgREST", { code: "PGRST116", message: "no rows" }],
    ["un error de red sin código de base de datos", { message: "fetch failed" }],
    ["un error sin código ni mensaje", {}],
    ["un código vacío", { code: "", message: "" }],
    ["un código en minúsculas", { code: "p0002", message: "NOT_FOUND" }],
  ])("%s es SAVE_FAILED", (_case, error) => {
    expect(fromDbError(error)).toStrictEqual({ ok: false, error: "SAVE_FAILED" });
  });

  it("un campo único no convierte otros errores en INVALID", () => {
    const unique = { field: "number", message: "Ese número ya está en uso." };

    expect(fromDbError({ code: "XX000", message: "internal error" }, unique)).toStrictEqual({
      ok: false,
      error: "SAVE_FAILED",
    });
    expect(fromDbError({ code: "P0002", message: "NOT_FOUND" }, unique)).toStrictEqual({
      ok: false,
      error: "NOT_FOUND",
    });
  });

  it("decide por código y mensaje, nunca por el estado HTTP", () => {
    // PostgREST traduce cada código a un estado distinto; el estado no es parte del contrato.
    const stale = { code: "P0001", message: "STALE_COPY", status: 500 };
    const missing = { code: "P0002", message: "NOT_FOUND", status: 400 };
    const unknown = { code: "XX000", message: "internal error", status: 404 };

    expect(fromDbError(stale)).toStrictEqual({ ok: false, error: "STALE_COPY" });
    expect(fromDbError(missing)).toStrictEqual({ ok: false, error: "NOT_FOUND" });
    expect(fromDbError(unknown)).toStrictEqual({ ok: false, error: "SAVE_FAILED" });
  });

  it("no copia el mensaje de la base de datos al resultado", () => {
    // Los mensajes de la base de datos pueden llevar el contenido de una fila.
    const result = fromDbError({ code: "23505", message: "Key (email)=(ana@club-a.test) already exists" });

    expect(JSON.stringify(result)).not.toContain("club-a.test");
  });
});

describe("fromZodError", () => {
  it("INVALID con el mensaje de cada campo", () => {
    const schema = z.object({ title: z.string().min(1, "Escribe un título.") });

    expect(fromZodError(zodErrorOf(schema, { title: "" }))).toStrictEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Escribe un título." },
    });
  });

  it("con varios mensajes en el mismo campo se queda con el primero", () => {
    const schema = z.object({
      title: z.string().min(3, "Escribe al menos 3 letras.").regex(/^[A-Z]/, "Empieza por mayúscula."),
    });

    const result = fromZodError(zodErrorOf(schema, { title: "a" }));

    expect(result).toStrictEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Escribe al menos 3 letras." },
    });
  });

  it("un campo con el nombre de una propiedad heredada también se recoge", () => {
    const schema = z.object({ constructor: z.string().min(1, "Rellena este campo.") });

    expect(fromZodError(zodErrorOf(schema, { constructor: "" }))).toStrictEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { constructor: "Rellena este campo." },
    });
  });

  it("recoge un mensaje por cada campo con error", () => {
    const schema = z.object({
      title: z.string().min(1, "Escribe un título."),
      summary: z.string().min(1, "Escribe un resumen."),
      sort: z.number("Elige una posición."),
    });

    expect(fromZodError(zodErrorOf(schema, { title: "", summary: "", sort: "dos" }))).toStrictEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: {
        title: "Escribe un título.",
        summary: "Escribe un resumen.",
        sort: "Elige una posición.",
      },
    });
  });

  it("un campo anidado usa la ruta con puntos", () => {
    const schema = z.object({
      section: z.object({ title: z.string().min(1, "Escribe un título.") }),
      points: z.array(z.string().min(1, "Escribe el punto.")),
    });

    expect(fromZodError(zodErrorOf(schema, { section: { title: "" }, points: ["a", ""] }))).toStrictEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { "section.title": "Escribe un título.", "points.1": "Escribe el punto." },
    });
  });

  it("un error de la entrada entera no se asigna a ningún campo", () => {
    const schema = z.object({ title: z.string() });

    // La entrada no es un objeto: no hay campo al que señalar.
    expect(fromZodError(zodErrorOf(schema, "no soy un objeto"))).toStrictEqual({
      ok: false,
      error: "INVALID",
    });
  });

  it("un error de la raíz no pisa ni sustituye al de un campo", () => {
    // Se construye a mano: Zod no suele dar a la vez un error de la raíz y uno de un campo.
    const error = new z.ZodError([
      { code: "custom", path: [], message: "Título y resumen no pueden coincidir." },
      { code: "custom", path: ["title"], message: "Escribe un título." },
    ]);

    expect(fromZodError(error)).toStrictEqual({
      ok: false,
      error: "INVALID",
      fieldErrors: { title: "Escribe un título." },
    });
  });

  it("un error de la raíz de un refine, sin errores de campo, no deja fieldErrors", () => {
    const schema = z
      .object({ title: z.string(), summary: z.string() })
      .refine((value) => value.title !== value.summary, "Título y resumen no pueden coincidir.");

    expect(fromZodError(zodErrorOf(schema, { title: "a", summary: "a" }))).toStrictEqual({
      ok: false,
      error: "INVALID",
    });
  });
});
