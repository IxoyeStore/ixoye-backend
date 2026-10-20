/**
 * Saca de "Buscador de Filtros" (el programa del mostrador) los autos y camionetas
 * en los que va cada filtro que manejamos, con el mismo criterio que el kit del
 * buscador: Gonher es la referencia; si Gonher indica otro número para ese motor,
 * no se cuenta; nunca los "parecidos" ni los que solo salen por la descripción.
 *
 * Recorre todas las combinaciones marca / modelo / año de los catálogos y guarda,
 * por clave de SuperTicket, los vehículos (marca, modelo, motor, años) y las
 * equivalencias con otras marcas.
 *
 * Uso:
 *   node scripts/export-vehicle-fitments.js --buscador "<ruta>/Buscador de Filtros/programa" [--out vehicle-fitments.json]
 */
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const BUSCADOR = get("--buscador");
const OUT = get("--out") || "vehicle-fitments.json";
if (!BUSCADOR) throw new Error('Falta --buscador "<ruta a Buscador de Filtros/programa>"');

const consulta = require(path.resolve(BUSCADOR, "consulta.js"));
const { indice, norm } = require(path.resolve(BUSCADOR, "indice.js"));

const TODOS = "*"; // aplicación sin motor en el buscador: vale para todos

// Mismo criterio que `kits` en consulta.js, pero con todos los productos que califican, no solo el mejor:
// 0 = número que indica Gonher · 0.5 = lo trae en su descripción · 1 = equivalente a Gonher ·
// 2 = Gonher no dice nada · 3 = Gonher indica otro número (contradicho)
function nivelGonher(p, indica, m) {
  const vale = (lista) => lista && (m ? lista.includes(m) || lista.includes(TODOS) : lista.length > 0);
  if (vale(p.gonher?.mismo)) return indica.has(norm(p.clave)) ? 0 : 0.5;
  if (vale(p.gonher?.equivalente)) return 1;
  return indica.size && p.numerosGonher.length && !p.numerosGonher.some((n) => indica.has(n)) ? 3 : 2;
}
function indicaGonher(tipo, m) {
  const s = new Set();
  for (const [k, cods] of Object.entries(tipo.gonherIndica || {})) if (!m || k === m || k === TODOS) cods.forEach((c) => s.add(norm(c)));
  return s;
}
function calificados(tipo, m) {
  const fuertes = tipo.productos.filter((p) => !p.soloParecido && !p.soloDescripcion);
  const indica = indicaGonher(tipo, m);
  const limite = indica.size ? 2 : 3;
  return tipo.productos.filter((p) => !p.soloParecido
    && !(p.soloDescripcion && fuertes.length)
    && (!m || !p.motores.length || p.motores.includes(m))
    && nivelGonher(p, indica, m) < limite);
}

// "NISSAN" -> "Nissan"; deja en mayúsculas siglas y modelos con números (BMW, GMC, CR-V, NP300, F-150)
const bonito = (s) => String(s).split(" ").map((w) => (w.length <= 3 || /\d/.test(w) ? w : w[0] + w.slice(1).toLowerCase())).join(" ");

function main() {
  const t0 = Date.now();
  const i = indice();
  const combos = new Map(); // "MARCA|MODELO" -> Set(años)
  for (const a of i.apps) {
    if (!a.desde) continue;
    const k = `${a.marca}|${a.modelo}`;
    const s = combos.get(k) || combos.set(k, new Set()).get(k);
    for (let y = a.desde; y <= a.hasta; y++) s.add(y);
  }

  const porProducto = new Map(); // CLAVE -> Map("MARCA|MODELO|MOTOR" -> Set(años))
  let n = 0;
  const total = [...combos.values()].reduce((x, s) => x + s.size, 0);
  for (const [k, anios] of combos) {
    const [marca, modelo] = k.split("|");
    for (const anio of anios) {
      const r = consulta.vehiculo({ marca, modelo, anio });
      const motores = r.motores?.length ? r.motores : [null];
      for (const tipo of r.tipos || []) for (const m of motores) for (const p of calificados(tipo, m)) {
        const clave = norm(p.clave);
        const veh = porProducto.get(clave) || porProducto.set(clave, new Map()).get(clave);
        const vk = `${marca}|${modelo}|${m || ""}`;
        (veh.get(vk) || veh.set(vk, new Set()).get(vk)).add(anio);
      }
      if (++n % 2000 === 0) process.stderr.write(`  ${n} / ${total}\n`);
    }
  }

  // años seguidos en rangos: [2010, 2011, 2012, 2015] -> "2010-2012", "2015"
  const rangos = (ys) => {
    const s = [...ys].sort((a, b) => a - b), out = [];
    for (let j = 0; j < s.length; j++) {
      let h = j;
      while (h + 1 < s.length && s[h + 1] === s[h] + 1) h++;
      out.push(s[j] === s[h] ? `${s[j]}` : `${s[j]}-${s[h]}`);
      j = h;
    }
    return out;
  };

  // también los que no van en ningún auto (filtros pesados y agrícolas): llevan sus equivalencias
  for (const clave of i.productos.keys()) if (!porProducto.has(clave)) porProducto.set(clave, new Map());

  const resultado = {};
  for (const [clave, veh] of porProducto) {
    const ficha = consulta.producto(clave);
    const vehicles = [...veh].map(([vk, ys]) => {
      const [marca, modelo, motor] = vk.split("|");
      return { make: bonito(marca), model: bonito(modelo), engine: motor ? `${motor}L` : "", years: rangos(ys) };
    }).sort((a, b) => a.make.localeCompare(b.make) || a.model.localeCompare(b.model) || a.engine.localeCompare(b.engine));
    // equivalencias con otras marcas, agrupadas: "BALDWIN PA10130" -> { make: "Baldwin", numbers: ["PA10130"] }
    const eq = new Map();
    for (const e of ficha?.equivalencias || []) {
      const [m, ...c] = e.codigo.split(" ");
      if (m === "?" || !c.length) continue;
      const mk = bonito(m);
      (eq.get(mk) || eq.set(mk, new Set()).get(mk)).add(c.join(" "));
    }
    if (!vehicles.length && !eq.size) continue;
    resultado[clave] = {
      clave: ficha?.clave || clave,
      tipo: ficha?.tipo || null,
      wega: ficha?.wega || null,
      vehicles,
      oem: [...eq].map(([make, s]) => ({ make, numbers: [...s] })),
    };
  }

  fs.writeFileSync(OUT, JSON.stringify(resultado, null, 1));
  const totalVeh = Object.values(resultado).reduce((x, r) => x + r.vehicles.length, 0);
  console.log(`${n} combinaciones marca/modelo/año en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const conVeh = Object.values(resultado).filter((r) => r.vehicles.length).length;
  console.log(`${Object.keys(resultado).length} productos (${conVeh} con vehículos, ${totalVeh} renglones marca/modelo/motor) -> ${OUT}`);
}

main();
