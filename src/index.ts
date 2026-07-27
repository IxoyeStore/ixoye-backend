// Acciones que el rol "Public" (sin autenticacion) nunca debe poder
// ejecutar, porque exponen datos personales de clientes. Se revocan en
// cada arranque para que no se puedan volver a habilitar por accidente
// desde el panel de Strapi sin que alguien edite este archivo.
const PUBLIC_ROLE_FORBIDDEN_ACTIONS = [
  "api::profile.profile.find",
  "api::profile.profile.findOne",
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

export default {
  register() {},
  async bootstrap({ strapi }: { strapi: any }) {
    await revokeForbiddenPublicPermissions({ strapi });
  },
};
