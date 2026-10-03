import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "./states";

describe("EmptyState", () => {
  it("muestra el título, la frase y la acción como enlace", () => {
    render(
      <EmptyState
        title="Aún no hay sesiones"
        body="Crea la primera sesión."
        action={{ label: "Nueva sesión", href: "/c/club-a/train" }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Aún no hay sesiones" })).toBeInTheDocument();
    expect(screen.getByText("Crea la primera sesión.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nueva sesión" })).toHaveAttribute(
      "href",
      "/c/club-a/train",
    );
  });

  it("sin acción no pinta ningún enlace", () => {
    render(<EmptyState title="Aún no hay sesiones" body="Crea la primera sesión." />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("pinta el icono que se le da, oculto para los lectores de pantalla", () => {
    render(<EmptyState icon={<svg data-testid="icon" />} title="Título" body="Frase." />);

    expect(screen.getByTestId("icon").closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("sin icono no deja un círculo vacío", () => {
    const { container } = render(<EmptyState title="Título" body="Frase." />);

    expect(container.querySelector("[aria-hidden='true']")).toBeNull();
  });

  it("el título es un <h2> si no se dice otra cosa: la pantalla pone su <h1>", () => {
    render(<EmptyState title="Aún no hay sesiones" body="Crea la primera sesión." />);

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay sesiones" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("con headingLevel 1 el título es el <h1> de la pantalla, con el mismo aspecto", () => {
    const { rerender } = render(<EmptyState title="Aún no hay sesiones" body="Crea la primera sesión." />);
    const asSection = screen.getByRole("heading", { level: 2 }).className;

    rerender(
      <EmptyState headingLevel={1} title="Aún no hay sesiones" body="Crea la primera sesión." />,
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Aún no hay sesiones" });
    expect(heading.className).toBe(asSection);
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });
});

describe("LoadingState", () => {
  it('está ocupado (aria-busy="true") y se llama «Cargando»', () => {
    const { container } = render(<LoadingState />);

    expect(container.firstElementChild).toHaveAttribute("aria-busy", "true");
    expect(screen.getByLabelText("Cargando")).toBe(container.firstElementChild);
  });

  it("no escribe ningún texto visible", () => {
    const { container } = render(<LoadingState />);

    expect(container.textContent).toBe("");
  });

  it("pinta tres filas por defecto y las que se pidan", () => {
    const { container, rerender } = render(<LoadingState />);
    expect(container.querySelectorAll("li")).toHaveLength(3);

    rerender(<LoadingState rows={5} />);
    expect(container.querySelectorAll("li")).toHaveLength(5);
  });

  it("el pulso solo corre si la persona no pide menos movimiento", () => {
    const { container } = render(<LoadingState />);

    const pulsing = Array.from(container.querySelectorAll("[class*='animate-pulse']"));
    expect(pulsing.length).toBeGreaterThan(0);
    for (const block of pulsing) expect(block).toHaveClass("motion-safe:animate-pulse");
  });
});

describe("ErrorState", () => {
  it("avisa con role=alert y muestra título y frase", () => {
    render(<ErrorState title="No se pudo cargar" body="Revisa la conexión." />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No se pudo cargar");
    expect(alert).toHaveTextContent("Revisa la conexión.");
  });

  it("con onRetry muestra «Reintentar» y lo llama al pulsar", () => {
    const onRetry = vi.fn();
    render(<ErrorState title="No se pudo cargar" body="Revisa la conexión." onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("sin onRetry no pinta ningún botón", () => {
    render(<ErrorState title="No se pudo cargar" body="Revisa la conexión." />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("el título es un <h2> si no se dice otra cosa", () => {
    render(<ErrorState title="No se pudo cargar" body="Revisa la conexión." />);

    expect(screen.getByRole("heading", { level: 2, name: "No se pudo cargar" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("con headingLevel 1 el título es el <h1> de la pantalla, dentro del aviso", () => {
    const { rerender } = render(<ErrorState title="No se pudo cargar" body="Revisa la conexión." />);
    const asSection = screen.getByRole("heading", { level: 2 }).className;

    rerender(<ErrorState headingLevel={1} title="No se pudo cargar" body="Revisa la conexión." />);

    const heading = screen.getByRole("heading", { level: 1, name: "No se pudo cargar" });
    expect(heading.className).toBe(asSection);
    expect(screen.getByRole("alert")).toContainElement(heading);
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });
});
