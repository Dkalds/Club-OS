import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createSignedUrl: vi.fn(),
  from: vi.fn(),
  getPublicUrl: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

import { MEDIA_BUCKET, mediaPath, signedUrl } from "./storage";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const SIGNED = "http://storage.test/object/sign/club-media/org/o1/drills/d1/x.png?token=t";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue({
    createSignedUrl: mocks.createSignedUrl,
    getPublicUrl: mocks.getPublicUrl,
  });
  mocks.createClient.mockResolvedValue({ storage: { from: mocks.from } });
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
});

describe("MEDIA_BUCKET", () => {
  it("es el bucket privado de los medios del club", () => {
    expect(MEDIA_BUCKET).toBe("club-media");
  });
});

describe("mediaPath", () => {
  it("es org/{club}/drills/{ejercicio}/{uuid}.{ext}", () => {
    expect(mediaPath("o1", "drills", "d1", "png")).toMatch(/^org\/o1\/drills\/d1\/[0-9a-f-]{36}\.png$/);
  });

  it.each(["png", "jpg", "webp"] as const)("la extensión %s va al final", (ext) => {
    expect(mediaPath("o1", "drills", "d1", ext)).toMatch(new RegExp(`\\.${ext}$`));
  });

  it("cada llamada saca un nombre nuevo: un diagrama nuevo nunca pisa al anterior", () => {
    const paths = new Set(Array.from({ length: 50 }, () => mediaPath("o1", "drills", "d1", "png")));

    expect(paths.size).toBe(50);
  });

  it("el nombre es un uuid completo (el que exige la política de Storage)", () => {
    const name = mediaPath("o1", "drills", "d1", "webp").split("/").pop() ?? "";

    expect(name).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/);
  });
});

describe("signedUrl", () => {
  const PATH = "org/o1/drills/d1/x.png";

  it("firma el objeto del bucket privado con la sesión del usuario, 600 s por defecto", async () => {
    const url = await signedUrl(PATH);

    expect(url).toBe(SIGNED);
    expect(mocks.from).toHaveBeenCalledWith("club-media");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(PATH, 600);
  });

  it("acepta otra caducidad", async () => {
    await signedUrl(PATH, 60);

    expect(mocks.createSignedUrl).toHaveBeenCalledWith(PATH, 60);
  });

  it("nunca pide la URL pública", async () => {
    await signedUrl(PATH);

    expect(mocks.getPublicUrl).not.toHaveBeenCalled();
  });

  it("si Storage contesta con un error (una ficha sin objeto) devuelve null y lo registra", async () => {
    const error = Object.assign(new Error("Object not found"), { name: "StorageApiError", status: 400 });
    mocks.createSignedUrl.mockResolvedValue({ data: null, error });

    await expect(signedUrl(PATH)).resolves.toBeNull();

    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith("media.signed-url", error);
  });

  it("si la llamada lanza (la red cae) devuelve null, no lanza", async () => {
    const error = new TypeError("fetch failed");
    mocks.createSignedUrl.mockRejectedValue(error);

    await expect(signedUrl(PATH)).resolves.toBeNull();

    expect(mocks.logError).toHaveBeenCalledWith("media.signed-url", error);
  });

  it("una respuesta sin URL es null", async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "" }, error: null });

    await expect(signedUrl(PATH)).resolves.toBeNull();
  });
});
