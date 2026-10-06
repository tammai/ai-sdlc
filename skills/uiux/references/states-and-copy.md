# States & copy

## State lattice
Every view that loads, submits or syncs data renders these, scaled by the change tier:

| State | Required at | What it shows |
|---|---|---|
| idle / default | always | the real content |
| loading | always | skeleton matching the final layout, appearing only after ~200ms; progress indicator if > ~5s; never a full-page spinner for a partial reload |
| error | always | what happened + what to do + retry; keeps user input; no stack traces or raw codes alone |
| empty | M+ | why it's empty + the next action (first-use vs no-results vs cleared are different empties) |
| success | M+ | confirmation in the place the user looks (inline/toast), naming what happened ("Invoice sent") |
| partial | L / data-heavy | some data failed or is missing — show what exists, mark gaps with "—", explain |
| conflict | L / collaborative | someone else changed it — show both, offer resolve |
| offline | mobile, desktop, L | cached content + clear offline banner; queued actions visible |
Plus interaction states on controls: hover, focus-visible, active/pressed, disabled (with reason if not obvious), submitting (button shows progress and prevents double submit), selected.

## Copy rules
- Actions are verb + noun: "Create project", "Send invoice", not "Submit"/"OK". The verb carries through the flow: button "Publish" → toast "Published".
- Errors have three parts: what happened, why (if known), what to do. No blame, no exclamation marks: "Couldn't save the invoice. The connection dropped. Try again — your changes are kept."
- Empty states: why it's empty + one primary action: "No invoices yet. Create your first invoice to get paid faster."
- Confirmations name the object and the consequence: "Delete 'Q3 report'? This removes it for everyone and can't be undone." Buttons: "Delete report" / "Cancel".
- Sentence case. Plain words over jargon. Numbers with units and non-breaking spaces ("10 MB"). Dates relative when recent ("2 hours ago"), absolute on hover/long-press.
- No dark patterns: no confirmshaming, pre-checked opt-ins, fake urgency, hidden costs, or hard-to-find cancel.
- All user-visible strings go through i18n from the start (Nuxt i18n / next-intl / Flutter ARB).

## Flow checks (postflight, before ship)
- Primary task completes in the minimum steps; count clicks/taps for the top task.
- Every error and empty state has a way forward (no dead ends).
- Back/cancel never loses work silently; destructive actions are confirmable or undoable (prefer undo).
- Deep links/refresh land on a sensible state (SPA routing).
- Critical failure of any of these → the change is not ship-ready.
