import { describe, expect, it } from "vitest";
import { drillInputSchema } from "@/modules/drills/schema";
import type { DrillDetail } from "@/modules/drills/types";
import {
  AGE_CHOICES,
  hasFieldError,
  hasUnsavedChanges,
  initialFormState,
  parseEquipment,
  parseNumber,
  toDrillInput,
  toggleId,
  type DrillFormState,
} from "./drill-form-state";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const DRILL_ID = "00000000-0000-4000-8000-0000000000d1";
const MEDIA_ID = "00000000-0000-4000-8000-0000000000e1";
const NEW_MEDIA_ID = "00000000-0000-4000-8000-0000000000e2";
const FOCUS_A = "00000000-0000-4000-8000-0000000000f1";
const FOCUS_B = "00000000-0000-4000-8000-0000000000f2";
const PRINCIPLE_A = "00000000-0000-4000-8000-000000000a01";
const PRINCIPLE_HIDDEN = "00000000-0000-4000-8000-000000000a02";
const STANDARD_A = "00000000-0000-4000-8000-000000000b01";
const STANDARD_HIDDEN = "00000000-0000-4000-8000-000000000b02";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos. */
const LOADED = "2026-10-03T10:00:00.123456+00:00";

/** Un ejercicio con todo lo que puede llevar, incluidos un principio y un Standard que no se ven. */
function drill(overrides: Partial<DrillDetail> = {}): DrillDetail {
  return {
    id: DRILL_ID,
    title: "Un ejercicio",
    status: "draft",
    createdBy: null,
    minAge: 10,
    maxAge: 14,
    minPlayers: 4,
    maxPlayers: 8,
    minMinutes: 10,
    maxMinutes: 15,
    focus: [{ slug: "uno", name: "Uno" }],
    summary: "Su resumen.",
    objective: "Su objetivo.",
    setupMd: "Una **organización**.",
    equipment: ["Balones", "Conos"],
    videoUrl: "https://youtu.be/abc",
    diagramMediaId: MEDIA_ID,
    diagramUrl: "https://storage.test/diagrama.png?token=firmado",
    coachingPoints: [
      { text: "Primer punto", isKey: true },
      { text: "Segundo punto", isKey: false },
    ],
    variants: [
      { title: "Con defensor", description: "Un defensor presiona." },
      { title: "Sin descripción", description: null },
    ],
    focusAreaIds: [FOCUS_A],
    // Los ids de TODOS los vínculos: también el principio y el Standard que la ficha no enseña.
    principleIds: [PRINCIPLE_A, PRINCIPLE_HIDDEN],
    standardIds: [STANDARD_A, STANDARD_HIDDEN],
    principles: [{ id: PRINCIPLE_A, slug: "uno", title: "Uno" }],
    principlesSectionSlug: "como-jugamos",
    standards: [{ id: STANDARD_A, number: 1, title: "UNO", description: "El primero." }],
    createdByMe: true,
    updatedAt: LOADED,
    ...overrides,
  };
}

/** Un formulario de alta rellenado a mano, con lo mínimo para ser válido. */
function filled(overrides: Partial<DrillFormState> = {}): DrillFormState {
  return {
    ...initialFormState(null),
    title: "Un título",
    minPlayers: "4",
    maxPlayers: "8",
    minMinutes: "10",
    maxMinutes: "15",
    minAge: "10",
    focusAreaIds: [FOCUS_A],
    ...overrides,
  };
}

describe("initialFormState", () => {
  it("un ejercicio nuevo empieza vacío, sin máximo de edad y sin diagrama", () => {
    expect(initialFormState(null)).toEqual({
      title: "",
      summary: "",
      objective: "",
      setupMd: "",
      minPlayers: "",
      maxPlayers: "",
      minMinutes: "",
      maxMinutes: "",
      minAge: "",
      maxAge: "",
      equipment: "",
      videoUrl: "",
      diagramMediaId: null,
      coachingPoints: [],
      variants: [],
      focusAreaIds: [],
      principleIds: [],
      standardIds: [],
    });
  });

  it("un ejercicio que existe empieza con lo guardado: los números, como texto", () => {
    const state = initialFormState(drill());

    expect(state).toMatchObject({
      title: "Un ejercicio",
      summary: "Su resumen.",
      objective: "Su objetivo.",
      setupMd: "Una **organización**.",
      minPlayers: "4",
      maxPlayers: "8",
      minMinutes: "10",
      maxMinutes: "15",
      minAge: "10",
      maxAge: "14",
      equipment: "Balones, Conos",
      videoUrl: "https://youtu.be/abc",
      diagramMediaId: MEDIA_ID,
    });
    expect(state.coachingPoints.map(({ text, isKey }) => ({ text, isKey }))).toEqual([
      { text: "Primer punto", isKey: true },
      { text: "Segundo punto", isKey: false },
    ]);
    expect(state.variants.map(({ title, description }) => ({ title, description }))).toEqual([
      { title: "Con defensor", description: "Un defensor presiona." },
      { title: "Sin descripción", description: "" },
    ]);
  });

  it("los campos que están a null empiezan vacíos, y una edad máxima abierta es «Sin máximo»", () => {
    const state = initialFormState(
      drill({ summary: null, objective: null, setupMd: null, videoUrl: null, maxAge: null, diagramMediaId: null }),
    );

    expect(state).toMatchObject({ summary: "", objective: "", setupMd: "", videoUrl: "", maxAge: "" });
    expect(state.diagramMediaId).toBeNull();
  });

  it("parte de los ids de TODOS los vínculos, no de lo que enseña la ficha", () => {
    const state = initialFormState(drill());

    expect(state.focusAreaIds).toEqual([FOCUS_A]);
    expect(state.principleIds).toEqual([PRINCIPLE_A, PRINCIPLE_HIDDEN]);
    expect(state.standardIds).toEqual([STANDARD_A, STANDARD_HIDDEN]);
  });

  it("cada fila lleva una clave propia, distinta de las demás, para seguirla al moverla", () => {
    const state = initialFormState(drill());

    const keys = [...state.coachingPoints, ...state.variants].map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => key !== "")).toBe(true);
  });

  it("no comparte listas con el ejercicio: cambiar el estado no cambia lo que llegó", () => {
    const original = drill();
    const state = initialFormState(original);

    state.principleIds.push("otro");

    expect(original.principleIds).toEqual([PRINCIPLE_A, PRINCIPLE_HIDDEN]);
  });
});

describe("toDrillInput", () => {
  it("de un formulario de alta rellenado da exactamente el DrillInput, sin diagrama", () => {
    const state = filled({
      title: "  Un título  ",
      summary: "Un resumen",
      objective: "Un objetivo",
      setupMd: "Una **organización**",
      maxAge: "14",
      equipment: "Balones, Conos",
      videoUrl: "https://youtu.be/abc",
      coachingPoints: [
        { key: "a", text: "Primero", isKey: true },
        { key: "b", text: "Segundo", isKey: false },
      ],
      variants: [{ key: "c", title: "Con defensor", description: "Un defensor presiona." }],
      principleIds: [PRINCIPLE_A],
      standardIds: [STANDARD_A],
      focusAreaIds: [FOCUS_A, FOCUS_B],
    });

    expect(toDrillInput(state, null)).toEqual({
      title: "Un título",
      summary: "Un resumen",
      objective: "Un objetivo",
      setupMd: "Una **organización**",
      minPlayers: 4,
      maxPlayers: 8,
      minMinutes: 10,
      maxMinutes: 15,
      minAge: 10,
      maxAge: 14,
      equipment: ["Balones", "Conos"],
      videoUrl: "https://youtu.be/abc",
      diagramMediaId: null,
      coachingPoints: [
        { text: "Primero", isKey: true },
        { text: "Segundo", isKey: false },
      ],
      variants: [{ title: "Con defensor", description: "Un defensor presiona." }],
      focusAreaIds: [FOCUS_A, FOCUS_B],
      principleIds: [PRINCIPLE_A],
      standardIds: [STANDARD_A],
    });
  });

  it("lo que sale del formulario es lo que valida el esquema de las acciones", () => {
    const parsed = drillInputSchema.safeParse(toDrillInput(initialFormState(drill()), drill()));

    expect(parsed.success).toBe(true);
  });

  it("un ejercicio sin tocar da lo mismo que tenía (ida y vuelta), con todos los vínculos", () => {
    const original = drill();

    expect(toDrillInput(initialFormState(original), original)).toEqual({
      title: "Un ejercicio",
      summary: "Su resumen.",
      objective: "Su objetivo.",
      setupMd: "Una **organización**.",
      minPlayers: 4,
      maxPlayers: 8,
      minMinutes: 10,
      maxMinutes: 15,
      minAge: 10,
      maxAge: 14,
      equipment: ["Balones", "Conos"],
      videoUrl: "https://youtu.be/abc",
      diagramMediaId: MEDIA_ID,
      coachingPoints: [
        { text: "Primer punto", isKey: true },
        { text: "Segundo punto", isKey: false },
      ],
      variants: [
        { title: "Con defensor", description: "Un defensor presiona." },
        { title: "Sin descripción", description: null },
      ],
      focusAreaIds: [FOCUS_A],
      principleIds: [PRINCIPLE_A, PRINCIPLE_HIDDEN],
      standardIds: [STANDARD_A, STANDARD_HIDDEN],
    });
  });

  it("un texto en blanco es null y los demás se recortan", () => {
    const input = toDrillInput(
      filled({
        title: " Título ",
        summary: "   ",
        objective: "",
        setupMd: "  \n ",
        videoUrl: " ",
        variants: [{ key: "a", title: " Variante ", description: "  " }],
        coachingPoints: [{ key: "b", text: "  Punto  ", isKey: false }],
      }),
      null,
    );

    expect(input).toMatchObject({
      title: "Título",
      summary: null,
      objective: null,
      setupMd: null,
      videoUrl: null,
      variants: [{ title: "Variante", description: null }],
      coachingPoints: [{ text: "Punto", isKey: false }],
    });
  });

  it("«Sin máximo» es maxAge: null", () => {
    expect(toDrillInput(filled({ maxAge: "" }), null).maxAge).toBeNull();
    expect(toDrillInput(filled({ maxAge: "18" }), null).maxAge).toBe(18);
  });

  describe("los números", () => {
    it("una caja vacía no es un 0: llega como NaN y el servidor la señala en su campo", () => {
      const input = toDrillInput(
        filled({ minPlayers: "", maxPlayers: "  ", minMinutes: "", maxMinutes: "", minAge: "" }),
        null,
      );

      expect(input.minPlayers).toBeNaN();
      expect(input.maxPlayers).toBeNaN();
      expect(input.minMinutes).toBeNaN();
      expect(input.maxMinutes).toBeNaN();
      expect(input.minAge).toBeNaN();
      expect(drillInputSchema.safeParse(input).success).toBe(false);
    });

    it("lo que no es un número tampoco es un 0", () => {
      expect(parseNumber("abc")).toBeNaN();
      expect(parseNumber("Infinity")).toBeNaN();
      expect(parseNumber("")).toBeNaN();
    });

    it("se recorta y respeta los decimales (el servidor decide si valen)", () => {
      expect(parseNumber(" 8 ")).toBe(8);
      expect(parseNumber("1.5")).toBe(1.5);
      expect(parseNumber("0")).toBe(0);
    });
  });

  describe("el material", () => {
    it("se separa por comas, se recorta y se quitan los vacíos y los repetidos", () => {
      expect(parseEquipment("  Balones , Conos,, Petos ,Balones,  ")).toEqual(["Balones", "Conos", "Petos"]);
    });

    it("un texto vacío o solo de comas es una lista vacía", () => {
      expect(parseEquipment("")).toEqual([]);
      expect(parseEquipment(" , ,, ")).toEqual([]);
    });

    it("conserva el orden de la primera vez que aparece cada elemento", () => {
      expect(parseEquipment("b, a, b, c, a")).toEqual(["b", "a", "c"]);
    });

    it("llega al DrillInput ya separado", () => {
      expect(toDrillInput(filled({ equipment: "Balones, , Conos, Balones" }), null).equipment).toEqual([
        "Balones",
        "Conos",
      ]);
    });

    it("si no se toca la caja, el material que se guardó vuelve tal cual, aunque un elemento lleve comas", () => {
      const original = drill({ equipment: ["Balones (6, del cinco)", "Conos"] });

      expect(toDrillInput(initialFormState(original), original).equipment).toEqual([
        "Balones (6, del cinco)",
        "Conos",
      ]);
    });

    it("si se toca la caja, manda lo escrito", () => {
      const original = drill({ equipment: ["Balones", "Conos"] });
      const state = { ...initialFormState(original), equipment: "Balones, Petos" };

      expect(toDrillInput(state, original).equipment).toEqual(["Balones", "Petos"]);
    });
  });

  describe("el diagrama", () => {
    it("siempre se manda: el del ejercicio si no se toca", () => {
      const original = drill();

      expect(toDrillInput(initialFormState(original), original).diagramMediaId).toBe(MEDIA_ID);
    });

    it("el recién subido si se ha cambiado", () => {
      const original = drill();
      const state = { ...initialFormState(original), diagramMediaId: NEW_MEDIA_ID };

      expect(toDrillInput(state, original).diagramMediaId).toBe(NEW_MEDIA_ID);
    });

    it("null si se ha quitado, y no falta la clave", () => {
      const original = drill();
      const state = { ...initialFormState(original), diagramMediaId: null };
      const input = toDrillInput(state, original);

      expect(input.diagramMediaId).toBeNull();
      expect(Object.keys(input)).toContain("diagramMediaId");
    });
  });

  describe("los vínculos que no se ven", () => {
    it("siguen en lo que se manda aunque se cambie otro vínculo", () => {
      const original = drill();
      const state = initialFormState(original);
      const next = {
        ...state,
        standardIds: toggleId(state.standardIds, "00000000-0000-4000-8000-000000000b03"),
        principleIds: toggleId(state.principleIds, PRINCIPLE_A),
      };

      const input = toDrillInput(next, original);

      expect(input.standardIds).toEqual([STANDARD_A, STANDARD_HIDDEN, "00000000-0000-4000-8000-000000000b03"]);
      expect(input.principleIds).toEqual([PRINCIPLE_HIDDEN]);
    });
  });
});

describe("toggleId", () => {
  it("añade el id que no está, al final", () => {
    expect(toggleId(["a", "b"], "c")).toEqual(["a", "b", "c"]);
  });

  it("quita el id que está y deja los demás, en su orden", () => {
    expect(toggleId(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("no cambia la lista original", () => {
    const ids = ["a", "b"];

    toggleId(ids, "a");
    toggleId(ids, "z");

    expect(ids).toEqual(["a", "b"]);
  });
});

describe("hasFieldError", () => {
  it("es verdadero si algún error es de un campo del formulario", () => {
    expect(hasFieldError({ title: "Mal" })).toBe(true);
    expect(hasFieldError({ coachingPoints: "Mal" })).toBe(true);
    expect(hasFieldError({ focusAreaIds: "Mal", drillId: "Mal" })).toBe(true);
  });

  it("es falso sin errores, o si ninguno tiene campo donde señalarse", () => {
    expect(hasFieldError({})).toBe(false);
    expect(hasFieldError({ drillId: "Mal", expectedUpdatedAt: "Mal", diagramMediaId: "Mal" })).toBe(false);
  });
});

describe("hasUnsavedChanges", () => {
  const baseline = () => initialFormState(drill());

  it("un formulario igual que la copia con la que se compara no tiene cambios", () => {
    expect(hasUnsavedChanges(baseline(), baseline())).toBe(false);
    expect(hasUnsavedChanges(initialFormState(null), initialFormState(null))).toBe(false);
  });

  it("cuenta cada campo de texto, número, edad, vídeo y diagrama", () => {
    const keys = [
      "title",
      "summary",
      "objective",
      "setupMd",
      "minPlayers",
      "maxPlayers",
      "minMinutes",
      "maxMinutes",
      "minAge",
      "maxAge",
      "equipment",
      "videoUrl",
    ] as const;

    for (const key of keys) {
      expect(hasUnsavedChanges({ ...baseline(), [key]: `${baseline()[key]} más` }, baseline()), key).toBe(true);
    }
    expect(hasUnsavedChanges({ ...baseline(), diagramMediaId: NEW_MEDIA_ID }, baseline())).toBe(true);
    expect(hasUnsavedChanges({ ...baseline(), diagramMediaId: null }, baseline())).toBe(true);
  });

  it("vuelve a no tener cambios al dejar un campo como estaba", () => {
    const edited = { ...baseline(), title: "Otro título" };

    expect(hasUnsavedChanges(edited, baseline())).toBe(true);
    expect(hasUnsavedChanges({ ...edited, title: "Un ejercicio" }, baseline())).toBe(false);
  });

  it("los ids de los chips cuentan como un conjunto: el orden en que se marcaron no importa", () => {
    const base = baseline();
    const toggledBack = {
      ...base,
      principleIds: toggleId(toggleId(base.principleIds, PRINCIPLE_A), PRINCIPLE_A),
    };

    // Quitar y volver a poner el primero lo deja al final de la lista: el mismo conjunto.
    expect(toggledBack.principleIds).toEqual([PRINCIPLE_HIDDEN, PRINCIPLE_A]);
    expect(hasUnsavedChanges(toggledBack, base)).toBe(false);
    expect(hasUnsavedChanges({ ...base, principleIds: [PRINCIPLE_A] }, base)).toBe(true);
    expect(hasUnsavedChanges({ ...base, standardIds: [] }, base)).toBe(true);
    expect(hasUnsavedChanges({ ...base, focusAreaIds: [FOCUS_A, FOCUS_B] }, base)).toBe(true);
  });

  it("los coaching points y las variantes cuentan por contenido y por orden, no por su clave", () => {
    const base = baseline();
    const [first, second] = base.coachingPoints;

    // Una fila nueva con el mismo contenido que la quitada no es un cambio.
    expect(
      hasUnsavedChanges({ ...base, coachingPoints: [{ ...first, key: "otra" }, second] }, base),
    ).toBe(false);
    expect(hasUnsavedChanges({ ...base, coachingPoints: [second, first] }, base)).toBe(true);
    expect(hasUnsavedChanges({ ...base, coachingPoints: [first] }, base)).toBe(true);
    expect(
      hasUnsavedChanges({ ...base, coachingPoints: [first, { ...second, isKey: !second.isKey }] }, base),
    ).toBe(true);

    const [variant] = base.variants;
    expect(hasUnsavedChanges({ ...base, variants: [{ ...variant, key: "otra" }, base.variants[1]] }, base)).toBe(
      false,
    );
    expect(hasUnsavedChanges({ ...base, variants: [{ ...variant, description: "" }, base.variants[1]] }, base)).toBe(
      true,
    );
    expect(hasUnsavedChanges({ ...base, variants: [] }, base)).toBe(true);
  });
});

describe("AGE_CHOICES", () => {
  it("son las edades de U8 a U18, una a una", () => {
    expect(AGE_CHOICES).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });
});
