import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCategory, AdminSeason, AdminTeam } from "@/modules/team/admin-queries";

const mocks = vi.hoisted(() => ({
  createSeason: vi.fn(),
  updateSeason: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
}));

vi.mock("@/modules/team/actions", () => mocks);

import { TeamsScreen } from "./teams-screen";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const SEASON: AdminSeason = { id: uuid(1), name: "2026/27", startsOn: "2026-09-01", endsOn: "2027-06-30", isCurrent: true };
const CATEGORY: AdminCategory = { id: uuid(2), name: "Alevín", ageBand: "U12", sort: 10 };
const TEAM: AdminTeam = {
  id: uuid(3),
  name: "T1",
  seasonId: SEASON.id,
  seasonName: SEASON.name,
  categoryId: CATEGORY.id,
  categoryName: CATEGORY.name,
};

function renderScreen(props: Partial<Parameters<typeof TeamsScreen>[0]> = {}) {
  return render(
    <TeamsScreen clubSlug="club-a" seasons={[SEASON]} categories={[CATEGORY]} teams={[TEAM]} {...props} />,
  );
}

/** La <section> de un apartado («Temporadas», «Categorías», «Equipos»), por su <h2>. */
function section(heading: string) {
  return screen.getByRole("heading", { level: 2, name: heading }).closest("section")!;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeamsScreen", () => {
  it("lista temporadas, categorías y equipos", () => {
    renderScreen();

    expect(within(section("Temporadas")).getByText("2026/27")).toBeInTheDocument();
    expect(within(section("Temporadas")).getByText("Actual")).toBeInTheDocument();
    expect(within(section("Categorías")).getByText("Alevín")).toBeInTheDocument();
    expect(within(section("Equipos")).getByText("T1")).toBeInTheDocument();
  });

  it("crea una temporada", async () => {
    mocks.createSeason.mockResolvedValue({ ok: true, data: { seasonId: "x" } });
    renderScreen();

    const form = screen.getByRole("heading", { name: "Nueva temporada" }).closest("div")!;
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "2027/28" } });
    fireEvent.change(within(form).getByLabelText("Empieza"), { target: { value: "2027-09-01" } });
    fireEvent.change(within(form).getByLabelText("Termina"), { target: { value: "2028-06-30" } });
    fireEvent.click(within(form).getByRole("button", { name: "Crear temporada" }));

    await waitFor(() => expect(mocks.createSeason).toHaveBeenCalled());
    expect(mocks.createSeason).toHaveBeenCalledWith("club-a", {
      name: "2027/28",
      startsOn: "2027-09-01",
      endsOn: "2028-06-30",
      isCurrent: false,
    });
  });

  it("edita una temporada existente", async () => {
    mocks.updateSeason.mockResolvedValue({ ok: true, data: null });
    renderScreen();

    const row = within(section("Temporadas")).getByText("2026/27").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Editar" }));
    fireEvent.change(within(row).getByLabelText("Nombre"), { target: { value: "2026/27 (editada)" } });
    fireEvent.click(within(row).getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(mocks.updateSeason).toHaveBeenCalled());
    expect(mocks.updateSeason).toHaveBeenCalledWith("club-a", {
      seasonId: SEASON.id,
      name: "2026/27 (editada)",
      startsOn: "2026-09-01",
      endsOn: "2027-06-30",
      isCurrent: true,
    });
  });

  it("cancelar la edición no llama a ninguna acción", () => {
    renderScreen();

    const row = within(section("Categorías")).getByText("Alevín").closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Editar" }));
    fireEvent.click(within(row).getByRole("button", { name: "Cancelar" }));

    expect(within(section("Categorías")).getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(mocks.updateCategory).not.toHaveBeenCalled();
  });

  it("crea un equipo con la temporada actual preseleccionada", async () => {
    mocks.createTeam.mockResolvedValue({ ok: true, data: { teamId: "x" } });
    renderScreen();

    const form = screen.getByRole("heading", { name: "Nuevo equipo" }).closest("div")!;
    fireEvent.change(within(form).getByLabelText("Nombre"), { target: { value: "T2" } });
    fireEvent.click(within(form).getByRole("button", { name: "Crear equipo" }));

    await waitFor(() => expect(mocks.createTeam).toHaveBeenCalled());
    expect(mocks.createTeam).toHaveBeenCalledWith("club-a", {
      name: "T2",
      seasonId: SEASON.id,
      categoryId: CATEGORY.id,
    });
  });

  it("sin temporadas ni categorías, no ofrece crear un equipo", () => {
    renderScreen({ seasons: [], categories: [] });

    expect(screen.queryByRole("heading", { name: "Nuevo equipo" })).toBeNull();
  });
});
