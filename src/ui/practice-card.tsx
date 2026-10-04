import type { HomePractice } from "@/modules/home/types";
import { practiceMeta } from "@/modules/practice/format";
import { Card } from "./card";
import { CTAButton } from "./cta-button";
import { ChevronRightIcon } from "./icons";

const KICKER = "Próximo entrenamiento";

/**
 * El próximo entrenamiento, destacado (design/components/PracticeCard): cuándo, qué y
 * cuánto se entiende de un vistazo.
 *
 * Es la card `spotlight`: una por pantalla. El kicker dice a qué equipo toca («Próximo
 * entrenamiento · Equipo A»; sin equipo, solo lo primero). Las etiquetas son los objetivos de
 * la sesión, su «por qué» (regla 8): sin objetivos no hay etiquetas, y no se inventan. La hora
 * llega ya en la zona del club (`slotLabel`) y los metadatos son los de `practiceMeta`, los
 * mismos que en el resto de pantallas de entrenamientos. `href` lleva al entrenamiento; el
 * botón es `on-spotlight`.
 *
 * Medidas de las etiquetas (12px, 24px de alto) de design/components/bundle.css.
 */
export function PracticeCard({ practice, href }: { practice: HomePractice; href: string }) {
  const teamName = practice.teamName.trim();

  return (
    <article>
      <Card variant="spotlight">
        <p className="text-label text-on-spotlight-2 uppercase">
          {teamName ? `${KICKER} · ${teamName}` : KICKER}
        </p>
        <p className="text-body-strong tabular-nums">{practice.slotLabel}</p>
        <h2 className="font-display text-display-m wrap-break-word uppercase">{practice.title}</h2>
        <p className="text-body-s text-on-spotlight-2 tabular-nums">
          {practiceMeta({
            totalMinutes: practice.totalMinutes,
            itemCount: practice.drillCount,
            location: practice.location,
          })}
        </p>
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
