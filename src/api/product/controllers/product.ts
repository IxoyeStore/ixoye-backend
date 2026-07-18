/**
 * product controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  // Diagnostic: exposes the resolved join-table info for the `category` relation.
  async relationInfo(ctx) {
    const meta = strapi.db.metadata.get('api::product.product');
    const attr: any = meta.attributes.category;
    ctx.body = {
      productsTable: meta.tableName,
      relationAttribute: attr,
    };
  },

  // One-off bulk assignment: sets `category` for every product in a subDepartment,
  // via 2 set-based SQL statements per group instead of one write per row.
  async bulkCategorize(ctx) {
    const mapping = ctx.request.body?.mapping;
    if (!mapping || typeof mapping !== 'object') {
      return ctx.badRequest('Body must be { "mapping": { "<subDepartment>": categoryId, ... } }');
    }

    const meta = strapi.db.metadata.get('api::product.product');
    const attr: any = meta.attributes.category;
    const joinTable = attr.joinTable;
    if (!joinTable) {
      return ctx.internalServerError('category relation has no joinTable metadata');
    }
    const subDeptAttr: any = meta.attributes.subDepartment;
    const subDeptCol = subDeptAttr.columnName || 'sub_department';

    const knex = strapi.db.connection;
    const linkTable = joinTable.name;
    const productCol = joinTable.joinColumn.name; // FK -> products.id
    const categoryCol = joinTable.inverseJoinColumn.name; // FK -> categories.id
    const productsTable = meta.tableName;

    const results = [];
    for (const [subDepartment, categoryIdRaw] of Object.entries(mapping)) {
      const categoryId = Number(categoryIdRaw);
      const trx = await knex.transaction();
      try {
        const deleted = await trx(linkTable)
          .whereIn(productCol, trx(productsTable).select('id').where({ [subDeptCol]: subDepartment }))
          .del();

        const inserted = await trx.raw(
          `INSERT INTO ?? (??, ??) SELECT id, ? FROM ?? WHERE ?? = ?`,
          [linkTable, productCol, categoryCol, categoryId, productsTable, subDeptCol, subDepartment]
        );

        await trx.commit();
        results.push({ subDepartment, categoryId, deleted, inserted: inserted.rowCount ?? null });
      } catch (e: any) {
        await trx.rollback();
        results.push({ subDepartment, categoryId, error: e.message });
      }
    }

    ctx.body = { linkTable, productCol, categoryCol, subDeptCol, results };
  },
}));
