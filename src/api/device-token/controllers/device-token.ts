/**
 * device-token controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController(
  'api::device-token.device-token',
  ({ strapi }) => ({
    // El mismo telefono puede haber quedado registrado antes con otra
    // cuenta (logout/login de otro cliente en el mismo dispositivo), asi
    // que el token es unico globalmente: si ya existe se re-asigna al
    // usuario en sesion en vez de crear un duplicado.
    async register(ctx) {
      const userId = ctx.state.user?.id;
      if (!userId) return ctx.unauthorized();

      const body = ctx.request.body?.data || ctx.request.body || {};
      const token = body.token;
      const platform = body.platform || 'android';

      if (!token || typeof token !== 'string') {
        return ctx.badRequest('Falta el token del dispositivo.');
      }

      const existing = await strapi.db
        .query('api::device-token.device-token')
        .findOne({ where: { token } });

      if (existing) {
        await strapi.documents('api::device-token.device-token').update({
          documentId: existing.documentId,
          data: { users_permissions_user: userId, platform },
        });
      } else {
        await strapi.documents('api::device-token.device-token').create({
          data: { token, platform, users_permissions_user: userId },
        });
      }

      return { data: { ok: true } };
    },
  }),
);
