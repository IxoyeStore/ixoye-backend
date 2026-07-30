/**
 * sucursal router
 *
 * Rutas escritas a mano (no factories.createCoreRouter) para no depender
 * de que alguien habilite los checkboxes de permisos en el panel de
 * Strapi: find/findOne quedan publicas de una vez, y create/update/delete
 * pasan sin la policy de permisos - el controller es el que decide con el
 * rol real del usuario (isAdminUser).
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
