import type { HomePractice } from "@/modules/home/types";
import { Card } from "./card";
import { CTAButton } from "./cta-button";
import { ChevronRightIcon } from "./icons";

/** Entre campos de los metadatos: espacio, U+00B7, espacio (el mismo que el resto de la app). */
const FIELD_SEPARATOR = " · ";

function drillsLabel(count: number): string {
  if (count === 0) return "Sin ejercicios todavía";
  if (count === 1) return "1 ejercicio";
  return `${count} ejercicios`;
}

/** «75 min · 5 ejercicios · Pabellón 2»; sin lugar (o en blanco), sin el último campo. */
function meta({ totalMinutes, drillCount, location }: HomePractice): string {
  const fields = [`${totalMinutes} min`, drillsLabel(drillCount)];
  const place = location?.trim();
  if (place) fields.push(place);
  return fields.join(FIELD_SEPARATOR);
}

/**
 * El próximo entrenamiento, destacado (design/components/PracticeCard): cuándo, qué y
 * cuánto se entiende de un vistazo.
 *
 * Es la card `spotlight`: una por pantalla. Las etiquetas son los objetivos de la sesión,
 * su «por qué» (regla 8): sin objetivos no hay etiquetas, y no se inventan. La hora llega ya
 * en la zona del club (`slotLabel`). `href` lleva al entrenamiento; el botón es `on-spotlight`.
 *
 * Medidas de las etiquetas (12px, 24px de alto) de design/components/bundle.css.
 */
export function PracticeCard({ practice, href }: { practice: HomePractice; href: string }) {
  return (
    <article>
      <Card variant="spotlight">
        <p className="text-label text-on-spotlight-2 uppercase">Próximo entrenamiento</p>
        <p className="text-body-strong tabular-nums">{practice.slotLabel}</p>
        <h2 className="font-display text-display-m wrap-break-word uppercase">{practice.title}</h2>
        <p className="text-body-s text-on-spotlight-2 tabular-nums">{meta(practice)}</p>
        {practice.focus.length > 0 ? (
          <ul aria-label="Objetivos" className="flex flex-wrap gap-(--space-2)">
            {practice.focus.map((tag) => (
              <li
                key={tag}
                className="inline-flex min-h-6 items-center rounded-xs border border-on-spotlight-2 px-(--space-2) text-[12px] leading-4 font-semibold text-on-spotlight"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
        <CTAButton variant="on-spotlight" block href={href}>
          Abrir entrenamiento
          <ChevronRightIcon size={16} />
        </CTAButton>
      </Card>
    </article>
  );
}
