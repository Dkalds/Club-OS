import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveItem, LiveSession } from "@/modules/live/types";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));

import { LiveScreen } from "./live-screen";

const EVENT = "9b2f6c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b";
const ITEM_A = "00000000-0000-4000-8000-0000000000a1";
const ITEM_B = "00000000-0000-4000-8000-0000000000a2";
const DETAIL = `/c/club-a/train/${EVENT}`;

function item(id: string, overrides: Partial<LiveItem> = {}): LiveItem {
  return {
    id,
    title: "Ejercicio",
    phase: null,
    minutes: 10,
    diagramUrl: null,
    videoUrl: null,
    keyPoints: [],
    standards: [],
    completed: null,
    actualMinutes: null,
    ...overrides,
  };
}

function session(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    eventId: EVENT,
    clubSlug: "club-a",
    title: "Salida de presión",
    startsAt: "2026-11-17T18:00:00+01:00",
    items: [
      item(ITEM_A, { title: "Rueda de pases", phase: "Activación", minutes: 10, keyPoints: ["Pies activos"] }),
      item(ITEM_B, { title: "Tres contra dos", phase: "Juego", minutes: 5 }),
    ],
    live: { startedAt: null, position: null },
    ...overrides,
  };
}

const STARTED = { startedAt: "2026-11-17T17:02:00.000Z", position: 0 };
const fetchMock = vi.fn();

function show(live: LiveSession = session()) {
  return render(<LiveScreen session={live} clubSlug="club-a" />);
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("sin iniciar", () => {
  it("enseña la sesión, lo que dura y «Iniciar», sin enviar nada", () => {
    show();

    expect(screen.getByRole("heading", { level: 1, name: "Salida de presión" })).toBeInTheDocument();
    expect(screen.getByText("2 ejercicios · 15 min")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a la sesión" })).toHaveAttribute("href", DETAIL);
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("«Iniciar» abre el primer ejercicio con su cronómetro", async () => {
    show();

    fireEvent.click(screen.getByRole("button", { name: "Iniciar" }));

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Rueda de pases" })).toBeInTheDocument();
    expect(screen.getByText("Activación")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/^(10:00|09:59)$/);
    expect(screen.getByText("Pies activos")).toBeInTheDocument();
  });
});

describe("en curso", () => {
  it("retoma el ejercicio que guarda el servidor, sin pasar por «Iniciar»", () => {
    show(session({ live: { startedAt: STARTED.startedAt, position: 1 } }));

    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Tres contra dos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Iniciar" })).not.toBeInTheDocument();
  });

  it("dice cuál viene después, con sus minutos", () => {
    show(session({ live: STARTED }));

    expect(screen.getByText("Tres contra dos")).toBeInTheDocument();
    expect(screen.getByText(/· 5 min/)).toBeInTheDocument();
  });

  it("«Salir» lleva a la ficha de la sesión", () => {
    show(session({ live: STARTED }));

    expect(screen.getByRole("link", { name: "Salir" })).toHaveAttribute("href", DETAIL);
  });

  it("«Siguiente ejercicio» avanza y lo envía con la posición nueva", async () => {
    show(session({ live: STARTED }));

    fireEvent.click(screen.getByRole("button", { name: "Siguiente ejercicio" }));

    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    await waitFor(() => {
      const last = fetchMock.mock.calls.at(-1);
      expect(JSON.parse((last?.[1] as RequestInit).body as string)).toMatchObject({ position: 1 });
    });
  });

  it("un ejercicio con vídeo lo enlaza, rotulado y en otra pestaña", () => {
    const withVideo = session({ live: STARTED });
    withVideo.items[0] = { ...withVideo.items[0]!, videoUrl: "https://youtu.be/abc123" };
    show(withVideo);

    const video = screen.getByRole("link", { name: /^Vídeo/ });
    expect(video).toHaveAttribute("href", "https://youtu.be/abc123");
    expect(video).toHaveAttribute("target", "_blank");
    expect(video).toHaveAttribute("rel", "noopener noreferrer");
    // La pizarra sigue ahí.
    expect(screen.getByRole("img", { name: "Pista sin diagrama" })).toBeInTheDocument();
  });

  it("un vídeo con un protocolo que no es web no se enlaza", () => {
    const unsafe = session({ live: STARTED });
    unsafe.items[0] = { ...unsafe.items[0]!, videoUrl: "javascript:alert(1)" };
    show(unsafe);

    expect(screen.queryByRole("link", { name: /^Vídeo/ })).not.toBeInTheDocument();
  });

  it("sin vídeo no hay enlace", () => {
    show(session({ live: STARTED }));

    expect(screen.queryByRole("link", { name: /^Vídeo/ })).not.toBeInTheDocument();
  });
});

describe("terminar", () => {
  const onLast = () => session({ live: { startedAt: STARTED.startedAt, position: 1 } });

  it("en el último, el control de la derecha pregunta antes de terminar", async () => {
    show(onLast());

    fireEvent.click(screen.getByRole("button", { name: "Terminar entrenamiento" }));

    const dialog = await screen.findByRole("alertdialog", { name: "¿Terminar el entrenamiento?" });
    expect(within(dialog).getByRole("button", { name: "Seguir entrenando" })).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("al confirmar envía el fin y vuelve a la ficha", async () => {
    show(onLast());

    fireEvent.click(screen.getByRole("button", { name: "Terminar entrenamiento" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Terminar" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAIL));
    const last = fetchMock.mock.calls.at(-1);
    expect(JSON.parse((last?.[1] as RequestInit).body as string)).toMatchObject({ finished: true });
  });
});

it("no usa clases que la app no define", async () => {
  const { container } = show();
  fireEvent.click(screen.getByRole("button", { name: "Iniciar" }));

  for (const element of container.querySelectorAll("[class]")) {
    const classes = element.getAttribute("class") ?? "";
    // Ni las del prototipo del diseño (`cos-…`) ni un espaciado escrito sin su variable
    // (`p-space-4` no existe; es `p-(--space-4)`).
    expect(classes).not.toMatch(/(^|\s)cos-/);
    expect(classes).not.toMatch(/(^|\s)[a-z-]+-space-\d/);
  }
});
