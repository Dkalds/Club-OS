import Link from "next/link";
import type { ReactNode } from "react";
import type { DrillDetail, DrillStatus } from "@/modules/drills/types";
import { formatStandardNumber } from "@/modules/methodology/format";
import { CTAButton } from "@/ui/cta-button";
import { DraftIcon } from "@/ui/icons";
import { SectionHeader } from "@/ui/section-header";
import { StandardBadge } from "@/ui/standard-badge";

// Las secciones de la ficha de un ejercicio, una por cada cosa que el ejercicio puede tener.
// Son de servidor y puramente de presentación: `page.tsx` decide cuáles se pintan (ninguna
// sale vacía) y de dónde sale cada texto. Los títulos de sección son `<h2>`; el `<h1>` es el
// del ejercicio.

/** Cuántos Standards se enseñan como chip; el resto se cuenta («+2»). */
const MAX_STANDARD_BADGES = 3;

/**
 * Un bloque de la ficha: su título y su contenido. La separación con el bloque de arriba la
 * pone quien monta la pantalla (`space-6`); con su contenido, `space-3`.
 */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-(--space-3)">
      <SectionHeader title={title} />
      {children}
    </section>
  );
}

/**
 * El aviso de un ejercicio que no está publicado: dice el estado y qué significa. Un publicado
 * no lleva ninguno. No es un encabezado: el `<h1>` es el título del ejercicio.
 */
export function StatusNotice({ status }: { status: DrillStatus }) {
  if (status === "published") return null;

  const draft = status === "draft";

  return (
    <div className="flex flex-col gap-(--space-1) rounded-md border border-line bg-surface-2 p-(--space-3)">
      <p className="flex items-center gap-(--space-2) text-label text-ink uppercase">
        {draft ? <DraftIcon size={16} /> : null}
        {draft ? "Borrador" : "Archivado"}
      </p>
      <p className="text-body-s text-ink-2">
        {draft
          ? "Solo lo ven su autor y dirección hasta que se publique."
          : "Este ejercicio está archivado y no sale en la biblioteca."}
      </p>
    </div>
  );
}

// El chip de un dato (edad, jugadores, minutos) y el de un principio: `radius-pill` el primero,
// `radius-sm` el segundo, ambos sobre `surface-2` con el borde de las cards.
const CHIP_BASE =
  "inline-flex max-w-full items-center border border-line bg-surface-2 text-body-s font-semibold wrap-break-word text-ink";

/** Las tres píldoras de la cabecera de la ficha: edad, jugadores y minutos, con sus unidades. */
export function MetaPills({ header }: { header: { age: string; players: string; minutes: string } }) {
  return (
    <ul className="flex flex-wrap gap-(--space-2)">
      {[header.age, header.players, header.minutes].map((text) => (
        <li key={text}>
          <span className={`${CHIP_BASE} min-h-8 rounded-pill px-(--space-3)`}>{text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Los Standards que trabaja el ejercicio (la parte «por qué»), como chips que enlazan a su sitio
 * en la página de Standards de The Way. Se enseñan hasta tres, por número; el resto se cuenta en
 * «+2», que lleva a la página de los Standards del club para verlos: sin ese enlace, lo que el
 * ejercicio trabaja y no cabe quedaría fuera de alcance. `title` es el nombre que el club da a
 * sus Standards, y es lo que nombra el enlace («Ver 2 más en Standards»): el texto visible solo
 * dice «+2».
 */
export function StandardsSection({
  title,
  clubSlug,
  standards,
}: {
  title: string;
  clubSlug: string;
  standards: DrillDetail["standards"];
}) {
  const shown = standards.slice(0, MAX_STANDARD_BADGES);
  const rest = standards.length - shown.length;

  return (
    <Section title={title}>
      <ul className="flex flex-wrap items-center gap-(--space-2)">
        {shown.map((standard) => (
          <li key={standard.id} className="max-w-full min-w-0">
            <StandardBadge
              number={standard.number}
              title={standard.title}
              href={`/c/${clubSlug}/way/standards#standard-${formatStandardNumber(standard.number)}`}
            />
          </li>
        ))}
        {rest > 0 ? (
          <li>
            <Link
              href={`/c/${clubSlug}/way/standards`}
              // Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión.
              prefetch={false}
              aria-label={`Ver ${rest} más en ${title}`}
              className="inline-flex min-h-(--target-min) min-w-(--target-min) items-center justify-center rounded-sm px-(--space-2) text-body-s font-semibold text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              +{rest}
            </Link>
          </li>
        ) : null}
      </ul>
    </Section>
  );
}

/**
 * Los principios de juego que trabaja el ejercicio, cada uno enlazado a su bloque de la sección
 * de principios de The Way. Si el club no tiene una publicada (`sectionSlug` a `null`), no hay
 * dónde enlazar: se nombra el principio y ya.
 */
export function PrinciplesSection({
  clubSlug,
  sectionSlug,
  principles,
}: {
  clubSlug: string;
  sectionSlug: string | null;
  principles: DrillDetail["principles"];
}) {
  return (
    <Section title="Principios">
      <ul className="flex flex-wrap gap-(--space-2)">
        {principles.map((principle) => (
          <li key={principle.id} className="max-w-full min-w-0">
            {sectionSlug === null ? (
              <span className={`${CHIP_BASE} min-h-8 rounded-sm px-(--space-3)`}>{principle.title}</span>
            ) : (
              <Link
                href={`/c/${clubSlug}/way/${sectionSlug}#principle-${principle.slug}`}
                // Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión.
                prefetch={false}
                className={`${CHIP_BASE} min-h-(--target-min) rounded-sm px-(--space-3) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring`}
              >
                {principle.title}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** Las variantes del ejercicio: el título de cada una (`<h3>`) y, si la tiene, su descripción. */
export function VariantsSection({ variants }: { variants: DrillDetail["variants"] }) {
  return (
    <Section title="Variantes">
      <ul className="flex flex-col gap-(--space-3)">
        {variants.map((variant, index) => (
          // El orden es el significado y la lista no se reordena en pantalla: el índice es una clave estable.
          <li key={index} className="flex flex-col gap-(--space-1)">
            <h3 className="text-body-strong wrap-break-word text-ink">{variant.title}</h3>
            {variant.description ? (
              <p className="text-body wrap-break-word text-ink-2">{variant.description}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** El material, una línea por cosa. */
export function EquipmentSection({ equipment }: { equipment: string[] }) {
  return (
    <Section title="Material">
      <ul className="flex list-disc flex-col gap-(--space-1) pl-(--space-5) marker:text-ink-3">
        {equipment.map((item, index) => (
          // Puede repetirse un mismo material: el texto solo no es una clave.
          <li key={`${index}-${item}`} className="text-body wrap-break-word text-ink">
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * El vídeo, fuera de la app: el enlace es de un sitio externo (la base de datos solo admite
 * YouTube y Vimeo) y se abre en otra pestaña, sin darle acceso a esta ni enviarle la referencia.
 */
export function VideoSection({ url }: { url: string }) {
  return (
    <Section title="Vídeo">
      <CTAButton variant="secondary" block href={url} target="_blank" rel="noopener noreferrer">
        Ver vídeo
      </CTAButton>
    </Section>
  );
}
