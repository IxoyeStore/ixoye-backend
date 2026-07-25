const CANCEL_AFTER_MS = 24 * 60 * 60 * 1000; // 24 horas

export default {
  // Cada hora: cancela ordenes "pending" que nunca recibieron confirmacion
  // de pago de Openpay (usuario abandono el checkout, pago fallido sin
  // webhook, etc.), para que no se acumulen indefinidamente en el listado.
  "0 * * * *": async ({ strapi }: { strapi: any }) => {
    const cutoff = new Date(Date.now() - CANCEL_AFTER_MS).toISOString();

    const staleOrders = await strapi.documents("api::order.order").findMany({
      filters: {
        orderStatus: "pending",
        createdAt: { $lt: cutoff },
      },
      fields: ["documentId"],
      pagination: { limit: 500 },
    });

    if (staleOrders.length === 0) return;

    for (const order of staleOrders) {
      await strapi.documents("api::order.order").update({
        documentId: order.documentId,
        data: { orderStatus: "cancelled" },
      });
    }

    strapi.log.info(
      `[orders-cleanup] canceladas ${staleOrders.length} orden(es) pendiente(s) abandonada(s) (>24h)`,
    );
  },
};