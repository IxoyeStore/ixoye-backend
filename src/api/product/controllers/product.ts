/**
 * product controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::product.product', ({ strapi }) => ({\n  async bulkCategorize(ctx) {
    const mapping = ctx.request.body?.mapping;
    if (!mapping || typeof mapping !== 'object' || Object.keys(mapping).length === 0) {
      return ctx.badRequest('Body must be { "mapping": { "<subDepartment>": categoryId, ... } }');
    }

    // Validate all categoryIds exist and are valid
    const invalidEntries = Object.entries(mapping).filter(
      ([, categoryId]) => categoryId === null || categoryId === undefined || (typeof categoryId !== 'number' && isNaN(Number(categoryId)))
    );
    if (invalidEntries.length > 0) {
      return ctx.badRequest(
        `Invalid categoryId values: ${invalidEntries.map(([sub, id]) => `${sub}=${id}`).join(', ')}. All categoryIds must be valid numbers.`
      );
    }

    const results = [];
    for (const [subDepartment, categoryId] of Object.entries(mapping)) {
      try {
        const { count } = await strapi.db.query('api::product.product').updateMany({
          where: { subDepartment },
          data: { category: Number(categoryId) },
        });
        results.push({ subDepartment, categoryId: Number(categoryId), count, status: 'success' });
      } catch (error) {
        results.push({ subDepartment, categoryId: Number(categoryId), status: 'error', error: error.message });
      }
    }

    ctx.body = { results };
  },
}));

