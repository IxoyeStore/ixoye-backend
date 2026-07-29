/**
 * Lifecycle hooks del pedido: dispara push notifications cuando cambia el
 * estado. Se pone aqui (no en cada controller que puede tocar el estado)
 * para que funcione sin importar el camino: el webhook de Openpay, el
 * panel /admin/orders, o una edicion directa desde el admin de Strapi.
 */

import { sendPushToAdmins, sendPushToUser } from '../../../../utils/push-notifications';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  processing: 'En preparación',
  shipped: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

function resolveUserId(value: any): number | undefined {
  return typeof value === 'object' && value !== null ? value.id : value;
}

export default {
  // Se guarda el estado ANTERIOR antes de que se aplique el cambio, para
  // poder comparar en afterUpdate (Strapi no da el valor previo directo).
  async beforeUpdate(event: any) {
    if (!event.params?.data || !('orderStatus' in event.params.data)) return;

    const existing = await strapi.db
      .query('api::order.order')
      .findOne({ where: event.params.where });

    event.state = {
      previousStatus: existing?.orderStatus,
      userId: existing?.user,
    };
  },

  async afterUpdate(event: any) {
    const { result, state } = event;
    if (!state?.previousStatus || state.previousStatus === result.orderStatus) return;

    const userId = resolveUserId(result.user) || state.userId;
    const statusLabel = STATUS_LABELS[result.orderStatus] || result.orderStatus;

    if (userId) {
      try {
        await sendPushToUser(
          strapi,
          userId,
          {
            title: 'Tu pedido cambió de estado',
            body: `Pedido #${result.id}: ${statusLabel}`,
          },
          {
            type: 'order_status',
            orderId: String(result.id),
            orderDocumentId: String(result.documentId),
            status: String(result.orderStatus),
          },
        );
      } catch (err) {
        strapi.log.error('Error enviando push de cambio de estado al cliente:', err);
      }
    }

    // La transicion a "paid" es la primera confirmacion real de venta -
    // ahi es cuando le interesa al administrador, no en cada intento de
    // compra pendiente/abandonado.
    if (result.orderStatus === 'paid') {
      try {
        await sendPushToAdmins(
          strapi,
          {
            title: 'Nuevo pedido pagado',
            body: `Pedido #${result.id} - $${Number(result.total || 0).toFixed(2)} MXN`,
          },
          {
            type: 'new_order',
            orderId: String(result.id),
            orderDocumentId: String(result.documentId),
          },
        );
      } catch (err) {
        strapi.log.error('Error enviando push de nuevo pedido al admin:', err);
      }
    }
  },
};
