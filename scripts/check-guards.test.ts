import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

// Controles negativos de `scripts/check-guards.sh`: el script real, con el mismo `bash` que
// `pnpm check:guards`, en una carpeta temporal con su propio `src/`. Allí no hay generador
// de tokens, así que esa comprobación (que necesita pnpm y git) no entra en juego.
//
// Este archivo vive en `scripts/`: aquí sí se pueden escribir los literales prohibidos.

const SCRIPT = path.resolve(import.meta.dirname, "check-guards.sh");
const SANDBOX_PREFIX = "clubos-guards-";
/** Una ejecución de este archivo dura segundos: una carpeta más vieja ya no es de nadie. */
const SANDBOX_STALE_MS = 60_000;

/**
 * Cada test lanza `bash` sobre una carpeta temporal. Con el ordenador ocupado (o con el `bash`
 * de WSL de Windows, que arranca despacio) un arranque tarda más que los 5 s por defecto.
 */
const SPAWN_TIMEOUT_MS = 30_000;

const sandboxes: string[] = [];

/** Una página de Gestión como debe ser: su export por defecto es `adminPage(...)`. */
const GUARDED_PAGE = "export default adminPage(async (ctx) => null);\n";

const ADMIN = "app/c/[club]/admin";

/** Los archivos dados más una página de Gestión que cumple: el guard exige que exista. */
function withAdmin(files: Record<string, string>): Record<string, string> {
  return { [`${ADMIN}/page.tsx`]: GUARDED_PAGE, ...files };
}

/** Una raíz de repo de mentira: el script copiado y, si se dan, los archivos de `src/`. */
function sandbox(files: Record<string, string> | null): string {
  const root = mkdtempSync(path.join(os.tmpdir(), SANDBOX_PREFIX));
  sandboxes.push(root);
  mkdirSync(path.join(root, "scripts"));
  copyFileSync(SCRIPT, path.join(root, "scripts", "check-guards.sh"));
  if (files !== null) {
    mkdirSync(path.join(root, "src"));
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(root, "src", name);
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
  }
  return root;
}

function runGuards(files: Record<string, string> | null): { status: number | null; output: string } {
  const result = spawnSync("bash", ["scripts/check-guards.sh"], {
    cwd: sandbox(files),
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function removeQuietly(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // En Windows, `bash` puede ser el de WSL, que tarda unos segundos en soltar la carpeta
    // y no deja borrarla todavía. Se queda para el barrido de la siguiente ejecución.
  }
}

// Barrido de lo que una ejecución anterior no pudo borrar. Solo carpetas viejas: las
// recientes pueden ser de otra ejecución que está en marcha ahora mismo.
beforeAll(() => {
  const tmp = os.tmpdir();
  for (const name of readdirSync(tmp)) {
    if (!name.startsWith(SANDBOX_PREFIX)) continue;
    const dir = path.join(tmp, name);
    const age = Date.now() - (statSync(dir, { throwIfNoEntry: false })?.mtimeMs ?? Date.now());
    if (age > SANDBOX_STALE_MS) removeQuietly(dir);
  }
});

afterEach(() => {
  for (const root of sandboxes.splice(0)) removeQuietly(root);
});

describe("check-guards.sh", { timeout: SPAWN_TIMEOUT_MS }, () => {
  it("pasa con un src/ sin literales de club ni clave de servicio", () => {
    const { status, output } = runGuards(
      withAdmin({ "ui/card.tsx": 'export const club = "club-a";\n' }),
    );

    expect(output).toContain("check:guards OK");
    expect(status).toBe(0);
  });

  it.each([
    ["el nombre del primer club", 'const name = "CB Arcángel";'],
    ["el primer club sin acento y en minúsculas", 'const slug = "arcangel";'],
    ["el acento del primer club", "const accent = '#C9A45C';"],
    ["el nombre del segundo club", 'const name = "Club Demo";'],
    ["el slug del segundo club", 'const href = "/c/club-demo";'],
    ["el segundo club en mayúsculas", "const NAME = 'CLUB DEMO';"],
    ["el acento del segundo club", "const accent = '#3FB8AF';"],
  ])("falla si src/ lleva %s, y enseña la línea", (_label, line) => {
    const { status, output } = runGuards(
      withAdmin({
        "ui/card.tsx": "export const ok = 1;\n",
        "modules/home/home.test.ts": `${line}\n`,
      }),
    );

    expect(status).toBe(1);
    expect(output).toContain("FALLO: src/ menciona a un club");
    expect(output).toContain(`src/modules/home/home.test.ts:1:${line}`);
    expect(output).not.toContain("check:guards OK");
  });

  it("falla si src/ menciona la clave de servicio", () => {
    const { status, output } = runGuards(
      withAdmin({ "lib/admin.ts": "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n" }),
    );

    expect(status).toBe(1);
    expect(output).toContain("FALLO: src/ menciona SERVICE_ROLE");
    expect(output).toContain("src/lib/admin.ts:1:");
  });

  it("falla, y no pasa en silencio, si grep no puede leer src/", () => {
    // Sin carpeta `src/`, grep sale con estado 2: no es «sin coincidencias».
    const { status, output } = runGuards(null);

    expect(status).toBe(1);
    expect(output).toMatch(/FALLO: .*grep no pudo comprobarlo \(estado 2\)/);
    expect(output).not.toContain("check:guards OK");
  });

  // Colores y medidas en los componentes: solo tokens y la escala de Tailwind. Se miran los
  // `.tsx` de src/ que no son tests (un test puede nombrar un hex para comprobar que no sale).
  describe("colores y medidas de los componentes", () => {
    const HEX = "FALLO: src/ lleva un color hex";
    const MEASURE = "FALLO: src/ lleva una medida entre corchetes";

    function runTsx(line: string, file = "ui/box.tsx") {
      return runGuards(withAdmin({ [file]: `export const c = "${line}";\n` }));
    }

    it.each([
      ["#fff", "3 dígitos"],
      ["#fffa", "4 dígitos"],
      ["#ff0000", "6 dígitos"],
      ["#ff0000cc", "8 dígitos"],
      ["#FF0000", "en mayúsculas"],
      ["text-[#ff0000]", "dentro de una clase de Tailwind"],
    ])("falla con un color %s (%s), y enseña la línea", (hex) => {
      const { status, output } = runTsx(hex);

      expect(status).toBe(1);
      expect(output).toContain(HEX);
      expect(output).toContain(`src/ui/box.tsx:1:export const c = "${hex}";`);
      expect(output).not.toContain("check:guards OK");
    });

    it.each([
      ["un color de 5 dígitos, que no existe", "#12345"],
      ["uno de 7", "#1234567"],
      ["un ancla que no es un color", "#section"],
      ["un token", "text-ink"],
    ])("no confunde con un color %s", (_label, text) => {
      const { status, output } = runTsx(text);

      expect(output).toContain("check:guards OK");
      expect(status).toBe(0);
    });

    // Un comentario que nombra un ancla (`#1abc` en una URL) o una entidad no es un color de la
    // interfaz: solo cuentan las líneas de código. «Comentario» es la línea cuyo primer carácter
    // que no es un espacio abre uno: `//`, `/*`, `*` (las de en medio de un bloque) o `{/*`
    // (un comentario de JSX).
    describe("un hex en un comentario", () => {
      it.each([
        ["de línea", "// Una URL con ancla, como /way#1abc, lleva a su sección.\nexport const a = 1;\n"],
        ["de línea con sangría", "export function f() {\n  // Como /way#1abc.\n  return 1;\n}\n"],
        ["de una sola línea entre /* y */", "/* Como /way#1abc. */\nexport const a = 1;\n"],
        [
          "de bloque, en una línea que empieza por *",
          "/**\n * Una URL con ancla, como /way#1abc,\n * lleva a su sección.\n */\nexport const a = 1;\n",
        ],
        [
          "de bloque, en una línea con sangría y tabulador",
          "export function f() {\n\t/*\n\t * Como /way#1abc.\n\t */\n  return 1;\n}\n",
        ],
        [
          "de JSX, en una línea que abre con {/*",
          "export const a = (\n  <div>\n    {/* Como /way#1abc, #fff o #ff0000cc. */}\n    <p />\n  </div>\n);\n",
        ],
        [
          "de bloque, con la línea que lo cierra al final del texto",
          "/**\n * Una URL con ancla, como /way#1abc */\nexport const a = 1;\n",
        ],
        [
          "de bloque que abre y sigue en las líneas de abajo",
          "/* Como /way#1abc, y sigue\n * en esta línea.\n */\nexport const a = 1;\n",
        ],
        [
          "de JSX que abre y sigue en las líneas de abajo",
          "export const a = (\n  <div>\n    {/* Como /way#1abc, y sigue\n     * en esta línea. */}\n  </div>\n);\n",
        ],
        ["de una línea con asteriscos de adorno", "/*** Como /way#1abc ***/\nexport const a = 1;\n"],
        ["JSDoc de una línea con su tipo", "/** @type {Anchor} como /way#1abc */\nexport const a = 1;\n"],
        [
          // Tal cual lo escribe `src/ui/scroll-to-hash.tsx`: el comentario que motivó este filtro.
          "de bloque con comillas y paréntesis, como el de scroll-to-hash",
          "/**\n * `id`, nunca con un selector construido con el texto de la URL (un `#1abc` o unas comillas lo\n * romperían). Como hace el navegador.\n */\nexport const a = 1;\n",
        ],
      ])("no cuenta si es %s", (_label, source) => {
        const { status, output } = runGuards(withAdmin({ "ui/note.tsx": source }));

        expect(output).toContain("check:guards OK");
        expect(status).toBe(0);
      });

      it("el código de otra línea del mismo archivo sí cuenta, y el comentario no sale", () => {
        const { status, output } = runGuards(
          withAdmin({
            "ui/note.tsx": [
              "// Como /way#1abc.",
              'export const bad = "#ff0000";',
              "/** Un ancla, #1abc. */",
              "",
            ].join("\n"),
          }),
        );

        expect(status).toBe(1);
        expect(output).toContain("FALLO: src/ lleva un color hex");
        expect(output).toContain('src/ui/note.tsx:2:export const bad = "#ff0000";');
        expect(output).not.toContain("src/ui/note.tsx:1:");
        expect(output).not.toContain("src/ui/note.tsx:3:");
        expect(output).not.toContain("check:guards OK");
      });

      it.each([
        ["en una clase de Tailwind", '<div className="bg-[#ff0000] p-4" />'],
        ["en un style", '<div style={{ color: "#ff0000" }} />'],
        ["en una línea de código con un comentario al final", 'const c = "#ff0000"; // el rojo'],
        // El filtro mira cómo empieza la línea, no si hay un `//` en alguna parte: un comentario
        // detrás de código sigue siendo una línea de código.
        ["en un comentario que sigue a código en la misma línea", "const a = 1; // el ancla #1abc"],
        // Una línea que empieza como un comentario pero sigue con código después de cerrarlo
        // (Prettier deja los comentarios de bloque en la línea del código al que acompañan).
        ["tras un comentario de bloque que se cierra en la misma línea", '/* x */ const c = "#ff0000";'],
        ["tras un JSDoc de una línea", '/** @type {T} */ const c = { bg: "#fff" };'],
        ["tras un comentario de JSX en la misma línea", '{/* x */}<div className="bg-[#ff0000]" />'],
        ["tras el cierre de un bloque que empezó arriba, con *", ' * x */ const c = "#ff0000";'],
        ["tras el cierre de un bloque que empezó arriba, sin *", ' */ const c = "#ff0000";'],
        ["tras un comentario de bloque con asteriscos de adorno", '/*** x ***/ const c = "#ff0000";'],
        ["tras un comentario de bloque vacío", '/**/ const c = "#ff0000";'],
        ["tras un comentario de bloque, con otro de línea detrás", '/* x */ const c = "#fff"; // y'],
      ])("sigue contando en código: %s", (_label, line) => {
        const { status, output } = runGuards(withAdmin({ "ui/note.tsx": `${line}\n` }));

        expect(status).toBe(1);
        expect(output).toContain("FALLO: src/ lleva un color hex");
        expect(output).toContain(`src/ui/note.tsx:1:${line}`);
      });
    });

    // Una línea que empieza por `*` solo es de comentario si el asterisco va seguido de un
    // espacio o del final de la línea. `*:` y `**:` son las variantes de Tailwind v4 para los
    // hijos, y una clase puede ir en una línea suya dentro de una cadena larga.
    it.each([
      ["*:bg-[#ff0000]", "una variante *: de Tailwind"],
      ["**:text-[#fff]", "una variante **: de Tailwind"],
    ])("una línea de clase que empieza por * cuenta: %s (%s)", (cls) => {
      const { status, output } = runGuards(
        withAdmin({
          "ui/note.tsx": ["export const c = `", "  flex gap-2", `  ${cls}`, "`;", ""].join("\n"),
        }),
      );

      expect(status).toBe(1);
      expect(output).toContain("FALLO: src/ lleva un color hex");
      expect(output).toContain(`src/ui/note.tsx:3:  ${cls}`);
      expect(output).not.toContain("check:guards OK");
    });

    it("un test con un hex no cuenta: puede nombrarlo para comprobar que no sale", () => {
      const { status, output } = runTsx("#ff0000", "ui/box.test.tsx");

      expect(output).toContain("check:guards OK");
      expect(status).toBe(0);
    });

    it("un .ts con un hex no cuenta: el guard mira los componentes", () => {
      const { status } = runTsx("#ff0000", "lib/box.ts");

      expect(status).toBe(0);
    });

    it.each([
      "min-h-[220px]",
      "max-w-[280px]",
      "h-[18px]",
      "w-[70%]",
      "p-[1.5rem]",
      "gap-[0.5em]",
      "mt-[-4px]",
      "lg:min-h-[220px]",
      "hover:lg:w-[70%]",
      "text-ink h-[18px] w-full",
    ])("falla con la medida %s, y enseña dónde", (cls) => {
      const { status, output } = runTsx(cls);

      expect(status).toBe(1);
      expect(output).toContain(MEASURE);
      expect(output).toContain(`src/ui/box.tsx:1:`);
      expect(output).not.toContain("check:guards OK");
    });

    it("enseña la clase que falla aunque la línea lleve otras que sí valen", () => {
      const { output } = runTsx("text-[24px] h-[18px] tracking-[0.04em]");

      expect(output).toContain("h-[18px]");
      expect(output).not.toContain("text-[24px]");
      expect(output).not.toContain("tracking-[0.04em]");
    });

    it.each([
      "text-[24px]",
      "tracking-[0.04em]",
      "leading-[1.5rem]",
      "lg:text-[24px]",
      "text-[24px] leading-[28px] tracking-[0.04em]",
      // Sin unidad o con una función: no son un literal con unidad.
      "w-[calc(100%-1rem)]",
      "pb-[env(safe-area-inset-bottom)]",
      "h-[var(--space-4)]",
      "grid-cols-[1fr_auto]",
      // La escala de Tailwind y los tokens son la forma correcta.
      "min-h-55 max-w-70 h-4.5 w-7/10 min-h-(--target-min)",
    ])("deja pasar %s", (cls) => {
      const { status, output } = runTsx(cls);

      expect(output).toContain("check:guards OK");
      expect(status).toBe(0);
    });

    it("una medida entre corchetes en un test no cuenta", () => {
      const { status, output } = runTsx("min-h-[220px]", "ui/box.test.tsx");

      expect(output).toContain("check:guards OK");
      expect(status).toBe(0);
    });

    it("falla, y no pasa en silencio, si grep no puede leer src/", () => {
      // Sin `src/`, los dos guards nuevos deben fallar igual que los de clubes.
      const { output } = runGuards(null);

      expect(output).toMatch(new RegExp(`${HEX}.*grep no pudo comprobarlo \\(estado 2\\)`));
      expect(output).toMatch(new RegExp(`${MEASURE}.*grep no pudo comprobarlo \\(estado 2\\)`));
    });
  });

  // Gestión: el export por defecto de cada `page.tsx` de /admin es `adminPage(...)`, que
  // comprueba el club y el permiso antes de ejecutar la página. Un layout no protege a sus
  // páginas, y un guard que no encuentra la carpeta no protege nada.
  describe("las páginas de Gestión", () => {
    const FOLDER = "src/app/c/[club]/admin";
    const FAILURE = "FALLO: páginas de Gestión que no exportan por defecto adminPage(";
    /** Como se escribían antes: las dos llamadas a mano, que nada obliga a poner primero. */
    const BY_HAND = [
      "export default async function Page() {",
      "  const ctx = await requireClub(slug);",
      "  requireAdmin(ctx);",
      "}",
      "",
    ].join("\n");

    it("pasan con varias páginas y subcarpetas, cada una exportando adminPage(", () => {
      const { status, output } = runGuards({
        [`${ADMIN}/page.tsx`]: GUARDED_PAGE,
        [`${ADMIN}/way/page.tsx`]: GUARDED_PAGE,
        // Con los parámetros de su ruta declarados.
        [`${ADMIN}/way/[sectionId]/page.tsx`]:
          "export default adminPage<{ club: string; sectionId: string }>(async (ctx) => null);\n",
        // Lo que no es una página no se mira: un layout o un test no son `adminPage`.
        [`${ADMIN}/layout.tsx`]: "export default function Layout() {}\n",
        [`${ADMIN}/pages.test.tsx`]: "it('x', () => {});\n",
      });

      expect(output).toContain("check:guards OK");
      expect(status).toBe(0);
    });

    it("fallan si la carpeta no existe, en vez de pasar sin proteger nada", () => {
      // Por ejemplo, porque alguien la ha renombrado.
      const { status, output } = runGuards({
        "app/c/[club]/gestion/page.tsx": GUARDED_PAGE,
        "ui/card.tsx": "export const ok = 1;\n",
      });

      expect(status).toBe(1);
      expect(output).toContain(`FALLO: no existe ${FOLDER}`);
      expect(output).not.toContain("check:guards OK");
    });

    it("fallan si la carpeta existe pero no tiene ninguna página", () => {
      const { status, output } = runGuards({
        [`${ADMIN}/layout.tsx`]: "export default function Layout() {}\n",
      });

      expect(status).toBe(1);
      expect(output).toContain(`FALLO: ${FOLDER} no tiene ninguna página`);
      expect(output).not.toContain("check:guards OK");
    });

    it("fallan si una página se protege a mano en vez de con adminPage(, y dicen cuál", () => {
      // Con las dos llamadas escritas la página puede estar bien, pero nada impide leer datos
      // antes de ellas ni olvidarlas en la siguiente: el guard pide la forma que no lo permite.
      const { status, output } = runGuards({
        [`${ADMIN}/page.tsx`]: GUARDED_PAGE,
        [`${ADMIN}/values/page.tsx`]: BY_HAND,
      });

      expect(status).toBe(1);
      expect(output).toContain(FAILURE);
      expect(output).toContain(`${FOLDER}/values/page.tsx`);
      expect(output).not.toContain(`${FOLDER}/page.tsx`);
      expect(output).not.toContain("check:guards OK");
    });

    it.each([
      ["en un comentario", "// export default adminPage(\nexport default function Page() {}\n"],
      [
        "sin ser el export por defecto",
        "const guarded = adminPage(async () => null);\nexport default function Page() {}\n",
      ],
      [
        "exportado a través de una variable",
        "const Page = adminPage(async () => null);\nexport default Page;\n",
      ],
    ])("nombrar adminPage( %s no cuenta", (_case, source) => {
      const { status, output } = runGuards({
        [`${ADMIN}/page.tsx`]: GUARDED_PAGE,
        [`${ADMIN}/standards/page.tsx`]: source,
      });

      expect(status).toBe(1);
      expect(output).toContain(FAILURE);
      expect(output).toContain(`${FOLDER}/standards/page.tsx`);
    });

    it("lo que exportan otras páginas no cubre a la que no lo hace", () => {
      // Cada página se comprueba por sí misma, y sale una sola vez.
      const { status, output } = runGuards({
        [`${ADMIN}/page.tsx`]: GUARDED_PAGE,
        [`${ADMIN}/way/page.tsx`]: GUARDED_PAGE,
        [`${ADMIN}/principles/page.tsx`]: "export default function Page() {}\n",
      });

      expect(status).toBe(1);
      expect(output.split(`${FOLDER}/principles/page.tsx`)).toHaveLength(2);
    });
  });
});
