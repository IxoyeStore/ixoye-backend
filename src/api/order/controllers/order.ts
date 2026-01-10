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

        let totalAmount = 0;

        const detailedProducts = await Promise.all(
          products.map(async ({ id, quantity }) => {
            const item = await strapi.entityService.findOne(
              "api::product.product",
              Number(id),
              { fields: ["productName", "price"] }
            );

            if (!item) throw new Error(`Product ${id} not found`);

            const qty = Number(quantity) || 1;
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
                },
                quantity: qty,
              },
            };
          })
        );

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: email,
          automatic_tax: { enabled: true },
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
          },
        });

        return { stripeSession: session };
      } catch (error: any) {
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

        const orders = await strapi.entityService.findMany("api::order.order", {
          filters: { stripeId: session.id },
        });

        if (orders.length > 0) {
          const order = orders[0];

          await strapi.entityService.update("api::order.order", order.id, {
            data: { orderStatus: "paid" },
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
                      data: {
                        stock: Math.max(0, newStock),
                      },
                    }
                  );
                  console.log(
                    `📉 Stock reducido: ${currentProduct.productName} ahora tiene ${newStock} unidades.`
                  );
                }
              } catch (stockError) {
                console.error(
                  `❌ Error actualizando stock del producto ${p.id}:`,
                  stockError
                );
              }
            })
          );

          console.log("✅ Pago procesado y stock actualizado.");
        }
      }
      return { received: true };
    },
  })
);
