// Adds a month of made-up orders so the algorithms have history to work
// with (Apriori needs baskets, the restock forecast needs daily sales).
// Use it on a demo or local database only, never on real customer data.
//
//   node scripts/seed-demo-orders.js --yes            add ~150 demo orders
//   node scripts/seed-demo-orders.js --clean --yes    remove them again
//
// Every order it writes has an orderNumber starting with "DEMO-" and belongs
// to one demo customer, so --clean removes exactly what was added. Stock is
// not changed: the orders are history, not new sales.
import crypto from "crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import config from "../src/config/config.js";
import {
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_CONFIRMED,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_PENDING,
  ORDER_STATUS_SHIPPED,
} from "../src/constants/orderStatuses.js";
import orderModel from "../src/models/Order.js";
import productModel from "../src/models/Product.js";
import userModel from "../src/models/User.js";

const DEMO_PREFIX = "DEMO-";
const DEMO_EMAIL = "demo.shopper@example.com";
const DAYS = 30;
const ORDER_COUNT = 150;

const args = new Set(process.argv.slice(2));
if (!args.has("--yes")) {
  console.log("Writes demo orders to the database in DBURL. Re-run with --yes.");
  process.exit(1);
}

// Seeded PRNG (mulberry32) so every run produces the same history.
let seed = 6;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const randomInt = (min, max) => min + Math.floor(random() * (max - min + 1));

// Weighted pick: earlier entries are chosen more often (Zipf-like), so a
// few products sell fast and the rest trickle.
const weightedPick = (items) => {
  const weights = items.map((_, i) => 1 / (i + 1));
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items.at(-1);
};

const STATUSES = [
  [ORDER_STATUS_DELIVERED, 0.5],
  [ORDER_STATUS_SHIPPED, 0.15],
  [ORDER_STATUS_CONFIRMED, 0.15],
  [ORDER_STATUS_PENDING, 0.1],
  [ORDER_STATUS_CANCELLED, 0.1],
];
const pickStatus = () => {
  let roll = random();
  for (const [status, share] of STATUSES) {
    roll -= share;
    if (roll <= 0) return status;
  }
  return ORDER_STATUS_DELIVERED;
};

await mongoose.connect(config.databaseURL);
const { host, name: dbName } = mongoose.connection;
console.log(`Database: ${dbName} on ${host}`);

if (args.has("--clean")) {
  const { deletedCount } = await orderModel.deleteMany({
    orderNumber: { $regex: `^${DEMO_PREFIX}` },
  });
  await userModel.deleteOne({ email: DEMO_EMAIL });
  console.log(`Removed ${deletedCount} demo order(s) and the demo customer.`);
  await mongoose.disconnect();
  process.exit(0);
}

const products = await productModel
  .find({}, "name price category")
  .sort({ createdAt: 1 })
  .lean();
if (products.length < 2) {
  console.log("Add at least two products first.");
  await mongoose.disconnect();
  process.exit(1);
}

// The customer gets an unguessable password nobody knows; it only owns orders.
const customer =
  (await userModel.findOne({ email: DEMO_EMAIL })) ??
  (await userModel.create({
    name: "Demo Shopper",
    email: DEMO_EMAIL,
    password: await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 10),
    phone: "9800000000",
    address: { province: "Bagmati", city: "Kathmandu", street: "Demo Street" },
  }));

// Each product gets a "partner": the next product in its category (or the
// next product overall), bought alongside it most of the time. These are the
// pairs Apriori should find.
const partnerOf = new Map(
  products.map((product, i) => {
    const sameCategory = products.filter((p) => p.category === product.category);
    const partner =
      sameCategory.length > 1
        ? sameCategory[(sameCategory.indexOf(product) + 1) % sameCategory.length]
        : products[(i + 1) % products.length];
    return [product, partner];
  }),
);

const now = Date.now();
const orders = Array.from({ length: ORDER_COUNT }, (_, i) => {
  const basket = new Map();
  const add = (product) =>
    basket.set(product, (basket.get(product) ?? 0) + randomInt(1, 2));

  const anchor = weightedPick(products);
  add(anchor);
  if (random() < 0.6) add(partnerOf.get(anchor));
  if (random() < 0.2) add(products[randomInt(0, products.length - 1)]);

  const orderItems = [...basket].map(([product, quantity]) => ({
    product: product._id,
    quantity,
    name: product.name,
    price: product.price,
  }));
  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // Spread over the window, a little busier towards today.
  const daysAgo = DAYS * (1 - Math.sqrt(random()));

  return {
    user: customer._id,
    status: pickStatus(),
    orderItems,
    shippingAddress: { street: "Demo Street", city: "Kathmandu", province: "Bagmati" },
    deliveryCharge: config.delivery_charge,
    totalPrice: subtotal + config.delivery_charge,
    createdAt: new Date(now - daysAgo * 24 * 60 * 60 * 1000),
    orderNumber: `${DEMO_PREFIX}${String(i + 1).padStart(4, "0")}`,
  };
});

await orderModel.deleteMany({ orderNumber: { $regex: `^${DEMO_PREFIX}` } });
await orderModel.insertMany(orders);
console.log(`Added ${orders.length} demo orders across ${products.length} products.`);
await mongoose.disconnect();
