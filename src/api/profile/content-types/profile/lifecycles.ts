export default {
  async beforeCreate(event: any) {
    const ctx = strapi.requestContext.get();
    const authenticatedUser = ctx?.state?.user;

    if (authenticatedUser) {
      console.log(
        `[Lifecycle] Intentando vincular perfil a: ${authenticatedUser.username} (ID: ${authenticatedUser.id})`
      );

      event.params.data.users_permissions_user = authenticatedUser.id;
    } else {
      console.warn(
        "[Lifecycle] Advertencia: Se intenta crear un perfil sin usuario autenticado."
      );
    }
  },
};
