"use strict";
/**
 * Crea (o completa) el entorno de pruebas local: usuario admin, permisos
 * del rol Admin y un puñado de productos de ejemplo. Idempotente — se puede
 * correr varias veces sin duplicar nada. Usa DATABASE_FILENAME del .env
 * (por defecto .tmp/local-dev.db).
 *
 * Uso: node scripts/seed-local-dev.js
 */

const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const dbFile = process.env.DATABASE_FILENAME || ".tmp/local-dev.db";
const dbPath = path.join(__dirname, "..", dbFile);
const db = new Database(dbPath);

const ADMIN_EMAIL = "tienda_admin@test.local";
const ADMIN_USERNAME = "tienda_admin";
const ADMIN_PASSWORD = "AdminPrueba123!";

const CUSTOMER_EMAIL = "cliente_prueba2@test.local";
const CUSTOMER_USERNAME = "cliente_prueba2";
const CUSTOMER_PASSWORD = "ClientePrueba123!";

const ADMIN_PERMISSIONS = [
  "api::product.product.find",
  "api::product.product.findOne",
  "api::product.product.create",
  "api::product.product.update",
  "api::product.product.delete",
  "api::category.category.find",
  "api::category.category.findOne",
  "api::order.order.find",
  "api::order.order.findOne",
  "api::order.order.update",
  "api::address.address.find",
  "api::address.address.findOne",
  "api::question.question.find",
  "api::question.question.update",
  "api::question.question.delete",
  "plugin::users-permissions.user.find",
  "plugin::users-permissions.user.count",
  "plugin::users-permissions.user.me",
  "plugin::users-permissions.role.find",
  "plugin::users-permissions.role.findOne",
];

// Lo que un cliente real puede hacer: ver catalogo, crear/editar sus
// direcciones y poner una orden. Necesario para probar el flujo de
// checkout (validaciones de direccion/envio/stock) sin admin.
const AUTHENTICATED_PERMISSIONS = [
  "api::product.product.find",
  "api::product.product.findOne",
  "api::category.category.find",
  "api::category.category.findOne",
  "api::address.address.find",
  "api::address.address.create",
  "api::address.address.update",
  "api::order.order.create",
];

const DEMO_PRODUCTS = [
  { name: "Filtro de Aceite de Prueba", code: "DEMO001", price: 250, wholesale: null, stock: 10, brand: null, featured: 0, freeship: 0 },
  { name: "Bomba de Agua de Prueba", code: "DEMO002", price: 800, wholesale: 650, stock: 3, brand: "Bosch", featured: 1, freeship: 0 },
  { name: "Banda de Distribucion de Prueba", code: "DEMO003", price: 450, wholesale: 380, stock: 0, brand: "Gates", featured: 0, freeship: 1 },
  { name: "Filtro de Aire de Prueba", code: "DEMO004", price: 180, wholesale: 140, stock: 25, brand: "Bosch", featured: 0, freeship: 0 },
  { name: "Kit de Frenos de Prueba", code: "DEMO005", price: 1200, wholesale: 980, stock: 7, brand: "Brembo", featured: 1, freeship: 1 },
];

function docId() {
  return crypto.randomBytes(16).toString("hex").slice(0, 24);
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function grantPermissions(roleType, actions) {
  const now = Date.now();
  const role = db.prepare("SELECT id FROM up_roles WHERE type = ?").get(roleType);
  if (!role) {
    console.error(`No existe el rol '${roleType}' en up_roles. Corre \`strapi develop\` una vez primero para que Strapi inicialice las tablas.`);
    process.exit(1);
  }

  const maxOrd = db.prepare("SELECT MAX(permission_ord) as m FROM up_permissions_role_lnk WHERE role_id = ?").get(role.id).m || 0;
  const insertPerm = db.prepare(`
    INSERT INTO up_permissions (document_id, action, created_at, updated_at, published_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertLnk = db.prepare("INSERT INTO up_permissions_role_lnk (permission_id, role_id, permission_ord) VALUES (?, ?, ?)");

  let ord = maxOrd;
  for (const action of actions) {
    let perm = db.prepare("SELECT id FROM up_permissions WHERE action = ?").get(action);
    if (!perm) {
      const info = insertPerm.run(docId(), action, now, now, now);
      perm = { id: info.lastInsertRowid };
    }
    const alreadyLinked = db.prepare("SELECT id FROM up_permissions_role_lnk WHERE permission_id = ? AND role_id = ?").get(perm.id, role.id);
    if (!alreadyLinked) {
      ord += 1;
      insertLnk.run(perm.id, role.id, ord);
    }
  }
  console.log(`Permisos del rol '${roleType}' verificados (${actions.length} acciones).`);
  return role;
}

function ensureUser({ email, username, password, roleId }) {
  const now = Date.now();
  let user = db.prepare("SELECT id FROM up_users WHERE email = ?").get(email);
  const passwordHash = bcrypt.hashSync(password, 10);

  if (!user) {
    const info = db.prepare(`
      INSERT INTO up_users (document_id, username, email, provider, password, confirmed, blocked, created_at, updated_at, published_at)
      VALUES (?, ?, ?, 'local', ?, 1, 0, ?, ?, ?)
    `).run(docId(), username, email, passwordHash, now, now, now);
    user = { id: info.lastInsertRowid };
    console.log(`Usuario creado: ${email}`);
  } else {
    db.prepare("UPDATE up_users SET password = ? WHERE id = ?").run(passwordHash, user.id);
    console.log(`Usuario ya existia, password reseteada: ${email}`);
  }

  const linked = db.prepare("SELECT id FROM up_users_role_lnk WHERE user_id = ?").get(user.id);
  if (!linked) {
    db.prepare("INSERT INTO up_users_role_lnk (user_id, role_id, user_ord) VALUES (?, ?, 1)").run(user.id, roleId);
  } else {
    db.prepare("UPDATE up_users_role_lnk SET role_id = ? WHERE user_id = ?").run(roleId, user.id);
  }

  return user;
}

function ensureDemoProducts() {
  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO products (
      document_id, product_name, slug, code, price, wholesale_price, stock, brand,
      is_featured, active, free_shipping, created_at, updated_at, published_at
    ) VALUES (
      @document_id, @product_name, @slug, @code, @price, @wholesale_price, @stock, @brand,
      @is_featured, 1, @free_shipping, @created_at, @updated_at, @published_at
    )
  `);

  for (const p of DEMO_PRODUCTS) {
    const existing = db.prepare("SELECT id FROM products WHERE code = ?").get(p.code);
    if (existing) continue;
    insert.run({
      document_id: docId(),
      product_name: p.name,
      slug: slugify(p.name),
      code: p.code,
      price: p.price,
      wholesale_price: p.wholesale,
      stock: p.stock,
      brand: p.brand,
      is_featured: p.featured,
      free_shipping: p.freeship,
      created_at: now,
      updated_at: now,
      published_at: now,
    });
    console.log(`Producto creado: ${p.code} - ${p.name}`);
  }
}

const adminRole = grantPermissions("admin", ADMIN_PERMISSIONS);
ensureUser({ email: ADMIN_EMAIL, username: ADMIN_USERNAME, password: ADMIN_PASSWORD, roleId: adminRole.id });

const authenticatedRole = grantPermissions("authenticated", AUTHENTICATED_PERMISSIONS);
ensureUser({ email: CUSTOMER_EMAIL, username: CUSTOMER_USERNAME, password: CUSTOMER_PASSWORD, roleId: authenticatedRole.id });

ensureDemoProducts();
db.close();

console.log("\nListo. Entra como admin con:");
console.log(`  Email:    ${ADMIN_EMAIL}`);
console.log(`  Password: ${ADMIN_PASSWORD}`);
console.log("\nO como cliente de prueba (para probar checkout) con:");
console.log(`  Email:    ${CUSTOMER_EMAIL}`);
console.log(`  Password: ${CUSTOMER_PASSWORD}`);
