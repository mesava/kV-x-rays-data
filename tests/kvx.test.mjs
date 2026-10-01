// Сверка модуля расчёта с ответами сайта МАГАТЭ kvx-rays.iaea.org.
// Требуется точное совпадение до 4-го знака во всех контрольных точках.
// Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCalculator, quadInterp } from "../src/kvx.js";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const calc = createCalculator(load("../data/andreo_webapp.json"), load("../data/nist_attenuation.json"));
const { points } = load("./control_points.json");
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const same = (got, want, label, id) => assert.equal(r4(got), want, `${id} ${label}: получено ${r4(got)}, сайт МАГАТЭ ${want}`);

for (const p of points) {
  test(`${p.id} ${p.calculator} (${p.group})`, () => {
    const s = p.site;
    switch (p.calculator) {
      case "BmuenAl":
      case "BmuenCu": {
        const mat = p.calculator === "BmuenAl" ? "Al" : "Cu";
        const m = calc.muenFIA(p.hvl, mat);
        if ("muFIA" in s) same(m.raw, s.muFIA, "μen FIA", p.id);
        if ("Bw" in s) {
          const b = (mat === "Al" ? calc.bw : calc.bwCu)(p.kV, p.hvl, p.ssd, p.f);
          same(b.raw, s.Bw, "B_w", p.id);
          same(b.raw * m.raw, s.prod, "B_w × μen", p.id);
        }
        break;
      }
      case "muen2Cu":
        same(calc.muenZ2(p.kV, p.hvl, p.ssd, p.f).raw, s.muz2, "μen z=2", p.id);
        break;
      case "kgBwAl":
      case "kgmuen2Cu": {
        const k = (p.calculator === "kgBwAl" ? calc.kgBw : calc.kgMuenZ2)(p.kV, p.hvl, p.ref, p.clin);
        assert.equal(k.ref, s.ref, `${p.id} опорные`);
        assert.equal(k.clin, s.clin, `${p.id} клинические`);
        assert.equal(k.value, s.kg, `${p.id} k_Q,g`);
        break;
      }
      default: throw new Error(p.calculator);
    }
  });
}

test("k_Q,g: перестановка опорных и клинических условий даёт обратное число", () => {
  const a = calc.kgBw(50, 1, { ssd: 30, f: 3 }, { ssd: 30, f: 10 });
  const b = calc.kgBw(50, 1, { ssd: 30, f: 10 }, { ssd: 30, f: 3 });
  assert.ok(Math.abs(a.value * b.value - 1) < 2e-4);
});

test("k_Q,g = 1 при совпадающих условиях", () => {
  assert.equal(calc.kgMuenZ2(185, 2.8, { ssd: 55, f: 15 }, { ssd: 55, f: 15 }).value, 1);
});

test("Квадратичный сплайн: проходит через узлы и точно воспроизводит параболу", () => {
  const xs = [0, 1, 2.5, 3, 7, 10], par = (x) => 2 - 0.5 * x + 0.3 * x * x;
  xs.forEach((x) => assert.ok(Math.abs(quadInterp(xs, xs.map(par), x) - par(x)) < 1e-12));
  for (const x of [0.4, 1.7, 2.9, 5.5, 9.99]) assert.ok(Math.abs(quadInterp(xs, xs.map(par), x) - par(x)) < 1e-12);
});

test("Предупреждение о физически недостижимом СПО", () => {
  // 100 кВ: СПО моноэнергетических фотонов 100 кэВ в меди ≈ 1,69 мм
  assert.ok(Math.abs(calc.hvlMax(100, "Cu") - 1.69) < 0.02);
  assert.ok(calc.muenZ2(100, 5, 50, 30).warnings.some((w) => w.code === "hvl_unphysical"));
  assert.ok(calc.bwCu(100, 5, 50, 30).warnings.some((w) => w.code === "hvl_unphysical"));
  assert.ok(!calc.muenZ2(180, 2.5, 55, 15).warnings.some((w) => w.code === "hvl_unphysical"));
});

test("Во всём диапазоне интерфейса экстраполяции нет", () => {
  for (const [fn, kv, h] of [[calc.bw, [10, 150], [0.01, 10]], [calc.bwCu, [70, 300], [0.01, 5.5]], [calc.muenZ2, [70, 300], [0.01, 5.5]]])
    for (const k of kv) for (const hv of h) for (const s of [10, 100]) for (const f of [1, 30])
      assert.ok(!fn(k, hv, s, f).warnings.some((w) => w.code.endsWith("extrap")), `${k} ${hv} ${s} ${f}`);
});
