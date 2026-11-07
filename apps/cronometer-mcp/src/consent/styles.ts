// Inlined into the page: the authorization CSP allows inline styles only
// (style-src 'unsafe-inline'), and no scripts, fonts or external assets.
export const CONSENT_CSS = `
:root {
  --ground: #f4f4f5; --card: #ffffff; --ink: #18181b; --muted: #5f6066; --line: #e2e2e5; --soft: #f8f8f9;
  --accent: #18181b; --accent-ink: #ffffff; --focus: #18181b40;
  --read: #2f6f8f; --read-bg: #e7f1f6; --write: #8a5a00; --write-bg: #fbf1dc;
  --danger: #a1281d; --danger-bg: #fdeceb; --danger-line: #f2c3be;
  --claude: #d97757; --claude-bg: #fbeee8; --claude-line: #f1d3c6;
  --shadow: 0 18px 50px #18181b14;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --ground: #09090b; --card: #141416; --ink: #ededef; --muted: #a0a0a8; --line: #2a2a2e; --soft: #1b1b1e;
    --accent: #ededef; --accent-ink: #141416; --focus: #ededef55;
    --read: #86c3e0; --read-bg: #1a2c35; --write: #e6b860; --write-bg: #33280f;
    --danger: #f08b80; --danger-bg: #3a1a17; --danger-line: #5c2a25;
    --claude-bg: #2e1d16; --claude-line: #4a2c20;
    --shadow: 0 18px 50px #00000066;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
body { background: var(--ground); color: var(--ink); font-family: var(--sans); font-size: 15px; line-height: 1.5; margin: 0;
  min-height: 100vh; display: grid; place-items: center; padding: 24px max(16px, env(safe-area-inset-left, 0px)) 24px max(16px, env(safe-area-inset-right, 0px)); }
button:focus-visible, summary:focus-visible, input:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }

.card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--shadow); overflow: hidden; width: 100%; max-width: 940px; }
.head { padding: 22px 28px; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 20px; align-items: center; }
.head h1 { margin: 0; font-size: 21px; line-height: 1.3; text-wrap: balance; font-weight: 700; overflow-wrap: anywhere; }
.head-text { display: grid; gap: 4px; }
.meta { font-size: 12.5px; color: var(--muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.meta code { font-family: var(--mono); font-size: 12px; background: var(--soft); border: 1px solid var(--line); padding: 1px 6px; border-radius: 6px; }

.link { display: flex; align-items: center; gap: 10px; }
.mark { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center; font-weight: 800; font-size: 20px; border: 1px solid var(--line); background: var(--soft); color: var(--ink); }
.mark svg { width: 26px; height: 26px; }
.brand-claude { background: var(--claude-bg); color: var(--claude); border-color: var(--claude-line); }
.mark.server { background: #052e1b; color: #34d399; border-color: #10b98133; }
.dots { display: flex; gap: 4px; color: var(--muted); }
.dots i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .5; }
.dots i:nth-child(2) { opacity: .75; }
.dots i:nth-child(3) { opacity: 1; }

.cols { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); border-top: 1px solid var(--line); }
.left { padding: 20px 24px 22px 28px; }
.right { background: var(--soft); border-left: 1px solid var(--line); padding: 20px 28px 22px 24px; display: grid; gap: 18px; align-content: start; }
.label { font-size: 11.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--muted); font-weight: 700; margin: 0 0 10px; }

.perms { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.perm { border: 1px solid var(--line); border-radius: 12px; background: var(--card); }
.perm summary { list-style: none; cursor: pointer; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 9px 12px; }
.perm summary::-webkit-details-marker { display: none; }
.perm strong { display: block; font-size: 14.5px; }
.perm small { display: block; color: var(--muted); font-size: 13px; line-height: 1.4; }
.ico { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; }
.ico svg { width: 18px; height: 18px; }
.risk-read .ico { background: var(--read-bg); color: var(--read); }
.risk-write .ico { background: var(--write-bg); color: var(--write); }
.risk-delete .ico { background: var(--danger-bg); color: var(--danger); }
.chev { width: 16px; height: 16px; color: var(--muted); transition: transform .15s; }
.perm[open] .chev { transform: rotate(90deg); }
.tools { margin: 0; padding: 0 12px 12px 58px; display: grid; gap: 6px; list-style: none; }
.tools li { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: var(--muted); }
.tools code { font-family: var(--mono); font-size: 11.5px; color: var(--ink); white-space: nowrap; }

form { display: grid; gap: 14px; }
.field { display: grid; gap: 6px; }
.field label { font-size: 13.5px; font-weight: 650; }
.field label span { color: var(--muted); font-weight: 400; }
input { border: 1px solid var(--line); border-radius: 10px; background: var(--card); color: var(--ink); font: inherit; padding: 10px 12px; width: 100%; }
input:focus { border-color: var(--accent); outline: none; }
.otc summary { list-style: none; cursor: pointer; font-size: 13.5px; font-weight: 650; display: inline-flex; gap: 6px; align-items: center; }
.otc summary::-webkit-details-marker { display: none; }
.otc[open] summary { margin-bottom: 6px; }
.otc .plus { display: inline-block; transition: transform .15s; }
.otc[open] .plus { transform: rotate(45deg); }
.otc.required summary { color: var(--danger); }
.otc.required input { border-color: var(--danger); }
.error { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 10px; background: var(--danger-bg); border: 1px solid var(--danger-line); color: var(--danger); border-radius: 10px; padding: 10px 12px; font-size: 13.5px; margin: 0; }
.error svg { width: 16px; height: 16px; margin-top: 2px; }

.actions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; padding-top: 4px; }
.btn { font: inherit; font-weight: 700; border-radius: 10px; padding: 12px; cursor: pointer; border: 1px solid var(--line); background: var(--card); color: var(--ink); }
.btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.return { text-align: center; font-size: 12.5px; color: var(--muted); margin: 0; overflow-wrap: anywhere; }
.return b { color: var(--ink); font-weight: 600; }

.facts { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; font-size: 13.5px; color: var(--muted); }
.facts li { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 10px; }
.facts svg { width: 16px; height: 16px; margin-top: 2px; }
.facts b { color: var(--ink); font-weight: 600; }

.foot a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.foot { border-top: 1px solid var(--line); padding: 12px 28px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--muted); }

@media (max-width: 760px) {
  .card { max-width: 480px; }
  .head { grid-template-columns: minmax(0, 1fr); justify-items: center; text-align: center; padding: 22px 20px; }
  .meta { justify-content: center; }
  .cols { grid-template-columns: minmax(0, 1fr); }
  .left, .right { padding: 18px 20px; }
  .right { border-left: 0; border-top: 1px solid var(--line); }
  .foot { padding: 12px 20px; }
}
@media (max-width: 420px) {
  .tools { padding-left: 12px; }
  .tools li { flex-direction: column; gap: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .chev, .otc .plus { transition: none; }
}
`;
