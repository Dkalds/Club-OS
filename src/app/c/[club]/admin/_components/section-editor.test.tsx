import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { WaySection } from "@/modules/methodology/types";

const mocks = vi.hoisted(() => ({ updateWaySection: vi.fn(), reload: vi.fn(), push: vi.fn() }));

vi.mock("@/modules/methodology/actions", () => ({ updateWaySection: mocks.updateWaySection }));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

import { SectionEditor } from "./section-editor";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const ID = "00000000-0000-4000-8000-000000000001";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos. */
const LOADED = "2026-10-03T10:00:00.123456+00:00";
const FIRST_SAVE = "2026-10-03T10:05:00.654321+00:00";
const SECOND_SAVE = "2026-10-03T10:06:00.000001+00:00";

function section(overrides: Partial<WaySection> = {}): WaySection {
  return {
    id: ID,
    number: 3,
    slug: "una-seccion",
    title: "Una sección",
    summary: "Su resumen.",
    bodyMd: "Su texto.",
    contentKind: "text",
    status: "published",
    updatedAt: LOADED,
    ...overrides,
  };
}

function renderEditor(overrides: Partial<WaySection> = {}) {
  return render(<SectionEditor clubSlug="club-a" section={section(overrides)} />);
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
const body = () => screen.getByLabelText("Contenido");

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
 * Pulsa un enlace (por defecto, «Volver») y dice si el clic llegó a navegar. jsdom no
 * implementa la navegación (la registra como error): el clic se corta en `document`, ya
 * después de que React y el componente lo hayan visto, y se mira si el componente lo había
 * cancelado.
 */
function clickLink(name = "Volver"): "navega" | "se queda" {
  let outcome: "navega" | "se queda" = "navega";
  const cut = (event: Event) => {
    outcome = event.defaultPrevented ? "se queda" : "navega";
    event.preventDefault();
  };
  document.addEventListener("click", cut);
  fireEvent.click(screen.getByRole("link", { name }));
  document.removeEventListener("click", cut);
  return outcome;
}

const leaveDialog = () => screen.queryByRole("alertdialog", { name: "¿Salir sin guardar?" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.updateWaySection.mockResolvedValue(ok({ updatedAt: FIRST_SAVE }));
  // `location.reload` no se puede sustituir en jsdom: se cambia todo `location`.
  vi.stubGlobal("location", { reload: mocks.reload });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SectionEditor", () => {
  it("empieza con lo que tiene guardada la sección", () => {
    renderEditor();

    expect(screen.getByLabelText("Título")).toHaveValue("Una sección");
    expect(screen.getByLabelText("Título")).toHaveAttribute("maxlength", "80");
    expect(screen.getByLabelText("Resumen")).toHaveValue("Su resumen.");
    expect(screen.getByLabelText("Resumen")).toHaveAttribute("maxlength", "200");
    expect(screen.getByLabelText("Tipo")).toHaveValue("text");
    expect(body()).toHaveValue("Su texto.");
    expect(screen.getByText("9 / 20.000")).toBeInTheDocument();
  });

  it("una sección sin resumen empieza con el campo vacío", () => {
    renderEditor({ summary: null });

    expect(screen.getByLabelText("Resumen")).toHaveValue("");
  });

  it("ofrece «Guardar cambios» como primary y «Volver» a la lista como secondary", () => {
    renderEditor();

    expect(screen.getByRole("button", { name: "Guardar cambios" })).toHaveClass("bg-brand-accent");
    const back = screen.getByRole("link", { name: "Volver" });
    expect(back).toHaveAttribute("href", "/c/club-a/admin/way");
    expect(back).toHaveClass("border-line-strong");
  });

  it("guarda lo escrito con el updatedAt con que se abrió, tal cual, como expectedUpdatedAt", async () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Nuevo título" } });
    fireEvent.change(screen.getByLabelText("Resumen"), { target: { value: "Nuevo resumen." } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "values" } });
    fireEvent.change(body(), { target: { value: "Nuevo texto." } });
    save();

    await screen.findByText("Cambios guardados.");
    expect(mocks.updateWaySection).toHaveBeenCalledTimes(1);
    expect(mocks.updateWaySection).toHaveBeenCalledWith("club-a", {
      id: ID,
      expectedUpdatedAt: LOADED,
      title: "Nuevo título",
      summary: "Nuevo resumen.",
      contentKind: "values",
      bodyMd: "Nuevo texto.",
    });
  });

  it("dos guardados seguidos funcionan: el segundo manda el updatedAt que devolvió el primero", async () => {
    mocks.updateWaySection
      .mockResolvedValueOnce(ok({ updatedAt: FIRST_SAVE }))
      .mockResolvedValueOnce(ok({ updatedAt: SECOND_SAVE }));
    renderEditor();

    fireEvent.change(body(), { target: { value: "Primer texto." } });
    save();
    await screen.findByText("Cambios guardados.");

    fireEvent.change(body(), { target: { value: "Segundo texto." } });
    // Al tocar el texto, el aviso del guardado anterior ya no es verdad: se quita.
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    save();
    await screen.findByText("Cambios guardados.");

    expect(mocks.updateWaySection).toHaveBeenCalledTimes(2);
    const [first, second] = mocks.updateWaySection.mock.calls.map(([, input]) => input);
    expect(first.expectedUpdatedAt).toBe(LOADED);
    // La cadena exacta, con sus microsegundos: nunca pasa por `Date`.
    expect(second.expectedUpdatedAt).toBe(FIRST_SAVE);
    expect(second.bodyMd).toBe("Segundo texto.");

    // Y un tercero seguiría la cadena.
    fireEvent.change(body(), { target: { value: "Tercer texto." } });
    save();
    await waitFor(() => expect(mocks.updateWaySection).toHaveBeenCalledTimes(3));
    expect(mocks.updateWaySection.mock.calls[2][1].expectedUpdatedAt).toBe(SECOND_SAVE);
  });

  it("guardar sin tocar nada otra vez también avisa", async () => {
    renderEditor();

    save();
    await screen.findByText("Cambios guardados.");
    save();

    // El aviso se quita al empezar y vuelve al terminar.
    await waitFor(() => expect(mocks.updateWaySection).toHaveBeenCalledTimes(2));
    await screen.findByText("Cambios guardados.");
  });

  it("mientras guarda, el botón espera y no se lanza un segundo guardado", async () => {
    let finish: (result: ActionResult<{ updatedAt: string }>) => void = () => {};
    mocks.updateWaySection.mockReturnValue(
      new Promise<ActionResult<{ updatedAt: string }>>((resolve) => {
        finish = resolve;
      }),
    );
    renderEditor();

    save();
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled());
    save();
    expect(mocks.updateWaySection).toHaveBeenCalledTimes(1);

    finish(ok({ updatedAt: FIRST_SAVE }));
    await screen.findByText("Cambios guardados.");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("el aviso de guardado es un estado, con icono, y no hay ninguno antes de guardar", async () => {
    renderEditor();
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();

    save();

    const saved = await screen.findByText("Cambios guardados.");
    expect(saved).toHaveClass("text-success");
    expect(saved.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(saved.closest('[role="status"]')).not.toBeNull();
  });

  // Un lector de pantalla anuncia el texto que CAMBIA dentro de una región `status` que ya
  // estaba en el árbol de accesibilidad; una región que aparece (`display: none` → visible) con su
  // texto en la misma pintura no se anuncia. Así que la región existe antes de guardar, vacía, y es
  // la misma después, y nada la oculta con CSS (jsdom no aplica CSS: se mira la clase `hidden`).
  it("la región de estado ya está ahí antes de guardar, vacía y sin ocultarse, y es la misma después", async () => {
    renderEditor();

    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    expect(region.className).not.toMatch(/hidden|empty:hidden|sr-only/);

    save();
    await screen.findByText("Cambios guardados.");

    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent("Cambios guardados.");

    fireEvent.change(body(), { target: { value: "Otro texto." } });
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toBeEmptyDOMElement();
  });

  it("copia obsoleta: dice el copy del contrato, ofrece «Recargar» y no pisa lo escrito", async () => {
    mocks.updateWaySection.mockResolvedValue(fail("STALE_COPY"));
    renderEditor();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Versión B" } });
    save();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Alguien ha cambiado esto mientras editabas. Recarga para ver la última versión.",
    );
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    // Lo que escribió sigue en el formulario: recargar es decisión suya.
    expect(screen.getByLabelText("Título")).toHaveValue("Versión B");

    const reload = screen.getByRole("button", { name: "Recargar" });
    expect(reload).toHaveClass("border-line-strong");
    expect(mocks.reload).not.toHaveBeenCalled();
    fireEvent.click(reload);
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("tras una copia obsoleta, el mismo updatedAt viejo sigue siendo el que se manda", async () => {
    mocks.updateWaySection.mockResolvedValue(fail("STALE_COPY"));
    renderEditor();

    save();
    await screen.findByRole("alert");
    save();

    await waitFor(() => expect(mocks.updateWaySection).toHaveBeenCalledTimes(2));
    expect(mocks.updateWaySection.mock.calls[1][1].expectedUpdatedAt).toBe(LOADED);
  });

  it("sin copia obsoleta no hay «Recargar»", async () => {
    mocks.updateWaySection.mockResolvedValue(fail("SAVE_FAILED"));
    renderEditor();

    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.queryByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
  });

  it("si la acción lanza, dice que no se pudo guardar y no pierde lo escrito", async () => {
    mocks.updateWaySection.mockRejectedValue(new Error("fetch failed"));
    renderEditor();

    fireEvent.change(body(), { target: { value: "Texto largo que no se puede perder." } });
    save();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(alert).not.toHaveTextContent("fetch failed");
    expect(body()).toHaveValue("Texto largo que no se puede perder.");
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("entrada inválida: el aviso general arriba y cada error bajo su campo", async () => {
    mocks.updateWaySection.mockResolvedValue(
      fail("INVALID", {
        title: "Escribe un título.",
        summary: "Máximo 200 caracteres.",
        bodyMd: "El texto es demasiado largo (máximo 20.000 caracteres).",
      }),
    );
    renderEditor();

    save();

    expect(await screen.findByText(ACTION_ERROR_COPY.INVALID)).toBeInTheDocument();
    for (const [label, message] of [
      ["Título", "Escribe un título."],
      ["Resumen", "Máximo 200 caracteres."],
      ["Contenido", "El texto es demasiado largo (máximo 20.000 caracteres)."],
    ]) {
      const field = screen.getByLabelText(label);
      const text = screen.getByText(message);
      expect(field, label).toHaveAttribute("aria-invalid", "true");
      expect((field.getAttribute("aria-describedby") ?? "").split(" "), label).toContain(text.id);
    }
    expect(screen.getByLabelText("Tipo")).not.toHaveAttribute("aria-invalid");
  });

  it("un error de campo se quita al guardar de nuevo", async () => {
    mocks.updateWaySection.mockResolvedValueOnce(fail("INVALID", { title: "Escribe un título." }));
    renderEditor();

    save();
    await screen.findByText("Escribe un título.");
    save();

    await screen.findByText("Cambios guardados.");
    expect(screen.queryByText("Escribe un título.")).not.toBeInTheDocument();
    expect(screen.queryByText(ACTION_ERROR_COPY.INVALID)).not.toBeInTheDocument();
  });

  it("el aviso de error recibe el foco para que se vea y se lea aunque el botón quede lejos", async () => {
    mocks.updateWaySection.mockResolvedValue(fail("SAVE_FAILED"));
    renderEditor();

    save();

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("una sección de texto no avisa de ninguna lista", () => {
    renderEditor({ contentKind: "text" });

    expect(screen.queryByText(/muestra los/)).not.toBeInTheDocument();
    expect(screen.queryByText("El texto de aquí aparece antes, como introducción.")).not.toBeInTheDocument();
  });

  it.each([
    ["values", "Esta sección muestra los valores publicados.", "Ir a los valores", "values"],
    ["principles", "Esta sección muestra los principios publicados.", "Ir a los principios", "principles"],
    ["standards", "Esta sección muestra los Standards publicados.", "Ir a los Standards", "standards"],
  ] as const)(
    "una sección de %s avisa de lo que muestra, que su texto es la introducción, y enlaza a su página",
    (contentKind, notice, linkName, path) => {
      renderEditor({ contentKind });

      expect(screen.getByText(notice)).toBeInTheDocument();
      expect(screen.getByText("El texto de aquí aparece antes, como introducción.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: linkName })).toHaveAttribute(
        "href",
        `/c/club-a/admin/${path}`,
      );
    },
  );

  it("el aviso sigue al tipo elegido en el formulario, antes de guardar", () => {
    renderEditor({ contentKind: "text" });

    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "standards" } });
    expect(screen.getByText("Esta sección muestra los Standards publicados.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "text" } });
    expect(screen.queryByText(/muestra los/)).not.toBeInTheDocument();
  });

  it("la vista previa del contenido enseña el texto que hay escrito, sin guardar", () => {
    renderEditor({ bodyMd: "Algo **importante**." });

    fireEvent.click(screen.getByRole("tab", { name: "Vista previa" }));

    expect(screen.getByText("importante").tagName).toBe("STRONG");
  });
});

// Quien escribe un texto largo espera un aviso antes de perderlo. «Volver» y el enlace a la lista
// de valores, principios o Standards son enlaces normales, y cerrar o recargar la pestaña
// tampoco guardan nada: mientras algún campo difiera de la última copia guardada, todo eso
// pregunta (los enlaces con el diálogo de la app, la pestaña con el aviso del navegador). La
// navegación interna por las pestañas de Gestión no se intercepta: App Router no tiene gancho
// para bloquearla.
describe("SectionEditor · cambios sin guardar", () => {
  it("sin cambios no hay aviso: ni al cerrar la pestaña ni al volver", () => {
    renderEditor();

    expect(unloadAsks()).toBe(false);
    expect(clickLink()).toBe("navega");
    expect(leaveDialog()).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("con cambios, cerrar o recargar la pestaña pide confirmación", () => {
    renderEditor();

    fireEvent.change(body(), { target: { value: "Texto sin guardar." } });

    expect(unloadAsks()).toBe(true);
  });

  it("con cambios, «Volver» se detiene y abre el diálogo con su pregunta", () => {
    renderEditor();
    fireEvent.change(body(), { target: { value: "Texto sin guardar." } });

    expect(clickLink()).toBe("se queda");

    const dialog = leaveDialog();
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleDescription("Tienes cambios sin guardar. Si sales, se pierden.");
    expect(screen.getByRole("button", { name: "Salir sin guardar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Seguir editando" })).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("«Seguir editando» cierra el diálogo sin navegar y deja lo escrito donde estaba", () => {
    renderEditor();
    fireEvent.change(body(), { target: { value: "Texto sin guardar." } });
    clickLink();

    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));

    expect(leaveDialog()).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(body()).toHaveValue("Texto sin guardar.");
    // Sigue habiendo cambios sin guardar: el aviso de la pestaña sigue puesto.
    expect(unloadAsks()).toBe(true);
  });

  it("«Salir sin guardar» navega a la lista con router.push", () => {
    renderEditor();
    fireEvent.change(body(), { target: { value: "Texto sin guardar." } });
    clickLink();

    fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/c/club-a/admin/way");
    expect(leaveDialog()).not.toBeInTheDocument();
  });

  it("no usa window.confirm: la pregunta es el diálogo de la app", () => {
    const confirm = vi.spyOn(window, "confirm");
    renderEditor();
    fireEvent.change(body(), { target: { value: "Texto sin guardar." } });

    clickLink();

    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    ["values", "Ir a los valores", "/c/club-a/admin/values"],
    ["principles", "Ir a los principios", "/c/club-a/admin/principles"],
    ["standards", "Ir a los Standards", "/c/club-a/admin/standards"],
  ] as const)(
    "con cambios, en una sección de %s el enlace «%s» pregunta igual y confirmar lleva a su lista",
    (contentKind, linkName, path) => {
      renderEditor({ contentKind });
      fireEvent.change(body(), { target: { value: "Texto sin guardar." } });

      expect(clickLink(linkName)).toBe("se queda");
      expect(leaveDialog()).toBeInTheDocument();
      expect(mocks.push).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Salir sin guardar" }));
      expect(mocks.push).toHaveBeenCalledWith(path);
    },
  );

  it("sin cambios, el enlace a la lista de valores navega sin preguntar", () => {
    renderEditor({ contentKind: "values" });

    expect(clickLink("Ir a los valores")).toBe("navega");
    expect(leaveDialog()).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("cuenta cualquier campo: título, resumen, tipo y contenido", () => {
    const fields = [
      ["Título", "Otro título"],
      ["Resumen", "Otro resumen."],
      ["Tipo", "values"],
      ["Contenido", "Otro texto."],
    ] as const;

    for (const [label, value] of fields) {
      const { unmount } = renderEditor();

      expect(unloadAsks(), `${label} sin tocar`).toBe(false);
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      expect(unloadAsks(), label).toBe(true);

      unmount();
    }
  });

  it("volver a dejar un campo como estaba guardado quita el aviso", () => {
    renderEditor();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Otro título" } });
    expect(unloadAsks()).toBe(true);
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Una sección" } });

    expect(unloadAsks()).toBe(false);
  });

  it("tras guardar, vuelve a no haber aviso", async () => {
    renderEditor();
    fireEvent.change(body(), { target: { value: "Texto nuevo." } });
    expect(unloadAsks()).toBe(true);

    save();
    await screen.findByText("Cambios guardados.");

    expect(unloadAsks()).toBe(false);
    expect(clickLink()).toBe("navega");
    expect(leaveDialog()).not.toBeInTheDocument();
  });

  it("lo guardado es la nueva copia: escribir otra vez después de guardar vuelve a avisar", async () => {
    renderEditor();
    fireEvent.change(body(), { target: { value: "Primera versión." } });
    save();
    await screen.findByText("Cambios guardados.");

    fireEvent.change(body(), { target: { value: "Segunda versión." } });

    expect(unloadAsks()).toBe(true);
  });

  it("si el guardado falla, lo escrito sigue sin guardar y el aviso se queda", async () => {
    mocks.updateWaySection.mockResolvedValue(fail("SAVE_FAILED"));
    renderEditor();
    fireEvent.change(body(), { target: { value: "Texto que no se pudo guardar." } });

    save();
    await screen.findByRole("alert");

    expect(unloadAsks()).toBe(true);
  });

  it("al salir de la pantalla ya no avisa", () => {
    const { unmount } = renderEditor();
    fireEvent.change(body(), { target: { value: "Texto sin guardar." } });
    expect(unloadAsks()).toBe(true);

    unmount();

    expect(unloadAsks()).toBe(false);
  });

  it("«Recargar» tras una copia obsoleta se salta el aviso: quien recarga ya ha decidido", async () => {
    mocks.updateWaySection.mockResolvedValue(fail("STALE_COPY"));
    let askedWhileReloading: boolean | null = null;
    mocks.reload.mockImplementation(() => {
      askedWhileReloading = unloadAsks();
    });
    renderEditor();
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Versión B" } });
    save();
    await screen.findByRole("alert");
    // Sigue habiendo cambios sin guardar: el aviso está puesto hasta que se pulsa «Recargar».
    expect(unloadAsks()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Recargar" }));

    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(askedWhileReloading).toBe(false);
    expect(leaveDialog()).not.toBeInTheDocument();
  });
});

