import { describe, expect, it } from "vitest";
import { buildProposal, proposalHint, type ProposalDrill, type ProposalInput } from "./proposal";

const TIRO = { slug: "tiro", name: "Tiro" };
const PASE = { slug: "pase", name: "Pase" };
const BOTE = { slug: "bote", name: "Bote" };

/** Un ejercicio que le vale a cualquier equipo, de 5 a 30 min; cada test cambia lo que mira. */
function drill(id: string, overrides: Partial<ProposalDrill> = {}): ProposalDrill {
  return {
    id,
    title: id,
    minAge: 8,
    maxAge: null,
    minPlayers: 2,
    maxPlayers: 12,
    minMinutes: 5,
    maxMinutes: 30,
    focus: [],
    keyPoints: 0,
    variants: 0,
    ...overrides,
  };
}

function input(overrides: Partial<ProposalInput> = {}): ProposalInput {
  return {
    minutes: 75,
    age: 12,
    players: 10,
    primaryFocus: TIRO,
    secondaryFocus: PASE,
    drills: [],
    recentDrillIds: [],
    ...overrides,
  };
}

/** Una biblioteca con de sobra para cada hueco. */
const LIBRARY: ProposalDrill[] = [
  drill("corto", { minMinutes: 5, maxMinutes: 10, focus: [BOTE] }),
  drill("tiro-a", { minMinutes: 10, focus: [TIRO] }),
  drill("tiro-b", { minMinutes: 10, focus: [TIRO] }),
  drill("tiro-c", { minMinutes: 10, focus: [TIRO] }),
  drill("pase-a", { minMinutes: 10, focus: [PASE] }),
  drill("partido", { minMinutes: 10, maxPlayers: 20, focus: [BOTE] }),
];

function ids(proposal: ReturnType<typeof buildProposal>): string[] {
  return proposal.items.map((item) => item.drillId);
}

function total(proposal: ReturnType<typeof buildProposal>): number {
  return proposal.items.reduce((sum, item) => sum + item.minutes, 0);
}

describe("buildProposal", () => {
  it("arma activación, dos del principal, uno del secundario y competición, en ese orden", () => {
    const proposal = buildProposal(input({ drills: LIBRARY }));

    expect(ids(proposal)).toEqual(["corto", "tiro-a", "tiro-b", "pase-a", "partido"]);
    expect(proposal.items.map((item) => item.phase)).toEqual([
      "Activación",
      "Tiro",
      "Tiro",
      "Pase",
      "Competición",
    ]);
  });

  it("cubre la duración de la sesión, de 5 en 5 minutos", () => {
    const proposal = buildProposal(input({ drills: LIBRARY }));

    expect(total(proposal)).toBe(75);
    expect(proposal.uncoveredMinutes).toBe(0);
    for (const item of proposal.items) expect(item.minutes % 5).toBe(0);
  });

  it("reparte según las fases: el principal se lleva la mayor parte", () => {
    const proposal = buildProposal(input({ minutes: 100, drills: LIBRARY }));
    const minutes = Object.fromEntries(proposal.items.map((item) => [item.drillId, item.minutes]));

    expect(minutes).toEqual({ corto: 10, "tiro-a": 25, "tiro-b": 25, "pase-a": 20, partido: 20 });
  });

  it("con los mismos datos da la misma propuesta, llegue la biblioteca en el orden que llegue", () => {
    const forward = buildProposal(input({ drills: LIBRARY }));
    const backward = buildProposal(input({ drills: [...LIBRARY].reverse() }));

    expect(backward).toEqual(forward);
  });

  it("no repite un ejercicio", () => {
    const proposal = buildProposal(input({ drills: LIBRARY.slice(0, 3) }));

    expect(new Set(ids(proposal)).size).toBe(proposal.items.length);
  });

  it("con menos de 60 minutos propone un solo ejercicio del principal", () => {
    const proposal = buildProposal(input({ minutes: 45, drills: LIBRARY }));

    expect(ids(proposal)).toEqual(["corto", "tiro-a", "pase-a", "partido"]);
    expect(total(proposal)).toBe(45);
  });

  it("sin secundario, ese hueco es otro ejercicio del principal", () => {
    const proposal = buildProposal(input({ secondaryFocus: null, drills: LIBRARY }));

    expect(ids(proposal)).toEqual(["corto", "tiro-a", "tiro-b", "tiro-c", "partido"]);
    expect(proposal.items[3].phase).toBe("Tiro");
  });

  it("no propone un ejercicio que no es para la edad del equipo, aunque no haya otro", () => {
    const proposal = buildProposal(
      input({
        age: 10,
        drills: [
          drill("mayores", { minAge: 14, focus: [TIRO] }),
          drill("pequenos", { minAge: 6, maxAge: 8, focus: [TIRO] }),
        ],
      }),
    );

    expect(proposal.items).toEqual([]);
    expect(proposal.uncoveredMinutes).toBe(75);
  });

  it("sin edad conocida no filtra por edad", () => {
    const proposal = buildProposal(input({ age: null, drills: [drill("mayores", { minAge: 14, focus: [TIRO] })] }));

    expect(ids(proposal)).toEqual(["mayores"]);
  });

  it("prefiere lo que no se ha usado en las últimas sesiones", () => {
    const proposal = buildProposal(input({ drills: LIBRARY, recentDrillIds: ["tiro-a"] }));

    expect(ids(proposal).slice(1, 3)).toEqual(["tiro-b", "tiro-c"]);
  });

  it("si no queda otra, admite lo usado hace poco antes que cambiar de objetivo", () => {
    const proposal = buildProposal(
      input({
        minutes: 45,
        drills: [drill("tiro-a", { focus: [TIRO] }), drill("otro", { focus: [BOTE] })],
        recentDrillIds: ["tiro-a"],
        secondaryFocus: null,
      }),
    );

    expect(proposal.items.find((item) => item.phase === "Tiro")?.drillId).toBe("tiro-a");
  });

  it("prefiere el ejercicio en el que cabe la plantilla, y si no hay, deja de mirarlo", () => {
    const fits = buildProposal(
      input({
        minutes: 30,
        players: 14,
        secondaryFocus: null,
        drills: [
          drill("tiro-pocos", { maxPlayers: 8, focus: [TIRO] }),
          drill("tiro-todos", { maxPlayers: 16, focus: [TIRO] }),
        ],
      }),
    );
    expect(fits.items.find((item) => item.phase === "Tiro")?.drillId).toBe("tiro-todos");

    const none = buildProposal(
      input({
        minutes: 30,
        players: 14,
        secondaryFocus: null,
        drills: [drill("tiro-pocos", { maxPlayers: 8, focus: [TIRO] })],
      }),
    );
    expect(ids(none)).toEqual(["tiro-pocos"]);
  });

  it("sin ejercicios del objetivo, vale cualquiera antes que dejar el hueco vacío", () => {
    const proposal = buildProposal(
      input({ minutes: 30, secondaryFocus: null, drills: [drill("bote-a", { focus: [BOTE] })] }),
    );

    expect(ids(proposal)).toEqual(["bote-a"]);
    expect(proposal.items[0].phase).toBe("Tiro");
  });

  it("sin objetivo en la sesión, toma los objetivos con más ejercicios", () => {
    const proposal = buildProposal(input({ primaryFocus: null, secondaryFocus: null, drills: LIBRARY }));

    expect(proposal.items.map((item) => item.phase)).toEqual([
      "Activación",
      "Tiro",
      "Tiro",
      "Bote",
      "Competición",
    ]);
  });

  it("respeta el rango de minutos de cada ejercicio y dice lo que no cubre", () => {
    const proposal = buildProposal(
      input({ minutes: 60, secondaryFocus: null, drills: [drill("tiro-a", { maxMinutes: 20, focus: [TIRO] })] }),
    );

    expect(proposal.items).toHaveLength(1);
    expect(proposal.items[0].minutes).toBe(20);
    expect(proposal.uncoveredMinutes).toBe(40);
  });

  it("en una sesión de 15 minutos quita huecos en vez de pasarse", () => {
    const proposal = buildProposal(input({ minutes: 15, drills: LIBRARY }));

    expect(total(proposal)).toBe(15);
    expect(proposal.items.every((item) => item.minutes >= 5)).toBe(true);
    expect(proposal.items.some((item) => item.phase === "Tiro")).toBe(true);
  });

  it("en una sesión de 180 minutos no pasa de lo que admite cada ejercicio", () => {
    const proposal = buildProposal(input({ minutes: 180, drills: LIBRARY }));

    expect(total(proposal) + proposal.uncoveredMinutes).toBe(180);
    for (const item of proposal.items) {
      const source = LIBRARY.find((candidate) => candidate.id === item.drillId);
      expect(item.minutes).toBeLessThanOrEqual(source?.maxMinutes ?? 0);
    }
  });

  it("si los huecos no llenan la franja, añade más ejercicios del principal y del secundario", () => {
    // Rangos estrechos, como los de una biblioteca de verdad: cinco ejercicios no dan 75 min.
    const narrow = (id: string, focus: typeof TIRO) => drill(id, { minMinutes: 10, maxMinutes: 10, focus: [focus] });
    const proposal = buildProposal(
      input({
        drills: [
          narrow("tiro-a", TIRO),
          narrow("tiro-b", TIRO),
          narrow("tiro-c", TIRO),
          narrow("pase-a", PASE),
          narrow("pase-b", PASE),
          narrow("bote-a", BOTE),
          narrow("bote-b", BOTE),
        ],
      }),
    );

    // Competición se elige antes que activación: se queda el primero por título.
    expect(ids(proposal)).toEqual(["bote-b", "tiro-a", "tiro-b", "tiro-c", "pase-a", "pase-b", "bote-a"]);
    expect(proposal.items.map((item) => item.phase)).toEqual([
      "Activación",
      "Tiro",
      "Tiro",
      "Tiro",
      "Pase",
      "Pase",
      "Competición",
    ]);
    expect(total(proposal)).toBe(70);
    expect(proposal.uncoveredMinutes).toBe(5);
  });

  it("no añade un ejercicio que no cabe en lo que queda", () => {
    const proposal = buildProposal(
      input({
        minutes: 30,
        secondaryFocus: null,
        drills: [
          drill("tiro-a", { minMinutes: 20, maxMinutes: 20, focus: [TIRO] }),
          drill("tiro-b", { minMinutes: 20, maxMinutes: 20, focus: [TIRO] }),
        ],
      }),
    );

    expect(ids(proposal)).toEqual(["tiro-a"]);
    expect(proposal.uncoveredMinutes).toBe(10);
  });

  it("no pasa de ocho ejercicios", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      drill(`tiro-${String(index).padStart(2, "0")}`, { minMinutes: 5, maxMinutes: 5, focus: [TIRO] }),
    );
    const proposal = buildProposal(input({ minutes: 120, secondaryFocus: null, drills: many }));

    expect(proposal.items).toHaveLength(8);
    expect(new Set(ids(proposal)).size).toBe(8);
    expect(proposal.uncoveredMinutes).toBe(80);
  });

  it("un ejercicio sin múltiplo de 5 en su rango dura lo más que admite, sin salirse", () => {
    const proposal = buildProposal(
      input({
        minutes: 30,
        secondaryFocus: null,
        drills: [drill("tiro-a", { minMinutes: 11, maxMinutes: 14, focus: [TIRO] })],
      }),
    );

    expect(proposal.items[0].minutes).toBe(14);
    expect(proposal.uncoveredMinutes).toBe(16);
  });

  it("cuando vale cualquier objetivo, sigue prefiriendo lo que cabe y no se ha usado hace poco", () => {
    const proposal = buildProposal(
      input({
        minutes: 30,
        players: 14,
        secondaryFocus: null,
        recentDrillIds: ["a-reciente"],
        drills: [
          drill("a-reciente", { maxPlayers: 16, focus: [BOTE] }),
          drill("b-pocos", { maxPlayers: 8, focus: [BOTE] }),
          drill("c-vale", { maxPlayers: 16, focus: [BOTE] }),
        ],
      }),
    );

    expect(ids(proposal)[0]).toBe("c-vale");
  });

  it("con la biblioteca vacía devuelve una lista vacía", () => {
    expect(buildProposal(input())).toEqual({ items: [], uncoveredMinutes: 75 });
  });

  it("los minutos que no son múltiplo de 5 quedan sin cubrir", () => {
    const proposal = buildProposal(input({ minutes: 77, drills: LIBRARY }));

    expect(total(proposal)).toBe(75);
    expect(proposal.uncoveredMinutes).toBe(2);
  });

  it("cada ítem lleva el título del ejercicio y por qué está", () => {
    const proposal = buildProposal(
      input({
        minutes: 30,
        secondaryFocus: null,
        drills: [drill("tiro-a", { title: "Rueda de tiro", focus: [TIRO, PASE], keyPoints: 2, variants: 1 })],
      }),
    );

    expect(proposal.items[0]).toMatchObject({
      drillId: "tiro-a",
      title: "Rueda de tiro",
      hint: "Tiro, Pase · 2 puntos clave · 1 variante",
    });
  });
});

describe("proposalHint", () => {
  it("omite lo que no hay y concuerda el número", () => {
    expect(proposalHint(drill("a", { focus: [TIRO], keyPoints: 1, variants: 3 }))).toBe(
      "Tiro · 1 punto clave · 3 variantes",
    );
    expect(proposalHint(drill("a", { focus: [TIRO] }))).toBe("Tiro");
    expect(proposalHint(drill("a"))).toBe("");
  });
});
