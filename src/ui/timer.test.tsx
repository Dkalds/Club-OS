import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Timer } from "./timer";

describe("Timer", () => {
  it("muestra mm:ss en tiempo normal", () => {
    render(<Timer remainingMs={8 * 60_000 + 27_000} paused={false} overtime={false} />);
    expect(screen.getByRole("timer")).toHaveTextContent("08:27");
  });

  it("muestra 00:00 cuando es cero", () => {
    render(<Timer remainingMs={0} paused={false} overtime={false} />);
    expect(screen.getByRole("timer")).toHaveTextContent("00:00");
  });

  it("muestra +mm:ss cuando hay tiempo negativo (overtime D6)", () => {
    render(<Timer remainingMs={-2 * 60_000 - 15_000} paused={false} overtime={true} />);
    expect(screen.getByRole("timer")).toHaveTextContent("+02:15");
  });

  it("en pausa tiene clase que indica estado visual", () => {
    render(<Timer remainingMs={5 * 60_000} paused={true} overtime={false} />);
    const timer = screen.getByRole("timer");
    expect(timer.className).toMatch(/paused|ink-3/);
  });
});
