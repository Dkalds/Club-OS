import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AppNotFound from "./(app)/not-found";
import ClubNotFound from "./not-found";

// Los dos 404 de dentro de un club dicen lo mismo; solo cambia quién pone el `<main>`: el
// de la app móvil va dentro de `AppShell`, que ya lo tiene, y el del club (Gestión) no tiene
// marco, así que lleva el suyo.
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
});
