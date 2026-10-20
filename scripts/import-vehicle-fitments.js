/**
 * Importa los autos y camionetas de cada filtro (los saca export-vehicle-fitments.js
 * del Buscador de Filtros) a `applications.vehicles`, `fitVehicles` y las
 * equivalencias a `applications.oem` / `oemNumbers`.
 *
 * Empata por código: el código del producto en la tienda es la clave de SuperTicket.
 * Conserva lo que el producto ya tenga en `applications` (tractores, motores) y
 * suma las equivalencias nuevas a las que ya tenga.
 *
 * `fitVehicles` guarda "|Marca::Modelo::Año::Motor|" por cada año, para que el
 * catálogo filtre con $contains "|Nissan::Sentra::" (modelo), "|Nissan::Sentra::2015::"
 * (año) o "|Nissan::Sentra::2015::1.8L|" (motor).
 *
 * Uso:
 *   node scripts/import-vehicle-fitments.js --file vehicle-fitments.json            (solo vista previa)
 *   node scripts/import-vehicle-fitments.js --file vehicle-fitments.json --apply    (escribe en Strapi)
 *
 * Necesita STRAPI_URL (y STRAPI_TOKEN con --apply).
 */
const fs = require("fs");
const path = require("path");

const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const pipe = (arr) => (arr.length ? `|${[...new Set(arr)].join("|")}|` : null);

const yearsOf = (ranges) =>
  ranges.flatMap((r) => {
    const [from, to] = r.split("-").map(Number);
    return Array.from({ length: (to || from) - from + 1 }, (_, i) => from + i);
  });

function mergeOem(current = [], extra = []) {
  const byMake = new Map(current.map((o) => [o.make, new Set(o.numbers)]));
  for (const o of extra) {
    const s = byMake.get(o.make) || byMake.set(o.make, new Set()).get(o.make);
    o.numbers.forEach((n) => s.add(n));
  }
  return [...byMake].map(([make, s]) => ({ make, numbers: [...s] }));
}

function toFields(product, fit) {
  const app = { ...(product.applications || {}) };
  if (fit.vehicles.length) app.vehicles = fit.vehicles;
  else delete app.vehicles;
  app.oem = mergeOem(app.oem, fit.oem);
  if (!app.oem.length) delete app.oem;

  const vehicleTokens = fit.vehicles.flatMap((v) => yearsOf(v.years).map((y) => `${v.make}::${v.model}::${y}::${v.engine}`));
  const oldOem = String(product.oemNumbers || "").split("|").filter(Boolean);
  return {
    applications: Object.keys(app).length ? app : null,
    fitVehicles: pipe(vehicleTokens),
    oemNumbers: pipe([...oldOem, ...(app.oem || []).flatMap((o) => o.numbers)]),
  };
}

function args() {
  const a = process.argv.slice(2);
  const get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  return { file: get("--file"), out: get("--out") || "vehicle-fitments-preview.csv", apply: a.includes("--apply") };
}

async function fetchProducts(API, TOKEN) {
  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
  const all = [];
  for (let page = 1; ; page++) {
    const q = `fields[0]=code&fields[1]=applications&fields[2]=oemNumbers&pagination[page]=${page}&pagination[pageSize]=100`;
    const res = await fetch(`${API}/api/products?${q}`, { headers });
    if (!res.ok) throw new Error(`No se pudieron leer los productos: HTTP ${res.status}`);
    const json = await res.json();
    all.push(...json.data);
    if (page >= json.meta.pagination.pageCount) return all;
  }
}

async function main() {
  const { file, out, apply } = args();
  if (!file) throw new Error('Falta --file "<vehicle-fitments.json>"');
  const API = process.env.STRAPI_URL;
  const TOKEN = process.env.STRAPI_TOKEN;
  if (!API) throw new Error("Falta STRAPI_URL");
  if (apply && !TOKEN) throw new Error("Con --apply se necesita STRAPI_TOKEN");

  const fits = JSON.parse(fs.readFileSync(file, "utf8"));
  const products = await fetchProducts(API, TOKEN);

  const updates = [];
  for (const p of products) {
    const fit = fits[norm(p.code)];
    if (!fit) continue;
    updates.push({ documentId: p.documentId, code: p.code, fit, fields: toFields(p, fit) });
  }

  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [
    ["codigo", "documentId", "vehiculos", "ejemplo", "equivalencias"].join(","),
    ...updates.map((u) => [
      u.code,
      u.documentId,
      u.fit.vehicles.length,
      u.fit.vehicles.slice(0, 3).map((v) => `${v.make} ${v.model} ${v.engine} ${v.years.join(",")}`).join(" / "),
      u.fit.oem.map((o) => `${o.make}: ${o.numbers.join(", ")}`).join(" / "),
    ].map(esc).join(",")),
  ].join("\n");
  fs.writeFileSync(out, "﻿" + csv);
  const withVehicles = updates.filter((u) => u.fit.vehicles.length).length;
  console.log(`${products.length} productos leídos; ${updates.length} empatan (${withVehicles} con vehículos). Vista previa: ${path.resolve(out)}`);

  if (!apply) return;

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
    if ((ok + failed.length) % 50 === 0) console.log(`  ${ok + failed.length}/${updates.length}`);
  }
  console.log(`Actualizados: ${ok}. Fallidos: ${failed.length}`);
  if (failed.length) console.log(failed.join("\n"));
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { toFields };
