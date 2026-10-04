import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
// El estado provisional de la Fase 1 es un componente de servidor asíncrono con su propio test.
vi.mock("../coming-soon", () => ({
  ComingSoon: ({ tab }: { tab: string }) => <h1>Provisional de {tab}</h1>,
}));

import TrainPage from "./page";

const PARAMS = { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve({}) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
});

describe("/train", () => {
  it("sin club recibe el 404", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(TrainPage(PARAMS)).rejects.toThrow("NOT_FOUND");
    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
  });

  it("entra en la biblioteca con una fila «Biblioteca de ejercicios» bajo el encabezado «Biblioteca»", async () => {
    render(await TrainPage(PARAMS));

    expect(screen.getByRole("heading", { level: 2, name: "Biblioteca" })).toBeInTheDocument();
    const row = screen.getByRole("link", { name: /Biblioteca de ejercicios/ });
    expect(row).toHaveAttribute("href", "/c/club-a/drills");
    expect(row).toHaveTextContent("Busca por objetivo, edad y duración");
  });

  it("la fila está en una card sin padding, como las demás listas", async () => {
    render(await TrainPage(PARAMS));

    // La fila es un `<li>` y la card, su lista: `ListRow` va como hija directa de `Card as="ul"`.
    const row = screen.getByRole("link", { name: /Biblioteca de ejercicios/ });
    const list = screen.getByRole("list");
    expect(row.parentElement?.parentElement).toBe(list);
    expect(list).toHaveClass("overflow-hidden", "rounded-lg");
  });

  it("deja debajo el estado provisional de la Fase 1", async () => {
    render(await TrainPage(PARAMS));

    const placeholder = screen.getByRole("heading", { level: 1, name: "Provisional de train" });
    const entry = screen.getByRole("link", { name: /Biblioteca de ejercicios/ });
    expect(entry.compareDocumentPosition(placeholder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
