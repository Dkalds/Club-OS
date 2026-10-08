import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeListItem } from "@/modules/practice/types";
import { clubContext } from "@/modules/tenancy/test-support";

const mocks = vi.hoisted(() => ({ getClubContext: vi.fn(), listPractices: vi.fn() }));

vi.mock("@/modules/tenancy/queries", () => ({ getClubContext: mocks.getClubContext }));
vi.mock("@/modules/practice/queries", () => ({ listPractices: mocks.listPractices }));
// Como el de verdad: `notFound()` corta el render lanzando.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import TrainPage from "./page";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const PRACTICE: PracticeListItem = {
  eventId: "e-1",
  teamName: "Equipo A",
  dow: "Mar",
  day: "6",
  month: "",
  time: "18:00",
  title: "Salida de presión",
  totalMinutes: 75,
  itemCount: 5,
  status: "scheduled",
  location: "Pabellón 2",
};

function params(search: Record<string, string | string[] | undefined> = {}) {
  return { params: Promise.resolve({ club: "club-a" }), searchParams: Promise.resolve(search) };
}

const ISO_NOW = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getClubContext.mockResolvedValue(clubContext("coach"));
  mocks.listPractices.mockResolvedValue({ practices: [PRACTICE], teamCount: 1 });
});

describe("/train, acceso y lectura", () => {
  it("sin club recibe el 404 y no lee ninguna sesión", async () => {
    mocks.getClubContext.mockResolvedValue(null);

    await expect(TrainPage(params())).rejects.toThrow("NOT_FOUND");

    expect(mocks.getClubContext).toHaveBeenCalledWith("club-a");
    expect(mocks.listPractices).not.toHaveBeenCalled();
  });

  it("pide las próximas con el contexto del club y la hora del servidor", async () => {
    const ctx = clubContext("coach");
    mocks.getClubContext.mockResolvedValue(ctx);

    render(await TrainPage(params()));

    expect(mocks.listPractices).toHaveBeenCalledTimes(1);
    expect(mocks.listPractices).toHaveBeenCalledWith(ctx, "upcoming", expect.stringMatching(ISO_NOW));
  });

  it("con `scope=history` pide el histórico", async () => {
    render(await TrainPage(params({ scope: "history" })));

    expect(mocks.listPractices).toHaveBeenCalledWith(expect.anything(), "history", expect.stringMatching(ISO_NOW));
    expect(screen.getByRole("link", { name: "Histórico" })).toHaveAttribute("aria-current", "page");
  });

  it.each([
    ["otro valor", { scope: "upcoming" }],
    ["otra capitalización", { scope: "HISTORY" }],
    ["con espacios", { scope: " history" }],
    ["vacío", { scope: "" }],
    ["repetido", { scope: ["history", "history"] }],
    ["otro parámetro", { other: "history" }],
  ])("%s es la lista de próximas: solo vale exactamente `history`", async (_name, search) => {
    render(await TrainPage(params(search)));

    expect(mocks.listPractices).toHaveBeenCalledWith(expect.anything(), "upcoming", expect.any(String));
    expect(screen.getByRole("link", { name: "Próximas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Histórico" })).not.toHaveAttribute("aria-current");
  });

  it("si no se pueden leer las sesiones, lanza: lo recoge `error.tsx`", async () => {
    mocks.listPractices.mockRejectedValue(new Error("practice.list: fallo"));

    await expect(TrainPage(params())).rejects.toThrow("practice.list: fallo");
  });
});

describe("/train, pantalla", () => {
  it("el único <h1> es «Entrenar», y va antes que las sesiones y la biblioteca", async () => {
    render(await TrainPage(params()));

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const title = screen.getByRole("heading", { level: 1, name: "Entrenar" });
    expect(title.compareDocumentPosition(screen.getByRole("navigation", { name: "Sesiones" }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(
      title.compareDocumentPosition(screen.getByRole("heading", { level: 2, name: "Biblioteca" })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("pinta las sesiones que lee, con el enlace de cada una a su pantalla", async () => {
    render(await TrainPage(params()));

    const row = screen.getByRole("link", { name: /Salida de presión/ });
    expect(row).toHaveAttribute("href", "/c/club-a/train/e-1");
    expect(row).toHaveTextContent("75 min · 5 ejercicios · Pabellón 2");
  });

  it("quien gestiona sesiones y tiene equipos ve «Nueva sesión»", async () => {
    render(await TrainPage(params()));

    expect(screen.getByRole("link", { name: "Nueva sesión" })).toHaveAttribute("href", "/c/club-a/train/new");
  });

  it.each(["player", "guardian"] as const)("un %s no ve «Nueva sesión»", async (role) => {
    mocks.getClubContext.mockResolvedValue(clubContext(role));

    render(await TrainPage(params()));

    expect(screen.queryByRole("link", { name: "Nueva sesión" })).not.toBeInTheDocument();
  });

  it("la dirección también puede crear", async () => {
    mocks.getClubContext.mockResolvedValue(clubContext("admin"));

    render(await TrainPage(params()));

    expect(screen.getByRole("link", { name: "Nueva sesión" })).toBeInTheDocument();
  });

  it("sin equipos, el aviso de que aún no está en ninguno, sin «Nueva sesión»", async () => {
    mocks.listPractices.mockResolvedValue({ practices: [], teamCount: 0 });

    render(await TrainPage(params()));

    expect(screen.getByRole("heading", { level: 2, name: "Aún no estás en ningún equipo" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Nueva sesión" })).not.toBeInTheDocument();
  });

  it("con varios equipos, cada fila dice el suyo", async () => {
    mocks.listPractices.mockResolvedValue({ practices: [PRACTICE], teamCount: 2 });

    render(await TrainPage(params()));

    expect(screen.getByRole("link", { name: /Salida de presión/ })).toHaveTextContent(
      "Equipo A · 75 min · 5 ejercicios · Pabellón 2",
    );
  });

  it("ya no pinta el estado provisional de la Fase 1", async () => {
    render(await TrainPage(params()));

    expect(screen.queryByText(/llega en una próxima fase/)).not.toBeInTheDocument();
  });
});

describe("/train, biblioteca", () => {
  it("sigue la entrada «Biblioteca de ejercicios» bajo el encabezado «Biblioteca»", async () => {
    render(await TrainPage(params()));

    expect(screen.getByRole("heading", { level: 2, name: "Biblioteca" })).toBeInTheDocument();
    const row = screen.getByRole("link", { name: /Biblioteca de ejercicios/ });
    expect(row).toHaveAttribute("href", "/c/club-a/drills");
    expect(row).toHaveTextContent("Busca por objetivo, edad y duración");
  });

  it("la fila está en una card sin padding, como las demás listas", async () => {
    render(await TrainPage(params()));

    // La fila es un `<li>` y la card, su lista: `ListRow` va como hija directa de `Card as="ul"`.
    const row = screen.getByRole("link", { name: /Biblioteca de ejercicios/ });
    const list = row.closest("ul");
    expect(row.parentElement?.parentElement).toBe(list);
    expect(list).toHaveClass("overflow-hidden", "rounded-lg");
  });

  it("va debajo de las sesiones, también cuando no hay ninguna", async () => {
    for (const result of [
      { practices: [PRACTICE], teamCount: 1 },
      { practices: [], teamCount: 1 },
      { practices: [], teamCount: 0 },
    ]) {
      mocks.listPractices.mockResolvedValue(result);
      const { unmount } = render(await TrainPage(params()));

      const entry = screen.getByRole("link", { name: /Biblioteca de ejercicios/ });
      const sessions =
        screen.queryByRole("navigation", { name: "Sesiones" }) ??
        screen.getByRole("heading", { level: 2, name: "Aún no estás en ningún equipo" });
      expect(sessions.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(within(entry.closest("ul")!).getAllByRole("listitem")).toHaveLength(1);
      unmount();
    }
  });
});
