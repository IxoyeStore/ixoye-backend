export default {
  routes: [
    {
      method: "GET",
      path: "/products/category-tree",
      handler: "product.categoryTree",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/products/vehicle-tree",
      handler: "product.vehicleTree",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/products/vehicle-years",
      handler: "product.vehicleYears",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/products/fitment-tree",
      handler: "product.fitmentTree",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
