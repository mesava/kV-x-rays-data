"""Конвертер файлов данных веб-приложения МАГАТЭ (P. Andreo) в data/andreo_webapp.json.

Вход — пять файлов, переданных P. Andreo 1 октября 2026 г. (те же, что использует
приложение kvx-rays.iaea.org):
    Bw_HVL-AL_.dat        B_w(kV, SSD, DIAM, HVL в мм Al)
    Bw_HVL-CU_.dat        B_w(kV, SSD, DIAM, HVL в мм Cu)
    muen2_HVL-CU_.dat     [μen/ρ]^{z=2}_{w,air}(kV, SSD, DIAM, HVL в мм Cu)
    muenFIA_HVL-AL_.dat   [μen/ρ]^{FIA}_{w,air}(HVL в мм Al)  (таблица C1)
    muenFIA_HVL-CU_.dat   [μen/ρ]^{FIA}_{w,air}(HVL в мм Cu)  (таблица C1)

Сами .dat-файлы в репозиторий не входят; результат — data/andreo_webapp.json.

Запуск:
    python tools/convert_andreo_dat.py папка_с_dat_файлами data/andreo_webapp.json
"""
import json
import sys
from pathlib import Path

import numpy as np

DIGITS = 9  # знаков после запятой: ошибка округления 5e-10, результат выводится с 4 знаками

GRIDS = {
    "bw_al": ("Bw_HVL-AL_.dat", "mm Al", "Фактор обратного рассеяния в воде B_w, СПО в мм Al"),
    "bw_cu": ("Bw_HVL-CU_.dat", "mm Cu", "Фактор обратного рассеяния в воде B_w, СПО в мм Cu"),
    "muen_z2": ("muen2_HVL-CU_.dat", "mm Cu", "Отношение [μen/ρ]w,air на глубине 2 см в воде, СПО в мм Cu"),
}
FIA = {"Al": "muenFIA_HVL-AL_.dat", "Cu": "muenFIA_HVL-CU_.dat"}


def read_grid(path):
    a = np.loadtxt(path, skiprows=1)
    if a.shape[1] != 5:
        raise ValueError(f"{path}: ожидалось 5 столбцов (kV SSD DIAM HVL value)")
    axes = [np.unique(a[:, i]) for i in range(4)]  # kV, SSD, DIAM, HVL
    shape = tuple(len(x) for x in axes)
    if np.prod(shape) != len(a):
        raise ValueError(f"{path}: сетка неполная ({len(a)} строк при {shape})")
    v = np.full(shape, np.nan)
    v[tuple(np.searchsorted(axes[i], a[:, i]) for i in range(4))] = a[:, 4]
    if np.isnan(v).any():
        raise ValueError(f"{path}: в сетке есть пропуски")
    # порядок хранения: values[ssd][diam][hvl][kv] в виде плоского массива
    flat = np.transpose(v, (1, 2, 3, 0)).ravel()
    return {
        "kv": axes[0].tolist(), "ssd_cm": axes[1].tolist(), "diam_cm": axes[2].tolist(), "hvl": axes[3].tolist(),
        "order": ["ssd_cm", "diam_cm", "hvl", "kv"],
        "values": [round(float(x), DIGITS) for x in flat],
    }


def read_fia(path):
    a = np.loadtxt(path, skiprows=1)
    return {"hvl": a[:, 0].tolist(), "value": [round(float(x), DIGITS) for x in a[:, 1]]}


def main(src, dst):
    src = Path(src)
    data = {
        "meta": {
            "source": "P Andreo (2019) Data for the dosimetry of low- and medium-energy kV x rays. Phys. Med. Biol., 64:205019",
            "files": "Файлы данных веб-приложения МАГАТЭ kvx-rays.iaea.org, переданы автором 1 октября 2026 г.",
            "terms": "Только некоммерческое использование, со ссылкой на источник (см. data/README.md).",
            "interpolation": {
                "grids": "квадратичный сплайн по каждой оси (scipy interp1d kind='quadratic'), тензорное произведение по kV, SSD, DIAM, HVL",
                "muen_fia": "линейная интерполяция ln(μen) по ln(HVL)",
            },
        },
    }
    for key, (fname, unit, note) in GRIDS.items():
        data[key] = {**read_grid(src / fname), "hvl_unit": unit, "note": note}
    data["muen_fia"] = {m: read_fia(src / f) for m, f in FIA.items()}
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    for key in GRIDS:
        g = data[key]
        print(f"{key}: {len(g['kv'])} kV × {len(g['ssd_cm'])} РИП × {len(g['diam_cm'])} полей × {len(g['hvl'])} СПО")
    print("muen_fia:", {m: len(v["hvl"]) for m, v in data["muen_fia"].items()})
    print(f"{dst}: {Path(dst).stat().st_size / 1024:.0f} КБ")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
