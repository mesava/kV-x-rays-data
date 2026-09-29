import { createCalculator } from "../src/kvx.js";

// Данные: в собранной версии (docs/index.html) они встроены в страницу как KVX_DATA,
// при разработке подгружаются из папки data/.
async function loadData() {
  if (globalThis.KVX_DATA) return globalThis.KVX_DATA;
  const get = (p) => fetch(p).then((r) => r.json());
  const [tables, nist] = await Promise.all([get("../data/andreo2019.json"), get("../data/nist_attenuation.json")]);
  return { tables, nist };
}

const fmt = (v, d = 4) => v.toFixed(d).replace(".", ",");

const F = {
  kV: (min, max, def) => ({ key: "kV", label: "Напряжение на трубке", unit: "кВ", min, max, step: 1, def }),
  hvl: (mat, max, def) => ({ key: "hvl", label: "Первый СПО (HVL)", unit: `мм ${mat}`, min: 0.01, max, step: 0.01, def, mat }),
  ssd: (key = "ssd", label = "РИП") => ({ key, label, unit: "см", min: 10, max: 100, step: 1, def: key === "ssd0" ? 30 : 55 }),
  f: (key = "f", label = "Диаметр поля") => ({ key, label, unit: "см", min: 1, max: 30, step: 0.5, def: key === "f0" ? 3 : 15 }),
};

const CALCS = {
  BmuenAl: {
    title: "Низкие энергии, воздушный метод",
    method: "Камера откалибрована по воздушной керме в свободном воздухе",
    fields: [F.kV(10, 150, 75), F.hvl("Al", 10, 5), F.ssd(), F.f()],
    run(c, p) {
      const b = c.bw(p.kV, p.hvl, p.ssd, p.f), m = c.muenFIA(p.hvl, "Al");
      return {
        main: { sym: "B<sub>w</sub> · [μ<sub>en</sub>/ρ]<sup>FIA</sup><sub>w,air</sub>", value: Math.round(b.raw * m.raw * 1e4) / 1e4, name: "Произведение" },
        rows: [
          { sym: "B<sub>w</sub>(Q, f, РИП)", value: b.value, unc: "0,6 %", name: "Фактор обратного рассеяния в воде" },
          { sym: "[μ<sub>en</sub>(Q)/ρ]<sup>FIA</sup><sub>w,air</sub>", value: m.value, name: "Отношение вода/воздух в свободном воздухе" },
        ],
        formula: "D<sub>w,Q</sub><sup>surface</sup> = K<sup>FIA</sup><sub>air,Q</sub> · B<sub>w</sub> · [μ<sub>en</sub>/ρ]<sup>FIA</sup><sub>w,air</sub>",
        eq: "TRS-398 Rev.1, ур. (50)",
        warnings: [...b.warnings, ...m.warnings],
      };
    },
  },
  muen2Cu: {
    title: "Средние энергии, глубина 2 см в воде",
    method: "Камера откалибрована по воздушной керме в свободном воздухе",
    fields: [F.kV(70, 300, 180), F.hvl("Cu", 5.5, 2.5), F.ssd(), F.f()],
    run(c, p) {
      const m = c.muenZ2(p.kV, p.hvl, p.ssd, p.f);
      return {
        main: { sym: "[μ<sub>en</sub>(Q, f, РИП)/ρ]<sup>z=2</sup><sub>w,air</sub>", value: m.value, unc: "0,3 %", name: "Отношение вода/воздух на глубине 2 см" },
        rows: [],
        formula: "D<sub>w,Q</sub><sup>z=2</sup> = M<sup>z=2</sup><sub>Q</sub> · N<sup>FIA</sup><sub>K,air,Q<sub>o</sub></sub> · k<sup>FIA</sup><sub>Q,Q<sub>o</sub></sub> · [μ<sub>en</sub>/ρ]<sup>z=2</sup><sub>w,air</sub> · p<sub>ch,Q</sub>",
        eq: "TRS-398 Rev.1, ур. (57)",
        warnings: m.warnings,
      };
    },
  },
  BmuenCu: {
    title: "Средние энергии, воздушный метод",
    method: "Камера откалибрована по воздушной керме в свободном воздухе",
    fields: [F.kV(70, 300, 185), F.hvl("Cu", 5.5, 2.8), F.ssd(), F.f()],
    run(c, p) {
      const m = c.muenFIA(p.hvl, "Cu");
      const w = [...m.warnings];
      const hm = c.hvlMax(p.kV, "Cu");
      if (p.hvl > hm) w.push({ level: "error", text: `СПО = ${fmt(p.hvl, 2)} мм Cu физически недостижим при ${p.kV} кВ (предел ≈ ${fmt(hm, 2)} мм Cu).` });
      return {
        main: { sym: "[μ<sub>en</sub>(Q)/ρ]<sup>FIA</sup><sub>w,air</sub>", value: m.value, name: "Отношение вода/воздух в свободном воздухе, СПО в мм Cu" },
        rows: [],
        missing: "Фактор обратного рассеяния B<sub>w</sub> для СПО в мм Cu в опубликованных таблицах Andreo отсутствует, поэтому здесь не рассчитывается. Его даёт только приложение МАГАТЭ (раздел BmuenCu). TRS-398 не рекомендует измерять пучки средних энергий в воздухе.",
        formula: "D<sub>w,Q</sub><sup>surface</sup> = K<sup>FIA</sup><sub>air,Q</sub> · B<sub>w</sub> · [μ<sub>en</sub>/ρ]<sup>FIA</sup><sub>w,air</sub>",
        eq: "по аналогии с ур. (50)",
        warnings: w,
      };
    },
  },
  kgBwAl: {
    title: "Низкие энергии, поправка на геометрию",
    method: "Камера откалибрована по поглощённой дозе в воде на поверхности фантома из ПММА",
    fields: [F.kV(10, 150, 75), F.hvl("Al", 10, 5), F.ssd("ssd0", "РИП в лаборатории"), F.f("f0", "Поле в лаборатории"), F.ssd("ssd", "РИП в клинике"), F.f("f", "Поле в клинике")],
    groups: [[0, 1, "Качество пучка"], [2, 3, "Условия калибровки (лаборатория)"], [4, 5, "Клинические условия"]],
    run(c, p) {
      const k = c.kgBw(p.kV, p.hvl, { ssd: p.ssd0, f: p.f0 }, { ssd: p.ssd, f: p.f });
      return {
        main: { sym: "B<sub>w</sub>(клин.) / B<sub>w</sub>(лаб.)", value: k.value, name: "B<sub>w</sub>-составляющая k<sup>PMMA</sup><sub>Q,g</sub>" },
        rows: [
          { sym: "B<sub>w</sub>(Q, f, РИП)<sub>лаб</sub>", value: k.ref, unc: "0,6 %", name: "В условиях калибровки" },
          { sym: "B<sub>w</sub>(Q, f, РИП)<sub>клин</sub>", value: k.clin, unc: "0,6 %", name: "В клинических условиях" },
        ],
        note: "Полный k<sup>PMMA</sup><sub>Q,g</sub> = [N<sup>PMMA</sup><sub>K,air</sub>(клин)/N<sup>PMMA</sup><sub>K,air</sub>(лаб)] · [B<sub>w</sub>(клин)/B<sub>w</sub>(лаб)] · [p<sub>ch</sub>(клин)/p<sub>ch</sub>(лаб)] (прил. I, ур. 85). Здесь рассчитан только средний множитель — он не зависит от камеры. Остальные даёт поверочная лаборатория; для PTW 23342 и 23344 см. таблицы 28 и 29 TRS-398 Rev.1.",
        formula: "D<sub>w,Q</sub><sup>surface</sup> = M<sup>PMMA</sup><sub>Q</sub> · N<sup>PMMA</sup><sub>D,w,Q<sub>o</sub></sub> · k<sup>PMMA</sup><sub>Q,Q<sub>o</sub></sub> · k<sup>PMMA</sup><sub>Q,g</sub>",
        eq: "TRS-398 Rev.1, ур. (52)",
        warnings: k.warnings,
      };
    },
  },
  kgmuen2Cu: {
    title: "Средние энергии, поправка на геометрию",
    method: "Камера откалибрована по поглощённой дозе в воде на глубине 2 см",
    fields: [F.kV(70, 300, 185), F.hvl("Cu", 5.5, 2.8), F.ssd("ssd0", "РИП в лаборатории"), F.f("f0", "Поле в лаборатории"), F.ssd("ssd", "РИП в клинике"), F.f("f", "Поле в клинике")],
    groups: [[0, 1, "Качество пучка"], [2, 3, "Условия калибровки (лаборатория)"], [4, 5, "Клинические условия"]],
    run(c, p) {
      const k = c.kgMuenZ2(p.kV, p.hvl, { ssd: p.ssd0, f: p.f0 }, { ssd: p.ssd, f: p.f });
      return {
        main: { sym: "[μ<sub>en</sub>/ρ]<sup>z=2</sup>(клин.) / [μ<sub>en</sub>/ρ]<sup>z=2</sup>(лаб.)", value: k.value, name: "μ<sub>en</sub>-составляющая k<sup>z=2</sup><sub>Q,g</sub>" },
        rows: [
          { sym: "[μ<sub>en</sub>/ρ]<sup>z=2</sup><sub>w,air, лаб</sub>", value: k.ref, unc: "0,3 %", name: "В условиях калибровки" },
          { sym: "[μ<sub>en</sub>/ρ]<sup>z=2</sup><sub>w,air, клин</sub>", value: k.clin, unc: "0,3 %", name: "В клинических условиях" },
        ],
        note: "Полный k<sup>z=2</sup><sub>Q,g</sub> включает ещё отношения N<sup>FIA</sup><sub>K,air</sub> и p<sub>ch</sub> для конкретной камеры (прил. I, ур. 90); при близких геометриях их обычно принимают равными 1. Неопределённость рассчитанного множителя — около 0,2 %.",
        formula: "D<sub>w,Q</sub><sup>z=2</sup> = M<sup>z=2</sup><sub>Q</sub> · N<sup>z=2</sup><sub>D,w,Q<sub>o</sub></sub> · k<sup>z=2</sup><sub>Q,Q<sub>o</sub></sub> · k<sup>z=2</sup><sub>Q,g</sub>",
        eq: "TRS-398 Rev.1, ур. (58)",
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
  for (const [k, v] of h) if (k !== "calc" && !Number.isNaN(parseFloat(v))) out[k] = parseFloat(v);
  return out;
}
function writeHash() {
  const h = new URLSearchParams({ calc: current });
  for (const f of CALCS[current].fields) h.set(f.key, params[current][f.key]);
  history.replaceState(null, "", "#" + h.toString());
}

// ---------- ввод ----------

const tpl = document.getElementById("tpl-field");
const form = document.getElementById("inputs");
const out = document.getElementById("result");

function buildForm() {
  const cfg = CALCS[current];
  form.innerHTML = "";
  const head = document.createElement("div");
  head.className = "calc-head";
  head.innerHTML = `<p class="calc-method">${cfg.method}</p><h2 class="calc-title">${cfg.title}</h2>`;
  form.append(head);
  const groups = cfg.groups || [[0, cfg.fields.length - 1, null]];
  for (const [a, b, name] of groups) {
    const fs = document.createElement("fieldset");
    if (name) fs.innerHTML = `<legend>${name}</legend>`;
    for (const f of cfg.fields.slice(a, b + 1)) fs.append(fieldEl(f));
    form.append(fs);
  }
}

function fieldEl(f) {
  const el = tpl.content.firstElementChild.cloneNode(true);
  const id = `in-${f.key}`;
  const [lab, num, unit, range, hint] = ["label", ".num", ".unit", ".range", ".field-hint"].map((s) => el.querySelector(s));
  lab.textContent = f.label; lab.htmlFor = id;
  num.id = id;
  for (const x of [num, range]) Object.assign(x, { min: f.min, max: f.max, step: f.step });
  unit.textContent = f.unit;
  hint.id = `${id}-hint`;
  hint.textContent = `${fmt(f.min, f.step < 1 ? 2 : 0)}–${fmt(f.max, f.step < 1 ? 2 : 0)} ${f.unit}`;
  num.setAttribute("aria-describedby", hint.id);
  const v = params[current][f.key];
  num.value = v; range.value = v;
  num.addEventListener("input", () => {
    const x = parseFloat(num.value.replace(",", "."));
    if (Number.isNaN(x)) return;
    const inRange = x >= f.min && x <= f.max;
    el.classList.toggle("invalid", !inRange);
    if (!inRange) { renderInvalid(f); return; }
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

function renderInvalid(f) {
  out.innerHTML = `<p class="msg error">Значение «${f.label}» должно быть в пределах ${fmt(f.min, f.step < 1 ? 2 : 0)}–${fmt(f.max, f.step < 1 ? 2 : 0)} ${f.unit}.</p>`;
}

function update() {
  const cfg = CALCS[current], p = params[current];
  const r = cfg.run(calc, p);
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
      <p class="readout-sym">${r.main.sym}${r.main.unc ? ` <span class="unc">±${r.main.unc} (k = 1)</span>` : ""}</p>
    </div>
    ${r.warnings.map((w) => `<p class="msg ${w.level}">${w.text.replace(/(\d)\.(\d)/g, "$1,$2")}</p>`).join("")}
    ${r.missing ? `<p class="msg warn">${r.missing}</p>` : ""}
    ${rows ? `<dl class="rows">${rows}</dl>` : ""}
    <div class="formula"><p>${r.formula}</p><p class="eq">${r.eq}</p></div>
    ${r.note ? `<p class="note">${r.note}</p>` : ""}
    <div class="actions">
      <button type="button" id="copy">Скопировать для протокола</button>
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
  const par = cfg.fields.map((f) => `${f.label}: ${fmt(p[f.key], f.step < 1 ? 2 : 0)} ${f.unit}`).join("; ");
  const lines = [
    `${cfg.title}. ${cfg.method}.`,
    par + ".",
    `${plain(r.main.name)}: ${plain(r.main.sym)} = ${fmt(r.main.value)}`,
    ...r.rows.map((x) => `${plain(x.name)}: ${plain(x.sym)} = ${fmt(x.value)}`),
    ...r.warnings.map((w) => "Внимание: " + w.text),
    "Данные: P. Andreo, Phys. Med. Biol. 64 (2019) 205019; расчёт по TRS-398 Rev.1.",
  ];
  const text = lines.join("\n");
  const done = () => { document.getElementById("copied").textContent = "Скопировано"; };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
  else fallbackCopy(text, done);
}
function fallbackCopy(text, done) {
  const t = document.createElement("textarea");
  t.value = text; document.body.append(t); t.select();
  try { document.execCommand("copy"); done(); } catch { /* ignore */ }
  t.remove();
}

// ---------- переключение расчётов ----------

function select(name) {
  current = name;
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.calc === name)));
  buildForm(); update();
}

async function main() {
  const { tables, nist } = await loadData();
  calc = createCalculator(tables, nist);
  const fromHash = readHash();
  for (const [name, cfg] of Object.entries(CALCS)) {
    params[name] = {};
    for (const f of cfg.fields) params[name][f.key] = f.def;
  }
  for (const f of CALCS[current].fields)
    if (fromHash[f.key] >= f.min && fromHash[f.key] <= f.max) params[current][f.key] = fromHash[f.key];
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => select(b.dataset.calc)));
  select(current);
}

main().catch((e) => {
  out.innerHTML = `<p class="msg error">Не удалось загрузить данные: ${e.message}. Откройте собранный файл docs/index.html или запустите локальный сервер (см. README).</p>`;
});
