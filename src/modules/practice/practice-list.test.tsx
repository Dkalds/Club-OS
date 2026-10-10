import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PracticeList } from "./practice-list";
import type { PracticeListItem, PracticeTemplate } from "./types";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const FIRST: PracticeListItem = {
  eventId: "e-1",
  teamName: "Equipo A",
  dow: "Mar",
  day: "6",
  month: "oct",
  time: "18:00",
  title: "Salida de presión",
  totalMinutes: 75,
  itemCount: 5,
  status: "scheduled",
  location: "Pabellón 2",
};

const SECOND: PracticeListItem = {
  eventId: "e-2",
  teamName: "Equipo B",
  dow: "Jue",
  day: "8",
  month: "oct",
  time: "18:30",
  title: "Defensa en zona",
  totalMinutes: 60,
  itemCount: 4,
  status: "scheduled",
  location: null,
};

const DONE: PracticeListItem = { ...FIRST, eventId: "e-3", title: "Tiro tras bote", status: "done" };
const CANCELLED: PracticeListItem = { ...SECOND, eventId: "e-4", title: "Pase y corte", status: "cancelled" };

const TEMPLATE: PracticeTemplate = {
  id: "00000000-0000-4000-8000-0000000000c1",
  title: "Salida de presión",
  totalMinutes: 45,
  itemCount: 4,
  primaryFocus: { id: "f-1", name: "Rebote" },
  secondaryFocus: { id: "f-2", name: "Transición" },
};
const BARE_TEMPLATE: PracticeTemplate = {
  id: "00000000-0000-4000-8000-0000000000c2",
  title: "Tiro tras bote",
  totalMinutes: 10,
  itemCount: 1,
  primaryFocus: null,
  secondaryFocus: null,
};

type Props = Parameters<typeof PracticeList>[0];

function renderList(overrides: Partial<Props> = {}) {
  return render(
    <PracticeList
      clubSlug="club-a"
      scope="upcoming"
      practices={[FIRST, SECOND]}
      teamCount={1}
      canCreate
      role="coach"
      {...overrides}
    />,
  );
}

/** `true` si `first` va antes que `second` en el documento. */
function comesBefore(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function sessionTabs(): HTMLElement {
  return screen.getByRole("navigation", { name: "Sesiones" });
}

describe("PracticeList con sesiones", () => {
  it("pinta una fila por sesión, en su orden, cada una con su enlace", () => {
    renderList();

    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", "/c/club-a/train/e-1");
    expect(within(rows[1]).getByRole("link")).toHaveAttribute("href", "/c/club-a/train/e-2");
  });

  it("cada fila lleva el día, el título, los metadatos y, a la derecha, la hora", () => {
    renderList();

    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("Mar6Salida de presión75 min · 5 ejercicios · Pabellón 218:00");
    // Sin lugar, los metadatos no llevan el último campo.
    expect(second).toHaveTextContent("Jue8Defensa en zona60 min · 4 ejercicios18:30");
  });

  it("las filas son hijas directas de una misma lista, la card que pinta sus separadores", () => {
    renderList();

    const list = screen.getByRole("list");
    expect(list).toHaveClass("overflow-hidden", "rounded-lg");
    for (const row of within(list).getAllByRole("listitem")) {
      expect(row.parentElement).toBe(list);
    }
  });

  it("con más de un equipo, el subtítulo empieza por el equipo", () => {
    renderList({ teamCount: 2 });

    const [first, second] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("Equipo A · 75 min · 5 ejercicios · Pabellón 2");
    expect(second).toHaveTextContent("Equipo B · 60 min · 4 ejercicios");
  });

  it("con un solo equipo no repite su nombre en cada fila", () => {
    renderList({ teamCount: 1 });

    expect(screen.queryByText(/Equipo A/)).not.toBeInTheDocument();
  });

  it("sin nombre de equipo no deja un «·» suelto al principio", () => {
    renderList({ teamCount: 2, practices: [{ ...FIRST, teamName: "  " }] });

    expect(screen.getByText("75 min · 5 ejercicios · Pabellón 2")).toBeInTheDocument();
  });
});

describe("PracticeList, histórico", () => {
  function renderHistory() {
    return renderList({ scope: "history", practices: [DONE, CANCELLED, { ...FIRST, eventId: "e-5" }] });
  }

  it("una sesión hecha dice «Hecho», con su icono y en success, y no la hora", () => {
    renderHistory();

    const row = screen.getAllByRole("listitem")[0];
    const label = within(row).getByText("Hecho");
    expect(label).toHaveClass("text-success");
    // El color no es la única señal: lleva icono (decorativo) y la palabra.
    expect(label.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(row).not.toHaveTextContent("18:00");
  });

  it("una cancelada dice «Cancelada», en texto plano (no en success) y sin la hora", () => {
    renderHistory();

    const row = screen.getAllByRole("listitem")[1];
    expect(within(row).getByText("Cancelada")).toBeInTheDocument();
    // Nada de `success` en la fila: ni el color ni el icono de «Hecho».
    expect(row.querySelector(".text-success")).toBeNull();
    expect(row).not.toHaveTextContent("18:30");
  });

  it("una programada que ya terminó sigue enseñando su hora", () => {
    renderHistory();

    const row = screen.getAllByRole("listitem")[2];
    expect(row).toHaveTextContent("18:00");
    expect(row).not.toHaveTextContent("Hecho");
    expect(row).not.toHaveTextContent("Cancelada");
  });

  it("«Hecho» y «Cancelada» no salen en las próximas", () => {
    renderList();

    expect(screen.queryByText("Hecho")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancelada")).not.toBeInTheDocument();
  });
});

describe("PracticeList, pestañas", () => {
  it("«Próximas», «Histórico» y «Plantillas» son enlaces de la navegación «Sesiones»", () => {
    renderList();

    const tabs = within(sessionTabs());
    expect(tabs.getAllByRole("link")).toHaveLength(3);
    expect(tabs.getByRole("link", { name: "Próximas" })).toHaveAttribute("href", "/c/club-a/train");
    expect(tabs.getByRole("link", { name: "Histórico" })).toHaveAttribute(
      "href",
      "/c/club-a/train?scope=history",
    );
    expect(tabs.getByRole("link", { name: "Plantillas" })).toHaveAttribute(
      "href",
      "/c/club-a/train?scope=templates",
    );
  });

  it("quien no gestiona sesiones no tiene «Plantillas»", () => {
    renderList({ canCreate: false });

    const tabs = within(sessionTabs());
    expect(tabs.getAllByRole("link")).toHaveLength(2);
    expect(tabs.queryByRole("link", { name: "Plantillas" })).not.toBeInTheDocument();
  });

  it("en próximas, «Próximas» es la activa", () => {
    renderList({ scope: "upcoming" });

    const tabs = within(sessionTabs());
    expect(tabs.getByRole("link", { name: "Próximas" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "Histórico" })).not.toHaveAttribute("aria-current");
  });

  it("en histórico, «Histórico» lleva aria-current y «Próximas» no", () => {
    renderList({ scope: "history" });

    const tabs = within(sessionTabs());
    expect(tabs.getByRole("link", { name: "Histórico" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "Próximas" })).not.toHaveAttribute("aria-current");
  });

  it("cada pestaña mide al menos target-min de alto", () => {
    renderList();

    for (const tab of within(sessionTabs()).getAllByRole("link")) {
      expect(tab).toHaveClass("min-h-(--target-min)");
    }
  });

  it("también salen cuando la lista está vacía, para poder pasar de una a otra", () => {
    renderList({ practices: [] });

    expect(within(sessionTabs()).getAllByRole("link")).toHaveLength(3);
  });
});

describe("PracticeList, plantillas", () => {
  function renderTemplates(templates: PracticeTemplate[] = [TEMPLATE, BARE_TEMPLATE]) {
    return renderList({ scope: "templates", practices: [], templates });
  }

  it("«Plantillas» es la pestaña activa", () => {
    renderTemplates();

    const tabs = within(sessionTabs());
    expect(tabs.getByRole("link", { name: "Plantillas" })).toHaveAttribute("aria-current", "page");
    expect(tabs.getByRole("link", { name: "Próximas" })).not.toHaveAttribute("aria-current");
  });

  it("cada plantilla abre la sesión nueva con ella puesta, por su id", () => {
    renderTemplates();

    expect(screen.getByRole("link", { name: /Salida de presión/ })).toHaveAttribute(
      "href",
      `/c/club-a/train/new?template=${TEMPLATE.id}`,
    );
    expect(screen.getByRole("link", { name: /Tiro tras bote/ })).toHaveAttribute(
      "href",
      `/c/club-a/train/new?template=${BARE_TEMPLATE.id}`,
    );
  });

  it("dice lo que dura, cuántos ejercicios tiene y sus objetivos", () => {
    renderTemplates();

    expect(screen.getByText("45 min · 4 ejercicios · Rebote, Transición")).toBeInTheDocument();
    expect(screen.getByText("10 min · 1 ejercicio")).toBeInTheDocument();
  });

  it("no pinta las sesiones ni el aviso de las 50 más recientes", () => {
    renderList({ scope: "templates", templates: [TEMPLATE], truncated: true });

    expect(screen.queryByText("Defensa en zona")).not.toBeInTheDocument();
    expect(screen.queryByText("Mostrando las 50 más recientes")).not.toBeInTheDocument();
  });

  it("sin plantillas dice cómo se guarda una, y sigue ofreciendo «Preparar sesión»", () => {
    renderTemplates([]);

    expect(screen.getByRole("heading", { level: 2, name: "Aún no tienes plantillas" })).toBeInTheDocument();
    expect(
      screen.getByText("Abre una sesión que te haya salido bien y guárdala como plantilla."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver histórico" })).toHaveAttribute(
      "href",
      "/c/club-a/train?scope=history",
    );
    expect(screen.getByRole("link", { name: "Preparar sesión" })).toHaveAttribute("href", "/c/club-a/train/new");
  });

  it("sin equipos, solo el aviso de que aún no está en ninguno", () => {
    renderList({ scope: "templates", practices: [], templates: [TEMPLATE], teamCount: 0 });

    expect(screen.queryByRole("navigation", { name: "Sesiones" })).not.toBeInTheDocument();
    expect(screen.queryByText("Salida de presión")).not.toBeInTheDocument();
  });
});

describe("PracticeList, «Preparar sesión»", () => {
  it("quien puede crear y tiene equipos la ve arriba, antes de las pestañas y de la lista", () => {
    renderList({ canCreate: true });

    const create = screen.getByRole("link", { name: "Preparar sesión" });
    expect(create).toHaveAttribute("href", "/c/club-a/train/new");
    expect(comesBefore(create, sessionTabs())).toBe(true);
    expect(comesBefore(create, screen.getByRole("list"))).toBe(true);
  });

  it("sin permiso para crear no hay «Preparar sesión» en ninguna parte", () => {
    renderList({ canCreate: false });
    expect(screen.queryByRole("link", { name: "Preparar sesión" })).not.toBeInTheDocument();
  });

  it("sin permiso para crear no la hay tampoco con la lista vacía", () => {
    renderList({ canCreate: false, practices: [] });
    expect(screen.queryByRole("link", { name: "Preparar sesión" })).not.toBeInTheDocument();
  });

  it("sin equipos no hay donde crear una sesión, aunque haya permiso", () => {
    renderList({ canCreate: true, teamCount: 0, practices: [] });
    expect(screen.queryByRole("link", { name: "Preparar sesión" })).not.toBeInTheDocument();
  });

  it("en el histórico vacío sigue arriba, porque su salida es otra", () => {
    renderList({ scope: "history", practices: [], canCreate: true });

    expect(screen.getByRole("link", { name: "Preparar sesión" })).toHaveAttribute("href", "/c/club-a/train/new");
  });
});

describe("PracticeList vacía", () => {
  it("sin equipos lo dice y vuelve a Inicio, sin pestañas ni lista", () => {
    renderList({ teamCount: 0, practices: [], canCreate: false });

    expect(screen.getByRole("heading", { level: 2, name: "Aún no estás en ningún equipo" })).toBeInTheDocument();
    expect(screen.getByText("Cuando dirección te asigne un equipo, aquí verás sus sesiones.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Inicio" })).toHaveAttribute("href", "/c/club-a");
    expect(screen.queryByRole("navigation", { name: "Sesiones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("sin equipos, a la dirección le dice que faltan por dar de alta y la lleva a Gestión", () => {
    renderList({ teamCount: 0, practices: [], canCreate: true, role: "admin" });

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay equipos esta temporada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Gestión" })).toHaveAttribute("href", "/c/club-a/admin");
    expect(screen.queryByText("Aún no estás en ningún equipo")).not.toBeInTheDocument();
  });

  it("sin próximas, quien puede crear recibe la invitación a crear la siguiente, una sola vez", () => {
    renderList({ practices: [], canCreate: true });

    expect(screen.getByRole("heading", { level: 2, name: "No hay sesiones programadas" })).toBeInTheDocument();
    expect(screen.getByText("Prepara la próxima sesión de tu equipo.")).toBeInTheDocument();
    // La salida del vacío es la misma acción que el botón de arriba: una sola, no dos iguales.
    const create = screen.getAllByRole("link", { name: "Preparar sesión" });
    expect(create).toHaveLength(1);
    expect(create[0]).toHaveAttribute("href", "/c/club-a/train/new");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("sin próximas y sin permiso para crear, lo dice y manda al histórico", () => {
    renderList({ practices: [], canCreate: false });

    expect(screen.getByRole("heading", { level: 2, name: "No hay sesiones programadas" })).toBeInTheDocument();
    expect(screen.getByText("Cuando haya una sesión en el calendario, la verás aquí.")).toBeInTheDocument();
    expect(screen.queryByText("Prepara la próxima sesión de tu equipo.")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver histórico" })).toHaveAttribute(
      "href",
      "/c/club-a/train?scope=history",
    );
  });

  it("sin histórico, lo dice y manda a las próximas", () => {
    renderList({ scope: "history", practices: [], canCreate: false });

    expect(screen.getByRole("heading", { level: 2, name: "Aún no hay sesiones pasadas" })).toBeInTheDocument();
    expect(screen.getByText("Las sesiones que termines aparecerán aquí.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver próximas" })).toHaveAttribute("href", "/c/club-a/train");
  });

  it("no pone su propio <h1>: es el de la pantalla", () => {
    renderList({ practices: [] });

    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("con sesiones no dice que esté vacía", () => {
    renderList();

    expect(screen.queryByText("No hay sesiones programadas")).not.toBeInTheDocument();
    expect(screen.queryByText("Aún no hay sesiones pasadas")).not.toBeInTheDocument();
    expect(screen.queryByText("Aún no estás en ningún equipo")).not.toBeInTheDocument();
  });
});

describe("PracticeList, límite visible", () => {
  it("con 50 filas no dice que se ha cortado", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      ...FIRST,
      eventId: `e-${i}`,
      title: `Sesión ${i}`,
    }));
    renderList({ practices: many });
    expect(screen.queryByText(/Mostrando/)).not.toBeInTheDocument();
  });

  it("con truncated=true muestra «Mostrando las 50 más recientes»", () => {
    renderList({ truncated: true });
    expect(screen.getByText("Mostrando las 50 más recientes")).toBeInTheDocument();
  });

  it("el aviso de truncado no sale sin sesiones", () => {
    renderList({ truncated: true, practices: [] });
    expect(screen.queryByText("Mostrando las 50 más recientes")).not.toBeInTheDocument();
  });
});

describe("PracticeList, chip de fecha", () => {
  it("en próximas, el chip muestra el día de la semana y el número del día", () => {
    renderList({ scope: "upcoming" });
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("Mar")).toBeInTheDocument();
    expect(within(rows[0]).queryByText("oct")).not.toBeInTheDocument();
  });

  it("en histórico, el chip muestra el mes en lugar del día de la semana", () => {
    renderList({
      scope: "history",
      practices: [{ ...FIRST, status: "done" }, { ...SECOND, status: "done" }],
    });
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByText("oct")).toBeInTheDocument();
    expect(within(rows[0]).queryByText("Mar")).not.toBeInTheDocument();
  });
});
