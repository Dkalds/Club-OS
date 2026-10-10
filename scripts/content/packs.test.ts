import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { slugify } from "@/modules/methodology/slug";
import { PACK_FILE, loadPack, type LoadedPack } from "./pack";

// Los paquetes de contenido que trae el repositorio (`content/<club>/<paquete>/`): todos tienen
// que valer tal como están, sin base de datos. Y el de la biblioteca del entrenador, además,
// tiene que ser lo que su especificación dice
// (`docs/superpowers/specs/2026-10-10-importador-de-contenido-design.md`).

const CONTENT = path.resolve(import.meta.dirname, "../../content");

/** Cada carpeta `content/<club>/<paquete>/` que tiene un `pack.json`. */
function packDirs(): string[] {
  if (!existsSync(CONTENT)) return [];
  const folders = (dir: string) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  return folders(CONTENT)
    .flatMap(folders)
    .filter((dir) => existsSync(path.join(dir, PACK_FILE)));
}

it("hay paquetes y todos validan", async () => {
  const dirs = packDirs();

  expect(dirs.length).toBeGreaterThan(0);
  for (const dir of dirs) await expect(loadPack(dir), dir).resolves.toBeDefined();
});

describe("biblioteca-entrenador-2026", () => {
  const DIR = path.join(CONTENT, "arcangel", "biblioteca-entrenador-2026");

  /**
   * La tabla «Edad, jugadores y material de los 44» de la especificación, fila a fila:
   * número, título, objetivo de trabajo, edad mínima (la «U»), jugadores y material.
   */
  const EXPECTED: Array<
    [n: number, title: string, focus: string, age: number, players: [number, number], equipment: string[]]
  > = [
    [1, "Sellar al tirador", "rebote", 12, [4, 12], ["Balones"]],
    [2, "Cierre desde lado débil", "rebote", 12, [4, 12], ["Balones"]],
    [3, "Espalda contra espalda", "rebote", 10, [2, 12], ["Balones"]],
    [4, "Rebote largo y primer pase", "rebote", 12, [6, 12], ["Balones"]],
    [5, "Cierre más segundo esfuerzo", "rebote", 12, [4, 12], ["Balones"]],
    [6, "3x3 con salida obligatoria", "rebote", 12, [6, 12], ["Balones", "Conos"]],
    [7, "Carrera exterior al aro", "rebote", 12, [4, 12], ["Balones"]],
    [8, "Dos cargan, uno equilibra", "rebote", 12, [6, 12], ["Balones"]],
    [9, "Toque ofensivo dirigido", "rebote", 10, [3, 12], ["Balones"]],
    [10, "Rebote tras penetración", "rebote", 12, [6, 12], ["Balones"]],
    [11, "Segunda acción en 4 segundos", "rebote", 12, [4, 12], ["Balones"]],
    [12, "4x4 decisión de carga", "rebote", 16, [8, 12], ["Balones"]],
    [13, "1x1 orientar a banda", "defensa", 10, [2, 12], ["Balones", "Conos"]],
    [14, "1x1 recuperar tras ventaja", "defensa", 12, [2, 12], ["Balones"]],
    [15, "Negación de primera línea", "defensa", 12, [4, 12], ["Balones"]],
    [16, "Salto al balón", "defensa", 12, [6, 12], ["Balones"]],
    [17, "Cambio defensivo comunicado", "defensa", 14, [4, 12], ["Balones"]],
    [18, "2x1 lateral de aprendizaje", "defensa", 14, [3, 12], ["Balones"]],
    [19, "Presión 3x3 toda pista", "defensa", 14, [6, 12], ["Balones"]],
    [20, "4x4 presión tras canasta", "defensa", 16, [8, 12], ["Balones"]],
    [21, "Primer pase a banda", "transicion", 10, [3, 12], ["Balones"]],
    [22, "Carriles 3x0 con decisiones", "transicion", 10, [3, 12], ["Balones"]],
    [23, "2x1 leer al defensor", "transicion", 10, [3, 12], ["Balones"]],
    [24, "3x2 continuo", "transicion", 12, [7, 12], ["Balones"]],
    [25, "Rebote a transición 4x3", "transicion", 14, [7, 12], ["Balones"]],
    [26, "8 segundos con lectura", "transicion", 16, [8, 12], ["Balones", "Cronómetro"]],
    [27, "Contra-contraataque", "transicion", 12, [6, 12], ["Balones"]],
    [28, "Oleadas 5x4 a 5x5", "transicion", 16, [10, 15], ["Balones"]],
    [29, "Pasar y cortar 2x2", "ataque", 12, [4, 12], ["Balones"]],
    [30, "Puerta atrás por negación", "ataque", 12, [4, 12], ["Balones"]],
    [31, "Penetrar y doblar 3x3", "ataque", 14, [6, 12], ["Balones"]],
    [32, "1x1 con espacio real", "ataque", 10, [3, 12], ["Balones"]],
    [33, "Corte y reemplazo 3x3", "ataque", 12, [6, 12], ["Balones"]],
    [34, "Atacar closeout 3x3", "ataque", 12, [6, 12], ["Balones"]],
    [35, "Juego libre con 0,5 segundos", "ataque", 16, [8, 12], ["Balones"]],
    [36, "5x5 ventaja antes que sistema", "ataque", 18, [10, 15], ["Balones"]],
    [37, "Bote con mirada periférica", "tecnica", 8, [2, 12], ["Balones"]],
    [38, "Paradas y pivotes bajo presión", "tecnica", 10, [2, 12], ["Balones", "Conos"]],
    [39, "Finalización mano no dominante", "tecnica", 8, [2, 12], ["Balones"]],
    [40, "Cambio de ritmo contra rival", "tecnica", 10, [2, 12], ["Balones", "Conos"]],
    [41, "Pase bajo presión 2x1", "tecnica", 10, [3, 12], ["Balones"]],
    [42, "Tiro desde recepción", "tecnica", 8, [4, 12], ["Balones"]],
    [43, "Finalizar con contacto controlado", "tecnica", 10, [2, 12], ["Balones", "Almohadilla de contacto"]],
    [44, "Lectura de ayudas 2x2", "tecnica", 12, [4, 12], ["Balones"]],
  ];

  let loaded: LoadedPack;

  beforeAll(async () => {
    loaded = await loadPack(DIR);
  });

  it("trae los 44 ejercicios de la tabla de la especificación, en su orden", () => {
    const { pack } = loaded;

    expect(pack.id).toBe("biblioteca-entrenador-2026");
    expect(pack.title).toBe("Biblioteca del entrenador · Manual de pista 2026");
    expect(pack.drills).toHaveLength(EXPECTED.length);

    EXPECTED.forEach(([n, title, focus, age, players, equipment], index) => {
      const key = slugify(title);
      const drill = pack.drills[index];

      expect(
        {
          key: drill.key,
          title: drill.title,
          age: drill.age,
          players: drill.players,
          minutes: drill.minutes,
          focus: drill.focus,
          principles: drill.principles,
          equipment: drill.equipment,
          status: drill.status,
          diagram: drill.diagram,
        },
        `ejercicio ${n}`,
      ).toEqual({
        key,
        title,
        age: [age, null],
        players,
        minutes: [5, 8],
        focus: [focus],
        // Técnica es un objetivo de trabajo, no un principio de juego del club.
        principles: focus === "tecnica" ? [] : [focus],
        equipment,
        status: "published",
        diagram: `diagrams/${String(n).padStart(2, "0")}-${key}.png`,
      });
    });
  });

  it("cada ficha sigue la traducción del manual", () => {
    for (const drill of loaded.pack.drills) {
      const label = drill.key;

      expect(drill.title, label).not.toMatch(/^\d{2} · /);
      expect(drill.objective, label).toBeTruthy();
      expect(drill.setupMd, label).toMatch(
        /^\*\*Montaje\.\*\* .+\n\n\*\*Secuencia\.\*\* .+\n\n\*\*Indicador\.\*\* \p{Lu}.*\.$/u,
      );

      expect(drill.variants, label).toHaveLength(1);
      expect(drill.variants[0].title, label).toBe("Progresión");
      expect(drill.variants[0].description, label).toBeTruthy();

      // Qué observar (uno o dos puntos clave) y, al final, el error frecuente.
      expect([2, 3], label).toContain(drill.points.length);
      const last = drill.points[drill.points.length - 1];
      expect(drill.points.slice(0, -1).every((point) => point.key), label).toBe(true);
      expect(last.key, label).toBe(false);
      expect(last.text, label).toMatch(/^Error frecuente: \p{Ll}/u);
      for (const point of drill.points) {
        expect(point.text, label).not.toMatch(/\.$/);
        expect(point.text, label).toMatch(/^\p{Lu}|^\d/u);
      }
    }
  });

  it("44 pizarras distintas", () => {
    const hashes = [...loaded.diagrams.values()].map(({ file }) =>
      createHash("sha256").update(readFileSync(file)).digest("hex"),
    );

    expect(loaded.diagrams.size).toBe(44);
    expect(new Set(hashes).size).toBe(44);
  });

  it("el ejercicio 01, entero", () => {
    expect(loaded.pack.drills[0]).toEqual({
      key: "sellar-al-tirador",
      title: "Sellar al tirador",
      age: [12, null],
      players: [4, 12],
      minutes: [5, 8],
      focus: ["rebote"],
      principles: ["rebote"],
      equipment: ["Balones"],
      objective: "Impedir segunda opción tras tiro frontal.",
      setupMd:
        "**Montaje.** 2x2, dos exteriores y un entrenador tirador.\n\n" +
        "**Secuencia.** Tiro del entrenador; defensores encuentran pareja, sellan y capturan; salida con pase.\n\n" +
        "**Indicador.** Rebotes defensivos / tiros fallados.",
      points: [
        { text: "Mirar hombre antes de balón", key: true },
        { text: "Pies activos", key: true },
        { text: "Error frecuente: saltar directamente sin contactar", key: false },
      ],
      variants: [{ title: "Progresión", description: "Añadir tercer atacante desde esquina." }],
      diagram: "diagrams/01-sellar-al-tirador.png",
      status: "published",
    });
  });
});
