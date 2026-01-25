export default {
  routes: [
    {
      method: "POST",
      path: "/openpay-webhook",
      handler: "api::order.order.webhook",
      config: {
        auth: false,
      },
    },
  ],
};
