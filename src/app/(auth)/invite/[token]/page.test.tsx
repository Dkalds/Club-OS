import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import InvitePage from "./page";

describe("InvitePage", () => {
  it("el título es el <h1> y la pizarra es decorativa", () => {
    const { container } = render(<InvitePage />);

    const title = screen.getByRole("heading", { level: 1, name: "Te han invitado a un club" });
    const board = container.querySelector("svg");
    expect(board).toHaveAttribute("aria-hidden", "true");
    expect(board?.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("enlaza a /login, sin ningún email relleno", () => {
    render(<InvitePage />);

    const link = screen.getByRole("link", { name: "Entrar" });
    expect(link).toHaveAttribute("href", "/login");
  });
});
