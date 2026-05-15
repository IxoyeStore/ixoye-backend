import { factories } from "@strapi/strapi";
import { rateLimitMiddleware } from "../../../middlewares/ratelimit";

export default factories.createCoreRouter("api::order.order", {
  config: {
    create: {
      middlewares: [
        rateLimitMiddleware(10, 60 * 1000), // 10 órdenes por minuto
      ],
    },
  },
});
