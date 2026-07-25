/**
 * question controller
 */

import { factories } from "@strapi/strapi";

const SUPPORT_EMAIL = "soporte@refaccionesixoye.mx";

const LIMIT_MAX = 15;
const LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 horas
const LIMIT_MESSAGE =
  "Ya hiciste varias preguntas por hoy. Si tu duda sigue sin resolverse, contáctanos vía WhatsApp a través del botón de Soporte.";

const userRequestCounts = new Map<number, { count: number; resetTime: number }>();

const cleanupInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [userId, record] of userRequestCounts.entries()) {
      if (now > record.resetTime) userRequestCounts.delete(userId);
    }
  },
  60 * 60 * 1000,
);
if (cleanupInterval.unref) cleanupInterval.unref();

function isRateLimited(userId: number): boolean {
  const now = Date.now();
  let record = userRequestCounts.get(userId);

  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + LIMIT_WINDOW_MS };
    userRequestCounts.set(userId, record);
  }

  record.count++;
  return record.count > LIMIT_MAX;
}

async function notifyNewQuestion(strapi: any, question: any, product: any, user: any) {
  try {
    await strapi.plugins["email"].services.email.send({
      to: SUPPORT_EMAIL,
      subject: `Nueva pregunta sobre ${product?.productName || "un producto"}`,
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #0071b1;">Nueva pregunta de producto</h2>
          <p><strong>Producto:</strong> ${product?.productName || "—"} (código: ${product?.code || "—"})</p>
          <p><strong>Cliente:</strong> ${user?.username || "—"} (${user?.email || "—"})</p>
          <div style="background:#f9f9f9; border:1px solid #eee; border-radius:8px; padding:15px; margin:15px 0;">
            ${String(question.questionText).replace(/</g, "&lt;")}
          </div>
          <p><a href="https://www.refaccionesixoye.mx/admin/questions" style="color:#0071b1;">Responder en el panel de admin →</a></p>
        </div>
      `,
    });
  } catch (err) {
    console.error("❌ Error enviando notificación de pregunta:", err);
  }
}

export default factories.createCoreController(
  "api::question.question",
  ({ strapi }) => ({
    async create(ctx) {
      const userSession = ctx.state.user;
      if (!userSession) return ctx.unauthorized("Debes iniciar sesión para preguntar.");

      if (isRateLimited(userSession.id)) {
        ctx.status = 429;
        ctx.body = { error: { status: 429, name: "TooManyRequestsError", message: LIMIT_MESSAGE } };
        return;
      }

      const { questionText, product, website } = ctx.request.body?.data || {};

      // Honeypot: bots fill hidden fields, real users never see/fill it.
      if (website) {
        return ctx.badRequest("Solicitud inválida.");
      }

      const text = String(questionText || "").trim();
      if (text.length < 5 || text.length > 500) {
        return ctx.badRequest("La pregunta debe tener entre 5 y 500 caracteres.");
      }
      if (!product) {
        return ctx.badRequest("Falta el producto.");
      }

      const productEntity = await strapi.documents("api::product.product").findOne({
        documentId: product,
      });
      if (!productEntity) return ctx.badRequest("Producto no encontrado.");

      const created = await strapi.documents("api::question.question").create({
        data: {
          questionText: text,
          product: productEntity.documentId,
          user: userSession.id,
          answerText: null,
        } as any,
      });

      await notifyNewQuestion(strapi, created, productEntity, userSession);

      return { data: created };
    },

    async mine(ctx) {
      const user = ctx.state.user;
      if (!user) return ctx.unauthorized("Debes iniciar sesión.");

      const questions = await strapi.documents("api::question.question").findMany({
        filters: { user: user.id, answerText: { $notNull: true } } as any,
        sort: { answeredAt: "desc" } as any,
        populate: { product: { fields: ["productName", "slug"] } } as any,
        limit: 20,
      });

      return { data: questions };
    },

    async find(ctx) {
      const isAdmin = ctx.state.user?.role?.name === "Admin";

      // Everyone except the admin panel only ever sees answered questions,
      // regardless of whatever filters the caller sends.
      if (!isAdmin) {
        ctx.query = {
          ...ctx.query,
          filters: {
            ...(typeof ctx.query.filters === "object" ? ctx.query.filters : {}),
            answerText: { $notNull: true },
          },
        };
      }
      // @ts-ignore - default core action
      return await super.find(ctx);
    },
  })
);
