"use client";

import { useState, type FormEvent } from "react";
import { ACTION_ERROR_COPY } from "@/lib/action-result";
import { useAction } from "@/lib/use-action";
import {
  createCategory,
  createSeason,
  createTeam,
  updateCategory,
  updateSeason,
  updateTeam,
} from "@/modules/team/actions";
import type { AdminCategory, AdminSeason, AdminTeam } from "@/modules/team/admin-queries";
import { Card } from "@/ui/card";
import { CTAButton } from "@/ui/cta-button";
import { FIELD_LABEL_CLASS, FormAlert, SelectField, TextField } from "@/ui/form-field";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

// ── Temporadas ───────────────────────────────────────────────────────────────────────

type SeasonDraft = { name: string; startsOn: string; endsOn: string; isCurrent: boolean };

function SeasonRow({ clubSlug, season }: { clubSlug: string; season: AdminSeason }) {
  const { pending, failure, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<SeasonDraft>({
    name: season.name,
    startsOn: season.startsOn,
    endsOn: season.endsOn,
    isCurrent: season.isCurrent,
  });

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-(--space-3) px-(--space-4) py-(--space-4)">
        <div className="flex flex-col gap-(--space-1)">
          <p className="text-body-strong">
            {season.name}
            {season.isCurrent && <span className="ml-(--space-2) text-body-s text-brand-accent">Actual</span>}
          </p>
          <p className="text-body-s text-ink-3">
            {formatDate(season.startsOn)} – {formatDate(season.endsOn)}
          </p>
        </div>
        <CTAButton variant="secondary" onClick={() => setEditing(true)}>
          Editar
        </CTAButton>
      </li>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => updateSeason(clubSlug, { seasonId: season.id, ...draft }), () => setEditing(false));
  }

  return (
    <li className="px-(--space-4) py-(--space-4)">
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3)">
        {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
        <TextField
          label="Nombre"
          name="name"
          value={draft.name}
          onChange={(name) => setDraft((d) => ({ ...d, name }))}
          maxLength={80}
          error={failure?.fieldErrors.name}
        />
        <div className="flex flex-wrap gap-(--space-3)">
          <TextField
            label="Empieza"
            name="startsOn"
            type="date"
            value={draft.startsOn}
            onChange={(startsOn) => setDraft((d) => ({ ...d, startsOn }))}
            error={failure?.fieldErrors.startsOn}
          />
          <TextField
            label="Termina"
            name="endsOn"
            type="date"
            value={draft.endsOn}
            onChange={(endsOn) => setDraft((d) => ({ ...d, endsOn }))}
            error={failure?.fieldErrors.endsOn}
          />
        </div>
        <label className="flex min-h-(--target-min) items-center gap-(--space-2)">
          <input
            type="checkbox"
            checked={draft.isCurrent}
            onChange={(event) => setDraft((d) => ({ ...d, isCurrent: event.target.checked }))}
          />
          <span className={FIELD_LABEL_CLASS}>Temporada actual</span>
        </label>
        <div className="flex gap-(--space-3)">
          <CTAButton variant="secondary" type="button" disabled={pending} onClick={() => setEditing(false)}>
            Cancelar
          </CTAButton>
          <CTAButton variant="primary" type="submit" disabled={pending}>
            Guardar
          </CTAButton>
        </div>
      </form>
    </li>
  );
}

function CreateSeasonForm({ clubSlug }: { clubSlug: string }) {
  const { pending, failure, run } = useAction();
  const [draft, setDraft] = useState<SeasonDraft>({ name: "", startsOn: "", endsOn: "", isCurrent: false });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => createSeason(clubSlug, draft), () => setDraft({ name: "", startsOn: "", endsOn: "", isCurrent: false }));
  }

  return (
    <Card>
      <h3 className="font-display text-body-strong uppercase">Nueva temporada</h3>
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3)">
        {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
        <TextField
          label="Nombre"
          name="name"
          value={draft.name}
          onChange={(name) => setDraft((d) => ({ ...d, name }))}
          maxLength={80}
          error={failure?.fieldErrors.name}
        />
        <div className="flex flex-wrap gap-(--space-3)">
          <TextField
            label="Empieza"
            name="startsOn"
            type="date"
            value={draft.startsOn}
            onChange={(startsOn) => setDraft((d) => ({ ...d, startsOn }))}
            error={failure?.fieldErrors.startsOn}
          />
          <TextField
            label="Termina"
            name="endsOn"
            type="date"
            value={draft.endsOn}
            onChange={(endsOn) => setDraft((d) => ({ ...d, endsOn }))}
            error={failure?.fieldErrors.endsOn}
          />
        </div>
        <label className="flex min-h-(--target-min) items-center gap-(--space-2)">
          <input
            type="checkbox"
            checked={draft.isCurrent}
            onChange={(event) => setDraft((d) => ({ ...d, isCurrent: event.target.checked }))}
          />
          <span className={FIELD_LABEL_CLASS}>Temporada actual</span>
        </label>
        <CTAButton variant="primary" type="submit" disabled={pending} className="lg:w-auto lg:self-start">
          Crear temporada
        </CTAButton>
      </form>
    </Card>
  );
}

// ── Categorías ───────────────────────────────────────────────────────────────────────

type CategoryDraft = { name: string; ageBand: string; sort: number };

function CategoryRow({ clubSlug, category }: { clubSlug: string; category: AdminCategory }) {
  const { pending, failure, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CategoryDraft>({
    name: category.name,
    ageBand: category.ageBand,
    sort: category.sort,
  });

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-(--space-3) px-(--space-4) py-(--space-4)">
        <p className="text-body-strong">
          {category.name} <span className="text-body-s text-ink-3">{category.ageBand}</span>
        </p>
        <CTAButton variant="secondary" onClick={() => setEditing(true)}>
          Editar
        </CTAButton>
      </li>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => updateCategory(clubSlug, { categoryId: category.id, ...draft }), () => setEditing(false));
  }

  return (
    <li className="px-(--space-4) py-(--space-4)">
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3)">
        {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
        <TextField
          label="Nombre"
          name="name"
          value={draft.name}
          onChange={(name) => setDraft((d) => ({ ...d, name }))}
          maxLength={80}
          error={failure?.fieldErrors.name}
        />
        <TextField
          label="Franja de edad"
          name="ageBand"
          value={draft.ageBand}
          onChange={(ageBand) => setDraft((d) => ({ ...d, ageBand }))}
          maxLength={4}
          hint="Como U12."
          error={failure?.fieldErrors.ageBand}
        />
        <div className="flex gap-(--space-3)">
          <CTAButton variant="secondary" type="button" disabled={pending} onClick={() => setEditing(false)}>
            Cancelar
          </CTAButton>
          <CTAButton variant="primary" type="submit" disabled={pending}>
            Guardar
          </CTAButton>
        </div>
      </form>
    </li>
  );
}

function CreateCategoryForm({ clubSlug, nextSort }: { clubSlug: string; nextSort: number }) {
  const { pending, failure, run } = useAction();
  const [draft, setDraft] = useState<CategoryDraft>({ name: "", ageBand: "", sort: nextSort });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => createCategory(clubSlug, draft), () => setDraft({ name: "", ageBand: "", sort: nextSort + 1 }));
  }

  return (
    <Card>
      <h3 className="font-display text-body-strong uppercase">Nueva categoría</h3>
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3)">
        {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
        <TextField
          label="Nombre"
          name="name"
          value={draft.name}
          onChange={(name) => setDraft((d) => ({ ...d, name }))}
          maxLength={80}
          error={failure?.fieldErrors.name}
        />
        <TextField
          label="Franja de edad"
          name="ageBand"
          value={draft.ageBand}
          onChange={(ageBand) => setDraft((d) => ({ ...d, ageBand }))}
          maxLength={4}
          hint="Como U12."
          error={failure?.fieldErrors.ageBand}
        />
        <CTAButton variant="primary" type="submit" disabled={pending} className="lg:w-auto lg:self-start">
          Crear categoría
        </CTAButton>
      </form>
    </Card>
  );
}

// ── Equipos ──────────────────────────────────────────────────────────────────────────

type TeamDraft = { seasonId: string; categoryId: string; name: string };

function teamOptions<T extends { id: string; name: string }>(items: T[]) {
  return items.map((item) => ({ value: item.id, label: item.name }));
}

function TeamRow({
  clubSlug,
  team,
  seasons,
  categories,
}: {
  clubSlug: string;
  team: AdminTeam;
  seasons: AdminSeason[];
  categories: AdminCategory[];
}) {
  const { pending, failure, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TeamDraft>({ seasonId: team.seasonId, categoryId: team.categoryId, name: team.name });

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-(--space-3) px-(--space-4) py-(--space-4)">
        <p className="text-body-strong">
          {team.name} <span className="text-body-s text-ink-3">{team.categoryName} · {team.seasonName}</span>
        </p>
        <CTAButton variant="secondary" onClick={() => setEditing(true)}>
          Editar
        </CTAButton>
      </li>
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => updateTeam(clubSlug, { teamId: team.id, ...draft }), () => setEditing(false));
  }

  return (
    <li className="px-(--space-4) py-(--space-4)">
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3)">
        {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
        <TextField
          label="Nombre"
          name="name"
          value={draft.name}
          onChange={(name) => setDraft((d) => ({ ...d, name }))}
          maxLength={80}
          error={failure?.fieldErrors.name}
        />
        <SelectField
          label="Temporada"
          name="seasonId"
          value={draft.seasonId}
          options={teamOptions(seasons)}
          onChange={(seasonId) => setDraft((d) => ({ ...d, seasonId }))}
          error={failure?.fieldErrors.seasonId}
        />
        <SelectField
          label="Categoría"
          name="categoryId"
          value={draft.categoryId}
          options={teamOptions(categories)}
          onChange={(categoryId) => setDraft((d) => ({ ...d, categoryId }))}
          error={failure?.fieldErrors.categoryId}
        />
        <div className="flex gap-(--space-3)">
          <CTAButton variant="secondary" type="button" disabled={pending} onClick={() => setEditing(false)}>
            Cancelar
          </CTAButton>
          <CTAButton variant="primary" type="submit" disabled={pending}>
            Guardar
          </CTAButton>
        </div>
      </form>
    </li>
  );
}

function CreateTeamForm({
  clubSlug,
  seasons,
  categories,
}: {
  clubSlug: string;
  seasons: AdminSeason[];
  categories: AdminCategory[];
}) {
  const { pending, failure, run } = useAction();
  const current = seasons.find((s) => s.isCurrent) ?? seasons[0];
  const [draft, setDraft] = useState<TeamDraft>({
    seasonId: current?.id ?? "",
    categoryId: categories[0]?.id ?? "",
    name: "",
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(() => createTeam(clubSlug, draft), () => setDraft((d) => ({ ...d, name: "" })));
  }

  return (
    <Card>
      <h3 className="font-display text-body-strong uppercase">Nuevo equipo</h3>
      <form onSubmit={submit} noValidate className="flex flex-col gap-(--space-3)">
        {failure && <FormAlert message={ACTION_ERROR_COPY[failure.error]} />}
        <TextField
          label="Nombre"
          name="name"
          value={draft.name}
          onChange={(name) => setDraft((d) => ({ ...d, name }))}
          maxLength={80}
          error={failure?.fieldErrors.name}
        />
        <SelectField
          label="Temporada"
          name="seasonId"
          value={draft.seasonId}
          options={teamOptions(seasons)}
          onChange={(seasonId) => setDraft((d) => ({ ...d, seasonId }))}
          error={failure?.fieldErrors.seasonId}
        />
        <SelectField
          label="Categoría"
          name="categoryId"
          value={draft.categoryId}
          options={teamOptions(categories)}
          onChange={(categoryId) => setDraft((d) => ({ ...d, categoryId }))}
          error={failure?.fieldErrors.categoryId}
        />
        <CTAButton variant="primary" type="submit" disabled={pending} className="lg:w-auto lg:self-start">
          Crear equipo
        </CTAButton>
      </form>
    </Card>
  );
}

// ── Pantalla ─────────────────────────────────────────────────────────────────────────

export function TeamsScreen({
  clubSlug,
  seasons,
  categories,
  teams,
}: {
  clubSlug: string;
  seasons: AdminSeason[];
  categories: AdminCategory[];
  teams: AdminTeam[];
}) {
  const nextSort = categories.length === 0 ? 10 : Math.max(...categories.map((c) => c.sort)) + 10;

  return (
    <>
      <header className="flex flex-col gap-(--space-2)">
        <h1 className="font-display text-display-l uppercase">Equipos</h1>
        <p className="text-ink-2">Temporadas, categorías y equipos de tu club. Ninguno se borra.</p>
      </header>

      <section className="flex flex-col gap-(--space-4)">
        <h2 className="font-display text-title uppercase">Temporadas</h2>
        {seasons.length > 0 && (
          <Card variant="flush">
            <ul className="divide-y divide-line">
              {seasons.map((season) => (
                <SeasonRow key={season.id} clubSlug={clubSlug} season={season} />
              ))}
            </ul>
          </Card>
        )}
        <CreateSeasonForm clubSlug={clubSlug} />
      </section>

      <section className="flex flex-col gap-(--space-4)">
        <h2 className="font-display text-title uppercase">Categorías</h2>
        {categories.length > 0 && (
          <Card variant="flush">
            <ul className="divide-y divide-line">
              {categories.map((category) => (
                <CategoryRow key={category.id} clubSlug={clubSlug} category={category} />
              ))}
            </ul>
          </Card>
        )}
        <CreateCategoryForm clubSlug={clubSlug} nextSort={nextSort} />
      </section>

      <section className="flex flex-col gap-(--space-4)">
        <h2 className="font-display text-title uppercase">Equipos</h2>
        {teams.length > 0 && (
          <Card variant="flush">
            <ul className="divide-y divide-line">
              {teams.map((team) => (
                <TeamRow key={team.id} clubSlug={clubSlug} team={team} seasons={seasons} categories={categories} />
              ))}
            </ul>
          </Card>
        )}
        {seasons.length > 0 && categories.length > 0 && (
          <CreateTeamForm clubSlug={clubSlug} seasons={seasons} categories={categories} />
        )}
      </section>
    </>
  );
}
