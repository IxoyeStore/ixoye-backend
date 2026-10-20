/**
 * product controller
 */

import { factories } from '@strapi/strapi';

// El precio de mayoreo (B2B) solo debe verse por clientes B2B o por el
// admin. El frontend ya lo ocultaba visualmente, pero la API lo devolvia
// a cualquiera (incluso sin sesion), asi que cualquiera podia verlo
// llamando la API directo.
async function canSeeWholesalePrice(strapi: any, userId?: number): Promise<boolean> {
  if (!userId) return false;

  const user = await strapi.db
    .query('plugin::users-permissions.user')
    .findOne({ where: { id: userId }, populate: ['role'] });

  if (user?.role?.name === 'Admin') return true;

  const profile = await strapi.db
    .query('api::profile.profile')
    .findOne({ where: { users_permissions_user: userId } });

  return profile?.type === 'b2b';
}

function stripWholesalePrice(entity: any) {
  if (entity && typeof entity === 'object' && 'wholesalePrice' in entity) {
    delete entity.wholesalePrice;
  }
  return entity;
}

// Los campos fit* son indices para filtrar (un filtro de aceite llega a 150 KB de
// "|Marca::Modelo::Año::Motor|") y ningun cliente los lee: nunca se mandan.
// `applications` solo hace falta en la pagina del producto (que lo pide por slug);
// en las listas (catalogo, relacionados, buscador) se quita para que no pesen.
const FIT_FIELDS = ['fitMakes', 'fitSeries', 'fitModels', 'fitEngines', 'fitVehicles'];
function stripFitment(entity: any, keepApplications: boolean) {
  if (!entity || typeof entity !== 'object') return entity;
  for (const f of FIT_FIELDS) delete entity[f];
  if (!keepApplications) delete entity.applications;
  return entity;
}

// Arbol Marca -> Serie -> Modelos y Marca -> Motores para el buscador de
// vehiculo del frontend. Se arma con el JSON `applications` de todos los
// productos activos; es caro (miles de filas), asi que se cachea en memoria.
const FITMENT_TTL_MS = 10 * 60 * 1000;
let fitmentCache: { at: number; data: any } | null = null;

const naturalSort = (a: string, b: string) =>
  a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

async function buildFitmentTree(strapi: any) {
  const rows = await strapi.db.query('api::product.product').findMany({
    where: { active: true, fitMakes: { $notNull: true } },
    select: ['applications'],
  });

  const makes = new Map<string, { count: number; series: Map<string, { count: number; models: Set<string> }> }>();
  const engines = new Map<string, { count: number; engines: Map<string, number> }>();

  for (const { applications: app } of rows) {
    if (!app) continue;
    const seenMakes = new Set<string>();
    const seenSeries = new Set<string>();
    for (const t of app.tractors ?? []) {
      if (!makes.has(t.make)) makes.set(t.make, { count: 0, series: new Map() });
      const m = makes.get(t.make)!;
      if (!seenMakes.has(t.make)) { m.count++; seenMakes.add(t.make); }
      if (!m.series.has(t.series)) m.series.set(t.series, { count: 0, models: new Set() });
      const s = m.series.get(t.series)!;
      const key = `${t.make}::${t.series}`;
      if (!seenSeries.has(key)) { s.count++; seenSeries.add(key); }
      (t.models ?? []).forEach((mo: string) => s.models.add(mo));
    }
    const seenEngines = new Set<string>();
    for (const e of app.engines ?? []) {
      if (!engines.has(e.make)) engines.set(e.make, { count: 0, engines: new Map() });
      const g = engines.get(e.make)!;
      if (!seenEngines.has(e.make)) { g.count++; seenEngines.add(e.make); }
      g.engines.set(e.engine, (g.engines.get(e.engine) ?? 0) + 1);
    }
  }

  return {
    makes: [...makes.entries()]
      .map(([name, m]) => ({
        name,
        count: m.count,
        series: [...m.series.entries()]
          .map(([sName, s]) => ({ name: sName, count: s.count, models: [...s.models].sort(naturalSort) }))
          .sort((a, b) => naturalSort(a.name, b.name)),
      }))
      .sort((a, b) => b.count - a.count),
    engines: [...engines.entries()]
      .map(([make, g]) => ({
        make,
        count: g.count,
        engines: [...g.engines.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => naturalSort(a.name, b.name)),
      }))
      .sort((a, b) => b.count - a.count),
  };
}

// Autos y camionetas (applications.vehicles, los carga scripts/import-vehicle-fitments.js):
// Marca -> Modelo -> Año -> Motor. El arbol solo lleva marcas y modelos; los años y
// motores de un modelo se piden aparte (/products/vehicle-years) para no mandar todo.
type VehicleIndex = Map<string, Map<string, Map<number, Map<string, Set<number>>>>>; // marca > modelo > año > motor > ids
let vehicleCache: { at: number; index: VehicleIndex; tree: any } | null = null;

const yearsOf = (ranges: string[] = []) =>
  ranges.flatMap((r) => {
    const [from, to] = r.split('-').map(Number);
    if (!from) return [];
    return Array.from({ length: (to || from) - from + 1 }, (_, i) => from + i);
  });

async function buildVehicleIndex(strapi: any) {
  const rows = await strapi.db.query('api::product.product').findMany({
    where: { active: true, fitVehicles: { $notNull: true } },
    select: ['id', 'applications'],
  });

  const index: VehicleIndex = new Map();
  for (const { id, applications: app } of rows) {
    for (const v of app?.vehicles ?? []) {
      if (!index.has(v.make)) index.set(v.make, new Map());
      const models = index.get(v.make)!;
      if (!models.has(v.model)) models.set(v.model, new Map());
      const years = models.get(v.model)!;
      for (const y of yearsOf(v.years)) {
        if (!years.has(y)) years.set(y, new Map());
        const engines = years.get(y)!;
        if (!engines.has(v.engine ?? '')) engines.set(v.engine ?? '', new Set());
        engines.get(v.engine ?? '')!.add(id);
      }
    }
  }

  // cuantos productos distintos hay por marca y por modelo
  const countIds = (maps: Iterable<Map<string, Set<number>>>) => {
    const ids = new Set<number>();
    for (const engines of maps) for (const s of engines.values()) s.forEach((id) => ids.add(id));
    return ids;
  };
  const tree = {
    makes: [...index.entries()]
      .map(([name, models]) => {
        const modelList = [...models.entries()].map(([model, years]) => ({ name: model, count: countIds(years.values()).size }));
        const count = countIds([...models.values()].flatMap((y) => [...y.values()])).size;
        return { name, count, models: modelList.sort((a, b) => naturalSort(a.name, b.name)) };
      })
      .sort((a, b) => b.count - a.count || naturalSort(a.name, b.name)),
  };
  return { at: Date.now(), index, tree };
}

async function vehicleData(strapi: any) {
  if (!vehicleCache || Date.now() - vehicleCache.at > FITMENT_TTL_MS) vehicleCache = await buildVehicleIndex(strapi);
  return vehicleCache;
}

// Categoria -> Tipos de producto (con conteos) para el menu "Categoria" del
// frontend. Los tipos se agrupan sin distinguir mayusculas ("Balero" y
// "BALERO" son uno) y se muestra la escritura mas usada; el catalogo filtra
// productType con $eqi, asi que cualquiera de las dos encuentra ambas.
let categoryCache: { at: number; data: any } | null = null;
const HIDDEN_TYPES = new Set(['sin clasificar', 'sin especificar', 'n/a']);

async function buildCategoryTree(strapi: any) {
  const rows = await strapi.db.query('api::product.product').findMany({
    where: { active: true },
    select: ['productType'],
    populate: { category: { select: ['categoryName', 'slug'] } },
  });

  const cats = new Map<string, { slug: string; count: number; types: Map<string, Map<string, number>> }>();
  for (const { productType, category } of rows) {
    if (!category?.categoryName) continue;
    if (!cats.has(category.categoryName)) {
      cats.set(category.categoryName, { slug: category.slug, count: 0, types: new Map() });
    }
    const c = cats.get(category.categoryName)!;
    c.count++;
    const type = productType?.trim();
    if (!type || HIDDEN_TYPES.has(type.toLowerCase())) continue;
    const key = type.toLowerCase();
    if (!c.types.has(key)) c.types.set(key, new Map());
    const spellings = c.types.get(key)!;
    spellings.set(type, (spellings.get(type) ?? 0) + 1);
  }

  return [...cats.entries()]
    .map(([name, c]) => ({
      name,
      slug: c.slug,
      count: c.count,
      types: [...c.types.values()]
        .map((spellings) => {
          const sorted = [...spellings.entries()].sort((a, b) => b[1] - a[1]);
          return { name: sorted[0][0], count: sorted.reduce((n, [, v]) => n + v, 0) };
        })
        .sort((a, b) => naturalSort(a.name, b.name)),
    }))
    .sort((a, b) => naturalSort(a.name, b.name));
}

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  async fitmentTree(ctx) {
    if (!fitmentCache || Date.now() - fitmentCache.at > FITMENT_TTL_MS) {
      fitmentCache = { at: Date.now(), data: await buildFitmentTree(strapi) };
    }
    ctx.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    ctx.body = fitmentCache.data;
  },

  async vehicleTree(ctx) {
    const { tree } = await vehicleData(strapi);
    ctx.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    ctx.body = tree;
  },

  // ?make=Nissan&model=Sentra -> [{ year: 2015, count, engines: [{ name: "1.8L", count }] }], año mas nuevo primero
  async vehicleYears(ctx) {
    const { make, model } = ctx.query as { make?: string; model?: string };
    const years = (await vehicleData(strapi)).index.get(make ?? '')?.get(model ?? '');
    ctx.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    ctx.body = [...(years ?? new Map<number, Map<string, Set<number>>>()).entries()]
      .map(([year, engines]) => {
        const ids = new Set<number>();
        engines.forEach((s) => s.forEach((id) => ids.add(id)));
        return {
          year,
          count: ids.size,
          engines: [...engines.entries()]
            .filter(([name]) => name)
            .map(([name, s]) => ({ name, count: s.size }))
            .sort((a, b) => naturalSort(a.name, b.name)),
        };
      })
      .sort((a, b) => b.year - a.year);
  },

  async categoryTree(ctx) {
    if (!categoryCache || Date.now() - categoryCache.at > FITMENT_TTL_MS) {
      categoryCache = { at: Date.now(), data: await buildCategoryTree(strapi) };
    }
    ctx.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    ctx.body = categoryCache.data;
  },

  async find(ctx) {
    const response = await super.find(ctx);
    const allowed = await canSeeWholesalePrice(strapi, ctx.state.user?.id);
    if (!allowed && Array.isArray(response?.data)) {
      response.data.forEach(stripWholesalePrice);
    }
    // se conserva en la pagina del producto (por slug) o si se pide con fields=applications
    const fields = Object.values((ctx.query?.fields as any) ?? {});
    const keep = !!(ctx.query?.filters as any)?.slug || fields.includes('applications');
    if (Array.isArray(response?.data)) response.data.forEach((p: any) => stripFitment(p, keep));
    return response;
  },

  async findOne(ctx) {
    const response = await super.findOne(ctx);
    const allowed = await canSeeWholesalePrice(strapi, ctx.state.user?.id);
    if (!allowed && response?.data) {
      stripWholesalePrice(response.data);
    }
    if (response?.data) stripFitment(response.data, true);
    return response;
  },
}));
