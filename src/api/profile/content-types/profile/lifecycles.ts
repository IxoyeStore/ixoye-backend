export default {
  async beforeCreate(event: any) {
    const ctx = (strapi as any).requestContext.get();
    const authenticatedUser = ctx?.state?.user;

    if (authenticatedUser) {
      const existingProfile = await strapi.db
        .query("api::profile.profile")
        .findOne({
          where: { users_permissions_user: authenticatedUser.id },
        });

      if (existingProfile) {
        throw new Error("El usuario ya cuenta con un perfil asociado.");
      }

      console.log(
        `[Lifecycle] Vinculando nuevo perfil a: ${authenticatedUser.username}`
      );

      event.params.data.users_permissions_user = authenticatedUser.id;
    } else {
      console.warn(
        "[Lifecycle] Advertencia: Intento de creación de perfil sin sesión activa."
      );
    }
  },
};
