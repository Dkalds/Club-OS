import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { HomePractice } from "@/modules/home/types";
import { PracticeCard } from "./practice-card";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const HREF = "/c/club-a/train";
const PRACTICE: HomePractice = {
  eventId: "e1",
  teamName: "Equipo A",
  slotLabel: "Martes 6 oct · 18:00–19:15",
  title: "Transición + rebote defensivo",
  totalMinutes: 75,
  drillCount: 5,
  focus: ["Transición", "Rebote"],
  location: "Pabellón 2",
  live: { started: false, position: null },
};

function renderCard(overrides: Partial<HomePractice> = {}) {
  return render(<PracticeCard practice={{ ...PRACTICE, ...overrides }} href={HREF} />);
}

describe("PracticeCard", () => {
  it("muestra el kicker, el cuándo, el título, los metadatos y las etiquetas", () => {
    renderCard();

    expect(screen.getByText("Próximo entrenamiento · Equipo A")).toBeInTheDocument();
    expect(screen.getByText("Martes 6 oct · 18:00–19:15")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Transición + rebote defensivo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("75 min · 5 ejercicios · Pabellón 2")).toBeInTheDocument();
    expect(screen.getByText("Transición")).toBeInTheDocument();
    expect(screen.getByText("Rebote")).toBeInTheDocument();
  });

  it("sin equipo, el kicker es solo «Próximo entrenamiento», sin separador colgando", () => {
    renderCard({ teamName: "" });

    expect(screen.getByText("Próximo entrenamiento")).toBeInTheDocument();
    expect(screen.queryByText(/·\s*$/)).not.toBeInTheDocument();
  });

  it("un equipo en blanco cuenta como sin equipo", () => {
    renderCard({ teamName: "   " });

    expect(screen.getByText("Próximo entrenamiento")).toBeInTheDocument();
  });

  it("ofrece «Abrir entrenamiento» como enlace al href dado", () => {
    renderCard();

    expect(screen.getByRole("link", { name: "Abrir entrenamiento" })).toHaveAttribute("href", HREF);
  });

  it("con un solo ejercicio lo dice en singular", () => {
    renderCard({ drillCount: 1 });

    expect(screen.getByText("75 min · 1 ejercicio · Pabellón 2")).toBeInTheDocument();
  });

  it("sin ejercicios dice «Sin ejercicios todavía»", () => {
    renderCard({ drillCount: 0 });

    expect(screen.getByText("75 min · Sin ejercicios todavía · Pabellón 2")).toBeInTheDocument();
  });

  it("sin lugar no deja un separador colgando", () => {
    renderCard({ location: null });

    expect(screen.getByText("75 min · 5 ejercicios")).toBeInTheDocument();
  });

  it("un lugar en blanco cuenta como sin lugar", () => {
    renderCard({ location: "   " });

    expect(screen.getByText("75 min · 5 ejercicios")).toBeInTheDocument();
  });

  it("sin objetivos no pinta etiquetas", () => {
    const { container } = renderCard({ focus: [] });

    expect(container.querySelector("ul")).toBeNull();
  });

  it("las etiquetas son los objetivos de la sesión, una por cada uno", () => {
    renderCard();

    const tags = screen.getByRole("list", { name: "Objetivos" });
    expect(Array.from(tags.querySelectorAll("li")).map((tag) => tag.textContent)).toEqual([
      "Transición",
      "Rebote",
    ]);
  });
});
