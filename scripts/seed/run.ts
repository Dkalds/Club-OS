// Escritura del seed: solo entrada/salida. Qué se escribe lo decide `buildSeedData`.
//
// Orden: usuarios de Auth, y después las tablas en orden de claves foráneas. Todo con
// `upsert` sobre ids deterministas, así que repetirlo actualiza en vez de duplicar. Cada
// respuesta de Supabase se comprueba: un seed que se queda a medias sin avisar es peor que
// uno que falla.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient, readSupabaseEnv } from "../lib/admin-client";
import { buildSeedData } from "./data";
import { assertSeedTarget } from "./guard";

type Client = SupabaseClient<Database>;

const USERS_PER_PAGE = 200;
const MAX_USER_PAGES = 500;

function check(label: string, result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(`Seed: falló ${label}: ${result.error.message}`);
}

// Quien llama a `runSeed` sin cliente propio escribe con la clave de servicio del entorno:
// también aquí se comprueba el destino, para que `pnpm test:int` no siembre un remoto.
function adminClientForSeed(): Client {
  const { url } = readSupabaseEnv();
  assertSeedTarget(url, process.env);
  return createAdminClient();
}

async function existingUsersByEmail(client: Client): Promise<Map<string, string>> {
  const byEmail = new Map<string, string>();
  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
    if (error) throw new Error(`Seed: falló auth.admin.listUsers: ${error.message}`);
    // Se para en la primera página vacía, no en la primera corta: si el servidor limita
    // `perPage` por debajo de lo pedido, una página corta no es la última.
    if (data.users.length === 0) return byEmail;
    for (const user of data.users) {
      if (user.email) byEmail.set(user.email.toLowerCase(), user.id);
    }
  }
  throw new Error(`Seed: auth.admin.listUsers no terminó tras ${MAX_USER_PAGES} páginas`);
}

// Crea los usuarios que faltan, con el email confirmado y sin contraseña: el acceso es
// por código. Devuelve el id de Auth de cada email.
async function ensureUsers(client: Client, emails: string[]): Promise<Map<string, string>> {
  const ids = await existingUsersByEmail(client);
  for (const email of emails) {
    const key = email.toLowerCase();
    if (ids.has(key)) continue;
    const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) {
      throw new Error(
        `Seed: falló auth.admin.createUser(${email}): ${error?.message ?? "la respuesta no trae usuario"}`,
      );
    }
    ids.set(key, data.user.id);
  }
  return ids;
}

export async function runSeed(now: Date, client?: Client): Promise<void> {
  const db = client ?? adminClientForSeed();
  const data = buildSeedData(now);

  const userIds = await ensureUsers(
    db,
    data.users.map((user) => user.email),
  );
  const memberships = data.memberships.map(({ email, ...membership }) => {
    const userId = userIds.get(email.toLowerCase());
    if (!userId) throw new Error(`Seed: no hay usuario de Auth para ${email}`);
    return { ...membership, user_id: userId };
  });

  check("organizations", await db.from("organizations").upsert(data.organizations, { onConflict: "id" }));
  check(
    "organization_branding",
    await db
      .from("organization_branding")
      .upsert(data.organization_branding, { onConflict: "organization_id" }),
  );
  // `people` antes que `memberships`: la clave foránea compuesta de `person_id`.
  check("people", await db.from("people").upsert(data.people, { onConflict: "id" }));
  check("seasons", await db.from("seasons").upsert(data.seasons, { onConflict: "id" }));
  check("categories", await db.from("categories").upsert(data.categories, { onConflict: "id" }));
  check("teams", await db.from("teams").upsert(data.teams, { onConflict: "id" }));
  check(
    "memberships",
    await db.from("memberships").upsert(memberships, { onConflict: "organization_id,user_id" }),
  );
  check(
    "team_staff",
    await db.from("team_staff").upsert(data.team_staff, { onConflict: "team_id,person_id" }),
  );
  check(
    "team_players",
    await db.from("team_players").upsert(data.team_players, { onConflict: "team_id,person_id" }),
  );
  check("focus_areas", await db.from("focus_areas").upsert(data.focus_areas, { onConflict: "id" }));
  check("events", await db.from("events").upsert(data.events, { onConflict: "id" }));
  check("games", await db.from("games").upsert(data.games, { onConflict: "event_id" }));
  check(
    "practice_plans",
    await db.from("practice_plans").upsert(data.practice_plans, { onConflict: "id" }),
  );

  // Si la lista de ítems de una sesión cambia entre versiones del seed, los ítems que ya no
  // están se borran ANTES de escribir los nuevos: `(plan_id, sort)` es único (diferible) y un
  // ítem viejo con la misma posición haría fallar el upsert al cerrar la transacción.
  for (const plan of data.practice_plans) {
    const keep = data.practice_items.filter((item) => item.plan_id === plan.id).map((item) => item.id);
    let stale = db.from("practice_items").delete().eq("plan_id", plan.id);
    if (keep.length > 0) stale = stale.not("id", "in", `(${keep.join(",")})`);
    check(`practice_items (borrado de ítems sobrantes del plan ${plan.id})`, await stale);
  }
  // `(plan_id, sort)` no puede ser el árbitro de un ON CONFLICT (es diferible): se hace sobre `id`.
  check(
    "practice_items",
    await db.from("practice_items").upsert(data.practice_items, { onConflict: "id" }),
  );
}
