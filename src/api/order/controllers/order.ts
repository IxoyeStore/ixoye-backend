"use strict";

import Stripe from "stripe";
import { factories } from "@strapi/strapi";

const stripe = new Stripe(process.env.STRIPE_KEY as string, {
  apiVersion: "2025-12-15.clover" as any,
});

export default factories.createCoreController(
  "api::order.order",
  ({ strapi }) => ({
    async create(ctx) {
      try {
        const { products, email, fullName, phone, userId } =
          ctx.request.body?.data || {};

        if (!Array.isArray(products)) {
          ctx.throw(400, "Products are required");
        }

        const TAX_RATE_ID = process.env.STRIPE_TAX_RATE_ID;
        console.log("🔍 DEBUG - TAX ID:", TAX_RATE_ID);

        let totalAmount = 0;

        const detailedProducts = await Promise.all(
          products.map(async ({ id, quantity }) => {
            const item = await strapi.entityService.findOne(
              "api::product.product",
              Number(id),
              { fields: ["productName", "price", "stock"] }
            );

            if (!item) throw new Error(`Product ${id} not found`);

            const qty = Number(quantity) || 1;
            const currentStock = Number(item.stock) || 0;

            if (currentStock <= 0) {
              throw new Error(
                `Lo sentimos, el producto "${item.productName}" se ha agotado.`
              );
            }

            if (currentStock < qty) {
              throw new Error(
                `Solo quedan ${currentStock} unidades de "${item.productName}".`
              );
            }
            // ---------------------------

            const unitAmount = Math.round(Number(item.price) * 100);
            totalAmount += Number(item.price) * qty;

            return {
              id: item.id,
              name: item.productName,
              price: item.price,
              quantity: qty,
              stripeData: {
                price_data: {
                  currency: "mxn",
                  product_data: { name: item.productName },
                  unit_amount: unitAmount,
                  tax_behavior: "inclusive",
                },
                quantity: qty,
                ...(TAX_RATE_ID ? { tax_rates: [TAX_RATE_ID] } : {}),
              },
            };
          })
        );

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: email,
          automatic_tax: { enabled: false },
          shipping_address_collection: { allowed_countries: ["MX"] },
          locale: "es",
          payment_method_types: ["card"],
          success_url: `${process.env.CLIENT_URL}/successError?status=success`,
          cancel_url: `${process.env.CLIENT_URL}/successError?status=cancel`,
          line_items: detailedProducts.map((p) => p.stripeData),
          payment_intent_data: {
            metadata: {
              customer_name: fullName,
              customer_phone: phone,
              strapi_user_id: userId,
            },
          },
        });

        await strapi.entityService.create("api::order.order", {
          data: {
            products: detailedProducts.map(({ id, name, price, quantity }) => ({
              id,
              name,
              price,
              quantity,
            })),
            stripeId: session.id,
            email,
            customerName: fullName,
            phone,
            total: totalAmount,
            orderStatus: "pending",
            publishedAt: new Date(),
            user: userId,
          } as any,
        });

        return { stripeSession: session };
      } catch (error: any) {
        console.error("❌ ERROR EN CREATE ORDER:", error);
        ctx.throw(500, error.message || "Internal Server Error");
      }
    },

    async webhook(ctx) {
      const sig = ctx.request.headers["stripe-signature"];
      let event;

      try {
        const body =
          ctx.request.body[Symbol.for("unparsedBody")] || ctx.request.body;
        event = stripe.webhooks.constructEvent(
          body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET as string
        );
      } catch (err: any) {
        return ctx.badRequest(`Webhook Error: ${err.message}`);
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as any;
        const totalFinal = session.amount_total / 100;
        const montoIVA = (session.total_details?.amount_tax || 0) / 100;
        const subtotalReal = totalFinal - montoIVA;

        const shippingDetails =
          session.shipping_details ||
          session.shipping ||
          (session.customer_details && session.customer_details.address
            ? session.customer_details
            : null);

        const orders = await strapi.entityService.findMany("api::order.order", {
          filters: { stripeId: session.id },
        });

        if (orders.length > 0) {
          const order = orders[0];

          const dataToSave = shippingDetails
            ? JSON.parse(JSON.stringify(shippingDetails))
            : {
                note: "Stripe no envió objeto shipping_details",
                email: session.customer_email,
              };

          await strapi.entityService.update("api::order.order", order.id, {
            data: {
              orderStatus: "paid",
              shippingAddress: dataToSave,
              total: totalFinal,
              iva: montoIVA,
              subtotal: subtotalReal,
            } as any,
          });

          const productsArray = order.products as any[];
          await Promise.all(
            productsArray.map(async (p: any) => {
              try {
                const currentProduct = await strapi.entityService.findOne(
                  "api::product.product",
                  p.id
                );
                if (
                  currentProduct &&
                  typeof currentProduct.stock === "number"
                ) {
                  const newStock = currentProduct.stock - (p.quantity || 1);
                  await strapi.entityService.update(
                    "api::product.product",
                    p.id,
                    {
                      data: { stock: Math.max(0, newStock) },
                      publishedAt: new Date().toISOString(),
                    }
                  );
                }
              } catch (e) {
                console.error("Error stock:", e);
              }
            })
          );

          try {
            const productsList = productsArray
              .map(
                (p: any) =>
                  `<div style="padding: 12px 0; border-bottom: 1px solid #f0f0f0;">
                  <p style="margin: 0; color: #000; font-weight: bold; font-size: 14px;">
                    ${p.name} (Cant: ${p.quantity || 1}) - $${p.price} MXN
                  </p>
                </div>`
              )
              .join("");

            await strapi.plugins["email"].services.email.send({
              to:
                session.customer_details?.email ||
                session.customer_email ||
                order.email,
              from: "ventas@ixoye-store.com",
              subject: `Confirmación de compra en Refacciones Ixoye- Orden #${order.id}`,
              html: `
  <div style="background-color: #f4f4f4; padding: 40px 10px; font-family: sans-serif;">
    <div style="max-width: 550px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
      <div style="background-color: #0071b1; color: white; padding: 25px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Refacciones Diésel y Agrícola Ixoye</h1>
      </div>
      <div style="padding: 30px 40px;">
        <h2 style="color: #000;">¡Hola, ${order.customerName}!</h2>
        <p style="color: #666; font-size: 14px;">✅ Tu pedido ha sido recibido y está siendo procesado. Aquí tienes un resumen de tu compra:</p>
        <div style="border: 1px solid #f0f0f0; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
          <h4 style="margin: 0 0 15px 0; color: #000; font-size: 16px;">Detalle del Pedido #${order.id}</h4>
          ${productsList}
          <div style="text-align: right; margin-top: 15px;">
            <p style="margin: 0; font-size: 13px; color: #666;">Subtotal: $${subtotalReal.toFixed(2)} MXN</p>
            <p style="margin: 5px 0; font-size: 13px; color: #666;">IVA (16% incluido): $${montoIVA.toFixed(2)} MXN</p>
            <p style="margin: 10px 0 0 0; font-size: 18px; font-weight: bold; color: #000;">Total Pagado: $${totalFinal.toFixed(2)} MXN</p>
          </div>
        </div>
        <h4 style="color: #333;">Dirección de Envío</h4>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; font-size: 14px; color: #888;">
          <p style="margin: 0;">${dataToSave.address?.line1 || ""}</p>
          <p style="margin: 0;">${dataToSave.address?.city || ""}.</p>
          <p style="margin: 0;">CP: ${dataToSave.address?.postal_code || ""}</p>
        </div>
        <p style="margin-top: 30px; font-size: 13px; color: #888; text-align: center;">
          Si tienes alguna duda con tu pedido, escríbenos a <a href="mailto:soporte@ixoye.com" style="color: #0071b1; text-decoration: none;">soporte@ixoye.com</a>.
        </p>
      </div>
      <div style="background-color: #0071b1; color: white; padding: 25px; text-align: center; font-size: 12px; line-height: 1.5;">
        <p style="margin: 0 0 8px 0;">Este es un correo automático, por favor no respondas directamente.</p>
        <p style="margin: 0 0 12px 0;">© 2026 Refacciones Diésel y Agrícola Ixoye.</p>
        <a href="${process.env.CLIENT_URL}" style="color: white; font-weight: bold; text-decoration: none; border-bottom: 1px solid white;">Visitar Tienda</a>
      </div>
    </div>
  </div>
`,
            });
          } catch (emailErr) {
            console.error("❌ Error enviando correo:", emailErr);
          }
        }
      }
      return { received: true };
    },
  })
);
