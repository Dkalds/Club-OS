// Integración contra Supabase local (`pnpm seed` hecho): las consultas de «mis equipos» de
// `src/modules/team`, con la sesión de cada usuario y RLS de verdad. Los tests de unidad usan
// un doble que imita el `!inner` de PostgREST; aquí se comprueba que la base hace lo mismo con
// un equipo de la temporada pasada en el seed (Benjamín B, 2025/26, que entrenaba Álex).

import { beforeAll, describe, expect, it } from "vitest";
import {
  STAFF_TEAM_COLUMNS,
  TEAM_COLUMNS,
  TEAM_DETAIL_COLUMNS,
  toStaffTeamSummaries,
  toTeamDetail,
  toTeamSummaries,
} from "@/modules/team/map-rows";
import { ARCANGEL, seedId } from "../seed/data";
import { signInAs } from "../lib/user-client";

const ORG = seedId(ARCANGEL.slug, "organization");
const ALEVIN_A = seedId(ARCANGEL.slug, "team:alevin-a");
const BENJAMIN_B = seedId(ARCANGEL.slug, "team:2025-26:benjamin-b");
const ALEX = seedId(ARCANGEL.slug, "person:alex");
const NORA = seedId(ARCANGEL.slug, "person:nora");

async function staffTeams(email: string, personId: string) {
  const client = await signInAs(email);
  const { data, error } = await client
    .from("team_staff")
    .select(STAFF_TEAM_COLUMNS)
    .eq("organization_id", ORG)
    .eq("person_id", personId)
    .eq("teams.seasons.is_current", true);
  if (error) throw error;
  return toStaffTeamSummaries(data);
}

async function teamDetail(email: string, teamId: string) {
  const client = await signInAs(email);
  const { data, error } = await client
    .from("teams")
    .select(TEAM_DETAIL_COLUMNS)
    .eq("organization_id", ORG)
    .eq("id", teamId)
    .eq("seasons.is_current", true)
    .maybeSingle();
  if (error) throw error;
  return data ? toTeamDetail(data) : null;
}

describe("mis equipos con datos reales", () => {
  beforeAll(async () => {
    // El equipo pasado existe y Álex estaba en su cuerpo técnico: si no, el test no prueba nada.
    const client = await signInAs("raul@arcangel.test");
    const { data } = await client.from("team_staff").select("team_id").eq("team_id", BENJAMIN_B);
    expect(data).toEqual([{ team_id: BENJAMIN_B }]);
  });

  it("Álex: Alevín A, no el equipo que entrenó la temporada pasada", async () => {
    const teams = await staffTeams("alex@arcangel.test", ALEX);
    expect(teams.map((team) => team.name)).toEqual(["Alevín A"]);
    expect(teams[0]).toMatchObject({ categoryName: "Alevín", seasonName: "2026/27" });
  });

  it("Raúl (dirección): todos los equipos del club de esta temporada, en el orden de sus categorías", async () => {
    const client = await signInAs("raul@arcangel.test");
    const { data, error } = await client
      .from("teams")
      .select(TEAM_COLUMNS)
      .eq("organization_id", ORG)
      .eq("seasons.is_current", true);
    if (error) throw error;

    expect(toTeamSummaries(data).map((team) => team.name)).toEqual(["Benjamín A", "Alevín A"]);
  });

  it("la plantilla de Alevín A: doce jugadores por dorsal y su cuerpo técnico", async () => {
    const team = await teamDetail("alex@arcangel.test", ALEVIN_A);

    expect(team?.players).toHaveLength(12);
    expect(team?.players.map((p) => p.jerseyNumber)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(team?.staff.map((s) => [s.firstName, s.role])).toEqual([
      ["Álex", "head_coach"],
      ["Irene", "assistant"],
    ]);
  });

  it("el equipo de la temporada pasada no se abre ni para quien lo entrenó", async () => {
    expect(await teamDetail("alex@arcangel.test", BENJAMIN_B)).toBeNull();
  });

  it("Nora no ve Alevín A ni su plantilla", async () => {
    expect(await teamDetail("nora@arcangel.test", ALEVIN_A)).toBeNull();
    expect((await staffTeams("nora@arcangel.test", NORA)).map((team) => team.name)).toEqual(["Benjamín A"]);
  });

  it("Marta, de otro club, no ve ningún equipo de este", async () => {
    expect(await teamDetail("marta@demo.test", ALEVIN_A)).toBeNull();
  });
});
