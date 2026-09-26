// Conventional Commits, see AGENTS.md. Scopes are task IDs like `T02b` and
// subjects often start with a proper noun or acronym (RLS, CI, Supabase),
// so the default case rules for both are off.
const config = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-case': [0],
    'subject-case': [0],
  },
};

export default config;
