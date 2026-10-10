import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoverageMatrix } from "@/modules/coverage/types";

const mocks = vi.hoisted(() => ({ fetchCoverageMatrix: vi.fn() }));

vi.mock("@/modules/coverage/actions", () => ({ fetchCoverageMatrix: mocks.fetchCoverageMatrix }));

import { CoverageScreen } from "./coverage-screen";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const TEAM = { id: uuid(1), name: "Alevín A" };
const STANDARD_1 = { id: uuid(2), number: 1, title: "Protejo el balón" };
const STANDARD_2 = { id: uuid(3), number: 2, title: "Leo la defensa" };

const MATRIX: CoverageMatrix = {
  standards: [STANDARD_1, STANDARD_2],
  rows: [{ team: TEAM, covered: [true, false] }],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CoverageScreen", () => {
  it("pinta la tabla con equipos en fila y Standards en columna", () => {
    render(<CoverageScreen clubSlug="club-a" from="2026-09-01" to="2026-10-13" matrix={MATRIX} />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("Alevín A")).toBeInTheDocument();
    expect(within(table).getByText("1. Protejo el balón")).toBeInTheDocument();
    expect(within(table).getByText("2. Leo la defensa")).toBeInTheDocument();
    expect(within(table).getByText("Trabajado")).toBeInTheDocument();
    expect(within(table).getByText("Sin trabajar")).toBeInTheDocument();
  });

  it("sin equipos ni Standards: el aviso de nada que mostrar", () => {
    render(<CoverageScreen clubSlug="club-a" from="2026-09-01" to="2026-10-13" matrix={{ standards: [], rows: [] }} />);

    expect(screen.getByText("Nada que mostrar")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("cambiar el rango y actualizar vuelve a leer, sin recargar la página", async () => {
    const newMatrix: CoverageMatrix = { standards: [STANDARD_1], rows: [{ team: TEAM, covered: [true] }] };
    mocks.fetchCoverageMatrix.mockResolvedValue({ ok: true, data: newMatrix });
    render(<CoverageScreen clubSlug="club-a" from="2026-09-01" to="2026-10-13" matrix={MATRIX} />);

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() =>
      expect(mocks.fetchCoverageMatrix).toHaveBeenCalledWith("club-a", "2026-01-01", "2026-02-01"),
    );
    await waitFor(() => expect(screen.queryByText("2. Leo la defensa")).toBeNull());
  });
});
