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

export default {
  register() {},
  async bootstrap({ strapi }: { strapi: any }) {
    await revokeForbiddenPublicPermissions({ strapi });
    await ensureAuthenticatedPermissions({ strapi });
  },
};
