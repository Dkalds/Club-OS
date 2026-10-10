import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiveControls } from "./live-controls";

const noop = () => {};

describe("LiveControls", () => {
  it("el botón Anterior está deshabilitado en el primero", () => {
    render(
      <LiveControls
        onPrevious={noop}
        onTogglePause={noop}
        onNext={noop}
        paused={false}
        isFirst={true}
        isLast={false}
      />,
    );
    expect(screen.getByLabelText("Ejercicio anterior")).toBeDisabled();
  });

  it("en el último, el control de la derecha termina y está habilitado", () => {
    render(
      <LiveControls
        onPrevious={noop}
        onTogglePause={noop}
        onNext={noop}
        paused={false}
        isFirst={false}
        isLast={true}
      />,
    );
    expect(screen.getByRole("button", { name: "Terminar entrenamiento" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Siguiente ejercicio" })).not.toBeInTheDocument();
  });

  it("muestra 'Pausa' cuando activo y 'Reanudar' cuando pausado", () => {
    const { rerender } = render(
      <LiveControls
        onPrevious={noop}
        onTogglePause={noop}
        onNext={noop}
        paused={false}
        isFirst={false}
        isLast={false}
      />,
    );
    expect(screen.getByRole("button", { name: /pausa/i })).toBeInTheDocument();
    rerender(
      <LiveControls
        onPrevious={noop}
        onTogglePause={noop}
        onNext={noop}
        paused={true}
        isFirst={false}
        isLast={false}
      />,
    );
    expect(screen.getByRole("button", { name: /reanudar/i })).toBeInTheDocument();
  });

  it("solo hay un botón principal (el de pausa/reanudar)", () => {
    render(
      <LiveControls
        onPrevious={noop}
        onTogglePause={noop}
        onNext={noop}
        paused={false}
        isFirst={false}
        isLast={false}
      />,
    );
    const buttons = screen.getAllByRole("button");
    const primaryButtons = buttons.filter((b) => b.className.includes("bg-brand-accent"));
    expect(primaryButtons).toHaveLength(1);
  });

  it("fuera del último, el control de la derecha pasa al siguiente", () => {
    render(
      <LiveControls
        onPrevious={noop}
        onTogglePause={noop}
        onNext={noop}
        paused={false}
        isFirst={false}
        isLast={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Siguiente ejercicio" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Terminar entrenamiento" })).not.toBeInTheDocument();
  });
});
