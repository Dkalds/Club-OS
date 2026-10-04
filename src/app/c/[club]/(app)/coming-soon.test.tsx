import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClubContext } from "@/modules/tenancy/queries";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import { ComingSoon } from "./coming-soon";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
function context(): ClubContext {
  return {
    org: { id: "5b0e1c4e-2a53-4f6b-9a0c-1d2e3f4a5b6c", slug: "club-a", name: "Club A", timezone: "Europe/Madrid" },
    branding: {
      displayName: "Club A",
      wordmarkSub: null,
      shortName: "CLA",
      wayName: "El camino del Club A",
      tagline: null,
      colors: { accent: "#5aa9e6", accentPressed: "#4a90c8", onAccent: "#0a0a0b", accentSoft: "#14283a" },
      terminology: {},
    },
    membership: { role: "coach", personId: null },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(context());
});

describe("ComingSoon", () => {
  it.each([
    ["games", "Partidos"],
    ["team", "Equipo"],
  ] as const)("la pestaña %s dice que «%s» llega en una próxima fase, como único <h1>", async (tab, label) => {
    render(await ComingSoon({ clubSlug: "club-a", tab }));

    expect(
      screen.getByRole("heading", { level: 1, name: `${label} llega en una próxima fase` }),
    ).toBeInTheDocument();
    expect(screen.getByText("Estamos preparando esta sección.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("lleva el icono de la pestaña, oculto para los lectores de pantalla", async () => {
    const { container } = render(await ComingSoon({ clubSlug: "club-a", tab: "team" }));

    const icon = container.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("no ofrece ninguna acción: la salida es la navegación del club", async () => {
    render(await ComingSoon({ clubSlug: "club-a", tab: "games" }));

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("pide el contexto del club de la URL y, sin club, responde con el 404", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(ComingSoon({ clubSlug: "club-b", tab: "games" })).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-b");
  });
});
