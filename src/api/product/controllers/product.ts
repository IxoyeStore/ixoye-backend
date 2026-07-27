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

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  async find(ctx) {
    const response = await super.find(ctx);
    const allowed = await canSeeWholesalePrice(strapi, ctx.state.user?.id);
    if (!allowed && Array.isArray(response?.data)) {
      response.data.forEach(stripWholesalePrice);
    }
    return response;
  },

  async findOne(ctx) {
    const response = await super.findOne(ctx);
    const allowed = await canSeeWholesalePrice(strapi, ctx.state.user?.id);
    if (!allowed && response?.data) {
      stripWholesalePrice(response.data);
    }
    return response;
  },
}));
