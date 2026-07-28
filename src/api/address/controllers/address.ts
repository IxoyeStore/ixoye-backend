/**
 * address controller
 *
 * Las direcciones son datos personales sensibles (calle, colonia, CP).
 * Por defecto, Strapi no restringe find/update/delete por dueno del
 * registro - cualquier usuario autenticado con el permiso podia listar
 * TODAS las direcciones de TODOS los clientes, y modificar/crear
 * direcciones a nombre de otro usuario. Este controlador fuerza que un
 * cliente normal solo pueda ver y tocar sus propias direcciones; el
 * rol Admin conserva acceso completo (lo necesita para mostrar la
 * direccion de envio en el detalle de un pedido).
 */

import { factories } from "@strapi/strapi";

async function isAdminUser(strapi: any, userId?: number): Promise<boolean> {
  if (!userId) return false;
  const user = await strapi
    .query("plugin::users-permissions.user")
    .findOne({ where: { id: userId }, populate: ["role"] });
  return user?.role?.name === "Admin";
}

function ownerId(address: any): number | undefined {
  const rel = address?.users_permissions_user;
  return typeof rel === "object" ? rel?.id : rel;
}

export default factories.createCoreController(
  "api::address.address",
  ({ strapi }) => ({
    async find(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId) return ctx.unauthorized();

      if (await isAdminUser(strapi, userId)) {
        return super.find(ctx);
      }

      // No usar el filtro publico por relacion (Strapi lo rechaza para
      // roles no-admin); se consulta directo con el servicio interno,
      // que no pasa por esa sanitizacion.
      const page = Number((ctx.query as any).pagination?.page) || 1;
      const pageSize = Math.min(
        Number((ctx.query as any).pagination?.pageSize) || 25,
        100,
      );

      const [results, total] = await Promise.all([
        strapi.documents("api::address.address").findMany({
          filters: { users_permissions_user: userId } as any,
          sort: { isDefault: "desc" } as any,
          limit: pageSize,
          start: (page - 1) * pageSize,
        }),
        strapi.documents("api::address.address").count({
          filters: { users_permissions_user: userId } as any,
        }),
      ]);

      return {
        data: results,
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount: Math.max(1, Math.ceil(total / pageSize)),
            total,
          },
        },
      };
    },

    async findOne(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId) return ctx.unauthorized();

      const admin = await isAdminUser(strapi, userId);
      const { id: documentId } = ctx.params;

      const address = await strapi.documents("api::address.address").findOne({
        documentId,
        populate: ["users_permissions_user"],
      });

      if (!address) return ctx.notFound();
      if (!admin && ownerId(address) !== userId) return ctx.notFound();

      const { users_permissions_user, ...safe } = address as any;
      return { data: safe };
    },

    async create(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId) return ctx.unauthorized();

      const admin = await isAdminUser(strapi, userId);
      const body = ctx.request.body?.data;
      if (!body) return ctx.badRequest();

      // El sanitizador publico de Strapi rechaza "users_permissions_user"
      // como llave (tanto en filtros como en el body de create) para
      // roles no-admin, asi que no se puede pasar por super.create() aqui.
      // Se crea directo con el servicio interno, forzando siempre el
      // dueno real salvo que sea un admin creando a nombre de otro.
      const targetOwnerId = !admin ? userId : (body.users_permissions_user ?? userId);
      const { users_permissions_user: _ignored, ...rest } = body;

      const created = await strapi.documents("api::address.address").create({
        data: { ...rest, users_permissions_user: targetOwnerId } as any,
      });

      ctx.status = 200;
      return { data: created };
    },

    async update(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId) return ctx.unauthorized();

      const admin = await isAdminUser(strapi, userId);
      const { id: documentId } = ctx.params;

      const existing = await strapi.documents("api::address.address").findOne({
        documentId,
        populate: ["users_permissions_user"],
      });
      if (!existing) return ctx.notFound();
      if (!admin && ownerId(existing) !== userId) return ctx.notFound();

      if (!admin && ctx.request.body?.data) {
        delete ctx.request.body.data.users_permissions_user;
      }

      return super.update(ctx);
    },

    async delete(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId) return ctx.unauthorized();

      const admin = await isAdminUser(strapi, userId);
      const { id: documentId } = ctx.params;

      const existing = await strapi.documents("api::address.address").findOne({
        documentId,
        populate: ["users_permissions_user"],
      });
      if (!existing) return ctx.notFound();
      if (!admin && ownerId(existing) !== userId) return ctx.notFound();

      return super.delete(ctx);
    },
  }),
);
