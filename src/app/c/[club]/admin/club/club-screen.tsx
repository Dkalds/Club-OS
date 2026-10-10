"use client";

import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import { deriveBrandColors, validateAccent } from "@/modules/tenancy/brand-tools";
import { updateClub } from "@/modules/tenancy/actions";
import { TIMEZONE_OPTIONS } from "@/modules/tenancy/schema";
import type { Branding } from "@/modules/tenancy/branding";
import type { ClubContext } from "@/modules/tenancy/queries";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FormAlert, SelectField, TextAreaField, TextField } from "@/ui/form-field";

type Draft = {
  name: string;
  timezone: string;
  displayName: string;
  wordmarkSub: string;
  shortName: string;
  wayName: string;
  tagline: string;
  accent: string;
  wayTerm: string;
  standardsTerm: string;
  termsText: string;
  imageConsentText: string;
};

function draftOf(
  org: ClubContext["org"],
  branding: Branding,
  termsText: string,
  imageConsentText: string,
): Draft {
  return {
    name: org.name,
    timezone: org.timezone,
    displayName: branding.displayName,
    wordmarkSub: branding.wordmarkSub ?? "",
    shortName: branding.shortName,
    wayName: branding.wayName,
    tagline: branding.tagline ?? "",
    accent: branding.colors.accent,
    wayTerm: branding.terminology.way ?? "",
    standardsTerm: branding.terminology.standards ?? "",
    termsText,
    imageConsentText,
  };
}

/** Las tres cards del acento (fondo, texto, pulsado), con los colores que resultarían. */
function AccentPreview({ accent }: { accent: string }) {
  const validation = validateAccent(accent);
  if (!validation.ok) {
    return (
      <p className="text-body-s text-danger">
        {validation.reason === "FORMAT"
          ? "Un color en formato #rrggbb."
          : `No se lee bien sobre el fondo de la app. Prueba con ${validation.suggested}.`}
      </p>
    );
  }

  const colors = deriveBrandColors(accent);
  return (
    <div
      className="flex items-center gap-(--space-3) rounded-md p-(--space-3)"
      style={{ backgroundColor: colors.accentSoft }}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md font-display text-body-s font-bold"
        style={{ backgroundColor: colors.accent, color: colors.onAccent }}
      >
        Aa
      </span>
      <p className="text-body-s" style={{ color: colors.accent }}>
        Así se vería el acento de tu club.
      </p>
    </div>
  );
}

export function ClubScreen({
  clubSlug,
  org,
  branding,
  termsText,
  imageConsentText,
}: {
  clubSlug: string;
  org: ClubContext["org"];
  branding: Branding;
  termsText: string;
  imageConsentText: string;
}) {
  const { pending, failure, run } = useAction();
  const [draft, setDraft] = useState<Draft>(draftOf(org, branding, termsText, imageConsentText));
  const [saved, setSaved] = useState(false);

  function field<K extends keyof Draft>(key: K) {
    return (value: Draft[K]) => {
      setDraft((d) => ({ ...d, [key]: value }));
      setSaved(false);
    };
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => updateClub(clubSlug, draft), () => setSaved(true));
  }

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Club</h1>
        <p className="text-ink-2">
          El nombre, la zona horaria, la marca y los dos textos de consentimiento de tu club.
        </p>
      </header>

      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-6)">
        {failure ? <FormAlert message={ACTION_ERROR_COPY[failure.error]} /> : null}

        <Card className="gap-(--space-4)">
          <h2 className="font-display text-title uppercase">Datos del club</h2>
          <TextField label="Nombre" name="name" value={draft.name} onChange={field("name")} maxLength={120} error={failure?.fieldErrors.name} />
          <SelectField
            label="Zona horaria"
            name="timezone"
            value={draft.timezone}
            options={TIMEZONE_OPTIONS}
            onChange={field("timezone")}
            error={failure?.fieldErrors.timezone}
          />
        </Card>

        <Card className="gap-(--space-4)">
          <h2 className="font-display text-title uppercase">Marca</h2>
          <TextField
            label="Nombre visible"
            name="displayName"
            value={draft.displayName}
            onChange={field("displayName")}
            maxLength={120}
            error={failure?.fieldErrors.displayName}
          />
          <TextField
            label="Subtítulo"
            name="wordmarkSub"
            value={draft.wordmarkSub}
            onChange={field("wordmarkSub")}
            maxLength={40}
            error={failure?.fieldErrors.wordmarkSub}
          />
          <TextField
            label="Siglas (2 a 4 letras)"
            name="shortName"
            value={draft.shortName}
            onChange={field("shortName")}
            maxLength={4}
            error={failure?.fieldErrors.shortName}
          />
          <TextField
            label="Acento"
            name="accent"
            value={draft.accent}
            onChange={field("accent")}
            maxLength={7}
            hint="Un color en formato #rrggbb. Deriva el resto de la marca."
            error={failure?.fieldErrors.accent}
          />
          <AccentPreview accent={draft.accent} />
        </Card>

        <Card className="gap-(--space-4)">
          <h2 className="font-display text-title uppercase">Terminología</h2>
          <TextField
            label="Nombre de la metodología"
            name="wayName"
            value={draft.wayName}
            onChange={field("wayName")}
            maxLength={80}
            error={failure?.fieldErrors.wayName}
          />
          <TextField
            label="Eslogan"
            name="tagline"
            value={draft.tagline}
            onChange={field("tagline")}
            maxLength={140}
            error={failure?.fieldErrors.tagline}
          />
          <TextField
            label="Nombre de la pestaña de metodología"
            name="wayTerm"
            value={draft.wayTerm}
            onChange={field("wayTerm")}
            maxLength={40}
            hint="Vacío: usa «The Way»."
            error={failure?.fieldErrors.wayTerm}
          />
          <TextField
            label="Nombre de los Standards"
            name="standardsTerm"
            value={draft.standardsTerm}
            onChange={field("standardsTerm")}
            maxLength={40}
            hint="Vacío: usa «Standards»."
            error={failure?.fieldErrors.standardsTerm}
          />
        </Card>

        <Card className="gap-(--space-4)">
          <h2 className="font-display text-title uppercase">Consentimientos</h2>
          <TextAreaField
            label="Condiciones de uso"
            name="termsText"
            value={draft.termsText}
            onChange={field("termsText")}
            maxLength={4000}
            hint="Lo ve cualquier cuenta nueva, al entrar por primera vez a este club."
            error={failure?.fieldErrors.termsText}
          />
          <TextAreaField
            label="Consentimiento de imagen de menores"
            name="imageConsentText"
            value={draft.imageConsentText}
            onChange={field("imageConsentText")}
            maxLength={4000}
            hint="Lo ve un tutor, al decidir si autoriza la imagen de su hijo o hija."
            error={failure?.fieldErrors.imageConsentText}
          />
        </Card>

        <CTAButton variant="primary" type="submit" block disabled={pending} className="lg:w-auto lg:self-start">
          {saved ? "Guardado" : "Guardar"}
        </CTAButton>
      </form>
    </>
  );
}
