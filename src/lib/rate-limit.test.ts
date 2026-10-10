import { beforeEach, describe, expect, it } from "vitest";
import { canAttempt, clearAttempts, recordAttempt } from "./rate-limit";

// Cada test usa su propia clave (un email neutro distinto): el módulo guarda el contador en
// un `Map` compartido entre tests, sin forma de reiniciarlo desde fuera.
let n = 0;
function key(): string {
  n += 1;
  return `cuenta-${n}@club-a.test`;
}

describe("canAttempt / recordAttempt", () => {
  it("una clave nueva puede intentarlo", () => {
    expect(canAttempt(key())).toBe(true);
  });

  it("menos del tope de intentos: sigue pudiendo", () => {
    const k = key();
    for (let i = 0; i < 4; i += 1) recordAttempt(k, 0);

    expect(canAttempt(k, 0)).toBe(true);
  });

  it("al llegar al tope dentro de la ventana, se bloquea", () => {
    const k = key();
    for (let i = 0; i < 5; i += 1) recordAttempt(k, 0);

    expect(canAttempt(k, 0)).toBe(false);
  });

  it("el bloqueo no es para siempre: pasada la espera, puede intentarlo otra vez", () => {
    const k = key();
    for (let i = 0; i < 5; i += 1) recordAttempt(k, 0);

    expect(canAttempt(k, 0)).toBe(false);
    expect(canAttempt(k, 10 * 60_000)).toBe(true);
  });

  it("cada intento de más, ya bloqueada, alarga la espera", () => {
    const k = key();
    for (let i = 0; i < 5; i += 1) recordAttempt(k, 0);
    const blockedAfterFive = !canAttempt(k, 59_000);

    recordAttempt(k, 60_000);
    const blockedAfterSix = !canAttempt(k, 60_000 + 119_000);

    expect(blockedAfterFive).toBe(true);
    expect(blockedAfterSix).toBe(true);
  });

  it("pasada la ventana entera sin ningún intento, el contador se olvida", () => {
    const k = key();
    recordAttempt(k, 0);
    recordAttempt(k, 0);

    // Mucho después de la ventana: cuenta como si empezara de cero.
    for (let i = 0; i < 5; i += 1) recordAttempt(k, 60 * 60_000);

    expect(canAttempt(k, 60 * 60_000)).toBe(false);
  });

  it("clearAttempts quita el bloqueo y el contador", () => {
    const k = key();
    for (let i = 0; i < 5; i += 1) recordAttempt(k, 0);
    expect(canAttempt(k, 0)).toBe(false);

    clearAttempts(k);

    expect(canAttempt(k, 0)).toBe(true);
  });
});
