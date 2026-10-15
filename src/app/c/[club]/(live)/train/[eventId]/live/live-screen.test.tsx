import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "@/modules/board/types";
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
    live: { startedAt: null, position: null, updatedAt: "2026-11-17T17:20:00.250000+00:00" },
    ...overrides,
  };
}

const STARTED = { startedAt: "2026-11-17T17:02:00.000Z", position: 0, updatedAt: "2026-11-17T17:20:00.250000+00:00" };
const fetchMock = vi.fn();
const savedReply = { ok: true, status: 200, json: async () => ({ applied: 1, updated_at: "2026-11-17T17:21:00.500000+00:00" }) };

function show(live: LiveSession = session()) {
  return render(<LiveScreen session={live} clubSlug="club-a" />);
}

/** Una sesión en curso, en su primer ejercicio, con `first` y `second` sobre sus dos ejercicios. */
function started(first: Partial<LiveItem> = {}, second: Partial<LiveItem> = {}): LiveSession {
  const live = session({ live: STARTED });
  return { ...live, items: [{ ...live.items[0]!, ...first }, { ...live.items[1]!, ...second }] };
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockResolvedValue(savedReply);
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
    show(session({ live: { ...STARTED, position: 1 } }));

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
    // Sin pizarra ni imagen no hay pista vacía que enseñar.
    expect(screen.queryByRole("img", { name: "Pista sin diagrama" })).not.toBeInTheDocument();
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

describe("la pizarra del ejercicio en curso", () => {
  /** Una pizarra válida y pequeña, de dos pasos: el 1 pasa al 2 y corta; después el 2 bota hacia el aro. */
  const BOARD: Board = {
    version: 1,
    court: "half",
    tokens: [
      { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
      { id: "a2", kind: "attacker", label: "2", at: { x: 20, y: 60 } },
      { id: "ball", kind: "ball", at: { x: 53, y: 80 } },
    ],
    steps: [
      {
        note: "El 1 pasa al 2 y corta",
        moves: [
          { token: "ball", kind: "pass", to: { x: 23, y: 60 } },
          { token: "a1", kind: "cut", to: { x: 50, y: 30 } },
        ],
      },
      { note: "El 2 bota hacia el aro", moves: [{ token: "a2", kind: "dribble", to: { x: 30, y: 25 } }] },
    ],
  };

  /** Otra, de tres pasos, para el segundo ejercicio. */
  const OTHER_BOARD: Board = {
    ...BOARD,
    steps: [
      { note: "El 2 corta al aro", moves: [{ token: "a2", kind: "cut", to: { x: 40, y: 20 } }] },
      { note: "El 1 bota a la esquina", moves: [{ token: "a1", kind: "dribble", to: { x: 85, y: 70 } }] },
      { note: "El 2 sale a bloquear", moves: [{ token: "a2", kind: "screen", to: { x: 70, y: 60 } }] },
    ],
  };

  const IMAGE = "https://storage.test/diagrama.png?token=firmado";

  it("con pizarra la pinta, con el nombre del ejercicio y el paso en el que está", () => {
    show(started({ board: BOARD }));

    expect(screen.getByRole("img", { name: "Pizarra de Rueda de pases, paso 1 de 2" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText("El 1 pasa al 2 y corta")).toBeInTheDocument();
  });

  it("si el ejercicio tiene pizarra e imagen, manda la pizarra: la imagen no se pinta ni se carga", () => {
    const { container } = show(started({ board: BOARD, diagramUrl: IMAGE }));

    expect(screen.getByRole("img", { name: /^Pizarra de Rueda de pases/ })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^Diagrama/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(container.querySelector("img")).toBeNull();
  });

  it("los pasos de la pizarra no mueven el entrenamiento: sigue en el mismo ejercicio", () => {
    show(started({ board: BOARD }, { board: OTHER_BOARD }));

    fireEvent.click(screen.getByRole("button", { name: "Paso siguiente" }));

    expect(screen.getByRole("img", { name: "Pizarra de Rueda de pases, paso 2 de 2" })).toBeInTheDocument();
    expect(screen.getByText("El 2 bota hacia el aro")).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Rueda de pases" })).toBeInTheDocument();
  });

  it("al pasar al ejercicio siguiente la pizarra es la suya y empieza en su primer paso", () => {
    show(started({ board: BOARD }, { board: OTHER_BOARD }));
    // La primera se deja en su segundo paso: sin su clave, la siguiente heredaría la posición.
    fireEvent.click(screen.getByRole("button", { name: "Paso siguiente" }));
    expect(screen.getByRole("img", { name: "Pizarra de Rueda de pases, paso 2 de 2" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente ejercicio" }));

    expect(screen.getByRole("img", { name: "Pizarra de Tres contra dos, paso 1 de 3" })).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText("El 2 corta al aro")).toBeInTheDocument();
    expect(screen.queryByText("El 2 bota hacia el aro")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Paso anterior" })).toHaveAttribute("aria-disabled", "true");
  });

  it("y al volver al anterior, la suya otra vez desde el principio", () => {
    show(started({ board: BOARD }, { board: OTHER_BOARD }));
    fireEvent.click(screen.getByRole("button", { name: "Paso siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente ejercicio" }));
    fireEvent.click(screen.getByRole("button", { name: "Paso siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Paso siguiente" }));
    expect(screen.getByRole("img", { name: "Pizarra de Tres contra dos, paso 3 de 3" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ejercicio anterior" }));

    expect(screen.getByRole("img", { name: "Pizarra de Rueda de pases, paso 1 de 2" })).toBeInTheDocument();
  });

  it("dos ejercicios seguidos con la misma pizarra: el segundo también empieza de cero", () => {
    show(started({ board: BOARD }, { board: BOARD }));
    fireEvent.click(screen.getByRole("button", { name: "Paso siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Paso siguiente" }));
    expect(screen.getByRole("img", { name: "Pizarra de Rueda de pases, final" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente ejercicio" }));

    expect(screen.getByRole("img", { name: "Pizarra de Tres contra dos, paso 1 de 2" })).toBeInTheDocument();
  });

  it("de un ejercicio con pizarra a uno sin ella, la pizarra desaparece", () => {
    show(started({ board: BOARD }));

    fireEvent.click(screen.getByRole("button", { name: "Siguiente ejercicio" }));

    expect(screen.getByRole("heading", { level: 1, name: "Tres contra dos" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reproducir la pizarra" })).not.toBeInTheDocument();
  });

  it("sin pizarra y con imagen, la imagen", () => {
    show(started({ diagramUrl: IMAGE }));

    const diagram = screen.getByRole("img", { name: "Diagrama: Rueda de pases" });
    expect(diagram).toHaveAttribute("src", IMAGE);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.queryByRole("img", { name: /^Pizarra de/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reproducir la pizarra" })).not.toBeInTheDocument();
  });

  it("sin pizarra ni imagen no hay ningún dibujo", () => {
    show(started());

    expect(screen.getByRole("heading", { level: 1, name: "Rueda de pases" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("la portada, antes de «Iniciar», no enseña la pizarra del primer ejercicio", () => {
    const live = started({ board: BOARD });
    show({ ...live, live: { startedAt: null, position: null, updatedAt: STARTED.updatedAt } });

    expect(screen.getByRole("button", { name: "Iniciar" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("cómo se organiza", () => {
  const SETUP = "Dos filas en la línea de fondo.";

  it("con `setup` hay un desplegable «Cómo se organiza», plegado, con el texto dentro", () => {
    const { container } = show(started({ setup: SETUP }));

    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(details).not.toHaveAttribute("open");
    const summary = details.querySelector("summary") as HTMLElement;
    expect(summary).toHaveTextContent(/^Cómo se organiza$/);
    expect(within(details).getByText(SETUP)).toBeInTheDocument();
    // El texto va dentro del desplegable, fuera del resumen: plegado no se ve.
    expect(summary).not.toHaveTextContent(SETUP);
    expect(container.querySelectorAll("details")).toHaveLength(1);
  });

  it("el texto es Markdown: se pinta con su formato", () => {
    const { container } = show(started({ setup: "Un tirador y **dos** exteriores." }));

    const details = container.querySelector("details") as HTMLElement;
    expect(within(details).getByText("dos").tagName).toBe("STRONG");
  });

  it("el resumen mide 44 px de área táctil", () => {
    show(started({ setup: SETUP }));

    expect(screen.getByText("Cómo se organiza")).toHaveClass("min-h-(--target-min)");
  });

  it("va bajo los puntos clave", () => {
    const { container } = show(started({ setup: SETUP }));

    const details = container.querySelector("details") as HTMLElement;
    expect(screen.getByText("Pies activos").compareDocumentPosition(details)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("sin `setup` no está", () => {
    const { container } = show(started());

    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByText("Cómo se organiza")).not.toBeInTheDocument();
  });

  it("es del ejercicio en curso: al pasar a uno que no lo tiene, desaparece", () => {
    const { container } = show(started({ setup: SETUP }));

    fireEvent.click(screen.getByRole("button", { name: "Siguiente ejercicio" }));

    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByText(SETUP)).not.toBeInTheDocument();
  });

  it("abierto en un ejercicio, en el siguiente vuelve a salir plegado, con su texto", () => {
    const { container } = show(started({ setup: SETUP }, { setup: "Media pista, tres atacantes." }));
    // Quien entrena lo abre (el navegador pone `open`); el componente no lo controla.
    (container.querySelector("details") as HTMLDetailsElement).open = true;

    fireEvent.click(screen.getByRole("button", { name: "Siguiente ejercicio" }));

    const details = container.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText("Media pista, tres atacantes.")).toBeInTheDocument();
    expect(screen.queryByText(SETUP)).not.toBeInTheDocument();
  });
});

describe("terminar", () => {
  const onLast = () => session({ live: { ...STARTED, position: 1 } });

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

describe("cuando el servidor rechaza el fin", () => {
  it("se queda en la pantalla y lo dice, en vez de volver a una ficha que aún ofrecería continuar", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409 });
    show(session({ live: { ...STARTED, position: 1 } }));

    fireEvent.click(screen.getByRole("button", { name: "Terminar entrenamiento" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Terminar" }));

    expect(await screen.findByText(/No se pudo guardar el final/)).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Ver la sesión" })).toHaveAttribute("href", DETAIL);
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
