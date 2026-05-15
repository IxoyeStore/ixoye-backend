import { z } from "zod";

// Schema de validación para registro
const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Password debe tener mínimo 8 caracteres"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  motherLastName: z.string().optional(),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
});

export default {
  async customRegister(ctx) {
    try {
      const validatedData = registerSchema.parse(ctx.request.body);

      const {
        email,
        password,
        firstName,
        lastName,
        motherLastName,
        phone,
        birthDate,
      } = validatedData;

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

      const user = await strapi
        .plugin("users-permissions")
        .service("user")
        .add({
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
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return ctx.badRequest("Datos inválidos", {
          errors: error.issues.map((e) => e.message),
        });
      }
      throw error;
    }
  },
};
