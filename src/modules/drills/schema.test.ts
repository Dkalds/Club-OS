import { describe, expect, it } from "vitest";
import { fromZodError } from "@/lib/action-result";
import { DIAGRAM_ERROR } from "@/modules/media/diagram-file";
import { diagramUploadSchema, drillInputSchema, updateDrillSchema, VIDEO_URL_RE, type DrillInput } from "./schema";

// Lo que valida la entrada de las acciones de ejercicios, con los mensajes que ve la persona
// (`fieldErrors`). Los límites son los CHECK de `20261103000100_drills.sql` y las claves de
// `save_drill`: lo que pasa por aquí no puede llegar a la base de datos como un error sin campo
// al que señalar. Datos neutros (pnpm check:guards).

const F1 = "00000000-0000-4000-8000-0000000000f1";
const F2 = "00000000-0000-4000-8000-0000000000f2";
const P1 = "00000000-0000-4000-8000-0000000000a1";
const S1 = "00000000-0000-4000-8000-0000000000b1";
const MEDIA = "00000000-0000-4000-8000-0000000000c1";
const DRILL = "00000000-0000-4000-8000-0000000000d1";
const STAMP = "2026-10-03T10:00:00.123456+00:00";

const VALID: DrillInput = {
  title: "Rebote y salida",
  summary: "Un resumen corto.",
  objective: "Asegurar el rebote.",
  setupMd: "Cinco jugadores en la pintura.",
  minPlayers: 6,
  maxPlayers: 12,
  minMinutes: 10,
  maxMinutes: 15,
  minAge: 12,
  maxAge: null,
  equipment: ["Balones", "Conos"],
  videoUrl: "https://youtu.be/abc123",
  diagramMediaId: null,
  coachingPoints: [
    { text: "Bloquea antes de ir al balón.", isKey: true },
    { text: "Cabeza arriba.", isKey: false },
  ],
  variants: [{ title: "Con un defensor más", description: "Entra un cuarto defensor." }],
  focusAreaIds: [F1],
  principleIds: [P1],
  standardIds: [S1],
};

/** Una entrada que el tipo no deja escribir: lo que mandaría un cliente manipulado. */
function drill(overrides: Record<string, unknown> = {}): unknown {
  return { ...VALID, ...overrides };
}

/** Los errores de campo de una entrada; `null` si es válida. */
function errorsOf(input: unknown, schema: typeof drillInputSchema | typeof updateDrillSchema = drillInputSchema) {
  const parsed = schema.safeParse(input);
  if (parsed.success) return null;
  const result = fromZodError(parsed.error);
  return result.ok ? null : result.fieldErrors;
}

const TITLE = "Escribe un título de 3 a 80 caracteres.";
const PLAYERS_RANGE = "Elige entre 1 y 40 jugadores.";
const PLAYERS_ORDER = "El máximo de jugadores no puede ser menor que el mínimo.";
const MINUTES_RANGE = "Elige entre 1 y 120 minutos.";
const MINUTES_ORDER = "La duración máxima no puede ser menor que la mínima.";
const AGE_RANGE = "Elige una edad entre 8 y 18.";
const AGE_ORDER = "La edad máxima no puede ser menor que la mínima.";
const FOCUS = "Elige al menos un objetivo.";
const KEY_POINTS = "Marca como clave 3 puntos como máximo.";
const POINT_EMPTY = "Escribe el punto o quítalo.";
const SETUP = "La organización admite hasta 5000 caracteres.";
const VIDEO = "Pega un enlace de YouTube o Vimeo que empiece por https://.";
const NOT_FOUND = "No encontramos este contenido.";

describe("una entrada válida", () => {
  it("pasa tal cual", () => {
    expect(errorsOf(VALID)).toBeNull();
    expect(drillInputSchema.parse(VALID)).toEqual(VALID);
  });

  it("con todo lo opcional vacío o ausente (null) también", () => {
    const minimal = drill({
      summary: null,
      objective: null,
      setupMd: null,
      videoUrl: null,
      equipment: [],
      coachingPoints: [],
      variants: [],
      principleIds: [],
      standardIds: [],
    });

    expect(errorsOf(minimal)).toBeNull();
  });

  it("recorta los textos", () => {
    const parsed = drillInputSchema.parse(
      drill({
        title: "  Rebote y salida  ",
        summary: " Resumen. ",
        objective: " Objetivo. ",
        setupMd: " Organización. ",
        videoUrl: " https://youtu.be/abc123 ",
        coachingPoints: [{ text: "  Cabeza arriba.  ", isKey: false }],
        variants: [{ title: " Variante ", description: " Texto. " }],
      }),
    );

    expect(parsed).toMatchObject({
      title: "Rebote y salida",
      summary: "Resumen.",
      objective: "Objetivo.",
      setupMd: "Organización.",
      videoUrl: "https://youtu.be/abc123",
      coachingPoints: [{ text: "Cabeza arriba.", isKey: false }],
      variants: [{ title: "Variante", description: "Texto." }],
    });
  });

  it("un texto opcional vacío o en blanco se guarda como null, nunca como texto vacío", () => {
    const parsed = drillInputSchema.parse(
      drill({
        summary: "",
        objective: "   ",
        setupMd: "",
        videoUrl: "  ",
        variants: [{ title: "Variante", description: "" }],
      }),
    );

    expect(parsed.summary).toBeNull();
    expect(parsed.objective).toBeNull();
    expect(parsed.setupMd).toBeNull();
    expect(parsed.videoUrl).toBeNull();
    expect(parsed.variants).toEqual([{ title: "Variante", description: null }]);
  });

  it("no deja pasar lo que no es del formulario: estado, autor, club, fechas, id", () => {
    const parsed = drillInputSchema.parse(
      drill({
        id: DRILL,
        status: "published",
        createdBy: "00000000-0000-4000-8000-0000000000e1",
        created_by: "00000000-0000-4000-8000-0000000000e1",
        organizationId: "otro",
        organization_id: "otro",
        updatedAt: STAMP,
        createdByMe: true,
        diagramUrl: "https://x.test/y.png",
      }),
    );

    expect(Object.keys(parsed).sort()).toEqual(Object.keys(VALID).sort());
  });
});

describe("título", () => {
  it.each(["", "   ", "ab", " a ", "a".repeat(81)])("«%s» no vale", (title) => {
    expect(errorsOf(drill({ title }))).toEqual({ title: TITLE });
  });

  it("ausente o null no vale", () => {
    expect(errorsOf(drill({ title: null }))).toEqual({ title: TITLE });
    expect(errorsOf(drill({ title: undefined }))).toEqual({ title: TITLE });
  });

  it.each(["abc", "a".repeat(80)])("%s (3 u 80 caracteres) vale", (title) => {
    expect(errorsOf(drill({ title }))).toBeNull();
  });
});

describe("resumen, objetivo y organización", () => {
  it("el resumen admite 200 caracteres, no 201", () => {
    expect(errorsOf(drill({ summary: "a".repeat(200) }))).toBeNull();
    expect(errorsOf(drill({ summary: "a".repeat(201) }))).toEqual({
      summary: "El resumen admite hasta 200 caracteres.",
    });
  });

  it("el objetivo admite 500 caracteres, no 501", () => {
    expect(errorsOf(drill({ objective: "a".repeat(500) }))).toBeNull();
    expect(errorsOf(drill({ objective: "a".repeat(501) }))).toEqual({
      objective: "El objetivo admite hasta 500 caracteres.",
    });
  });

  it("la organización admite 5000 caracteres, no 5001", () => {
    expect(errorsOf(drill({ setupMd: "a".repeat(5000) }))).toBeNull();
    expect(errorsOf(drill({ setupMd: "a".repeat(5001) }))).toEqual({ setupMd: SETUP });
  });
});

describe("jugadores", () => {
  it.each([0, 41, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "6", null, undefined])(
    "minPlayers %s no vale",
    (minPlayers) => {
      expect(errorsOf(drill({ minPlayers }))).toMatchObject({ minPlayers: PLAYERS_RANGE });
    },
  );

  it.each([0, 41, 1.5, Number.NaN, "12", null, undefined])("maxPlayers %s no vale", (maxPlayers) => {
    expect(errorsOf(drill({ maxPlayers }))).toEqual({ maxPlayers: PLAYERS_RANGE });
  });

  it("el máximo menor que el mínimo señala el máximo", () => {
    expect(errorsOf(drill({ minPlayers: 8, maxPlayers: 4 }))).toEqual({ maxPlayers: PLAYERS_ORDER });
  });

  it("los extremos valen: de 1 a 40, y mínimo igual a máximo", () => {
    expect(errorsOf(drill({ minPlayers: 1, maxPlayers: 40 }))).toBeNull();
    expect(errorsOf(drill({ minPlayers: 6, maxPlayers: 6 }))).toBeNull();
  });
});

describe("duración", () => {
  it.each([0, 121, -5, 1.5, Number.NaN, "10", null, undefined])("minMinutes %s no vale", (minMinutes) => {
    expect(errorsOf(drill({ minMinutes }))).toMatchObject({ minMinutes: MINUTES_RANGE });
  });

  it.each([0, 121, 1.5, Number.NaN, "15", null, undefined])("maxMinutes %s no vale", (maxMinutes) => {
    expect(errorsOf(drill({ maxMinutes }))).toEqual({ maxMinutes: MINUTES_RANGE });
  });

  it("la duración máxima menor que la mínima señala el máximo", () => {
    expect(errorsOf(drill({ minMinutes: 20, maxMinutes: 10 }))).toEqual({ maxMinutes: MINUTES_ORDER });
  });

  it("los extremos valen: de 1 a 120, y mínimo igual a máximo", () => {
    expect(errorsOf(drill({ minMinutes: 1, maxMinutes: 120 }))).toBeNull();
    expect(errorsOf(drill({ minMinutes: 15, maxMinutes: 15 }))).toBeNull();
  });
});

describe("edad", () => {
  it.each([7, 19, 12.5, Number.NaN, "12", null, undefined])("minAge %s no vale", (minAge) => {
    expect(errorsOf(drill({ minAge }))).toMatchObject({ minAge: AGE_RANGE });
  });

  it.each([7, 19, 12.5, Number.NaN, "14", undefined])("maxAge %s no vale", (maxAge) => {
    expect(errorsOf(drill({ maxAge }))).toEqual({ maxAge: AGE_RANGE });
  });

  it("la edad máxima menor que la mínima señala la máxima", () => {
    expect(errorsOf(drill({ minAge: 14, maxAge: 10 }))).toEqual({ maxAge: AGE_ORDER });
  });

  it("sin edad máxima (null) vale; de 8 a 18, e igual a la mínima, también", () => {
    expect(errorsOf(drill({ maxAge: null }))).toBeNull();
    expect(errorsOf(drill({ minAge: 8, maxAge: 18 }))).toBeNull();
    expect(errorsOf(drill({ minAge: 12, maxAge: 12 }))).toBeNull();
  });
});

describe("material", () => {
  it("hasta 12 elementos; 13 no", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `Material ${i + 1}`);

    expect(errorsOf(drill({ equipment: twelve }))).toBeNull();
    expect(errorsOf(drill({ equipment: [...twelve, "Uno más"] }))).toEqual({
      equipment: "El material admite hasta 12 elementos.",
    });
  });

  it("recorta cada elemento y quita los vacíos, que no cuentan", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `Material ${i + 1}`);

    const parsed = drillInputSchema.parse(drill({ equipment: [" Balones ", "", "  ", ...twelve.slice(1)] }));

    expect(parsed.equipment).toEqual(["Balones", ...twelve.slice(1)]);
  });

  it("un elemento que no es texto no vale", () => {
    expect(errorsOf(drill({ equipment: ["Balones", null] }))).not.toBeNull();
    expect(errorsOf(drill({ equipment: "Balones" }))).not.toBeNull();
  });
});

describe("vídeo", () => {
  it.each([
    "https://youtube.com/watch?v=abc",
    "https://www.youtube.com/watch?v=abc",
    "https://m.youtube.com/watch?v=abc",
    "https://youtu.be/abc",
    "https://vimeo.com/123456",
    "https://www.vimeo.com/123456",
  ])("%s vale", (videoUrl) => {
    expect(errorsOf(drill({ videoUrl }))).toBeNull();
  });

  it.each([
    "https://youtube.com.evil.com/x",
    "https://example.com/v",
    "http://youtube.com/watch?v=abc",
    "https://evil.com/?u=https://youtube.com/x",
    "https://youtube.com",
    "https://youtube.com/with space",
    "ftp://youtube.com/x",
    "youtube.com/watch?v=abc",
    "https://player.vimeo.com/video/1",
  ])("«%s» no vale", (videoUrl) => {
    expect(errorsOf(drill({ videoUrl }))).toEqual({ videoUrl: VIDEO });
  });

  it("300 caracteres valen; 301 no", () => {
    const base = "https://youtu.be/";

    expect(errorsOf(drill({ videoUrl: base + "a".repeat(300 - base.length) }))).toBeNull();
    expect(errorsOf(drill({ videoUrl: base + "a".repeat(301 - base.length) }))).toEqual({ videoUrl: VIDEO });
  });

  it("VIDEO_URL_RE es el patrón de la base de datos", () => {
    expect(VIDEO_URL_RE.source).toBe("^https:\\/\\/((www|m)\\.)?(youtube\\.com|youtu\\.be|vimeo\\.com)\\/\\S*$");
    expect(VIDEO_URL_RE.test("https://youtu.be/abc")).toBe(true);
    expect(VIDEO_URL_RE.test("https://youtube.com.evil.com/x")).toBe(false);
  });
});

describe("diagrama", () => {
  it("la clave es obligatoria: ausente quitaría el diagrama al guardar", () => {
    const { diagramMediaId: _omitted, ...withoutDiagram } = VALID;
    void _omitted;

    expect(errorsOf(withoutDiagram)).not.toBeNull();
    expect(errorsOf(drill({ diagramMediaId: undefined }))).toHaveProperty("diagramMediaId");
  });

  it("vale un uuid o null", () => {
    expect(errorsOf(drill({ diagramMediaId: MEDIA }))).toBeNull();
    expect(errorsOf(drill({ diagramMediaId: null }))).toBeNull();
  });

  it.each(["", "no-es-un-uuid", 12, "00000000-0000-4000-8000-00000000000"])("«%s» no vale", (diagramMediaId) => {
    expect(errorsOf(drill({ diagramMediaId }))).toHaveProperty("diagramMediaId");
  });
});

describe("objetivos, principios y Standards", () => {
  it("al menos un objetivo", () => {
    expect(errorsOf(drill({ focusAreaIds: [] }))).toEqual({ focusAreaIds: FOCUS });
    expect(errorsOf(drill({ focusAreaIds: undefined }))).toEqual({ focusAreaIds: FOCUS });
    expect(errorsOf(drill({ focusAreaIds: [F1, F2] }))).toBeNull();
  });

  it("principios y Standards pueden ir vacíos, pero la lista es obligatoria", () => {
    expect(errorsOf(drill({ principleIds: [], standardIds: [] }))).toBeNull();
    expect(errorsOf(drill({ principleIds: undefined }))).toHaveProperty("principleIds");
    expect(errorsOf(drill({ standardIds: null }))).toHaveProperty("standardIds");
  });

  it("cada id es un uuid: lo demás no llegaría a la base de datos", () => {
    expect(errorsOf(drill({ focusAreaIds: [F1, "no-es-un-uuid"] }))).toEqual({ "focusAreaIds.1": NOT_FOUND });
    expect(errorsOf(drill({ principleIds: ["x"] }))).toEqual({ "principleIds.0": NOT_FOUND });
    expect(Object.keys(errorsOf(drill({ standardIds: [S1, 7] })) ?? {})).toEqual(["standardIds.1"]);
  });
});

describe("puntos de coaching", () => {
  const point = (text: string, isKey = false) => ({ text, isKey });

  it("hasta 8 puntos, hasta 3 clave", () => {
    const eight = Array.from({ length: 8 }, (_, i) => point(`Punto ${i + 1}`, i < 3));

    expect(errorsOf(drill({ coachingPoints: eight }))).toBeNull();
  });

  it("4 puntos clave: «Marca como clave 3 puntos como máximo.»", () => {
    const four = Array.from({ length: 4 }, (_, i) => point(`Punto ${i + 1}`, true));

    expect(errorsOf(drill({ coachingPoints: four }))).toEqual({ coachingPoints: KEY_POINTS });
  });

  it("9 puntos", () => {
    const nine = Array.from({ length: 9 }, (_, i) => point(`Punto ${i + 1}`));

    expect(errorsOf(drill({ coachingPoints: nine }))).toEqual({
      coachingPoints: "Un ejercicio admite hasta 8 puntos.",
    });
  });

  it.each(["", "   "])("un punto con el texto «%s»: «Escribe el punto o quítalo.»", (text) => {
    expect(errorsOf(drill({ coachingPoints: [point("Uno"), point(text)] }))).toEqual({
      coachingPoints: POINT_EMPTY,
    });
  });

  it("un punto de 140 caracteres vale; de 141 no", () => {
    expect(errorsOf(drill({ coachingPoints: [point("a".repeat(140))] }))).toBeNull();
    expect(errorsOf(drill({ coachingPoints: [point("a".repeat(141))] }))).toEqual({
      coachingPoints: "Cada punto admite hasta 140 caracteres.",
    });
  });

  it("el conmutador de clave tiene que ser un booleano", () => {
    expect(errorsOf(drill({ coachingPoints: [{ text: "Uno", isKey: "sí" }] }))).not.toBeNull();
    expect(errorsOf(drill({ coachingPoints: [{ text: "Uno" }] }))).not.toBeNull();
  });

  it("conserva el orden", () => {
    const parsed = drillInputSchema.parse(drill({ coachingPoints: [point("B"), point("A"), point("C")] }));

    expect(parsed.coachingPoints.map((p) => p.text)).toEqual(["B", "A", "C"]);
  });
});

describe("variantes", () => {
  const variant = (title: string, description: string | null = null) => ({ title, description });

  it("hasta 5 variantes; 6 no", () => {
    const five = Array.from({ length: 5 }, (_, i) => variant(`Variante ${i + 1}`));

    expect(errorsOf(drill({ variants: five }))).toBeNull();
    expect(errorsOf(drill({ variants: [...five, variant("Otra")] }))).toEqual({
      variants: "Un ejercicio admite hasta 5 variantes.",
    });
  });

  it.each(["", "  "])("una variante con el título «%s»", (title) => {
    expect(errorsOf(drill({ variants: [variant(title)] }))).toEqual({
      variants: "Escribe el título de la variante o quítala.",
    });
  });

  it("título de 80 caracteres vale; de 81 no", () => {
    expect(errorsOf(drill({ variants: [variant("a".repeat(80))] }))).toBeNull();
    expect(errorsOf(drill({ variants: [variant("a".repeat(81))] }))).toEqual({
      variants: "El título de la variante admite hasta 80 caracteres.",
    });
  });

  it("descripción de 500 caracteres vale; de 501 no", () => {
    expect(errorsOf(drill({ variants: [variant("Variante", "a".repeat(500))] }))).toBeNull();
    expect(errorsOf(drill({ variants: [variant("Variante", "a".repeat(501))] }))).toEqual({
      variants: "La descripción de la variante admite hasta 500 caracteres.",
    });
  });
});

// Un error en una lista no esconde los de orden (máximo menor que mínimo): quien arregla la
// lista y vuelve a enviar no debería descubrir entonces un segundo error que ya estaba.
describe("un error en una lista no esconde los errores de orden", () => {
  const fourKeys = Array.from({ length: 4 }, (_, i) => ({ text: `Punto ${i + 1}`, isKey: true }));
  const reversed = { minPlayers: 8, maxPlayers: 4, minMinutes: 20, maxMinutes: 10, minAge: 14, maxAge: 10 };

  it("puntos de coaching con 4 clave y jugadores al revés: los dos", () => {
    expect(errorsOf(drill({ coachingPoints: fourKeys, minPlayers: 8, maxPlayers: 4 }))).toEqual({
      coachingPoints: KEY_POINTS,
      maxPlayers: PLAYERS_ORDER,
    });
  });

  it("un punto vacío con minutos y edad al revés: los tres", () => {
    const errors = errorsOf(
      drill({
        coachingPoints: [{ text: "", isKey: false }],
        minMinutes: 20,
        maxMinutes: 10,
        minAge: 14,
        maxAge: 10,
      }),
    );

    expect(errors).toEqual({ coachingPoints: POINT_EMPTY, maxMinutes: MINUTES_ORDER, maxAge: AGE_ORDER });
  });

  it("una variante sin título con jugadores al revés: los dos", () => {
    expect(
      errorsOf(drill({ variants: [{ title: "", description: null }], minPlayers: 8, maxPlayers: 4 })),
    ).toEqual({ variants: "Escribe el título de la variante o quítala.", maxPlayers: PLAYERS_ORDER });
  });

  it("las dos listas mal y los tres rangos al revés: las cinco claves", () => {
    const errors = errorsOf(
      drill({ coachingPoints: fourKeys, variants: [{ title: "", description: null }], ...reversed }),
    );

    expect(errors).toEqual({
      coachingPoints: KEY_POINTS,
      variants: "Escribe el título de la variante o quítala.",
      maxPlayers: PLAYERS_ORDER,
      maxMinutes: MINUTES_ORDER,
      maxAge: AGE_ORDER,
    });
  });

  it("al editar también", () => {
    const errors = errorsOf(
      { drillId: DRILL, expectedUpdatedAt: STAMP, drill: { ...VALID, coachingPoints: fourKeys, ...reversed } },
      updateDrillSchema,
    );

    expect(errors).toEqual({
      coachingPoints: KEY_POINTS,
      maxPlayers: PLAYERS_ORDER,
      maxMinutes: MINUTES_ORDER,
      maxAge: AGE_ORDER,
    });
  });

  it("un tipo mal (no un número) sigue ahorrando la comparación de ese par", () => {
    // `minPlayers` no es un número: se enseña su error, no una comparación sin sentido.
    const errors = errorsOf(drill({ coachingPoints: fourKeys, minPlayers: "8", maxPlayers: 4 }));

    expect(errors).toEqual({ coachingPoints: KEY_POINTS, minPlayers: PLAYERS_RANGE });
  });
});

describe("updateDrillSchema", () => {
  const update = (overrides: Record<string, unknown> = {}) => ({
    drillId: DRILL,
    expectedUpdatedAt: STAMP,
    drill: VALID,
    ...overrides,
  });

  it("separa la entrada en ejercicio, id y copia esperada, y la copia viaja intacta", () => {
    const parsed = updateDrillSchema.parse(update());

    expect(parsed.drillId).toBe(DRILL);
    expect(parsed.expectedUpdatedAt).toBe("2026-10-03T10:00:00.123456+00:00");
    expect(parsed.title).toBe(VALID.title);
    expect(parsed.diagramMediaId).toBeNull();
  });

  it("los errores de campo llevan las mismas claves que al crear, sin prefijo «drill.»", () => {
    const errors = errorsOf(update({ drill: { ...VALID, maxPlayers: 2, title: "" } }), updateDrillSchema);

    expect(errors).toEqual({ title: TITLE, maxPlayers: PLAYERS_ORDER });
  });

  it("el id del ejercicio es un uuid", () => {
    expect(errorsOf(update({ drillId: "no-es-un-uuid" }), updateDrillSchema)).toEqual({ drillId: NOT_FOUND });
    expect(errorsOf(update({ drillId: "" }), updateDrillSchema)).toHaveProperty("drillId");
    expect(errorsOf(update({ drillId: undefined }), updateDrillSchema)).toHaveProperty("drillId");
  });

  it.each(["", undefined, null, 12])("la copia esperada «%s» no vale: sin ella no hay concurrencia", (stamp) => {
    expect(errorsOf(update({ expectedUpdatedAt: stamp }), updateDrillSchema)).toHaveProperty("expectedUpdatedAt");
  });

  it("sin el ejercicio, señala sus campos obligatorios", () => {
    const errors = errorsOf({ drillId: DRILL, expectedUpdatedAt: STAMP }, updateDrillSchema);

    expect(errors).toHaveProperty("title");
    expect(errors).toHaveProperty("focusAreaIds");
  });

  it.each([null, undefined, "texto", 7, []])("una entrada que no es un objeto (%j) es INVALID, no lanza", (input) => {
    expect(() => updateDrillSchema.safeParse(input)).not.toThrow();
    expect(updateDrillSchema.safeParse(input).success).toBe(false);
  });

  it("lo que el cliente ponga junto a la copia esperada no pisa lo del ejercicio ni al revés", () => {
    const parsed = updateDrillSchema.parse(
      update({ drill: { ...VALID, drillId: "otro", expectedUpdatedAt: "otra" } }),
    );

    expect(parsed.drillId).toBe(DRILL);
    expect(parsed.expectedUpdatedAt).toBe(STAMP);
  });
});

describe("diagramUploadSchema", () => {
  const png = (overrides: { type?: string; size?: number } = {}) =>
    new File([new Uint8Array(overrides.size ?? 1024)], "diagrama.png", { type: overrides.type ?? "image/png" });
  const upload = (overrides: Record<string, unknown> = {}) => ({ drillId: DRILL, diagram: png(), ...overrides });
  const uploadErrors = (input: unknown) => {
    const parsed = diagramUploadSchema.safeParse(input);
    if (parsed.success) return null;
    const result = fromZodError(parsed.error);
    return result.ok ? null : result.fieldErrors;
  };

  it("un uuid y un PNG de tamaño normal valen, y el fichero llega tal cual", () => {
    const input = upload();
    const parsed = diagramUploadSchema.parse(input);

    expect(parsed.drillId).toBe(DRILL);
    expect(parsed.diagram).toBe(input.diagram);
  });

  it.each(["image/png", "image/jpeg", "image/webp"])("%s vale", (type) => {
    expect(uploadErrors(upload({ diagram: png({ type }) }))).toBeNull();
  });

  it("2 MiB justos valen y un byte más no", () => {
    expect(uploadErrors(upload({ diagram: png({ size: 2_097_152 }) }))).toBeNull();
    expect(uploadErrors(upload({ diagram: png({ size: 2_097_153 }) }))).toEqual({ diagram: DIAGRAM_ERROR });
  });

  it("un SVG, aunque se llame .png, no vale por su tipo", () => {
    expect(uploadErrors(upload({ diagram: png({ type: "image/svg+xml" }) }))).toEqual({ diagram: DIAGRAM_ERROR });
  });

  it("un fichero vacío no vale", () => {
    expect(uploadErrors(upload({ diagram: png({ size: 0 }) }))).toEqual({ diagram: DIAGRAM_ERROR });
  });

  it.each([["ausente", undefined], ["null", null], ["un texto", "x.png"], ["un número", 7], ["un objeto con tipo y tamaño", { type: "image/png", size: 10 }]])(
    "el diagrama %s no vale: tiene que ser un fichero de verdad",
    (_name, diagram) => {
      expect(uploadErrors(upload({ diagram }))).toEqual({ diagram: DIAGRAM_ERROR });
    },
  );

  it.each([["ausente", undefined], ["vacío", ""], ["un texto", "no-es-un-uuid"], ["un número", 12]])(
    "el id del ejercicio %s no vale",
    (_name, drillId) => {
      expect(uploadErrors(upload({ drillId }))).toEqual({ drillId: NOT_FOUND });
    },
  );

  it("los dos errores a la vez", () => {
    expect(uploadErrors({ drillId: "x", diagram: null })).toEqual({ drillId: NOT_FOUND, diagram: DIAGRAM_ERROR });
  });

  it.each([null, undefined, "texto", 7, []])("una entrada que no es un objeto (%j) no lanza", (input) => {
    expect(() => diagramUploadSchema.safeParse(input)).not.toThrow();
    expect(diagramUploadSchema.safeParse(input).success).toBe(false);
  });

  it("lo demás que traiga (club, ruta, tipo) no pasa al resultado", () => {
    const parsed = diagramUploadSchema.parse(upload({ organizationId: "otro", path: "org/otro/x.png", mime: "image/gif" }));

    expect(Object.keys(parsed).sort()).toEqual(["diagram", "drillId"]);
  });
});
