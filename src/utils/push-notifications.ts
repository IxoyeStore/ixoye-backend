/**
 * Envio de push notifications (Firebase Cloud Messaging) para la app
 * movil. Si las variables FIREBASE_* no estan configuradas (por ejemplo
 * en un entorno de desarrollo local sin proyecto de Firebase todavia),
 * se omite el envio en vez de tronar - la app y el sitio deben seguir
 * funcionando sin push.
 */

import { initializeApp, cert, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let firebaseApp: App | null | undefined;

function getFirebaseApp(strapi: any): App | null {
  if (firebaseApp !== undefined) return firebaseApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    strapi.log.warn(
      'Push notifications: faltan variables FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, se omite el envio.',
    );
    firebaseApp = null;
    return firebaseApp;
  }

  firebaseApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return firebaseApp;
}

async function sendToTokens(
  strapi: any,
  tokens: string[],
  notification: { title: string; body: string },
  data: Record<string, string> = {},
) {
  if (tokens.length === 0) return;

  const app = getFirebaseApp(strapi);
  if (!app) return;

  try {
    const response = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification,
      data,
    });

    // Un token deja de ser valido cuando el usuario desinstala la app o el
    // sistema lo rota; hay que limpiarlo o Firebase lo seguira rechazando
    // en cada envio futuro.
    const deadTokens: string[] = [];
    response.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (
        !r.success &&
        (code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token')
      ) {
        deadTokens.push(tokens[i]);
      }
    });

    if (deadTokens.length > 0) {
      await strapi.db
        .query('api::device-token.device-token')
        .deleteMany({ where: { token: { $in: deadTokens } } });
    }
  } catch (err) {
    strapi.log.error('Error enviando push notification:', err);
  }
}

export async function sendPushToUser(
  strapi: any,
  userId: number,
  notification: { title: string; body: string },
  data: Record<string, string> = {},
) {
  const rows = await strapi.db
    .query('api::device-token.device-token')
    .findMany({ where: { users_permissions_user: userId } });

  await sendToTokens(
    strapi,
    rows.map((r: any) => r.token),
    notification,
    data,
  );
}

export async function sendPushToAdmins(
  strapi: any,
  notification: { title: string; body: string },
  data: Record<string, string> = {},
) {
  const adminRole = await strapi
    .query('plugin::users-permissions.role')
    .findOne({ where: { name: 'Admin' } });
  if (!adminRole) return;

  const admins = await strapi
    .query('plugin::users-permissions.user')
    .findMany({ where: { role: adminRole.id } });
  const adminIds = admins.map((u: any) => u.id);
  if (adminIds.length === 0) return;

  const rows = await strapi.db
    .query('api::device-token.device-token')
    .findMany({ where: { users_permissions_user: { $in: adminIds } } });

  await sendToTokens(
    strapi,
    rows.map((r: any) => r.token),
    notification,
    data,
  );
}
