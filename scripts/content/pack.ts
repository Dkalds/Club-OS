// Un paquete de contenido: una carpeta con un `pack.json` (los ejercicios) y las pizarras que
// nombra. Este módulo lo lee y lo valida entero antes de que nada toque la base de datos, y
// dice todo lo que está mal de una vez. El formato está en `content/README.md`.
//
// Los límites de un ejercicio no se copian aquí: cada uno pasa por el esquema con el que la
// app valida su formulario (`drillInputSchema`). Así, todo lo que se importa es un ejercicio
// que dirección puede abrir y guardar en la app sin que el formulario lo rechace.

import { open, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { drillInputSchema } from "@/modules/drills/schema";
import { MAX_DIAGRAM_BYTES, sniffImageType, type DiagramType } from "@/modules/media/diagram-file";

export const PACK_FILE = "pack.json";

// La marca de orden de bytes con la que algunos editores de Windows empiezan un fichero. Por
// su código, no como carácter: en el fuente sería invisible y cualquier formateador la quitaría.
const BOM = 0xfeff;

export type PackDrill = {
  key: string;
  title: string;
  // El número de la categoría (la «U»). Máxima a null: sin tope.
  age: [min: number, max: number | null];
  players: [min: number, max: number];
  minutes: [min: number, max: number];
  // Slugs de objetivos de trabajo y de principios del club de destino.
  focus: string[];
  principles: string[];
  equipment: string[];
  objective: string | null;
  setupMd: string | null;
  points: { text: string; key: boolean }[];
  variants: { title: string; description: string | null }[];
  // Ruta relativa al paquete, con «/».
  diagram: string | null;
  status: "published" | "draft";
};

export type Pack = { id: string; title: string; drills: PackDrill[] };

/** La pizarra de un ejercicio, ya comprobada: `file` es su ruta absoluta. */
export type PackDiagram = { file: string; type: DiagramType; bytes: number };

/** El paquete leído de disco. `diagrams` va por la `key` del ejercicio. */
export type LoadedPack = { dir: string; pack: Pack; diagrams: Map<string, PackDiagram> };

/** Un paquete que no vale, con todo lo que tiene mal: un problema por elemento de `issues`. */
export class PackError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(["El paquete no es válido:", ...issues.map((issue) => `- ${issue}`)].join("\n"));
    this.name = "PackError";
    this.issues = issues;
  }
}

// ── Forma ────────────────────────────────────────────────────────────────────────────

// Primera pasada: tipos, tuplas y propiedades conocidas. Objetos estrictos, para que una
// errata en el nombre de un campo (`setupMD`) no se pierda en silencio. Los valores se miran
// después, y solo en los ejercicios que tienen la forma correcta.
const drillShape = z.strictObject({
  key: z.string(),
  title: z.string(),
  age: z.tuple([z.number(), z.number().nullable()]),
  players: z.tuple([z.number(), z.number()]),
  minutes: z.tuple([z.number(), z.number()]),
  focus: z.array(z.string()),
  principles: z.array(z.string()).optional(),
  equipment: z.array(z.string()).optional(),
  objective: z.string().nullable().optional(),
  setupMd: z.string().nullable().optional(),
  points: z.array(z.strictObject({ text: z.string(), key: z.boolean().optional() })).optional(),
  variants: z
    .array(z.strictObject({ title: z.string(), description: z.string().nullable().optional() }))
    .optional(),
  diagram: z.string().nullable().optional(),
  status: z.enum(["published", "draft"]).optional(),
});

// Los ejercicios se miran uno a uno más abajo: aquí basta con que haya una lista.
const packShape = z.strictObject({ id: z.string(), title: z.string(), drills: z.array(z.unknown()) });

type DrillShape = z.infer<typeof drillShape>;

// Los mensajes de forma salen de Zod, en español. Solo para estas dos lecturas: el esquema del
// formulario de la app trae los suyos.
const SHAPE_MESSAGES = { error: z.locales.es().localeError };

/** `drills[1].players`: la ruta de un error de Zod, colgada de `base`. */
function pathOf(base: string, keys: PropertyKey[]): string {
  return keys.reduce<string>(
    (text, key) =>
      typeof key === "number" ? `${text}[${key}]` : text === "" ? String(key) : `${text}.${String(key)}`,
    base,
  );
}

// ── Valores ──────────────────────────────────────────────────────────────────────────

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 60;
const MAX_PACK_TITLE = 120;
const DIAGRAM_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*\.(png|jpg|webp)$/;

const KEY_FORM = "usa minúsculas, cifras y guiones, hasta 60 caracteres.";
const DIAGRAM_FORM =
  "tiene que ser una ruta relativa dentro del paquete, con «/», acabada en .png, .jpg o .webp.";

/** El uuid que ocupa el sitio de cada vínculo al pasar por el esquema del formulario. */
const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";

function isSlug(text: string): boolean {
  return SLUG.test(text) && text.length <= MAX_SLUG_LENGTH;
}

function isDiagramPath(text: string): boolean {
  return DIAGRAM_PATH.test(text) && !text.split("/").some((segment) => segment === ".." || segment === ".");
}

/** Lo que una lista de slugs tiene mal: los que no tienen forma de slug y los repetidos, una vez cada uno. */
function slugIssues(field: string, slugs: string[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const slug of slugs) {
    if (!isSlug(slug)) {
      issues.push(`${field}: "${slug}" no tiene forma de slug (minúsculas, cifras y guiones).`);
    } else if (seen.has(slug) && !repeated.has(slug)) {
      repeated.add(slug);
      issues.push(`${field}: "${slug}" está repetido.`);
    }
    seen.add(slug);
  }
  return issues;
}

/** El ejercicio del paquete, como lo mandaría el formulario de la app. */
function toFormInput(drill: DrillShape) {
  return {
    title: drill.title,
    summary: null,
    objective: drill.objective ?? null,
    setupMd: drill.setupMd ?? null,
    minPlayers: drill.players[0],
    maxPlayers: drill.players[1],
    minMinutes: drill.minutes[0],
    maxMinutes: drill.minutes[1],
    minAge: drill.age[0],
    maxAge: drill.age[1],
    equipment: drill.equipment ?? [],
    videoUrl: null,
    diagramMediaId: null,
    coachingPoints: (drill.points ?? []).map((point) => ({ text: point.text, isKey: point.key === true })),
    variants: (drill.variants ?? []).map((variant) => ({
      title: variant.title,
      description: variant.description ?? null,
    })),
    focusAreaIds: drill.focus.map(() => PLACEHOLDER_ID),
    principleIds: (drill.principles ?? []).map(() => PLACEHOLDER_ID),
    standardIds: [],
  };
}

/** Una pizarra con la ruta bien formada: lo que `loadPack` comprueba después en disco. */
type DiagramRef = { prefix: string; key: string; diagram: string };

type Checked = { pack: Pack | null; issues: string[]; diagramRefs: DiagramRef[] };

/**
 * Todo lo que se puede decir del JSON sin mirar el disco. `pack` es null si hay algún error;
 * `diagramRefs` trae igualmente las pizarras de los ejercicios que sí se pudieron leer, para
 * que los errores de sus ficheros salgan en la misma tanda.
 */
function checkPack(raw: unknown): Checked {
  const shape = packShape.safeParse(raw, SHAPE_MESSAGES);
  if (!shape.success) {
    const issues = shape.error.issues.map(
      (issue) => `${pathOf("", issue.path) || PACK_FILE}: ${issue.message}`,
    );
    return { pack: null, issues, diagramRefs: [] };
  }

  const issues: string[] = [];
  const id = shape.data.id;
  const title = shape.data.title.trim();
  if (!isSlug(id)) issues.push(`id: ${KEY_FORM}`);
  if (title.length < 1 || title.length > MAX_PACK_TITLE) {
    issues.push(`title: escribe un título de 1 a ${MAX_PACK_TITLE} caracteres.`);
  }
  if (shape.data.drills.length === 0) issues.push("drills: el paquete no trae ningún ejercicio.");

  const drills: PackDrill[] = [];
  const diagramRefs: DiagramRef[] = [];
  const keys = new Set<string>();

  shape.data.drills.forEach((rawDrill, index) => {
    const where = `drills[${index}]`;
    const parsed = drillShape.safeParse(rawDrill, SHAPE_MESSAGES);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) issues.push(`${pathOf(where, issue.path)}: ${issue.message}`);
      return;
    }

    const drill = parsed.data;
    const prefix = `${where} «${drill.key}» · `;
    const found: string[] = [];

    if (!isSlug(drill.key)) found.push(`key: ${KEY_FORM}`);
    else if (keys.has(drill.key)) found.push("key: está repetida.");
    keys.add(drill.key);

    const form = drillInputSchema.safeParse(toFormInput(drill));
    if (!form.success) {
      for (const issue of form.error.issues) found.push(`${pathOf("", issue.path)}: ${issue.message}`);
    }

    found.push(...slugIssues("focus", drill.focus), ...slugIssues("principles", drill.principles ?? []));

    const diagram = drill.diagram ?? null;
    if (diagram !== null) {
      if (isDiagramPath(diagram)) diagramRefs.push({ prefix, key: drill.key, diagram });
      else found.push(`diagram: ${DIAGRAM_FORM}`);
    }

    issues.push(...found.map((issue) => `${prefix}${issue}`));
    if (!form.success) return;

    // Los textos, tal como los deja el formulario: recortados y sin elementos vacíos.
    const input = form.data;
    drills.push({
      key: drill.key,
      title: input.title,
      age: [input.minAge, input.maxAge],
      players: [input.minPlayers, input.maxPlayers],
      minutes: [input.minMinutes, input.maxMinutes],
      focus: drill.focus,
      principles: drill.principles ?? [],
      equipment: input.equipment,
      objective: input.objective,
      setupMd: input.setupMd,
      points: input.coachingPoints.map((point) => ({ text: point.text, key: point.isKey })),
      variants: input.variants,
      diagram,
      status: drill.status ?? "published",
    });
  });

  return { pack: issues.length === 0 ? { id, title, drills } : null, issues, diagramRefs };
}

/** El paquete de un JSON ya leído, o un `PackError` con todo lo que tiene mal. No mira el disco. */
export function parsePack(raw: unknown): Pack {
  const { pack, issues } = checkPack(raw);
  if (pack === null) throw new PackError(issues);
  return pack;
}

// ── Disco ────────────────────────────────────────────────────────────────────────────

/** Los primeros bytes de un fichero: los que bastan para saber qué imagen es. */
async function headOf(file: string): Promise<Uint8Array> {
  const handle = await open(file, "r");
  try {
    const { buffer, bytesRead } = await handle.read(new Uint8Array(16), 0, 16, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** La pizarra de `ref`, comprobada en disco, o lo que tiene mal. */
async function checkDiagram(dir: string, ref: DiagramRef): Promise<PackDiagram | string> {
  const file = path.join(dir, ...ref.diagram.split("/"));
  const type = ref.diagram.slice(ref.diagram.lastIndexOf(".") + 1) as DiagramType;

  const info = await stat(file).catch(() => null);
  if (info === null || !info.isFile()) return `diagram: no existe ${ref.diagram}.`;
  if (info.size < 1) return `diagram: ${ref.diagram} está vacío.`;
  if (info.size > MAX_DIAGRAM_BYTES) return `diagram: ${ref.diagram} pesa más de 2 MB.`;
  // Manda el contenido, no el nombre: un SVG o un HTML renombrado a `.png` no entra.
  if (sniffImageType(await headOf(file)) !== type) {
    return `diagram: ${ref.diagram}: su contenido no es una imagen ${type}.`;
  }
  return { file, type, bytes: info.size };
}

/**
 * Lee el paquete de `dir` y lo valida entero: el JSON y el fichero de cada pizarra. Lanza un
 * solo `PackError` con todos los problemas, los del contenido y los de los ficheros.
 */
export async function loadPack(dir: string): Promise<LoadedPack> {
  const root = path.resolve(dir);

  let text: string;
  try {
    text = await readFile(path.join(root, PACK_FILE), "utf8");
  } catch {
    throw new PackError([`No hay ${PACK_FILE} en ${root}.`]);
  }

  let raw: unknown;
  try {
    // Un editor de Windows puede guardar el fichero con BOM, y `JSON.parse` no lo admite.
    raw = JSON.parse(text.charCodeAt(0) === BOM ? text.slice(1) : text);
  } catch (error) {
    throw new PackError([
      `${PACK_FILE} no es un JSON válido: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  const { pack, issues, diagramRefs } = checkPack(raw);
  const diagrams = new Map<string, PackDiagram>();
  for (const ref of diagramRefs) {
    const checked = await checkDiagram(root, ref);
    if (typeof checked === "string") issues.push(`${ref.prefix}${checked}`);
    else diagrams.set(ref.key, checked);
  }

  if (pack === null || issues.length > 0) throw new PackError(issues);
  return { dir: root, pack, diagrams };
}
