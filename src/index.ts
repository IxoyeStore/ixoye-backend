// Acciones que el rol "Public" (sin autenticacion) nunca debe poder
// ejecutar, porque exponen datos personales de clientes. Se revocan en
// cada arranque para que no se puedan volver a habilitar por accidente
// desde el panel de Strapi sin que alguien edite este archivo.
const PUBLIC_ROLE_FORBIDDEN_ACTIONS = [
  "api::profile.profile.find",
  "api::profile.profile.findOne",
];

// Acciones personalizadas (no son find/create/update estandar) que un
// cliente autenticado si debe poder ejecutar. Strapi no las habilita solo
// por tener una ruta definida, hay que otorgar el permiso explicitamente.
// Se asegura en cada arranque porque no hay acceso al panel de Strapi en
// produccion para hacerlo a mano.
const AUTHENTICATED_ROLE_REQUIRED_ACTIONS = [
  "api::profile.profile.find",
  "api::profile.profile.create",
  "api::profile.profile.update",
  "api::device-token.device-token.register",
  "api::order.order.status",
  "api::order.order.find",
  "api::order.order.findOne",
  "api::order.order.create",
  "api::address.address.find",
  "api::address.address.findOne",
  "api::address.address.create",
  "api::address.address.update",
  "api::address.address.delete",
];

async function revokeForbiddenPublicPermissions({ strapi }: { strapi: any }) {
  try {
    const publicRole = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "public" } });

    if (!publicRole) return;

    const leakedPermissions = await strapi
      .query("plugin::users-permissions.permission")
      .findMany({
        where: {
          action: { $in: PUBLIC_ROLE_FORBIDDEN_ACTIONS },
          role: publicRole.id,
        },
      });

    if (leakedPermissions.length === 0) return;

    for (const permission of leakedPermissions) {
      await strapi
        .query("plugin::users-permissions.permission")
        .delete({ where: { id: permission.id } });
    }

    strapi.log.warn(
      `🔒 Se revocaron ${leakedPermissions.length} permiso(s) publicos que exponian datos personales: ${leakedPermissions.map((p: any) => p.action).join(", ")}`,
    );
  } catch (err) {
    strapi.log.error("Error al revisar permisos publicos prohibidos:", err);
  }
}

async function ensureAuthenticatedPermissions({ strapi }: { strapi: any }) {
  try {
    const authRole = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "authenticated" } });

    if (!authRole) return;

    const existing = await strapi
      .query("plugin::users-permissions.permission")
      .findMany({
        where: { action: { $in: AUTHENTICATED_ROLE_REQUIRED_ACTIONS }, role: authRole.id },
      });
    const existingActions = new Set(existing.map((p: any) => p.action));
    const missing = AUTHENTICATED_ROLE_REQUIRED_ACTIONS.filter((a) => !existingActions.has(a));

    if (missing.length === 0) return;

    for (const action of missing) {
      await strapi.query("plugin::users-permissions.permission").create({
        data: { action, role: authRole.id },
      });
    }

    strapi.log.info(
      `🔓 Se otorgaron ${missing.length} permiso(s) al rol Authenticated: ${missing.join(", ")}`,
    );
  } catch (err) {
    strapi.log.error("Error al otorgar permisos requeridos a Authenticated:", err);
  }
}

// Sucursales que ya existian hardcodeadas en el frontend antes de que este
// content-type existiera. Se siembran una sola vez (si la tabla esta vacia)
// para que la pagina publica /sucursales no se quede en blanco justo
// despues de este deploy, mientras alguien las revisa/edita desde el
// nuevo panel de admin.
const DEFAULT_SUCURSALES = [
  {
    name: "Sucursal Libramiento Matriz",
    address: "Libramiento 312, Los Sauces (Reserva Territorial), Los Sauces, 63197 Tepic, Nay.",
    mapsUrl: "https://maps.app.goo.gl/6K8vxpxve8PYhX9a6",
  },
  {
    name: "Sucursal Emmark Libramiento",
    address: "Vicente Guerrero 298, Plan de Ayala, 63197 Tepic, Nay.",
    mapsUrl: "https://maps.app.goo.gl/3wMHA5AYVYG4CdjRA",
  },
  {
    name: "Sucursal Mezcales",
    address: "Av. San Vicente 800, Las Parotas, 63735 Mezcales, Nay.",
    mapsUrl: "https://maps.app.goo.gl/BJ4EpFc1UgbwXhVS7",
  },
  {
    name: "Sucursal Xalisco",
    address: "Blvd. Tepic-Xalisco 58, Lomas del Nayar, 63782 Xalisco, Nay.",
    mapsUrl: "https://maps.app.goo.gl/Pvr9fe6UpE3rYB7v6",
  },
  {
    name: "Sucursal San Cayetano",
    address: "Insurgentes 3, Vivero, 63511 San Cayetano, Nay.",
    mapsUrl: "https://maps.app.goo.gl/R6cn28jY9XVFEo5T9",
  },
  {
    name: "Sucursal Bucerías",
    address: "Av. Héroes de Nacozari, Flamingos, 63732 Flamingos, Nay.",
    mapsUrl: "https://maps.app.goo.gl/RUo5wi8PFk7XDab79",
  },
  {
    name: "Sucursal La Peñita",
    address: "México 200, Paraíso Escondido, 63720 Paraíso Escondido, Nay.",
    mapsUrl: "https://maps.app.goo.gl/9pAtNdJ35nK81cxq7",
  },
];

async function seedDefaultSucursales({ strapi }: { strapi: any }) {
  try {
    const count = await strapi.documents("api::sucursal.sucursal").count({});
    if (count > 0) return;

    for (const data of DEFAULT_SUCURSALES) {
      await strapi.documents("api::sucursal.sucursal").create({ data });
    }

    strapi.log.info(
      `🏬 Se sembraron ${DEFAULT_SUCURSALES.length} sucursal(es) por defecto (tabla vacia).`,
    );
  } catch (err) {
    strapi.log.error("Error al sembrar sucursales por defecto:", err);
  }
}

export default {
  register() {},
  async bootstrap({ strapi }: { strapi: any }) {
    await revokeForbiddenPublicPermissions({ strapi });
    await ensureAuthenticatedPermissions({ strapi });
    await seedDefaultSucursales({ strapi });
  },
};
