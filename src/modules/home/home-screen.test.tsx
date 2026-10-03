import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { heroTitle, HomeScreen } from "./home-screen";
import type { HomeData, HomeGame, HomePractice, WeekItem } from "./types";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const PRACTICE: HomePractice = {
  eventId: "e-1",
  teamName: "Equipo A",
  slotLabel: "Martes 6 oct · 18:00–19:15",
  title: "Salida de presión",
  totalMinutes: 75,
  drillCount: 5,
  focus: ["Transición", "Rebote"],
  location: "Pabellón 2",
};

const GAME: HomeGame = {
  eventId: "e-3",
  teamName: "Equipo A",
  slotLabel: "Sábado 10 oct · 10:30 · Local",
  opponent: "Rival C",
  competition: "Liga",
};

const WEEK: WeekItem[] = [
  { eventId: "e-1", kind: "practice", dow: "Mar", day: "6", title: "Entrenamiento", subtitle: "Salida de presión", time: "18:00" },
  { eventId: "e-2", kind: "practice", dow: "Jue", day: "8", title: "Entrenamiento", subtitle: "Sin plan", time: "18:30" },
  { eventId: "e-3", kind: "game", dow: "Sáb", day: "10", title: "Partido", subtitle: "vs Rival C · Local", time: "10:30" },
];

function home(overrides: Partial<HomeData> = {}): HomeData {
  return {
    greeting: "Buenos días",
    firstName: "Ana",
    kicker: "Equipo A · Temporada 2026/27",
    nextPractice: PRACTICE,
    nextGame: GAME,
    week: WEEK,
    hasTeams: true,
    ...overrides,
  };
}

function renderHome(data: HomeData, club = { clubSlug: "club-a", ownShortName: "CLA" }) {
  return render(<HomeScreen home={data} clubSlug={club.clubSlug} ownShortName={club.ownShortName} />);
}

/** `true` si `first` va antes que `second` en el documento. */
function comesBefore(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function weekSection(): HTMLElement {
  const section = screen.getByRole("heading", { level: 2, name: "Esta semana" }).closest("section");
  if (!section) throw new Error("«Esta semana» no está dentro de un <section>");
  return section;
}

describe("heroTitle", () => {
  it("saluda por el nombre", () => {
    expect(heroTitle("Buenos días", "Ana")).toBe("Buenos días, Ana.");
    expect(heroTitle("Buenas noches", "José Luis")).toBe("Buenas noches, José Luis.");
  });

  it("sin nombre deja solo el saludo", () => {
    // Una cuenta sin persona asociada (por ejemplo, quien solo administra).
    expect(heroTitle("Buenas tardes", "")).toBe("Buenas tardes.");
    expect(heroTitle("Buenas tardes", "   ")).toBe("Buenas tardes.");
  });
});

describe("HomeScreen con equipos", () => {
  it("pinta, por este orden: saludo, próximo entrenamiento, próximo partido y la semana", () => {
    renderHome(home());

    const greeting = screen.getByRole("heading", { level: 1 });
    const practice = screen.getByText("Próximo entrenamiento");
    const game = screen.getByText("Próximo partido");
    const week = screen.getByRole("heading", { level: 2, name: "Esta semana" });

    expect(comesBefore(greeting, practice)).toBe(true);
    expect(comesBefore(practice, game)).toBe(true);
    expect(comesBefore(game, week)).toBe(true);
  });

  it("el único <h1> es el saludo, con el equipo y la temporada encima", () => {
    renderHome(home());

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Buenos días, Ana.");
    expect(screen.getByText("Equipo A · Temporada 2026/27")).toBeInTheDocument();
  });

  it("destaca un solo entrenamiento, con lo que llega de los datos y el enlace a Entrenar", () => {
    renderHome(home());

    const cards = screen.getAllByRole("article").filter((card) => within(card).queryByText("Próximo entrenamiento"));
    expect(cards).toHaveLength(1);
    const card = within(cards[0]);
    expect(card.getByRole("heading", { level: 2, name: "Salida de presión" })).toBeInTheDocument();
    // La hora llega ya formateada en la zona del club: aquí no se calcula nada.
    expect(card.getByText("Martes 6 oct · 18:00–19:15")).toBeInTheDocument();
    expect(card.getByText("75 min · 5 ejercicios · Pabellón 2")).toBeInTheDocument();
    expect(card.getByRole("link", { name: "Abrir entrenamiento" })).toHaveAttribute("href", "/c/club-a/train");
  });

  it("el partido lleva la sigla del club en el lado propio", () => {
    renderHome(home(), { clubSlug: "club-b", ownShortName: "CLB" });

    const card = screen.getByText("Próximo partido").closest("article");
    expect(card).not.toBeNull();
    expect(within(card!).getByRole("img", { name: "Equipo A" })).toHaveTextContent("CLB");
    expect(within(card!).getByText("Rival C")).toBeInTheDocument();
    expect(within(card!).getByText("Sábado 10 oct · 10:30 · Local")).toBeInTheDocument();
  });

  it("la semana es una fila por evento, en su orden, con el día, el título, el detalle y la hora", () => {
    renderHome(home());

    const rows = within(weekSection()).getAllByRole("link");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Mar6EntrenamientoSalida de presión18:00",
      "Jue8EntrenamientoSin plan18:30",
      "Sáb10Partidovs Rival C · Local10:30",
    ]);
  });

  it("los entrenamientos de la semana llevan a Entrenar y los partidos a Partidos", () => {
    renderHome(home(), { clubSlug: "club-b", ownShortName: "CLB" });

    const rows = within(weekSection()).getAllByRole("link");
    expect(rows.map((row) => row.getAttribute("href"))).toEqual([
      "/c/club-b/train",
      "/c/club-b/train",
      "/c/club-b/games",
    ]);
  });

  it("las filas son hijas directas de una misma card, que es lo que pinta sus separadores", () => {
    renderHome(home());

    const rows = within(weekSection()).getAllByRole("link");
    const card = rows[0].parentElement;
    expect(card).toHaveClass("overflow-hidden");
    for (const row of rows) expect(row.parentElement).toBe(card);
  });

  it("sin entrenamiento a la vista lo dice, sin destacar nada y sin ofrecer una acción que aún no existe", () => {
    renderHome(home({ nextPractice: null }));

    const title = screen.getByRole("heading", { level: 2, name: "No hay entrenamientos programados" });
    expect(screen.getByText("Cuando haya una sesión en el calendario, la verás aquí.")).toBeInTheDocument();
    expect(screen.queryByText("Próximo entrenamiento")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir entrenamiento" })).not.toBeInTheDocument();
    // Ocupa el sitio del entrenamiento: antes del partido y de la semana.
    expect(comesBefore(screen.getByRole("heading", { level: 1 }), title)).toBe(true);
    expect(comesBefore(title, screen.getByText("Próximo partido"))).toBe(true);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("sin partido no hay card de partido", () => {
    renderHome(home({ nextGame: null, week: WEEK.slice(0, 2) }));

    expect(screen.queryByText("Próximo partido")).not.toBeInTheDocument();
    expect(screen.getByText("Próximo entrenamiento")).toBeInTheDocument();
    expect(within(weekSection()).getAllByRole("link")).toHaveLength(2);
  });

  it("con la semana vacía lo dice en una frase, bajo el mismo título", () => {
    renderHome(home({ week: [] }));

    const section = within(weekSection());
    expect(section.getByText("No hay nada más esta semana.")).toBeInTheDocument();
    expect(section.queryByRole("link")).not.toBeInTheDocument();
  });

  it("con filas en la semana no dice que esté vacía", () => {
    renderHome(home());

    expect(screen.queryByText("No hay nada más esta semana.")).not.toBeInTheDocument();
  });
});

describe("HomeScreen sin equipos", () => {
  const WITHOUT_TEAMS = home({ kicker: null, nextPractice: null, nextGame: null, week: [], hasTeams: false });

  it("solo pinta el saludo y el aviso de que aún no tiene equipo", () => {
    renderHome(WITHOUT_TEAMS);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Buenos días, Ana.");
    expect(screen.getByRole("heading", { level: 2, name: "Aún no estás en ningún equipo" })).toBeInTheDocument();
    expect(
      screen.getByText("Cuando dirección te asigne un equipo, aquí verás tus entrenamientos y partidos."),
    ).toBeInTheDocument();

    expect(screen.getAllByRole("heading")).toHaveLength(2);
    expect(screen.queryByText("No hay entrenamientos programados")).not.toBeInTheDocument();
    expect(screen.queryByText("Próximo partido")).not.toBeInTheDocument();
    expect(screen.queryByText("Esta semana")).not.toBeInTheDocument();
    expect(screen.queryByText("No hay nada más esta semana.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("aunque llegaran eventos, sin equipos no se pintan", () => {
    renderHome(home({ hasTeams: false }));

    expect(screen.queryByText("Próximo entrenamiento")).not.toBeInTheDocument();
    expect(screen.queryByText("Próximo partido")).not.toBeInTheDocument();
    expect(screen.queryByText("Esta semana")).not.toBeInTheDocument();
  });

  it("una cuenta sin persona asociada recibe el saludo sin nombre", () => {
    renderHome({ ...WITHOUT_TEAMS, firstName: "" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Buenos días\.$/);
  });
});
