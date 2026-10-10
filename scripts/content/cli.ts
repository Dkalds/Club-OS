// Lo que el CLI de `pnpm content:import` hace sin tocar nada: leer sus argumentos y redactar
// el informe. Puro, para probarlo sin arrancar el comando.

import { parseArgs } from "node:util";
import type { ImportReport } from "./import";

export const USAGE = "Uso: pnpm content:import <carpeta del paquete> --club <slug del club> [--update]";

/** Los argumentos no valen. Su mensaje es `USAGE`. */
export class UsageError extends Error {
  constructor() {
    super(USAGE);
    this.name = "UsageError";
  }
}

/**
 * La carpeta del paquete, el club y si se pidió `--update`, en cualquier orden. Sin carpeta,
 * sin club, con más de una carpeta o con una opción que no existe, lanza `UsageError`.
 */
export function parseCliArgs(argv: string[]): { dir: string; club: string; update: boolean } {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: { club: { type: "string" }, update: { type: "boolean", default: false } },
    });
  } catch {
    throw new UsageError();
  }

  const [dir, ...rest] = parsed.positionals;
  const { club, update } = parsed.values;
  if (!dir || rest.length > 0 || !club) throw new UsageError();
  return { dir, club, update: update === true };
}

/** El informe de una importación, una frase por línea. `host` es el del Supabase de destino. */
export function formatReport(report: ImportReport, host: string): string[] {
  const lines = [
    `Paquete «${report.pack.title}» (${report.pack.id}) en ${report.club} · ${host}.`,
    `Creados: ${report.created.length}. Ya existían: ${report.skipped.length}. Actualizados: ${report.updated.length}.`,
  ];
  if (report.skipped.length > 0) {
    lines.push(
      "Los que ya existían no se han tocado. Para devolverlos a lo que dice el paquete, repite con --update.",
    );
  }
  return lines;
}
