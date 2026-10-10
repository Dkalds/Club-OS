"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { formatDate } from "@/lib/time";
import { useAction } from "@/lib/use-action";
import { archiveDrill, publishDrill } from "@/modules/drills/actions";
import type { DraftDrill } from "@/modules/drills/admin-queries";
import { Card } from "@/ui/card";
import { ConfirmDialog } from "@/ui/confirm-dialog";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert } from "@/ui/form-field";
import { EmptyState } from "@/ui/states";

function DraftRow({ clubSlug, draft, timezone }: { clubSlug: string; draft: DraftDrill; timezone: string }) {
  const router = useRouter();
  const publish = useAction();
  const archive = useAction();
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  return (
    <li className="flex flex-col gap-(--space-3) px-(--space-4) py-(--space-4) lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-col gap-(--space-1)">
        <p className="text-body-strong wrap-break-word">{draft.title}</p>
        {draft.summary && <p className="text-body-s text-ink-3 wrap-break-word">{draft.summary}</p>}
        <p className="text-body-s text-ink-3">Borrador desde {formatDate(draft.createdAt, timezone)}</p>
        {publish.failure && <FormAlert message={ACTION_ERROR_COPY[publish.failure.error]} />}
        {archive.failure && <FormAlert message={ACTION_ERROR_COPY[archive.failure.error]} />}
      </div>
      <div className="flex flex-wrap items-center gap-(--space-2)">
        <CTAButton variant="secondary" href={`/c/${clubSlug}/drills/${draft.id}`} aria-label={`Ver ${draft.title}`}>
          Ver
        </CTAButton>
        <CTAButton
          variant="secondary"
          disabled={archive.pending}
          onClick={() => setConfirmingArchive(true)}
        >
          Archivar
        </CTAButton>
        <CTAButton
          variant="primary"
          disabled={publish.pending}
          onClick={() => publish.run(() => publishDrill(clubSlug, { drillId: draft.id }), () => router.refresh())}
        >
          Publicar
        </CTAButton>
      </div>
      <ConfirmDialog
        open={confirmingArchive}
        onOpenChange={setConfirmingArchive}
        title={`¿Archivar «${draft.title}»?`}
        body="Dejará de salir en la biblioteca y en esta cola. Las sesiones que ya lo usan lo conservan."
        confirmLabel="Archivar ejercicio"
        cancelLabel="Seguir"
        tone="danger"
        pending={archive.pending}
        onConfirm={() => archive.run(() => archiveDrill(clubSlug, { drillId: draft.id }), () => router.refresh())}
      />
    </li>
  );
}

export function DrillsQueueScreen({
  clubSlug,
  timezone,
  drafts,
}: {
  clubSlug: string;
  timezone: string;
  drafts: DraftDrill[];
}) {
  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Ejercicios pendientes</h1>
        <p className="text-ink-2">
          Los borradores de todo el club, del que lleva más tiempo esperando al más reciente.
        </p>
      </header>

      {drafts.length > 0 ? (
        <Card variant="flush">
          <ul className="divide-y divide-line">
            {drafts.map((draft) => (
              <DraftRow key={draft.id} clubSlug={clubSlug} draft={draft} timezone={timezone} />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState title="Nada pendiente de revisión" body="Cuando alguien guarde un ejercicio nuevo, aparecerá aquí." />
      )}
    </>
  );
}
