import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { navItems } from "@/modules/tenancy/navigation";

vi.mock("next/navigation", () => ({ usePathname: () => "/c/club-a/team" }));

import { AppShell } from "./app-shell";

// Slug neutro: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const SLUG = "club-a";

function renderShell() {
  return render(
    <AppShell header={<header>Cabecera</header>} nav={navItems(SLUG, {})} clubSlug={SLUG}>
      <h1>Contenido</h1>
    </AppShell>,
  );
}

describe("AppShell", () => {
  it("pone el contenido de la página dentro de <main>", () => {
    renderShell();

    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1, name: "Contenido" })).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("pinta la cabecera antes del contenido y la navegación fuera de <main>", () => {
    renderShell();

    const banner = screen.getByRole("banner");
    const main = screen.getByRole("main");
    const nav = screen.getByRole("navigation", { name: "Principal" });

    expect(banner.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(main.contains(nav)).toBe(false);
    expect(main.contains(banner)).toBe(false);
  });

  it("la navegación recibe las pestañas y marca la activa", () => {
    renderShell();

    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(within(nav).getByRole("link", { name: "Equipo" })).toHaveAttribute("aria-current", "page");
  });

  it("deja sitio para la navegación fija y el área segura del dispositivo", () => {
    renderShell();

    expect(screen.getByRole("main").className).toContain("safe-area-inset-bottom");
    expect(screen.getByRole("main").className).toContain("--nav-height");
  });
});
