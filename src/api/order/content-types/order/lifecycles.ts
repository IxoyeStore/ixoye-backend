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

// Mensaje especifico por estado en vez de un generico "cambio de estado".
// "cancelled" SI se notifica: hoy toda cancelacion es una decision manual
// de alguien del negocio (no existe todavia una cancelacion automatica
// por inactividad), asi que es informacion real y util para el cliente.
// Si en el futuro se agrega auto-cancelacion por inactividad, ese
// mecanismo debe evitar pasar por este mismo camino (o marcar el pedido
// de otra forma) para no generar este aviso.
const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  paid: {
    title: '¡Compra exitosa!',
    body: 'Tu compra ha sido realizada correctamente.',
  },
  processing: {
    title: 'Preparando tu pedido',
    body: 'Tu pedido está siendo preparado.',
  },
  shipped: {
    title: '¡Tu pedido va en camino!',
    body: 'Tu pedido está en camino.',
  },
  delivered: {
    title: '¡Pedido entregado!',
    body: 'Recibiste tu producto.',
  },
  cancelled: {
    title: 'Pedido cancelado',
    body: 'Tu pedido fue cancelado.',
  },
};

function resolveUserId(value: any): number | undefined {
  return typeof value === 'object' && value !== null ? value.id : value;
}

export default {
  // Se guarda el estado ANTERIOR antes de que se aplique el cambio, para
  // poder comparar en afterUpdate (Strapi no da el valor previo directo).
  async beforeUpdate(event: any) {
    if (!event.params?.data || !('orderStatus' in event.params.data)) {
      strapi.log.info(
        `[push-debug] beforeUpdate: sin orderStatus en params.data (${JSON.stringify(event.params?.data)})`,
      );
      return;
    }

    // La relacion "user" no es una columna plana en la tabla orders (Strapi
    // v5 guarda TODAS las relaciones en tablas de enlace), asi que sin
    // populate explicito jamas se resuelve y userId sale undefined.
    const existing = await strapi.db
      .query('api::order.order')
      .findOne({ where: event.params.where, populate: ['user'] });

    strapi.log.info(
      `[push-debug] beforeUpdate: where=${JSON.stringify(event.params.where)} existing=${existing ? `id=${existing.id} status=${existing.orderStatus} user=${existing.user}` : 'NULL'}`,
    );

    event.state = {
      previousStatus: existing?.orderStatus,
      userId: resolveUserId(existing?.user),
    };
  },

  async afterUpdate(event: any) {
    const { result, state } = event;
    strapi.log.info(
      `[push-debug] afterUpdate: previousStatus=${state?.previousStatus} newStatus=${result.orderStatus} user=${JSON.stringify(result.user)} stateUserId=${state?.userId}`,
    );
    if (!state?.previousStatus || state.previousStatus === result.orderStatus) return;

    const userId = resolveUserId(result.user) ?? state.userId;
    const message = STATUS_MESSAGES[result.orderStatus];

    if (userId && !message) {
      strapi.log.info(
        `[push-debug] afterUpdate: sin mensaje push definido para el estado "${STATUS_LABELS[result.orderStatus] || result.orderStatus}", se omite el envio al cliente.`,
      );
    }

    if (userId && message) {
      try {
        await sendPushToUser(
          strapi,
          userId,
          {
            title: message.title,
            body: `${message.body} Pedido #${result.id}.`,
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
