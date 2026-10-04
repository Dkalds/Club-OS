import { describe, expect, it } from "vitest";
import {
  ARCANGEL_DRILLS,
  buildDrillRows,
  DEMO_DRILLS,
  type DrillRefs,
  drillId,
  drillIdsByTitle,
  type SeedDrill,
} from "./drills";
import { seedId, slugify } from "./ids";

// Pruebas del contenido de la biblioteca del seed y de los constructores puros que lo
// convierten en filas. Que esas filas lleguen a la base de datos lo comprueba
// seed.int.test.ts; que `buildSeedData` las enlace con las sesiones, data.test.ts.

const byTitle = (drills: SeedDrill[], title: string): SeedDrill => {
  const found = drills.filter((drill) => drill.title === title);
  if (found.length !== 1) throw new Error(`${title}: se esperaba 1 ejercicio y hay ${found.length}`);
  return found[0];
};

// ── Contenido ────────────────────────────────────────────────────────────────────────

// La tabla del brief, fila a fila: título, edad [mínima, máxima|null], jugadores, minutos,
// focos y Standards. «12+» es mínima 12 y máxima abierta; un solo número ("10") es mínimo =
// máximo.
type Row = [
  title: string,
  age: [number, number | null],
  players: [number, number],
  minutes: [number, number],
  focus: string[],
  standards: number[],
];
const ARCANGEL_TABLE: Row[] = [
  ["Rebote + outlet", [12, null], [6, 12], [10, 15], ["rebote", "transicion"], [3, 4, 5]],
  ["3 calles", [10, null], [9, 15], [10, 10], ["transicion", "tecnica"], [4, 5]],
  ["3x2 continuo", [12, null], [8, 12], [12, 20], ["transicion", "ataque"], [2, 4, 5]],
  ["2x2 presión", [12, null], [8, 12], [12, 15], ["defensa"], [2, 3]],
  ["1x1 toda pista", [12, null], [4, 12], [10, 15], ["defensa", "tecnica"], [2]],
  ["Movilidad + rueda de pases", [8, null], [8, 16], [8, 12], ["tecnica"], []],
  ["Desplazamientos defensivos", [8, null], [4, 16], [8, 10], ["defensa"], [2]],
  ["Bloqueo de rebote", [10, null], [6, 12], [10, 12], ["rebote"], [3]],
  ["3x3 a 5 puntos", [12, null], [6, 12], [15, 20], ["ataque", "defensa"], [2, 3]],
  ["Tiro tras bote", [10, null], [4, 12], [10, 15], ["tiro", "tecnica"], []],
  ["Pase y corte", [10, null], [6, 12], [10, 15], ["ataque", "tecnica"], [4]],
  ["Contraataque 2x1", [10, null], [6, 12], [10, 15], ["transicion"], [4, 5]],
  ["Rebote ofensivo", [12, null], [6, 12], [10, 15], ["rebote", "ataque"], [2, 3]],
  ["Bote y control", [8, 12], [4, 12], [10, 15], ["tecnica"], []],
  ["Defensa individual", [10, null], [6, 12], [10, 15], ["defensa"], [2]],
  ["Movilidad dinámica", [8, null], [4, 16], [8, 10], ["tecnica"], []],
  ["Rueda de entradas", [8, null], [6, 16], [8, 12], ["tecnica", "tiro"], []],
  ["4x4 transición", [12, null], [8, 12], [15, 20], ["transicion", "defensa"], [2, 4, 5]],
  // Los tres que suma la Fase 4 (contrato entre fases: de 18 a 21): enlazan tres de los seis
  // ítems de «Defensa presionante».
  ["Ayuda y recuperación 3x3", [12, null], [6, 12], [12, 15], ["defensa"], [1, 2]],
  ["Presión al balón en medio campo", [12, null], [6, 12], [10, 15], ["defensa"], [2]],
  ["Bloqueo y rebote 3x3", [10, null], [6, 12], [10, 12], ["rebote"], [3]],
];

// Los tres ejercicios que suma la Fase 4, por título.
const PHASE_4_TITLES = ["Ayuda y recuperación 3x3", "Presión al balón en medio campo", "Bloqueo y rebote 3x3"];

describe("ARCANGEL_DRILLS: la tabla del brief", () => {
  it("son 21, con título, edad, jugadores, minutos, focos y Standards de la tabla", () => {
    expect(ARCANGEL_DRILLS).toHaveLength(21);
    expect(
      ARCANGEL_DRILLS.map((d) => [d.title, d.age, d.players, d.minutes, d.focus, d.standards]),
    ).toEqual(ARCANGEL_TABLE);
  });

  it("la clave es el título en minúsculas, sin tildes y con guiones", () => {
    expect(byTitle(ARCANGEL_DRILLS, "Bloqueo de rebote").key).toBe("bloqueo-de-rebote");
    expect(byTitle(ARCANGEL_DRILLS, "Rebote + outlet").key).toBe("rebote-outlet");
    expect(byTitle(ARCANGEL_DRILLS, "4x4 transición").key).toBe("4x4-transicion");
    for (const drill of [...ARCANGEL_DRILLS, ...DEMO_DRILLS]) {
      expect(drill.key, drill.title).toBe(slugify(drill.title));
    }
  });

  it("claves y títulos no se repiten dentro del club", () => {
    for (const drills of [ARCANGEL_DRILLS, DEMO_DRILLS]) {
      expect(new Set(drills.map((d) => d.key)).size).toBe(drills.length);
      expect(new Set(drills.map((d) => d.title)).size).toBe(drills.length);
    }
  });

  it("todos son de Raúl y están publicados, salvo «Bloqueo de rebote», borrador de Irene", () => {
    for (const drill of ARCANGEL_DRILLS) {
      if (drill.title === "Bloqueo de rebote") {
        expect([drill.author, drill.status]).toEqual(["irene@arcangel.test", "draft"]);
      } else {
        expect([drill.title, drill.author, drill.status]).toEqual([
          drill.title,
          "raul@arcangel.test",
          "published",
        ]);
      }
    }
    expect(ARCANGEL_DRILLS.filter((d) => d.status === "draft")).toHaveLength(1);
  });

  it("los principios son los focos que son principio del club, más «ataque» en 10 y 17", () => {
    const principleSlugs = ["transicion", "defensa", "rebote", "ataque"];
    ARCANGEL_DRILLS.forEach((drill, index) => {
      const number = index + 1;
      const expected = drill.focus.filter((slug) => principleSlugs.includes(slug));
      if (number === 10 || number === 17) expected.push("ataque");
      expect(drill.principles, `${number} ${drill.title}`).toEqual(expected);
    });
  });
});

describe("«Rebote + outlet»", () => {
  const drill = byTitle(ARCANGEL_DRILLS, "Rebote + outlet");

  it("lleva el texto, los puntos y las variantes del brief", () => {
    expect(drill.objective).toBe(
      "Asegurar el rebote defensivo y convertirlo inmediatamente en ventaja ofensiva.",
    );
    expect(drill.setupMd).toBe(
      "Tirador en la esquina, reboteador en la zona y dos exteriores abiertos; el rebote sale en outlet y se ataca en 3 calles.",
    );
    expect(drill.points).toEqual([
      { text: "Rebote con dos manos", key: true },
      { text: "Primera mirada hacia delante", key: true },
      { text: "Outlet rápido", key: true },
      { text: "Abrir carriles" },
      { text: "Correr" },
    ]);
    expect(drill.equipment).toEqual(["Balones", "Conos", "Petos"]);
    expect((drill.variants ?? []).map((v) => v.title)).toEqual([
      "Con defensor en el outlet",
      "Tras tiro libre",
    ]);
    for (const variant of drill.variants ?? []) {
      // «Descripción de una frase».
      expect(variant.description).toMatch(/^[^.]+\.$/);
    }
  });
});

describe("el resto de ejercicios de Arcángel", () => {
  const rest = ARCANGEL_DRILLS.filter((d) => d.title !== "Rebote + outlet");
  const numberOf = (drill: SeedDrill) => ARCANGEL_DRILLS.indexOf(drill) + 1;

  it("objetivo de una frase en infinitivo", () => {
    for (const drill of rest) {
      expect(drill.objective, drill.title).toMatch(/^\p{Lu}\p{L}+(ar|er|ir)\s[^.]+\.$/u);
    }
  });

  it("organización de una o dos frases", () => {
    for (const drill of rest) {
      const sentences = drill.setupMd.match(/\./g) ?? [];
      expect(sentences.length, drill.title).toBeGreaterThanOrEqual(1);
      expect(sentences.length, drill.title).toBeLessThanOrEqual(2);
      expect(drill.setupMd.endsWith("."), drill.title).toBe(true);
    }
  });

  it("3 o 4 puntos: con 4 los dos primeros clave; con 3, solo el primero (los de la Fase 3) o los dos primeros (los tres de la Fase 4)", () => {
    for (const drill of rest) {
      expect([3, 4], drill.title).toContain(drill.points.length);
      const keyCount = drill.points.length === 4 || PHASE_4_TITLES.includes(drill.title) ? 2 : 1;
      expect(
        drill.points.map((p) => p.key === true),
        drill.title,
      ).toEqual(drill.points.map((_, index) => index < keyCount));
    }
  });

  it("material: Balones; solo Conos en 7 y 16; más Conos en 5, 6, 10 y 14; más Petos en 3, 4, 9, 15, 18, 19 y 20", () => {
    for (const drill of rest) {
      const n = numberOf(drill);
      const expected = [
        ...([7, 16].includes(n) ? [] : ["Balones"]),
        ...([5, 6, 7, 10, 14, 16].includes(n) ? ["Conos"] : []),
        ...([3, 4, 9, 15, 18, 19, 20].includes(n) ? ["Petos"] : []),
      ];
      expect(drill.equipment, `${n} ${drill.title}`).toEqual(expected);
    }
  });

  it("solo «2x2 presión» tiene la variante «Toda la pista» y «4x4 transición» la de «Con comodín»", () => {
    for (const drill of rest) {
      const titles = (drill.variants ?? []).map((v) => v.title);
      if (drill.title === "2x2 presión") expect(titles).toEqual(["Toda la pista"]);
      else if (drill.title === "4x4 transición") expect(titles).toEqual(["Con comodín"]);
      else expect(titles, drill.title).toEqual([]);
    }
  });

  it("el objetivo de «4x4 transición» dice «transición»", () => {
    expect(byTitle(ARCANGEL_DRILLS, "4x4 transición").objective).toContain("transición");
  });

  it("«outlet» solo se nombra en «Rebote + outlet»: la búsqueda de los e2e lo encuentra a él y a nadie más", () => {
    const text = (drill: SeedDrill) =>
      [
        drill.title,
        drill.objective,
        drill.setupMd,
        ...drill.points.map((p) => p.text),
        ...(drill.variants ?? []).flatMap((v) => [v.title, v.description]),
      ]
        .join(" ")
        .toLowerCase();
    expect(ARCANGEL_DRILLS.filter((d) => text(d).includes("outlet")).map((d) => d.title)).toEqual([
      "Rebote + outlet",
    ]);
    expect(DEMO_DRILLS.filter((d) => text(d).includes("outlet"))).toEqual([]);
  });
});

describe("DEMO_DRILLS", () => {
  it("son dos, de Marta y publicados", () => {
    expect(DEMO_DRILLS).toHaveLength(2);
    for (const drill of DEMO_DRILLS) {
      expect([drill.author, drill.status]).toEqual(["marta@demo.test", "published"]);
    }
  });

  it("«Defensa individual» (14+, Standard 1) y «Tiro en carrera» (12+, 10 min)", () => {
    expect(
      DEMO_DRILLS.map((d) => [d.title, d.age, d.players, d.minutes, d.focus, d.standards]),
    ).toEqual([
      ["Defensa individual", [14, null], [6, 12], [10, 15], ["defensa"], [1]],
      ["Tiro en carrera", [12, null], [4, 12], [10, 10], ["tiro"], []],
    ]);
  });

  it("Club Demo no tiene principios de juego, así que sus ejercicios no enlazan ninguno", () => {
    for (const drill of DEMO_DRILLS) expect(drill.principles).toEqual([]);
  });
});

describe("el contenido cumple los CHECK de la base de datos", () => {
  const all = [...ARCANGEL_DRILLS, ...DEMO_DRILLS];

  it("título, objetivo y organización", () => {
    for (const drill of all) {
      expect(drill.title.length, drill.title).toBeGreaterThanOrEqual(3);
      expect(drill.title.length, drill.title).toBeLessThanOrEqual(80);
      expect(drill.objective.length, drill.title).toBeLessThanOrEqual(500);
      expect(drill.setupMd.length, drill.title).toBeLessThanOrEqual(5000);
      expect(drill.equipment.length, drill.title).toBeLessThanOrEqual(12);
    }
  });

  it("jugadores 1–40, minutos 1–120, edad 8–18 y máximos no menores que los mínimos", () => {
    for (const drill of all) {
      const [minPlayers, maxPlayers] = drill.players;
      const [minMinutes, maxMinutes] = drill.minutes;
      const [minAge, maxAge] = drill.age;
      expect(minPlayers, drill.title).toBeGreaterThanOrEqual(1);
      expect(maxPlayers, drill.title).toBeLessThanOrEqual(40);
      expect(maxPlayers, drill.title).toBeGreaterThanOrEqual(minPlayers);
      expect(minMinutes, drill.title).toBeGreaterThanOrEqual(1);
      expect(maxMinutes, drill.title).toBeLessThanOrEqual(120);
      expect(maxMinutes, drill.title).toBeGreaterThanOrEqual(minMinutes);
      expect(minAge, drill.title).toBeGreaterThanOrEqual(8);
      expect(minAge, drill.title).toBeLessThanOrEqual(18);
      if (maxAge !== null) {
        expect(maxAge, drill.title).toBeGreaterThanOrEqual(minAge);
        expect(maxAge, drill.title).toBeLessThanOrEqual(18);
      }
    }
  });

  it("puntos de coaching (1–140) y variantes (título 1–80, descripción hasta 500)", () => {
    for (const drill of all) {
      for (const point of drill.points) {
        expect(point.text.length, drill.title).toBeGreaterThanOrEqual(1);
        expect(point.text.length, drill.title).toBeLessThanOrEqual(140);
      }
      for (const variant of drill.variants ?? []) {
        expect(variant.title.length, drill.title).toBeGreaterThanOrEqual(1);
        expect(variant.title.length, drill.title).toBeLessThanOrEqual(80);
        expect(variant.description.length, drill.title).toBeLessThanOrEqual(500);
      }
    }
  });

  it("copy en español sin exclamaciones ni emoji", () => {
    for (const drill of all) {
      const text = [
        drill.title,
        drill.objective,
        drill.setupMd,
        ...drill.points.map((p) => p.text),
        ...(drill.variants ?? []).flatMap((v) => [v.title, v.description]),
      ].join(" ");
      expect(text, drill.title).not.toMatch(/[!¡]/);
      expect(text, drill.title).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

// ── Constructores ────────────────────────────────────────────────────────────────────

const REFS: DrillRefs = {
  orgSlug: "club-x",
  organizationId: "00000000-0000-4000-8000-0000000000aa",
  focusAreas: [
    { id: "f-tecnica", slug: "tecnica" },
    { id: "f-rebote", slug: "rebote" },
  ],
  principles: [{ id: "p-rebote", slug: "rebote" }],
  standards: [
    { id: "s-1", number: 1 },
    { id: "s-3", number: 3 },
  ],
};

const SAMPLE: SeedDrill = {
  key: "ejemplo-de-prueba",
  title: "Ejemplo de prueba",
  age: [10, null],
  players: [4, 12],
  minutes: [10, 15],
  focus: ["rebote", "tecnica"],
  principles: ["rebote"],
  standards: [3, 1],
  equipment: ["Balones"],
  objective: "Probar el constructor.",
  setupMd: "Dos filas.",
  points: [{ text: "Primero", key: true }, { text: "Segundo" }],
  variants: [{ title: "Variante", description: "Una frase." }],
  author: "raul@club-x.test",
  status: "published",
};

describe("buildDrillRows", () => {
  it("convierte el ejercicio en una fila de ejercicio, sus hijos y sus vínculos", () => {
    const rows = buildDrillRows([SAMPLE], REFS);
    const id = seedId("club-x", "drill:ejemplo-de-prueba");

    expect(rows.drills).toEqual([
      {
        id,
        organization_id: REFS.organizationId,
        title: "Ejemplo de prueba",
        summary: null,
        objective: "Probar el constructor.",
        setup_md: "Dos filas.",
        min_players: 4,
        max_players: 12,
        min_minutes: 10,
        max_minutes: 15,
        min_age: 10,
        max_age: null,
        equipment: ["Balones"],
        video_url: null,
        diagram_media_id: null,
        status: "published",
        author_email: "raul@club-x.test",
      },
    ]);
    // Los puntos y las variantes empiezan en 0, como `save_drill`.
    expect(rows.drill_coaching_points).toEqual([
      {
        id: seedId("club-x", "drill:ejemplo-de-prueba:point:0"),
        organization_id: REFS.organizationId,
        drill_id: id,
        text: "Primero",
        is_key: true,
        sort: 0,
      },
      {
        id: seedId("club-x", "drill:ejemplo-de-prueba:point:1"),
        organization_id: REFS.organizationId,
        drill_id: id,
        text: "Segundo",
        is_key: false,
        sort: 1,
      },
    ]);
    expect(rows.drill_variants).toEqual([
      {
        id: seedId("club-x", "drill:ejemplo-de-prueba:variant:0"),
        organization_id: REFS.organizationId,
        drill_id: id,
        title: "Variante",
        description: "Una frase.",
        sort: 0,
      },
    ]);
    expect(rows.drill_focus_areas).toEqual([
      { organization_id: REFS.organizationId, drill_id: id, focus_area_id: "f-rebote" },
      { organization_id: REFS.organizationId, drill_id: id, focus_area_id: "f-tecnica" },
    ]);
    expect(rows.drill_principles).toEqual([
      { organization_id: REFS.organizationId, drill_id: id, principle_id: "p-rebote" },
    ]);
    expect(rows.drill_standards).toEqual([
      { organization_id: REFS.organizationId, drill_id: id, standard_id: "s-3" },
      { organization_id: REFS.organizationId, drill_id: id, standard_id: "s-1" },
    ]);
  });

  it("sin variantes ni vínculos, no genera filas hijas", () => {
    const bare: SeedDrill = {
      ...SAMPLE,
      variants: undefined,
      principles: [],
      standards: [],
      focus: ["tecnica"],
    };
    const rows = buildDrillRows([bare], REFS);
    expect(rows.drills).toHaveLength(1);
    expect(rows.drill_variants).toEqual([]);
    expect(rows.drill_principles).toEqual([]);
    expect(rows.drill_standards).toEqual([]);
    expect(rows.drill_focus_areas).toHaveLength(1);
  });

  it("un principio que no existe en el club lanza el error con el principio y el club", () => {
    const orphan: SeedDrill = { ...SAMPLE, principles: ["transicion"] };
    expect(() => buildDrillRows([orphan], { ...REFS, orgSlug: "arcangel" })).toThrow(
      new Error('Seed: no existe el principio "transicion" en arcangel'),
    );
  });

  it("un foco que no existe en el club lanza el error con el mismo patrón", () => {
    const orphan: SeedDrill = { ...SAMPLE, focus: ["tiro"] };
    expect(() => buildDrillRows([orphan], { ...REFS, orgSlug: "arcangel" })).toThrow(
      new Error('Seed: no existe el foco "tiro" en arcangel'),
    );
  });

  it("un Standard que no existe en el club lanza el error con el mismo patrón", () => {
    const orphan: SeedDrill = { ...SAMPLE, standards: [3, 9] };
    expect(() => buildDrillRows([orphan], { ...REFS, orgSlug: "arcangel" })).toThrow(
      new Error('Seed: no existe el Standard "9" en arcangel'),
    );
  });

  it("es pura: dos llamadas dan lo mismo", () => {
    expect(buildDrillRows([SAMPLE], REFS)).toEqual(buildDrillRows([SAMPLE], REFS));
  });
});

describe("drillId y drillIdsByTitle", () => {
  it("el id sale de seedId(club, 'drill:' + clave)", () => {
    expect(drillId("arcangel", "rebote-outlet")).toBe(seedId("arcangel", "drill:rebote-outlet"));
  });

  it("enlaza cada título exacto con el id de su ejercicio, en el club que se pide", () => {
    const ids = drillIdsByTitle("arcangel", ARCANGEL_DRILLS);
    expect(ids.size).toBe(21);
    expect(ids.get("Rebote + outlet")).toBe(seedId("arcangel", "drill:rebote-outlet"));
    // Exacto: ni mayúsculas ni tildes ni espacios sueltos.
    expect(ids.get("rebote + outlet")).toBeUndefined();
    expect(ids.get("Rebote + outlet ")).toBeUndefined();
    expect(ids.get("4x4 transicion")).toBeUndefined();
    // Dos clubes con un ejercicio del mismo título no comparten id.
    const demo = drillIdsByTitle("club-demo", DEMO_DRILLS);
    expect(demo.get("Defensa individual")).toBe(seedId("club-demo", "drill:defensa-individual"));
    expect(demo.get("Defensa individual")).not.toBe(ids.get("Defensa individual"));
  });
});
