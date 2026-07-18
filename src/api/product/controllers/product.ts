/**
 * product controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::product.product', ({ strapi }) => ({
  // Diagnostic: exposes the resolved join-table info for the `category` relation.
  async relationInfo(ctx) {
    try {
      const meta = strapi.db.metadata.get('api::product.product');
      const attr: any = meta.attributes.category;
      const subDeptAttr: any = meta.attributes.subDepartment;
      ctx.body = {
        productsTable: meta.tableName,
        relationType: attr?.relation,
        hasJoinTable: !!attr?.joinTable,
        joinTableName: attr?.joinTable?.name ?? null,
        joinColumnName: attr?.joinTable?.joinColumn?.name ?? null,
        inverseJoinColumnName: attr?.joinTable?.inverseJoinColumn?.name ?? null,
        joinColumnDirect: attr?.joinColumn?.name ?? null,
        subDeptColumnName: subDeptAttr?.columnName ?? null,
      };
    } catch (e: any) {
      ctx.body = { error: e.message, stack: e.stack };
    }
  },

  // One-off bulk assignment: sets `category` for every product in a subDepartment,
  // via 2 set-based SQL statements per group instead of one write per row.
  async bulkCategorize(ctx) {
    const mapping = ctx.request.body?.mapping;
    if (!mapping || typeof mapping !== 'object') {
      return ctx.badRequest('Body must be { "mapping": { "<subDepartment>": categoryId, ... } }');
    }

    let meta, attr, joinTable, subDeptCol, knex, linkTable, productCol, categoryCol, productsTable;
    try {
      meta = strapi.db.metadata.get('api::product.product');
      attr = meta.attributes.category as any;
      joinTable = attr.joinTable;
      if (!joinTable) {
        return ctx.internalServerError('category relation has no joinTable metadata (may be a direct joinColumn instead)');
      }
      const subDeptAttr: any = meta.attributes.subDepartment;
      subDeptCol = subDeptAttr.columnName || 'sub_department';

      knex = strapi.db.connection;
      linkTable = joinTable.name;
      productCol = joinTable.joinColumn.name; // FK -> products.id
      categoryCol = joinTable.inverseJoinColumn.name; // FK -> categories.id
      productsTable = meta.tableName;
    } catch (e: any) {
      return ctx.body = { setupError: e.message };
    }

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
