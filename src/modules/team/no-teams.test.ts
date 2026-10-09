import { describe, expect, it } from "vitest";
import { noTeamsState } from "./no-teams";

describe("noTeamsState", () => {
  it("dirección: no hay equipos esta temporada, y se crean en Gestión", () => {
    expect(noTeamsState("admin", "club-a", "sessions")).toEqual({
      title: "Aún no hay equipos esta temporada",
      body: "Cuando des de alta los equipos en Gestión, aquí verás sus sesiones.",
      action: { label: "Ir a Gestión", href: "/c/club-a/admin" },
    });
    expect(noTeamsState("admin", "club-a", "new-session").body).toBe(
      "Cuando des de alta los equipos en Gestión, podrás crear sus sesiones.",
    );
  });

  it("quien entrena: aún no está en ningún equipo, y se lo asigna dirección", () => {
    expect(noTeamsState("coach", "club-a", "sessions")).toEqual({
      title: "Aún no estás en ningún equipo",
      body: "Cuando dirección te asigne un equipo, aquí verás sus sesiones.",
      action: { label: "Volver a Inicio", href: "/c/club-a" },
    });
    expect(noTeamsState("coach", "club-a", "new-session")).toEqual({
      title: "Aún no estás en ningún equipo",
      body: "Cuando dirección te asigne un equipo, podrás crear sus sesiones.",
      action: { label: "Volver a Entrenar", href: "/c/club-a/train" },
    });
  });
});
