/**
 * device-token router
 *
 * No se expone el CRUD estandar: un token de push no tiene razon para
 * listarse/editarse por su documentId como cualquier otro recurso, solo
 * necesita una forma de "registrar el token de este dispositivo para el
 * usuario en sesion".
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/device-tokens/register',
      handler: 'device-token.register',
      config: {
        policies: [],
      },
    },
  ],
};
