import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `scripts/seed.ts` es el CLI de `pnpm seed`. Un `import "…/scripts/seed"` resuelve a ese
// archivo (no a la carpeta `scripts/seed/`), así que importarlo no puede sembrar nada.
// Aquí la escritura (`runSeed`) y el entorno van simulados: no se toca ninguna base de datos.

const mocks = vi.hoisted(() => ({
  runSeed: vi.fn(() => Promise.resolve()),
  readSupabaseEnv: vi.fn(() => ({ url: "http://127.0.0.1:54321", serviceRoleKey: "clave-de-prueba" })),
}));

vi.mock("./seed/run", () => ({ runSeed: mocks.runSeed }));
vi.mock("./lib/admin-client", () => ({ readSupabaseEnv: mocks.readSupabaseEnv }));

const CLI_PATH = path.resolve(import.meta.dirname, "seed.ts");
const originalArgv = process.argv;

describe("scripts/seed.ts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.runSeed.mockClear();
    mocks.readSupabaseEnv.mockClear();
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
  });

  it("importado, no siembra ni lee el entorno ni escribe nada", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./seed");
    // `main()` es asíncrona: si hubiera arrancado, aquí ya habría terminado.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.runSeed).not.toHaveBeenCalled();
    expect(mocks.readSupabaseEnv).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("ejecutado como CLI, siembra una vez y dice dónde", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    process.argv = [originalArgv[0], CLI_PATH];

    await import("./seed");
    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(3));

    expect(mocks.runSeed).toHaveBeenCalledTimes(1);
    expect(mocks.runSeed).toHaveBeenCalledWith(expect.any(Date));
    expect(log).toHaveBeenNthCalledWith(1, "Seed listo en 127.0.0.1:54321.");
  });
});
