import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Controles negativos de `scripts/check-guards.sh`: el script real, con el mismo `bash` que
// `pnpm check:guards`, en una carpeta temporal con su propio `src/`. Allí no hay generador
// de tokens, así que esa comprobación (que necesita pnpm y git) no entra en juego.
//
// Este archivo vive en `scripts/`: aquí sí se pueden escribir los literales prohibidos.

const SCRIPT = path.resolve(import.meta.dirname, "check-guards.sh");

const sandboxes: string[] = [];

/** Una raíz de repo de mentira: el script copiado y, si se dan, los archivos de `src/`. */
function sandbox(files: Record<string, string> | null): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "clubos-guards-"));
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

afterEach(() => {
  for (const root of sandboxes.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("check-guards.sh", () => {
  it("pasa con un src/ sin literales de club ni clave de servicio", () => {
    const { status, output } = runGuards({ "ui/card.tsx": 'export const club = "club-a";\n' });

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
    const { status, output } = runGuards({
      "ui/card.tsx": "export const ok = 1;\n",
      "modules/home/home.test.ts": `${line}\n`,
    });

    expect(status).toBe(1);
    expect(output).toContain("FALLO: src/ menciona a un club");
    expect(output).toContain(`src/modules/home/home.test.ts:1:${line}`);
    expect(output).not.toContain("check:guards OK");
  });

  it("falla si src/ menciona la clave de servicio", () => {
    const { status, output } = runGuards({
      "lib/admin.ts": "const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n",
    });

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
});
