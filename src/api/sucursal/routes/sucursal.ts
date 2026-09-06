/**
 * sucursal router
 *
 * Rutas escritas a mano (no factories.createCoreRouter): find/findOne
 * quedan publicas (auth:false) para la pagina /sucursales de la tienda.
 * create/update/delete quitan la policy de permisos por defecto de Strapi
 * y dejan que el controller decida con el rol real del usuario
 * (isAdminUser) - pero OJO: aunque se quite esa policy, Strapi sigue
 * exigiendo que el rol tenga el checkbox de permiso habilitado para la
 * accion antes de siquiera llamar al controller (un 403 generico, sin
 * pasar por isAdminUser, si no esta habilitado). Por eso el rol "Admin"
 * necesita create/update/delete de sucursal habilitados explicitamente -
 * se hace en el bootstrap (src/index.ts, ensureAdminPermissions) en vez de
 * depender de que alguien lo marque a mano en el panel.
 */

export default {
  routes: [
    {
      method: "GET",
      path: "/sucursales",
      handler: "sucursal.find",
      config: { auth: false, policies: [] },
    },
    {
      method: "GET",
      path: "/sucursales/:id",
      handler: "sucursal.findOne",
      config: { auth: false, policies: [] },
    },
    {
      method: "POST",
      path: "/sucursales",
      handler: "sucursal.create",
      config: { policies: [] },
    },
    {
      method: "PUT",
      path: "/sucursales/:id",
      handler: "sucursal.update",
      config: { policies: [] },
    },
    {
      method: "DELETE",
      path: "/sucursales/:id",
      handler: "sucursal.delete",
      config: { policies: [] },
    },
  ],
};
