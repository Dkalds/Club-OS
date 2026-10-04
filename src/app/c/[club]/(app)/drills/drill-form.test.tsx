import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Link from "next/link";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { DrillDetail, FocusArea } from "@/modules/drills/types";
import type { GamePrinciple, Standard } from "@/modules/methodology/types";

const mocks = vi.hoisted(() => ({
  createDrill: vi.fn(),
  updateDrill: vi.fn(),
  uploadDrillDiagram: vi.fn(),
  push: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("@/modules/drills/actions", () => ({
  createDrill: mocks.createDrill,
  updateDrill: mocks.updateDrill,
  uploadDrillDiagram: mocks.uploadDrillDiagram,
}));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

import { DrillForm } from "./drill-form";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const DRILL_ID = "00000000-0000-4000-8000-0000000000d1";
const NEW_ID = "00000000-0000-4000-8000-0000000000d2";
const MEDIA_ID = "00000000-0000-4000-8000-0000000000e1";
const NEW_MEDIA_ID = "00000000-0000-4000-8000-0000000000e2";
const FOCUS_A = "00000000-0000-4000-8000-0000000000f1";
const FOCUS_B = "00000000-0000-4000-8000-0000000000f2";
const PRINCIPLE_A = "00000000-0000-4000-8000-000000000a01";
const PRINCIPLE_B = "00000000-0000-4000-8000-000000000a03";
const PRINCIPLE_HIDDEN = "00000000-0000-4000-8000-000000000a02";
const STANDARD_A = "00000000-0000-4000-8000-000000000b01";
const STANDARD_B = "00000000-0000-4000-8000-000000000b03";
const STANDARD_HIDDEN = "00000000-0000-4000-8000-000000000b02";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos. */
const LOADED = "2026-10-03T10:00:00.123456+00:00";
const PREVIEW = "https://storage.test/nuevo.png?token=firmado";

const DIAGRAM_ERROR = "Sube una imagen PNG, JPEG o WebP de hasta 2 MB.";
const UPLOAD_FAILED = "No se pudo subir el diagrama. Inténtalo de nuevo.";
const PHOTOS_HINT = "Sube solo el dibujo de la pista. No subas fotos en las que salgan jugadores.";

const FOCUS_AREAS: FocusArea[] = [
  { id: FOCUS_A, slug: "uno", name: "Objetivo uno" },
  { id: FOCUS_B, slug: "dos", name: "Objetivo dos" },
];
const PRINCIPLES: GamePrinciple[] = [
  { id: PRINCIPLE_A, slug: "uno", title: "Principio uno", summary: null, status: "published", points: [] },
  { id: PRINCIPLE_B, slug: "tres", title: "Principio tres", summary: null, status: "published", points: [] },
];
const STANDARDS: Standard[] = [
  { id: STANDARD_A, number: 1, title: "UNO", description: "El primero." },
  { id: STANDARD_B, number: 3, title: "TRES", description: "El tercero." },
];
const OPTIONS = { focusAreas: FOCUS_AREAS, principles: PRINCIPLES, standards: STANDARDS };

/** Un ejercicio con todo lo que puede llevar, incluidos un principio y un Standard que no se ven. */
function drill(overrides: Partial<DrillDetail> = {}): DrillDetail {
  return {
    id: DRILL_ID,
    title: "Un ejercicio",
    status: "draft",
    createdBy: null,
    minAge: 10,
    maxAge: 14,
    minPlayers: 4,
    maxPlayers: 8,
    minMinutes: 10,
    maxMinutes: 15,
    focus: [{ slug: "uno", name: "Objetivo uno" }],
    summary: "Su resumen.",
    objective: "Su objetivo.",
    setupMd: "Una **organización**.",
    equipment: ["Balones", "Conos"],
    videoUrl: "https://youtu.be/abc",
    diagramMediaId: MEDIA_ID,
    diagramUrl: "https://storage.test/actual.png?token=firmado",
    coachingPoints: [
      { text: "Primer punto", isKey: true },
      { text: "Segundo punto", isKey: false },
    ],
    variants: [
      { title: "Con defensor", description: "Un defensor presiona." },
      { title: "Sin descripción", description: null },
    ],
    focusAreaIds: [FOCUS_A],
    // Los ids de TODOS los vínculos: también el principio y el Standard que la ficha no enseña.
    principleIds: [PRINCIPLE_A, PRINCIPLE_HIDDEN],
    standardIds: [STANDARD_A, STANDARD_HIDDEN],
    principles: [{ id: PRINCIPLE_A, slug: "uno", title: "Principio uno" }],
    principlesSectionSlug: "como-jugamos",
    standards: [STANDARDS[0]],
    createdByMe: true,
    updatedAt: LOADED,
    ...overrides,
  };
}

type Props = Parameters<typeof DrillForm>[0];

function renderNew(props: Partial<Props> = {}) {
  return render(
    <DrillForm
      clubSlug="club-a"
      mode="new"
      drill={null}
      options={OPTIONS}
      standardsLabel="Standards"
      {...props}
    />,
  );
}

function renderEdit(overrides: Partial<DrillDetail> = {}, props: Partial<Props> = {}) {
  return render(
    <DrillForm
      clubSlug="club-a"
      mode="edit"
      drill={drill(overrides)}
      options={OPTIONS}
      standardsLabel="Standards"
      {...props}
    />,
  );
}

function editForm(overrides: Partial<DrillDetail> = {}) {
  return (
    <DrillForm
      clubSlug="club-a"
      mode="edit"
      drill={drill(overrides)}
      options={OPTIONS}
      standardsLabel="Standards"
    />
  );
}

// ── Ayudas ───────────────────────────────────────────────────────────────────────────

const change = (label: string | RegExp, value: string, root: HTMLElement | Document = document.body) =>
  fireEvent.change(within(root as HTMLElement).getByLabelText(label), { target: { value } });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const group = (name: string) => screen.getByRole("group", { name });
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const chip = (groupName: string, name: string) =>
  within(group(groupName)).getByRole("button", { name });
const saveNew = () => press("Guardar borrador");
const saveEdit = () => press("Guardar cambios");

/** Rellena lo mínimo para que un borrador sea válido. */
function fillMinimum(title = "Un título") {
  change("Título", title);
  change("Mín.", "4", group("Jugadores"));
  change("Máx.", "8", group("Jugadores"));
  change("Mín.", "10", group("Duración (min)"));
  change("Máx.", "15", group("Duración (min)"));
  change("Edad mínima", "10");
  press(/^Objetivo uno$/);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function lastCall(mock: ReturnType<typeof vi.fn>) {
  return mock.mock.calls[mock.mock.calls.length - 1];
}

/** El campo de fichero oculto: el botón «Subir diagrama» lo abre. */
function fileInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("No hay campo de fichero");
  return input;
}

function pick(file: File) {
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

function png(name = "diagrama.png", size = 100) {
  const file = new File([new Uint8Array(size)], name, { type: "image/png" });
  return file;
}

/** Un fichero que declara más de 2 MiB sin tener que reservarlos. */
function bigPng() {
  const file = png("grande.png");
  Object.defineProperty(file, "size", { value: 3 * 1024 * 1024 });
  return file;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createDrill.mockResolvedValue(ok({ id: NEW_ID }));
  mocks.updateDrill.mockResolvedValue(ok({ updatedAt: "2026-10-03T10:05:00.654321+00:00" }));
  mocks.uploadDrillDiagram.mockResolvedValue(ok({ mediaId: NEW_MEDIA_ID, previewUrl: PREVIEW }));
  // `location.reload` no se puede sustituir en jsdom: se cambia todo `location`.
  vi.stubGlobal("location", { reload: mocks.reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Alta ─────────────────────────────────────────────────────────────────────────────

describe("DrillForm · alta", () => {
  it("tiene cada campo con su etiqueta y su límite", () => {
    renderNew();

    expect(field("Título")).toHaveAttribute("maxlength", "80");
    expect(field("Resumen")).toHaveAttribute("maxlength", "200");
    expect(field("Objetivo")).toHaveAttribute("maxlength", "500");
    expect(field("Organización")).toHaveAttribute("maxlength", "5000");
    expect(field("Material")).toBeInTheDocument();
    expect(field("Vídeo (YouTube o Vimeo)")).toBeInTheDocument();
    for (const name of ["Jugadores", "Duración (min)"]) {
      expect(within(group(name)).getByLabelText("Mín.")).toHaveAttribute("type", "number");
      expect(within(group(name)).getByLabelText("Máx.")).toHaveAttribute("type", "number");
    }
  });

  it("explica la organización y el material en el propio campo", () => {
    renderNew();

    expect(field("Organización")).toHaveAccessibleDescription("Admite negritas, cursivas y listas.");
    expect(field("Material")).toHaveAccessibleDescription("Separa con comas.");
  });

  it("la edad mínima es U8–U18 y la máxima añade «Sin máximo», que es la que se elige al empezar", () => {
    renderNew();

    const minimum = screen.getByLabelText("Edad mínima");
    expect(within(minimum).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Elige edad",
      "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18",
    ]);
    // Sin elegir no hay edad: un borrador no nace con una edad que nadie ha dicho.
    expect(minimum).toHaveValue("");

    const maximum = screen.getByLabelText("Edad máxima");
    expect(within(maximum).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Sin máximo",
      "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18",
    ]);
    expect(maximum).toHaveValue("");
  });

  it("los objetivos, los principios y los Standards son grupos de chips; los Standards, con el nombre del club", () => {
    renderNew({ standardsLabel: "Nuestros Standards" });

    expect(within(group("Objetivos")).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Objetivo uno",
      "Objetivo dos",
    ]);
    expect(within(group("Principios")).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Principio uno",
      "Principio tres",
    ]);
    expect(within(group("Nuestros Standards")).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "01 UNO",
      "03 TRES",
    ]);
    expect(screen.queryByRole("group", { name: "Standards" })).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { pressed: false })) {
      expect(button).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("sin principios o sin Standards publicados no pinta esos grupos", () => {
    renderNew({ options: { focusAreas: FOCUS_AREAS, principles: [], standards: [] } });

    expect(screen.queryByRole("group", { name: "Principios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Standards" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Objetivos" })).toBeInTheDocument();
  });

  it("un chip se pulsa y se despulsa, y marca aria-pressed", () => {
    renderNew();

    const target = chip("Objetivos", "Objetivo uno");
    expect(target).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(target);
    expect(target).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(target);
    expect(target).toHaveAttribute("aria-pressed", "false");
  });

  it("no ofrece el diagrama: dice que se añade tras guardar el borrador", () => {
    renderNew();

    expect(screen.getByText("Guarda el borrador para añadir un diagrama.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /diagrama/i })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("«Guardar borrador» es el botón principal y «Cancelar» vuelve a la biblioteca", () => {
    renderNew();

    expect(screen.getByRole("button", { name: "Guardar borrador" })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("button", { name: "Guardar borrador" })).toHaveClass("bg-brand-accent");
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", "/c/club-a/drills");
  });

  it("de un formulario rellenado manda exactamente el DrillInput y lleva a la ficha nueva", async () => {
    renderNew();
    change("Título", "  Un título  ");
    change("Resumen", "Un resumen");
    change("Objetivo", "Un objetivo");
    change("Organización", "Una **organización**");
    change("Mín.", "4", group("Jugadores"));
    change("Máx.", "8", group("Jugadores"));
    change("Mín.", "10", group("Duración (min)"));
    change("Máx.", "15", group("Duración (min)"));
    change("Edad mínima", "10");
    change("Edad máxima", "14");
    press(/^Objetivo uno$/);
    press(/^Objetivo dos$/);
    press(/^Principio tres$/);
    press(/^03 TRES$/);
    change("Material", "Balones, , Conos, Balones");
    change("Vídeo (YouTube o Vimeo)", "https://youtu.be/abc");
    press("Añadir punto");
    change("Punto 1", "Primero");
    press("Añadir punto");
    change("Punto 2", "Segundo");
    press("Clave punto 2");
    press("Añadir variante");
    change("Título de la variante 1", "Con defensor");
    change("Descripción de la variante 1", "Un defensor presiona.");

    saveNew();

    await waitFor(() => expect(mocks.createDrill).toHaveBeenCalledTimes(1));
    expect(mocks.createDrill).toHaveBeenCalledWith("club-a", {
      title: "Un título",
      summary: "Un resumen",
      objective: "Un objetivo",
      setupMd: "Una **organización**",
      minPlayers: 4,
      maxPlayers: 8,
      minMinutes: 10,
      maxMinutes: 15,
      minAge: 10,
      maxAge: 14,
      equipment: ["Balones", "Conos"],
      videoUrl: "https://youtu.be/abc",
      diagramMediaId: null,
      coachingPoints: [
        { text: "Primero", isKey: false },
        { text: "Segundo", isKey: true },
      ],
      variants: [{ title: "Con defensor", description: "Un defensor presiona." }],
      focusAreaIds: [FOCUS_A, FOCUS_B],
      principleIds: [PRINCIPLE_B],
      standardIds: [STANDARD_B],
    });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/drills/${NEW_ID}`));
    expect(mocks.updateDrill).not.toHaveBeenCalled();
  });

  it("«Sin máximo» manda maxAge: null, y lo opcional vacío, null", async () => {
    renderNew();
    fillMinimum();

    saveNew();

    await waitFor(() => expect(mocks.createDrill).toHaveBeenCalledTimes(1));
    expect(lastCall(mocks.createDrill)[1]).toEqual({
      title: "Un título",
      summary: null,
      objective: null,
      setupMd: null,
      minPlayers: 4,
      maxPlayers: 8,
      minMinutes: 10,
      maxMinutes: 15,
      minAge: 10,
      maxAge: null,
      equipment: [],
      videoUrl: null,
      diagramMediaId: null,
      coachingPoints: [],
      variants: [],
      focusAreaIds: [FOCUS_A],
      principleIds: [],
      standardIds: [],
    });
  });

  it("una caja de número vacía llega como NaN, no como 0, para que el servidor la señale", async () => {
    renderNew();
    fillMinimum();
    change("Máx.", "", group("Jugadores"));

    saveNew();

    await waitFor(() => expect(mocks.createDrill).toHaveBeenCalledTimes(1));
    expect(lastCall(mocks.createDrill)[1].maxPlayers).toBeNaN();
    expect(lastCall(mocks.createDrill)[1].minPlayers).toBe(4);
  });

  it("mientras guarda, el botón espera: un segundo toque no crea otro ejercicio", async () => {
    const pending = deferred<ActionResult<{ id: string }>>();
    mocks.createDrill.mockReturnValue(pending.promise);
    renderNew();
    fillMinimum();

    saveNew();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar borrador" })).toBeDisabled());
    saveNew();
    pending.resolve(ok({ id: NEW_ID }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.createDrill).toHaveBeenCalledTimes(1);
  });
});

// ── Edición ──────────────────────────────────────────────────────────────────────────

describe("DrillForm · edición", () => {
  it("empieza con lo guardado en cada campo", () => {
    renderEdit();

    expect(field("Título")).toHaveValue("Un ejercicio");
    expect(field("Resumen")).toHaveValue("Su resumen.");
    expect(field("Objetivo")).toHaveValue("Su objetivo.");
    expect(field("Organización")).toHaveValue("Una **organización**.");
    expect(within(group("Jugadores")).getByLabelText("Mín.")).toHaveValue(4);
    expect(within(group("Jugadores")).getByLabelText("Máx.")).toHaveValue(8);
    expect(within(group("Duración (min)")).getByLabelText("Mín.")).toHaveValue(10);
    expect(within(group("Duración (min)")).getByLabelText("Máx.")).toHaveValue(15);
    expect(screen.getByLabelText("Edad mínima")).toHaveValue("10");
    expect(screen.getByLabelText("Edad máxima")).toHaveValue("14");
    expect(field("Material")).toHaveValue("Balones, Conos");
    expect(field("Vídeo (YouTube o Vimeo)")).toHaveValue("https://youtu.be/abc");
    expect(field("Punto 1")).toHaveValue("Primer punto");
    expect(field("Punto 2")).toHaveValue("Segundo punto");
    expect(screen.getByRole("button", { name: "Clave punto 1" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Clave punto 2" })).toHaveAttribute("aria-pressed", "false");
    expect(field("Título de la variante 1")).toHaveValue("Con defensor");
    expect(field("Descripción de la variante 1")).toHaveValue("Un defensor presiona.");
    expect(field("Descripción de la variante 2")).toHaveValue("");
  });

  it("sin edad máxima empieza en «Sin máximo»", () => {
    renderEdit({ maxAge: null });

    expect(screen.getByLabelText("Edad máxima")).toHaveValue("");
  });

  it("marca los chips de lo que tiene vinculado y de lo que se puede elegir", () => {
    renderEdit();

    expect(chip("Objetivos", "Objetivo uno")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Objetivos", "Objetivo dos")).toHaveAttribute("aria-pressed", "false");
    expect(chip("Principios", "Principio uno")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Principios", "Principio tres")).toHaveAttribute("aria-pressed", "false");
    expect(chip("Standards", "01 UNO")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Standards", "03 TRES")).toHaveAttribute("aria-pressed", "false");
  });

  it("«Guardar cambios» es el botón principal y «Cancelar» vuelve a la ficha", () => {
    renderEdit();

    expect(screen.getByRole("button", { name: "Guardar cambios" })).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("button", { name: "Guardar borrador" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", `/c/club-a/drills/${DRILL_ID}`);
  });

  it("guarda con el id, la copia que cargó (tal cual, sin pasar por Date) y todo el ejercicio", async () => {
    renderEdit();
    change("Título", "Otro título");

    saveEdit();

    await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
    expect(mocks.updateDrill).toHaveBeenCalledWith("club-a", {
      drillId: DRILL_ID,
      expectedUpdatedAt: LOADED,
      drill: {
        title: "Otro título",
        summary: "Su resumen.",
        objective: "Su objetivo.",
        setupMd: "Una **organización**.",
        minPlayers: 4,
        maxPlayers: 8,
        minMinutes: 10,
        maxMinutes: 15,
        minAge: 10,
        maxAge: 14,
        equipment: ["Balones", "Conos"],
        videoUrl: "https://youtu.be/abc",
        diagramMediaId: MEDIA_ID,
        coachingPoints: [
          { text: "Primer punto", isKey: true },
          { text: "Segundo punto", isKey: false },
        ],
        variants: [
          { title: "Con defensor", description: "Un defensor presiona." },
          { title: "Sin descripción", description: null },
        ],
        focusAreaIds: [FOCUS_A],
        principleIds: [PRINCIPLE_A, PRINCIPLE_HIDDEN],
        standardIds: [STANDARD_A, STANDARD_HIDDEN],
      },
    });
    expect(mocks.createDrill).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/drills/${DRILL_ID}`));
  });

  it("no manda el estado: guardar un publicado no lo cambia", async () => {
    renderEdit({ status: "published", createdByMe: false });

    saveEdit();

    await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
    expect(Object.keys(lastCall(mocks.updateDrill)[1].drill)).not.toContain("status");
    expect(Object.keys(lastCall(mocks.updateDrill)[1])).toEqual(["drillId", "expectedUpdatedAt", "drill"]);
  });

  describe("los vínculos que el formulario no enseña", () => {
    it("un Standard vinculado que no está publicado no tiene chip, y sigue ahí al tocar otro", async () => {
      renderEdit();
      expect(within(group("Standards")).getAllByRole("button")).toHaveLength(2);

      fireEvent.click(chip("Standards", "03 TRES"));
      saveEdit();

      await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
      expect(lastCall(mocks.updateDrill)[1].drill.standardIds).toEqual([STANDARD_A, STANDARD_HIDDEN, STANDARD_B]);
    });

    it("quitar el único chip visible no desvincula el oculto", async () => {
      renderEdit();

      fireEvent.click(chip("Standards", "01 UNO"));
      saveEdit();

      await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
      expect(lastCall(mocks.updateDrill)[1].drill.standardIds).toEqual([STANDARD_HIDDEN]);
    });

    it("lo mismo con los principios", async () => {
      renderEdit();

      fireEvent.click(chip("Principios", "Principio tres"));
      fireEvent.click(chip("Principios", "Principio uno"));
      saveEdit();

      await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
      expect(lastCall(mocks.updateDrill)[1].drill.principleIds).toEqual([PRINCIPLE_HIDDEN, PRINCIPLE_B]);
    });

    it("sin tocar ningún chip, guarda todos los vínculos como estaban", async () => {
      renderEdit();

      saveEdit();

      await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
      const { drill: saved } = lastCall(mocks.updateDrill)[1];
      expect(saved.principleIds).toEqual([PRINCIPLE_A, PRINCIPLE_HIDDEN]);
      expect(saved.standardIds).toEqual([STANDARD_A, STANDARD_HIDDEN]);
      expect(saved.focusAreaIds).toEqual([FOCUS_A]);
    });
  });
});

// ── Coaching points y variantes ──────────────────────────────────────────────────────

describe("DrillForm · coaching points", () => {
  const points = () =>
    (screen.queryAllByLabelText(/^Punto \d+$/) as HTMLInputElement[]).map((input) => input.value);

  it("son un grupo con una fila por punto y los controles de cada una, con su número en el nombre", () => {
    renderEdit();

    const list = group("Coaching points");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    for (const n of [1, 2]) {
      expect(screen.getByRole("button", { name: `Subir punto ${n}` })).toHaveTextContent("Subir");
      expect(screen.getByRole("button", { name: `Bajar punto ${n}` })).toHaveTextContent("Bajar");
      expect(screen.getByRole("button", { name: `Quitar punto ${n}` })).toHaveTextContent("Quitar");
      expect(screen.getByRole("button", { name: `Clave punto ${n}` })).toHaveTextContent("Clave");
    }
    expect(screen.getByRole("button", { name: "Subir punto 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar punto 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar punto 1" })).toBeEnabled();
    expect(field("Punto 1")).toHaveAttribute("maxlength", "140");
  });

  it("«Añadir punto» añade una fila al final y lleva el foco a su campo", () => {
    renderNew();

    press("Añadir punto");
    expect(field("Punto 1")).toHaveFocus();
    change("Punto 1", "Primero");
    press("Añadir punto");

    expect(points()).toEqual(["Primero", ""]);
    expect(field("Punto 2")).toHaveFocus();
  });

  it("«Subir» y «Bajar» mueven la fila con su texto y su «Clave», y el foco se queda en el botón", () => {
    renderEdit();

    fireEvent.click(screen.getByRole("button", { name: "Bajar punto 1" }));

    expect(points()).toEqual(["Segundo punto", "Primer punto"]);
    // La «Clave» viajó con el punto que la tenía.
    expect(screen.getByRole("button", { name: "Clave punto 1" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Clave punto 2" })).toHaveAttribute("aria-pressed", "true");
    // La fila llegó al final: «Bajar» ya no se puede usar y el foco pasa a su pareja, «Subir».
    expect(screen.getByRole("button", { name: "Subir punto 2" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Subir punto 2" }));
    expect(points()).toEqual(["Primer punto", "Segundo punto"]);
    expect(screen.getByRole("button", { name: "Bajar punto 1" })).toHaveFocus();
  });

  it("mover una fila no pierde lo que se estaba escribiendo en las demás", () => {
    renderEdit();
    change("Punto 2", "Segundo, reescrito");

    fireEvent.click(screen.getByRole("button", { name: "Subir punto 2" }));

    expect(points()).toEqual(["Segundo, reescrito", "Primer punto"]);
  });

  it("«Quitar» quita la fila y el foco pasa a la vecina; sin vecinas, a «Añadir punto»", () => {
    renderEdit();

    fireEvent.click(screen.getByRole("button", { name: "Quitar punto 1" }));
    expect(points()).toEqual(["Segundo punto"]);
    expect(field("Punto 1")).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Quitar punto 1" }));
    expect(points()).toEqual([]);
    expect(screen.getByRole("button", { name: "Añadir punto" })).toHaveFocus();
  });

  it("«Clave» se conmuta con aria-pressed y viaja en cada punto", async () => {
    renderEdit();
    const toggle = screen.getByRole("button", { name: "Clave punto 2" });

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Clave punto 1" }));
    saveEdit();

    await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
    expect(lastCall(mocks.updateDrill)[1].drill.coachingPoints).toEqual([
      { text: "Primer punto", isKey: false },
      { text: "Segundo punto", isKey: true },
    ]);
  });

  it("el orden de la pantalla es el que se guarda", async () => {
    renderEdit();
    fireEvent.click(screen.getByRole("button", { name: "Subir punto 2" }));

    saveEdit();

    await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
    expect(lastCall(mocks.updateDrill)[1].drill.coachingPoints.map((point: { text: string }) => point.text)).toEqual([
      "Segundo punto",
      "Primer punto",
    ]);
  });

  it("con ocho puntos no deja añadir un noveno y lo dice", () => {
    renderEdit({
      coachingPoints: Array.from({ length: 8 }, (_, index) => ({ text: `Punto ${index + 1}`, isKey: false })),
    });

    expect(screen.queryByRole("button", { name: "Añadir punto" })).not.toBeInTheDocument();
    expect(within(group("Coaching points")).getByText("Un ejercicio admite hasta 8 puntos.")).toBeInTheDocument();
  });
});

describe("DrillForm · variantes", () => {
  const titles = () =>
    (screen.queryAllByLabelText(/^Título de la variante \d+$/) as HTMLInputElement[]).map((input) => input.value);

  it("son un grupo con título y descripción por fila, y los mismos controles", () => {
    renderEdit();

    const list = group("Variantes");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(field("Título de la variante 1")).toHaveAttribute("maxlength", "80");
    expect(field("Descripción de la variante 1")).toHaveAttribute("maxlength", "500");
    for (const n of [1, 2]) {
      for (const verb of ["Subir", "Bajar", "Quitar"]) {
        expect(screen.getByRole("button", { name: `${verb} variante ${n}` })).toHaveTextContent(verb);
      }
    }
    expect(screen.queryByRole("button", { name: /^Clave variante/ })).not.toBeInTheDocument();
  });

  it("«Añadir variante» añade una fila y lleva el foco a su título", () => {
    renderNew();

    press("Añadir variante");

    expect(field("Título de la variante 1")).toHaveFocus();
    expect(field("Descripción de la variante 1")).toHaveValue("");
  });

  it("subir, bajar y quitar mueven la variante entera, con su descripción", () => {
    renderEdit();

    fireEvent.click(screen.getByRole("button", { name: "Subir variante 2" }));

    expect(titles()).toEqual(["Sin descripción", "Con defensor"]);
    expect(field("Descripción de la variante 2")).toHaveValue("Un defensor presiona.");
    expect(screen.getByRole("button", { name: "Bajar variante 1" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Quitar variante 1" }));
    expect(titles()).toEqual(["Con defensor"]);
    expect(field("Título de la variante 1")).toHaveFocus();
  });

  it("con cinco variantes no deja añadir una sexta y lo dice", () => {
    renderEdit({
      variants: Array.from({ length: 5 }, (_, index) => ({ title: `Variante ${index + 1}`, description: null })),
    });

    expect(screen.queryByRole("button", { name: "Añadir variante" })).not.toBeInTheDocument();
    expect(within(group("Variantes")).getByText("Un ejercicio admite hasta 5 variantes.")).toBeInTheDocument();
  });
});

// ── Si guardar falla ─────────────────────────────────────────────────────────────────

describe("DrillForm · cuando guardar falla", () => {
  it("INVALID: dice «Revisa los campos marcados.», señala cada campo y lleva el foco al primero", async () => {
    mocks.createDrill.mockResolvedValue(
      fail("INVALID", {
        title: "Escribe un título de 3 a 80 caracteres.",
        maxPlayers: "El máximo de jugadores no puede ser menor que el mínimo.",
        videoUrl: "Pega un enlace de YouTube o Vimeo que empiece por https://.",
      }),
    );
    renderNew();
    fillMinimum();
    change("Título", "ab");

    saveNew();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message, root] of [
      ["Título", "Escribe un título de 3 a 80 caracteres.", document.body],
      ["Máx.", "El máximo de jugadores no puede ser menor que el mínimo.", group("Jugadores")],
      ["Vídeo (YouTube o Vimeo)", "Pega un enlace de YouTube o Vimeo que empiece por https://.", document.body],
    ] as const) {
      const control = within(root).getByLabelText(label);
      expect(control).toHaveAttribute("aria-invalid", "true");
      expect(control).toHaveAccessibleDescription(message);
    }
    // El primero que falla, en el orden del formulario, recibe el foco; el aviso general no se lo lleva.
    await waitFor(() => expect(field("Título")).toHaveFocus());
    expect(screen.getByText(ACTION_ERROR_COPY.INVALID).closest('[role="alert"]')).not.toHaveFocus();
  });

  it("el foco va al primer campo con error en el orden del formulario, no en el de las claves", async () => {
    mocks.createDrill.mockResolvedValue(
      fail("INVALID", {
        videoUrl: "Pega un enlace de YouTube o Vimeo que empiece por https://.",
        minMinutes: "Elige entre 1 y 120 minutos.",
      }),
    );
    renderNew();
    fillMinimum();

    saveNew();

    await waitFor(() => expect(within(group("Duración (min)")).getByLabelText("Mín.")).toHaveFocus());
  });

  it("los errores de una lista salen en la lista, y el foco va a su primer campo", async () => {
    mocks.updateDrill.mockResolvedValue(fail("INVALID", { coachingPoints: "Escribe el punto o quítalo." }));
    renderEdit();

    saveEdit();

    const list = group("Coaching points");
    expect(await within(list).findByText("Escribe el punto o quítalo.")).toBeInTheDocument();
    expect(list).toHaveAccessibleDescription("Escribe el punto o quítalo.");
    await waitFor(() => expect(field("Punto 1")).toHaveFocus());
  });

  it("el error de los objetivos sale en su grupo, y el foco va al primer chip", async () => {
    mocks.createDrill.mockResolvedValue(fail("INVALID", { focusAreaIds: "Elige al menos un objetivo." }));
    renderNew();
    fillMinimum();
    press(/^Objetivo uno$/);

    saveNew();

    expect(await within(group("Objetivos")).findByText("Elige al menos un objetivo.")).toBeInTheDocument();
    await waitFor(() => expect(chip("Objetivos", "Objetivo uno")).toHaveFocus());
  });

  it("INVALID sin ningún campo que señalar: el aviso se lleva el foco", async () => {
    mocks.createDrill.mockResolvedValue(fail("INVALID", { drillId: "Mal" }));
    renderNew();
    fillMinimum();

    saveNew();

    const alert = await screen.findByText(ACTION_ERROR_COPY.INVALID);
    await waitFor(() => expect(alert.closest('[role="alert"]')).toHaveFocus());
  });

  it("SAVE_FAILED: enseña el texto común, se lleva el foco y no se pierde nada de lo escrito", async () => {
    mocks.updateDrill.mockResolvedValue(fail("SAVE_FAILED"));
    renderEdit();
    change("Título", "Lo que escribí");
    change("Punto 1", "Lo que escribí en el punto");
    press(/^Objetivo dos$/);

    saveEdit();

    const alert = (await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).closest('[role="alert"]');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(field("Título")).toHaveValue("Lo que escribí");
    expect(field("Punto 1")).toHaveValue("Lo que escribí en el punto");
    expect(chip("Objetivos", "Objetivo dos")).toHaveAttribute("aria-pressed", "true");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("STALE_COPY: enseña el texto común, ofrece «Recargar» y conserva lo escrito", async () => {
    mocks.updateDrill.mockResolvedValue(fail("STALE_COPY"));
    renderEdit();
    change("Título", "Versión B");

    saveEdit();

    expect(
      await screen.findByText("Alguien ha cambiado esto mientras editabas. Recarga para ver la última versión."),
    ).toBeInTheDocument();
    expect(field("Título")).toHaveValue("Versión B");
    expect(mocks.push).not.toHaveBeenCalled();

    expect(mocks.reload).not.toHaveBeenCalled();
    press("Recargar");
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("tras una copia obsoleta sigue mandando la copia que cargó, no otra", async () => {
    mocks.updateDrill.mockResolvedValue(fail("STALE_COPY"));
    renderEdit();

    saveEdit();
    await screen.findByText(/Alguien ha cambiado esto/);
    saveEdit();

    await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(2));
    expect(mocks.updateDrill.mock.calls[1][1].expectedUpdatedAt).toBe(LOADED);
  });

  it("si la ficha se repinta bajo el formulario con otra copia más nueva, sigue mandando la que cargó", async () => {
    // Un refresco del servidor (una acción que cambia cookies, por ejemplo) vuelve a pintar la
    // ruta con lo último de la base de datos mientras el formulario sigue montado con lo viejo.
    // Mandar entonces el token nuevo con el contenido viejo pisaría en silencio lo de la otra
    // persona: tiene que llegar `STALE_COPY`, y para eso el token es el de la copia cargada.
    const NEWER = "2026-10-03T10:30:00.999999+00:00";
    const { rerender } = renderEdit();
    change("Título", "Mi versión");

    rerender(editForm({ updatedAt: NEWER, title: "Lo que escribió otra persona" }));
    saveEdit();

    await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
    const [, sent] = lastCall(mocks.updateDrill);
    expect(sent.expectedUpdatedAt).toBe(LOADED);
    expect(sent.drill.title).toBe("Mi versión");
  });

  it("NOT_FOUND: enseña su texto común", async () => {
    mocks.updateDrill.mockResolvedValue(fail("NOT_FOUND"));
    renderEdit();

    saveEdit();

    expect(await screen.findByText(ACTION_ERROR_COPY.NOT_FOUND)).toBeInTheDocument();
  });

  it("si la llamada se cae (la red, el servidor), es un SAVE_FAILED y no se pierde nada", async () => {
    mocks.createDrill.mockRejectedValue(new Error("fetch failed"));
    renderNew();
    fillMinimum("Mi borrador");

    saveNew();

    expect(await screen.findByText(ACTION_ERROR_COPY.SAVE_FAILED)).toBeInTheDocument();
    expect(field("Título")).toHaveValue("Mi borrador");
    expect(screen.queryByText("fetch failed")).not.toBeInTheDocument();
  });

  it("al volver a guardar se quitan los avisos del intento anterior", async () => {
    mocks.createDrill.mockResolvedValueOnce(fail("INVALID", { title: "Escribe un título de 3 a 80 caracteres." }));
    renderNew();
    fillMinimum();

    saveNew();
    expect(await screen.findByText("Escribe un título de 3 a 80 caracteres.")).toBeInTheDocument();
    saveNew();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/drills/${NEW_ID}`));
    expect(screen.queryByText("Escribe un título de 3 a 80 caracteres.")).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_ERROR_COPY.INVALID)).not.toBeInTheDocument();
  });
});

// ── El diagrama ──────────────────────────────────────────────────────────────────────

describe("DrillForm · diagrama", () => {
  it("con diagrama enseña su vista previa y ofrece cambiarlo o quitarlo", () => {
    renderEdit();

    const list = group("Diagrama");
    expect(within(list).getByRole("img", { name: "Vista previa del diagrama" })).toHaveAttribute(
      "src",
      "https://storage.test/actual.png?token=firmado",
    );
    expect(within(list).getByRole("button", { name: "Cambiar diagrama" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Quitar diagrama" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Subir diagrama" })).not.toBeInTheDocument();
  });

  it("sin diagrama enseña la pista vacía y ofrece subirlo, sin «Quitar»", () => {
    renderEdit({ diagramMediaId: null, diagramUrl: null });

    expect(screen.getByRole("img", { name: "Pista sin diagrama" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Subir diagrama" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cambiar diagrama" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar diagrama" })).not.toBeInTheDocument();
  });

  it("un diagrama cuya vista previa no se pudo firmar sale como texto, no como imagen rota", () => {
    renderEdit({ diagramUrl: null });

    expect(screen.getByText("Diagrama subido")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Vista previa del diagrama" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar diagrama" })).toBeInTheDocument();
  });

  it("solo admite PNG, JPEG y WebP, y recuerda que no se suben fotos de jugadores", () => {
    renderEdit();

    expect(fileInput()).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
    expect(screen.getByText(PHOTOS_HINT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar diagrama" })).toHaveAccessibleDescription(PHOTOS_HINT);
  });

  it("«Subir diagrama» abre el selector de ficheros", () => {
    renderEdit({ diagramMediaId: null, diagramUrl: null });
    const open = vi.spyOn(fileInput(), "click");

    press("Subir diagrama");

    expect(open).toHaveBeenCalledTimes(1);
  });

  describe("el fichero se comprueba en el navegador antes de enviarlo", () => {
    it("un tipo que no vale (un SVG) da el error en el campo y no se envía nada", () => {
      renderEdit({ diagramMediaId: null, diagramUrl: null });

      pick(new File(["<svg/>"], "dibujo.svg", { type: "image/svg+xml" }));

      expect(within(group("Diagrama")).getByText(DIAGRAM_ERROR)).toBeInTheDocument();
      expect(mocks.uploadDrillDiagram).not.toHaveBeenCalled();
    });

    it("un fichero de más de 2 MiB da el mismo error y no se envía nada", () => {
      renderEdit({ diagramMediaId: null, diagramUrl: null });

      pick(bigPng());

      expect(within(group("Diagrama")).getByText(DIAGRAM_ERROR)).toBeInTheDocument();
      expect(mocks.uploadDrillDiagram).not.toHaveBeenCalled();
    });

    it("el error está enlazado al botón y se quita al elegir un fichero que vale", async () => {
      renderEdit({ diagramMediaId: null, diagramUrl: null });
      pick(new File(["x"], "dibujo.svg", { type: "image/svg+xml" }));
      expect(screen.getByRole("button", { name: "Subir diagrama" })).toHaveAccessibleDescription(
        `${PHOTOS_HINT} ${DIAGRAM_ERROR}`,
      );

      pick(png());

      await waitFor(() => expect(screen.queryByText(DIAGRAM_ERROR)).not.toBeInTheDocument());
    });

    it("el campo se vacía tras cada elección: se puede elegir el mismo fichero otra vez", () => {
      renderEdit({ diagramMediaId: null, diagramUrl: null });

      pick(new File(["x"], "dibujo.svg", { type: "image/svg+xml" }));

      expect(fileInput().value).toBe("");
    });
  });

  describe("subir", () => {
    it("envía el id del ejercicio y el fichero, y enseña «Subiendo…» mientras tanto", async () => {
      const pending = deferred<ActionResult<{ mediaId: string; previewUrl: string | null }>>();
      mocks.uploadDrillDiagram.mockReturnValue(pending.promise);
      renderEdit({ diagramMediaId: null, diagramUrl: null });
      const file = png("mi-diagrama.png");

      pick(file);

      await waitFor(() => expect(mocks.uploadDrillDiagram).toHaveBeenCalledTimes(1));
      const [club, body] = lastCall(mocks.uploadDrillDiagram);
      expect(club).toBe("club-a");
      expect(body).toBeInstanceOf(FormData);
      expect((body as FormData).get("drillId")).toBe(DRILL_ID);
      expect((body as FormData).get("file")).toBe(file);
      expect(screen.getByRole("status")).toHaveTextContent("Subiendo…");
      expect(screen.getByRole("button", { name: "Subir diagrama" })).toBeDisabled();

      pending.resolve(ok({ mediaId: NEW_MEDIA_ID, previewUrl: PREVIEW }));
      await waitFor(() => expect(screen.getByRole("status")).toBeEmptyDOMElement());
    });

    it("mientras sube no se puede guardar, ni quitar el diagrama", async () => {
      const pending = deferred<ActionResult<{ mediaId: string; previewUrl: string | null }>>();
      mocks.uploadDrillDiagram.mockReturnValue(pending.promise);
      renderEdit();

      pick(png());

      await waitFor(() => expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled());
      expect(screen.getByRole("button", { name: "Cambiar diagrama" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Quitar diagrama" })).toBeDisabled();

      pending.resolve(ok({ mediaId: NEW_MEDIA_ID, previewUrl: PREVIEW }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled());
    });

    it("al terminar enseña la vista previa nueva y devuelve el foco al botón", async () => {
      renderEdit({ diagramMediaId: null, diagramUrl: null });

      pick(png());

      const preview = await screen.findByRole("img", { name: "Vista previa del diagrama" });
      expect(preview).toHaveAttribute("src", PREVIEW);
      expect(screen.getByRole("button", { name: "Cambiar diagrama" })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar diagrama" })).toHaveFocus());
    });

    it("sin URL firmada, la subida cuenta: sale «Diagrama subido» en vez de la imagen", async () => {
      mocks.uploadDrillDiagram.mockResolvedValue(ok({ mediaId: NEW_MEDIA_ID, previewUrl: null }));
      renderEdit({ diagramMediaId: null, diagramUrl: null });

      pick(png());

      expect(await screen.findByText("Diagrama subido")).toBeInTheDocument();
      expect(screen.queryByRole("img", { name: "Vista previa del diagrama" })).not.toBeInTheDocument();
      expect(screen.queryByText(UPLOAD_FAILED)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cambiar diagrama" })).toBeInTheDocument();
    });

    it("lo subido no llega al ejercicio hasta «Guardar cambios», que manda el id nuevo", async () => {
      renderEdit();

      pick(png());
      await waitFor(() =>
        expect(screen.getByRole("img", { name: "Vista previa del diagrama" })).toHaveAttribute("src", PREVIEW),
      );
      expect(mocks.updateDrill).not.toHaveBeenCalled();
      saveEdit();

      await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
      expect(lastCall(mocks.updateDrill)[1].drill.diagramMediaId).toBe(NEW_MEDIA_ID);
    });

    it("subir no pierde nada de lo escrito en el formulario", async () => {
      renderEdit();
      change("Título", "Un título a medias");
      change("Punto 2", "Un punto a medias");
      press(/^Objetivo dos$/);

      pick(png());
      await waitFor(() =>
        expect(screen.getByRole("img", { name: "Vista previa del diagrama" })).toHaveAttribute("src", PREVIEW),
      );

      expect(field("Título")).toHaveValue("Un título a medias");
      expect(field("Punto 2")).toHaveValue("Un punto a medias");
      expect(chip("Objetivos", "Objetivo dos")).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("si subir falla", () => {
    it("INVALID del servidor (unos bytes que no son lo que dice el fichero): enseña su mensaje del campo", async () => {
      mocks.uploadDrillDiagram.mockResolvedValue(fail("INVALID", { diagram: DIAGRAM_ERROR }));
      renderEdit({ diagramMediaId: null, diagramUrl: null });

      pick(png("x.png"));

      expect(await within(group("Diagrama")).findByText(DIAGRAM_ERROR)).toBeInTheDocument();
      expect(screen.queryByText(UPLOAD_FAILED)).not.toBeInTheDocument();
      expect(screen.queryByRole("img", { name: "Vista previa del diagrama" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Subir diagrama" })).toBeEnabled();
    });

    it("cualquier otro fallo: «No se pudo subir el diagrama. Inténtalo de nuevo.»", async () => {
      mocks.uploadDrillDiagram.mockResolvedValue(fail("SAVE_FAILED"));
      renderEdit({ diagramMediaId: null, diagramUrl: null });

      pick(png());

      expect(await within(group("Diagrama")).findByText(UPLOAD_FAILED)).toBeInTheDocument();
    });

    it("un INVALID sin mensaje de campo también es ese fallo general", async () => {
      mocks.uploadDrillDiagram.mockResolvedValue(fail("INVALID"));
      renderEdit({ diagramMediaId: null, diagramUrl: null });

      pick(png());

      expect(await within(group("Diagrama")).findByText(UPLOAD_FAILED)).toBeInTheDocument();
    });

    it("si la llamada misma se cae (Next corta la petición por tamaño), es ese fallo general", async () => {
      mocks.uploadDrillDiagram.mockRejectedValue(new Error("Body exceeded 3mb limit"));
      renderEdit({ diagramMediaId: null, diagramUrl: null });

      pick(png());

      expect(await within(group("Diagrama")).findByText(UPLOAD_FAILED)).toBeInTheDocument();
      expect(screen.queryByText(/3mb/)).not.toBeInTheDocument();
    });

    it("el diagrama que había se queda como estaba y el foco vuelve al botón", async () => {
      mocks.uploadDrillDiagram.mockResolvedValue(fail("SAVE_FAILED"));
      renderEdit();

      pick(png());

      await screen.findByText(UPLOAD_FAILED);
      expect(screen.getByRole("img", { name: "Vista previa del diagrama" })).toHaveAttribute(
        "src",
        "https://storage.test/actual.png?token=firmado",
      );
      await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar diagrama" })).toHaveFocus());
      saveEdit();
      await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
      expect(lastCall(mocks.updateDrill)[1].drill.diagramMediaId).toBe(MEDIA_ID);
    });

    it("el error está enlazado al botón, y un nuevo intento lo quita", async () => {
      mocks.uploadDrillDiagram.mockResolvedValueOnce(fail("SAVE_FAILED"));
      renderEdit({ diagramMediaId: null, diagramUrl: null });
      pick(png());
      await screen.findByText(UPLOAD_FAILED);
      expect(screen.getByRole("button", { name: "Subir diagrama" })).toHaveAccessibleDescription(
        `${PHOTOS_HINT} ${UPLOAD_FAILED}`,
      );

      pick(png());

      await waitFor(() => expect(screen.queryByText(UPLOAD_FAILED)).not.toBeInTheDocument());
      expect(await screen.findByRole("img", { name: "Vista previa del diagrama" })).toBeInTheDocument();
    });
  });

  describe("quitar", () => {
    it("«Quitar diagrama» lo deja sin diagrama, devuelve el foco a «Subir diagrama» y se guarda como null", async () => {
      renderEdit();

      press("Quitar diagrama");

      expect(screen.queryByRole("img", { name: "Vista previa del diagrama" })).not.toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Pista sin diagrama" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Subir diagrama" })).toHaveFocus();
      expect(screen.queryByRole("button", { name: "Quitar diagrama" })).not.toBeInTheDocument();
      saveEdit();

      await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
      const { drill: saved } = lastCall(mocks.updateDrill)[1];
      expect(saved.diagramMediaId).toBeNull();
      expect(Object.keys(saved)).toContain("diagramMediaId");
    });
  });

  describe("la clave del diagrama viaja siempre", () => {
    it("sin tocarlo, el del ejercicio", async () => {
      renderEdit();

      saveEdit();

      await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
      expect(lastCall(mocks.updateDrill)[1].drill.diagramMediaId).toBe(MEDIA_ID);
    });

    it("un ejercicio sin diagrama lo manda a null, no lo omite", async () => {
      renderEdit({ diagramMediaId: null, diagramUrl: null });

      saveEdit();

      await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));
      expect(Object.keys(lastCall(mocks.updateDrill)[1].drill)).toContain("diagramMediaId");
      expect(lastCall(mocks.updateDrill)[1].drill.diagramMediaId).toBeNull();
    });
  });
});

// ── Guardar mientras sube y navegar ──────────────────────────────────────────────────

describe("DrillForm · guardar", () => {
  it("mientras guarda, subir y quitar el diagrama esperan", async () => {
    const pending = deferred<ActionResult<{ updatedAt: string }>>();
    mocks.updateDrill.mockReturnValue(pending.promise);
    renderEdit();

    saveEdit();

    await waitFor(() => expect(screen.getByRole("button", { name: "Cambiar diagrama" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Quitar diagrama" })).toBeDisabled();
    pending.resolve(ok({ updatedAt: "2026-10-03T10:05:00.654321+00:00" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
  });
});

// ── Cambios sin guardar ──────────────────────────────────────────────────────────────

// Quien teclea un ejercicio en el móvil espera un aviso antes de perderlo. «Cancelar» está justo
// debajo del botón de guardar, la navegación inferior queda a un dedo, y cerrar o recargar la
// pestaña tampoco guardan nada: mientras el formulario difiera de la copia que se abrió (o de la
// última que se guardó), todo eso pregunta, igual que el constructor de sesiones y el editor de
// Gestión (`useLeaveGuard`). Los botones «atrás» y «adelante» del navegador no preguntan.
describe("DrillForm · cambios sin guardar", () => {
  /**
   * Lo que haría el navegador al cerrar o recargar la pestaña: lanza `beforeunload` y dice si
   * algo pidió confirmación (cancelando el evento).
   */
  function unloadAsks(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  /**
   * Pulsa un enlace y dice si el clic llegó a navegar. jsdom no implementa la navegación (la
   * registra como error): el clic se corta en `document`, ya después de que React y el
   * componente lo hayan visto, y se mira si el componente lo había cancelado.
   */
  function clickLink(link: HTMLElement): "navega" | "se queda" {
    let outcome: "navega" | "se queda" = "navega";
    const cut = (event: Event) => {
      outcome = event.defaultPrevented ? "se queda" : "navega";
      event.preventDefault();
    };
    document.addEventListener("click", cut);
    fireEvent.click(link);
    document.removeEventListener("click", cut);
    return outcome;
  }

  const clickCancel = () => clickLink(screen.getByRole("link", { name: "Cancelar" }));
  const leaveDialog = () => screen.queryByRole("alertdialog", { name: "¿Salir sin guardar?" });

  /**
   * El formulario de edición junto a un enlace que no es suyo (la navegación de la app, de
   * `next/link`, como la de `BottomNavigation`). Devuelve ese enlace.
   */
  function renderWithNav(): HTMLElement {
    render(
      <>
        <nav aria-label="Principal">
          <Link href="/c/club-a/way" prefetch={false}>
            The Way
          </Link>
        </nav>
        {editForm()}
      </>,
    );
    return screen.getByRole("link", { name: "The Way" });
  }

  describe("«Cancelar»", () => {
    it("sin cambios navega al momento, sin preguntar: en el alta y al editar", () => {
      const { unmount } = renderNew();
      expect(clickCancel()).toBe("navega");
      expect(leaveDialog()).not.toBeInTheDocument();
      unmount();

      renderEdit();
      expect(clickCancel()).toBe("navega");

      expect(leaveDialog()).not.toBeInTheDocument();
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it("con cambios pregunta en el diálogo y no navega; «Salir sin guardar» lleva a la ficha", () => {
      renderEdit();
      change("Título", "Otro título");

      expect(clickCancel()).toBe("se queda");

      expect(leaveDialog()).toHaveAccessibleDescription("Tienes cambios sin guardar. Si sales, se pierden.");
      expect(mocks.push).not.toHaveBeenCalled();

      press("Salir sin guardar");

      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/drills/${DRILL_ID}`);
      expect(leaveDialog()).not.toBeInTheDocument();
    });

    it("con cambios pregunta; «Seguir editando» no navega y lo escrito sigue ahí", () => {
      renderNew();
      change("Título", "Mi borrador");

      expect(clickCancel()).toBe("se queda");
      expect(leaveDialog()).toBeInTheDocument();

      press("Seguir editando");

      expect(leaveDialog()).not.toBeInTheDocument();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(field("Título")).toHaveValue("Mi borrador");
    });

    it("volver a dejar el formulario como estaba quita la pregunta", () => {
      renderEdit();

      change("Título", "Otro título");
      change("Título", "Un ejercicio");

      expect(clickCancel()).toBe("navega");
      expect(leaveDialog()).not.toBeInTheDocument();
    });
  });

  // El «Volver» de la cabecera y la navegación inferior no son del formulario: los pinta la
  // página. Un toque fallido en ellos tampoco puede tirar un formulario largo.
  describe("salir por un enlace que no es el suyo", () => {
    it("sin cambios navega al momento, sin preguntar", () => {
      const outside = renderWithNav();

      expect(clickLink(outside)).toBe("navega");

      expect(leaveDialog()).not.toBeInTheDocument();
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it("con cambios abre el diálogo y no navega; al confirmar, navega a ese enlace", () => {
      const outside = renderWithNav();
      change("Título", "Otro título");

      expect(clickLink(outside)).toBe("se queda");

      expect(leaveDialog()).toBeInTheDocument();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(field("Título")).toHaveValue("Otro título");

      press("Salir sin guardar");

      expect(mocks.push).toHaveBeenCalledTimes(1);
      expect(mocks.push).toHaveBeenCalledWith("/c/club-a/way");
    });

    it("«Seguir editando» deja el formulario como estaba, y otro toque vuelve a preguntar", () => {
      const outside = renderWithNav();
      change("Título", "Otro título");
      clickLink(outside);

      press("Seguir editando");

      expect(leaveDialog()).not.toBeInTheDocument();
      expect(mocks.push).not.toHaveBeenCalled();
      expect(field("Título")).toHaveValue("Otro título");
      expect(clickLink(outside)).toBe("se queda");
      expect(leaveDialog()).toBeInTheDocument();
    });
  });

  describe("cerrar o recargar la pestaña", () => {
    it("sin cambios no pide confirmación, ni en el alta ni al editar", () => {
      const { unmount } = renderNew();
      expect(unloadAsks()).toBe(false);
      unmount();

      renderEdit();
      expect(unloadAsks()).toBe(false);
    });

    it("con cambios, sí; y deja de pedirla al volver a dejarlo como estaba", () => {
      renderEdit();

      change("Resumen", "Otro resumen.");
      expect(unloadAsks()).toBe(true);
      change("Resumen", "Su resumen.");

      expect(unloadAsks()).toBe(false);
    });

    it("registra el aviso al haber cambios y lo quita al salir de la pantalla", () => {
      const add = vi.spyOn(window, "addEventListener");
      const remove = vi.spyOn(window, "removeEventListener");
      const count = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === "beforeunload").length;
      const { unmount } = renderNew();
      expect(count(add)).toBe(0);

      change("Título", "Mi borrador");
      expect(count(add)).toBe(1);
      expect(count(remove)).toBe(0);

      unmount();
      expect(count(remove)).toBe(1);
      expect(unloadAsks()).toBe(false);
      add.mockRestore();
      remove.mockRestore();
    });
  });

  describe("cualquier cosa del formulario cuenta", () => {
    const edits: Array<[string, () => void]> = [
      ["un campo de texto", () => change("Resumen", "Otro resumen.")],
      ["una edad", () => change("Edad mínima", "12")],
      ["un número", () => change("Mín.", "5", group("Jugadores"))],
      ["un chip de objetivo", () => fireEvent.click(chip("Objetivos", "Objetivo dos"))],
      ["un chip de principio", () => fireEvent.click(chip("Principios", "Principio tres"))],
      ["un chip de Standard", () => fireEvent.click(chip("Standards", "03 TRES"))],
      ["un coaching point nuevo", () => press("Añadir punto")],
      ["un coaching point marcado como clave", () => press("Clave punto 2")],
      ["subir de orden un coaching point", () => press("Subir punto 2")],
      ["una variante nueva", () => press("Añadir variante")],
      ["quitar una variante", () => press("Quitar variante 1")],
      ["quitar el diagrama", () => press("Quitar diagrama")],
    ];

    it.each(edits)("%s", (_name, edit) => {
      renderEdit();
      expect(unloadAsks()).toBe(false);

      edit();

      expect(unloadAsks()).toBe(true);
    });

    it("un diagrama recién subido cuenta: hasta «Guardar cambios» no queda en el ejercicio", async () => {
      renderEdit();
      expect(unloadAsks()).toBe(false);

      pick(png());

      // El id nuevo llega al formulario un repintado después que la vista previa.
      await waitFor(() => expect(unloadAsks()).toBe(true));
      expect(screen.getByRole("img", { name: "Vista previa del diagrama" })).toHaveAttribute("src", PREVIEW);
    });

    it("añadir una fila y quitarla otra vez deja el formulario como estaba", () => {
      renderEdit();

      press("Añadir punto");
      press("Quitar punto 3");

      expect(unloadAsks()).toBe(false);
    });
  });

  describe("guardar", () => {
    it("tras guardar bien ya no pregunta: lo guardado es la nueva copia", async () => {
      renderEdit();
      change("Título", "Otro título");
      expect(unloadAsks()).toBe(true);

      saveEdit();
      await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/drills/${DRILL_ID}`));

      await waitFor(() => expect(unloadAsks()).toBe(false));
      expect(clickCancel()).toBe("navega");
      expect(leaveDialog()).not.toBeInTheDocument();
    });

    it("lo mismo al crear un borrador", async () => {
      renderNew();
      fillMinimum("Mi borrador");
      expect(unloadAsks()).toBe(true);

      saveNew();
      await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/drills/${NEW_ID}`));

      await waitFor(() => expect(unloadAsks()).toBe(false));
      expect(clickCancel()).toBe("navega");
      expect(leaveDialog()).not.toBeInTheDocument();
    });

    // En la app real `router.push` dentro de una transición no termina hasta que llega la ficha,
    // y los cambios de estado de esa misma transición (marcar el formulario como limpio) no se
    // pintan hasta entonces. Un `push` de mentira que vuelve al instante lo esconde: aquí la
    // transición se queda pendiente mientras se mira, y el aviso tiene que estar ya quitado.
    describe("mientras la ficha aún no ha llegado", () => {
      let arrives: ReturnType<typeof deferred<void>>;

      beforeEach(() => {
        arrives = deferred<void>();
        mocks.push.mockReturnValue(arrives.promise);
      });

      // Una transición pendiente retiene las de todo el módulo de React, no solo las de este
      // árbol: si se queda colgada, los tests que vengan después no pintan nada. La ficha acaba
      // llegando.
      afterEach(async () => {
        await act(async () => arrives.resolve());
      });

      it("ya no queda ningún aviso de cerrar o recargar la pestaña", async () => {
        const add = vi.spyOn(window, "addEventListener");
        const remove = vi.spyOn(window, "removeEventListener");
        renderEdit();
        change("Título", "Otro título");
        expect(unloadAsks()).toBe(true);

        saveEdit();
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/drills/${DRILL_ID}`));

        // Sin esperar a ningún repintado: el navegador puede pasar a una carga completa ya.
        expect(unloadAsks()).toBe(false);
        const unloadCalls = (spy: typeof add) => spy.mock.calls.filter(([type]) => type === "beforeunload");
        expect(unloadCalls(remove).length).toBeGreaterThan(0);
        expect(unloadCalls(add)).toHaveLength(1);
        add.mockRestore();
        remove.mockRestore();
      });

      it("«Cancelar» no pregunta: lo escrito acaba de guardarse", async () => {
        renderNew();
        fillMinimum("Mi borrador");
        expect(unloadAsks()).toBe(true);

        saveNew();
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/drills/${NEW_ID}`));

        expect(clickCancel()).toBe("navega");
        expect(leaveDialog()).not.toBeInTheDocument();
      });

      it("un enlace de fuera tampoco pregunta: lo escrito acaba de guardarse", async () => {
        const outside = renderWithNav();
        change("Título", "Otro título");
        expect(clickLink(outside)).toBe("se queda");
        press("Seguir editando");

        saveEdit();
        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(`/c/club-a/drills/${DRILL_ID}`));

        expect(clickLink(outside)).toBe("navega");
        expect(leaveDialog()).not.toBeInTheDocument();
      });

      it("lo que se escribe mientras guarda sigue preguntando, también con la ficha por llegar", async () => {
        const pending = deferred<ActionResult<{ updatedAt: string }>>();
        mocks.updateDrill.mockReturnValue(pending.promise);
        renderEdit();
        change("Título", "Primera versión");
        saveEdit();
        await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));

        change("Título", "Escrito mientras guardaba");
        pending.resolve(ok({ updatedAt: "2026-10-03T10:05:00.654321+00:00" }));
        await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));

        expect(unloadAsks()).toBe(true);
        expect(clickCancel()).toBe("se queda");
        expect(leaveDialog()).toBeInTheDocument();
      });
    });

    it("lo que se escribe mientras guarda sigue sin guardar", async () => {
      const pending = deferred<ActionResult<{ updatedAt: string }>>();
      mocks.updateDrill.mockReturnValue(pending.promise);
      renderEdit();
      change("Título", "Primera versión");
      saveEdit();
      await waitFor(() => expect(mocks.updateDrill).toHaveBeenCalledTimes(1));

      change("Título", "Escrito mientras guardaba");
      pending.resolve(ok({ updatedAt: "2026-10-03T10:05:00.654321+00:00" }));
      await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));

      expect(unloadAsks()).toBe(true);
    });

    it("si guardar falla, lo escrito sigue sin guardar y el aviso se queda", async () => {
      mocks.updateDrill.mockResolvedValue(fail("SAVE_FAILED"));
      renderEdit();
      change("Título", "Otro título");

      saveEdit();
      await screen.findByRole("alert");

      expect(unloadAsks()).toBe(true);
      expect(clickCancel()).toBe("se queda");
      expect(leaveDialog()).toBeInTheDocument();
    });
  });

  it("«Recargar» tras una copia obsoleta se salta el aviso: quien recarga ya ha decidido", async () => {
    mocks.updateDrill.mockResolvedValue(fail("STALE_COPY"));
    let askedWhileReloading: boolean | null = null;
    mocks.reload.mockImplementation(() => {
      askedWhileReloading = unloadAsks();
    });
    renderEdit();
    change("Título", "Versión B");
    saveEdit();
    await screen.findByRole("alert");
    // Sigue habiendo cambios sin guardar: el aviso está puesto hasta que se pulsa «Recargar».
    expect(unloadAsks()).toBe(true);

    press("Recargar");

    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(askedWhileReloading).toBe(false);
    expect(leaveDialog()).not.toBeInTheDocument();
  });
});
