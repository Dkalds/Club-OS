import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourtDiagram, CourtThumb } from "./court";

const SIGNED_URL = "https://storage.test/object/sign/diagrams/abc.png?token=t1";

describe("CourtThumb", () => {
  it("es una pista vacía con nombre accesible", () => {
    render(<CourtThumb />);

    const court = screen.getByRole("img", { name: "Pista sin diagrama" });
    expect(court.tagName.toLowerCase()).toBe("svg");
    // Solo líneas de pista: ni jugadores ni movimientos.
    expect(court.querySelectorAll("circle, path, rect").length).toBeGreaterThan(0);
  });

  it("la miniatura mide 80×60, en surface-2 y con radius-sm", () => {
    render(<CourtThumb />);

    expect(screen.getByRole("img", { name: "Pista sin diagrama" })).toHaveClass(
      "w-20",
      "h-15",
      "shrink-0",
      "rounded-sm",
      "bg-surface-2",
    );
  });

  it("a tamaño completo es 4:3, de ancho completo y en surface-1", () => {
    render(<CourtThumb size="full" />);

    const court = screen.getByRole("img", { name: "Pista sin diagrama" });
    expect(court).toHaveClass("aspect-4/3", "w-full", "bg-surface-1");
    expect(court).not.toHaveClass("w-20");
  });

  it("las líneas de pista van en ink-3, sin ningún color escrito a mano", () => {
    const { container } = render(<CourtThumb />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("stroke-ink-3");
    expect(svg?.outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("CourtDiagram", () => {
  it("con src pinta la imagen con su texto alternativo", () => {
    render(<CourtDiagram src={SIGNED_URL} alt="Diagrama de Rebote + outlet" />);

    const image = screen.getByRole("img", { name: "Diagrama de Rebote + outlet" });
    expect(image.tagName.toLowerCase()).toBe("img");
    expect(image).toHaveAttribute("alt", "Diagrama de Rebote + outlet");
    expect(screen.queryByRole("img", { name: "Pista sin diagrama" })).not.toBeInTheDocument();
  });

  it("usa la URL firmada tal cual, sin pasar por el optimizador de imágenes", () => {
    render(<CourtDiagram src={SIGNED_URL} alt="Diagrama" />);

    // `next/image` reescribiría el `src` a `/_next/image?url=…` y cachearía una URL que
    // caduca a los 10 minutos.
    const image = screen.getByRole("img", { name: "Diagrama" });
    expect(image).toHaveAttribute("src", SIGNED_URL);
    expect(image).not.toHaveAttribute("srcset");
  });

  it("la caja es 4:3 con o sin imagen, para que la pantalla no salte", () => {
    const { container, rerender } = render(<CourtDiagram src={SIGNED_URL} alt="Diagrama" />);
    const withImage = container.firstElementChild;
    expect(withImage).toHaveClass("aspect-4/3", "w-full");

    rerender(<CourtDiagram src={null} alt="Diagrama" />);
    expect(container.firstElementChild).toHaveClass("aspect-4/3", "w-full");
  });

  it("la imagen cabe entera en la caja, sin recortar el diagrama", () => {
    render(<CourtDiagram src={SIGNED_URL} alt="Diagrama" />);

    expect(screen.getByRole("img", { name: "Diagrama" })).toHaveClass("size-full", "object-contain");
  });

  it("sin src muestra la pista vacía", () => {
    render(<CourtDiagram src={null} alt="Diagrama de Rebote + outlet" />);

    expect(screen.getByRole("img", { name: "Pista sin diagrama" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Diagrama de Rebote + outlet" })).not.toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("un src vacío cuenta como sin diagrama", () => {
    render(<CourtDiagram src="" alt="Diagrama" />);

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Pista sin diagrama" })).toBeInTheDocument();
  });

  it("si la imagen no carga (URL caducada) cae en la pista vacía, no en el icono roto", () => {
    render(<CourtDiagram src={SIGNED_URL} alt="Diagrama de Rebote + outlet" />);

    fireEvent.error(screen.getByRole("img", { name: "Diagrama de Rebote + outlet" }));

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Pista sin diagrama" })).toHaveClass(
      "aspect-4/3",
      "w-full",
    );
  });

  it("con otra URL vuelve a intentar cargar la imagen", () => {
    const { rerender } = render(<CourtDiagram src={SIGNED_URL} alt="Diagrama" />);
    fireEvent.error(screen.getByRole("img", { name: "Diagrama" }));
    expect(document.querySelector("img")).toBeNull();

    const renewed = `${SIGNED_URL}2`;
    rerender(<CourtDiagram src={renewed} alt="Diagrama" />);

    expect(screen.getByRole("img", { name: "Diagrama" })).toHaveAttribute("src", renewed);
  });
});
