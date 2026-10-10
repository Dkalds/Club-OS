// Los topes de `20261215000200_games_write.sql`, para validar antes de llegar a la base.

export const OPPONENT_MAX = 80;
export const COMPETITION_MAX = 80;
export const LOCATION_MAX = 120;
export const OPPONENT_NOTES_MAX = 1000;
export const SCORE_MAX = 300;

/** Lo que dura un partido al crearlo si no se dice otra cosa ([D9]). */
export const DEFAULT_GAME_MINUTES = 90;
export const MIN_GAME_MINUTES = 30;
export const MAX_GAME_MINUTES = 240;
