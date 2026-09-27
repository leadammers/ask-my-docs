// Enforced in the database by the notebooks_enforce_limit trigger
// (supabase/migrations/20260927140000_notebook_limit.sql) — change both together.
export const MAX_NOTEBOOKS_PER_USER = 5;
export const NOTEBOOK_TITLE_MAX_LENGTH = 200;
