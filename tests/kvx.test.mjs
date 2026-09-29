// Сверка модуля расчёта с ответами сайта МАГАТЭ kvx-rays.iaea.org.
// Запуск: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCalculator, pchip } from "../src/kvx.js";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const calc = createCalculator(load("../data/andreo2019.json"), load("../data/nist_attenuation.json"));
const { points } = load("./control_points.json");

// Допуски: в узлах таблиц — точное совпадение до 4-го знака; иначе — 0,0005 (0,05 %),
// что в 6–12 раз меньше заявленной неопределённости данных (0,3–0,6 %).
const TOL = { node: 0.00005, kg: 0.0005, between: 0.0005, outside: 0.0005 };
const near = (got, want, tol, label) =>
  assert.ok(Math.abs(got - want) <= tol + 1e-12, `${label}: получено ${got}, сайт ${want}, допуск ${tol}`);

for (const p of points) {
  test(`${p.id} ${p.calculator} (${p.group})`, () => {
    const tol = TOL[p.group], s = p.site;
    switch (p.calculator) {
      case "BmuenAl": {
        const b = calc.bw(p.kV, p.hvl, p.ssd, p.f), m = calc.muenFIA(p.hvl, "Al");
        near(b.value, s.Bw, tol, "Bw");
        near(m.value, s.muFIA, 0.00005, "μen FIA");
        near(Math.round(b.raw * m.raw * 1e4) / 1e4, s.prod, tol + 0.0001, "Bw×μen");
        break;
      }
      case "muen2Cu":
        near(calc.muenZ2(p.kV, p.hvl, p.ssd, p.f).value, s.muz2, tol, "μen z=2");
        break;
      case "BmuenCu":
        // Bw для HVL в мм Cu в опубликованных таблицах нет — проверяем только μen FIA
        near(calc.muenFIA(p.hvl, "Cu").value, s.muFIA, 0.00005, "μen FIA (Cu)");
        break;
      case "kgBwAl": {
        const k = calc.kgBw(p.kV, p.hvl, p.ref, p.clin);
        near(k.ref, s.ref, tol, "Bw опорн."); near(k.clin, s.clin, tol, "Bw клин."); near(k.value, s.kg, tol, "k_Q,g");
        break;
      }
      case "kgmuen2Cu": {
        const k = calc.kgMuenZ2(p.kV, p.hvl, p.ref, p.clin);
        near(k.ref, s.ref, tol, "μen опорн."); near(k.clin, s.clin, tol, "μen клин."); near(k.value, s.kg, tol, "k_Q,g");
        break;
      }
      default: throw new Error(p.calculator);
    }
  });
}

test("k_Q,g: перестановка опорных и клинических условий даёт обратное число", () => {
  const a = calc.kgBw(50, 1, { ssd: 30, f: 3 }, { ssd: 30, f: 10 });
  const b = calc.kgBw(50, 1, { ssd: 30, f: 10 }, { ssd: 30, f: 3 });
  near(a.value * b.value, 1, 0.0001, "произведение");
});

test("k_Q,g = 1 при совпадающих условиях", () => {
  assert.equal(calc.kgMuenZ2(185, 2.8, { ssd: 55, f: 15 }, { ssd: 55, f: 15 }).value, 1);
});

test("PCHIP проходит через узлы и сохраняет монотонность", () => {
  const xs = [0, 1, 2, 3, 4], ys = [0, 0.1, 0.9, 1, 1];
  xs.forEach((x, i) => assert.equal(pchip(xs, ys, x), ys[i]));
  for (let x = 0; x < 4; x += 0.05) assert.ok(pchip(xs, ys, x + 0.05) >= pchip(xs, ys, x) - 1e-12);
});

test("Предупреждение о физически недостижимом HVL", () => {
  // 100 кВ: HVL моноэнергетических фотонов 100 кэВ в меди ≈ 1,69 мм
  assert.ok(Math.abs(calc.hvlMax(100, "Cu") - 1.69) < 0.02);
  assert.ok(calc.muenZ2(100, 5, 50, 30).warnings.some((w) => w.code === "hvl_unphysical"));
  assert.ok(!calc.muenZ2(180, 2.5, 55, 15).warnings.some((w) => w.code === "hvl_unphysical"));
  // все контрольные точки сайта — физически реализуемые
  for (const p of points.filter((q) => q.calculator === "BmuenAl"))
    assert.ok(p.hvl <= calc.hvlMax(p.kV, "Al"), p.id);
});

test("Предупреждение об экстраполяции", () => {
  assert.ok(calc.bw(150, 8, 50, 10).warnings.some((w) => w.code === "kv_extrap"));
  assert.ok(calc.muenZ2(70, 0.1, 50, 10).warnings.some((w) => w.code === "kv_extrap"));
  assert.equal(calc.bw(50, 1, 30, 10).warnings.length, 0);
});
