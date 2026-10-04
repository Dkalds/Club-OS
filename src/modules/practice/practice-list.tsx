import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { CheckIcon, PlusIcon, TeamIcon, TrainIcon } from "@/ui/icons";
import { DateChip, ListRow } from "@/ui/list-row";
import { EmptyState } from "@/ui/states";
import { practiceMeta, statusLabel } from "./format";
import type { PracticeListItem } from "./types";

// Las dos pestañas de la lista son enlaces (cambian la URL, no un estado del cliente) con la
// forma de los chips de `ui/filter.tsx`: el enlace es el área táctil de `target-min` y la
// píldora de 36px, lo que se ve. Se copian y no se importan porque ese archivo es de cliente,
// y una constante que sale de un archivo de cliente no es un texto en un componente de
// servidor. La activa sale de `aria-current` del enlace, que es el `group` de la píldora.
const TAB_LINK =
  "group inline-flex min-h-(--target-min) shrink-0 items-center focus-visible:outline-hidden";
const TAB_PILL =
  "inline-flex h-9 items-center rounded-pill border border-line bg-surface-2 px-(--space-3) " +
  "text-body-s font-semibold whitespace-nowrap text-ink-2 " +
  "group-aria-[current=page]:border-brand-accent group-aria-[current=page]:bg-brand-accent-soft " +
  "group-aria-[current=page]:text-brand-accent " +
  "group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-focus-ring";

/** Lo que va a la derecha de la fila: la hora de lo programado y, si no, cómo acabó. */
function trailOf(practice: PracticeListItem): ReactNode {
  const label = statusLabel(practice.status);
  if (label === null) return practice.time;
  // «Hecho» no depende solo del color: lleva el icono y la palabra.
  if (practice.status === "done") {
    return (
      <span className="inline-flex items-center gap-(--space-1) text-success">
        <CheckIcon size={16} />
        {label}
      </span>
    );
  }
  return label;
}

/** «75 min · 5 ejercicios · Pabellón 2»; con varios equipos, empieza por el de la sesión. */
function subtitleOf(practice: PracticeListItem, teamCount: number): string {
  const meta = practiceMeta({
    totalMinutes: practice.totalMinutes,
    itemCount: practice.itemCount,
    location: practice.location,
  });
  const team = practice.teamName.trim();
  return teamCount > 1 && team ? `${team} · ${meta}` : meta;
}

/**
 * Las sesiones de entrenamiento de quien las gestiona: el botón de crear, las pestañas
 * «Próximas» e «Histórico» y la lista de la que está abierta.
 *
 * Solo pinta: las sesiones llegan ya leídas (`listPractices`), con el día y la hora en la zona
 * del club (regla 7), y no usa hooks, así que es un componente de servidor. El `<h1>` de la
 * pantalla es de la página; los estados vacíos llevan su título como `<h2>`. Nada de un club
 * está escrito aquí: el slug llega por props.
 *
 * Una fila lleva al detalle de la sesión. Con un solo equipo no repite su nombre en cada fila;
 * con varios, abre el subtítulo. «Nueva sesión» solo sale con permiso y con algún equipo donde
 * crearla. En las próximas vacías la salida del aviso ya es esa misma acción, y no se repite
 * arriba: una pantalla, un solo botón principal.
 *
 * Sin equipos no hay nada que listar ni pestañas que cambiar: solo el aviso, con su salida.
 */
export function PracticeList({
  clubSlug,
  scope,
  practices,
  teamCount,
  canCreate,
}: {
  clubSlug: string;
  scope: "upcoming" | "history";
  practices: PracticeListItem[];
  teamCount: number;
  canCreate: boolean;
}) {
  const base = `/c/${clubSlug}`;
  const trainHref = `${base}/train`;
  const historyHref = `${trainHref}?scope=history`;
  const newHref = `${trainHref}/new`;

  if (teamCount === 0) {
    return (
      <EmptyState
        icon={<TeamIcon size={28} />}
        title="Aún no estás en ningún equipo"
        body="Cuando dirección te asigne un equipo, aquí verás sus sesiones."
        action={{ label: "Volver a Inicio", href: base }}
      />
    );
  }

  const empty = practices.length === 0;
  const createInEmptyState = canCreate && empty && scope === "upcoming";

  return (
    <div className="flex flex-col gap-(--space-3)">
      {canCreate && !createInEmptyState ? (
        <CTAButton variant="primary" block href={newHref} icon={<PlusIcon size={20} />}>
          Nueva sesión
        </CTAButton>
      ) : null}

      <nav aria-label="Sesiones" className="flex gap-(--space-2)">
        <Link
          href={trainHref}
          // Sin prefetch: el destino es una ruta dinámica detrás del proxy de sesión.
          prefetch={false}
          aria-current={scope === "upcoming" ? "page" : undefined}
          className={TAB_LINK}
        >
          <span className={TAB_PILL}>Próximas</span>
        </Link>
        <Link
          href={historyHref}
          prefetch={false}
          aria-current={scope === "history" ? "page" : undefined}
          className={TAB_LINK}
        >
          <span className={TAB_PILL}>Histórico</span>
        </Link>
      </nav>

      {!empty ? (
        <Card variant="flush" as="ul">
          {/* Las filas (`<li>`) van directas dentro de la lista: pintan sus separadores. */}
          {practices.map((practice) => (
            <ListRow
              key={practice.eventId}
              href={`${trainHref}/${practice.eventId}`}
              lead={<DateChip dow={practice.dow} day={practice.day} />}
              title={practice.title}
              subtitle={subtitleOf(practice, teamCount)}
              trail={trailOf(practice)}
            />
          ))}
        </Card>
      ) : scope === "history" ? (
        <EmptyState
          icon={<TrainIcon size={28} />}
          title="Aún no hay sesiones pasadas"
          body="Las sesiones que termines aparecerán aquí."
          action={{ label: "Ver próximas", href: trainHref }}
        />
      ) : canCreate ? (
        <EmptyState
          icon={<TrainIcon size={28} />}
          title="No hay sesiones programadas"
          body="Crea la próxima sesión de tu equipo."
          action={{ label: "Nueva sesión", href: newHref }}
        />
      ) : (
        <EmptyState
          icon={<TrainIcon size={28} />}
          title="No hay sesiones programadas"
          body="Cuando haya una sesión en el calendario, la verás aquí."
          action={{ label: "Ver histórico", href: historyHref }}
        />
      )}
    </div>
  );
}
