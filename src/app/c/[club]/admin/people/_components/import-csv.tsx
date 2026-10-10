"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { parseCsv } from "@/modules/people-import/parse";
import { importPeople } from "@/modules/people-import/actions";
import type { ParsedRow } from "@/modules/people-import/types";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert } from "@/ui/form-field";

/**
 * Importación por CSV ([D6]): subir el fichero, ver cada fila (válida o con su error),
 * confirmar y escribir solo lo válido. El fichero se lee y se analiza en el cliente
 * (`parseCsv`, función pura): el servidor nunca lo ve, solo las filas ya confirmadas.
 */
export function ImportCsv({ clubSlug }: { clubSlug: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const { pending, failure, run } = useAction();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [imported, setImported] = useState<number | null>(null);

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const text = await file.text();
    setRows(parseCsv(text).rows);
    setImported(null);
  }

  function confirm() {
    const valid = (rows ?? []).filter((row): row is ParsedRow & { valid: true } => row.valid);
    run(
      () =>
        importPeople(clubSlug, {
          rows: valid.map((row) => ({ firstName: row.firstName, lastName: row.lastName, birthYear: row.birthYear })),
        }),
      ({ count }) => {
        setImported(count);
        setRows(null);
        router.refresh();
      },
    );
  }

  const validCount = rows?.filter((row) => row.valid).length ?? 0;

  return (
    <Card>
      <h3 className="font-display text-body-strong uppercase">Importar desde un CSV</h3>
      <p className="text-body-s text-ink-2">
        Tres columnas con cabecera: nombre, apellidos, año de nacimiento (vacío para una
        persona adulta). No asigna a ningún equipo.
      </p>

      {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
      {imported !== null && <p className="text-body-s text-success">{imported} personas importadas.</p>}

      <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={choose} />
      <CTAButton variant="secondary" onClick={() => input.current?.click()} className="lg:w-auto lg:self-start">
        Elegir fichero
      </CTAButton>

      {rows && (
        <div className="flex flex-col gap-(--space-3)">
          <ul className="flex flex-col gap-(--space-2)">
            {rows.map((row) => (
              <li
                key={row.row}
                className={`rounded-md px-(--space-3) py-(--space-2) text-body-s ${
                  row.valid ? "bg-surface-2" : "bg-danger-soft text-danger"
                }`}
              >
                Fila {row.row}: {row.valid ? `${row.firstName} ${row.lastName}` : row.error}
              </li>
            ))}
          </ul>
          <p className="text-body-s text-ink-2">
            {validCount} de {rows.length} filas son válidas. Solo esas se importan.
          </p>
          <div className="flex flex-wrap gap-(--space-3)">
            <CTAButton variant="secondary" disabled={pending} onClick={() => setRows(null)}>
              Cancelar
            </CTAButton>
            <CTAButton variant="primary" disabled={pending || validCount === 0} onClick={confirm}>
              Importar {validCount} {validCount === 1 ? "persona" : "personas"}
            </CTAButton>
          </div>
        </div>
      )}
    </Card>
  );
}
