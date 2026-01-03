// src/api/auth/controllers/auth.ts
export default {
  async customRegister(ctx) {
    const {
      email,
      password,
      username,
      firstName,
      lastName,
      motherLastName,
      phone,
      birthDate,
    } = ctx.request.body;

    if (!email || !password) {
      return ctx.badRequest("Email and password are required");
    }

    const role = await strapi.db
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "authenticated" } });

    const user = await strapi
      .plugin("users-permissions")
      .service("user")
      .add({
        email: email.toLowerCase(),
        username: username || email,
        password,
        confirmed: true,
        role: role.id,
        firstName,
        lastName,
        motherLastName,
        phone,
        birthDate,
      });

    const jwt = strapi
      .plugin("users-permissions")
      .service("jwt")
      .issue({ id: user.id });

    ctx.body = { jwt, user };
  },
};
