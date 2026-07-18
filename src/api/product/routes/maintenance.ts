export default {
  routes: [
    {
      method: 'GET',
      path: '/products/relation-info',
      handler: 'product.relationInfo',
      config: {},
    },
    {
      method: 'POST',
      path: '/products/bulk-categorize',
      handler: 'product.bulkCategorize',
      config: {},
    },
  ],
};
