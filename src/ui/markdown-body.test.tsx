import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownBody, safeHref } from "./markdown-body";

// Lo que escribe la dirección de un club lo lee cada miembro del club: este renderizador es
// una frontera de seguridad y estos tests son su contrato. Solo cuentan las lecturas del DOM
// que se pinta, no cómo está hecho por dentro.

function renderMarkdown(markdown: string): HTMLElement {
  const { container } = render(<MarkdownBody markdown={markdown} />);
  return container;
}

describe("safeHref", () => {
  it.each([
    "https://club-a.example/ruta?x=1#y",
    "http://club-a.example",
    "mailto:hola@club-a.example",
  ])("deja pasar %s tal cual", (url) => {
    expect(safeHref(url)).toBe(url);
  });

  it.each([
    ["javascript", "javascript:alert(1)"],
    ["javascript en mayúsculas", "JAVASCRIPT:alert(1)"],
    ["javascript partido por un tabulador", "java\tscript:alert(1)"],
    ["javascript con espacios delante", "  javascript:alert(1)"],
    ["data", "data:text/html,x"],
    ["vbscript", "vbscript:x"],
    ["file", "file:///etc/passwd"],
    ["ftp", "ftp://club-a.example"],
    ["ruta relativa", "/way/standards"],
    ["ancla", "#standard-03"],
    ["nombre suelto", "otra-pagina"],
    ["sin protocolo", "//club-a.example/x"],
    ["texto vacío", ""],
    ["URL sin servidor", "https://"],
  ])("rechaza %s", (_name, url) => {
    expect(safeHref(url)).toBeNull();
  });
});

describe("MarkdownBody · HTML crudo", () => {
  it("quita un <script> y conserva el texto de su párrafo", () => {
    const container = renderMarkdown("<script>window.x=1</script>\n\nhola");

    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("hola");
    expect(container).not.toHaveTextContent("window.x");
  });

  it("un <script> pegado al texto es un solo bloque HTML y se va entero", () => {
    // CommonMark: un bloque que empieza por `<script>` llega hasta el final de su línea, así
    // que el «hola» de la misma línea es parte del HTML y se descarta con él. Lo que importa
    // es que no quede ni la etiqueta ni su código.
    const container = renderMarkdown("<script>window.x=1</script>hola");

    expect(container.querySelector("script")).toBeNull();
    expect(container).not.toHaveTextContent("window.x");
  });

  it("un <script> dentro de una frase se quita y el texto de alrededor se queda", () => {
    const container = renderMarkdown("hola <script>window.x=1</script> mundo");

    expect(container.querySelector("script")).toBeNull();
    expect(container).toHaveTextContent("hola");
    expect(container).toHaveTextContent("mundo");
  });

  it("quita un <img onerror> sin dejar el atributo", () => {
    const container = renderMarkdown('<img src=x onerror="window.x=1">');

    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
  });

  it("quita las etiquetas HTML dentro de una frase y conserva su texto", () => {
    const container = renderMarkdown("hola <b>mundo</b>");

    expect(container.querySelector("b")).toBeNull();
    expect(container).toHaveTextContent("hola mundo");
  });
});

describe("MarkdownBody · enlaces", () => {
  it.each([
    ["javascript", "javascript:alert(1)"],
    ["javascript en mayúsculas", "JAVASCRIPT:alert(1)"],
    ["javascript partido por un tabulador", "java\tscript:alert(1)"],
    ["javascript partido por una entidad", "java&#9;script:alert(1)"],
    ["data", "data:text/html,x"],
  ])("un enlace %s no es un enlace y deja el texto", (_name, url) => {
    const container = renderMarkdown(`[clic](${url})`);

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[href]")).toBeNull();
    expect(container).toHaveTextContent("clic");
  });

  it("un enlace automático con javascript tampoco es un enlace", () => {
    const container = renderMarkdown("<javascript:alert(1)>");

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("[href]")).toBeNull();
  });

  it("una ruta relativa no es un enlace y deja el texto", () => {
    const container = renderMarkdown("[clic](/way/standards)");

    expect(container.querySelector("a")).toBeNull();
    expect(container).toHaveTextContent("clic");
  });

  it("un enlace https se abre aparte y sin acceso a la página de origen", () => {
    const container = renderMarkdown("[clic](https://club-a.example/ruta)");

    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "https://club-a.example/ruta");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveTextContent("clic");
  });

  it("un enlace http también", () => {
    const container = renderMarkdown("[clic](http://club-a.example)");

    const link = container.querySelector("a");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("un mailto es un enlace, con rel pero sin target", () => {
    const container = renderMarkdown("[escríbenos](mailto:hola@club-a.example)");

    const link = container.querySelector("a");
    expect(link).toHaveAttribute("href", "mailto:hola@club-a.example");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).not.toHaveAttribute("target");
  });
});

describe("MarkdownBody · elementos", () => {
  it("un título de nivel 1 no es un h1 y deja el texto", () => {
    const container = renderMarkdown("# Título");

    expect(container.querySelector("h1")).toBeNull();
    expect(container).toHaveTextContent("Título");
  });

  it("un título de nivel 2 tampoco es un h2", () => {
    const container = renderMarkdown("## Título");

    expect(container.querySelector("h2")).toBeNull();
    expect(container).toHaveTextContent("Título");
  });

  it("un título de nivel 3 es un h3", () => {
    const container = renderMarkdown("### Sub");

    expect(container.querySelector("h3")).toHaveTextContent("Sub");
  });

  it("una imagen no se pinta", () => {
    const container = renderMarkdown("![f](https://club-a.example/f.png)");

    expect(container.querySelector("img")).toBeNull();
  });

  it("el código pierde su elemento y deja el texto", () => {
    const container = renderMarkdown("Usa `esto` y\n\n```\nesto otro\n```");

    expect(container.querySelector("code")).toBeNull();
    expect(container.querySelector("pre")).toBeNull();
    expect(container).toHaveTextContent("Usa esto");
    expect(container).toHaveTextContent("esto otro");
  });

  it("pinta párrafos, negrita, cursiva y citas", () => {
    const container = renderMarkdown("Un **fuerte** y un *suave*.\n\n> Una cita");

    expect(container.querySelector("p")).toHaveTextContent("Un fuerte y un suave.");
    expect(container.querySelector("strong")).toHaveTextContent("fuerte");
    expect(container.querySelector("em")).toHaveTextContent("suave");
    expect(container.querySelector("blockquote")).toHaveTextContent("Una cita");
  });

  it("pinta listas con viñetas y numeradas", () => {
    const container = renderMarkdown("- uno\n- dos\n\n1. primero\n2. segundo");

    expect(container.querySelectorAll("ul > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
  });

  it("una lista numerada conserva el número con el que empieza", () => {
    const container = renderMarkdown("3. tercero\n4. cuarto");

    expect(container.querySelector("ol")).toHaveAttribute("start", "3");
  });

  it("el texto va en el cuerpo de lectura", () => {
    const container = renderMarkdown("Hola");

    expect(container.firstElementChild).toHaveClass("text-body-l");
  });

  it("con todo mezclado, solo quedan los elementos de la lista blanca", () => {
    const container = renderMarkdown(
      [
        "# Uno",
        "## Dos",
        "### Tres",
        "",
        "Texto con **negrita**, *cursiva*, `código`, <b>html</b> y ![img](https://club-a.example/f.png).",
        "",
        "[https](https://club-a.example) [mail](mailto:a@club-a.example) [js](javascript:alert(1)) [rel](/x)",
        "",
        "<script>window.x=1</script>",
        "",
        "<img src=x onerror=alert(1)>",
        "",
        "- punto\n- otro",
        "",
        "1. primero\n2. segundo",
        "",
        "> cita",
        "",
        "---",
        "",
        "```\nbloque\n```",
      ].join("\n"),
    );

    const allowed = new Set(["P", "STRONG", "EM", "UL", "OL", "LI", "H3", "BLOCKQUOTE", "A"]);
    const tags = Array.from(container.firstElementChild?.querySelectorAll("*") ?? []).map(
      (element) => element.tagName,
    );

    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(allowed.has(tag)).toBe(true);
    }
  });
});
