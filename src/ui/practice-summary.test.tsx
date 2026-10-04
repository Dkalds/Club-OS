import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PracticeSummary } from "./practice-summary";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
type Practice = Parameters<typeof PracticeSummary>[0]["practice"];

const PRACTICE: Practice = {
  teamName: "Equipo A",
  slotLabel: "Martes 6 oct · 18:00–19:15",
  title: "Transición + rebote defensivo",
  location: "Pabellón 2",
  status: "scheduled",
  primaryFocus: { id: "f1", name: "Transición" },
  secondaryFocus: { id: "f2", name: "Rebote" },
  totalMinutes: 75,
  itemCount: 5,
};

function renderSummary(overrides: Partial<Practice> = {}) {
  return render(<PracticeSummary practice={{ ...PRACTICE, ...overrides }} />);
}

describe("PracticeSummary", () => {
  it("pinta el equipo, la franja, el título como h1, los metadatos y los dos objetivos", () => {
    renderSummary();

    expect(screen.getByText("Equipo A")).toBeInTheDocument();
    expect(screen.getByText("Martes 6 oct · 18:00–19:15")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Transición + rebote defensivo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("75 min · 5 ejercicios · Pabellón 2")).toBeInTheDocument();
    const goals = screen.getByRole("list", { name: "Objetivos" });
    expect(within(goals).getAllByRole("listitem")).toHaveLength(2);
  });

  it("el título es el único encabezado de la pantalla", () => {
    renderSummary();

    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("los objetivos van por orden: el principal primero", () => {
    renderSummary();

    const goals = within(screen.getByRole("list", { name: "Objetivos" }));
    expect(goals.getAllByRole("listitem").map((goal) => goal.textContent)).toEqual([
      "Transición",
      "Rebote",
    ]);
  });

  it("sin objetivo secundario, solo el principal", () => {
    renderSummary({ secondaryFocus: null });

    const goals = within(screen.getByRole("list", { name: "Objetivos" }));
    expect(goals.getAllByRole("listitem").map((goal) => goal.textContent)).toEqual(["Transición"]);
  });

  it("sin objetivos no pinta la lista, y no se inventa ninguno", () => {
    renderSummary({ primaryFocus: null, secondaryFocus: null });

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("Objetivos")).not.toBeInTheDocument();
  });

  it("sin equipo no pinta el kicker", () => {
    const { container } = renderSummary({ teamName: "" });

    expect(screen.queryByText("Equipo A")).not.toBeInTheDocument();
    // Lo primero de la cabecera es ya la franja.
    expect(container.querySelector("p")).toHaveTextContent("Martes 6 oct · 18:00–19:15");
  });

  it("el equipo va encima de la franja y esta encima del título", () => {
    renderSummary();

    const team = screen.getByText("Equipo A");
    const slot = screen.getByText("Martes 6 oct · 18:00–19:15");
    const title = screen.getByRole("heading", { level: 1 });
    expect(team.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sin lugar no deja un separador colgando", () => {
    renderSummary({ location: null });

    expect(screen.getByText("75 min · 5 ejercicios")).toBeInTheDocument();
  });

  it("sin ejercicios dice «Sin ejercicios todavía»", () => {
    renderSummary({ itemCount: 0, totalMinutes: 0 });

    expect(screen.getByText("0 min · Sin ejercicios todavía · Pabellón 2")).toBeInTheDocument();
  });

  it("una sesión hecha lo dice con la palabra «Hecho», en success y con un icono", () => {
    renderSummary({ status: "done" });

    const status = screen.getByText("Hecho");
    expect(status.closest("p")).toHaveClass("text-success");
    expect(status.closest("p")?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("una sesión cancelada lo dice con la palabra «Cancelada», en danger y con un icono", () => {
    renderSummary({ status: "cancelled" });

    const status = screen.getByText("Cancelada");
    expect(status.closest("p")).toHaveClass("text-danger");
    expect(status.closest("p")?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("una sesión programada no lleva estado", () => {
    const { container } = renderSummary({ status: "scheduled" });

    expect(screen.queryByText("Hecho")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancelada")).not.toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });
});
