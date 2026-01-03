import type { Context } from "koa";

const normalize = (value?: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export default {
  async updateMe(ctx: Context) {
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized();
    }

    const body = ctx.request.body as {
      firstName?: string;
      lastName?: string;
      motherLastName?: string;
      phone?: string;
      birthDate?: string;
    };

    const updatedUser = await strapi.entityService.update(
      "plugin::users-permissions.user",
      user.id,
      {
        data: {
          firstName: normalize(body.firstName),
          lastName: normalize(body.lastName),
          motherLastName: normalize(body.motherLastName),
          phone: normalize(body.phone),
          birthDate: body.birthDate || null,
        },
      }
    );

    ctx.body = updatedUser;
  },
};
