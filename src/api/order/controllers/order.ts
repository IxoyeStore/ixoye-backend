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
      console.log("=== 🛒 CREATE ORDER WITH FULL DETAILS & STATUS ===");

      try {
        const { products, email, fullName, phone, userId } =
          ctx.request.body?.data || {};

        if (!Array.isArray(products)) {
          ctx.throw(400, "Products are required");
        }

        let totalAmount = 0;

        const detailedProducts = await Promise.all(
          products.map(async ({ id }) => {
            const item = await strapi.entityService.findOne(
              "api::product.product",
              Number(id),
              { fields: ["productName", "price"] }
            );

            if (!item) throw new Error(`Product ${id} not found`);

            const unitAmount = Math.round(Number(item.price) * 100);
            totalAmount += Number(item.price);

            return {
              id: item.id,
              name: item.productName,
              price: item.price,
              stripeData: {
                price_data: {
                  currency: "mxn",
                  product_data: { name: item.productName },
                  unit_amount: unitAmount,
                },
                quantity: 1,
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
            products: detailedProducts.map(({ id, name, price }) => ({
              id,
              name,
              price,
            })),
            stripeId: session.id,
            email: email,
            customerName: fullName,
            phone: phone,
            total: totalAmount,
            orderStatus: "pending",
            publishedAt: new Date(),
            user: userId,
          },
        });

        console.log(`✅ ORDER CREATED (PENDING) FOR: ${fullName}`);

        return { stripeSession: session };
      } catch (error: any) {
        console.error("🔥 ORDER ERROR:", error);
        ctx.throw(500, error.message || "Internal Server Error");
      }
    },

    // WEBHOOK
    async webhook(ctx) {
      console.log("⚡ STRIPE WEBHOOK RECEIVED");
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
        console.error(`❌ WEBHOOK ERROR: ${err.message}`);
        return ctx.badRequest(`Webhook Error: ${err.message}`);
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const orders = await strapi.entityService.findMany("api::order.order", {
          filters: { stripeId: session.id },
        });

        if (orders.length > 0) {
          const order = orders[0];

          await strapi.entityService.update("api::order.order", order.id, {
            data: {
              orderStatus: "paid",
              shippingAddress: session.shipping_details,
            },
          });

          console.log(`✅ ORDER ${order.id} UPDATED TO PAID. SHIPPING SAVED.`);
        }
      }

      return { received: true };
    },
  })
);
