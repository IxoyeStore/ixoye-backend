// Acciones que el rol "Public" (sin autenticacion) nunca debe poder
// ejecutar, porque exponen datos personales de clientes. Se revocan en
// cada arranque para que no se puedan volver a habilitar por accidente
// desde el panel de Strapi sin que alguien edite este archivo.
const PUBLIC_ROLE_FORBIDDEN_ACTIONS = [
  "api::profile.profile.find",
  "api::profile.profile.findOne",
];

// Acciones personalizadas (no son find/create/update estandar) que un
// cliente autenticado si debe poder ejecutar. Strapi no las habilita solo
// por tener una ruta definida, hay que otorgar el permiso explicitamente.
// Se asegura en cada arranque porque no hay acceso al panel de Strapi en
// produccion para hacerlo a mano.
const AUTHENTICATED_ROLE_REQUIRED_ACTIONS = [
  "api::profile.profile.find",
  "api::profile.profile.create",
  "api::profile.profile.update",
  "api::device-token.device-token.register",
  "api::order.order.status",
  "api::order.order.find",
  "api::order.order.findOne",
  "api::order.order.create",
  "api::address.address.find",
  "api::address.address.findOne",
  "api::address.address.create",
  "api::address.address.update",
  "api::address.address.delete",
];

// Acciones que el rol custom "Admin" (plugin::users-permissions.role,
// distinto del superadmin del panel de Strapi) necesita para poder usar el
// panel de admin de la tienda. Strapi exige el checkbox de permiso
// habilitado para la accion ANTES de llegar al controller, incluso en
// rutas escritas a mano con policies:[] (el controller de sucursal valida
// isAdminUser aparte, pero eso nunca corre si el permiso no esta
// habilitado - da un 403 generico). Se asegura en cada arranque porque no
// hay acceso al panel de Strapi en produccion para marcar el checkbox a mano.
const ADMIN_ROLE_REQUIRED_ACTIONS = [
  "api::sucursal.sucursal.create",
  "api::sucursal.sucursal.update",
  "api::sucursal.sucursal.delete",
];

async function ensureAdminPermissions({ strapi }: { strapi: any }) {
  try {
    const adminRole = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { name: "Admin" } });

    if (!adminRole) return;

    const existing = await strapi
      .query("plugin::users-permissions.permission")
      .findMany({
        where: { action: { $in: ADMIN_ROLE_REQUIRED_ACTIONS }, role: adminRole.id },
      });
    const existingActions = new Set(existing.map((p: any) => p.action));
    const missing = ADMIN_ROLE_REQUIRED_ACTIONS.filter((a) => !existingActions.has(a));

    if (missing.length === 0) return;

    for (const action of missing) {
      await strapi.query("plugin::users-permissions.permission").create({
        data: { action, role: adminRole.id },
      });
    }

    strapi.log.info(
      `🔓 Se otorgaron ${missing.length} permiso(s) al rol Admin: ${missing.join(", ")}`,
    );
  } catch (err) {
    strapi.log.error("Error al otorgar permisos requeridos a Admin:", err);
  }
}

async function revokeForbiddenPublicPermissions({ strapi }: { strapi: any }) {
  try {
    const publicRole = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "public" } });

    if (!publicRole) return;

    const leakedPermissions = await strapi
      .query("plugin::users-permissions.permission")
      .findMany({
        where: {
          action: { $in: PUBLIC_ROLE_FORBIDDEN_ACTIONS },
          role: publicRole.id,
        },
      });

    if (leakedPermissions.length === 0) return;

    for (const permission of leakedPermissions) {
      await strapi
        .query("plugin::users-permissions.permission")
        .delete({ where: { id: permission.id } });
    }

    strapi.log.warn(
      `🔒 Se revocaron ${leakedPermissions.length} permiso(s) publicos que exponian datos personales: ${leakedPermissions.map((p: any) => p.action).join(", ")}`,
    );
  } catch (err) {
    strapi.log.error("Error al revisar permisos publicos prohibidos:", err);
  }
}

async function ensureAuthenticatedPermissions({ strapi }: { strapi: any }) {
  try {
    const authRole = await strapi
      .query("plugin::users-permissions.role")
      .findOne({ where: { type: "authenticated" } });

    if (!authRole) return;

    const existing = await strapi
      .query("plugin::users-permissions.permission")
      .findMany({
        where: { action: { $in: AUTHENTICATED_ROLE_REQUIRED_ACTIONS }, role: authRole.id },
      });
    const existingActions = new Set(existing.map((p: any) => p.action));
    const missing = AUTHENTICATED_ROLE_REQUIRED_ACTIONS.filter((a) => !existingActions.has(a));

    if (missing.length === 0) return;

    for (const action of missing) {
      await strapi.query("plugin::users-permissions.permission").create({
        data: { action, role: authRole.id },
      });
    }

    strapi.log.info(
      `🔓 Se otorgaron ${missing.length} permiso(s) al rol Authenticated: ${missing.join(", ")}`,
    );
  } catch (err) {
    strapi.log.error("Error al otorgar permisos requeridos a Authenticated:", err);
  }
}

// Sucursales que ya existian hardcodeadas en el frontend antes de que este
// content-type existiera. Se siembran una sola vez (si la tabla esta vacia)
// para que la pagina publica /sucursales no se quede en blanco justo
// despues de este deploy, mientras alguien las revisa/edita desde el
// nuevo panel de admin.
const DEFAULT_SUCURSALES = [
  {
    name: "Sucursal Libramiento Matriz",
    address: "Libramiento 312, Los Sauces (Reserva Territorial), Los Sauces, 63197 Tepic, Nay.",
    mapsUrl: "https://maps.app.goo.gl/6K8vxpxve8PYhX9a6",
  },
  {
    name: "Sucursal Emmark Libramiento",
    address: "Vicente Guerrero 298, Plan de Ayala, 63197 Tepic, Nay.",
    mapsUrl: "https://maps.app.goo.gl/3wMHA5AYVYG4CdjRA",
  },
  {
    name: "Sucursal Mezcales",
    address: "Av. San Vicente 800, Las Parotas, 63735 Mezcales, Nay.",
    mapsUrl: "https://maps.app.goo.gl/BJ4EpFc1UgbwXhVS7",
  },
  {
    name: "Sucursal Xalisco",
    address: "Blvd. Tepic-Xalisco 58, Lomas del Nayar, 63782 Xalisco, Nay.",
    mapsUrl: "https://maps.app.goo.gl/Pvr9fe6UpE3rYB7v6",
  },
  {
    name: "Sucursal San Cayetano",
    address: "Insurgentes 3, Vivero, 63511 San Cayetano, Nay.",
    mapsUrl: "https://maps.app.goo.gl/R6cn28jY9XVFEo5T9",
  },
  {
    name: "Sucursal Bucerías",
    address: "Av. Héroes de Nacozari, Flamingos, 63732 Flamingos, Nay.",
    mapsUrl: "https://maps.app.goo.gl/RUo5wi8PFk7XDab79",
  },
  {
    name: "Sucursal La Peñita",
    address: "México 200, Paraíso Escondido, 63720 Paraíso Escondido, Nay.",
    mapsUrl: "https://maps.app.goo.gl/9pAtNdJ35nK81cxq7",
  },
  {
    name: "Sucursal Las Juntas, Jalisco",
    address:
      "Carretera a Ixtapa #215 Interior C, Las Juntas, entre Revolución y Manuel M. Diéguez, 48291 Puerto Vallarta, Jal.",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(
        "Carretera a Ixtapa #215 Interior C, Las Juntas, 48291 Puerto Vallarta, Jal.",
      ),
  },
];

async function seedDefaultSucursales({ strapi }: { strapi: any }) {
  try {
    const count = await strapi.documents("api::sucursal.sucursal").count({});
    if (count > 0) return;

    for (const data of DEFAULT_SUCURSALES) {
      await strapi.documents("api::sucursal.sucursal").create({ data });
    }

    strapi.log.info(
      `🏬 Se sembraron ${DEFAULT_SUCURSALES.length} sucursal(es) por defecto (tabla vacia).`,
    );
  } catch (err) {
    strapi.log.error("Error al sembrar sucursales por defecto:", err);
  }
}

// Los correos de "restablecer contraseña" y "confirmar cuenta" ya estaban
// personalizados a mano desde el panel de Strapi (colores, textos), pero
// sin logo. No hay acceso al panel de Strapi en produccion para editarlas
// ahi, asi que se fuerzan por codigo en cada arranque - el HTML de abajo
// es una copia exacta de lo que ya estaba configurado, solo se le agrego
// el logo de Ixoye arriba.
const CLIENT_URL = process.env.CLIENT_URL || "https://www.refaccionesixoye.mx";
const LOGO_URL = `${CLIENT_URL}/logo-ixoye.png`;

const BRANDED_EMAIL_TEMPLATES = {
  reset_password: {
    display: "Email.template.reset_password",
    icon: "sync",
    subject: "Restablece tu contraseña en Ixoye",
    message: `
<div style="font-family: sans-serif; color: #001e36; line-height: 1.6; max-width: 600px; margin: 0 auto;">
  <div style="text-align: center; margin-bottom: 20px;">
    <img src="${LOGO_URL}" alt="Ixoye" style="height: 56px; width: auto;" />
  </div>
  <h2 style="color: #0055a4;">Hola,</h2>

  <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>Refacciones Diésel y Agrícola Ixoye</strong>.</p>

  <p>Para crear una nueva contraseña, haz clic en el siguiente enlace:</p>

  <div style="margin: 30px 0;">
    <a href="<%= URL %>?code=<%= TOKEN %>"
       style="background-color: #0055a4; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
      Restablecer mi contraseña
    </a>
  </div>

  <p style="font-size: 0.9em; color: #64748b;">
    Si el enlace no funciona, copia y pega el siguiente enlace en tu navegador:<br>
    <span style="color: #0055a4;"><%= URL %>?code=<%= TOKEN %></span>
  </p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />

  <p>Si tú no realizaste esta solicitud, puedes ignorar este correo; tu contraseña seguirá siendo la misma.</p>

  <p>Atentamente,<br>
  <strong>Equipo de Refacciones Diésel y Agrícola Ixoye</strong></p>
</div>
    `,
  },
  email_confirmation: {
    display: "Email.template.email_confirmation",
    icon: "check-square",
    subject: "Confirma tu cuenta en Ixoye",
    message: `
<div style="font-family: sans-serif; color: #001e36; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 20px; border-radius: 10px;">
  <div style="text-align: center; margin-bottom: 20px;">
    <img src="${LOGO_URL}" alt="Ixoye" style="height: 56px; width: auto;" />
  </div>
  <h2 style="color: #0055a4; text-align: center;">¡Gracias por registrarte!</h2>

  <p>Estamos muy contentos de tenerte en <strong>Refacciones Diésel y Agrícola Ixoye</strong>. Para poder acceder a todos nuestros beneficios y realizar pedidos, solo necesitamos confirmar que esta dirección de correo te pertenece.</p>

  <p style="text-align: center; margin: 30px 0;">
    <a href="https://refaccionesixoye.mx/confirm-email?code=<%= CODE %>"
       style="background-color: #0055a4; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      Confirmar mi cuenta
    </a>
  </p>

  <p style="font-size: 0.9em; color: #64748b;">
    Si el enlace no funciona, puedes copiar y pegar este enlace en tu navegador:<br>
    <span style="color: #0055a4; word-break: break-all;">https://refaccionesixoye.mx/confirm-email?code=<%= CODE %></span>
  </p>

  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />

  <p style="font-size: 0.85em; color: #94a3b8; text-align: center;">
    Si no te registraste en nuestro sitio, puedes ignorar este mensaje.<br>
    © ${new Date().getFullYear()} Refacciones Diésel y Agrícola Ixoye. Tepic, Nayarit.
  </p>
</div>
    `,
  },
};

async function ensureBrandedEmailTemplates({ strapi }: { strapi: any }) {
  try {
    const emailStore = strapi.store({
      type: "plugin",
      name: "users-permissions",
      key: "email",
    });
    const current = (await emailStore.get()) || {};

    await emailStore.set({
      value: {
        ...current,
        reset_password: { ...current.reset_password, ...BRANDED_EMAIL_TEMPLATES.reset_password },
        email_confirmation: {
          ...current.email_confirmation,
          ...BRANDED_EMAIL_TEMPLATES.email_confirmation,
        },
      },
    });

    strapi.log.info(
      "📧 Plantillas de correo de cuenta (reset/confirmación) actualizadas con el logo de Ixoye.",
    );
  } catch (err) {
    strapi.log.error("Error al actualizar las plantillas de correo de cuenta:", err);
  }
}

export default {
  register() {},
  async bootstrap({ strapi }: { strapi: any }) {
    await revokeForbiddenPublicPermissions({ strapi });
    await ensureAuthenticatedPermissions({ strapi });
    await ensureAdminPermissions({ strapi });
    await seedDefaultSucursales({ strapi });
    await ensureBrandedEmailTemplates({ strapi });
  },
};
