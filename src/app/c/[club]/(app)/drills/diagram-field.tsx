"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import type { useAction } from "@/lib/use-action";
import { uploadDrillDiagram } from "@/modules/drills/actions";
import { DIAGRAM_ERROR, validateDiagramFile } from "@/modules/media/diagram-file";
import { CTAButton } from "@/ui/cta-button";
import { CourtDiagram } from "@/ui/court";
import { FIELD_LABEL_CLASS, FieldError } from "@/ui/form-field";
import { CheckIcon } from "@/ui/icons";

/** Lo que se dice cuando subir falla por cualquier motivo que no sea el fichero. */
const UPLOAD_FAILED = "No se pudo subir el diagrama. Inténtalo de nuevo.";

/**
 * Producto de menores: sin fotos de menores sin consentimiento registrado. El diagrama es un
 * dibujo de la pista, y el campo lo dice donde se elige el fichero.
 */
const PHOTOS_HINT = "Sube solo el dibujo de la pista. No subas fotos en las que salgan jugadores.";

const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * El diagrama de un ejercicio en el formulario de edición (en el alta no hay: la carpeta del
 * diagrama es la del ejercicio, que aún no tiene id). Enseña el que hay (o la pista vacía) y
 * ofrece «Subir diagrama» o «Cambiar diagrama» y «Quitar diagrama».
 *
 * Elegir un fichero lo comprueba primero en el navegador (`validateDiagramFile`, la misma
 * regla que aplica la acción): un tipo o un tamaño que no valen dan el error en el campo y no
 * se envía nada. Si vale, se sube enseguida (`uploadDrillDiagram`, «Subiendo…»); subirlo NO lo
 * liga al ejercicio, solo da el `mediaId` que el formulario guarda en su estado y manda con
 * «Guardar cambios». Si la acción rechaza el fichero por sus bytes (`INVALID`, con el mismo
 * mensaje) se enseña ese mensaje; cualquier otro fallo, o que la llamada misma se caiga (Next
 * corta la petición por tamaño antes de que llegue a la acción), es `UPLOAD_FAILED`. El
 * diagrama que había no cambia hasta que una subida sale bien.
 *
 * `upload` es el `useAction` de la subida y lo lleva el formulario, que necesita saber si hay
 * una en vuelo para no dejar guardar a medias. `disabled` es lo contrario: el formulario está
 * guardando y no se toca el diagrama.
 *
 * Una subida que sale bien pero cuya URL no se pudo firmar (`previewUrl: null`) cuenta igual:
 * el diagrama está subido, y en lugar de la imagen se dice «Diagrama subido». Lo mismo para el
 * diagrama que ya tenía el ejercicio si su URL no se firmó al cargar.
 *
 * El foco: mientras sube, el botón se desactiva y el navegador lo suelta; al terminar (bien o
 * mal) vuelve al botón de subir. Quitar el diagrama hace desaparecer su botón: el foco pasa a
 * «Subir diagrama».
 */
export function DiagramField({
  clubSlug,
  drillId,
  mediaId,
  initialPreviewUrl,
  hasBoard = false,
  upload,
  disabled,
  onMediaChange,
}: {
  clubSlug: string;
  drillId: string;
  /** Si el ejercicio tiene pizarra: entonces es ella la que se enseña, y el campo lo avisa. */
  hasBoard?: boolean;
  mediaId: string | null;
  initialPreviewUrl: string | null;
  upload: ReturnType<typeof useAction>;
  disabled: boolean;
  onMediaChange: (mediaId: string | null) => void;
}) {
  const hintId = useId();
  const errorId = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const refocus = useRef(false);
  const [previewUrl, setPreviewUrl] = useState(initialPreviewUrl);
  // El error de la comprobación del navegador: no pasa por `upload`, que solo sabe de la acción.
  const [fileError, setFileError] = useState<string | null>(null);

  const busy = disabled || upload.pending;
  const failure = upload.failure;
  const uploadError =
    failure === null ? null : failure.error === "INVALID" ? (failure.fieldErrors.diagram ?? UPLOAD_FAILED) : UPLOAD_FAILED;
  const error = fileError ?? uploadError;

  // Con el botón ya en su estado definitivo (activo, con su etiqueta nueva), el foco vuelve a él.
  useEffect(() => {
    if (upload.pending || !refocus.current) return;
    refocus.current = false;
    root.current?.querySelector<HTMLElement>('[data-control="upload"]')?.focus();
  }, [upload.pending, mediaId]);

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Se vacía el campo para que elegir el mismo fichero otra vez vuelva a avisar.
    event.target.value = "";
    if (!file) return;

    if (validateDiagramFile(file) !== "ok") {
      setFileError(DIAGRAM_ERROR);
      return;
    }

    setFileError(null);
    refocus.current = true;
    const body = new FormData();
    body.set("drillId", drillId);
    body.set("file", file);
    upload.run(
      () => uploadDrillDiagram(clubSlug, body),
      (uploaded) => {
        setPreviewUrl(uploaded.previewUrl);
        onMediaChange(uploaded.mediaId);
      },
    );
  }

  function remove() {
    setFileError(null);
    setPreviewUrl(null);
    refocus.current = true;
    onMediaChange(null);
  }

  const described = [hintId, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <fieldset ref={root} data-field="diagram" className="flex min-w-0 flex-col gap-(--space-3)">
      <legend className={`${FIELD_LABEL_CLASS} mb-(--space-3)`}>Diagrama</legend>

      {hasBoard ? (
        <p className="rounded-md border border-line bg-surface-2 p-(--space-4) text-body text-ink-2">
          Este ejercicio tiene pizarra, y es lo que se enseña en su ficha y en el directo. La imagen que subas
          aquí no se verá.
        </p>
      ) : null}

      <CTAButton variant="ghost" className="self-start" href={`/c/${clubSlug}/drills/${drillId}/board`}>
        {hasBoard ? "Editar pizarra" : "Dibujar pizarra"}
      </CTAButton>

      {mediaId !== null && previewUrl === null ? (
        <p className="flex items-center gap-(--space-2) rounded-md border border-line bg-surface-1 p-(--space-4) text-body">
          <CheckIcon size={16} />
          Diagrama subido
        </p>
      ) : (
        <CourtDiagram src={mediaId === null ? null : previewUrl} alt="Vista previa del diagrama" />
      )}

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        tabIndex={-1}
        onChange={choose}
      />

      <div className="flex flex-wrap items-center gap-(--space-2)">
        <CTAButton
          variant="secondary"
          data-control="upload"
          disabled={busy}
          aria-describedby={described}
          onClick={() => input.current?.click()}
        >
          {mediaId === null ? "Subir diagrama" : "Cambiar diagrama"}
        </CTAButton>
        {mediaId !== null ? (
          <CTAButton variant="ghost" data-control="remove" disabled={busy} aria-describedby={described} onClick={remove}>
            Quitar diagrama
          </CTAButton>
        ) : null}
      </div>

      {/* Siempre en el árbol, vacía hasta que sube: un lector de pantalla solo anuncia el texto
          que cambia dentro de una región que ya existía. */}
      <p role="status" className="text-body-s text-ink-2">
        {upload.pending ? "Subiendo…" : null}
      </p>

      <p id={hintId} className="text-body-s text-ink-3">
        {PHOTOS_HINT}
      </p>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </fieldset>
  );
}
