# TXX — Title

**Mode:** hand-off | agent+check | shared | human · **Priority:** P0 · **Depends on:** — · **Estimate:** — · **Your time:** —

## Goal
One or two sentences: what exists after this task that didn't before.

## Your part
Only for non-`hand-off` tasks: the human decisions, contributions, checks or production steps.

## Context
Links to the relevant sections of `docs/` and `conventions/`.

## Scope
- What to build.

## Out of scope
- What not to touch, even if tempting.

## Acceptance criteria
- [ ] Observable, checkable statements. Mark human-only checks with "(human)".

## Verification
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Notes for the agent
Pitfalls, hints, approved dependencies.
