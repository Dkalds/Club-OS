import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageNotFound } from "./page-not-found";

describe("PageNotFound", () => {
  it("dice que la página no existe y ofrece volver a los clubes", () => {
    render(<PageNotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a tus clubes" })).toHaveAttribute(
      "href",
      "/select-club",
    );
  });

  it("no lleva marca de ningún club: ni data-club ni variables de color", () => {
    const { container } = render(<PageNotFound />);

    expect(container.querySelector("[data-club]")).toBeNull();
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("el enlace ocupa al menos el área táctil mínima", () => {
    render(<PageNotFound />);

    expect(screen.getByRole("link", { name: "Volver a tus clubes" })).toHaveClass(
      "min-h-(--target-min)",
    );
  });
});
