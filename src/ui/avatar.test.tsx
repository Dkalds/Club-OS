import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar, initials } from "./avatar";

describe("initials", () => {
  it("toma la inicial del nombre y la del apellido, con su acento", () => {
    expect(initials("Álex Prieto")).toBe("ÁP");
  });

  it("con una sola palabra devuelve una letra", () => {
    expect(initials("Hugo")).toBe("H");
  });

  it("un texto en blanco devuelve «?»", () => {
    expect(initials("  ")).toBe("?");
    expect(initials("")).toBe("?");
  });

  it("usa la primera y la última palabra aunque haya más", () => {
    expect(initials("María de la Cruz")).toBe("MC");
  });

  it("pasa a mayúsculas y no se deja engañar por espacios de más", () => {
    expect(initials("  ana   ruiz ")).toBe("AR");
  });

  it("mantiene el acento aunque llegue descompuesto (letra + tilde)", () => {
    expect(initials("Álex Prieto")).toBe("ÁP");
  });

  it("un texto sin letras devuelve «?»", () => {
    expect(initials("--- 12")).toBe("?");
  });
});

describe("Avatar", () => {
  it("es una imagen con la etiqueta accesible igual al nombre", () => {
    render(<Avatar name="Ana Ruiz" />);

    const avatar = screen.getByRole("img", { name: "Ana Ruiz" });
    expect(avatar).toHaveAttribute("aria-label", "Ana Ruiz");
    expect(avatar).toHaveTextContent("AR");
  });

  it("con `number` muestra ese texto en lugar de las iniciales", () => {
    render(<Avatar name="Ana Ruiz" number="#4" />);

    const avatar = screen.getByRole("img", { name: "Ana Ruiz" });
    expect(avatar).toHaveTextContent("#4");
    expect(avatar).not.toHaveTextContent("AR");
  });

  it("un `number` vacío vuelve a las iniciales", () => {
    render(<Avatar name="Ana Ruiz" number="  " />);

    expect(screen.getByRole("img", { name: "Ana Ruiz" })).toHaveTextContent("AR");
  });

  it("nunca pinta una fotografía: solo texto", () => {
    const { container } = render(<Avatar name="Ana Ruiz" size="lg" />);

    expect(container.querySelector("img")).toBeNull();
  });
});
