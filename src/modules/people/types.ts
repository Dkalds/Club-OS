/** Una persona del club en `/admin/people`: con o sin cuenta, activa o archivada. */
export type AdminPerson = {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number | null;
  archivedAt: string | null;
  hasAccount: boolean;
};
