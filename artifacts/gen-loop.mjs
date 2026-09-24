// Regenerate with: node artifacts/gen-loop.mjs artifacts/loop.svg   (then check it: napkin's check_diagram.mjs)
// Generates artifacts/loop.svg. Every position is computed from its band, so gaps and heights
// can change without edges drifting off their boxes.
import { writeFileSync } from 'node:fs'

const W = 880
const GAP = 12
const PAD = 16
const BANDS = [
  { stage: '1  Plan', h: 90 },
  { stage: '2  Design', h: 90 },
  { stage: '3  Build', caption: '/ai-sdlc:build', h: 364 },
  { stage: '4  Test', h: 90 },
  { stage: '5  Deploy', caption: '/ai-sdlc:ship', h: 270 },
  { stage: '6  Maintain', h: 90 },
]
let y = PAD
for (const b of BANDS) {
  b.top = y
  y += b.h + GAP
}
const H = y - GAP + PAD
const [plan, design, build, test, deploy, maintain] = BANDS

const MX = 300, MW = 260, MC = MX + MW / 2 // main column
const SX = 610, SW = 220, SC = SX + SW / 2 // side column
const BH = 56

// Box tops, relative to their band (same layout as before, now band-relative).
const box = (band, dy, x = MX, w = MW) => ({ x, y: band.top + dy, w, h: BH, cx: x + w / 2, cy: band.top + dy + BH / 2 })
const A = box(plan, 17)
const B = box(design, 17)
const C = box(build, 17)
const P = box(build, 96, SX, SW)
const M = box(build, 194)
const V = box(build, 284)
const D = box(test, 17)
const F = box(deploy, 22, SX, SW)
const G = box(deploy, 120)
const Hh = box(deploy, 200)
const I = box(maintain, 17)
const T = box(maintain, 17, SX, SW)
const dia = (band, dy) => ({ cx: MC, cy: band.top + dy, rx: 75, ry: 32 })
const D1 = dia(build, 124)
const D2 = dia(deploy, 50)

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const rr = (x, y, w, h, r) =>
  `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
const rect = (b, cls, title, sub) =>
  `  <rect class="${cls}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" />
  <text class="title" x="${b.cx}" y="${b.y + 23}" text-anchor="middle">${esc(title)}</text>
  <text class="sub" x="${b.cx}" y="${b.y + 42}" text-anchor="middle">${esc(sub)}</text>`
const diamond = (d, label) =>
  `  <polygon class="box" points="${d.cx},${d.cy - d.ry} ${d.cx + d.rx},${d.cy} ${d.cx},${d.cy + d.ry} ${d.cx - d.rx},${d.cy}" />
  <text class="title" x="${d.cx}" y="${d.cy + 5}" text-anchor="middle">${esc(label)}</text>`
const edge = (d, cls = 'edge') => `  <path class="${cls}" d="${d}" marker-end="url(#arrow)" />`
const label = (x, y, t, anchor) => `  <text class="label" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${esc(t)}</text>`
const down = (a, b) => edge(`M${MC},${a} V${b}`)

const aria =
  "The ai-sdlc loop, in the playbook's six stages. Plan: /ai-sdlc:idea writes the problem in the person's words. Design: /ai-sdlc:shape agrees 2 to 5 examples. Build: a technical plan is written; if the change is yellow or red, a plan review happens before any code, otherwise it goes straight to the implementer; the implementer writes checks first, then code; a fresh verifier audits the diff against the intent, and on FAIL the work goes back to the implementer, up to 3 rounds. Test: on PASS, /ai-sdlc:check shows screenshots; if it is not quite right, it goes back to shape. Deploy: if the change is yellow or red, an engineer review of the local commit happens first; then the merge gate on GitHub checks the exact commit, and the deploy guard lets only main go live. Maintain: Report a problem on every page stores each report; an engineer runs /ai-sdlc:triage, which turns new reports into draft intents, each the next idea, back at Plan."

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${aria}">
  <style>
    :root { --bg: #ffffff; --band: #f4f4f5; --box: #ffffff; --line: #d4d4d8; --text: #18181b; --muted: #52525b; --accent: #2563eb; --accent-soft: #dbeafe; --edge: #71717a; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0d1117; --band: #161b22; --box: #0d1117; --line: #30363d; --text: #e6edf3; --muted: #9da7b3; --accent: #58a6ff; --accent-soft: #10243e; --edge: #8b949e; }
    }
    .bg { fill: var(--bg); }
    .band { fill: var(--band); }
    .stage { fill: var(--text); font: 700 14px system-ui, -apple-system, 'Segoe UI', sans-serif; }
    .caption { fill: var(--muted); font: 11px ui-monospace, 'SFMono-Regular', Consolas, monospace; }
    .box { fill: var(--box); stroke: var(--line); stroke-width: 1.5; }
    .box-accent { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.5; }
    .title { fill: var(--text); font: 600 13px system-ui, -apple-system, 'Segoe UI', sans-serif; }
    .sub { fill: var(--muted); font: 11.5px system-ui, -apple-system, 'Segoe UI', sans-serif; }
    .edge { fill: none; stroke: var(--edge); stroke-width: 1.5; }
    .loop { fill: none; stroke: var(--edge); stroke-width: 1.5; stroke-dasharray: 5 4; }
    .label { fill: var(--muted); font: 12px system-ui, -apple-system, 'Segoe UI', sans-serif; }
    .arrow { fill: var(--edge); }
  </style>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path class="arrow" d="M0,0 L10,5 L0,10 z" />
    </marker>
  </defs>

  <path class="bg" d="M0,0 H${W} V${H} H0 Z" />

  <!-- Stage bands, one per playbook stage, ${GAP}px apart (drawn as paths: containers, not boxes) -->
${BANDS.map((b) => `  <path class="band" d="${rr(8, b.top, W - 16, b.h, 10)}" />`).join('\n')}
${BANDS.map((b) => `  <text class="stage" x="24" y="${b.top + 28}">${esc(b.stage)}</text>${b.caption ? `\n  <text class="caption" x="24" y="${b.top + 46}">${esc(b.caption)}</text>` : ''}`).join('\n')}

  <!-- Boxes -->
${rect(A, 'box-accent', '/ai-sdlc:idea', 'the problem, in their words')}
${rect(B, 'box-accent', '/ai-sdlc:shape', 'agree 2–5 examples')}
${rect(C, 'box', 'technical plan', 'in the intent file')}
${diamond(D1, 'yellow / red?')}
${rect(P, 'box', 'plan review', 'before any code')}
${rect(M, 'box', 'implementer', 'checks first, then code')}
${rect(V, 'box', 'fresh verifier', 'audits the diff vs the intent')}
${rect(D, 'box-accent', '/ai-sdlc:check', 'screenshots: is this it?')}
${diamond(D2, 'yellow / red?')}
${rect(F, 'box', 'engineer review', 'of the local commit')}
${rect(G, 'box', 'merge gate', 'GitHub, exact commit')}
${rect(Hh, 'box', 'deploy guard', 'only main goes live')}
${rect(I, 'box-accent', 'Report a problem', 'on every page')}
${rect(T, 'box', '/ai-sdlc:triage', 'reports → draft intents')}

  <!-- Forward edges, main column -->
${down(A.y + BH, B.y)}
${down(B.y + BH, C.y)}
${down(C.y + BH, D1.cy - D1.ry)}
${down(D1.cy + D1.ry, M.y)}
${label(MC + 8, (D1.cy + D1.ry + M.y) / 2 + 4, 'green')}
${down(M.y + BH, V.y)}
${down(V.y + BH, D.y)}
${label(MC + 8, (V.y + BH + D.y) / 2 + 4, 'PASS')}
${down(D.y + BH, D2.cy - D2.ry)}
${down(D2.cy + D2.ry, G.y)}
${label(MC + 8, (D2.cy + D2.ry + G.y) / 2 + 4, 'green')}
${down(G.y + BH, Hh.y)}
${down(Hh.y + BH, I.y)}

  <!-- Build: yellow / red goes through the plan review -->
${edge(`M${D1.cx + D1.rx},${D1.cy} H${SX}`)}
${label((D1.cx + D1.rx + SX) / 2, D1.cy - 8, 'yes', 'middle')}
${edge(`M${P.cx},${P.y + BH} V${M.cy} H${MX + MW}`)}

  <!-- Build: FAIL goes back to the same implementer -->
${edge(`M${MX},${V.cy} H265 V${M.cy} H${MX}`, 'loop')}
${label(258, (M.cy + V.cy) / 2 - 3, 'FAIL', 'end')}
${label(258, (M.cy + V.cy) / 2 + 13, '≤ 3 rounds', 'end')}

  <!-- Deploy: yellow / red goes through the engineer review -->
${edge(`M${D2.cx + D2.rx},${D2.cy} H${SX}`)}
${label((D2.cx + D2.rx + SX) / 2, D2.cy - 8, 'yes', 'middle')}
${edge(`M${F.cx},${F.y + BH} V${G.cy} H${MX + MW}`)}

  <!-- Test: not quite goes back to shape -->
${edge(`M${MX},${D.cy} H170 V${B.cy} H${MX}`, 'loop')}
${label(178, D.cy - 8, 'not quite')}

  <!-- Maintain: reports are triaged into the next ideas -->
${edge(`M${MX + MW},${I.cy} H${SX}`)}
${edge(`M${SX + SW},${T.cy} H858 V${A.cy} H${MX + MW}`, 'loop')}
${label(850, Math.round((A.cy + I.cy) / 2), 'next idea', 'end')}
</svg>
`
writeFileSync(process.argv[2], svg)
console.log(`wrote ${process.argv[2]} (${W}×${H})`)
