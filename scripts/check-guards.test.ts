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

describe("check-guards.sh", () => {
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
