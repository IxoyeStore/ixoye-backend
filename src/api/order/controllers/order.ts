"use strict";

import Stripe from "stripe";
import { factories } from "@strapi/strapi";

console.log("🔑 STRIPE KEY EXISTS:", !!process.env.STRIPE_KEY);
console.log("🌐 CLIENT URL:", process.env.CLIENT_URL);

const stripe = new Stripe(process.env.STRIPE_KEY as string, {
  apiVersion: "2025-12-15.clover",
});

export default factories.createCoreController(
  "api::order.order",
  ({ strapi }) => ({
    async create(ctx) {
      console.log("=== 🛒 CREATE ORDER CALLED ===");

      try {
        console.log("📥 RAW BODY:", ctx.request.body);

        const products = ctx.request.body?.data?.products;
        console.log("📦 PARSED PRODUCTS:", products);

        if (!Array.isArray(products)) {
          console.error("❌ PRODUCTS IS NOT AN ARRAY");
          ctx.throw(400, "Products are required");
        }

        const lineItems = await Promise.all(
          products.map(async ({ id }, index) => {
            console.log(`➡️ PRODUCT[${index}] ID:`, id, "TYPE:", typeof id);

            const item = await strapi.entityService.findOne(
              "api::product.product",
              Number(id),
              {
                fields: ["productName", "price"],
              }
            );

            console.log(`✅ FOUND PRODUCT[${index}]:`, item);

            if (!item) {
              console.error(`❌ PRODUCT ${id} NOT FOUND`);
              throw new Error(`Product ${id} not found`);
            }

            const unitAmount = Math.round(Number(item.price) * 100);
            console.log(`💰 UNIT AMOUNT (cents):`, unitAmount);

            return {
              price_data: {
                currency: "mxn",
                product_data: {
                  name: item.productName,
                },
                unit_amount: unitAmount,
              },
              quantity: 1,
            };
          })
        );

        console.log("🧾 LINE ITEMS:", lineItems);

        console.log("🚀 CREATING STRIPE SESSION...");
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          automatic_tax: {
            enabled: true,
          },
          shipping_address_collection: {
            allowed_countries: ["MX"],
          },
          locale: "es",
          payment_method_types: ["card"],
          success_url: `${process.env.CLIENT_URL}/success`,
          cancel_url: `${process.env.CLIENT_URL}/successError`,
          line_items: lineItems,
        });

        console.log("💳 STRIPE SESSION CREATED:", {
          id: session.id,
          url: session.url,
        });

        console.log("📝 SAVING ORDER IN STRAPI...");
        await strapi.entityService.create("api::order.order", {
          data: {
            products,
            stripeId: session.id,
          },
        });

        console.log("✅ ORDER SAVED SUCCESSFULLY");

        return { stripeSession: session };
      } catch (error: any) {
        console.error("🔥 ORDER ERROR FULL:", error);
        ctx.throw(500, error.message || "Internal Server Error");
      }
    },
  })
);
