import { useState, type FormEvent, type ReactNode, type Ref } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import type { ContentStatus } from "@/modules/methodology/types";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert } from "@/ui/form-field";
import { CheckIcon } from "@/ui/icons";
import { StatusPill } from "./status-pill";
import type { Failure } from "@/lib/use-action";

// Lo común a los tres editores de la metodología (valores, principios, Standards): el armazón
// de su card y de su formulario, y la confirmación de lo que sale bien. Qué campos lleva cada
// uno, qué estado guarda y qué acción lanza lo decide cada editor; aquí no se sabe de qué es
// el elemento.

const HEADING_CLASS = "min-w-0 font-display text-title wrap-break-word uppercase";

/**
 * La card de un elemento que ya existe: su nombre y su estado arriba, su formulario en medio
 * y debajo sus controles (subir, bajar, publicar). El nombre es el `<h2>` de la card: el
 * `<h1>` es el de la página. `lead` es lo que va delante del nombre (el número de un Standard).
 *
 * `headingId` enlaza el encabezado con el botón «Guardar» del formulario (`EditorForm`), que
 * se llama igual en todas las cards: con él, un lector de pantalla dice de cuál habla.
 */
export function ItemCard({
  headingId,
  title,
  lead,
  status,
  controls,
  children,
}: {
  headingId: string;
  title: string;
  lead?: ReactNode;
  status: ContentStatus;
  controls: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-(--space-3)">
        <div className="flex min-w-0 items-center gap-(--space-3)">
          {lead}
          <h2 id={headingId} className={HEADING_CLASS}>
            {title}
          </h2>
        </div>
        <StatusPill status={status} />
      </div>
      {children}
      <div className="border-t border-line pt-(--space-3)">{controls}</div>
    </Card>
  );
}

/** La card del alta: su encabezado, que da nombre a su formulario (`EditorForm`, `create`), y el formulario. */
export function NewItemCard({
  headingId,
  title,
  children,
}: {
  headingId: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <h2 id={headingId} className={HEADING_CLASS}>
        {title}
      </h2>
      {children}
    </Card>
  );
}

/**
 * El formulario de un editor: el aviso del fallo arriba, los campos (`children`), la
 * confirmación de lo que ha salido bien y el botón.
 *
 * `mode` decide qué botón es. En el alta es el `primary`, el único de la página, y el formulario
 * se llama como su encabezado (`headingId`) para que sea un punto de referencia por sí mismo.
 * En un elemento que existe es `secondary` y no nombra el formulario (serían decenas de puntos
 * de referencia): el encabezado de su card es la descripción del botón.
 *
 * La región de estado está siempre en el árbol de accesibilidad, vacía hasta que hay
 * confirmación: un lector de pantalla solo anuncia el texto que cambia dentro de una región que
 * ya existía, y no la que aparece con su texto (por eso nunca `display: none` ni `sr-only`
 * aparte). Vacía no ocupa nada: el margen negativo anula el hueco del `gap` del formulario.
 */
export function EditorForm({
  mode,
  headingId,
  submitLabel,
  failure,
  confirmation,
  pending,
  onSubmit,
  ref,
  children,
}: {
  mode: "create" | "edit";
  headingId: string;
  submitLabel: string;
  failure: Failure | null;
  confirmation: string | null;
  pending: boolean;
  onSubmit: () => void;
  ref?: Ref<HTMLFormElement>;
  children: ReactNode;
}) {
  const creating = mode === "create";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form
      ref={ref}
      onSubmit={submit}
      noValidate
      aria-labelledby={creating ? headingId : undefined}
      className="flex flex-col gap-(--space-4)"
    >
      {failure ? <FormAlert message={ACTION_ERROR_COPY[failure.error]} /> : null}

      {children}

      <div role="status" className="empty:-mt-(--space-4)">
        {confirmation ? (
          <p className="flex items-center gap-(--space-2) text-body-strong text-success">
            <CheckIcon size={16} />
            {confirmation}
          </p>
        ) : null}
      </div>

      <CTAButton
        variant={creating ? "primary" : "secondary"}
        type="submit"
        block
        disabled={pending}
        aria-describedby={creating ? undefined : headingId}
        className="lg:w-auto lg:self-start"
      >
        {submitLabel}
      </CTAButton>
    </form>
  );
}

/**
 * El mensaje de lo que ha salido bien («Cambios guardados.», «Valor creado.»), que se queda
 * hasta que se toca algo: `touch(setCampo)` envuelve el `onChange` de un campo para quitarlo, y
 * `clear` lo quita al enviar de nuevo. Con él quitado, el siguiente mensaje es de verdad del
 * siguiente envío.
 */
export function useConfirmation() {
  const [message, setMessage] = useState<string | null>(null);

  function touch<V>(setValue: (value: V) => void) {
    return (value: V) => {
      setValue(value);
      setMessage(null);
    };
  }

  return { message, confirm: setMessage, clear: () => setMessage(null), touch };
}

/**
 * Lleva el foco al campo `name` de un formulario. Tras un alta, el botón se había desactivado
 * mientras la acción corría y el navegador suelta el foco (queda en `<body>`): quien usa el
 * teclado volvería a empezar la página. En el campo por el que se empieza, el alta ya vacía
 * queda lista para el siguiente.
 */
export function focusField(form: HTMLFormElement | null, name: string): void {
  form?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
}
