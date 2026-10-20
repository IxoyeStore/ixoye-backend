/**
 * Importa las compatibilidades (tractores, motores, OEM) desde el Excel de
 * "Titulos propuestos" a los campos `applications`, `fitMakes`, `fitSeries`,
 * `fitModels`, `fitEngines` y `oemNumbers` de cada producto.
 *
 * Lee la columna "Aplicaciones para la descripción", que tiene el formato:
 *
 *   TRACTORES Y EQUIPOS COMPATIBLES
 *   - Para Massey Ferguson Serie 200: 230, 231, 235
 *   MOTORES COMPATIBLES
 *   - Para Perkins 4.236
 *   NÚMEROS DE PARTE DE REFERENCIA (OEM)
 *   - Para Perkins: 68017, U5LB0016
 *
 * Uso:
 *   node scripts/import-fitments.js --file "<ruta.xlsx>"            (solo vista previa)
 *   node scripts/import-fitments.js --file "<ruta.xlsx>" --apply    (escribe en Strapi)
 *
 * Con --apply necesita STRAPI_URL y STRAPI_TOKEN en el entorno.
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

// Marcas de varias palabras primero para que "Ford New Holland" no quede como "Ford".
const MAKES = [
  "Ford New Holland", "Massey Ferguson", "John Deere", "Case IH", "David Brown",
  "Volvo BM", "Leyland Tractor", "Deutz Fahr", "Valmet Valtra",
  "Caterpillar", "Cummins", "Perkins", "JCB", "Fiat", "Mccormick", "McCormick",
  "Manitou", "Lister", "County", "Steyr", "Leyland", "Fendt", "Valmet",
  "Landini", "Zetor", "Kubota", "Renault", "Claas", "Hyster", "Iseki", "Sisu",
  "Ford", "Nuffield", "International", "Petter", "Hanomag", "Same",
];

function splitMake(text) {
  const t = text.trim();
  const make = MAKES.find((m) => t.toLowerCase() === m.toLowerCase() || t.toLowerCase().startsWith(m.toLowerCase() + " "));
  if (!make) {
    const [first, ...rest] = t.split(/\s+/);
    return { make: first, rest: rest.join(" ") };
  }
  return { make: make === "McCormick" ? "Mccormick" : make, rest: t.slice(make.length).trim() };
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Corrige errores de captura del catalogo para no duplicar opciones en el buscador.
function cleanLabel(s, make) {
  let t = s
    .replace(/Tractoreses/gi, "Tractores")
    .replace(/\bGensis\b/g, "Genesis")
    .replace(/\b(\w+) \1\b/gi, "$1");
  if (make && t.toLowerCase().startsWith(make.toLowerCase() + " ")) t = t.slice(make.length + 1);
  return capitalize(t.trim());
}
const splitList = (s) => s.split(/,\s*/).map((x) => x.trim()).filter(Boolean);

function parseApplications(text) {
  const app = { tractors: [], engines: [], oem: [] };
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^TRACTORES/.test(line)) { section = "tractors"; continue; }
    if (/^MOTORES/.test(line)) { section = "engines"; continue; }
    if (/^N[ÚU]MEROS DE PARTE/.test(line)) { section = "oem"; continue; }
    if (/^[A-ZÁÉÍÓÚÑ ()]{6,}$/.test(line)) { section = ""; continue; }
    const m = line.match(/^-\s*Para\s+(.+)$/i);
    if (!m) continue;
    const body = m[1];

    if (section === "tractors") {
      const idx = body.indexOf(":");
      if (idx < 0) continue;
      const { make, rest } = splitMake(body.slice(0, idx));
      app.tractors.push({ make, series: cleanLabel(rest, make) || "Otros modelos", models: splitList(body.slice(idx + 1)) });
    } else if (section === "engines") {
      let { make, rest } = splitMake(body);
      if (make === "Nef") { make = "FPT"; rest = `NEF ${rest.replace(/^NEF\s*/i, "")}`; }
      app.engines.push({ make, engine: cleanLabel(rest, make) || make });
    } else if (section === "oem") {
      const idx = body.indexOf(":");
      if (idx < 0) continue;
      // Si no es una marca conocida, todo lo que va antes de ":" es la marca ("Premium Filters", "Napa Gold")
      const label = body.slice(0, idx).trim();
      const known = MAKES.some((m) => label.toLowerCase() === m.toLowerCase() || label.toLowerCase().startsWith(m.toLowerCase() + " "));
      app.oem.push({ make: known ? splitMake(label).make : label, numbers: splitList(body.slice(idx + 1)) });
    }
  }
  return app;
}

// Campos de texto "|a|b|" para filtrar con $contains desde la API REST sin
// que "235" coincida con "2350".
const pipe = (values) => {
  const uniq = [...new Set(values.filter(Boolean))];
  return uniq.length ? `|${uniq.join("|")}|` : null;
};

function toFields(app) {
  return {
    applications: app.tractors.length || app.engines.length || app.oem.length ? app : null,
    fitMakes: pipe([...app.tractors.map((t) => t.make), ...app.engines.map((e) => e.make)]),
    fitSeries: pipe(app.tractors.map((t) => `${t.make}::${t.series}`)),
    fitModels: pipe(app.tractors.flatMap((t) => t.models.map((mo) => `${t.make}::${mo}`))),
    fitEngines: pipe(app.engines.map((e) => `${e.make}::${e.engine}`)),
    oemNumbers: pipe(app.oem.flatMap((o) => o.numbers)),
  };
}

function args() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  return { file: get("--file"), out: get("--out") || "fitments-preview.csv", apply: a.includes("--apply") };
}

async function main() {
  const { file, out, apply } = args();
  if (!file) throw new Error('Falta --file "<ruta.xlsx>"');

  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["Títulos"] ?? wb.Sheets[wb.SheetNames[0]], { defval: "" });

  const updates = [];
  for (const r of rows) {
    const text = String(r["Aplicaciones para la descripción"] || "");
    if (!text.trim() || !r.documentId) continue;
    updates.push({ documentId: r.documentId, code: r["Código"], fields: toFields(parseApplications(text)) });
  }

  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["codigo", "documentId", "marcas", "series", "modelos", "motores", "oem"].join(","),
    ...updates.map((u) => [u.code, u.documentId, u.fields.fitMakes, u.fields.fitSeries, u.fields.fitModels, u.fields.fitEngines, u.fields.oemNumbers].map(esc).join(",")),
  ].join("\n");
  fs.writeFileSync(out, "﻿" + csv);
  console.log(`${updates.length} productos con aplicaciones. Vista previa: ${path.resolve(out)}`);

  if (!apply) return;

  const API = process.env.STRAPI_URL;
  const TOKEN = process.env.STRAPI_TOKEN;
  if (!API || !TOKEN) throw new Error("Con --apply se necesitan STRAPI_URL y STRAPI_TOKEN");

  let ok = 0;
  const failed = [];
  for (const u of updates) {
    const res = await fetch(`${API}/api/products/${u.documentId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ data: u.fields }),
    });
    if (res.ok) ok++;
    else failed.push(`${u.code} (${res.status})`);
    if ((ok + failed.length) % 100 === 0) console.log(`  ${ok + failed.length}/${updates.length}`);
  }
  console.log(`Actualizados: ${ok}. Fallidos: ${failed.length}`);
  if (failed.length) console.log(failed.join("\n"));
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { parseApplications, toFields };
