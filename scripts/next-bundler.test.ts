import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

// `next dev` y `next build` sin `--webpack` ni `--turbopack` dejan el empaquetador a Next, que
// desde la 16 elige Turbopack y se niega a arrancar si la configuración lleva `webpack` y no
// `turbopack` (`validateTurboNextConfig`, en `next/dist/lib/turbopack-warning.js`). `withSerwist`
// añade siempre un `webpack`, también con `disable: true`: mientras la app lleve Serwist, cada
// script que lance Next tiene que elegir empaquetador (contrato C12).
//
// CI no arranca `next dev` (los e2e usan `build && start`), así que sin este test un `pnpm dev`
// que aborta no lo ve nadie hasta que alguien lo teclea. Aquí se aplica la regla de Next a la
// configuración real y a los scripts reales, sin arrancar nada: si Next cambia la regla, se
// cambia aquí.

const root = path.resolve(import.meta.dirname, "..");
const { scripts } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

/** Un `next dev` o un `next build` con sus argumentos, hasta donde acaba ese comando. */
const NEXT_COMMAND = /\bnext\s+(?:dev|build)\b[^&|;]*/g;
const BUNDLER_FLAG = /\s--(?:webpack|turbopack|turbo)(?=\s|$)/;

/** Los `next dev` y `next build` de un script que dejan el empaquetador a Next. */
function onDefaultBundler(script: string): string[] {
  return (script.match(NEXT_COMMAND) ?? [])
    .map((command) => command.trim())
    .filter((command) => !BUNDLER_FLAG.test(command));
}

/** La regla de Next: con el empaquetador por defecto, un `webpack` sin `turbopack` aborta. */
function rejectsDefaultBundler(config: NextConfig): boolean {
  const turbopack =
    Boolean(config.turbopack) ||
    Object.keys(config.experimental ?? {}).some((key) => key.startsWith("turbo"));
  return Boolean(config.webpack) && !turbopack;
}

describe("el empaquetador de los scripts de Next", () => {
  it.each([
    ["next dev", ["next dev"]],
    ["next dev --hostname 0.0.0.0", ["next dev --hostname 0.0.0.0"]],
    ["next build && next start", ["next build"]],
    ["next dev --webpack", []],
    ["next dev --port 3200 --webpack", []],
    ["next dev --turbopack", []],
    ["next build --webpack", []],
    ["next start", []],
    ["next typegen && tsc --noEmit", []],
  ])("en «%s», dejan el empaquetador a Next: %j", (script, expected) => {
    expect(onDefaultBundler(script)).toEqual(expected);
  });

  const webpack: NextConfig["webpack"] = (config) => config;

  it.each<[string, NextConfig, boolean]>([
    ["con webpack y sin turbopack", { webpack }, true],
    ["con webpack y un turbopack vacío", { webpack, turbopack: {} }, false],
    ["sin webpack", {}, false],
  ])("una configuración %s rechaza el empaquetador por defecto: %s", (_label, config, expected) => {
    expect(rejectsDefaultBundler(config)).toBe(expected);
  });

  it("ningún script lanza Next con un empaquetador que next.config.ts rechaza", () => {
    const broken = rejectsDefaultBundler(nextConfig)
      ? Object.entries(scripts).flatMap(([name, script]) =>
          onDefaultBundler(script).map((command) => `${name}: ${command}`),
        )
      : [];

    expect(
      broken,
      "next.config.ts lleva `webpack` (lo añade withSerwist) y no `turbopack`: estos scripts " +
        "abortan al arrancar. Añádeles `--webpack`.",
    ).toEqual([]);
  });
});
