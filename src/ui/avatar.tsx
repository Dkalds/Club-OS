export type AvatarSize = "sm" | "md" | "lg";

/**
 * Las iniciales de un nombre: la primera letra de la primera palabra y la de la última,
 * en mayúsculas y con su acento (`'Álex Prieto'` → `'ÁP'`). Una palabra da una letra; un
 * texto sin letras, `'?'`.
 *
 * Se normaliza a NFC para que una `A` seguida de su tilde suelta valga como `Á`.
 */
export function initials(name: string): string {
  const letters = name
    .normalize("NFC")
    .split(/\s+/)
    .flatMap((word) => {
      const letter = word.match(/\p{L}/u);
      return letter ? [letter[0]] : [];
    });

  if (letters.length === 0) return "?";
  const first = letters[0];
  const last = letters[letters.length - 1];
  return (letters.length === 1 ? first : `${first}${last}`).toUpperCase();
}

// Medidas de design/components/bundle.css: sin estilo de texto de token para estos tamaños.
const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "size-8 text-[13px]",
  md: "size-10 text-[16px]",
  lg: "size-16 text-[26px]",
};

/**
 * Representa a una persona o a un equipo sin foto (design/components/Avatar).
 *
 * Nunca pinta una fotografía: un menor solo sale en foto con el consentimiento de imagen
 * registrado y, en esta fase, no hay ninguna. Por defecto son las iniciales en `ink`;
 * con `number` (un dorsal, o una sigla corta) ese texto las sustituye y va en el acento
 * del club. `name` es la etiqueta accesible.
 */
export function Avatar({
  name,
  size = "md",
  number,
  tone,
  decorative = false,
}: {
  name: string;
  size?: AvatarSize;
  number?: string;
  /** El color del texto. Por defecto, el acento si lleva `number` (el club) e `ink` si no. */
  tone?: "accent" | "ink";
  /**
   * Cuando el nombre ya se lee al lado (una fila, una tarjeta): el avatar no se anuncia, para
   * que cada persona o equipo se lea una sola vez.
   */
  decorative?: boolean;
}) {
  const short = number?.trim();
  const color = (tone ?? (short ? "accent" : "ink")) === "accent" ? "text-brand-accent" : "text-ink";

  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-pill border border-line bg-surface-2 font-display leading-none font-bold tracking-[0.02em] tabular-nums ${SIZE_CLASS[size]} ${color}`}
    >
      {short || initials(name)}
    </span>
  );
}
