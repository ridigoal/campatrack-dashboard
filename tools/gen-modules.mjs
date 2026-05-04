/**
 * Genera js/modules/*.js como re-exportaciones desde js/_app.impl.js
 * y añade al final de _app.impl.js: export { ... } de todas las funciones declaradas en top-level.
 * Ejecutar desde la raíz del proyecto: node tools/gen-modules.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const implPath = path.join(root, "js", "_app.impl.js");
const modulesDir = path.join(root, "js", "modules");

function bucketForLine(line) {
  if (line <= 3737) return "planning";
  if (line >= 3738 && line <= 6153) return "data";
  if (line >= 6154 && line <= 6699) return "reportes";
  if (line >= 6702 && line <= 6882) return "relaciones";
  if (line >= 6883 && line <= 7032) return "medidas";
  if (line >= 7033 && line <= 7104) return "data";
  if (line >= 7105 && line <= 7561) return "medidas";
  if (line >= 7562 && line <= 7695) return "relaciones";
  if (line >= 7697 && line <= 10126) return "dashboard";
  return null;
}

const code = fs.readFileSync(implPath, "utf8");
const lines = code.split(/\n/);

/** @type {{ name: string, line: number }[]} */
const funcs = [];
for (let i = 0; i < lines.length; i += 1) {
  const m = lines[i].match(/^(async )?function (\w+)\s*\(/);
  if (m) funcs.push({ name: m[2], line: i + 1 });
}

const uniq = [...new Map(funcs.map((f) => [f.name, f])).values()];

/** @type {Record<string, string[]>} */
const byMod = {};
for (const f of uniq) {
  const b = bucketForLine(f.line);
  if (!b) continue;
  if (!byMod[b]) byMod[b] = [];
  byMod[b].push(f.name);
}

for (const k of Object.keys(byMod)) {
  byMod[k].sort((a, b) => a.localeCompare(b));
}

fs.mkdirSync(modulesDir, { recursive: true });

const moduleOrder = ["planning", "data", "reportes", "relaciones", "medidas", "dashboard"];
const header =
  "/**\n * Re-exportaciones agrupadas por dominio.\n * La implementación completa está en ../_app.impl.js (sin cambios de lógica).\n */\n";

for (const mod of moduleOrder) {
  const names = byMod[mod] || [];
  const inner = names.length ? `\n${names.map((n) => `  ${n},`).join("\n")}\n` : "\n";
  const body = `${header}export {${inner}} from "../_app.impl.js";\n`;
  fs.writeFileSync(path.join(modulesDir, `${mod}.js`), body, "utf8");
}

/** export { ... todas las funciones top-level declaradas }; */
const exportList = uniq.map((f) => f.name).sort((a, b) => a.localeCompare(b));
const exportLine = `\nexport {\n${exportList.map((n) => `  ${n},`).join("\n")}\n};\n`;
if (code.includes("\nexport {")) {
  throw new Error("_app.impl.js ya contiene 'export {'; no se volverá a generar.");
}
fs.appendFileSync(implPath, exportLine, "utf8");

console.log("Módulos generados:", moduleOrder.join(", "));
console.log("Exports en _app.impl.js:", exportList.length, "funciones");
