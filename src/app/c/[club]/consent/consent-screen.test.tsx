import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acceptTerms: vi.fn(),
  grantImageConsent: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/modules/consents/actions", () => ({
  acceptTerms: mocks.acceptTerms,
  grantImageConsent: mocks.grantImageConsent,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

import { ConsentScreen } from "./consent-screen";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const WARD = { personId: uuid(1), firstName: "Hijo", lastName: "Ficticio" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConsentScreen", () => {
  it("con los términos pendientes, los enseña y no la lista de tutelas todavía", () => {
    render(
      <ConsentScreen
        clubSlug="club-a"
        needsTerms
        termsText="Condiciones de prueba."
        imageConsentText="Imagen de prueba."
        pendingGuardianships={[WARD]}
      />,
    );

    expect(screen.getByText("Condiciones de prueba.")).toBeInTheDocument();
    expect(screen.queryByText(/Imagen de Hijo/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
  });

  it("al aceptar los términos, pasa a la tutela pendiente", async () => {
    mocks.acceptTerms.mockResolvedValue({ ok: true, data: { consentId: "x" } });

    render(
      <ConsentScreen
        clubSlug="club-a"
        needsTerms
        termsText="Condiciones de prueba."
        imageConsentText="Imagen de prueba."
        pendingGuardianships={[WARD]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    await waitFor(() => expect(screen.getByText("Imagen de Hijo Ficticio")).toBeInTheDocument());
    expect(mocks.acceptTerms).toHaveBeenCalledWith("club-a");
  });

  it("sin tutelas pendientes (o ya decididas todas), «Continuar» lleva al club", () => {
    render(
      <ConsentScreen
        clubSlug="club-a"
        needsTerms={false}
        termsText="Condiciones de prueba."
        imageConsentText="Imagen de prueba."
        pendingGuardianships={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(mocks.push).toHaveBeenCalledWith("/c/club-a");
  });

  it("«Ahora no» quita la tutela de la lista sin llamar a ninguna acción", () => {
    render(
      <ConsentScreen
        clubSlug="club-a"
        needsTerms={false}
        termsText="Condiciones de prueba."
        imageConsentText="Imagen de prueba."
        pendingGuardianships={[WARD]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));

    expect(mocks.grantImageConsent).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
  });

  it("«Dar consentimiento» llama a la acción y, si va bien, quita la tutela de la lista", async () => {
    mocks.grantImageConsent.mockResolvedValue({ ok: true, data: { consentId: "x" } });

    render(
      <ConsentScreen
        clubSlug="club-a"
        needsTerms={false}
        termsText="Condiciones de prueba."
        imageConsentText="Imagen de prueba."
        pendingGuardianships={[WARD]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dar consentimiento" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument());
    expect(mocks.grantImageConsent).toHaveBeenCalledWith("club-a", { personId: WARD.personId });
  });

  it("con dos tutelas pendientes, resolver una deja la otra", async () => {
    const other = { personId: uuid(2), firstName: "Otra", lastName: "Ficticia" };
    mocks.grantImageConsent.mockResolvedValue({ ok: true, data: { consentId: "x" } });

    render(
      <ConsentScreen
        clubSlug="club-a"
        needsTerms={false}
        termsText="Condiciones de prueba."
        imageConsentText="Imagen de prueba."
        pendingGuardianships={[WARD, other]}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Dar consentimiento" })[0]!);

    await waitFor(() => expect(screen.queryByText("Imagen de Hijo Ficticio")).toBeNull());
    expect(screen.getByText("Imagen de Otra Ficticia")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
  });
});
