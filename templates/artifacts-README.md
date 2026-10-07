# AI-native SDLC artifact chain

Every change lives in `<YYYY-MM-DD>-<slug>/` and commits one artifact per stage. The next stage reads it.

| File | Stage | Approved by | Read by |
|------|-------|-------------|---------|
| `intent.md` | Plan — what is being asked and why | product owner (or you, solo) | spec |
| `design.md` | Design — system design (required for tier L) | tech lead / architect | spec |
| `ui.md` | Design — UI direction, screens, states, copy (UI changes) | product owner / designer | spec, plan |
| `spec.md` | Design — requirements + design, policies applied | product owner (+ tech lead for tier L) | plan |
| `plan.md` | Build — files, order, tests, risks | engineer (tech lead for tier L) | build, review |
| `verify.md` | Test — toolchain evidence written by `sdlc verify` | nobody (machine evidence) | review |
| `review.md` | Deploy — ranked findings from an independent reviewer | code owner on the PR | ship |

Tiers: **S** skips spec and review.md (PR review still applies) · **M** full chain · **L** full chain, tech-lead approvals, all review passes.

Definition of ready: `sdlc approve spec` waits until every open question in `intent.md` and every Concern in `spec.md` is ticked (`- [x] … → decision`). Tier L reviews must come from a different model than the implementer (`independence: cross-model` in `review.md`). Both are gates with a level (off · advisory · soft · hard, see `sdlc gates`); a soft gate can be overridden with `--override "<reason>"`, recorded in the artifact.

Approval = frontmatter `status: approved` + `approved_by` + `approved_at`, committed. Git history is the audit trail.
`adr/` holds architecture decisions (stack choices). Incidents and monitoring findings come back in as new `intent.md` files with `source: monitor|incident|scan`.
