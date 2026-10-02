# Данные / Data

| Файл | Содержание | Источник |
|---|---|---|
| `andreo_webapp.json` | B<sub>w</sub>(kV, РИП, поле, СПО) для СПО в мм Al и в мм Cu; [μ<sub>en</sub>/ρ]<sup>z=2</sup><sub>w,air</sub>(kV, РИП, поле, СПО в мм Cu) — по 16 × 5 × 8 × 32 узлов; [μ<sub>en</sub>/ρ]<sup>FIA</sup><sub>w,air</sub>(СПО) для мм Al и мм Cu | Файлы данных веб-приложения МАГАТЭ kvx-rays.iaea.org, переданы автором P. Andreo 1 октября 2026 г. |
| `nist_attenuation.json` | Массовые коэффициенты ослабления Al и Cu — только для предупреждения о физически недостижимом СПО; к данным Andreo отношения не имеют и на рассчитываемые величины не влияют | NIST X-Ray Mass Attenuation Coefficients (Hubbell, Seltzer) |

`andreo_webapp.json` получен из исходных файлов `Bw_HVL-AL_.dat`, `Bw_HVL-CU_.dat`, `muen2_HVL-CU_.dat`, `muenFIA_HVL-AL_.dat`, `muenFIA_HVL-CU_.dat` скриптом `tools/convert_andreo_dat.py` (значения округлены до 9 знаков после запятой). Сами исходные файлы в репозиторий не входят.

## Условия использования данных Andreo

Данные в `andreo_webapp.json` используются в этом калькуляторе с разрешения их автора, P. Andreo, на двух условиях:

1. **Только некоммерческое использование** — ни напрямую, ни через передачу файлов кому-либо для коммерческих целей.
2. **Обязательная ссылка на источник:**
   P Andreo (2019) Data for the dosimetry of low- and medium-energy kV x rays. Phys. Med. Biol., 64:205019

Эти условия действуют для любого, кто использует калькулятор или файлы из этой папки.

## Terms of use for the Andreo data

The data in `andreo_webapp.json` are the data files of the IAEA web app kvx-rays.iaea.org, provided by their author, P. Andreo, on 1 October 2026. They are used in this calculator with his permission on two conditions:

1. **Non-commercial use only**, neither directly nor by transferring the files to anyone for commercial purposes.
2. **The source must be cited:**
   P Andreo (2019) Data for the dosimetry of low- and medium-energy kV x rays. Phys. Med. Biol., 64:205019

These conditions apply to anyone who uses the calculator or the files in this folder.
