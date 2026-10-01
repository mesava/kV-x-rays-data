// Сборка одного самодостаточного файла docs/index.html:
// стили, данные, модуль расчёта, переводы и интерфейс встраиваются в страницу.
// Такой файл открывается двойным щелчком без интернета и подходит для GitHub Pages.
// Запуск: npm run build
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const html = read("web/index.html");
const css = read("web/style.css");
const kvx = read("src/kvx.js").replace(/^export /gm, "");
const app = read("web/app.js").replace(/^import .*$/gm, "");
const i18n = read("web/i18n.js").replace(/^export /gm, "");
const tables = read("data/andreo2019.json").trim();
const nist = JSON.stringify(JSON.parse(read("data/nist_attenuation.json")));
const version = JSON.parse(read("package.json")).version;

const script = `
globalThis.KVX_DATA = { tables: ${tables}, nist: ${nist} };
${kvx}
${i18n}
${app}
`.replace(/<\/script/gi, "<\\/script");

let out = html
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}</style>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script type="module">${script}</script>`)
  .replace("<head>", () => `<head>\n<!-- Собрано из web/, src/, data/ командой npm run build. Версия ${version}. Не редактируйте вручную. -->`);

if (out.includes('src="app.js"') || out.includes('href="style.css"')) throw new Error("Не удалось встроить ресурсы");
mkdirSync(new URL("../docs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../docs/index.html", import.meta.url), out);
console.log(`docs/index.html: ${(out.length / 1024).toFixed(0)} КБ`);
