"use client";

import { useActionState, useId, useState, type FormEvent } from "react";
import { requestLoginCode, verifyLoginCode, type LoginState } from "@/modules/auth/actions";

const INITIAL: LoginState = { step: "email" };

const formClass = "flex flex-col gap-(--space-4)";
const fieldClass = "flex flex-col gap-(--space-2)";
const labelClass = "text-label uppercase text-ink-2";
// 17px: por debajo de 16px iOS amplía la página al enfocar el campo.
const inputClass =
  "h-(--target-min) w-full rounded-md border border-line-strong bg-surface-2 px-(--space-4) " +
  "text-body-l text-ink aria-invalid:border-danger " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";
const errorClass = "text-body-s text-danger";
const buttonBase =
  "flex min-h-(--target-min) items-center justify-center rounded-md font-display text-body-l " +
  "font-bold uppercase tracking-[0.04em] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";
const primaryButtonClass =
  `${buttonBase} w-full bg-brand-accent px-(--space-5) text-brand-on-accent ` +
  "active:bg-brand-accent-pressed disabled:bg-surface-2 disabled:text-ink-3";
const ghostButtonClass = `${buttonBase} self-center px-(--space-2) text-brand-accent`;

/**
 * Acceso en dos pasos: email y código de 6 dígitos.
 *
 * Cada formulario envía directamente su Server Action y el servidor decide el paso. El
 * del email funciona aunque la página aún no esté hidratada (móvil lento): por eso el
 * campo no es controlado.
 */
export function LoginForm() {
  const [requested, requestAction, pending] = useActionState(requestLoginCode, INITIAL);
  // «Usar otro email» descarta esta respuesta concreta; la siguiente vuelve a mostrar el código.
  const [dismissed, setDismissed] = useState<LoginState | null>(null);
  // React vacía el formulario al terminar la acción: se guarda lo enviado para no
  // obligar a escribir el email otra vez si hay que corregirlo o pedir otro código.
  const [submittedEmail, setSubmittedEmail] = useState("");
  const emailId = useId();
  const errorId = useId();

  if (requested.step === "code" && requested.email && requested !== dismissed) {
    return (
      <CodeStep
        email={requested.email}
        info={requested.info}
        onUseOtherEmail={() => setDismissed(requested)}
      />
    );
  }

  const error = requested.step === "email" ? requested.error : undefined;

  function rememberEmail(event: FormEvent<HTMLFormElement>) {
    const value = new FormData(event.currentTarget).get("email");
    setSubmittedEmail(typeof value === "string" ? value : "");
  }

  return (
    <form action={requestAction} onSubmit={rememberEmail} noValidate className={formClass}>
      <div className={fieldClass}>
        <label htmlFor={emailId} className={labelClass}>
          Email
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={submittedEmail}
          autoFocus={dismissed !== null}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={inputClass}
        />
        {error ? (
          <p id={errorId} role="alert" className={errorClass}>
            {error}
          </p>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        Enviar código
      </button>
    </form>
  );
}

function CodeStep({
  email,
  info,
  onUseOtherEmail,
}: {
  email: string;
  info: string | undefined;
  onUseOtherEmail: () => void;
}) {
  const [verified, verifyAction, pending] = useActionState(verifyLoginCode, {
    step: "code",
    email,
  } satisfies LoginState);
  const codeId = useId();
  const infoId = useId();
  const errorId = useId();

  const error = verified.error;
  const describedBy = [info ? infoId : null, error ? errorId : null].filter(Boolean).join(" ");

  return (
    <form action={verifyAction} noValidate className={formClass}>
      <div className={fieldClass}>
        {info ? (
          <p id={infoId} className="text-ink-2">
            {info}
          </p>
        ) : null}
        <p className="text-body-strong break-all">{email}</p>
      </div>
      <input type="hidden" name="email" value={email} />
      <div className={fieldClass}>
        <label htmlFor={codeId} className={labelClass}>
          Código
        </label>
        <input
          id={codeId}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`${inputClass} tabular-nums`}
        />
        {error ? (
          <p id={errorId} role="alert" className={errorClass}>
            {error}
          </p>
        ) : null}
      </div>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        Entrar
      </button>
      <button type="button" onClick={onUseOtherEmail} className={ghostButtonClass}>
        Usar otro email
      </button>
    </form>
  );
}
