// Importa un paquete de contenido (un `pack.json` y sus pizarras) en la biblioteca de un club.
//   pnpm content:import <carpeta del paquete> --club <slug del club> [--update]
//
// Actúa sobre el Supabase del entorno (NEXT_PUBLIC_SUPABASE_URL) con la clave de servicio, y se
// niega a correr contra uno remoto salvo `ALLOW_REMOTE_IMPORT=true`. Es repetible: solo crea
// los ejercicios que faltan y no toca los que ya existen, porque lo editado en la app manda.
// Con `--update`, cada ejercicio del paquete vuelve a lo que dice el paquete. El formato del
// paquete está en `content/README.md`.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatReport, parseCliArgs } from "./content/cli";
import { assertImportTarget } from "./content/guard";
import { importPack } from "./content/import";
import { readSupabaseEnv } from "./lib/admin-client";

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  // También carga `.env.local`; lo que ya esté en el entorno manda sobre el fichero.
  const { url } = readSupabaseEnv();
  // Lo primero: antes de crear ningún cliente ni escribir nada.
  assertImportTarget(url, process.env);

  const report = await importPack({
    dir: path.resolve(args.dir),
    club: args.club,
    update: args.update,
  });

  for (const line of formatReport(report, new URL(url).host)) console.log(line);
}

// Solo como CLI (`pnpm content:import`): importado no escribe nada.
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    // `exitCode` y no `process.exit(1)`: salir de golpe con las conexiones aún cerrándose
    // aborta Node en Windows (aserción de libuv) y tapa el mensaje de arriba.
    process.exitCode = 1;
  });
}
