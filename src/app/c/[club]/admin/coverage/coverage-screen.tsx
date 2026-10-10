"use client";

import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { fetchCoverageMatrix } from "@/modules/coverage/actions";
import type { CoverageMatrix } from "@/modules/coverage/types";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, TextField } from "@/ui/form-field";
import { CheckIcon, MinusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/states";

/**
 * Qué Standards ha trabajado cada equipo de verdad, entre dos fechas (spec, decisión 11):
 * sesión jugada y marcada hecha en Live, nunca un plan sin jugar. Cambiar el rango vuelve a
 * leer sin recargar la página (`fetchCoverageMatrix`, de solo lectura).
 */
export function CoverageScreen({
  clubSlug,
  from: initialFrom,
  to: initialTo,
  matrix: initialMatrix,
}: {
  clubSlug: string;
  from: string;
  to: string;
  matrix: CoverageMatrix;
}) {
  const { pending, failure, run } = useAction();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [matrix, setMatrix] = useState(initialMatrix);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => fetchCoverageMatrix(clubSlug, from, to), setMatrix);
  }

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Cobertura de The Way</h1>
        <p className="text-ink-2">
          Qué Standards ha trabajado cada equipo de verdad, con sesiones jugadas y marcadas
          hechas en Live.
        </p>
      </header>

      <Card>
        <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-(--space-3)">
          {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
          <TextField label="Desde" name="from" type="date" value={from} onChange={setFrom} />
          <TextField label="Hasta" name="to" type="date" value={to} onChange={setTo} />
          <CTAButton variant="primary" type="submit" disabled={pending}>
            Actualizar
          </CTAButton>
        </form>
      </Card>

      {matrix.rows.length === 0 || matrix.standards.length === 0 ? (
        <EmptyState
          title="Nada que mostrar"
          body="Hacen falta equipos y Standards publicados para ver la cobertura."
        />
      ) : (
        <Card variant="flush" className="overflow-x-auto">
          <table className="w-full border-collapse text-body-s">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 bg-surface-1 px-(--space-4) py-(--space-3) text-left">
                  Equipo
                </th>
                {matrix.standards.map((standard) => (
                  <th key={standard.id} scope="col" className="px-(--space-3) py-(--space-3) text-left whitespace-nowrap">
                    {standard.number}. {standard.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {matrix.rows.map((row) => (
                <tr key={row.team.id}>
                  <th scope="row" className="sticky left-0 bg-surface-1 px-(--space-4) py-(--space-3) text-left font-normal">
                    {row.team.name}
                  </th>
                  {row.covered.map((covered, index) => (
                    <td key={matrix.standards[index]!.id} className="px-(--space-3) py-(--space-3)">
                      {covered ? (
                        <span className="inline-flex items-center gap-(--space-1) text-success">
                          <CheckIcon size={16} />
                          <span className="sr-only">Trabajado</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-(--space-1) text-ink-3">
                          <MinusIcon size={16} />
                          <span className="sr-only">Sin trabajar</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
