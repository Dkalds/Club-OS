# CLUB OS · Importador de contenido y paquete «Biblioteca del entrenador» — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un comando repetible, `pnpm content:import <carpeta> --club <slug>`, carga en la biblioteca de un club un paquete de contenido (un `pack.json` y sus pizarras), y el repositorio trae el primer paquete real: los 44 ejercicios comunes del manual de pista del club piloto.

**Architecture:** Cuatro módulos en `scripts/content/`: `pack.ts` lee y valida el paquete, `rows.ts` lo convierte en filas con ids deterministas (puro, sin disco ni red), `import.ts` escribe con la clave de servicio y deshace lo que creó si algo falla, y `guard.ts` impide escribir en un Supabase remoto sin pedirlo. Un CLI fino (`scripts/content-import.ts`) los une. El contenido vive en `content/<club>/<paquete>/`. No hay migraciones ni cambios en `src/`.

**Tech Stack:** el del repositorio (TypeScript estricto, `tsx`, Vitest, `@supabase/supabase-js`, Zod 4, `uuid`). Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-10-10-importador-de-contenido-design.md`. Trae el formato del paquete, la traducción del manual a la ficha y la tabla de los 44 ejercicios; este plan no los repite.

## Antes de empezar (no es código)

- Docker en marcha, `pnpm supabase start` (con Storage) y `.env.local` con las claves de `pnpm supabase status -o env`. Si otra sesión tiene levantado el Supabase local del checkout principal, esta worktree usa el suyo: `project_id` y puertos propios en `supabase/config.toml`, marcado con `git update-index --skip-worktree`.
- `pnpm seed` antes de los tests de integración.
- El Word del manual (`Biblioteca_Entrenador_CB_Arcangel_Edicion_Revisada.docx`) lo tiene el propietario fuera del repositorio. Solo lo necesita la Task 5.

## Global Constraints

- **El seed y sus tests no cambian:** nada bajo `scripts/seed/`, `scripts/seed.ts` ni `e2e/` se edita.
- **Sin migraciones y sin cambios en `src/`.** De `src/` solo se importa: `drillInputSchema` (`@/modules/drills/schema`), `sniffImageType`, `MAX_DIAGRAM_BYTES`, `DIAGRAM_MIME` y `DiagramType` (`@/modules/media/diagram-file`), `slugify` (`@/modules/methodology/slug`) y los tipos de `@/lib/database.types`.
- **La clave de servicio solo en `scripts/`** (regla 2). El cliente sale de `createAdminClient` (`scripts/lib/admin-client.ts`).
- **Ningún club en el código.** `scripts/content/**` no nombra ningún club real; el único contenido de un club es su paquete en `content/`. El paquete de ejemplo es ficticio (regla 5).
- **Nunca se escribe en un Supabase remoto en esta entrega.** Los tests de integración se saltan si la URL no es local (`isLocalSupabaseUrl`, de `scripts/seed/guard.ts`).
- **Mensajes en español, frases cortas, sin exclamaciones ni emoji.** Los textos que este plan da entre comillas se copian tal cual.
- **Límites que el paquete respeta:** título 3–80, objetivo ≤ 500, desarrollo ≤ 5.000, punto 1–140, hasta 8 puntos y 3 clave, hasta 5 variantes (título 1–80, descripción ≤ 500), hasta 12 de material, jugadores 1–40, minutos 1–120, edad 8–18, al menos un objetivo de trabajo, pizarra de 1 byte a 2 MiB en `.png`, `.jpg` o `.webp`.
- TypeScript estricto y sin `any`. TDD: test que falla, código mínimo, test en verde, commit. Antes de cerrar, también `TZ=UTC pnpm test`.

## Review Focus

Lo que la especificación implica y es más fácil que falle en uso real. Cada línea tiene su test en la tarea que se indica.

1. **`--update` después de guardar el ejercicio en la app.** La app sustituye los puntos por otros con ids nuevos en las mismas posiciones (`unique (drill_id, sort)`); el importador tiene que borrar lo que sobra antes de escribir, o choca. (Task 3, caso 4.)
2. **Restos de una ejecución cortada.** Un objeto en Storage y su ficha de medios sin ejercicio: la siguiente ejecución tiene que completar, no fallar con «ya existe». (Task 3, caso 8.)
3. **Una pizarra que no es lo que dice su extensión** (un SVG o un HTML renombrado a `.png`): se rechaza al validar, antes de subir nada. (Task 1.)
4. **Windows.** Carpeta del paquete con espacios en la ruta, `pack.json` guardado con BOM y rutas de pizarra con barra invertida. Los dos primeros funcionan; la barra invertida se rechaza con su mensaje. (Task 1.)
5. **Un club que no existe o mal escrito** (`--club Arcangel`): error que lo dice, sin confundirse con «faltan objetivos de trabajo», y sin escribir. (Task 3, caso 5.)

---

### Task 1: El paquete: formato, lectura y validación

**Files:**
- Create: `scripts/content/pack.ts`
- Create: `scripts/content/fixtures/pack-ejemplo/pack.json`
- Create: `scripts/content/fixtures/pack-ejemplo/diagrams/rueda-de-pases-en-estrella.png`
- Test: `scripts/content/pack.test.ts`

**Interfaces:**
- Consumes: `drillInputSchema`, `sniffImageType`, `MAX_DIAGRAM_BYTES`, `DiagramType` (ver Global Constraints).
- Produces:

```ts
export const PACK_FILE = "pack.json";
export type PackDrill = {
  key: string;
  title: string;
  age: [min: number, max: number | null];
  players: [min: number, max: number];
  minutes: [min: number, max: number];
  focus: string[];
  principles: string[];
  equipment: string[];
  objective: string | null;
  setupMd: string | null;
  points: { text: string; key: boolean }[];
  variants: { title: string; description: string | null }[];
  diagram: string | null; // ruta relativa al paquete, con «/»
  status: "published" | "draft";
};
export type Pack = { id: string; title: string; drills: PackDrill[] };
export type PackDiagram = { file: string; type: DiagramType; bytes: number }; // `file`, absoluta
export type LoadedPack = { dir: string; pack: Pack; diagrams: Map<string, PackDiagram> }; // clave: `key` del ejercicio
export class PackError extends Error { readonly issues: string[]; constructor(issues: string[]) }
export function parsePack(raw: unknown): Pack; // lanza PackError
export function loadPack(dir: string): Promise<LoadedPack>; // lanza PackError
```

- [ ] **Step 1: Crear el paquete de ejemplo**

`scripts/content/fixtures/pack-ejemplo/pack.json`:

```json
{
  "id": "pack-ejemplo",
  "title": "Paquete de ejemplo",
  "drills": [
    {
      "key": "rueda-de-pases-en-estrella",
      "title": "Rueda de pases en estrella",
      "age": [10, null],
      "players": [5, 12],
      "minutes": [8, 10],
      "focus": ["tecnica"],
      "equipment": ["Balones"],
      "objective": "Pasar y moverse sin perder de vista el siguiente pase.",
      "setupMd": "**Montaje.** Cinco filas en estrella y un balón.\n\n**Secuencia.** Cada jugador pasa a la segunda fila a su derecha y sigue su pase.",
      "points": [
        { "text": "Manos preparadas antes de recibir", "key": true },
        { "text": "Paso hacia el pase" }
      ],
      "variants": [
        { "title": "Con dos balones", "description": "Entra un segundo balón cuando el ritmo es estable." }
      ],
      "diagram": "diagrams/rueda-de-pases-en-estrella.png"
    },
    {
      "key": "dos-contra-uno-en-carrera",
      "title": "Dos contra uno en carrera",
      "age": [12, 16],
      "players": [3, 9],
      "minutes": [6, 8],
      "focus": ["transicion", "ataque"],
      "principles": ["transicion"],
      "status": "draft"
    }
  ]
}
```

La pizarra es un PNG de 1×1. Créala desde la raíz del repo:

```bash
node -e "const fs=require('fs');fs.mkdirSync('scripts/content/fixtures/pack-ejemplo/diagrams',{recursive:true});fs.writeFileSync('scripts/content/fixtures/pack-ejemplo/diagrams/rueda-de-pases-en-estrella.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'))"
```

- [ ] **Step 2: Escribir los tests que fallan** (`scripts/content/pack.test.ts`)

Andamiaje: `FIXTURE = path.resolve(import.meta.dirname, "fixtures/pack-ejemplo")`, `KEY = "rueda-de-pases-en-estrella"`, `raw()` lee y parsea el JSON de ejemplo y lo devuelve como un objeto suelto que los tests mutan (con un tipo propio, sin `any`), `issuesOf(fn)` devuelve `PackError.issues` de lo que `fn` lanza (o de la promesa que rechaza), y `copyOfFixture()` copia el paquete a `mkdtemp(path.join(tmpdir(), "pack con espacio-"))` y devuelve la ruta (se borra en `afterEach`).

```ts
describe("parsePack", () => {
  it("acepta el paquete de ejemplo y rellena lo opcional", () => {
    const pack = parsePack(raw());
    expect(pack.id).toBe("pack-ejemplo");
    expect(pack.drills.map((d) => d.key)).toEqual([KEY, "dos-contra-uno-en-carrera"]);
    expect(pack.drills[0]).toMatchObject({ status: "published", principles: [], age: [10, null] });
    expect(pack.drills[0].points).toEqual([
      { text: "Manos preparadas antes de recibir", key: true },
      { text: "Paso hacia el pase", key: false },
    ]);
    expect(pack.drills[1]).toMatchObject({
      status: "draft", equipment: [], objective: null, setupMd: null,
      points: [], variants: [], diagram: null, age: [12, 16],
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
    ]) expect(text).toContain(fragment);
  });

  it.each([
    ["jugadores al revés", (d) => { d.players = [8, 4]; }, "maxPlayers: El máximo de jugadores no puede ser menor que el mínimo."],
    ["9 puntos", (d) => { d.points = Array.from({ length: 9 }, (_, i) => ({ text: `Punto ${i}` })); }, "coachingPoints: Un ejercicio admite hasta 8 puntos."],
    ["4 puntos clave", (d) => { d.points = Array.from({ length: 4 }, (_, i) => ({ text: `Punto ${i}`, key: true })); }, "coachingPoints: Marca como clave 3 puntos como máximo."],
    ["6 variantes", (d) => { d.variants = Array.from({ length: 6 }, (_, i) => ({ title: `Variante ${i}` })); }, "variants: Un ejercicio admite hasta 5 variantes."],
    ["un objetivo repetido", (d) => { d.focus = ["tecnica", "tecnica"]; }, 'focus: "tecnica" está repetido.'],
    ["una clave con mayúsculas", (d) => { d.key = "Con Mayusculas"; }, "key: usa minúsculas, cifras y guiones, hasta 60 caracteres."],
    ["una pizarra con ruta absoluta", (d) => { d.diagram = "/abs.png"; }, "diagram: tiene que ser una ruta relativa"],
    ["una pizarra con unidad de disco", (d) => { d.diagram = "C:\\x.png"; }, "diagram: tiene que ser una ruta relativa"],
    ["una pizarra con barra invertida", (d) => { d.diagram = "diagrams\\x.png"; }, "diagram: tiene que ser una ruta relativa"],
    ["una pizarra .gif", (d) => { d.diagram = "diagrams/x.gif"; }, "diagram: tiene que ser una ruta relativa"],
  ])("rechaza %s", (_name, mutate, fragment) => {
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
    const dir = await copyOfFixture();
    const json = readFileSync(path.join(dir, PACK_FILE), "utf8");
    writeFileSync(path.join(dir, PACK_FILE), `\uFEFF${json}`, "utf8");
    expect((await loadPack(dir)).pack.drills).toHaveLength(2);
  });

  it("junta los errores del contenido y los de los ficheros", async () => {
    const dir = await copyOfFixture();
    const input = raw();
    input.drills[1].title = "ab";
    writeFileSync(path.join(dir, PACK_FILE), JSON.stringify(input), "utf8");
    rmSync(path.join(dir, "diagrams", `${KEY}.png`));
    const text = (await issuesOf(() => loadPack(dir))).join("\n");
    expect(text).toContain("drills[1] «dos-contra-uno-en-carrera» · title: Escribe un título de 3 a 80 caracteres.");
    expect(text).toContain(`drills[0] «${KEY}» · diagram: no existe diagrams/${KEY}.png.`);
  });
});
```

Y cinco casos más de `loadPack`, cada uno sobre una copia del paquete, con este resultado en `issues`:

| Caso | Cómo se provoca | `issues` contiene |
|---|---|---|
| Sin `pack.json` | Borrarlo | `No hay pack.json en ` seguido de la carpeta |
| JSON ilegible | Escribir `{` | `pack.json no es un JSON válido` |
| Contenido de otro tipo | Escribir `<svg xmlns="http://www.w3.org/2000/svg"/>` en el `.png` | `diagram: diagrams/${KEY}.png: su contenido no es una imagen png.` |
| Pizarra vacía | Dejar el `.png` con 0 bytes | `diagram: diagrams/${KEY}.png está vacío.` |
| Pizarra grande | `.png` de 2.097.153 bytes que empieza por la firma PNG | `diagram: diagrams/${KEY}.png pesa más de 2 MB.` |

- [ ] **Step 3: Verificar que fallan**

Run: `pnpm test scripts/content/pack.test.ts`
Expected: FAIL, no existe `./pack`.

- [ ] **Step 4: Implementar `scripts/content/pack.ts`**

Decisiones que el test no determina:

- **Dos pasadas.** La primera mira la forma con Zod y objetos estrictos: tipos, tuplas y propiedades conocidas; un error ahí se informa como `<ruta>: <mensaje de Zod>`, con la ruta en la forma `drills[1].players`. La segunda mira los valores de cada ejercicio cuya forma es correcta: forma y unicidad de `key`, repetidos en `focus` y `principles`, forma de `diagram` y `drillInputSchema`. Un ejercicio con errores de forma no pasa a la segunda.
- **`drillInputSchema`** recibe el ejercicio traducido a la entrada del formulario: `minAge`, `maxAge`, `minPlayers`, `maxPlayers`, `minMinutes`, `maxMinutes`, `coachingPoints` (`{ text, isKey }`), `variants`, `summary: null`, `videoUrl: null`, `diagramMediaId: null`, `standardIds: []`, y `focusAreaIds` y `principleIds` con un uuid de relleno por slug (`00000000-0000-0000-0000-000000000000`). Sus mensajes se informan con el nombre de campo que da Zod, y los textos que devuelve ya normalizados (recortados, vacíos fuera) son los que quedan en el `PackDrill`.
- **Formas.** `id` y `key`: `^[a-z0-9]+(-[a-z0-9]+)*$`, hasta 60 caracteres. Slugs de `focus` y `principles`: la misma forma. `title` del paquete: 1–120 caracteres tras recortar (`title: escribe un título de 1 a 120 caracteres.`). `diagram`: `^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*\.(png|jpg|webp)$` y ningún segmento `..`.
- **Prefijo de cada error de ejercicio:** `drills[<i>] «<key>» · <campo>: `. Si `key` no es un texto, `drills[<i>] · `. Una clave repetida se señala en la segunda aparición y en las siguientes, no en la primera.
- **`loadPack`** quita el BOM, valida el contenido y, para cada pizarra con ruta correcta, comprueba que existe, su tamaño (1 a `MAX_DIAGRAM_BYTES`) y que `sniffImageType` de sus primeros bytes coincide con la extensión. Lanza una sola `PackError` con todo. `PackError.message` es `El paquete no es válido:` y, debajo, una línea `- …` por error.

- [ ] **Step 5: Verificar que pasan**

Run: `pnpm test scripts/content/pack.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/content/pack.ts scripts/content/pack.test.ts scripts/content/fixtures
git commit -m "feat(content): formato y validación del paquete de contenido"
```

---

### Task 2: Filas e ids

**Files:**
- Create: `scripts/content/rows.ts`
- Test: `scripts/content/rows.test.ts`

**Interfaces:**
- Consumes: `LoadedPack`, `loadPack` (Task 1); `TablesInsert` de `@/lib/database.types`; `DIAGRAM_MIME`.
- Produces:

```ts
export const CONTENT_NAMESPACE = "08a75eb4-da1b-4637-bef7-00ab6759a019"; // no se cambia: de él salen todos los ids ya importados
export function contentId(organizationId: string, packId: string, key: string): string; // uuid v5 de `${organizationId}:${packId}:${key}`
export type ClubRefs = {
  organizationId: string;
  slug: string;
  focusAreas: { id: string; slug: string }[];
  principles: { id: string; slug: string }[];
};
export type PackDrillRows = {
  key: string;
  drill: TablesInsert<"drills"> & { id: string };
  media: (TablesInsert<"media_assets"> & { id: string }) | null;
  upload: { path: string; file: string; contentType: string } | null;
  points: (TablesInsert<"drill_coaching_points"> & { id: string })[];
  variants: (TablesInsert<"drill_variants"> & { id: string })[];
  focusAreas: TablesInsert<"drill_focus_areas">[];
  principles: TablesInsert<"drill_principles">[];
};
export class MissingRefsError extends Error { readonly missing: string[] }
export function buildPackRows(loaded: LoadedPack, refs: ClubRefs): PackDrillRows[]; // en el orden del paquete; lanza MissingRefsError
```

Claves de `contentId` por fila: ejercicio `drill:<key>`; punto `drill:<key>:point:<i>`; variante `drill:<key>:variant:<i>`; ficha del diagrama `drill:<key>:diagram`. `sort` empieza en 0.

- [ ] **Step 1: Escribir los tests que fallan** (`scripts/content/rows.test.ts`)

Andamiaje: `ORG = "11111111-1111-4111-8111-111111111111"`, `refs` con `slug: "club-de-prueba"`, los focos `tecnica`, `transicion` y `ataque` y el principio `transicion` (ids fijos cualesquiera), `focusId(slug)` y `principleId(slug)` que devuelven esos ids, `FIXTURE` y `KEY` como en la Task 1, y `loaded = await loadPack(FIXTURE)` en `beforeAll`.

```ts
describe("contentId", () => {
  it("es estable y cambia con cada una de sus partes", () => {
    const id = contentId(ORG, "pack-ejemplo", "drill:x");
    expect(contentId(ORG, "pack-ejemplo", "drill:x")).toBe(id);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const others = [
      contentId(ORG.replace("1", "2"), "pack-ejemplo", "drill:x"),
      contentId(ORG, "otro-paquete", "drill:x"),
      contentId(ORG, "pack-ejemplo", "drill:y"),
    ];
    expect(new Set([id, ...others]).size).toBe(4);
  });

  it("no coincide con el id que el seed da a un ejercicio con la misma clave", () => {
    const org = seedId("arcangel", "organization");
    expect(contentId(org, "pack-ejemplo", "drill:3x2-continuo")).not.toBe(seedId("arcangel", "drill:3x2-continuo"));
  });
});

describe("buildPackRows", () => {
  it("la ficha, la pizarra y los hijos del primer ejercicio", () => {
    const [first] = buildPackRows(loaded, refs);
    const id = contentId(ORG, "pack-ejemplo", `drill:${KEY}`);
    const mediaId = contentId(ORG, "pack-ejemplo", `drill:${KEY}:diagram`);
    const diagram = loaded.diagrams.get(KEY)!;
    const objectPath = `org/${ORG}/drills/${id}/${mediaId}.png`;
    expect(first.key).toBe(KEY);
    expect(first.drill).toEqual({
      id, organization_id: ORG, title: "Rueda de pases en estrella", summary: null,
      objective: "Pasar y moverse sin perder de vista el siguiente pase.",
      setup_md: loaded.pack.drills[0].setupMd,
      min_players: 5, max_players: 12, min_minutes: 8, max_minutes: 10, min_age: 10, max_age: null,
      equipment: ["Balones"], diagram_media_id: mediaId, video_url: null, status: "published", created_by: null,
    });
    expect(first.media).toEqual({
      id: mediaId, organization_id: ORG, bucket: "club-media", path: objectPath,
      kind: "image", mime: "image/png", bytes: diagram.bytes, contains_minor: false, created_by: null,
    });
    expect(first.upload).toEqual({ path: objectPath, file: diagram.file, contentType: "image/png" });
    expect(objectPath).toMatch(/^org\/[0-9a-f-]{36}\/drills\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/);
    expect(first.points).toEqual([
      { id: contentId(ORG, "pack-ejemplo", `drill:${KEY}:point:0`), organization_id: ORG, drill_id: id, text: "Manos preparadas antes de recibir", is_key: true, sort: 0 },
      { id: contentId(ORG, "pack-ejemplo", `drill:${KEY}:point:1`), organization_id: ORG, drill_id: id, text: "Paso hacia el pase", is_key: false, sort: 1 },
    ]);
    expect(first.variants).toEqual([
      { id: contentId(ORG, "pack-ejemplo", `drill:${KEY}:variant:0`), organization_id: ORG, drill_id: id, title: "Con dos balones", description: "Entra un segundo balón cuando el ritmo es estable.", sort: 0 },
    ]);
    expect(first.focusAreas).toEqual([{ organization_id: ORG, drill_id: id, focus_area_id: focusId("tecnica") }]);
    expect(first.principles).toEqual([]);
  });

  it("un ejercicio sin pizarra, en borrador y con edad máxima", () => {
    const [, second] = buildPackRows(loaded, refs);
    expect(second.media).toBeNull();
    expect(second.upload).toBeNull();
    expect(second.drill).toMatchObject({ diagram_media_id: null, status: "draft", min_age: 12, max_age: 16, equipment: [] });
    expect(second.focusAreas.map((row) => row.focus_area_id)).toEqual([focusId("transicion"), focusId("ataque")]);
    expect(second.principles.map((row) => row.principle_id)).toEqual([principleId("transicion")]);
  });

  it("todas las fichas llevan las mismas columnas, para escribirlas en un solo lote", () => {
    const [a, b] = buildPackRows(loaded, refs).map((rows) => Object.keys(rows.drill).sort());
    expect(a).toEqual(b);
  });

  it("dice todo lo que le falta al club, una vez cada cosa y en orden", () => {
    const poor = { ...refs, focusAreas: refs.focusAreas.filter((f) => f.slug !== "ataque"), principles: [] };
    let error: unknown;
    try { buildPackRows(loaded, poor); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(MissingRefsError);
    expect((error as MissingRefsError).missing).toEqual(['el objetivo de trabajo "ataque"', 'el principio "transicion"']);
    expect((error as MissingRefsError).message).toBe(
      'En club-de-prueba faltan: el objetivo de trabajo "ataque", el principio "transicion".',
    );
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `pnpm test scripts/content/rows.test.ts`
Expected: FAIL, no existe `./rows`.

- [ ] **Step 3: Implementar `scripts/content/rows.ts`**

Puro: sin disco, sin red, sin reloj. `contentId` usa `v5` de `uuid` con `CONTENT_NAMESPACE`. El objeto de Storage se llama `org/<organizationId>/drills/<id del ejercicio>/<id de la ficha>.<tipo>`, con el tipo de `PackDiagram.type`, y su MIME sale de `DIAGRAM_MIME`.

- [ ] **Step 4: Verificar que pasan**

Run: `pnpm test scripts/content/rows.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/content/rows.ts scripts/content/rows.test.ts
git commit -m "feat(content): filas e ids deterministas de un paquete"
```

---

### Task 3: La escritura: barrera de destino, crear, actualizar y deshacer

**Files:**
- Create: `scripts/content/guard.ts`
- Create: `scripts/content/import.ts`
- Test: `scripts/content/guard.test.ts`
- Test: `scripts/content/import.int.test.ts`

**Interfaces:**
- Consumes: `loadPack`, `PackError` (Task 1); `buildPackRows`, `contentId`, `PackDrillRows`, `MissingRefsError` (Task 2); `createAdminClient`, `readSupabaseEnv` (`scripts/lib/admin-client.ts`); `isLocalSupabaseUrl` (`scripts/seed/guard.ts`); en el test, `signInAs` (`scripts/lib/user-client.ts`) y `seedId` (`scripts/seed/ids.ts`).
- Produces:

```ts
// scripts/content/guard.ts
export function assertImportTarget(url: string, env: Record<string, string | undefined>): void;

// scripts/content/import.ts
export type ImportOptions = { dir: string; club: string; update?: boolean };
export type ImportReport = {
  club: string;
  pack: { id: string; title: string };
  created: string[]; // `key` de cada ejercicio, en el orden del paquete
  skipped: string[];
  updated: string[];
};
export class ImportError extends Error {}
export function importPack(options: ImportOptions, client?: SupabaseClient<Database>): Promise<ImportReport>;
```

- [ ] **Step 1: Tests de la barrera** (`scripts/content/guard.test.ts`)

```ts
it("acepta un Supabase local", () => {
  for (const url of ["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"]) {
    expect(() => assertImportTarget(url, {})).not.toThrow();
  }
});
it("rechaza un remoto, también con el permiso del seed", () => {
  const message =
    "Importación bloqueada: NEXT_PUBLIC_SUPABASE_URL apunta a abc.supabase.co, que no es un Supabase local. " +
    "Si es el destino que quieres, ejecuta con ALLOW_REMOTE_IMPORT=true.";
  expect(() => assertImportTarget("https://abc.supabase.co", {})).toThrow(message);
  expect(() => assertImportTarget("https://abc.supabase.co", { ALLOW_REMOTE_SEED: "true" })).toThrow(message);
  expect(() => assertImportTarget("https://abc.supabase.co", { ALLOW_REMOTE_IMPORT: "1" })).toThrow(message);
});
it("acepta un remoto con ALLOW_REMOTE_IMPORT=true", () => {
  expect(() => assertImportTarget("https://abc.supabase.co", { ALLOW_REMOTE_IMPORT: "true" })).not.toThrow();
});
```

Una URL que no se puede leer se nombra como `una URL que no se puede interpretar`, igual que en el seed.

- [ ] **Step 2: Implementar `scripts/content/guard.ts`, test en verde y commit**

Run: `pnpm test scripts/content/guard.test.ts` → PASS.

```bash
git add scripts/content/guard.ts scripts/content/guard.test.ts
git commit -m "feat(content): barrera de destino del importador"
```

- [ ] **Step 3: Escribir el test de integración que falla** (`scripts/content/import.int.test.ts`)

Sigue el patrón de `scripts/media/storage.int.test.ts`: `describe.skipIf(!isLocalSupabaseUrl(url))`, sesiones con `signInAs` en `beforeAll` (60 s) y limpieza con la clave de servicio.

Andamiaje:
- `ARCANGEL = seedId("arcangel", "organization")`, `DEMO = seedId("club-demo", "organization")`, `PACK = "pack-ejemplo"`, `K1 = "rueda-de-pases-en-estrella"`, `K2 = "dos-contra-uno-en-carrera"`.
- `ids(org)` da, con `contentId`, los ids de los dos ejercicios y el de la ficha del diagrama de `K1`, y `objectPath(org)` la ruta del objeto.
- `cleanup()` borra, en los dos clubes: los dos ejercicios (sus hijos caen en cascada), la ficha de medios y todo objeto de las carpetas `org/<org>/drills/<ejercicio>/`. Corre en `beforeAll` (por si una ejecución anterior murió) y en `afterEach`.
- `copyOfFixture()` como en la Task 1.
- `failingOn(client, table)`: un `Proxy` del cliente cuyo `from(table)` devuelve, para `insert` y `upsert`, `{ data: null, error: { message: "fallo provocado" } }`; el resto de tablas, `storage` y `auth` pasan al cliente real.
- `savedInApp(drillId)`: lo que hace `save_drill` al guardar desde la app, con la clave de servicio: cambia el título a `Editado en la app`, pone `diagram_media_id` a null, borra los puntos del ejercicio e inserta tres nuevos con `randomUUID()` y `sort` 0, 1 y 2, y enlaza el ejercicio a un Standard cualquiera del club (`drill_standards`).

Casos (cada uno importa en `arcangel` salvo que diga otra cosa, con `importPack({ dir: FIXTURE, club: "arcangel" }, admin)`):

1. **Crea.** El informe es `{ club: "arcangel", pack: { id: PACK, title: "Paquete de ejemplo" }, created: [K1, K2], skipped: [], updated: [] }`. En la base: `K1` publicado, sin autor y con `diagram_media_id` igual al id de la ficha; 2 puntos, 1 variante y 1 objetivo de trabajo. `K2` en borrador, con 2 objetivos y 1 principio. El objeto existe en Storage y la ficha de medios dice `mime: "image/png"` y los bytes del fichero.
2. **Quién lo ve.** Irene (`irene@arcangel.test`, entrenadora) lee `K1` por id, firma su pizarra con `createSignedUrl(path, 60)` y al descargarla recibe 200 con `content-type: image/png`; no ve `K2`. Raúl (`raul@arcangel.test`, dirección) ve los dos. Marta (`marta@demo.test`, otro club) no ve ninguno y su `createSignedUrl` da error.
3. **Repetir no cambia nada.** La segunda ejecución informa `created: []`, `skipped: [K1, K2]`, `updated: []`, y el `updated_at` de los dos ejercicios es el mismo que tras la primera.
4. **Lo editado en la app manda, salvo `--update`.** Tras importar, `savedInApp(K1)`. Sin `update`: el título sigue siendo `Editado en la app` y hay 3 puntos. Con `update: true`: informe `created: []`, `skipped: []`, `updated: [K1, K2]`; el título vuelve a `Rueda de pases en estrella`, los puntos son exactamente los dos del paquete (por id), `diagram_media_id` vuelve a la ficha y el Standard enlazado sigue enlazado.
5. **Club que no existe.** `club: "no-existe"` y `club: "Arcangel"` rechazan con `ImportError` y mensaje `No existe el club "no-existe".` (y el suyo). No hay ejercicios ni objetos del paquete en ningún club.
6. **Referencia rota.** `club: "club-demo"` rechaza con `MissingRefsError` cuyo `missing` es `['el principio "transicion"']`. No hay ejercicios, fichas ni objetos del paquete en `DEMO`.
7. **Fallo a mitad.** Con `failingOn(admin, "drill_variants")` rechaza con `ImportError` cuyo mensaje contiene `drill_variants` y `fallo provocado`. Después, con el cliente real: ni ejercicios, ni ficha de medios, ni objeto.
8. **Restos de una ejecución cortada.** Antes de importar, subir el PNG a `objectPath(ARCANGEL)` e insertar su ficha de medios con el id determinista. La importación informa `created: [K1, K2]` y `K1` queda enlazado a esa ficha.
9. **`--update` con otra pizarra.** Importar; en una copia del paquete, cambiar la pizarra de `K1` por `diagrams/otra.jpg` (un fichero que empieza por `FF D8 FF`) e importar con `update: true`: la ficha de medios apunta a la ruta `.jpg` con `mime: "image/jpeg"` y el objeto `.png` ya no está. En otra copia, quitar `diagram` de `K1` e importar con `update: true`: `diagram_media_id` es null y no quedan ni la ficha ni el objeto.

- [ ] **Step 4: Verificar que falla**

Run: `pnpm test:int scripts/content`
Expected: FAIL, no existe `./import`.

- [ ] **Step 5: Implementar `scripts/content/import.ts`**

Orden y reglas:

1. `loadPack(options.dir)`.
2. Sin `client`: `assertImportTarget(readSupabaseEnv().url, process.env)` y `createAdminClient()`.
3. El club, por `organizations.slug` exacto. Si no está: `ImportError('No existe el club "<slug>".')`.
4. `focus_areas` y `game_principles` del club (`id, slug`) y `buildPackRows`.
5. Qué existe: `drills` por id. Sin `update`, lo que existe va a `skipped` y no se toca. Con `update`, va a `updated`.
6. Antes de escribir, leer las fichas de medios que ya existen con los ids deterministas de los ejercicios a actualizar (`id, path`).
7. Escribir lo creado y lo actualizado, en este orden:
   1. objetos de Storage, bucket `club-media`, con `upsert: true` y su `contentType`;
   2. `media_assets`, `upsert` por `id`;
   3. `drills`: `insert` de los nuevos y `upsert` por `id` de los actualizados;
   4. de cada ejercicio escrito, borrar lo que sobra **antes** de escribir sus hijos: puntos y variantes cuyo id no está en su lista, y vínculos de objetivos de trabajo y principios que el paquete no trae. Los Standards no se tocan;
   5. `upsert` de puntos y variantes por `id`, y de vínculos por `drill_id,focus_area_id` y `drill_id,principle_id`.
8. Solo para lo actualizado y cuando todo lo anterior ha ido bien: si la ruta anterior de la ficha es distinta de la nueva, o ya no hay pizarra, se borra el objeto anterior; si ya no hay pizarra, también la ficha.
9. Cada respuesta de Supabase se comprueba. Ante el primer error: se deshace lo **creado** en esta ejecución (ejercicios, fichas de medios, objetos, en ese orden) y se lanza `ImportError` con `No se pudo escribir <tabla o "el objeto <ruta>">: <mensaje>.`; si deshacer también falla, el mensaje lo añade. Lo actualizado no se deshace.

No se reutiliza `deleteStaleDrillChildren` del seed: es privada de `scripts/seed/run.ts` y el seed no se toca.

- [ ] **Step 6: Verificar que pasa**

Run: `pnpm test:int scripts/content`
Expected: PASS, 9 casos.

Run: `pnpm test:int`
Expected: PASS entera. El importador limpia lo suyo y el test del seed sigue contando sus 21 ejercicios.

- [ ] **Step 7: Commit**

```bash
git add scripts/content/import.ts scripts/content/import.int.test.ts
git commit -m "feat(content): importación de un paquete en la biblioteca de un club"
```

---

### Task 4: El comando y su documentación

**Files:**
- Create: `scripts/content/cli.ts`
- Create: `scripts/content-import.ts`
- Create: `content/README.md`
- Modify: `package.json` (script `content:import`)
- Modify: `README.md` (sección nueva y fila de `pnpm test:int`)
- Test: `scripts/content/cli.test.ts`
- Test: `scripts/content-import.test.ts`

**Interfaces:**
- Consumes: `importPack`, `ImportReport`, `ImportError` (Task 3); `assertImportTarget` (Task 3); `PackError` (Task 1); `MissingRefsError` (Task 2); `readSupabaseEnv`.
- Produces:

```ts
// scripts/content/cli.ts
export const USAGE = "Uso: pnpm content:import <carpeta del paquete> --club <slug del club> [--update]";
export class UsageError extends Error {} // su mensaje es USAGE
export function parseCliArgs(argv: string[]): { dir: string; club: string; update: boolean };
export function formatReport(report: ImportReport, host: string): string[];
```

- [ ] **Step 1: Tests de los ayudantes** (`scripts/content/cli.test.ts`)

```ts
it("lee la carpeta, el club y --update en cualquier orden", () => {
  expect(parseCliArgs(["content/x/y", "--club", "club-demo"])).toEqual({ dir: "content/x/y", club: "club-demo", update: false });
  expect(parseCliArgs(["--update", "--club=club-demo", "content/x/y"])).toEqual({ dir: "content/x/y", club: "club-demo", update: true });
});
it.each([
  [[]], [["content/x/y"]], [["--club", "club-demo"]], [["a", "b", "--club", "c"]], [["a", "--club", "c", "--force"]], [["a", "--club", ""]],
])("sin carpeta, sin club, con dos carpetas o con una opción desconocida: uso (%j)", (argv) => {
  expect(() => parseCliArgs(argv)).toThrow(UsageError);
  expect(() => parseCliArgs(argv)).toThrow(USAGE);
});
it("el informe", () => {
  const report = { club: "club-demo", pack: { id: "pack-ejemplo", title: "Paquete de ejemplo" }, created: ["a", "b"], skipped: ["c"], updated: [] };
  expect(formatReport(report, "127.0.0.1:54321")).toEqual([
    "Paquete «Paquete de ejemplo» (pack-ejemplo) en club-demo · 127.0.0.1:54321.",
    "Creados: 2. Ya existían: 1. Actualizados: 0.",
    "Los que ya existían no se han tocado. Para devolverlos a lo que dice el paquete, repite con --update.",
  ]);
  expect(formatReport({ ...report, skipped: [] }, "127.0.0.1:54321")).toHaveLength(2);
});
```

- [ ] **Step 2: Tests del CLI** (`scripts/content-import.test.ts`)

Con el andamiaje de `scripts/seed.test.ts`: `vi.mock` de `./content/import` (solo `importPack`; `ImportError` real) y de `./lib/admin-client` (`readSupabaseEnv`), `vi.resetModules()`, `process.argv` puesto a mano e importación del CLI por su ruta. `process.exitCode` se restaura en `afterEach`.

| Caso | `argv` y entorno | Se espera |
|---|---|---|
| Camino feliz | `content/x/y --club club-demo`, URL local | `importPack` llamado una vez con `{ dir: path.resolve("content/x/y"), club: "club-demo", update: false }`; `console.log` recibe las líneas de `formatReport`; `exitCode` sin tocar |
| Uso | sin `--club` | `console.error(USAGE)`, `exitCode` 1, `importPack` sin llamar |
| Remoto | URL `https://abc.supabase.co` | `console.error` con `Importación bloqueada`, `exitCode` 1, `importPack` sin llamar |
| Paquete no válido | `importPack` rechaza con `new PackError(["uno", "dos"])` | `console.error` recibe el mensaje con `- uno` y `- dos`; `exitCode` 1 |
| Importado, no ejecutado | importar el módulo sin que `process.argv[1]` sea su ruta | `importPack` sin llamar |

- [ ] **Step 3: Verificar que fallan**

Run: `pnpm test scripts/content/cli.test.ts scripts/content-import.test.ts`
Expected: FAIL, no existen los módulos.

- [ ] **Step 4: Implementar**

- `scripts/content/cli.ts`: `parseCliArgs` con `parseArgs` de `node:util` (`allowPositionals`, `strict`); cualquier error de `parseArgs` se convierte en `UsageError`.
- `scripts/content-import.ts`: como `scripts/demo-password.ts`. `main` lee los argumentos, llama a `readSupabaseEnv`, `assertImportTarget(url, process.env)`, `importPack` y escribe el informe con el host de la URL. Solo corre como CLI (la misma comprobación de `process.argv[1]`). En el `catch`: mensaje por `console.error` y `process.exitCode = 1`, nunca `process.exit`.
- `package.json`: `"content:import": "tsx scripts/content-import.ts"`, después de `"seed"`.

- [ ] **Step 5: Verificar que pasan y probar a mano**

Run: `pnpm test scripts/content`
Expected: PASS.

Run: `pnpm content:import scripts/content/fixtures/pack-ejemplo --club arcangel`
Expected: `Creados: 2. Ya existían: 0. Actualizados: 0.` Repetido: `Creados: 0. Ya existían: 2.` y la línea de `--update`.

Deja la base como estaba: `pnpm supabase db reset` y `pnpm seed`.

- [ ] **Step 6: Documentar**

- `content/README.md`: qué es un paquete, el árbol de carpetas, cada campo de `pack.json` (tipo, obligatorio u opcional, valor por defecto y límite) y el comando. El contenido sale de «El paquete» y «El importador» de la especificación.
- `README.md`, sección nueva `## Contenido de un club`, antes de `## Entorno remoto`: el comando; que solo crea lo que falta y `--update` sobrescribe; que solo escribe en local salvo `ALLOW_REMOTE_IMPORT=true`, puesta desde la shell y nunca en `.env.local`; y dos avisos: los e2e en local borran lo importado, y `pnpm test:int` cuenta los ejercicios del seed, así que con un paquete importado falla hasta volver a `pnpm supabase db reset` y `pnpm seed`.
- `README.md`, tabla de «Tests», fila de `pnpm test:int`: añadir el importador de contenido (`scripts/content/import.int.test.ts`).

- [ ] **Step 7: Commit**

```bash
git add scripts/content/cli.ts scripts/content/cli.test.ts scripts/content-import.ts scripts/content-import.test.ts content/README.md package.json README.md
git commit -m "feat(content): comando content:import y su documentación"
```

---

### Task 5: El paquete «Biblioteca del entrenador»

**Files:**
- Create: `content/arcangel/biblioteca-entrenador-2026/pack.json`
- Create: `content/arcangel/biblioteca-entrenador-2026/diagrams/NN-<key>.png` (44)
- Test: `scripts/content/packs.test.ts`

**Interfaces:**
- Consumes: `loadPack` (Task 1); `slugify` (`@/modules/methodology/slug`).
- Produces: el paquete que la Task 6 importa.

- [ ] **Step 1: Escribir el test que falla** (`scripts/content/packs.test.ts`)

```ts
const CONTENT = path.resolve(import.meta.dirname, "../../content");
/** Cada carpeta `content/<club>/<paquete>/` que tiene un pack.json. */
function packDirs(): string[];

it("hay paquetes y todos validan", async () => {
  const dirs = packDirs();
  expect(dirs.length).toBeGreaterThan(0);
  for (const dir of dirs) await expect(loadPack(dir), dir).resolves.toBeDefined();
});
```

Y un `describe("biblioteca-entrenador-2026")` sobre `content/arcangel/biblioteca-entrenador-2026`, con una tabla `EXPECTED` de 44 filas copiada de «Edad, jugadores y material de los 44» de la especificación: `[n, título, objetivo, edad, [mín, máx], material]`. Por ejemplo, `[1, "Sellar al tirador", "rebote", 12, [4, 12], ["Balones"]]` y `[43, "Finalizar con contacto controlado", "tecnica", 10, [2, 12], ["Balones", "Almohadilla de contacto"]]`.

- **«trae los 44 ejercicios de la tabla, en su orden»:** el paquete tiene `id: "biblioteca-entrenador-2026"` y, para cada fila, el ejercicio de esa posición cumple `key === slugify(título)`, `title`, `age: [edad, null]`, `players`, `minutes: [5, 8]`, `focus: [objetivo]`, `principles` igual a `[objetivo]` salvo `tecnica`, que es `[]`, `equipment`, `status: "published"` y `diagram === \`diagrams/${nn}-${key}.png\`` (`nn` con dos cifras).
- **«cada ficha sigue la traducción del manual»:** `setupMd` casa con `/^\*\*Montaje\.\*\* .+\n\n\*\*Secuencia\.\*\* .+\n\n\*\*Indicador\.\*\* \p{Lu}.*\.$/u`; hay una sola variante, con título `Progresión` y descripción no vacía; hay 2 o 3 puntos, todos clave menos el último, que no lo es y casa con `/^Error frecuente: \p{Ll}/u`; ningún punto acaba en punto; ningún título empieza por `/^\d{2} · /`.
- **«44 pizarras distintas»:** `diagrams.size === 44` y los 44 SHA-256 de los ficheros son distintos.
- **«el ejercicio 01, entero»:** `toEqual` con el ejemplo de `pack.json` de la especificación, más lo que `parsePack` rellena: `status: "published"` y `key: false` en el tercer punto.

- [ ] **Step 2: Verificar que falla**

Run: `pnpm test scripts/content/packs.test.ts`
Expected: FAIL, no hay ningún paquete en `content/`.

- [ ] **Step 3: Generar el paquete**

La conversión es de usar y tirar: el script que la hace vive fuera del repositorio y no se confirma. Fuente: `word/document.xml` del `.docx` (es un ZIP).

- Los 44 ejercicios están entre los títulos de nivel 1 `05 · Biblioteca común de ejercicios` y `06 · Desarrollo específico por categorías`. Cada uno empieza en un título de nivel 2 `NN · Título`; le siguen una línea `BLOQUE · Participantes: N · Duración orientativa: 5–8 minutos`, la imagen, y siete párrafos `ETIQUETA · texto` con las etiquetas OBJETIVO, MONTAJE, SECUENCIA, OBSERVAR Y CORREGIR, ERROR FRECUENTE, PROGRESIÓN e INDICADOR.
- La pizarra de cada ejercicio es la imagen de su bloque, resuelta por `word/_rels/document.xml.rels`. Se copia sin tocar a `diagrams/NN-<key>.png`.
- Texto: la tabla «Traducción del manual a la ficha» de la especificación. Edad, máximo de jugadores y material: la tabla de los 44. `key` es `slugify(título)`.
- `pack.json`: `title` `Biblioteca del entrenador · Manual de pista 2026`; UTF-8 sin BOM, sangría de dos espacios y salto de línea final; los ejercicios en el orden del manual; todos los campos escritos salvo `status`, y `key` solo en los puntos clave.
- Comprobación del script antes de escribir: 44 ejercicios, ningún campo vacío, 44 imágenes distintas.

- [ ] **Step 4: Verificar que pasa**

Run: `pnpm test scripts/content`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add content/arcangel scripts/content/packs.test.ts
git commit -m "feat(content): paquete con los 44 ejercicios comunes del manual de pista"
```

---

### Task 6: Verificación de cierre

**Files:**
- Modify: `docs/superpowers/backlog.md` (bloque nuevo, ver Step 5)

- [ ] **Step 1: Suite entera sobre una base recién sembrada**

Antes de importar el paquete real: el test de integración del seed cuenta los ejercicios del club.

```bash
pnpm supabase db reset && pnpm seed
pnpm lint && pnpm typecheck && pnpm check:guards
pnpm test && TZ=UTC pnpm test
pnpm test:db && pnpm test:int
```

Expected: todo en verde. `git status` limpio: ninguna de las órdenes deja cambios.

- [ ] **Step 2: Importar el paquete real, dos veces**

```bash
pnpm content:import content/arcangel/biblioteca-entrenador-2026 --club arcangel
```

Expected, la primera: `Creados: 44. Ya existían: 0. Actualizados: 0.` La segunda: `Creados: 0. Ya existían: 44. Actualizados: 0.` y la línea de `--update`.

- [ ] **Step 3: Revisar en el navegador a 375×812**

`pnpm dev` y, con usuarios del seed:

- Irene (entrenadora): la biblioteca lista los ejercicios del manual junto a los de ejemplo; buscar `sellar` encuentra «Sellar al tirador»; los filtros de objetivo (Rebote), edad (U10) y jugadores devuelven lo que dice la tabla de la especificación; la ficha enseña pizarra, objetivo, los tres párrafos del desarrollo, los puntos con los clave marcados, la variante «Progresión», el objetivo de trabajo y el principio.
- Raúl (dirección): abre «Editar» en un ejercicio importado y lo guarda sin cambios, sin que el formulario proteste.
- Marta (otro club): su biblioteca no enseña ninguno, y la URL de la ficha de uno importado le da el 404 de siempre.
- Sin scroll horizontal, sin textos cortados en la ficha, consola sin errores ni avisos.

Lo que falle se arregla en la tarea a la que pertenece, con su test, y se repite el Step 1.

- [ ] **Step 4: Los e2e, al final**

```bash
pnpm test:e2e
```

Expected: en verde. Restauran el seed y borran lo importado: es lo esperado. Si después hace falta el paquete en local, se importa otra vez.

- [ ] **Step 5: Apuntar lo que queda**

En `docs/superpowers/backlog.md`, dentro de «Fase 7 · Gestión y cierre», un bloque **«Lo que deja el importador de contenido»** con: cargar el paquete en el remoto (decisión del propietario; hoy producción es una demo con acceso público); los 24 ejercicios por categoría del manual, sin texto propio; error frecuente e indicador sin campo en la ficha; la pantalla de importación en Gestión; y que `pnpm test:int` falla con un paquete importado en local porque el test del seed cuenta los ejercicios del club.

`CLAUDE.md` no se edita: la línea de `pnpm content:import` para su lista de comandos se propone al propietario en el resumen final.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/backlog.md
git commit -m "docs(content): pendientes que deja el importador de contenido"
```
