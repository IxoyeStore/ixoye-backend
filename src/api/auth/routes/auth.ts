// src/api/auth/routes/auth.ts
export default {
  routes: [
    {
      method: "POST",
      path: "/custom-register",
      handler: "api::auth.auth.customRegister",
      config: {
        auth: false,
      },
    },
  ],
};
