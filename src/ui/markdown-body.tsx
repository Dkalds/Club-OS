import Markdown, { type Components, type ExtraProps } from "react-markdown";
import { safeHref } from "@/lib/safe-href";

export { safeHref };

// Sin `"use client"`: el `Markdown` síncrono de react-markdown no usa hooks (solo
// `MarkdownHooks`, que aquí no se importa). Así funciona igual en un componente de servidor
// (las páginas de The Way) que dentro de uno de cliente (la vista previa del editor de Gestión).

/**
 * Los únicos elementos que se pintan. Lo demás (HTML crudo, imágenes, h1, h2, código…) se
 * descarta; con `unwrapDisallowed` un elemento fuera de la lista deja su texto y no su
 * etiqueta. Este renderizador es una frontera de seguridad: lo escribe la dirección de un
 * club y lo lee cada miembro, así que no lleva `rehype-raw` ni más plugins.
 */
const ALLOWED_ELEMENTS = ["p", "strong", "em", "ul", "ol", "li", "h3", "blockquote", "a"];

/** Un elemento del árbol del Markdown (lo que React Markdown da a cada componente como `node`). */
type MarkdownElement = NonNullable<ExtraProps["node"]>;

function hasContent(child: MarkdownElement["children"][number]): boolean {
  if (child.type === "text") return child.value.trim() !== "";
  if (child.type === "element") return child.children.some(hasContent);
  return false;
}

/**
 * Si un elemento se queda sin nada que pintar: ni texto (solo espacios no cuenta) ni nada
 * dentro que lo tenga. Lo que no está en la lista blanca se quita antes de llegar aquí y no
 * deja texto si no lo tenía (una imagen), así que `![f](…)` dejaría un `<p></p>` vacío y
 * `[![f](…)](…)` un enlace enfocable y sin nombre. Esos elementos no se pintan.
 */
function isEmpty(node: MarkdownElement | undefined): boolean {
  return node !== undefined && !node.children.some(hasContent);
}

// Las etiquetas no heredan nada del navegador (el preflight de Tailwind lo reinicia todo):
// cada una lleva aquí su estilo. Los bloques de primer nivel se separan con el `gap` del
// contenedor. El sangrado deja sitio al número de una lista de dos cifras.
const LIST = "flex flex-col gap-(--space-1) pl-(--space-6) marker:text-ink-3";

/**
 * Los componentes de `p`, `a`, `ul`, `ol`, `h3` y `blockquote` pintan solo `children` y, donde
 * hace falta, una propiedad concreta (`href`, `start`): nada más de lo que trae el árbol del
 * Markdown se vuelca en esas etiquetas. Un párrafo o un enlace sin contenido no se pinta.
 */
const COMPONENTS: Components = {
  p: ({ node, children }) => (isEmpty(node) ? null : <p>{children}</p>),
  h3: ({ children }) => <h3 className="font-display text-title text-ink uppercase">{children}</h3>,
  ul: ({ children }) => <ul className={`${LIST} list-disc`}>{children}</ul>,
  ol: ({ children, start }) => (
    <ol start={start} className={`${LIST} list-decimal`}>
      {children}
    </ol>
  ),
  blockquote: ({ children }) => (
    <blockquote className="flex flex-col gap-(--space-2) border-l-2 border-line-strong pl-(--space-3) text-ink-2">
      {children}
    </blockquote>
  ),
  a: ({ node, href, children }) => {
    if (isEmpty(node)) return null;

    const safe = href === undefined ? null : safeHref(href);

    // Un enlace que no es seguro se queda en su texto: el contenido no se pierde.
    if (safe === null) return <>{children}</>;

    return (
      <a
        href={safe}
        rel="noopener noreferrer"
        // `mailto:` abre el cliente de correo; solo las páginas web se abren aparte. `safe`
        // ya se ha leído como URL: aquí no lanza.
        target={new URL(safe).protocol === "mailto:" ? undefined : "_blank"}
        className="text-brand-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        {children}
      </a>
    );
  },
};

/**
 * El texto largo de una sección de The Way, escrito en Markdown por la dirección del club.
 *
 * Pinta solo párrafos, negrita, cursiva, listas, `###`, citas y enlaces `http(s)` o `mailto`
 * (`ALLOWED_ELEMENTS`). El HTML crudo se descarta: un bloque entero (lo que empieza una línea con
 * `<script>`, `<div>`…) se va con su texto; el texto de los demás elementos que se quitan se queda.
 */
export function MarkdownBody({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-(--space-3) text-body-l wrap-break-word">
      <Markdown
        skipHtml
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={COMPONENTS}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
