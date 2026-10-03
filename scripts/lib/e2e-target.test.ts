import { describe, expect, it } from "vitest";
import { bypassHandler, checkRunnerSupabase, readE2eTarget } from "./e2e-target";

const REMOTE_APP = "https://club-os-phi.vercel.app";
const REMOTE_SUPABASE = "https://abc.supabase.co";
const LOCAL_SUPABASE = "http://127.0.0.1:54321";

describe("readE2eTarget", () => {
  it("sin BASE_URL: la app local que arranca Playwright, con la traza de siempre", () => {
    const target = readE2eTarget({});

    expect(target.baseURL).toBe("http://localhost:3000");
    expect(target.remote).toBe(false);
    expect(target.startServer).toBe(true);
    expect(target.use).toEqual({
      baseURL: "http://localhost:3000",
      trace: "retain-on-failure",
    });
  });

  it("un BASE_URL vacío o en blanco cuenta como no puesto", () => {
    for (const value of ["", "   "]) {
      expect(readE2eTarget({ BASE_URL: value }), JSON.stringify(value)).toEqual(readE2eTarget({}));
    }
  });

  it("con BASE_URL remoto: esa URL, sin servidor propio, sin traza y sin vídeo", () => {
    const target = readE2eTarget({ BASE_URL: REMOTE_APP });

    expect(target.baseURL).toBe(REMOTE_APP);
    expect(target.remote).toBe(true);
    expect(target.startServer).toBe(false);
    expect(target.use).toEqual({ baseURL: REMOTE_APP, trace: "off", video: "off" });
  });

  it("recorta los espacios del BASE_URL", () => {
    expect(readE2eTarget({ BASE_URL: `  ${REMOTE_APP}\n` }).baseURL).toBe(REMOTE_APP);
  });

  it("con BASE_URL local: tampoco arranca servidor, pero conserva la traza", () => {
    for (const url of ["http://localhost:4000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
      const target = readE2eTarget({ BASE_URL: url });

      expect(target.baseURL, url).toBe(url);
      expect(target.remote, url).toBe(false);
      expect(target.startServer, url).toBe(false);
      expect(target.use, url).toEqual({ baseURL: url, trace: "retain-on-failure" });
    }
  });

  it("un host que solo parece local es remoto", () => {
    for (const url of [
      "https://localhost.evil.test",
      "https://127.0.0.1.evil.test",
      "https://user@evil.test",
      "http://127.0.0.2:3000",
    ]) {
      const target = readE2eTarget({ BASE_URL: url });

      expect(target.remote, url).toBe(true);
      expect(target.use.trace, url).toBe("off");
    }
  });

  it("un BASE_URL que no es una URL http(s) falla antes de que corra nada", () => {
    for (const value of ["club-os-phi.vercel.app", "localhost:3000", "ftp://evil.test", "no es una url"]) {
      expect(() => readE2eTarget({ BASE_URL: value }), value).toThrow(/BASE_URL no es una URL/);
    }
  });

  describe("secreto de la protección de despliegues de Vercel", () => {
    const SECRET = "el-secreto";

    it("sin VERCEL_AUTOMATION_BYPASS_SECRET no hay nada que enviar", () => {
      for (const env of [{}, { BASE_URL: REMOTE_APP }, { BASE_URL: "http://localhost:3000" }]) {
        expect(readE2eTarget(env).bypass, JSON.stringify(env)).toBeNull();
      }
    });

    it("un secreto vacío o en blanco cuenta como no puesto", () => {
      for (const secret of ["", "  "]) {
        const target = readE2eTarget({ BASE_URL: REMOTE_APP, VERCEL_AUTOMATION_BYPASS_SECRET: secret });
        expect(target.bypass, JSON.stringify(secret)).toBeNull();
      }
    });

    it("con una app remota, se envía como x-vercel-protection-bypass solo a su origen", () => {
      const target = readE2eTarget({
        BASE_URL: REMOTE_APP,
        VERCEL_AUTOMATION_BYPASS_SECRET: `  ${SECRET}  `,
      });

      expect(target.bypass).toEqual({
        origin: REMOTE_APP,
        header: "x-vercel-protection-bypass",
        secret: SECRET,
      });
    });

    it("el origen es solo esquema, host y puerto: sin ruta ni consulta", () => {
      const target = readE2eTarget({
        BASE_URL: "https://preview.example.test:8443/app/?x=1",
        VERCEL_AUTOMATION_BYPASS_SECRET: SECRET,
      });

      expect(target.bypass?.origin).toBe("https://preview.example.test:8443");
    });

    it("nunca viaja como cabecera global del contexto (extraHTTPHeaders): iría a todos los orígenes", () => {
      const target = readE2eTarget({ BASE_URL: REMOTE_APP, VERCEL_AUTOMATION_BYPASS_SECRET: SECRET });

      expect(target.use).not.toHaveProperty("extraHTTPHeaders");
      expect(target.use).toEqual({ baseURL: REMOTE_APP, trace: "off", video: "off" });
    });

    it("con una app local no se envía a nadie, aunque la variable esté puesta", () => {
      for (const env of [
        {},
        { BASE_URL: "http://localhost:4000" },
        { BASE_URL: "http://127.0.0.1:3000" },
        { BASE_URL: "http://[::1]:3000" },
      ]) {
        const target = readE2eTarget({ ...env, VERCEL_AUTOMATION_BYPASS_SECRET: SECRET });

        expect(target.bypass, JSON.stringify(env)).toBeNull();
        expect(target.use, JSON.stringify(env)).not.toHaveProperty("extraHTTPHeaders");
      }
    });

    it("un host que solo parece local es remoto y recibe el secreto en su propio origen", () => {
      const target = readE2eTarget({
        BASE_URL: "https://localhost.evil.test",
        VERCEL_AUTOMATION_BYPASS_SECRET: SECRET,
      });

      expect(target.bypass?.origin).toBe("https://localhost.evil.test");
    });

    it("el secreto no se cuela en ningún error", () => {
      const secret = "secreto-que-no-debe-salir";
      let message = "";
      try {
        readE2eTarget({ BASE_URL: "no es una url", VERCEL_AUTOMATION_BYPASS_SECRET: secret });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/BASE_URL no es una URL/);
      expect(message).not.toContain(secret);

      const target = readE2eTarget({ BASE_URL: REMOTE_APP, VERCEL_AUTOMATION_BYPASS_SECRET: secret });
      expect(checkRunnerSupabase(target, LOCAL_SUPABASE)).not.toContain(secret);
    });
  });
});

describe("bypassHandler", () => {
  const bypass = {
    origin: REMOTE_APP,
    header: "x-vercel-protection-bypass",
    secret: "el-secreto",
  };

  function fakeRoute(headers: Record<string, string>) {
    const calls: { headers: Record<string, string> }[] = [];
    const route = {
      request: () => ({ headers: () => headers }),
      fallback: (overrides: { headers: Record<string, string> }) => {
        calls.push(overrides);
        return Promise.resolve();
      },
    };
    return { route, calls };
  }

  it("añade la cabecera y conserva las de la petición", async () => {
    const { route, calls } = fakeRoute({ accept: "text/html", "content-type": "text/plain" });

    await bypassHandler(bypass)(route);

    expect(calls).toEqual([
      {
        headers: {
          accept: "text/html",
          "content-type": "text/plain",
          "x-vercel-protection-bypass": "el-secreto",
        },
      },
    ]);
  });

  it("pisa un secreto viejo que la petición ya trajera", async () => {
    const { route, calls } = fakeRoute({ "x-vercel-protection-bypass": "viejo", accept: "*/*" });

    await bypassHandler(bypass)(route);

    expect(calls[0].headers).toEqual({
      accept: "*/*",
      "x-vercel-protection-bypass": "el-secreto",
    });
  });

  it("deja pasar la petición con fallback, no con continue: otras rutas del test siguen aplicándose", async () => {
    const { route, calls } = fakeRoute({});
    const withContinue = { ...route, continue: () => Promise.reject(new Error("no debe usarse")) };

    await bypassHandler(bypass)(withContinue);

    expect(calls).toHaveLength(1);
  });
});

describe("checkRunnerSupabase", () => {
  const remote = readE2eTarget({ BASE_URL: REMOTE_APP });

  it("con BASE_URL remoto y un Supabase remoto no hay nada que decir", () => {
    expect(checkRunnerSupabase(remote, REMOTE_SUPABASE)).toBeNull();
  });

  it("con BASE_URL remoto y un Supabase local, avisa", () => {
    for (const url of [LOCAL_SUPABASE, "http://localhost:54321", "http://[::1]:54321"]) {
      const problem = checkRunnerSupabase(remote, url);

      expect(problem, url).toContain("club-os-phi.vercel.app");
      expect(problem, url).toContain("local");
      expect(problem, url).toContain("NEXT_PUBLIC_SUPABASE_URL");
    }
  });

  it("con BASE_URL remoto y sin URL de Supabase, avisa", () => {
    for (const url of [undefined, "", "  "]) {
      const problem = checkRunnerSupabase(remote, url);

      expect(problem, JSON.stringify(url)).toContain("NEXT_PUBLIC_SUPABASE_URL");
      expect(problem, JSON.stringify(url)).toContain("falta");
    }
  });

  it("con BASE_URL remoto y una URL de Supabase ilegible, avisa", () => {
    expect(checkRunnerSupabase(remote, "no-es-una-url")).toContain("no se puede interpretar");
  });

  it("explica qué hacer: dar el Supabase remoto por la shell o quitar BASE_URL", () => {
    const problem = checkRunnerSupabase(remote, LOCAL_SUPABASE) ?? "";

    expect(problem).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(problem).toContain("shell");
    expect(problem).toContain("quita BASE_URL");
  });

  it("sin BASE_URL o con uno local se admite cualquier Supabase, como hasta ahora", () => {
    for (const base of [{}, { BASE_URL: "http://localhost:3000" }, { BASE_URL: "http://127.0.0.1:3000" }]) {
      const target = readE2eTarget(base);
      for (const url of [LOCAL_SUPABASE, REMOTE_SUPABASE, undefined, ""]) {
        expect(checkRunnerSupabase(target, url), `${JSON.stringify(base)} ${url}`).toBeNull();
      }
    }
  });

  it("un host que solo parece local no cuenta como Supabase local", () => {
    expect(checkRunnerSupabase(remote, "https://localhost.evil.test")).toBeNull();
  });
});
