import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PlayerGoal } from "@/modules/development/types";
import { GoalItem } from "./goal-item";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const GOAL: PlayerGoal = {
  id: "g1",
  title: "Bote con mano débil",
  description: "En el uno contra uno.",
  status: "active",
  achievedOn: null,
  focus: { id: "f1", name: "Técnica" },
  standard: { id: "s1", number: 4, title: "Protejo el balón" },
};

const renderItem = (goal: PlayerGoal, actions?: React.ReactNode) =>
  render(
    <ul>
      <GoalItem goal={goal} actions={actions} />
    </ul>,
  );

describe("GoalItem", () => {
  it("el objetivo, su descripción y lo que trabaja: el Standard y el foco (regla 8)", () => {
    renderItem(GOAL);

    expect(screen.getByText("Bote con mano débil")).toBeInTheDocument();
    expect(screen.getByText("En el uno contra uno.")).toBeInTheDocument();
    expect(screen.getByText("Protejo el balón")).toBeInTheDocument();
    expect(screen.getByText("Técnica")).toBeInTheDocument();
  });

  it("uno activo no dice estado; uno logrado, cuándo; uno archivado, que lo está", () => {
    const { rerender } = renderItem(GOAL);
    expect(screen.queryByText(/Logrado|Archivado/)).not.toBeInTheDocument();

    rerender(
      <ul>
        <GoalItem goal={{ ...GOAL, status: "achieved", achievedOn: "Martes 6 oct" }} />
      </ul>,
    );
    expect(screen.getByText("Logrado el martes 6 oct")).toBeInTheDocument();

    rerender(
      <ul>
        <GoalItem goal={{ ...GOAL, status: "archived" }} />
      </ul>,
    );
    expect(screen.getByText("Archivado")).toBeInTheDocument();
  });

  it("sin descripción, foco ni Standard no deja huecos", () => {
    renderItem({ ...GOAL, description: null, focus: null, standard: null });

    expect(screen.getByRole("listitem").textContent).toBe("Bote con mano débil");
  });

  it("pinta las acciones que le den, debajo", () => {
    renderItem(GOAL, <button type="button">Marcar como logrado</button>);

    expect(screen.getByRole("button", { name: "Marcar como logrado" })).toBeInTheDocument();
  });
});
