import { createCalculator } from "../src/kvx.js";
import { I18N, LANGS } from "./i18n.js";

// Данные: в собранной версии (docs/index.html) они встроены в страницу как KVX_DATA,
// при разработке подгружаются из папки data/.
async function loadData() {
  if (globalThis.KVX_DATA) return globalThis.KVX_DATA;
  const get = (p) => fetch(p).then((r) => r.json());
  const [tables, nist] = await Promise.all([get("../data/andreo_webapp.json"), get("../data/nist_attenuation.json")]);
  return { tables, nist };
}

// ---------- язык ----------

let lang = "ru";
let T = I18N.ru;
const fmt = (v, d = 4) => v.toFixed(d).replace(".", T.decimal);
const digits = (f) => (f.step >= 1 ? 0 : f.step >= 0.1 ? 1 : 2);

function initialLang(fromHash) {
  if (LANGS.includes(fromHash)) return fromHash;
  try {
    const saved = localStorage.getItem("kvx-lang");
    if (LANGS.includes(saved)) return saved;
  } catch { /* хранилище недоступно */ }
  return (navigator.language || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function setLang(l) {
  lang = l; T = I18N[l];
  try { localStorage.setItem("kvx-lang", l); } catch { /* хранилище недоступно */ }
  document.documentElement.lang = T.htmlLang;
  document.title = T.htmlTitle;
  const get = (path) => path.split(".").reduce((o, k) => o?.[k], T);
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.innerHTML = get(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", get(el.dataset.i18nAria)));
  document.querySelectorAll(".lang-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === l)));
}

// ---------- описание расчётов ----------

const F = {
  kV: (min, max, def) => ({ key: "kV", label: "kV", unit: "kV", min, max, step: 1, def }),
  hvl: (mat, max, def) => ({ key: "hvl", label: "hvl", unit: "mm", mat, min: 0.01, max, step: 0.01, def }),
  ssd: (key = "ssd", label = "ssd") => ({ key, label, unit: "cm", min: 10, max: 100, step: 1, def: key === "ssd0" ? 30 : 55 }),
  f: (key = "f", label = "f") => ({ key, label, unit: "cm", min: 1, max: 30, step: 0.5, def: key === "f0" ? 3 : 15 }),
};
const unitOf = (f) => T.units[f.unit] + (f.mat ? ` ${f.mat}` : "");
const pct = (v) => `${fmt(v, 1)} %`;
const GEOM_FIELDS = (kvMin, kvMax, kvDef, mat, hvlMax, hvlDef) => [
  F.kV(kvMin, kvMax, kvDef), F.hvl(mat, hvlMax, hvlDef),
  F.ssd("ssd0", "ssd0"), F.f("f0", "f0"), F.ssd("ssd", "ssdClin"), F.f("f", "fClin"),
];
const GEOM_GROUPS = [[0, 1, "quality"], [2, 3, "lab"], [4, 5, "clin"]];

const CALCS = {
  BmuenAl: {
    fields: [F.kV(10, 150, 75), F.hvl("Al", 10, 5), F.ssd(), F.f()],
    run(c, p, t) {
      const b = c.bw(p.kV, p.hvl, p.ssd, p.f), m = c.muenFIA(p.hvl, "Al");
      return {
        main: { sym: "B<sub>w</sub> · [μ<sub>en</sub>/ρ]<sup>FIA</sup><sub>w,air</sub>", value: Math.round(b.raw * m.raw * 1e4) / 1e4, name: t.main },
        rows: [
          { sym: `B<sub>w</sub>(Q, f, ${T.sym.ssd})`, value: b.value, unc: pct(0.6), name: t.bw },
          { sym: "[μ<sub>en</sub>(Q)/ρ]<sup>FIA</sup><sub>w,air</sub>", value: m.value, name: t.mu },
        ],
        formula: "D<sub>w,Q</sub><sup>surface</sup> = K<sup>FIA</sup><sub>air,Q</sub> · B<sub>w</sub> · [μ<sub>en</sub>/ρ]<sup>FIA</sup><sub>w,air</sub>",
        eq: T.eq(50),
        warnings: [...b.warnings, ...m.warnings],
      };
    },
  },
  muen2Cu: {
    fields: [F.kV(70, 300, 180), F.hvl("Cu", 5.5, 2.5), F.ssd(), F.f()],
    run(c, p, t) {
      const m = c.muenZ2(p.kV, p.hvl, p.ssd, p.f);
      return {
        main: { sym: `[μ<sub>en</sub>(Q, f, ${T.sym.ssd})/ρ]<sup>z=2</sup><sub>w,air</sub>`, value: m.value, unc: pct(0.3), name: t.main },
        rows: [],
        formula: "D<sub>w,Q</sub><sup>z=2</sup> = M<sup>z=2</sup><sub>Q</sub> · N<sup>FIA</sup><sub>K,air,Q<sub>o</sub></sub> · k<sup>FIA</sup><sub>Q,Q<sub>o</sub></sub> · [μ<sub>en</sub>/ρ]<sup>z=2</sup><sub>w,air</sub> · p<sub>ch,Q</sub>",
        eq: T.eq(57),
        warnings: m.warnings,
      };
    },
  },
  BmuenCu: {
    fields: [F.kV(70, 300, 185), F.hvl("Cu", 5.5, 2.8), F.ssd(), F.f()],
    run(c, p, t) {
      const b = c.bwCu(p.kV, p.hvl, p.ssd, p.f), m = c.muenFIA(p.hvl, "Cu");
      return {
        main: { sym: "B<sub>w</sub> · [μ<sub>en</sub>/ρ]<sup>FIA</sup><sub>w,air</sub>", value: Math.round(b.raw * m.raw * 1e4) / 1e4, name: t.main },
        rows: [
          { sym: `B<sub>w</sub>(Q, f, ${T.sym.ssd})`, value: b.value, unc: pct(0.6), name: t.bw },
          { sym: "[μ<sub>en</sub>(Q)/ρ]<sup>FIA</sup><sub>w,air</sub>", value: m.value, name: t.mu },
        ],
        missing: t.missing,
        formula: "D<sub>w,Q</sub><sup>surface</sup> = K<sup>FIA</sup><sub>air,Q</sub> · B<sub>w</sub> · [μ<sub>en</sub>/ρ]<sup>FIA</sup><sub>w,air</sub>",
        eq: T.eqAnalog(50),
        warnings: [...b.warnings, ...m.warnings],
      };
    },
  },
  kgBwAl: {
    fields: GEOM_FIELDS(10, 150, 75, "Al", 10, 5),
    groups: GEOM_GROUPS,
    run(c, p, t) {
      const k = c.kgBw(p.kV, p.hvl, { ssd: p.ssd0, f: p.f0 }, { ssd: p.ssd, f: p.f });
      const s = T.sym;
      return {
        main: { sym: `B<sub>w</sub>(${s.clin}) / B<sub>w</sub>(${s.lab})`, value: k.value, name: t.main },
        rows: [
          { sym: `B<sub>w</sub>(Q, f, ${s.ssd})<sub>${s.lab}</sub>`, value: k.ref, unc: pct(0.6), name: t.ref },
          { sym: `B<sub>w</sub>(Q, f, ${s.ssd})<sub>${s.clin}</sub>`, value: k.clin, unc: pct(0.6), name: t.clin },
        ],
        note: t.note,
        formula: "D<sub>w,Q</sub><sup>surface</sup> = M<sup>PMMA</sup><sub>Q</sub> · N<sup>PMMA</sup><sub>D,w,Q<sub>o</sub></sub> · k<sup>PMMA</sup><sub>Q,Q<sub>o</sub></sub> · k<sup>PMMA</sup><sub>Q,g</sub>",
        eq: T.eq(52),
        warnings: k.warnings,
      };
    },
  },
  kgmuen2Cu: {
    fields: GEOM_FIELDS(70, 300, 185, "Cu", 5.5, 2.8),
    groups: GEOM_GROUPS,
    run(c, p, t) {
      const k = c.kgMuenZ2(p.kV, p.hvl, { ssd: p.ssd0, f: p.f0 }, { ssd: p.ssd, f: p.f });
      const s = T.sym;
      return {
        main: { sym: `[μ<sub>en</sub>/ρ]<sup>z=2</sup>(${s.clin}) / [μ<sub>en</sub>/ρ]<sup>z=2</sup>(${s.lab})`, value: k.value, name: t.main },
        rows: [
          { sym: `[μ<sub>en</sub>/ρ]<sup>z=2</sup><sub>w,air, ${s.lab}</sub>`, value: k.ref, unc: pct(0.3), name: t.ref },
          { sym: `[μ<sub>en</sub>/ρ]<sup>z=2</sup><sub>w,air, ${s.clin}</sub>`, value: k.clin, unc: pct(0.3), name: t.clin },
        ],
        note: t.note,
        formula: "D<sub>w,Q</sub><sup>z=2</sup> = M<sup>z=2</sup><sub>Q</sub> · N<sup>z=2</sup><sub>D,w,Q<sub>o</sub></sub> · k<sup>z=2</sup><sub>Q,Q<sub>o</sub></sub> · k<sup>z=2</sup><sub>Q,g</sub>",
        eq: T.eq(58),
        warnings: k.warnings,
      };
    },
  },
};

// ---------- состояние и адрес страницы ----------

let calc, current = "BmuenAl";
const params = {};

function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (CALCS[h.get("calc")]) current = h.get("calc");
  const out = {};
  for (const [k, v] of h) if (k !== "calc" && k !== "lang" && !Number.isNaN(parseFloat(v))) out[k] = parseFloat(v);
  return { values: out, lang: h.get("lang") };
}
function writeHash() {
  const h = new URLSearchParams({ lang, calc: current });
  for (const f of CALCS[current].fields) h.set(f.key, params[current][f.key]);
  history.replaceState(null, "", "#" + h.toString());
}

// ---------- ввод ----------

const tpl = document.getElementById("tpl-field");
const form = document.getElementById("inputs");
const out = document.getElementById("result");

function buildForm() {
  const cfg = CALCS[current], t = T.calcs[current];
  form.innerHTML = "";
  const head = document.createElement("div");
  head.className = "calc-head";
  head.innerHTML = `<p class="calc-method">${t.method}</p><h2 class="calc-title">${t.title}</h2>`;
  form.append(head);
  const groups = cfg.groups || [[0, cfg.fields.length - 1, null]];
  for (const [a, b, name] of groups) {
    const fs = document.createElement("fieldset");
    if (name) fs.innerHTML = `<legend>${T.groups[name]}</legend>`;
    for (const f of cfg.fields.slice(a, b + 1)) fs.append(fieldEl(f));
    form.append(fs);
  }
}

const rangeText = (f) => `${fmt(f.min, digits(f))}–${fmt(f.max, digits(f))} ${unitOf(f)}`;

function fieldEl(f) {
  const el = tpl.content.firstElementChild.cloneNode(true);
  const id = `in-${f.key}`;
  const [lab, num, unit, range, hint] = ["label", ".num", ".unit", ".range", ".field-hint"].map((s) => el.querySelector(s));
  lab.textContent = T.fields[f.label]; lab.htmlFor = id;
  num.id = id;
  for (const x of [num, range]) Object.assign(x, { min: f.min, max: f.max, step: f.step });
  unit.textContent = unitOf(f);
  hint.id = `${id}-hint`;
  hint.textContent = rangeText(f);
  num.setAttribute("aria-describedby", hint.id);
  const v = params[current][f.key];
  num.value = v; range.value = v;
  num.addEventListener("input", () => {
    const x = parseFloat(num.value.replace(",", "."));
    if (Number.isNaN(x)) return;
    const inRange = x >= f.min && x <= f.max;
    el.classList.toggle("invalid", !inRange);
    if (!inRange) { out.innerHTML = `<p class="msg error">${T.ui.invalid(T.fields[f.label], rangeText(f))}</p>`; return; }
    range.value = x; params[current][f.key] = x; update();
  });
  range.addEventListener("input", () => {
    const x = parseFloat(range.value);
    num.value = x; el.classList.remove("invalid");
    params[current][f.key] = x; update();
  });
  return el;
}

// ---------- вывод ----------

const warnText = (w) => T.warn[w.code](w.params, fmt);

function update() {
  const cfg = CALCS[current], p = params[current];
  const r = cfg.run(calc, p, T.calcs[current]);
  const bad = r.warnings.some((w) => w.level === "error");
  const rows = r.rows.map((x) => `
      <div class="row">
        <dt><span class="sym">${x.sym}</span><span class="nm">${x.name}</span></dt>
        <dd>${fmt(x.value)}${x.unc ? `<span class="unc">±${x.unc}</span>` : ""}</dd>
      </div>`).join("");
  out.innerHTML = `
    <div class="readout${bad ? " is-bad" : ""}">
      <p class="readout-name">${r.main.name}</p>
      <p class="readout-value">${fmt(r.main.value)}</p>
      <p class="readout-sym">${r.main.sym}${r.main.unc ? ` <span class="unc">±${r.main.unc} (${T.ui.k1})</span>` : ""}</p>
    </div>
    ${r.warnings.map((w) => `<p class="msg ${w.level}">${warnText(w)}</p>`).join("")}
    ${r.missing ? `<p class="msg warn">${r.missing}</p>` : ""}
    ${rows ? `<dl class="rows">${rows}</dl>` : ""}
    <div class="formula"><p>${r.formula}</p><p class="eq">${r.eq}</p></div>
    ${r.note ? `<p class="note">${r.note}</p>` : ""}
    <div class="actions">
      <button type="button" id="copy">${T.ui.copy}</button>
      <span id="copied" role="status"></span>
    </div>`;
  document.getElementById("copy").addEventListener("click", () => copyText(cfg, p, r));
  writeHash();
}

function plain(html) {
  const d = document.createElement("div");
  d.innerHTML = html.replace(/<sub>/g, "_").replace(/<sup>/g, "^");
  return d.textContent;
}

function copyText(cfg, p, r) {
  const t = T.calcs[current];
  const par = cfg.fields.map((f) => `${T.fields[f.label]}: ${fmt(p[f.key], digits(f))} ${unitOf(f)}`).join("; ");
  const lines = [
    `${t.title}. ${t.method}.`,
    par + ".",
    `${plain(r.main.name)}: ${plain(r.main.sym)} = ${fmt(r.main.value)}`,
    ...r.rows.map((x) => `${plain(x.name)}: ${plain(x.sym)} = ${fmt(x.value)}`),
    ...r.warnings.map((w) => `${T.ui.attention}: ${warnText(w)}`),
    T.copyFooter,
  ];
  const text = lines.join("\n");
  const done = () => { document.getElementById("copied").textContent = T.ui.copied; };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const t = document.createElement("textarea");
  t.value = text; document.body.append(t); t.select();
  try { document.execCommand("copy"); done(); } catch { /* ignore */ }
  t.remove();
}

// ---------- переключение расчётов и языка ----------

function select(name) {
  current = name;
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.calc === name)));
  buildForm(); update();
}

async function main() {
  const fromHash = readHash();
  setLang(initialLang(fromHash.lang));
  const { tables, nist } = await loadData();
  calc = createCalculator(tables, nist);
  for (const [name, cfg] of Object.entries(CALCS)) {
    params[name] = {};
    for (const f of cfg.fields) params[name][f.key] = f.def;
  }
  for (const f of CALCS[current].fields) {
    const v = fromHash.values[f.key];
    if (v >= f.min && v <= f.max) params[current][f.key] = v;
  }
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => select(b.dataset.calc)));
  document.querySelectorAll(".lang-btn").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.lang === lang) return;
    setLang(b.dataset.lang); select(current);
  }));
  select(current);
}

main().catch((e) => {
  out.innerHTML = `<p class="msg error">${T.ui.loadError(e.message)}</p>`;
});
