"use strict";
import fs from "fs";
import path from "path";
import axios from "axios";
import Openpay from "openpay";
import { factories } from "@strapi/strapi";

// Mismo dataset de CP que usa el frontend para cotizar el envio. Se carga
// una sola vez al iniciar el servidor (no por request).
const cpMexico: Record<string, { e: string; m: string; c?: string[] }> =
  JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "data", "cp-mexico.json"), "utf-8"),
  );

// Replica la logica de app/(routes)/cart/page.tsx del lado del servidor.
// Nunca hay que confiar en el shippingPrice que manda el cliente: se
// recalcula aqui a partir del CP guardado en la direccion del usuario.
function calculateShippingServerSide(
  postalCode: string | null | undefined,
): { cost: number; label: string } {
  if (!postalCode || postalCode.length !== 5) {
    return { cost: -1, label: "No disponible" };
  }
  const entry = cpMexico[postalCode];
  if (!entry) {
    return { cost: 250, label: "Envío Nacional" };
  }
  if (entry.e !== "Nayarit") {
    return { cost: -1, label: "No disponible" };
  }
  return { cost: 0, label: "Entrega Local" };
}

const openpay = new Openpay(
  process.env.OPENPAY_MERCHANT_ID as string,
  process.env.OPENPAY_PRIVATE_KEY as string,
  true, // false para Sandbox, true para Produccion
);

function getOpenpayAuthHeader(): string {
  const privateKey = (process.env.OPENPAY_PRIVATE_KEY || "").trim();
  if (!privateKey) {
    throw new Error("OPENPAY_PRIVATE_KEY no configurada");
  }
  return Buffer.from(`${privateKey}:`).toString("base64");
}

function getOpenpayMerchantId(): string {
  return (process.env.OPENPAY_MERCHANT_ID || "").trim();
}

// Nunca confiar en el cuerpo del webhook por si solo: cualquiera puede
// mandar un POST falso a este endpoint (es publico, Openpay lo requiere
// asi). Antes de marcar una orden como pagada, se verifica la transaccion
// consultando directamente la API de Openpay con la llave privada del
// servidor, que es el unico dato que un atacante no puede falsificar.
async function verifyOpenpayCharge(chargeId: string): Promise<any | null> {
  try {
    const merchantId = getOpenpayMerchantId();
    const authHeader = getOpenpayAuthHeader();
    const res = await axios.get(
      `https://api.openpay.mx/v1/${merchantId}/charges/${chargeId}`,
      { headers: { Authorization: `Basic ${authHeader}` } },
    );
    return res.data;
  } catch (err: any) {
    console.error(
      "❌ No se pudo verificar la transaccion con Openpay:",
      err.response?.data || err.message,
    );
    return null;
  }
}

async function sendConfirmationEmail(
  strapi: any,
  order: any,
  products: any,
  fullName: string,
  addressData: any,
) {
  try {
    const productsList = products
      .map(
        (p: any) =>
          `<div style="margin-bottom: 10px; font-size: 14px; border-bottom: 1px solid #f0f0f0; padding-bottom: 5px;">
            <span style="font-weight: bold;">${p.name}</span> (x${p.quantity}) - <span style="color: #0071b1; font-weight: bold;">$${Number(p.price).toFixed(2)} MXN</span>
          </div>`,
      )
      .join("");

    let addressHTML = "";
    if (addressData) {
      const street = addressData.street || addressData.attributes?.street || "";
      const neighborhood =
        addressData.neighborhood || addressData.attributes?.neighborhood || "";
      const city = addressData.city || addressData.attributes?.city || "";
      const state = addressData.state || addressData.attributes?.state || "";
      const cp =
        addressData.postalCode || addressData.attributes?.postalCode || "";
      const refs =
        addressData.references || addressData.attributes?.references || "";

      addressHTML = `
        <p style="margin: 2px 0;">${street}, Col. ${neighborhood}</p>
        <p style="margin: 2px 0;">${city}, ${state}</p>
        <p style="margin: 2px 0;">CP: ${cp}</p>
        ${refs ? `<p style="margin: 2px 0; font-style: italic; color: #888;">Ref: ${refs}</p>` : ""}
      `;
    } else {
      addressHTML = `<p>Recoger en sucursal / No se especificó dirección</p>`;
    }

    await strapi.plugins["email"].services.email.send({
      to: order.email,
      from: '"Refacciones Diésel y Agrícola Ixoye" <ecommerce@refaccionesixoye.mx>',
      subject: `Confirmación de compra en Refacciones Ixoye - Orden #${order.id}`,
      html: `
        <div style="background-color: #f9f9f9; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0;">
            
            <div style="background-color: #0071b1; color: white; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px;">Refacciones Diésel y Agrícola Ixoye</h1>
            </div>

            <div style="padding: 40px;">
              <h2>¡Hola, ${fullName}!</h2>
              <p>Tu pago ha sido procesado con éxito. Aquí tienes tu resumen:</p>
              
              <div style="border: 1px solid #eee; border-radius: 10px; padding: 20px; margin: 20px 0;">
                <h3 style="color: #0071b1; margin-top: 0;">Orden #${order.id}</h3>
                ${productsList}
                
                <p style="text-align: right; font-size: 13px; color: #666; margin-bottom: 5px;">
                  Envío: $${Number(order.shippingPrice || 0).toFixed(2)} MXN
                </p>
                
                <p style="text-align: right; font-weight: bold; border-top: 2px solid #0071b1; padding-top: 10px;">
                  Total: $${Number(order.total).toFixed(2)} MXN
                </p>
              </div>

              <h3 style="margin-top: 30px;">Dirección de Envío</h3>
              <div style="background-color: #fcfcfc; border: 1px solid #eee; padding: 15px; border-radius: 8px; font-size: 14px; margin-bottom: 20px;">
                <strong>${fullName}</strong>
                ${addressHTML}
              </div>

              <p style="font-size: 13px; color: #666; margin-top: 15px;">
                <strong>Dudas y aclaraciones:</strong> 
                <a href="mailto:soporte@refaccionesixoye.mx" style="color: #0071b1; text-decoration: none;">soporte@refaccionesixoye.mx</a>
              </p>
            </div>

            <div style="background-color: #0071b1; color: white; padding: 25px; text-align: center; font-size: 12px; line-height: 1.6;">
              <p style="margin: 0 0 10px 0; font-weight: bold; text-transform: uppercase;">Atención al Cliente e Información Legal</p>
              <p style="margin: 0;">Para solicitar su <strong>factura</strong>, responda a este correo con sus datos fiscales <br> o envíelos a <strong>facturacion@refaccionesixoye.mx</strong></p>
              <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.2); margin: 15px 0;">
              <p style="margin: 0; opacity: 0.8;">Este es un correo automático, por favor no lo responda directamente para soporte técnico.</p>
              <p style="margin: 10px 0 0 0;">© ${new Date().getFullYear()} Refacciones Ixoye. Todos los derechos reservados.</p>
            </div>

          </div>
        </div>
      `,
    });
    console.log(`📧 Correo de confirmación enviado para la orden #${order.id}`);
  } catch (err) {
    console.error("❌ Error enviando email:", err);
  }
}

// Traduce el objeto "transaction" que manda Openpay en el webhook a los
// campos que guardamos en la orden. Openpay soporta varios metodos de pago
// (tarjeta, transferencia SPEI, pago en tienda/servicios) y cada uno trae
// informacion distinta, por eso se arma un label legible ademas de guardar
// marca/tipo/terminacion cuando aplica (solo tarjeta las tiene).
function extractPaymentInfo(transaction: any): {
  paymentMethod: string;
  cardBrand: string | null;
  cardType: "debito" | "credito" | null;
  cardLast4: string | null;
} {
  const method = transaction?.method || transaction?.payment_method?.type;

  if (method === "card" && transaction?.card) {
    const rawBrand = String(transaction.card.brand || "").trim();
    const brand = rawBrand
      ? rawBrand.charAt(0).toUpperCase() + rawBrand.slice(1)
      : "Tarjeta";
    const cardType: "debito" | "credito" | null =
      transaction.card.type === "debit"
        ? "debito"
        : transaction.card.type === "credit"
          ? "credito"
          : null;
    const typeLabel = cardType === "debito" ? "Débito" : cardType === "credito" ? "Crédito" : "";
    const cardNumber = String(transaction.card.card_number || "");
    const last4 = cardNumber.slice(-4) || null;

    return {
      paymentMethod: `${typeLabel} ${brand}`.trim(),
      cardBrand: rawBrand || null,
      cardType,
      cardLast4: last4,
    };
  }

  if (method === "bank_account") {
    return {
      paymentMethod: "Transferencia interbancaria (SPEI)",
      cardBrand: null,
      cardType: null,
      cardLast4: null,
    };
  }

  if (method === "store") {
    const provider = String(
      transaction?.payment_method?.provider ||
        transaction?.store?.provider ||
        transaction?.payment_method?.type ||
        "",
    ).toLowerCase();
    const paymentMethod = provider.includes("bbva")
      ? "Pago de servicios BBVA"
      : "Pago en tienda";

    return { paymentMethod, cardBrand: null, cardType: null, cardLast4: null };
  }

  return {
    paymentMethod: "No especificado",
    cardBrand: null,
    cardType: null,
    cardLast4: null,
  };
}

export default factories.createCoreController(
  "api::order.order",
  ({ strapi }) => ({
    async create(ctx) {
      try {
        const userSession = ctx.state.user;
        if (!userSession) return ctx.unauthorized("Sesión inválida.");

        const { products, email, phone } = ctx.request.body?.data || {};

        console.log("--- NUEVA ORDEN EN PROCESO ---");
        console.log(`📦 Productos: ${products?.length}`);
        console.log(`👤 Usuario: ${userSession.id}`);

        if (!products || products.length === 0) {
          return ctx.badRequest("El carrito está vacío.");
        }

        const userProfile = await strapi.db
          .query("api::profile.profile")
          .findOne({
            where: { users_permissions_user: userSession.id },
          });

        const userAddress =
          (await strapi.db.query("api::address.address").findOne({
            where: { users_permissions_user: userSession.id, isDefault: true },
          })) ||
          (await strapi.db.query("api::address.address").findOne({
            where: { users_permissions_user: userSession.id },
          }));

        if (!userAddress) {
          return ctx.badRequest(
            "Configura una dirección de envío en tu perfil antes de pagar.",
          );
        }

        const { cost: costOfShipping, label: shippingLabel } =
          calculateShippingServerSide((userAddress as any).postalCode);

        if (costOfShipping === -1) {
          return ctx.badRequest(
            "No hacemos envíos a tu domicilio por el momento.",
          );
        }

        console.log(`🚚 Envío: ${shippingLabel} ($${costOfShipping})`);

        const fullName =
          `${userProfile?.firstName || userSession.username || "Cliente"} ${userProfile?.lastName || ""}`.trim();

        const isB2B = userProfile?.type === "b2b";

        let totalAmount = 0;
        const detailedProducts = await Promise.all(
          products.map(async (p: any) => {
            const item = (await strapi.entityService.findOne(
              "api::product.product",
              p.id,
            )) as any;

            if (!item) throw new Error(`Producto con ID ${p.id} no encontrado`);

            const quantity = Number(p.quantity) || 1;
            const availableStock = Number(item.stock) || 0;
            if (quantity > availableStock) {
              throw new Error(
                `No hay suficiente existencia de "${item.productName}" (disponible: ${availableStock}, solicitado: ${quantity}).`,
              );
            }

            const priceToCharge =
              isB2B && (item as any).wholesalePrice
                ? (item as any).wholesalePrice
                : (item as any).price;

            totalAmount += Number(priceToCharge) * quantity;

            return {
              id: item.id,
              documentId: item.documentId,
              name: item.productName,
              code: item.code,
              image: Array.isArray(item.images) ? item.images[0] : null,
              price: priceToCharge,
              quantity,
            };
          }),
        );

        const merchantId = getOpenpayMerchantId();
        const authHeader = getOpenpayAuthHeader();
        const uniqueOrderId = `ORD${Date.now()}`;
        const finalTotalWithShipping = totalAmount + costOfShipping;
        const finalAmountStr = finalTotalWithShipping.toFixed(2);
        const subtotal = finalTotalWithShipping / 1.16;
        const iva = finalTotalWithShipping - subtotal;

        let checkoutSession: any;
        const baseUrl =
          process.env.CLIENT_URL || "https://www.refaccionesixoye.mx";

        const checkoutRequest = {
          amount: finalAmountStr,
          currency: "MXN",
          description: "Compra en Refacciones Diesel y Agricola Ixoye",
          order_id: uniqueOrderId,
          send_email: false,
          customer: {
            name: userProfile?.firstName || "Cliente",
            last_name: userProfile?.lastName || "Ixoye",
            phone_number: (phone || userProfile?.phone || "5555555555")
              .replace(/\D/g, "")
              .slice(-10),
            email: userSession.email,
          },
          metadata: {
            subtotal: subtotal.toFixed(2),
            iva: iva.toFixed(2),
            shipping: costOfShipping.toFixed(2),
            shipping_label: shippingLabel || "Envío Estándar",
          },
          redirect_url: `${baseUrl}/success`,
        };

        const response = await axios({
          method: "post",
          url: `https://api.openpay.mx/v1/${merchantId}/checkouts`,
          data: checkoutRequest,
          headers: {
            Authorization: `Basic ${authHeader}`,
            "Content-Type": "application/json",
          },
        });
        checkoutSession = response.data;

        const phoneToSave = (phone || userProfile?.phone || "5500000000")
          .replace(/\D/g, "")
          .slice(-10);

        await strapi.documents("api::order.order").create({
          data: {
            products: detailedProducts,
            email: (email || userSession.email).trim(),
            customerName: fullName,
            phone: phoneToSave,
            total: parseFloat(finalAmountStr),
            subtotal: parseFloat(subtotal.toFixed(2)),
            shippingPrice: costOfShipping,
            shippingLabel,
            iva: parseFloat(iva.toFixed(2)),
            orderStatus: "pending",
            user: userSession.id,
            shippingAddress: userAddress,
            stripeId: uniqueOrderId,
            status: "published",
          } as any,
        });

        return { data: { url: checkoutSession.checkout_link } };
      } catch (error: any) {
        console.error(
          "❌ ERROR EN CREATE:",
          error.message || "Error desconocido",
        );
        return ctx.badRequest(error.message || "Error al procesar la orden");
      }
    },

    async webhook(ctx) {
      try {
        const { type, transaction } = ctx.request.body;

        console.log(
          "📦 CUERPO DEL WEBHOOK:",
          JSON.stringify(ctx.request.body, null, 2),
        );

        if (type === "verification") {
          return ctx.send({ received: true });
        }

        const successEvents = [
          "verification.payment.checkout.completed",
          "charge.confirmed",
          "charge.succeeded",
        ];

        if (successEvents.includes(type)) {
          const openpayOrderId = transaction?.order_id;
          const chargeId = transaction?.id;

          if (!openpayOrderId || !chargeId) {
            console.log("❌ Webhook sin order_id o transaction id");
            return ctx.send({ received: true });
          }

          const order = await strapi.documents("api::order.order").findFirst({
            filters: {
              stripeId: openpayOrderId,
            },
          });

          if (!order) {
            console.log(
              `❌ No se encontró la orden con stripeId: ${openpayOrderId}`,
            );
            return ctx.send({ received: true });
          }

          if (order.orderStatus !== "paid") {
            // El cuerpo del webhook no es confiable (endpoint publico, sin
            // firma). Se confirma la transaccion directamente con Openpay
            // antes de marcar la orden como pagada.
            const verifiedCharge = await verifyOpenpayCharge(chargeId);

            if (!verifiedCharge) {
              console.log(
                `❌ No se pudo verificar la transaccion ${chargeId} con Openpay`,
              );
              return ctx.send({ received: true });
            }

            if (verifiedCharge.status !== "completed") {
              console.log(
                `❌ Transaccion ${chargeId} no esta "completed" segun Openpay (status: ${verifiedCharge.status})`,
              );
              return ctx.send({ received: true });
            }

            if (verifiedCharge.order_id !== openpayOrderId) {
              console.log(
                `❌ order_id de la transaccion verificada (${verifiedCharge.order_id}) no coincide con el del webhook (${openpayOrderId})`,
              );
              return ctx.send({ received: true });
            }

            if (Number(verifiedCharge.amount) !== Number(order.total)) {
              console.log(
                `❌ Monto verificado (${verifiedCharge.amount}) no coincide con el total de la orden (${order.total})`,
              );
              return ctx.send({ received: true });
            }

            const paymentInfo = extractPaymentInfo(verifiedCharge);
            const updatedOrder = await strapi
              .documents("api::order.order")
              .update({
                documentId: order.documentId,
                data: { orderStatus: "paid", ...paymentInfo },
              });

            console.log(`✅ Orden ${order.documentId} marcada como PAGADA`);

            const productsList = order.products as any;

            if (Array.isArray(productsList)) {
              for (const item of productsList) {
                const pId = item.documentId || item.id;
                const qtySold = Number(item.quantity || 0);

                if (pId) {
                  const product = await strapi
                    .documents("api::product.product")
                    .findOne({
                      documentId: pId,
                    });

                  if (product) {
                    const currentStock = Number(product.stock || 0);
                    const newStock = Math.max(0, currentStock - qtySold);

                    await strapi.documents("api::product.product").update({
                      documentId: product.documentId,
                      data: { stock: newStock },
                    });
                    console.log(
                      `🔹 Stock actualizado: ${product.productName} -> ${newStock}`,
                    );
                  }
                }
              }
            }

            try {
              await sendConfirmationEmail(
                strapi,
                updatedOrder,
                order.products,
                order.customerName,
                order.shippingAddress,
              );
            } catch (e) {
              console.error("⚠️ Error email:", e);
            }
          }
        }

        return ctx.send({ received: true });
      } catch (error) {
        console.error("❌ Error crítico:", error);
        return ctx.badRequest("Webhook Error");
      }
    },
  }),
);
