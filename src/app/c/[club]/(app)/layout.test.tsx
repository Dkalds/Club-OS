import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), getViewerName: vi.fn(), listMyTeams: vi.fn() }));

// Sin cookie de equipo activo: se ven todos «mis equipos» (`getTeamScope`).
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/modules/tenancy/queries", () => ({
  getClubContext: mocks.getClubContext,
  getViewerName: mocks.getViewerName,
}));
vi.mock("@/modules/team/queries", () => ({ listMyTeams: mocks.listMyTeams }));
// El selector de equipo es de cliente y llama a una acción: aquí solo importa si se monta.
vi.mock("@/modules/team/actions", () => ({ setActiveTeam: vi.fn() }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  usePathname: () => "/c/club-a",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import AppLayout from "./layout";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const TEAM_A = { id: "00000000-0000-4000-8000-0000000000a1", name: "Equipo A", categoryName: "C1", seasonName: "2026/27" };
const TEAM_B = { id: "00000000-0000-4000-8000-0000000000b1", name: "Equipo B", categoryName: "C2", seasonName: "2026/27" };

function renderLayout(club = "club-a") {
  return AppLayout({ children: <h1>Contenido</h1>, params: Promise.resolve({ club }) });
}

function openAccountMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getViewerName.mockResolvedValue("Ana Ruiz");
  mocks.listMyTeams.mockResolvedValue([TEAM_A]);
});

describe("layout de la app móvil del club", () => {
  it("monta la cabecera con la marca, el contenido y la navegación inferior", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach", { way: "Nuestra forma" }));

    render(await renderLayout());

    expect(screen.getByRole("banner")).toHaveTextContent("Club A");
    expect(within(screen.getByRole("main")).getByRole("heading", { name: "Contenido" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Inicio",
      "Nuestra forma",
      "Entrenar",
      "Partidos",
      "Equipo",
    ]);
  });

  it("el avatar lleva el nombre de la persona, que lee getViewerName con el contexto", async () => {
    const ctx = clubContext("coach");
    mocks.getClubContext.mockResolvedValue(ctx);

    render(await renderLayout());

    expect(mocks.getViewerName).toHaveBeenCalledWith(ctx);
    expect(screen.getByRole("img", { name: "Ana Ruiz" })).toBeInTheDocument();
  });

  it("dirección ve Gestión en el menú de cuenta, con el enlace del club", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));

    render(await renderLayout());
    openAccountMenu();

    expect(screen.getByRole("link", { name: "Gestión" })).toHaveAttribute("href", "/c/club-a/admin");
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
  });

  it.each(["coach", "player", "guardian"] as const)(
    "un miembro con el rol %s solo ve Salir",
    async (role) => {
      mocks.getClubContext.mockResolvedValue(clubContext(role));

      render(await renderLayout());
      openAccountMenu();

      expect(screen.queryByRole("link", { name: "Gestión" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
    },
  );

  it("sin club responde con el 404", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(renderLayout("club-b")).rejects.toThrow("NOT_FOUND");
    expect(mocks.getViewerName).not.toHaveBeenCalled();
  });

  it("con un solo equipo no hay selector de equipo", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("coach"));

    render(await renderLayout());

    expect(screen.queryByRole("button", { name: /Cambiar de equipo$/ })).not.toBeInTheDocument();
  });

  it("con más de un equipo, la cabecera lleva el selector, que por defecto dice «Todos»", async () => {
    const ctx = clubContext("admin");
    mocks.getClubContext.mockResolvedValue(ctx);
    mocks.listMyTeams.mockResolvedValue([TEAM_B, TEAM_A]);

    render(await renderLayout());

    expect(mocks.listMyTeams).toHaveBeenCalledWith(ctx);
    const switcher = within(screen.getByRole("banner")).getByRole("button", { name: /Cambiar de equipo$/ });
    expect(switcher).toHaveTextContent("Todos");
  });

  it("sin equipos (un jugador, una familia) tampoco hay selector", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("player"));
    mocks.listMyTeams.mockResolvedValue([]);

    render(await renderLayout());

    expect(screen.queryByRole("button", { name: /Cambiar de equipo$/ })).not.toBeInTheDocument();
  });
});
