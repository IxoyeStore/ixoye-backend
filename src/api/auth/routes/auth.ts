import { rateLimitMiddleware } from "../../../middlewares/ratelimit";

export default {
  routes: [
    {
      method: "POST",
      path: "/custom-register",
      handler: "api::auth.auth.customRegister",
      config: {
        auth: false,
        middlewares: [
          rateLimitMiddleware(5, 60 * 1000), // 5 intentos por minuto
        ],
      },
    },
  ],
};
