/**
 * Generates the Home Test dashboard (Lovelace JSON) from sensor.home_dashboard_state.
 * Every region is one custom:button-card whose JS template returns HTML+CSS.
 * Run: npx tsx ha-dashboard/build.ts  -> ha-dashboard/home_test_dashboard.json
 * Generated JS avoids backticks and ${}: strings are concatenated so it embeds cleanly.
 */
import { writeFileSync } from "node:fs";

const HELPERS = String.raw`
var S = states['sensor.home_dashboard_state'];
var A = (S && S.attributes) || {};
var ok = !!S && S.state !== 'unknown' && S.state !== 'unavailable';
var COL = {safety:'#ff5a36', waste:'#f08a24', comfort:'#9b7bff', device_health:'#5aa9ff', informational:'#8a8f98', calm:'#3dd6c6'};
var LBL = {safety:'Safety', waste:'Waste', comfort:'Comfort', device_health:'Device health', informational:'Info'};
var GLOW = {Morning:'rgba(127,166,201,.22)', Afternoon:'rgba(180,190,200,.14)', Evening:'rgba(240,138,36,.30)', Night:'rgba(60,90,200,.34)'};
var FONT = "'Oswald','Arial Narrow','Roboto Condensed',Impact,sans-serif";
var BODY = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
var MONO = "ui-monospace,SFMono-Regular,Menlo,monospace";
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
var fmt = function (s, o) { return s.replace(/@@(\w+)@@/g, function (_, k) { return o[k] == null ? '' : o[k]; }); };
var ago = function (iso) { var m = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000)); var h = Math.floor(m / 60); return h > 0 ? h + 'H ' + (m % 60) + 'M' : m + 'M'; };
var clock = function (iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); };
var stale = !!A.evaluated_at && (Date.now() - Date.parse(A.evaluated_at)) > 10 * 60000;
if (typeof document !== 'undefined' && !document.getElementById('hd-oswald')) {
  var lk = document.createElement('link'); lk.id = 'hd-oswald'; lk.rel = 'stylesheet';
  lk.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap';
  document.head.appendChild(lk);
}
var GRAIN = "url(\"data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>") + "\")";
var REDUCE = "@media (prefers-reduced-motion: reduce){.dot,.hero:before{animation:none !important}}";
var NOPUB = '<div style="font-family:' + FONT + ';letter-spacing:.16em;font-size:13px;color:#ff5a36;border:1px solid #232830;padding:14px 16px;background:#12151a;border-radius:6px;">HOME DASHBOARD NOT PUBLISHING &middot; TURN ON publish_state IN THE APP</div>';
`;

const CTX = String.raw`
var c = A.context_bar;
if (!ok || !c) return NOPUB;
var n = c.issueCount;
var tag = stale ? 'STALE' : (A.observe_only ? 'OBSERVE-ONLY' : 'LIVE');
var tc = stale ? '#f08a24' : '#3dd6c6';
return fmt("<style>.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 4px;font-family:@@F@@;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#e8e6e1;border-bottom:1px solid #232830}.bar i{color:#4a505a;font-style:normal;padding:0 6px}.bar .cr{color:#8a8f98;display:flex;align-items:center;gap:8px;white-space:nowrap}.dot{width:8px;height:8px;border-radius:50%;background:@@TC@@;box-shadow:0 0 8px @@TC@@;animation:hdc 2.4s ease-in-out infinite}.cr b{color:@@TC@@;font-weight:500}@keyframes hdc{0%,100%{opacity:1}50%{opacity:.35}}@@RM@@</style><div class='bar'><span>@@T@@<i>/</i>@@P@@<i>/</i>@@N@@ ISSUE@@S@@</span><span class='cr'><span class='dot'></span><b>@@TAG@@</b>@@AT@@</span></div>",
  {F: FONT, TC: tc, RM: REDUCE, T: esc(c.timeOfDay), P: esc(c.presence), N: n, S: n === 1 ? '' : 'S', TAG: tag, AT: A.evaluated_at ? '&middot; ' + clock(A.evaluated_at) : ''});
`;

const HERO = String.raw`
var h = A.hero;
if (!ok || !h) return NOPUB;
var tod = (A.context_bar && A.context_bar.timeOfDay) || 'Evening';
var issue = h.kind === 'issue';
var acc = issue ? (COL[h.issueType] || COL.informational) : COL.calm;
var eyebrow = issue ? (LBL[h.issueType] || 'Issue').toUpperCase() + ' &middot; ' + ago(h.createdAt) : 'HOUSE STATUS';
var right = issue ? 'PRIORITY ' + h.priority : (A.observe_only ? 'OBSERVE-ONLY' : 'LIVE');
var chips = '';
if (issue) {
  chips = "<div class='chips'><span class='chip p'>Suggested &middot; " + esc(h.primary.label) + "</span><span class='chip'>" + esc(h.secondary.label) + "</span></div>";
  if (h.status === 'auto_failed') chips = "<div class='fail'>Automatic action failed &middot; do it manually</div>" + chips;
} else {
  var d = ((states['sensor.forecast_days'] || {}).attributes || {}).days;
  var cs = A.calm_status || {};
  chips = "<div class='sub'>" + esc(cs.houseState || '') + (d && d[0] ? ' &middot; ' + esc(String(d[0].cond).replace(/-/g, ' ')) + ' ' + d[0].hi + '&deg;' : '') + "</div>";
}
return fmt("<style>.hero{position:relative;overflow:hidden;box-sizing:border-box;min-height:250px;padding:22px 22px 20px 28px;border:1px solid #232830;border-radius:6px;display:flex;flex-direction:column;justify-content:flex-end;color:#e8e6e1;background:radial-gradient(120% 90% at 0% 100%,@@GLOW@@ 0%,transparent 62%),radial-gradient(70% 80% at 100% 0%,@@ACC@@26 0%,transparent 70%),linear-gradient(160deg,#171a20,#0c0e12)}.hero:before{content:'';position:absolute;left:0;top:0;bottom:0;width:6px;background:@@ACC@@;box-shadow:0 0 22px @@ACC@@88;animation:hdp 2.6s ease-in-out infinite}.hero:after{content:'';position:absolute;inset:0;background-image:@@GRAIN@@;opacity:.07;mix-blend-mode:overlay;pointer-events:none}.eb{position:relative;display:flex;justify-content:space-between;font-family:@@F@@;font-size:13px;letter-spacing:.2em;color:@@ACC@@;text-transform:uppercase}.eb span:last-child{color:#8a8f98}.ti{position:relative;font-family:@@F@@;font-weight:700;font-size:46px;line-height:1.02;letter-spacing:.01em;text-transform:uppercase;margin:12px 0 10px}.re{position:relative;font-family:@@B@@;font-size:15px;color:#aeb2ba;max-width:34em}.chips{position:relative;display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.chip{font-family:@@F@@;font-size:12px;letter-spacing:.16em;text-transform:uppercase;border:1px solid #2f353f;border-radius:3px;padding:10px 15px;color:#c9ccd2}.chip.p{background:@@ACC@@;border-color:@@ACC@@;color:#0b0d10;font-weight:700}.fail{position:relative;margin-top:16px;font-family:@@F@@;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#ff5a36}.sub{position:relative;margin-top:16px;font-family:@@F@@;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#8a8f98}@keyframes hdp{0%,100%{opacity:1}50%{opacity:.45}}@@RM@@</style><div class='hero'><div class='eb'><span>@@EB@@</span><span>@@R@@</span></div><div class='ti'>@@T@@</div><div class='re'>@@RE@@</div>@@CH@@</div>",
  {GLOW: GLOW[tod] || GLOW.Evening, ACC: acc, GRAIN: GRAIN, F: FONT, B: BODY, RM: REDUCE, EB: eyebrow, R: right, T: esc(h.title), RE: esc(h.reason), CH: chips});
`;

const SEC = String.raw`
var s = A.secondary || [];
if (!ok || s.length === 0) return '';
var tiles = '';
s.forEach(function (i, idx) {
  var acc = COL[i.issueType] || COL.informational;
  tiles += fmt("<div class='t' style='--a:@@ACC@@'><div class='ix'>0@@IX@@</div><div class='tt'>@@T@@</div><div class='rr'>@@R@@ &middot; @@TY@@</div></div>",
    {ACC: acc, IX: idx + 2, T: esc(i.title), R: esc(i.reason), TY: (LBL[i.issueType] || '').toUpperCase()});
});
return fmt("<style>.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}.t{position:relative;padding:14px 16px 14px 20px;background:#12151a;border:1px solid #232830;border-radius:6px;color:#e8e6e1;overflow:hidden}.t:before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--a)}.ix{font-family:@@F@@;font-size:12px;letter-spacing:.2em;color:var(--a)}.tt{font-family:@@F@@;font-weight:700;font-size:20px;line-height:1.1;text-transform:uppercase;margin:6px 0 6px}.rr{font-family:@@B@@;font-size:13px;color:#8a8f98}</style><div class='g'>@@TILES@@</div>",
  {F: FONT, B: BODY, TILES: tiles});
`;

const CALM = String.raw`
var cs = A.calm_status;
if (!ok || !cs) return '';
var d = ((states['sensor.forecast_days'] || {}).attributes || {}).days;
var w = d && d[0] ? d[0] : null;
var WI = {sunny:'mdi:weather-sunny', clear:'mdi:weather-sunny', partlycloudy:'mdi:weather-partly-cloudy', cloudy:'mdi:weather-cloudy', rainy:'mdi:weather-rainy', 'lightning-rainy':'mdi:weather-lightning-rainy', snowy:'mdi:weather-snowy', fog:'mdi:weather-fog', windy:'mdi:weather-windy'};
var cell = function (icon, color, label, value) {
  return "<div class='c'><ha-icon icon='" + icon + "' style='color:" + color + "'></ha-icon><div><div class='l'>" + label + "</div><div class='v'>" + value + "</div></div></div>";
};
var secure = cs.houseState === 'Secure';
var html = cell('mdi:shield-home-outline', secure ? '#3dd6c6' : '#ff5a36', 'House', esc(cs.houseState)) +
  cell('mdi:account-multiple-outline', '#9b7bff', 'People', esc(cs.presenceSummary)) +
  (w ? cell(WI[w.cond] || 'mdi:weather-cloudy', '#f08a24', 'Weather', esc(String(w.cond).replace(/-/g, ' ')) + ' ' + w.hi + '&deg; / ' + w.lo + '&deg;') : '');
return fmt("<style>.kr{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:#232830;border:1px solid #232830;border-radius:6px;overflow:hidden}.c{display:flex;align-items:center;gap:12px;padding:14px 16px;background:#0f1216;color:#e8e6e1}.c ha-icon{--mdc-icon-size:26px}.l{font-family:@@F@@;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a8f98}.v{font-family:@@F@@;font-size:17px;letter-spacing:.04em;text-transform:uppercase;margin-top:2px}</style><div class='kr'>@@H@@</div>", {F: FONT, H: html});
`;

const QUICK = String.raw`
var q = A.quick_access;
if (!ok || !q) return '';
var IC = {lights:['mdi:lightbulb-outline','#f08a24'], climate:['mdi:thermometer','#3dd6c6'], security:['mdi:shield-outline','#5aa9ff'], areas:['mdi:floor-plan','#9b7bff']};
var tiles = q.map(function (x) {
  var ic = IC[x.id] || ['mdi:circle-outline', '#8a8f98'];
  return "<div class='q'><ha-icon icon='" + ic[0] + "' style='color:" + ic[1] + "'></ha-icon><div class='qv'>" + esc(x.summary) + "</div><div class='ql'>" + esc(x.label) + "</div></div>";
}).join('');
return fmt("<style>.qg{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}@media (max-width:520px){.qg{grid-template-columns:repeat(2,1fr)}}.q{padding:12px 14px;border:1px solid #232830;border-radius:6px;background:transparent;color:#e8e6e1}.q ha-icon{--mdc-icon-size:20px}.qv{font-family:@@F@@;font-weight:500;font-size:20px;text-transform:uppercase;margin-top:8px;line-height:1.1}.ql{font-family:@@F@@;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a8f98;margin-top:4px}</style><div class='qg'>@@T@@</div>", {F: FONT, T: tiles});
`;

const TEST = String.raw`
var r = A.recent_activity;
if (!ok) return '';
var li = (r && r.length ? r.slice().reverse() : ['nothing yet']).map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('');
return fmt("<style>details{border:1px dashed #2c323b;border-radius:6px;padding:10px 14px;color:#8a8f98}summary{cursor:pointer;font-family:@@F@@;font-size:11px;letter-spacing:.2em;text-transform:uppercase}ul{margin:10px 0 0;padding-left:18px;font-family:@@M@@;font-size:12px;line-height:1.6;color:#aeb2ba}</style><details><summary>Dry-run &middot; what it would do</summary><ul>@@L@@</ul></details>", {F: FONT, M: MONO, L: li});
`;

const wrap = (js: string) => `(function () { ${js} })()`;
const ORDER = ["ctx", "hero", "sec", "calm", "quick", "test"] as const;
export const REGIONS = { ctx: CTX, hero: HERO, sec: SEC, calm: CALM, quick: QUICK, test: TEST };
const collapse = (t: string) => t.replace(/\s*\n\s*/g, " "); // generated JS: no line comments, statements end with ';' or a brace

/** One region on its own (used by tests to check each part in isolation). */
export const regionTemplate = (name: keyof typeof REGIONS) => collapse(`[[[ ${HELPERS} return ${wrap(REGIONS[name])}; ]]]`);

/** All regions in spec order, sharing a single copy of the helpers. */
export const combinedTemplate = () =>
  collapse(
    `[[[ ${HELPERS} if (!ok || !A.context_bar) return NOPUB; var parts = [ ${ORDER.map((n) => wrap(REGIONS[n])).join(", ")} ]; ` +
      `return '<div style="display:flex;flex-direction:column;gap:12px">' + parts.join('') + '</div>'; ]]]`,
  );

const card = () => ({
  type: "custom:button-card",
  entity: "sensor.home_dashboard_state",
  show_name: false,
  show_state: false,
  show_icon: false,
  show_label: false,
  tap_action: { action: "none" },
  hold_action: { action: "none" },
  double_tap_action: { action: "none" },
  custom_fields: { c: combinedTemplate() },
  styles: {
    card: [{ background: "transparent" }, { border: "none" }, { "box-shadow": "none" }, { padding: "0" }, { cursor: "default" }],
    grid: [{ "grid-template-areas": '"c"' }, { "grid-template-columns": "1fr" }],
    custom_fields: { c: [{ width: "100%" }] },
  },
});

export function buildDashboard() {
  return {
    title: "Home Test",
    views: [
      {
        title: "Home",
        path: "home",
        type: "sections",
        max_columns: 1,
        background: "#0b0d10",
        sections: [{ type: "grid", cards: [card()] }],
      },
    ],
  };
}

export const helpersJs = HELPERS;

if (process.argv[1]?.endsWith("build.ts")) {
  writeFileSync(new URL("./home_test_dashboard.json", import.meta.url), JSON.stringify(buildDashboard(), null, 1));
  console.log("wrote ha-dashboard/home_test_dashboard.json");
}
