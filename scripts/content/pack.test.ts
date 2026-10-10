import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PACK_FILE, PackError, loadPack, parsePack } from "./pack";

// El formato del paquete de contenido y su validación, sin base de datos: `parsePack` mira el
// JSON y `loadPack` además los ficheros de las pizarras. El paquete de ejemplo es ficticio.

const FIXTURE = path.resolve(import.meta.dirname, "fixtures/pack-ejemplo");
const KEY = "rueda-de-pases-en-estrella";
const DIAGRAM = `diagrams/${KEY}.png`;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** El JSON de un paquete tal como se lee: suelto, para que cada test lo estropee a su manera. */
type RawDrill = Record<string, unknown>;
type RawPack = { id: unknown; title: unknown; drills: RawDrill[] };

function raw(): RawPack {
  return JSON.parse(readFileSync(path.join(FIXTURE, PACK_FILE), "utf8")) as RawPack;
}

function issuesIn(error: unknown): string[] {
  if (error instanceof PackError) return error.issues;
  throw new Error(`Se esperaba un PackError y llegó: ${String(error)}`);
}

/** Los errores de lo que `run` lanza. Falla si no lanza nada. */
function issuesOf(run: () => unknown): string[] {
  try {
    run();
  } catch (error) {
    return issuesIn(error);
  }
  throw new Error("Se esperaba un PackError y no se lanzó nada.");
}

/** Lo mismo para una promesa que tiene que rechazar. */
async function rejectedIssues(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise;
  } catch (error) {
    return issuesIn(error);
  }
  throw new Error("Se esperaba un PackError y la promesa se cumplió.");
}

const copies: string[] = [];

/** Una copia del paquete de ejemplo en una carpeta temporal cuyo nombre lleva un espacio. */
function copyOfFixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "pack con espacio-"));
  copies.push(dir);
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("parsePack", () => {
  it("acepta el paquete de ejemplo y rellena lo opcional", () => {
    const pack = parsePack(raw());

    expect(pack.id).toBe("pack-ejemplo");
    expect(pack.title).toBe("Paquete de ejemplo");
    expect(pack.drills.map((d) => d.key)).toEqual([KEY, "dos-contra-uno-en-carrera"]);
    expect(pack.drills[0]).toMatchObject({ status: "published", principles: [], age: [10, null] });
    expect(pack.drills[0].points).toEqual([
      { text: "Manos preparadas antes de recibir", key: true },
      { text: "Paso hacia el pase", key: false },
    ]);
    expect(pack.drills[1]).toMatchObject({
      status: "draft",
      equipment: [],
      objective: null,
      setupMd: null,
      points: [],
      variants: [],
      diagram: null,
      age: [12, 16],
    });
  });

  it("recorta los textos como el formulario de la app", () => {
    const input = raw();
    input.drills[0].title = "  Rueda de pases en estrella  ";
    input.drills[0].equipment = ["Balones", "  "];

    const [drill] = parsePack(input).drills;

    expect(drill.title).toBe("Rueda de pases en estrella");
    expect(drill.equipment).toEqual(["Balones"]);
  });

  it("da todos los errores de valor a la vez, cada uno con su ejercicio y su campo", () => {
    const bad = raw();
    bad.id = "Pack Ejemplo";
    Object.assign(bad.drills[0], { title: "ab", age: [6, null], focus: [], diagram: "../fuera.png" });
    bad.drills[1].key = KEY;

    const text = issuesOf(() => parsePack(bad)).join("\n");

    for (const fragment of [
      "id: usa minúsculas, cifras y guiones, hasta 60 caracteres.",
      `drills[0] «${KEY}» · title: Escribe un título de 3 a 80 caracteres.`,
      `drills[0] «${KEY}» · minAge: Elige una edad entre 8 y 18.`,
      `drills[0] «${KEY}» · focusAreaIds: Elige al menos un objetivo.`,
      `drills[0] «${KEY}» · diagram: tiene que ser una ruta relativa dentro del paquete, con «/», acabada en .png, .jpg o .webp.`,
      `drills[1] «${KEY}» · key: está repetida.`,
    ]) {
      expect(text).toContain(fragment);
    }
  });

  const cases: Array<[name: string, mutate: (drill: RawDrill) => void, fragment: string]> = [
    [
      "jugadores al revés",
      (d) => {
        d.players = [8, 4];
      },
      "maxPlayers: El máximo de jugadores no puede ser menor que el mínimo.",
    ],
    [
      "9 puntos",
      (d) => {
        d.points = Array.from({ length: 9 }, (_, i) => ({ text: `Punto ${i}` }));
      },
      "coachingPoints: Un ejercicio admite hasta 8 puntos.",
    ],
    [
      "4 puntos clave",
      (d) => {
        d.points = Array.from({ length: 4 }, (_, i) => ({ text: `Punto ${i}`, key: true }));
      },
      "coachingPoints: Marca como clave 3 puntos como máximo.",
    ],
    [
      "6 variantes",
      (d) => {
        d.variants = Array.from({ length: 6 }, (_, i) => ({ title: `Variante ${i}` }));
      },
      "variants: Un ejercicio admite hasta 5 variantes.",
    ],
    [
      "un objetivo repetido",
      (d) => {
        d.focus = ["tecnica", "tecnica"];
      },
      'focus: "tecnica" está repetido.',
    ],
    [
      "un principio que no es un slug",
      (d) => {
        d.principles = ["Transición"];
      },
      'principles: "Transición" no tiene forma de slug (minúsculas, cifras y guiones).',
    ],
    [
      "una clave con mayúsculas",
      (d) => {
        d.key = "Con Mayusculas";
      },
      "key: usa minúsculas, cifras y guiones, hasta 60 caracteres.",
    ],
    [
      "una pizarra con ruta absoluta",
      (d) => {
        d.diagram = "/abs.png";
      },
      "diagram: tiene que ser una ruta relativa",
    ],
    [
      "una pizarra con unidad de disco",
      (d) => {
        d.diagram = "C:\\x.png";
      },
      "diagram: tiene que ser una ruta relativa",
    ],
    [
      "una pizarra con barra invertida",
      (d) => {
        d.diagram = "diagrams\\x.png";
      },
      "diagram: tiene que ser una ruta relativa",
    ],
    [
      "una pizarra .gif",
      (d) => {
        d.diagram = "diagrams/x.gif";
      },
      "diagram: tiene que ser una ruta relativa",
    ],
  ];

  it.each(cases)("rechaza %s", (_name, mutate, fragment) => {
    const bad = raw();
    mutate(bad.drills[0]);

    expect(issuesOf(() => parsePack(bad)).join("\n")).toContain(fragment);
  });

  it("señala una propiedad desconocida y un tipo equivocado por su ruta", () => {
    const bad = raw();
    bad.drills[0].setupMD = "x";
    bad.drills[1].players = "3-9";

    const text = issuesOf(() => parsePack(bad)).join("\n");

    expect(text).toContain("setupMD");
    expect(text).toContain("drills[1].players");
  });

  it("un paquete sin ejercicios no vale", () => {
    expect(issuesOf(() => parsePack({ id: "x", title: "X", drills: [] }))).toContain(
      "drills: el paquete no trae ningún ejercicio.",
    );
  });

  it("el mensaje del error lista cada problema en su línea", () => {
    let error: unknown;
    try {
      parsePack({ id: "x", title: "X", drills: [] });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PackError);
    expect((error as PackError).message).toBe(
      "El paquete no es válido:\n- drills: el paquete no trae ningún ejercicio.",
    );
  });
});

describe("loadPack", () => {
  it("lee el paquete de ejemplo con su pizarra", async () => {
    const loaded = await loadPack(FIXTURE);
    const file = path.join(FIXTURE, "diagrams", `${KEY}.png`);

    expect(loaded.dir).toBe(FIXTURE);
    expect(loaded.pack.drills).toHaveLength(2);
    expect([...loaded.diagrams.keys()]).toEqual([KEY]);
    expect(loaded.diagrams.get(KEY)).toEqual({ file, type: "png", bytes: statSync(file).size });
  });

  it("funciona con espacios en la ruta y con un pack.json guardado con BOM", async () => {
    const dir = copyOfFixture();
    const json = readFileSync(path.join(dir, PACK_FILE), "utf8");
    writeFileSync(path.join(dir, PACK_FILE), `\uFEFF${json}`, "utf8");

    expect((await loadPack(dir)).pack.drills).toHaveLength(2);
  });

  it("junta los errores del contenido y los de los ficheros", async () => {
    const dir = copyOfFixture();
    const input = raw();
    input.drills[1].title = "ab";
    writeFileSync(path.join(dir, PACK_FILE), JSON.stringify(input), "utf8");
    rmSync(path.join(dir, "diagrams", `${KEY}.png`));

    const text = (await rejectedIssues(loadPack(dir))).join("\n");

    expect(text).toContain(
      "drills[1] «dos-contra-uno-en-carrera» · title: Escribe un título de 3 a 80 caracteres.",
    );
    expect(text).toContain(`drills[0] «${KEY}» · diagram: no existe ${DIAGRAM}.`);
  });

  it("sin pack.json lo dice, con la carpeta", async () => {
    const dir = copyOfFixture();
    rmSync(path.join(dir, PACK_FILE));

    expect(await rejectedIssues(loadPack(dir))).toEqual([`No hay pack.json en ${dir}.`]);
  });

  it("un pack.json que no es JSON", async () => {
    const dir = copyOfFixture();
    writeFileSync(path.join(dir, PACK_FILE), "{", "utf8");

    const [issue, ...rest] = await rejectedIssues(loadPack(dir));

    expect(issue).toContain("pack.json no es un JSON válido");
    expect(rest).toEqual([]);
  });

  it("una pizarra cuyo contenido no es lo que dice su extensión", async () => {
    const dir = copyOfFixture();
    writeFileSync(path.join(dir, DIAGRAM), '<svg xmlns="http://www.w3.org/2000/svg"/>', "utf8");

    expect(await rejectedIssues(loadPack(dir))).toEqual([
      `drills[0] «${KEY}» · diagram: ${DIAGRAM}: su contenido no es una imagen png.`,
    ]);
  });

  it("una pizarra vacía", async () => {
    const dir = copyOfFixture();
    writeFileSync(path.join(dir, DIAGRAM), new Uint8Array(0));

    expect(await rejectedIssues(loadPack(dir))).toEqual([
      `drills[0] «${KEY}» · diagram: ${DIAGRAM} está vacío.`,
    ]);
  });

  it("una pizarra de más de 2 MB", async () => {
    const dir = copyOfFixture();
    const bytes = new Uint8Array(2_097_153);
    bytes.set(PNG_SIGNATURE);
    writeFileSync(path.join(dir, DIAGRAM), bytes);

    expect(await rejectedIssues(loadPack(dir))).toEqual([
      `drills[0] «${KEY}» · diagram: ${DIAGRAM} pesa más de 2 MB.`,
    ]);
  });
});
