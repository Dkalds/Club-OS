import http from "node:http";
import type { AddressInfo } from "node:net";

// Un proxy mínimo delante de la app que hace lo que hace una base de datos lenta: el esqueleto de
// `loading.tsx` sale enseguida y el contenido de la página llega después.
//
// Por qué hace falta: con el Supabase local los datos de una página llegan tan deprisa que, casi
// siempre, ya van en el primer volcado de HTML, y un ancla (`…/way/como-jugamos#principle-x`) la
// encuentra el navegador al cargar. Con la latencia de un Supabase remoto no: el esqueleto se
// pinta, el contenido llega después de que el navegador haya dado por terminada la carga y ya no
// vuelve a buscar el fragmento. Playwright no puede partir una respuesta (`route.fulfill` manda el
// cuerpo entero) y las lecturas de la base de datos las hace el servidor de Next, no el navegador,
// así que la espera se pone aquí, en un servidor que reenvía todo a la app.
//
// Solo toca una ruta: de su respuesta HTML deja salir enseguida todo lo anterior al primer
// segmento oculto de Suspense (`<div hidden id="S:…">`, donde React escribe el contenido que se
// resuelve tarde) y retiene el resto `holdMs` milisegundos. El resto de peticiones (scripts, CSS,
// otras páginas) pasan tal cual.

/** Donde React empieza a escribir el contenido de un límite de Suspense que se resolvió después. */
const CONTENT_MARKER = Buffer.from('<div hidden id="S:');

export type SlowContentProxy = {
  /** El origen al que ir en lugar del de la app, por ejemplo `http://localhost:41234`. */
  origin: string;
  /** Cuántas respuestas ha partido: 0 si el HTML no traía ningún contenido que llegara tarde. */
  splits(): number;
  close(): Promise<void>;
};

/** Cabeceras que describen la conexión con la app y no la respuesta: no se reenvían. */
const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "content-length"];

/**
 * Levanta el proxy en un puerto libre de `localhost` (las cookies de sesión de `localhost` valen
 * para cualquier puerto) y lo apunta a la app de `appOrigin`. La respuesta HTML de `path` sale
 * partida: el esqueleto ya, el contenido `holdMs` ms después de haberse visto el punto de corte.
 */
export async function startSlowContentProxy(
  appOrigin: string,
  options: { path: string; holdMs: number },
): Promise<SlowContentProxy> {
  const app = new URL(appOrigin);
  let splits = 0;

  const server = http.createServer((request, response) => {
    const upstream = http.request(
      {
        hostname: app.hostname,
        port: app.port,
        method: request.method,
        path: request.url,
        // Sin compresión: hay que leer el HTML para encontrar el punto de corte.
        headers: { ...request.headers, host: app.host, "accept-encoding": "identity" },
      },
      (answer) => {
        const headers = { ...answer.headers };
        for (const name of HOP_BY_HOP) delete headers[name];

        const isTarget =
          request.method === "GET" &&
          (request.url ?? "").split("?")[0] === options.path &&
          String(answer.headers["content-type"]).includes("text/html");

        response.writeHead(answer.statusCode ?? 502, headers);
        if (isTarget) holdContent(answer, response, options.holdMs, () => (splits += 1));
        else answer.pipe(response);
      },
    );
    upstream.on("error", () => response.destroy());
    request.pipe(upstream);
  });

  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://localhost:${port}`,
    splits: () => splits,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Reenvía el HTML hasta el punto de corte y retiene lo que sigue hasta pasados `holdMs`. */
function holdContent(
  from: http.IncomingMessage,
  to: http.ServerResponse,
  holdMs: number,
  onSplit: () => void,
): void {
  // Lo que queda por enviar sin saber aún si el punto de corte empieza en él (puede llegar
  // partido entre dos trozos): como mucho el largo del punto de corte menos uno.
  let tail = Buffer.alloc(0);
  let held: Buffer[] | null = null;
  let released: Promise<void> | null = null;

  from.on("data", (chunk: Buffer) => {
    if (held) {
      held.push(chunk);
      return;
    }

    const data = Buffer.concat([tail, chunk]);
    const at = data.indexOf(CONTENT_MARKER);
    if (at === -1) {
      const keep = Math.min(data.length, CONTENT_MARKER.length - 1);
      to.write(data.subarray(0, data.length - keep));
      tail = data.subarray(data.length - keep);
      return;
    }

    to.write(data.subarray(0, at));
    onSplit();
    held = [data.subarray(at)];
    tail = Buffer.alloc(0);
    released = new Promise((resolve) => setTimeout(resolve, holdMs));
  });

  from.on("end", () => {
    void (async () => {
      if (held) {
        await released;
        to.end(Buffer.concat(held));
      } else {
        to.end(tail);
      }
    })();
  });
}
