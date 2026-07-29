/**
 * profile controller
 */

import { factories } from '@strapi/strapi';

async function isAdminUser(strapi: any, userId?: number): Promise<boolean> {
  if (!userId) return false;
  const user = await strapi
    .query('plugin::users-permissions.user')
    .findOne({ where: { id: userId }, populate: ['role'] });
  return user?.role?.name === 'Admin';
}

export default factories.createCoreController(
  'api::profile.profile',
  ({ strapi }) => ({
    // Igual que con el body en create/update, Strapi rechaza la llave de
    // relacion "users_permissions_user" en los FILTROS para roles no-admin
    // ("Invalid key..."), asi que /api/me nunca podia leer el perfil real
    // de ningun cliente (siempre le llegaba profile:null aunque existiera
    // en la base). Se bypassa super.find() y se devuelve directo el unico
    // perfil que puede pertenecer al usuario autenticado.
    async find(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId) return ctx.unauthorized();

      if (await isAdminUser(strapi, userId)) {
        return super.find(ctx);
      }

      const profile = await strapi
        .documents('api::profile.profile')
        .findFirst({ filters: { users_permissions_user: userId } as any });

      return {
        data: profile ? [profile] : [],
        meta: {
          pagination: { page: 1, pageSize: 25, pageCount: 1, total: profile ? 1 : 0 },
        },
      };
    },

    // El sanitizer del controller estandar de Strapi rechaza la llave de
    // relacion "users_permissions_user" en el body para roles no-admin
    // ("Invalid key..."), asi que un cliente nunca podia crear su propio
    // perfil via POST /api/profiles. Se bypassa super.create() y se usa el
    // Document Service directo, forzando el dueno desde la sesion (nunca
    // desde el body) para que nadie pueda crear un perfil a nombre de otro.
    async create(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId) return ctx.unauthorized();

      const existing = await strapi.db.query('api::profile.profile').findOne({
        where: { users_permissions_user: userId },
      });
      if (existing) {
        return ctx.badRequest('Ya tienes un perfil registrado.');
      }

      const { users_permissions_user, ...fields } =
        ctx.request.body?.data || {};

      const created = await strapi.documents('api::profile.profile').create({
        data: { ...fields, users_permissions_user: userId },
      });

      return { data: created };
    },

    // Mismo problema que create() con la llave de relacion; ademas se
    // valida que el perfil que se intenta editar sea el del propio usuario
    // (o que quien edita sea Admin), para que nadie pueda modificar el
    // perfil de otro cliente conociendo su documentId.
    async update(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId) return ctx.unauthorized();

      const { id: documentId } = ctx.params;
      const admin = await isAdminUser(strapi, userId);

      const profile = await strapi.documents('api::profile.profile').findOne({
        documentId,
        populate: ['users_permissions_user'],
      });
      if (!profile) return ctx.notFound();

      const ownerId = (profile as any).users_permissions_user?.id;
      if (!admin && ownerId !== userId) return ctx.forbidden();

      const { users_permissions_user, ...fields } =
        ctx.request.body?.data || {};

      const updated = await strapi.documents('api::profile.profile').update({
        documentId,
        data: fields,
      });

      return { data: updated };
    },
  }),
);
