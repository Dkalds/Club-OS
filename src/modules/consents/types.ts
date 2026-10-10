/** Una tutela sin decidir todavía: dar o no el consentimiento de imagen de ese menor. */
export type PendingGuardianship = {
  personId: string;
  firstName: string;
  lastName: string;
};

/**
 * Lo que decide si se ofrece el paso de consentimiento al entrar ([D7], [D8]): si la cuenta
 * ya aceptó los términos de este club, y qué tutelas propias no tienen todavía un
 * consentimiento de imagen activo.
 */
export type ConsentStatus = {
  needsTerms: boolean;
  pendingGuardianships: PendingGuardianship[];
};
