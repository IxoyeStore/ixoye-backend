export default {
  routes: [
    {
      method: 'POST',
      path: '/products/bulk-categorize',
      handler: 'product.bulkCategorize',
      config: {},
    },
  ],
};
