import { runSeed } from "../scripts/seed/run";
import { SEED_NOW_ENV } from "./helpers/seed";

/**
 * Arranque global de los e2e: vuelve a sembrar la base de datos justo antes de los tests y
 * les deja el instante de esa siembra (`seedNow()` en `helpers/seed.ts`).
 *
 * Las fechas del seed son relativas al momento en que se siembra. Si entre un `pnpm seed`
 * y los tests pasa un rato, lo sembrado envejece: el «próximo entrenamiento» ya terminó, el
 * partido ya se jugó, y los tests de Inicio fallan sin que nada esté roto. Sembrando aquí,
 * lo que hay en la base de datos es siempre de esta misma ejecución, también en local.
 *
 * Es el mismo seed de `pnpm seed`: idempotente (actualiza por id, no duplica) y con la
 * misma guarda, que se niega a escribir en un Supabase que no sea local.
 */
export default async function globalSetup(): Promise<void> {
  const seededAt = new Date();

  try {
    await runSeed(seededAt);
  } catch (error) {
    throw seedFailure(error);
  }

  process.env[SEED_NOW_ENV] = seededAt.toISOString();
}

/**
 * Un solo error, legible, para lo que suele pasar: falta `.env.local` o Supabase no está
 * arrancado. Sin esto fallarían los tests uno a uno, cada uno con su traza. La pila se
 * quita a propósito: apuntaría a esta línea, no a la causa, que ya va en el mensaje.
 */
function seedFailure(cause: unknown): Error {
  const reason = cause instanceof Error ? cause.message : String(cause);
  const failure = new Error(
    `No se pudieron sembrar los datos de los e2e. ${reason}\n\n` +
      "Los e2e necesitan el Supabase local arrancado (`pnpm supabase start`) y un " +
      "`.env.local` con su URL y sus claves (`pnpm supabase status -o env`; ver .env.example).",
  );
  failure.stack = `${failure.name}: ${failure.message}`;
  return failure;
}
