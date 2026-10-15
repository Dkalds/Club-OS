import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLATFORM_BRAND_COLORS } from "@/modules/tenancy/branding";
import type { ClubContext } from "@/modules/tenancy/queries";

const mocks = vi.hoisted(() => ({ updateClub: vi.fn() }));

vi.mock("@/modules/tenancy/actions", () => ({ updateClub: mocks.updateClub }));

import { ClubScreen } from "./club-screen";

const ORG: ClubContext["org"] = { id: "org-a", slug: "club-a", name: "Club A", timezone: "Europe/Madrid" };
const BRANDING = {
  displayName: "Club A",
  wordmarkSub: "Baloncesto",
  shortName: "CLA",
  wayName: "El camino",
  tagline: null,
  colors: { ...PLATFORM_BRAND_COLORS, accent: "#5aa9e6" },
  terminology: {},
};

function renderScreen() {
  return render(
    <ClubScreen clubSlug="club-a" org={ORG} branding={BRANDING} termsText="Condiciones." imageConsentText="Imagen." />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ClubScreen", () => {
  it("parte de los valores actuales del club", () => {
    renderScreen();

    expect(screen.getByLabelText("Nombre")).toHaveValue("Club A");
    expect(screen.getByLabelText("Siglas (2 a 4 letras)")).toHaveValue("CLA");
    expect(screen.getByLabelText("Acento")).toHaveValue("#5aa9e6");
    expect(screen.getByLabelText("Condiciones de uso")).toHaveValue("Condiciones.");
  });

  it("guarda los cambios y lo dice en el botón", async () => {
    mocks.updateClub.mockResolvedValue({ ok: true, data: null });
    renderScreen();

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Club A Editado" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Guardado" })).toBeInTheDocument());
    expect(mocks.updateClub).toHaveBeenCalledWith("club-a", expect.objectContaining({ name: "Club A Editado" }));
  });

  it("un acento que no contrasta avisa, sin bloquear el envío", () => {
    renderScreen();

    fireEvent.change(screen.getByLabelText("Acento"), { target: { value: "#1a3550" } });

    expect(screen.getByText(/No se lee bien sobre el fondo de la app/)).toBeInTheDocument();
  });

  it("un fallo de la acción enseña el mensaje y los campos marcados", async () => {
    mocks.updateClub.mockResolvedValue({
      ok: false,
      error: "INVALID",
      fieldErrors: { shortName: "Entre 2 y 4 letras." },
    });
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(screen.getByText("Entre 2 y 4 letras.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });

  it("cambiar un campo después de guardar vuelve a enseñar «Guardar»", async () => {
    mocks.updateClub.mockResolvedValue({ ok: true, data: null });
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Guardado" })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Otro nombre" } });

    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });
});
