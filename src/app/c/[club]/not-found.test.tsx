import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { adminNavItems } from "@/modules/tenancy/navigation";
import { AdminShell } from "@/ui/admin-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/c/club-a/admin/way/una-seccion" }));

import AppNotFound from "./(app)/not-found";
import AdminNotFound from "./admin/not-found";
import ClubNotFound from "./not-found";

// Los tres 404 de dentro de un club dicen lo mismo; solo cambia quién pone el `<main>`: el
// de la app móvil va dentro de `AppShell` y el de Gestión dentro de `AdminShell`, que ya lo
// tienen, y el del club (lo que lanza el layout de Gestión) no tiene marco, así que lleva el suyo.
describe("404 de dentro de un club", () => {
  it("el de la app móvil no pone su propio <main>", () => {
    const { container } = render(<AppNotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a tus clubes" })).toHaveAttribute("href", "/select-club");
    expect(container.querySelector("main")).toBeNull();
  });

  it("el del club (fuera de la app móvil) pone un único <main> con el mismo contenido", () => {
    render(<ClubNotFound />);

    const main = screen.getByRole("main");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(main).toContainElement(
      screen.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    );
    expect(screen.getByRole("link", { name: "Volver a tus clubes" })).toHaveAttribute("href", "/select-club");
  });

  it("el de Gestión no pone su propio <main> y dice lo mismo", () => {
    const { container } = render(<AdminNotFound />);

    expect(screen.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a tus clubes" })).toHaveAttribute("href", "/select-club");
    expect(container.querySelector("main")).toBeNull();
  });

  it("el de Gestión se queda dentro del marco: un único <main>, su navegación y su salida siguen ahí", () => {
    render(
      <AdminShell brandName="Club A" clubSlug="club-a" items={adminNavItems("club-a", {})}>
        <AdminNotFound />
      </AdminShell>,
    );

    const main = screen.getByRole("main");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(
      within(main).getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Gestión" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a la app" })).toHaveAttribute("href", "/c/club-a");
  });
});
