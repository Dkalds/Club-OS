import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { navItems } from "@/modules/tenancy/navigation";

const mocks = vi.hoisted(() => ({ usePathname: vi.fn<() => string>() }));

vi.mock("next/navigation", () => ({ usePathname: mocks.usePathname }));

import { BottomNavigation } from "./bottom-navigation";

// Slug neutro: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const SLUG = "club-a";
const ITEMS = navItems(SLUG, { way: "Nuestro estilo" });

function renderAt(pathname: string) {
  mocks.usePathname.mockReturnValue(pathname);
  return render(<BottomNavigation items={ITEMS} clubSlug={SLUG} />);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("BottomNavigation", () => {
  it('marca la pestaña activa con aria-current="page"', () => {
    renderAt("/c/club-a/train");

    expect(screen.getByRole("link", { name: "Entrenar" })).toHaveAttribute("aria-current", "page");
    for (const name of ["Inicio", "Nuestro estilo", "Partidos", "Equipo"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("aria-current");
    }
  });

  it("en la portada del club la pestaña activa es Inicio", () => {
    renderAt("/c/club-a");

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(1);
  });

  it("dentro de una sección sigue activa su pestaña", () => {
    renderAt("/c/club-a/games/4b0c6c0e-5d0a-4a57-9f5e-0c3b3f1d2a10");

    expect(screen.getByRole("link", { name: "Partidos" })).toHaveAttribute("aria-current", "page");
  });

  it("es la navegación «Principal» con cinco enlaces, cada uno a su ruta", () => {
    renderAt("/c/club-a");

    const nav = screen.getByRole("navigation", { name: "Principal" });
    const links = within(nav).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual([
      "Inicio",
      "Nuestro estilo",
      "Entrenar",
      "Partidos",
      "Equipo",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/c/club-a",
      "/c/club-a/way",
      "/c/club-a/train",
      "/c/club-a/games",
      "/c/club-a/team",
    ]);
  });

  it("la pestaña activa va en el acento del club y con el trazo más grueso", () => {
    renderAt("/c/club-a/way");

    const active = screen.getByRole("link", { name: "Nuestro estilo" });
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
