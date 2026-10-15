// Integración contra Supabase local (`pnpm seed` hecho): partidos con la sesión de cada usuario
// del seed y RLS de verdad (Review Focus 3).
//   · Álex crea un partido de Alevín A, apunta su resultado y lo cancela… o no: un jugado no se
//     cancela; Nora (Benjamín A) y Marta (otro club) no crean ni cambian partidos de Alevín A;
//   · la consulta de la pestaña «Jugados» (con su `or()`) trae lo que tiene que traer.
// Deja la base como estaba (borra con la clave de servicio lo que crea).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENDA_COLUMNS } from "@/modules/schedule/map-rows";
import { createAdminClient } from "../lib/admin-client";
import { signInAs } from "../lib/user-client";
import { ARCANGEL, seedId } from "../seed/data";

const ORG = seedId(ARCANGEL.slug, "organization");
const ALEVIN_A = seedId(ARCANGEL.slug, "team:alevin-a");
const MARK = "[int:games]";
const HOUR = 3_600_000;

const admin = createAdminClient();

async function cleanUp() {
  const { data } = await admin.from("games").select("event_id").like("opponent_name", `${MARK}%`);
  const ids = (data ?? []).map((row) => row.event_id);
  if (ids.length === 0) return;
  await admin.from("games").delete().in("event_id", ids);
  await admin.from("events").delete().in("id", ids);
}

const at = (offsetHours: number) => new Date(Date.now() + offsetHours * HOUR).toISOString();

async function createAs(email: string, opponent: string, startsInHours: number) {
  const client = await signInAs(email);
  return client.rpc("create_game", {
    p_team: ALEVIN_A,
    p_starts_at: at(startsInHours),
    p_ends_at: at(startsInHours + 1.5),
    p_opponent: `${MARK} ${opponent}`,
  });
}

describe("partidos con sesiones de verdad", () => {
  beforeAll(cleanUp);
  afterAll(cleanUp);

  it("Álex crea un partido de su equipo; Nora y Marta no", async () => {
    const created = await createAs("alex@arcangel.test", "de Álex", 48);
    expect(created.error).toBeNull();
    expect(created.data).toMatch(/^[0-9a-f-]{36}$/);

    expect((await createAs("nora@arcangel.test", "de Nora", 48)).error).toMatchObject({ code: "P0002" });
    expect((await createAs("marta@demo.test", "de Marta", 48)).error).toMatchObject({ code: "P0002" });

    const marta = await signInAs("marta@demo.test");
    const { data } = await marta.from("games").select("event_id").eq("event_id", created.data as string);
    expect(data).toEqual([]);
  });

  it("el resultado de un partido empezado lo deja jugado, sale en «Jugados» y ya no se cancela", async () => {
    const created = await createAs("alex@arcangel.test", "empezado", -2);
    const eventId = created.data as string;

    const irene = await signInAs("irene@arcangel.test");
    expect((await irene.rpc("record_game_result", { p_event: eventId, p_score_for: 61, p_score_against: 58 })).error).toBeNull();

    const nowIso = new Date().toISOString();
    const { data, error } = await irene
      .from("events")
      // La lista de partidos es la de la Agenda, filtrada por tipo.
      .select(AGENDA_COLUMNS)
      .eq("organization_id", ORG)
      .eq("kind", "game")
      .in("team_id", [ALEVIN_A])
      .or(`status.neq.scheduled,ends_at.lte.${nowIso}`);
    if (error) throw error;
    const played = data.find((row) => row.id === eventId);
    expect(played).toMatchObject({ status: "done" });

    expect((await irene.rpc("cancel_game", { p_event: eventId })).error).toMatchObject({ code: "22023" });

    const nora = await signInAs("nora@arcangel.test");
    expect((await nora.rpc("record_game_result", { p_event: eventId, p_score_for: 0, p_score_against: 99 })).error).toMatchObject({
      code: "P0002",
    });
  });
});
