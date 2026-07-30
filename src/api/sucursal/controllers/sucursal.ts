/**
 * sucursal controller
 *
 * Lectura publica (la usa la pagina /sucursales de la tienda, sin sesion).
 * Escritura (crear/editar/eliminar) solo para el rol Admin - se valida
 * aqui mismo en vez de depender de los checkboxes de permisos de Strapi,
 * igual que el resto de controllers de este proyecto (address, order,
 * profile).
 */

import { factories } from "@strapi/strapi";

async function isAdminUser(strapi: any, userId?: number): Promise<boolean> {
  if (!userId) return false;
  const user = await strapi
    .query("plugin::users-permissions.user")
    .findOne({ where: { id: userId }, populate: ["role"] });
  return user?.role?.name === "Admin";
}

export default factories.createCoreController(
  "api::sucursal.sucursal",
  ({ strapi }) => ({
    async create(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId || !(await isAdminUser(strapi, userId))) {
        return ctx.forbidden("Solo el administrador puede agregar sucursales.");
      }
      return super.create(ctx);
    },

    async update(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId || !(await isAdminUser(strapi, userId))) {
        return ctx.forbidden("Solo el administrador puede editar sucursales.");
      }
      return super.update(ctx);
    },

    async delete(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId || !(await isAdminUser(strapi, userId))) {
        return ctx.forbidden("Solo el administrador puede eliminar sucursales.");
      }
      return super.delete(ctx);
    },
  }),
);
