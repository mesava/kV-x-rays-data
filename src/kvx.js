// Модуль расчёта дозиметрических величин для kV-рентгена по данным Andreo (PMB 2019)
// и TRS-398 Rev.1. Без зависимостей; работает в браузере и в Node.js.
//
// Схема интерполяции подобрана по контрольным точкам сайта kvx-rays.iaea.org
// (совпадение в узлах таблиц — до 4-го знака, между узлами — не хуже 0,0005):
//   kV   — PCHIP (для μen z=2 — по переменной 1/kV, как в подгонке Andreo, ур. 17–18);
//   HVL  — PCHIP по ln(HVL);
//   поле — PCHIP по диаметру;
//   РИП  — PCHIP по ln(РИП).
// За пределами узлов — линейная экстраполяция по двум крайним узлам (в тех же переменных).

// ---------- одномерная интерполяция ----------

// PCHIP (монотонная кубическая Эрмита), те же формулы, что scipy.interpolate.PchipInterpolator.
export function pchip(xs, ys, x) {
  let X = xs, Y = ys;
  if (X[0] > X[X.length - 1]) { X = [...X].reverse(); Y = [...Y].reverse(); }
  const n = X.length;
  if (x < X[0] || x > X[n - 1]) {
    const [i, j] = x < X[0] ? [0, 1] : [n - 2, n - 1];
    return Y[i] + (Y[j] - Y[i]) * (x - X[i]) / (X[j] - X[i]);
  }
  if (n === 2) return Y[0] + (Y[1] - Y[0]) * (x - X[0]) / (X[1] - X[0]);
  const h = [], m = [];
  for (let k = 0; k < n - 1; k++) { h.push(X[k + 1] - X[k]); m.push((Y[k + 1] - Y[k]) / h[k]); }
  const d = new Array(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    if (m[k - 1] === 0 || m[k] === 0 || Math.sign(m[k - 1]) !== Math.sign(m[k])) { d[k] = 0; continue; }
    const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
    d[k] = (w1 + w2) / (w1 / m[k - 1] + w2 / m[k]);
  }
  const edge = (h0, h1, m0, m1) => {
    let dd = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
    if (Math.sign(dd) !== Math.sign(m0)) dd = 0;
    else if (Math.sign(m0) !== Math.sign(m1) && Math.abs(dd) > Math.abs(3 * m0)) dd = 3 * m0;
    return dd;
  };
  d[0] = edge(h[0], h[1], m[0], m[1]);
  d[n - 1] = edge(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
  let k = 0;
  while (k < n - 2 && x > X[k + 1]) k++;
  const t = (x - X[k]) / h[k], t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * Y[k] + (t3 - 2 * t2 + t) * h[k] * d[k]
       + (-2 * t3 + 3 * t2) * Y[k + 1] + (t3 - t2) * h[k] * d[k + 1];
}

function loglog(xs, ys, x) {
  // линейная интерполяция в логарифмах обеих осей (для коэффициентов ослабления)
  let k = 0;
  while (k < xs.length - 2 && x > xs[k + 1]) k++;
  const lx0 = Math.log(xs[k]), lx1 = Math.log(xs[k + 1]);
  const ly0 = Math.log(ys[k]), ly1 = Math.log(ys[k + 1]);
  return Math.exp(ly0 + (ly1 - ly0) * (Math.log(x) - lx0) / (lx1 - lx0));
}

// ---------- калькулятор ----------

export function createCalculator(tables, nist) {
  const round4 = (v) => Math.round(v * 1e4) / 1e4;

  function grid4(q, kv, hvl, ssd, f) {
    const g = tables[q];
    const kx = q === "bw" ? g.kv : g.kv.map((k) => 1 / k);
    const kxv = q === "bw" ? kv : 1 / kv;
    const lnH = g.hvl.map(Math.log), lnHv = Math.log(hvl);
    const perSsd = g.values.map((bySsd) => {
      const perDiam = bySsd.map((byDiam) => {
        const col = byDiam.map((row) => pchip(kx, row, kxv));
        return pchip(lnH, col, lnHv);
      });
      return pchip(g.diam_cm, perDiam, f);
    });
    return pchip(g.ssd_cm.map(Math.log), perSsd, Math.log(ssd));
  }

  function hvlMax(kv, material) {
    const t = nist[material];
    const E = kv / 1000; // МэВ
    const mu = loglog(t.map((r) => r[0]), t.map((r) => r[1]), E) * nist.meta.density_g_cm3[material];
    return (Math.LN2 / mu) * 10; // мм
  }

  // Предупреждения возвращаются как { code, level, params }; текст на нужном языке
  // формирует интерфейс по коду (web/i18n.js, раздел warn).
  function checks(q, kv, hvl, ssd, f, material) {
    const g = tables[q], w = [];
    const kmin = Math.min(...g.kv), kmax = Math.max(...g.kv);
    const hmin = g.hvl[0], hmax = g.hvl[g.hvl.length - 1];
    if (kv < kmin || kv > kmax)
      w.push({ code: "kv_extrap", level: "info", params: { kv, min: kmin, max: kmax } });
    if (hvl < hmin || hvl > hmax)
      w.push({ code: "hvl_extrap", level: "info", params: { hvl, material, min: hmin, max: hmax } });
    if (ssd < g.ssd_cm[0] || ssd > g.ssd_cm[g.ssd_cm.length - 1] || f < g.diam_cm[0] || f > g.diam_cm[g.diam_cm.length - 1])
      w.push({ code: "geom_extrap", level: "warn", params: {} });
    const hm = hvlMax(kv, material);
    if (hvl > hm)
      w.push({ code: "hvl_unphysical", level: "error", params: { hvl, kv, material, limit: hm } });
    return w;
  }

  function muenFIA(hvl, material = "Al") {
    const t = tables.muen_fia[material];
    const value = pchip(t.map((r) => Math.log(r[0])), t.map((r) => r[1]), Math.log(hvl));
    const w = [];
    if (hvl < t[0][0] || hvl > t[t.length - 1][0])
      w.push({ code: "hvl_extrap_c1", level: "info", params: { hvl, material, min: t[0][0], max: t[t.length - 1][0] } });
    return { value: round4(value), raw: value, warnings: w };
  }

  function bw(kv, hvl, ssd, f) {
    const v = grid4("bw", kv, hvl, ssd, f);
    return { value: round4(v), raw: v, warnings: checks("bw", kv, hvl, ssd, f, "Al") };
  }

  function muenZ2(kv, hvl, ssd, f) {
    const v = grid4("muen_z2", kv, hvl, ssd, f);
    return { value: round4(v), raw: v, warnings: checks("muen_z2", kv, hvl, ssd, f, "Cu") };
  }

  // Составляющие поправочного коэффициента на геометрию (TRS-398 Rev.1, прил. I, ур. 85 и 90):
  // отношение не зависящей от камеры величины в клинических условиях к величине в опорных.
  function kgBw(kv, hvl, ref, clin) {
    const r = bw(kv, hvl, ref.ssd, ref.f), c = bw(kv, hvl, clin.ssd, clin.f);
    return { ref: r.value, clin: c.value, value: round4(c.raw / r.raw), warnings: dedupe([...r.warnings, ...c.warnings]) };
  }
  function kgMuenZ2(kv, hvl, ref, clin) {
    const r = muenZ2(kv, hvl, ref.ssd, ref.f), c = muenZ2(kv, hvl, clin.ssd, clin.f);
    return { ref: r.value, clin: c.value, value: round4(c.raw / r.raw), warnings: dedupe([...r.warnings, ...c.warnings]) };
  }
  function dedupe(ws) {
    const seen = new Set();
    return ws.filter((w) => {
      const key = w.code + JSON.stringify(w.params);
      return seen.has(key) ? false : seen.add(key);
    });
  }

  // Проверка физической реализуемости сочетания kV и СПО (для расчётов без сетки kV)
  function hvlCheck(kv, hvl, material) {
    const hm = hvlMax(kv, material);
    return hvl > hm ? [{ code: "hvl_unphysical", level: "error", params: { hvl, kv, material, limit: hm } }] : [];
  }

  return { bw, muenFIA, muenZ2, kgBw, kgMuenZ2, hvlMax, hvlCheck };
}
