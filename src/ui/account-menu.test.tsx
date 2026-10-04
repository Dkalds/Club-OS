import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccountMenu } from "./account-menu";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ADMIN_HREF = "/c/club-a/admin";

function toggle() {
  return screen.getByRole("button", { name: "Abrir menú de cuenta" });
}

function openMenu() {
  fireEvent.click(toggle());
}

describe("AccountMenu", () => {
  it("cerrado por defecto", () => {
    render(<AccountMenu name="Ana Ruiz" adminHref={ADMIN_HREF} />);

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Salir" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Gestión" })).not.toBeInTheDocument();
  });

  it("el botón lleva el avatar de la persona", () => {
    render(<AccountMenu name="Ana Ruiz" adminHref={null} />);

    const avatar = within(toggle()).getByRole("img", { name: "Ana Ruiz" });
    expect(avatar).toHaveTextContent("AR");
  });

  it("al pulsar el botón se abre y vuelve a cerrarse", () => {
    render(<AccountMenu name="Ana Ruiz" adminHref={null} />);

    openMenu();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
    // El botón apunta a lo que abre.
    const panelId = toggle().getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId ?? "")).toContainElement(
      screen.getByRole("button", { name: "Salir" }),
    );

    openMenu();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Salir" })).not.toBeInTheDocument();
  });

  it("Salir es un POST a /auth/sign-out", () => {
    render(<AccountMenu name="Ana Ruiz" adminHref={null} />);
    openMenu();

    const form = screen.getByRole("button", { name: "Salir" }).closest("form");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("method", "post");
    expect(form).toHaveAttribute("action", "/auth/sign-out");
    expect(screen.getByRole("button", { name: "Salir" })).toHaveAttribute("type", "submit");
  });

  it("dirección ve Gestión", () => {
    render(<AccountMenu name="Ana Ruiz" adminHref={ADMIN_HREF} />);
    openMenu();

    expect(screen.getByRole("link", { name: "Gestión" })).toHaveAttribute("href", ADMIN_HREF);
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
  });

  it("un entrenador no ve Gestión", () => {
    render(<AccountMenu name="Ana Ruiz" adminHref={null} />);
    openMenu();

    expect(screen.queryByRole("link", { name: "Gestión" })).not.toBeInTheDocument();
    expect(screen.queryByText("Gestión")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
  });

  it("Escape cierra y devuelve el foco al botón", () => {
    render(<AccountMenu name="Ana Ruiz" adminHref={ADMIN_HREF} />);
    openMenu();
    screen.getByRole("link", { name: "Gestión" }).focus();
    expect(screen.getByRole("link", { name: "Gestión" })).toHaveFocus();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Gestión" })).not.toBeInTheDocument();
    expect(toggle()).toHaveFocus();
  });

  it("Escape con el menú cerrado no hace nada", () => {
    render(
      <>
        <button type="button">Otro control</button>
        <AccountMenu name="Ana Ruiz" adminHref={null} />
      </>,
    );
    screen.getByRole("button", { name: "Otro control" }).focus();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(screen.getByRole("button", { name: "Otro control" })).toHaveFocus();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("pulsar fuera lo cierra, sin quitarle el foco a lo que se ha pulsado", () => {
    render(
      <>
        <button type="button">Fuera</button>
        <AccountMenu name="Ana Ruiz" adminHref={null} />
      </>,
    );
    openMenu();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Fuera" }));

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(toggle()).not.toHaveFocus();
  });

  it("pulsar dentro del menú no lo cierra", () => {
    render(<AccountMenu name="Ana Ruiz" adminHref={ADMIN_HREF} />);
    openMenu();

    fireEvent.pointerDown(screen.getByRole("link", { name: "Gestión" }));
    fireEvent.pointerDown(toggle());

    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("si el foco sale del menú con el teclado, se cierra", () => {
    render(
      <>
        <AccountMenu name="Ana Ruiz" adminHref={null} />
        <button type="button">Siguiente</button>
      </>,
    );
    openMenu();
    screen.getByRole("button", { name: "Salir" }).focus();

    // El foco no lo mueve `fireEvent`: se envuelve en `act` para que React aplique el cierre.
    act(() => screen.getByRole("button", { name: "Siguiente" }).focus());

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("las áreas táctiles llegan a target-min", () => {
    render(<AccountMenu name="Ana Ruiz" adminHref={ADMIN_HREF} />);
    openMenu();

    expect(toggle().className).toContain("size-(--target-min)");
    expect(screen.getByRole("link", { name: "Gestión" }).className).toContain("min-h-(--target-min)");
    expect(screen.getByRole("button", { name: "Salir" }).className).toContain("min-h-(--target-min)");
  });

  it("el ancho mínimo del panel sale de un token, no de la escala de Tailwind", () => {
    render(<AccountMenu name="Ana Ruiz" adminHref={ADMIN_HREF} />);
    openMenu();

    const panel = document.getElementById(toggle().getAttribute("aria-controls") ?? "");
    // Cuatro áreas táctiles de ancho: lo mismo que medía, pero atado a `target-min`.
    expect(panel?.className).toContain("min-w-[calc(var(--target-min)*4)]");
    expect(panel?.className).not.toMatch(/\bmin-w-\d/);
  });
});
