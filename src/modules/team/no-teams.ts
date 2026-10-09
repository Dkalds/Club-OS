import type { ClubContext } from "@/modules/tenancy/queries";

type Role = ClubContext["membership"]["role"];

export type NoTeamsState = {
  title: string;
  body: string;
  action: { label: string; href: string };
};

/**
 * Qué decir cuando «mis equipos» está vacío, según quién lo lee. A la dirección sus equipos
 * son todos los del club: si no hay ninguno, es que faltan por dar de alta, no que nadie se
 * los haya asignado.
 */
export function noTeamsState(
  role: Role,
  clubSlug: string,
  where: "sessions" | "new-session",
): NoTeamsState {
  const then = where === "sessions" ? "aquí verás sus sesiones." : "podrás crear sus sesiones.";

  if (role === "admin") {
    return {
      title: "Aún no hay equipos esta temporada",
      body: `Cuando des de alta los equipos en Gestión, ${then}`,
      action: { label: "Ir a Gestión", href: `/c/${clubSlug}/admin` },
    };
  }

  return {
    title: "Aún no estás en ningún equipo",
    body: `Cuando dirección te asigne un equipo, ${then}`,
    action:
      where === "new-session"
        ? { label: "Volver a Entrenar", href: `/c/${clubSlug}/train` }
        : { label: "Volver a Inicio", href: `/c/${clubSlug}` },
  };
}
