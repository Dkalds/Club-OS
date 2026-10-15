import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { navItems, type NavItem } from "@/modules/tenancy/navigation";

const mocks = vi.hoisted(() => ({ usePathname: vi.fn<() => string>() }));

vi.mock("next/navigation", () => ({ usePathname: mocks.usePathname }));

import { BottomNavigation } from "./bottom-navigation";

// Slug neutro: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const SLUG = "club-a";
const STAFF = navItems(SLUG, "coach");
const MEMBER = navItems(SLUG, "player");

function renderAt(pathname: string, items: NavItem[] = STAFF) {
  mocks.usePathname.mockReturnValue(pathname);
  return render(<BottomNavigation items={items} clubSlug={SLUG} />);
}

const current = () => screen.getAllByRole("link").filter((link) => link.hasAttribute("aria-current"));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("BottomNavigation", () => {
  it('marca la pestaña activa con aria-current="page"', () => {
    renderAt("/c/club-a/train");

    expect(screen.getByRole("link", { name: "Sesiones" })).toHaveAttribute("aria-current", "page");
    for (const name of ["Inicio", "Agenda", "Biblioteca", "Equipo"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("aria-current");
    }
  });

  it("en la portada del club la pestaña activa es Inicio", () => {
    renderAt("/c/club-a");

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
    expect(current()).toHaveLength(1);
  });

  it("dentro de una sección sigue activa su pestaña", () => {
    renderAt("/c/club-a/drills/4b0c6c0e-5d0a-4a57-9f5e-0c3b3f1d2a10");

    expect(screen.getByRole("link", { name: "Biblioteca" })).toHaveAttribute("aria-current", "page");
  });

  it("la ficha de un partido marca Agenda, donde viven los partidos", () => {
    renderAt("/c/club-a/games/4b0c6c0e-5d0a-4a57-9f5e-0c3b3f1d2a10");

    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page");
  });

  it("en una ruta sin pestaña en esta barra (la identidad, para quien entrena) marca Inicio: una, y solo una", () => {
    renderAt("/c/club-a/way/standards");

    expect(current().map((link) => link.textContent)).toEqual(["Inicio"]);
  });

  it("es la navegación «Principal» con las cinco pestañas de quien entrena, cada una a su ruta", () => {
    renderAt("/c/club-a");

    const nav = screen.getByRole("navigation", { name: "Principal" });
    const links = within(nav).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual(["Inicio", "Agenda", "Sesiones", "Biblioteca", "Equipo"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/c/club-a",
      "/c/club-a/agenda",
      "/c/club-a/train",
      "/c/club-a/drills",
      "/c/club-a/team",
    ]);
  });

  it("con las dos pestañas de un jugador, solo esas dos", () => {
    renderAt("/c/club-a/way", MEMBER);

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Inicio", "Identidad"]);
    expect(current().map((link) => link.textContent)).toEqual(["Identidad"]);
  });

  it("reparte el ancho entre las pestañas que haya, sean dos o cinco", () => {
    for (const items of [STAFF, MEMBER]) {
      const { unmount } = renderAt("/c/club-a", items);
      const grid = screen.getByRole("navigation", { name: "Principal" }).firstElementChild;

      expect(grid).toHaveClass("grid", "auto-cols-fr", "grid-flow-col");
      expect(grid?.className).not.toMatch(/grid-cols-\d/);
      unmount();
    }
  });

  it("la pestaña activa va en el acento del club y con el trazo más grueso", () => {
    renderAt("/c/club-a/agenda");

    const active = screen.getByRole("link", { name: "Agenda" });
    const inactive = screen.getByRole("link", { name: "Equipo" });

    expect(active).toHaveClass("text-brand-accent");
    expect(inactive).toHaveClass("text-ink-3");
    expect(inactive).not.toHaveClass("text-brand-accent");
    expect(active.querySelector("svg")).toHaveAttribute("stroke-width", "2.25");
    expect(inactive.querySelector("svg")).toHaveAttribute("stroke-width", "1.75");
  });

  it("cada pestaña lleva icono decorativo y texto", () => {
    renderAt("/c/club-a");

    for (const link of screen.getAllByRole("link")) {
      const icon = link.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(link.textContent?.trim()).not.toBe("");
    }
  });

  it("cada pestaña ocupa al menos el área táctil mínima", () => {
    renderAt("/c/club-a");

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("min-h-(--target-min)", "min-w-(--target-min)");
    }
  });
});
