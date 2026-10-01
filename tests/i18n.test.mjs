// Полнота переводов: русский и английский должны содержать одни и те же строки,
// каждое предупреждение модуля расчёта — иметь текст на обоих языках,
// каждый ключ data-i18n из web/index.html — существовать.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { I18N, LANGS } from "../web/i18n.js";

function shape(o, prefix = "") {
  return Object.entries(o).flatMap(([k, v]) => {
    const path = prefix + k;
    if (v && typeof v === "object") return shape(v, path + ".");
    return [`${path}:${typeof v}`];
  }).sort();
}

test("Русский и английский содержат одинаковый набор строк", () => {
  assert.deepEqual(LANGS, Object.keys(I18N));
  assert.deepEqual(shape(I18N.en), shape(I18N.ru));
});

test("Нет пустых строк", () => {
  for (const l of LANGS)
    for (const entry of shape(I18N[l]))
      if (entry.endsWith(":string")) {
        const v = entry.split(":")[0].split(".").reduce((o, k) => o[k], I18N[l]);
        assert.ok(v.trim().length > 0, `${l}: ${entry}`);
      }
});

test("Каждый код предупреждения из src/kvx.js имеет текст на обоих языках", () => {
  const src = readFileSync(new URL("../src/kvx.js", import.meta.url), "utf8");
  const codes = [...new Set([...src.matchAll(/code: "([a-z0-9_]+)"/g)].map((m) => m[1]))];
  assert.ok(codes.length >= 5);
  const fmt = (v, d) => v.toFixed(d);
  const params = { kv: 100, hvl: 5, min: 0.02, max: 14, material: "Cu", limit: 1.69 };
  for (const l of LANGS)
    for (const c of codes) {
      assert.equal(typeof I18N[l].warn[c], "function", `${l}: нет текста для ${c}`);
      const t = I18N[l].warn[c](params, fmt);
      assert.ok(!t.includes("undefined") && !t.includes("NaN"), `${l}/${c}: ${t}`);
    }
});

test("Все ключи data-i18n в web/index.html существуют", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  const keys = [...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 10);
  for (const l of LANGS)
    for (const k of keys) {
      const v = k.split(".").reduce((o, x) => o?.[x], I18N[l]);
      assert.equal(typeof v, "string", `${l}: ${k}`);
    }
});

test("Ссылка на источник — в формате, согласованном с автором данных", () => {
  const cite = "P Andreo (2019) Data for the dosimetry of low- and medium-energy kV x rays. Phys. Med. Biol., 64:205019";
  for (const l of LANGS) {
    assert.ok(I18N[l].about.p2.includes(cite), l);
    assert.ok(I18N[l].copyFooter.includes(cite), l);
  }
});
