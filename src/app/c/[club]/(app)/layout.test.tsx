import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), getViewerName: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({
  getClubContext: mocks.getClubContext,
  getViewerName: mocks.getViewerName,
}));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  usePathname: () => "/c/club-a",
}));

import AppLayout from "./layout";

function renderLayout(club = "club-a") {
  return AppLayout({ children: <h1>Contenido</h1>, params: Promise.resolve({ club }) });
}

function openAccountMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getViewerName.mockResolvedValue("Ana Ruiz");
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
});
