import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerProfile } from "@/modules/development/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({
  getClubContext: vi.fn(),
  getPlayerProfile: vi.fn(),
  getGoalFormOptions: vi.fn(),
}));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/development/queries", () => ({
  getPlayerProfile: mocks.getPlayerProfile,
  getGoalFormOptions: mocks.getGoalFormOptions,
}));
vi.mock("@/modules/development/actions", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));

import PlayerPage from "./page";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PROFILE: PlayerProfile = {
  personId: uuid(2),
  firstName: "Ana",
  lastName: "Pino",
  jerseyNumber: 7,
  position: "Base",
  team: { id: uuid(1), name: "Equipo A", categoryName: "Categoría" },
  activeGoals: [],
  pastGoals: [],
  notes: [],
};

const props = () => ({
  params: Promise.resolve({ club: "club-a", teamId: uuid(1), personId: uuid(2) }),
  searchParams: Promise.resolve({}),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.getPlayerProfile.mockResolvedValue(PROFILE);
  mocks.getGoalFormOptions.mockResolvedValue({ focusAreas: [], standards: [] });
});

describe("ficha del jugador", () => {
  it("quién es: dorsal, nombre, posición, equipo y categoría; y la vuelta a su equipo", async () => {
    render(await PlayerPage(props()));

    expect(screen.getByRole("heading", { level: 1, name: "Ana Pino" })).toBeInTheDocument();
    expect(screen.getByText("Dorsal 7")).toBeInTheDocument();
    expect(screen.getByText("Base · Equipo A · Categoría")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Equipo A/ })).toHaveAttribute("href", `/c/club-a/team/${uuid(1)}`);
    expect(mocks.getPlayerProfile).toHaveBeenCalledWith(expect.anything(), uuid(1), uuid(2));
  });

  it("no enseña ningún año: la categoría ya lo dice", async () => {
    const { container } = render(await PlayerPage(props()));

    expect(container.textContent).not.toMatch(/\b(19|20)\d{2}\b(?!\/)/);
  });

  it("un jugador que no se ve: 404", async () => {
    mocks.getPlayerProfile.mockResolvedValue(null);

    await expect(PlayerPage(props())).rejects.toThrow("NOT_FOUND");
  });

  it("sin permiso de objetivos no pide las opciones del formulario ni ofrece añadir", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("player"));

    render(await PlayerPage(props()));

    expect(mocks.getGoalFormOptions).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Añadir objetivo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Añadir nota/ })).not.toBeInTheDocument();
  });
});
