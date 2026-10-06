# Review instructions

## Passes
Run three passes and tag each finding with its pass:
- **Bugs**: logic errors, broken edge cases, race conditions, subtle regressions, missing error handling at boundaries.
- **Security**: injection, authN/authZ gaps (every non-public route checks the session/JWT), IDOR, secrets or PII in logs/errors, unsafe deserialization, SSRF, CORS/CSRF on cookie sessions.
- **Compliance**: the change matches `spec.md` and `plan.md` (every FR/AC has a test; no files changed outside the plan without a recorded deviation), CLAUDE.md conventions, and project skills.

## What Important means here
Reserve **Important** for findings that would break behavior, lose or corrupt data, leak data, or breach a policy.
Style, naming and "I would have done it differently" are **nits**.

## Cap the nits
Report at most five nits per review; summarize the rest as a count.

## Evidence
Every Important finding cites file:line and a concrete failure scenario (inputs → wrong outcome). No scenario, no finding.

## Do not report
- Generated code (OpenAPI clients, sqlc output, `*.g.dart`, `*.freezed.dart`, `src/gen/**`).
- Anything CI already enforces (formatting, lint rules, type errors).
