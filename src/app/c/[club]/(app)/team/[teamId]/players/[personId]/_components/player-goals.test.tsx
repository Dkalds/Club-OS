import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerGoal } from "@/modules/development/types";

const mocks = vi.hoisted(() => ({
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  achieveGoal: vi.fn(),
  archiveGoal: vi.fn(),
}));

vi.mock("@/modules/development/actions", () => mocks);

import { PlayerGoals } from "./player-goals";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const goal = (n: number, extra: Partial<PlayerGoal> = {}): PlayerGoal => ({
  id: uuid(100 + n),
  title: `Objetivo ${n}`,
  description: null,
  status: "active",
  achievedOn: null,
  focus: null,
  standard: null,
  ...extra,
});
const OPTIONS = {
  focusAreas: [{ id: uuid(300), name: "Técnica" }],
  standards: [{ id: uuid(301), number: 4, title: "Protejo el balón" }],
};

function renderGoals(props: Partial<Parameters<typeof PlayerGoals>[0]> = {}) {
  return render(
    <PlayerGoals
      clubSlug="club-a"
      teamId={uuid(1)}
      personId={uuid(2)}
      activeGoals={[goal(1)]}
      pastGoals={[]}
      options={OPTIONS}
      canManage
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of Object.values(mocks)) fn.mockResolvedValue({ ok: true, data: null });
});

describe("PlayerGoals", () => {
  it("cuenta los activos sobre el máximo y ofrece añadir", () => {
    renderGoals();

    expect(screen.getByRole("heading", { name: "Objetivos · 1 de 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Añadir objetivo" })).toBeEnabled();
  });

  it("con tres activos, «Añadir objetivo» se desactiva y explica por qué", () => {
    renderGoals({ activeGoals: [goal(1), goal(2), goal(3)] });

    expect(screen.getByRole("button", { name: "Añadir objetivo" })).toBeDisabled();
    expect(screen.getByText(/ya tiene 3 objetivos activos/)).toBeInTheDocument();
  });

  it("añadir: el formulario manda el objetivo con su foco y su Standard, y se cierra al guardar", async () => {
    renderGoals();

    fireEvent.click(screen.getByRole("button", { name: "Añadir objetivo" }));
    const sheet = screen.getByRole("dialog", { name: "Nuevo objetivo" });
    fireEvent.change(within(sheet).getByLabelText("Objetivo"), { target: { value: "Bote con mano débil" } });
    fireEvent.change(within(sheet).getByLabelText("Foco"), { target: { value: uuid(300) } });
    fireEvent.change(within(sheet).getByLabelText("Standard"), { target: { value: uuid(301) } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar objetivo" }));

    await waitFor(() => expect(mocks.createGoal).toHaveBeenCalledWith("club-a", {
      teamId: uuid(1),
      personId: uuid(2),
      title: "Bote con mano débil",
      description: "",
      focusAreaId: uuid(300),
      standardId: uuid(301),
    }));
    // La hoja se cierra al terminar la acción, en la transición siguiente: se espera.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nuevo objetivo" })).not.toBeInTheDocument());
  });

  it("si la base dice GOAL_LIMIT, la hoja lo explica y sigue abierta", async () => {
    mocks.createGoal.mockResolvedValue({ ok: false, error: "GOAL_LIMIT" });
    renderGoals();

    fireEvent.click(screen.getByRole("button", { name: "Añadir objetivo" }));
    const sheet = screen.getByRole("dialog", { name: "Nuevo objetivo" });
    fireEvent.change(within(sheet).getByLabelText("Objetivo"), { target: { value: "Otro" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar objetivo" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(/ya tiene 3 objetivos activos/);
  });

  it("cerrar la hoja con algo escrito pregunta antes de descartar", async () => {
    renderGoals();

    fireEvent.click(screen.getByRole("button", { name: "Añadir objetivo" }));
    fireEvent.change(screen.getByLabelText("Objetivo"), { target: { value: "A medias" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("alertdialog", { name: "¿Descartar los cambios?" })).toBeInTheDocument();
    // La hoja sigue ahí, debajo de la confirmación, con lo escrito.
    expect(screen.getByDisplayValue("A medias")).toBeInTheDocument();
  });

  it("marcar como logrado pide confirmación y entonces lo cierra", async () => {
    renderGoals();

    fireEvent.click(screen.getByRole("button", { name: "Logrado" }));
    expect(mocks.achieveGoal).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "¿Marcar como logrado?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Marcar como logrado" }));

    await waitFor(() => expect(mocks.achieveGoal).toHaveBeenCalledWith("club-a", { goalId: uuid(101) }));
  });

  it("archivar pide confirmación", async () => {
    renderGoals();

    fireEvent.click(screen.getByRole("button", { name: "Archivar" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Archivar" }));

    await waitFor(() => expect(mocks.archiveGoal).toHaveBeenCalledWith("club-a", { goalId: uuid(101) }));
  });

  it("el historial va plegado, con los logrados y archivados", () => {
    renderGoals({ pastGoals: [goal(9, { status: "achieved", achievedOn: "Martes 6 oct" })] });

    expect(screen.getByText("Historial · 1")).toBeInTheDocument();
    expect(screen.getByText("Historial · 1").closest("details")).not.toHaveAttribute("open");
  });

  it("sin permiso no hay acciones", () => {
    renderGoals({ canManage: false });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
