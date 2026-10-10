import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USAGE } from "./content/cli";
import type { ImportReport } from "./content/import";
import { PackError } from "./content/pack";

// `scripts/content-import.ts` es el CLI de `pnpm content:import`. Aquí la escritura
// (`importPack`) y el entorno van simulados: no se toca ninguna base de datos. Lo que hace de
// verdad `importPack` lo prueba `content/import.int.test.ts`.

const REPORT: ImportReport = {
  club: "club-demo",
  pack: { id: "pack-ejemplo", title: "Paquete de ejemplo" },
  created: ["a", "b"],
  skipped: [],
  updated: [],
};

const mocks = vi.hoisted(() => ({
  importPack: vi.fn(),
  readSupabaseEnv: vi.fn(),
}));

vi.mock("./content/import", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./content/import")>()),
  importPack: mocks.importPack,
}));
vi.mock("./lib/admin-client", () => ({
  readSupabaseEnv: mocks.readSupabaseEnv,
  createAdminClient: vi.fn(),
}));

const CLI_PATH = path.resolve(import.meta.dirname, "content-import.ts");
/** Como en `seed.test.ts`: importar el CLI de cero con la máquina ocupada puede tardar. */
const IMPORT_TIMEOUT_MS = 30_000;
const WAIT_TIMEOUT_MS = 20_000;
const originalArgv = process.argv;
const originalAllow = process.env.ALLOW_REMOTE_IMPORT;

/** Ejecuta el CLI con estos argumentos, como lo haría `pnpm content:import …`. */
async function run(...args: string[]): Promise<void> {
  process.argv = [originalArgv[0], CLI_PATH, ...args];
  await import("./content-import");
}

describe("scripts/content-import.ts", { timeout: IMPORT_TIMEOUT_MS }, () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.importPack.mockReset().mockResolvedValue(REPORT);
    mocks.readSupabaseEnv
      .mockReset()
      .mockReturnValue({ url: "http://127.0.0.1:54321", serviceRoleKey: "clave-de-prueba" });
    delete process.env.ALLOW_REMOTE_IMPORT;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = undefined;
    if (originalAllow === undefined) delete process.env.ALLOW_REMOTE_IMPORT;
    else process.env.ALLOW_REMOTE_IMPORT = originalAllow;
    vi.restoreAllMocks();
  });

  it("importado, no importa nada ni lee el entorno ni escribe nada", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("./content-import");
    // `main()` es asíncrona: si hubiera arrancado, aquí ya habría terminado.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.importPack).not.toHaveBeenCalled();
    expect(mocks.readSupabaseEnv).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("ejecutado como CLI, importa una vez la carpeta en el club y dice qué ha pasado", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await run("content/x/y", "--club", "club-demo");
    await vi.waitFor(() => expect(log).toHaveBeenCalledTimes(2), { timeout: WAIT_TIMEOUT_MS });

    expect(mocks.importPack).toHaveBeenCalledTimes(1);
    expect(mocks.importPack).toHaveBeenCalledWith({
      dir: path.resolve("content/x/y"),
      club: "club-demo",
      update: false,
    });
    expect(log).toHaveBeenNthCalledWith(
      1,
      "Paquete «Paquete de ejemplo» (pack-ejemplo) en club-demo · 127.0.0.1:54321.",
    );
    expect(log).toHaveBeenNthCalledWith(2, "Creados: 2. Ya existían: 0. Actualizados: 0.");
    expect(process.exitCode).toBeUndefined();
  });

  it("con --update lo pasa a la importación", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await run("content/x/y", "--club", "club-demo", "--update");
    await vi.waitFor(() => expect(log).toHaveBeenCalled(), { timeout: WAIT_TIMEOUT_MS });

    expect(mocks.importPack).toHaveBeenCalledWith(expect.objectContaining({ update: true }));
  });

  it("sin club dice cómo se usa, sale con error y no importa", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    await run("content/x/y");
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1), { timeout: WAIT_TIMEOUT_MS });

    expect(error).toHaveBeenCalledWith(USAGE);
    expect(process.exitCode).toBe(1);
    expect(mocks.importPack).not.toHaveBeenCalled();
    expect(mocks.readSupabaseEnv).not.toHaveBeenCalled();
  });

  it("contra un Supabase remoto se niega antes de importar", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.readSupabaseEnv.mockReturnValue({ url: "https://abc.supabase.co", serviceRoleKey: "clave-de-prueba" });

    await run("content/x/y", "--club", "club-demo");
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1), { timeout: WAIT_TIMEOUT_MS });

    expect(error).toHaveBeenCalledWith(expect.stringContaining("Importación bloqueada"));
    expect(process.exitCode).toBe(1);
    expect(mocks.importPack).not.toHaveBeenCalled();
  });

  it("un paquete que no vale se cuenta entero, un problema por línea, y sale con error", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.importPack.mockRejectedValue(new PackError(["uno", "dos"]));

    await run("content/x/y", "--club", "club-demo");
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1), { timeout: WAIT_TIMEOUT_MS });

    expect(error).toHaveBeenCalledWith("El paquete no es válido:\n- uno\n- dos");
    expect(process.exitCode).toBe(1);
    expect(log).not.toHaveBeenCalled();
  });
});
