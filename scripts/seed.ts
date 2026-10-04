// Siembra Arcángel y Club Demo (datos ficticios) en el Supabase del entorno.
//   pnpm seed
//
// Se niega a correr contra un Supabase remoto salvo `ALLOW_REMOTE_SEED=true`. Es idempotente:
// puede ejecutarse las veces que haga falta, y las horas se recalculan respecto a hoy. Lo
// que el seed posee vuelve a su texto, su orden y su número; lo creado a mano en Gestión se
// queda, detrás de lo del seed.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSupabaseEnv } from "./lib/admin-client";
import { buildSeedData } from "./seed/data";
import { assertSeedTarget } from "./seed/guard";
import { runSeed } from "./seed/run";

async function main(): Promise<void> {
  const { url } = readSupabaseEnv();
  // Lo primero: antes de crear ningún cliente ni escribir nada.
  assertSeedTarget(url, process.env);

  const now = new Date();
  const report = await runSeed(now);

  const data = buildSeedData(now);
  console.log(`Seed listo en ${new URL(url).host}.`);
  console.log(`Clubes: ${data.organizations.map((org) => org.slug).join(", ")}.`);
  console.log(`Usuarios de prueba: ${data.users.map((user) => user.email).join(", ")}.`);
  // Lo creado a mano en Gestión se conserva; solo cambia de número el Standard que ocupaba
  // uno de los del seed.
  for (const move of report.movedStandards) {
    const club = data.organizations.find((org) => org.id === move.organization_id)?.slug;
    console.log(
      `Standard «${move.title}» (${club}): pasa del ${move.from} al ${move.to}; el ${move.from} es del seed.`,
    );
  }
}

// Solo como CLI (`pnpm seed`). Un `import "…/scripts/seed"` resuelve a este archivo, no a
// la carpeta `scripts/seed/`: importado no siembra nada.
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
