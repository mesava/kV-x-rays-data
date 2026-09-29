"""Разбор таблиц C1–C11 из Supplementary Data к статье Andreo (Phys. Med. Biol. 64 (2019) 205019).

Вход: текст PDF «Data Tables for the dosimetry of low- and medium-energy kV x rays»
(P. Andreo, 14.09.2019), выгруженный в .txt (например, pdftotext).
Выход: data/andreo2019.json — единый файл данных для модуля расчёта.

Запуск:
    python tools/parse_andreo_tables.py путь/к/Data_tables....txt data/andreo2019.json
"""
import json
import re
import sys

NUM = re.compile(r"^-?\d+(\.\d+)?$")
SSDS = [10, 20, 30, 50, 100]
DIAMS = [1, 2, 3, 5, 10, 15, 20, 30]


def parse(lines):
    start = next(i for i, l in enumerate(lines) if l.startswith("Table C1:"))
    fia = {"Al": [], "Cu": []}
    i = start
    # Таблица C1: [μen(Q)/ρ]FIA как функция HVL (мм Al и мм Cu)
    while not lines[i].startswith("Table C2"):
        parts = lines[i].split()
        if parts and all(NUM.match(p) for p in parts):
            if len(parts) == 4:
                fia["Al"].append([float(parts[0]), float(parts[1])])
                fia["Cu"].append([float(parts[2]), float(parts[3])])
            elif len(parts) == 2:
                h = float(parts[0])
                # строки с HVL < 0.01 есть только в столбце Cu, с HVL > 6.5 — только в столбце Al
                (fia["Cu"] if h < 0.01 else fia["Al"]).append([h, float(parts[1])])
        i += 1

    raw = {"bw": {}, "muen_z2": {}}
    cur = ssd = kvs = diam = None
    for l in lines[i:]:
        m = re.match(r"Table C(\d+)", l)
        if m:
            cur = "bw" if int(m.group(1)) <= 6 else "muen_z2"
            m2 = re.search(r"SSD = (\d+) cm", l)
            ssd = int(m2.group(1)) if m2 else None
            continue
        if ssd is None:
            m3 = re.search(r"SSD = (\d+) cm", l)
            if m3:
                ssd = int(m3.group(1))
                continue
        if l.startswith("kV:"):
            kvs = [float(x) for x in l.split()[1:]]
            continue
        m = re.search(r"∅ = (\d+) cm", l)
        if m:
            diam = int(m.group(1))
            continue
        parts = l.split()
        if cur and kvs and parts and all(NUM.match(p) for p in parts) and len(parts) == len(kvs) + 1:
            t = raw[cur].setdefault((ssd, diam), {"kv": kvs, "hvl": [], "val": []})
            t["hvl"].append(float(parts[0]))
            t["val"].append([float(x) for x in parts[1:]])

    out = {}
    for q, tabs in raw.items():
        ref = tabs[(SSDS[0], DIAMS[0])]
        for key, t in tabs.items():
            assert t["kv"] == ref["kv"] and t["hvl"] == ref["hvl"], f"{q} {key}: сетка не совпадает"
        out[q] = {
            "ssd_cm": SSDS,
            "diam_cm": DIAMS,
            "hvl": ref["hvl"],
            "kv": ref["kv"],
            # values[ssd][diam][hvl][kv]
            "values": [[tabs[(s, d)]["val"] for d in DIAMS] for s in SSDS],
        }
    return fia, out


def main(src, dst):
    lines = open(src, encoding="utf-8").read().splitlines()
    fia, grids = parse(lines)
    data = {
        "meta": {
            "source": "P. Andreo, Data Tables for the dosimetry of low- and medium-energy kV x rays "
                      "(Supplementary Data to Phys. Med. Biol. 64 (2019) 205019, 14.09.2019), tables C1–C11",
            "doi": "10.1088/1361-6560/ab421d",
            "note": "Значения — результат подгонки (раздел 4.2 статьи) по 342 спектрам; 4 знака приведены, "
                    "чтобы уменьшить ошибки округления. Неопределённость: Bw 0.6 %, μen z=2 0.3 %.",
        },
        "muen_fia": {
            "hvl_unit": {"Al": "mm Al", "Cu": "mm Cu"},
            "Al": fia["Al"],
            "Cu": fia["Cu"],
            "note": "Таблица C1: зависит только от HVL. Значения для мм Cu в статье приведены для полноты; "
                    "для низких энергий (≤100 кВ) их использовать не следует.",
        },
        "bw": {**grids["bw"], "hvl_unit": "mm Al",
               "note": "Таблицы C2–C6: фактор обратного рассеяния в воде, низкие энергии."},
        "muen_z2": {**grids["muen_z2"], "hvl_unit": "mm Cu",
                    "note": "Таблицы C7–C11: отношение μen/ρ вода/воздух на глубине 2 см, средние энергии."},
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    b, m = grids["bw"], grids["muen_z2"]
    print(f"C1: Al {len(fia['Al'])}, Cu {len(fia['Cu'])} строк")
    print(f"Bw: {len(b['ssd_cm'])} РИП × {len(b['diam_cm'])} полей × {len(b['hvl'])} HVL × {len(b['kv'])} kV")
    print(f"μen z=2: {len(m['ssd_cm'])} РИП × {len(m['diam_cm'])} полей × {len(m['hvl'])} HVL × {len(m['kv'])} kV")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
