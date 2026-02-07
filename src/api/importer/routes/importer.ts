export default {
  routes: [
    {
      method: "POST",
      path: "/importers/process",
      handler: "api::importer.importer.process",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/importers",
      handler: "api::importer.importer.find",
      config: {},
    },
    {
      method: "GET",
      path: "/importers/:id",
      handler: "api::importer.importer.findOne",
      config: {},
    },
    {
      method: "POST",
      path: "/importers",
      handler: "api::importer.importer.create",
      config: {},
    },
    {
      method: "PUT",
      path: "/importers/:id",
      handler: "api::importer.importer.update",
      config: {},
    },
    {
      method: "DELETE",
      path: "/importers/:id",
      handler: "api::importer.importer.delete",
      config: {},
    },
  ],
};
