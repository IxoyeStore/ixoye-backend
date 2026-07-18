/**
 * product controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  async bulkCategorize(ctx) {
    const mapping = ctx.request.body?.mapping;
    if (!mapping || typeof mapping !== 'object') {
      return ctx.badRequest('Body must be { "mapping": { "<subDepartment>": categoryId, ... } }');
    }

    const results = [];
    for (const [subDepartment, categoryId] of Object.entries(mapping)) {
      const { count } = await strapi.db.query('api::product.product').updateMany({
        where: { subDepartment },
        data: { category: categoryId },
      });
      results.push({ subDepartment, categoryId, count });
    }

    ctx.body = { results };
  },
}));
