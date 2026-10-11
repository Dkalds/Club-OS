import type { ChangeLine, RecentChange } from "@/modules/schedule/changes";
import { Card } from "./card";
import { AlertIcon, CloseIcon } from "./icons";
import { ListRow } from "./list-row";
import { SectionHeader } from "./section-header";

/**
 * «Cambios recientes»: los eventos del equipo que han cambiado de hora, de lugar o se han
 * cancelado hace poco y aún no han pasado. Cada fila lleva a su evento y dice qué le ha pasado
 * y, debajo, cuándo es ahora y qué es (`subtitle`, que ya trae el día y la hora delante: la fila
 * trunca el final). Sin cambios no pinta nada: no es un apartado fijo de la pantalla.
 *
 * `more` son los que no caben: se dice cuántos, y dónde están todos (`moreHref`, la Agenda).
 * Un cancelado lleva su icono, además de decirlo: nunca solo el color.
 */
export function RecentChanges({
  items,
  more,
  moreHref,
}: {
  items: readonly RecentChange[];
  more: number;
  moreHref?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-(--space-3)">
      <SectionHeader
        title="Cambios recientes"
        action={more > 0 && moreHref ? { label: `Ver ${more} más`, href: moreHref } : undefined}
      />
      <Card variant="flush" as="ul">
        {items.map((item) => (
          <ListRow
            key={item.eventId}
            href={item.href}
            lead={item.cancelled ? <CloseIcon /> : <AlertIcon />}
            title={item.label}
            subtitle={item.subtitle}
          />
        ))}
      </Card>
      {more > 0 && !moreHref ? (
        <p className="text-body-s text-ink-2">{`Y ${more} más, más adelante en el calendario.`}</p>
      ) : null}
    </section>
  );
}

/**
 * «Cambios», en la ficha de una sesión o de un partido: todo lo que le ha pasado, del cambio más
 * reciente al más antiguo, con lo que había antes y el día en que se cambió. Y, al final, quién
 * lo puede cambiar o cancelar (`editors`), haya cambios o no: quien lo monta lo pasa solo
 * mientras el evento se puede cambiar. Sin cambios ni esa línea, no pinta nada.
 */
export function ChangeLog({ lines, editors }: { lines: readonly ChangeLine[]; editors?: string }) {
  if (lines.length === 0 && !editors) return null;

  return (
    <section className="flex flex-col gap-(--space-3)">
      {lines.length > 0 ? (
        <>
          <SectionHeader title="Cambios" />
          <ul role="list" className="flex flex-col gap-(--space-3)">
            {lines.map((line) => (
              <li key={line.id} className="flex flex-col">
                <span className="text-body-strong">{line.title}</span>
                <span className="text-body text-ink-2">{line.detail}</span>
                {/* El día llega con mayúscula inicial («Lunes 5 oct»): en mitad de la frase, sin ella. */}
                <span className="text-body-s text-ink-3">
                  {`Cambiado el ${line.when.charAt(0).toLowerCase()}${line.when.slice(1)}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {editors ? <p className="text-body-s text-ink-2">{editors}</p> : null}
    </section>
  );
}

/** Quién puede cambiar o cancelar un evento de ese equipo: lo mismo para una sesión que para un partido. */
export function editorsLine(teamName: string): string {
  return `Lo pueden cambiar o cancelar el cuerpo técnico de ${teamName} y la dirección.`;
}
