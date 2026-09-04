export default {
  routes: [
    {
      method: "POST",
      path: "/orders/webhook",
      handler: "order.webhook",
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "GET",
      path: "/orders/status/:stripeId",
      handler: "order.status",
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: "POST",
      path: "/orders/:id/verify-payment",
      handler: "order.verifyPayment",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
