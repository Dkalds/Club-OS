// Escritura del seed: solo entrada/salida. Qué se escribe lo decide `buildSeedData`.
//
// Orden: usuarios de Auth, y después las tablas en orden de claves foráneas. Todo con
// `upsert` sobre ids deterministas, así que repetirlo actualiza en vez de duplicar. Cada
// respuesta de Supabase se comprueba: un seed que se queda a medias sin avisar es peor que
// uno que falla.
//
// Un club del seed se puede haber usado: dirección reordena, renumera y crea contenido en
// Gestión. El seed devuelve lo suyo a su sitio y no borra nada de lo creado a mano; lo único
// que le cambia es el número cuando choca con uno suyo (ver `strays.ts`).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient, readSupabaseEnv } from "../lib/admin-client";
import { buildSeedData } from "./data";
import { assertSeedTarget } from "./guard";
import { renumberStandards, restackSections, type MovedStandard } from "./strays";

type Client = SupabaseClient<Database>;

/** Lo que `runSeed` cuenta a quien lo llama, además de sembrar. */
export type SeedReport = {
  /** Los Standards creados a mano que cambian de número porque el suyo es de uno del seed. */
  movedStandards: MovedStandard[];
};

const USERS_PER_PAGE = 200;
const MAX_USER_PAGES = 500;

function check(label: string, result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(`Seed: falló ${label}: ${result.error.message}`);
}

/** El filtro `not.in` de PostgREST con los ids de unas filas. */
function idList(rows: { id: string }[]): string {
  return `(${rows.map((row) => row.id).join(",")})`;
}

/**
 * `row`, reducida a las columnas de `model`. Un `upsert` de varias filas las quiere todas con
 * las mismas claves, y lo creado a mano se lee con todas sus columnas: aquí se queda con las
 * que el seed escribe. El resto de la fila (quién la guardó y cuándo) no se toca.
 */
function withColumnsOf<M extends object>(model: M, row: M): M {
  return Object.fromEntries(Object.keys(model).map((key) => [key, row[key as keyof M]])) as M;
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

type DrillChildTable =
  | "drill_coaching_points"
  | "drill_variants"
  | "drill_focus_areas"
  | "drill_principles"
  | "drill_standards";

// Guardar un ejercicio en la app borra sus puntos, variantes y vínculos y escribe otros (los
// puntos y las variantes, con ids nuevos y las mismas posiciones: `unique (drill_id, sort)`).
// Un reseed que solo escribiera dejaría de más lo que la app añadió y, si el id es otro,
// chocaría con la posición. Por eso, de cada ejercicio del seed se borra, ANTES de escribir,
// lo que no está en su lista; un ejercicio sin filas en esa tabla pierde todas las que tenga.
// `column` es la que identifica a cada fila dentro de su ejercicio: el id, o el vínculo.
async function deleteStaleDrillChildren<Row extends { drill_id: string }>(
  db: Client,
  drills: { id: string }[],
  table: DrillChildTable,
  column: keyof Row & string,
  rows: Row[],
): Promise<void> {
  for (const drill of drills) {
    const keep = rows.filter((row) => row.drill_id === drill.id).map((row) => String(row[column]));
    let stale = db.from(table).delete().eq("drill_id", drill.id);
    if (keep.length > 0) stale = stale.not(column, "in", `(${keep.join(",")})`);
    check(`${table} (borrado de filas sobrantes del ejercicio ${drill.id})`, await stale);
  }
}

export async function runSeed(now: Date, client?: Client): Promise<SeedReport> {
  const db = client ?? adminClientForSeed();
  const data = buildSeedData(now);
  const organizationIds = data.organizations.map((organization) => organization.id);

  const userIds = await ensureUsers(
    db,
    data.users.map((user) => user.email),
  );
  const memberships = data.memberships.map(({ email, ...membership }) => {
    const userId = userIds.get(email.toLowerCase());
    if (!userId) throw new Error(`Seed: no hay usuario de Auth para ${email}`);
    return { ...membership, user_id: userId };
  });
  // Igual con el autor de cada ejercicio, y antes de escribir nada: un autor que no existe
  // no debe dejar el seed a medias.
  const drills = data.drills.map(({ author_email, ...drill }) => {
    const userId = userIds.get(author_email.toLowerCase());
    if (!userId) throw new Error(`Seed: no hay usuario de Auth para ${author_email}`);
    return { ...drill, created_by: userId };
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

  // Los ejercicios van antes que los ítems de sesión: `practice_items (organization_id,
  // drill_id)` es una clave foránea compuesta a `drills`. Se escribe también su estado y su
  // texto, así que uno editado o archivado en la app vuelve a lo que dice el seed. Y también su
  // diagrama y su vídeo, que el seed pone a null (`diagram_media_id`, `video_url`): en un entorno
  // de demo, el diagrama que alguien subió a un ejercicio del seed queda desenlazado (el objeto
  // de Storage y su ficha de `media_assets` no se borran, solo dejan de estar enlazados).
  check("drills", await db.from("drills").upsert(drills, { onConflict: "id" }));

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

  // Metodología del club. No cuelga de equipos ni de sesiones, así que va al final; solo
  // `principle_points` depende de otra tabla suya (`game_principles`).
  //
  // El número de una sección es único por club (diferible: se comprueba al acabar la
  // sentencia), y el seed devuelve el suyo, del 1 en adelante, a sus secciones. Las que
  // dirección haya creado a mano se recolocan detrás, en el orden que tenían, y van en el
  // MISMO `upsert`: en dos sentencias, la primera chocaría con los números que la segunda iba
  // a liberar. Entre leerlas y escribirlas pasan milisegundos; lo que alguien guarde en ese
  // hueco en una de ellas se pierde, como lo que edite en una fila del seed.
  const straySections = await db
    .from("way_sections")
    .select("*")
    .in("organization_id", organizationIds)
    .not("id", "in", idList(data.way_sections))
    .order("sort")
    .order("created_at")
    .order("id");
  check("way_sections (lectura de lo creado a mano)", straySections);
  const [sectionModel] = data.way_sections;
  check(
    "way_sections",
    await db.from("way_sections").upsert(
      [
        ...data.way_sections,
        ...restackSections(data.way_sections, straySections.data ?? []).map((row) =>
          withColumnsOf(sectionModel, row),
        ),
      ],
      { onConflict: "id" },
    ),
  );
  check(
    "club_values",
    await db.from("club_values").upsert(data.club_values, { onConflict: "id" }),
  );
  check(
    "game_principles",
    await db.from("game_principles").upsert(data.game_principles, { onConflict: "id" }),
  );
  // Guardar un principio en la app reemplaza sus puntos por otros con ids nuevos, así que
  // un reseed sin borrar antes los dejaría duplicados: los puntos de cada principio del
  // seed que ya no están en su lista se borran ANTES de escribirla. Un principio sin
  // puntos en el seed pierde todos los que tenga.
  for (const principle of data.game_principles) {
    const keep = data.principle_points
      .filter((point) => point.principle_id === principle.id)
      .map((point) => point.id);
    let stale = db.from("principle_points").delete().eq("principle_id", principle.id);
    if (keep.length > 0) stale = stale.not("id", "in", `(${keep.join(",")})`);
    check(
      `principle_points (borrado de puntos sobrantes del principio ${principle.id})`,
      await stale,
    );
  }
  check(
    "principle_points",
    await db.from("principle_points").upsert(data.principle_points, { onConflict: "id" }),
  );
  // Los Standards, igual: el seed devuelve su número a los suyos (aunque dirección los haya
  // intercambiado: el único es diferible) y, si un Standard creado a mano ocupa uno de esos
  // números, pasa al primero libre de su club, en el mismo `upsert`. Los demás no se tocan.
  const strayStandards = await db
    .from("standards")
    .select("*")
    .in("organization_id", organizationIds)
    .not("id", "in", idList(data.standards))
    .order("sort")
    .order("created_at")
    .order("id");
  check("standards (lectura de lo creado a mano)", strayStandards);
  const renumbered = renumberStandards(data.standards, strayStandards.data ?? []);
  const [standardModel] = data.standards;
  check(
    "standards",
    await db.from("standards").upsert(
      [...data.standards, ...renumbered.rows.map((row) => withColumnsOf(standardModel, row))],
      { onConflict: "id" },
    ),
  );

  // Puntos, variantes y vínculos de los ejercicios. Al final: enlazan los focos de arriba y
  // los principios y Standards de la metodología, que tienen que existir ya. Los vínculos
  // no tienen id propio: su clave es `(drill_id, x_id)`.
  await deleteStaleDrillChildren(db, data.drills, "drill_coaching_points", "id", data.drill_coaching_points);
  await deleteStaleDrillChildren(db, data.drills, "drill_variants", "id", data.drill_variants);
  await deleteStaleDrillChildren(db, data.drills, "drill_focus_areas", "focus_area_id", data.drill_focus_areas);
  await deleteStaleDrillChildren(db, data.drills, "drill_principles", "principle_id", data.drill_principles);
  await deleteStaleDrillChildren(db, data.drills, "drill_standards", "standard_id", data.drill_standards);
  check(
    "drill_coaching_points",
    await db.from("drill_coaching_points").upsert(data.drill_coaching_points, { onConflict: "id" }),
  );
  check(
    "drill_variants",
    await db.from("drill_variants").upsert(data.drill_variants, { onConflict: "id" }),
  );
  check(
    "drill_focus_areas",
    await db
      .from("drill_focus_areas")
      .upsert(data.drill_focus_areas, { onConflict: "drill_id,focus_area_id" }),
  );
  check(
    "drill_principles",
    await db
      .from("drill_principles")
      .upsert(data.drill_principles, { onConflict: "drill_id,principle_id" }),
  );
  check(
    "drill_standards",
    await db
      .from("drill_standards")
      .upsert(data.drill_standards, { onConflict: "drill_id,standard_id" }),
  );

  return { movedStandards: renumbered.moved };
}
