export default {
  async customRegister(ctx) {
    const {
      email,
      password,
      firstName,
      lastName,
      motherLastName,
      phone,
      birthDate,
    } = ctx.request.body;

    if (!email || !password) {
      return ctx.badRequest("Email and password are required");
    }

    const normalizedEmail = email.toLowerCase();

    const userQuery = strapi.db.query("plugin::users-permissions.user");

    const emailExists = await userQuery.findOne({
      where: { email: normalizedEmail },
    });

    if (emailExists) {
      return ctx.badRequest("El correo ya está registrado");
    }

    if (phone) {
      const phoneExists = await userQuery.findOne({
        where: { phone },
      });

      if (phoneExists) {
        return ctx.badRequest("El número de teléfono ya está registrado");
      }
    }

    const role = await strapi.db
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "authenticated" } });

    const user = await strapi.plugin("users-permissions").service("user").add({
      email: normalizedEmail,
      username: normalizedEmail,
      password,
      confirmed: true,
      role: role.id,
    });

    const jwt = strapi
      .plugin("users-permissions")
      .service("jwt")
      .issue({ id: user.id });

    ctx.body = { jwt, user };
  },
};
