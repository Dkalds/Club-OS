import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { adminNavItems } from "@/modules/tenancy/navigation";

vi.mock("next/navigation", () => ({ usePathname: () => "/c/club-a/admin/principles" }));

import { AdminShell } from "./admin-shell";

// Slug y nombre neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
function renderShell() {
  return render(
    <AdminShell brandName="Club A" clubSlug="club-a" items={adminNavItems("club-a", {})}>
      <h1>Contenido</h1>
    </AdminShell>,
  );
}

describe("AdminShell", () => {
  it("la cabecera lleva el nombre del club y el kicker «Gestión»", () => {
    renderShell();

    const banner = screen.getByRole("banner");
    expect(banner).toHaveTextContent("Club A");
    expect(banner).toHaveTextContent("Gestión");
  });

  it("«Volver a la app» lleva a Inicio del club", () => {
    renderShell();

    const back = within(screen.getByRole("banner")).getByRole("link", { name: "Volver a la app" });
    expect(back).toHaveAttribute("href", "/c/club-a");
    expect(back.className).toContain("text-brand-accent");
    expect(back.className).toContain("min-h-(--target-min)");
  });

  it("pone el contenido dentro de un único <main>", () => {
    renderShell();

    const main = screen.getByRole("main");
    expect(within(main).getByRole("heading", { level: 1, name: "Contenido" })).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("la navegación «Gestión» va fuera de <main>, antes que él, y marca el apartado activo", () => {
    renderShell();

    const nav = screen.getByRole("navigation", { name: "Gestión" });
    const main = screen.getByRole("main");
    expect(main.contains(nav)).toBe(false);
    expect(nav.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(nav).getByRole("link", { name: "Principios" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("no tiene navegación inferior: solo la de Gestión", () => {
    renderShell();

    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Principal" })).not.toBeInTheDocument();
  });

  it("bajo lg las pestañas se desplazan y desde lg son una columna de admin-nav", () => {
    renderShell();

    const nav = screen.getByRole("navigation", { name: "Gestión" });
    expect(nav.className).toContain("overflow-x-auto");
    expect(nav.className).toContain("lg:w-(--admin-nav)");
    expect(screen.getByRole("main").className).toContain("lg:max-w-(--admin-content-max)");
  });
});
