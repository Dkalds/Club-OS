// Integración contra Supabase local (`pnpm seed` hecho): objetivos y notas con la sesión de
// cada usuario del seed y RLS de verdad. Cubre lo que los tests de unidad no pueden:
//   · una nota privada de Álex no la lee nadie más (Irene, de su mismo equipo; Raúl, dirección;
//     Nora, de otro equipo; Marta, de otro club); una de cuerpo técnico, Irene y Raúl sí;
//   · cuatro altas de objetivo a la vez desde dos sesiones (Álex e Irene): entran tres.
//
// Escribe sobre un jugador de Alevín A sin objetivos ni notas en el seed y lo deja como estaba
// al terminar (con la clave de servicio, que es la única que borra objetivos).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient } from "../lib/admin-client";
import { signInAs } from "../lib/user-client";
import { ARCANGEL, seedId } from "../seed/data";

const ORG = seedId(ARCANGEL.slug, "organization");
const TEAM = seedId(ARCANGEL.slug, "team:alevin-a");
const PLAYER = seedId(ARCANGEL.slug, "person:alevin-a:pablo-rey");
const MARK = "[int:development]";

const admin = createAdminClient();

async function cleanUp() {
  await admin.from("coach_notes").delete().eq("person_id", PLAYER).like("body", `${MARK}%`);
  await admin.from("player_goals").delete().eq("person_id", PLAYER).like("title", `${MARK}%`);
}

async function readableNotes(email: string): Promise<string[]> {
  const client = await signInAs(email);
  const { data, error } = await client.from("coach_notes").select("body").eq("person_id", PLAYER);
  if (error) throw error;
  return data.map((row) => row.body).filter((body) => body.startsWith(MARK)).sort();
}

describe("objetivos y notas con sesiones de verdad", () => {
  beforeAll(async () => {
    await cleanUp();
    // El jugador no tiene objetivos del seed: si no, el límite de tres no se probaría aquí.
    const { count } = await admin
      .from("player_goals")
      .select("id", { count: "exact", head: true })
      .eq("person_id", PLAYER)
      .eq("status", "active");
    expect(count).toBe(0);
  });

  afterAll(cleanUp);

  it("una nota privada solo la lee su autor; una de cuerpo técnico, el cuerpo técnico y dirección", async () => {
    const alex = await signInAs("alex@arcangel.test");
    const write = (body: string, visibility: "private" | "staff") =>
      alex.from("coach_notes").insert({ organization_id: ORG, team_id: TEAM, person_id: PLAYER, body, visibility });

    expect((await write(`${MARK} privada de Álex`, "private")).error).toBeNull();
    expect((await write(`${MARK} compartida de Álex`, "staff")).error).toBeNull();

    expect(await readableNotes("alex@arcangel.test")).toEqual([
      `${MARK} compartida de Álex`,
      `${MARK} privada de Álex`,
    ]);
    expect(await readableNotes("irene@arcangel.test")).toEqual([`${MARK} compartida de Álex`]);
    expect(await readableNotes("raul@arcangel.test")).toEqual([`${MARK} compartida de Álex`]);
    expect(await readableNotes("nora@arcangel.test")).toEqual([]);
    expect(await readableNotes("marta@demo.test")).toEqual([]);
  });

  it("la nota lleva el nombre de su autor para quien la puede leer", async () => {
    const irene = await signInAs("irene@arcangel.test");
    const { data, error } = await irene
      .from("coach_notes")
      .select("body, author:people!coach_notes_organization_id_author_person_id_fkey(first_name)")
      .eq("person_id", PLAYER)
      .like("body", `${MARK}%`);
    if (error) throw error;

    expect(data).toEqual([{ body: `${MARK} compartida de Álex`, author: { first_name: "Álex" } }]);
  });

  it("cuatro altas a la vez desde dos sesiones: entran tres y la cuarta es GOAL_LIMIT", async () => {
    const [alex, irene] = await Promise.all([signInAs("alex@arcangel.test"), signInAs("irene@arcangel.test")]);
    const add = (client: typeof alex, n: number) =>
      client
        .from("player_goals")
        .insert({ organization_id: ORG, team_id: TEAM, person_id: PLAYER, title: `${MARK} objetivo ${n}` });

    const results = await Promise.all([add(alex, 1), add(irene, 2), add(alex, 3), add(irene, 4)]);

    expect(results.filter((r) => r.error === null)).toHaveLength(3);
    const failures = results.filter((r) => r.error !== null);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.error).toMatchObject({ code: "P0001", message: "GOAL_LIMIT" });

    const { count } = await admin
      .from("player_goals")
      .select("id", { count: "exact", head: true })
      .eq("person_id", PLAYER)
      .eq("status", "active");
    expect(count).toBe(3);
  });
});
