// Creates the shared demo shopper offered on the sign-in page, so visitors
// can try checkout and order tracking without making an account.
//
//   node scripts/seed-demo-user.js --yes            create or reset it
//   node scripts/seed-demo-user.js --clean --yes    remove it and its orders
//
// The sign-in page shows the same email and password (nexora-frontend
// src/constants/demo.js); change both together. Re-running resets the
// password, profile and role, and puts back three sample orders
// (SAMPLE-0001 to 0003: delivered, shipped, confirmed) so the order timeline
// has every step to show. Orders visitors placed are kept. Sample orders are
// history, so they don't change stock.
import mongoose from "mongoose";
import config from "../src/config/config.js";
import {
  ORDER_STATUS_CONFIRMED,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_SHIPPED,
} from "../src/constants/orderStatuses.js";
import { PAYMENT_METHOD_COD } from "../src/constants/paymentMethods.js";
import {
  PAYMENT_STATUS_COMPLETED,
  PAYMENT_STATUS_PENDING,
} from "../src/constants/paymentStatuses.js";
import { ROLE_USER } from "../src/constants/roles.js";
import orderModel from "../src/models/Order.js";
import paymentModel from "../src/models/Payment.js";
import productModel from "../src/models/Product.js";
import userModel from "../src/models/User.js";
import { hashPassword } from "../src/utils/bcrypt.js";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo1234";
const DEMO_PHONE = "9800000001";
const ADDRESS = { country: "Nepal", province: "Bagmati", city: "Kathmandu", street: "Demo Street" };
const SAMPLE_PREFIX = "SAMPLE-";
const DEMO_FOLDER = "nexora-demo-products";
const HOUR = 60 * 60 * 1000;

// Oldest first. COD is only marked paid once the order is delivered, as in
// the real flow.
const SAMPLES = [
  { status: ORDER_STATUS_DELIVERED, paid: true, hoursAgo: 9 * 24, lines: [[0, 1], [1, 1]] },
  { status: ORDER_STATUS_SHIPPED, paid: false, hoursAgo: 2 * 24, lines: [[2, 2]] },
  { status: ORDER_STATUS_CONFIRMED, paid: false, hoursAgo: 5, lines: [[3, 1]] },
];

const args = new Set(process.argv.slice(2));
if (!args.has("--yes")) {
  console.log("Writes the demo account to the database in DBURL. Re-run with --yes.");
  process.exit(1);
}

// Payments of the given orders, then the orders themselves.
const removeOrders = async (orders) => {
  const payments = orders.map((o) => o.payment).filter(Boolean);
  await paymentModel.deleteMany({ _id: { $in: payments } });
  await orderModel.deleteMany({ _id: { $in: orders.map((o) => o._id) } });
};

await mongoose.connect(config.databaseURL);
const { host, name: dbName } = mongoose.connection;
console.log(`Database: ${dbName} on ${host}`);

const existing = await userModel.findOne({ email: DEMO_EMAIL });

if (args.has("--clean")) {
  if (!existing?.isDemo) {
    console.log("No demo account to remove.");
    await mongoose.disconnect();
    process.exit(0);
  }
  const orders = await orderModel.find({ user: existing._id }).lean();
  // Same rule as deleting an order in the admin: open orders give their
  // stock back.
  const open = orders.filter((o) => o.stockReserved && o.status !== ORDER_STATUS_DELIVERED);
  await Promise.all(
    open.flatMap((o) =>
      o.orderItems.map((item) =>
        productModel.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }),
      ),
    ),
  );
  await removeOrders(orders);
  await userModel.deleteOne({ _id: existing._id });
  console.log(
    `Removed the demo account and its ${orders.length} order(s); ${open.length} gave stock back.`,
  );
  await mongoose.disconnect();
  process.exit(0);
}

// Never take over a real account that happens to use these details.
const clash = existing && !existing.isDemo
  ? `${DEMO_EMAIL} is already used by an account that isn't the demo one.`
  : (await userModel.exists({ phone: DEMO_PHONE, email: { $ne: DEMO_EMAIL } }))
    ? `Phone ${DEMO_PHONE} is already used by another account.`
    : null;
if (clash) {
  console.log(`${clash} Nothing was changed.`);
  await mongoose.disconnect();
  process.exit(1);
}

const demo = await userModel.findOneAndUpdate(
  { email: DEMO_EMAIL },
  {
    $set: {
      name: "Demo Customer",
      password: await hashPassword(DEMO_PASSWORD),
      phone: DEMO_PHONE,
      address: ADDRESS,
      roles: [ROLE_USER],
      isActive: true,
      isDemo: true,
    },
  },
  { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
);
console.log(`${existing ? "Reset" : "Created"} the demo account: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

// Replace the sample orders, leaving the ones visitors placed.
await removeOrders(
  await orderModel
    .find({ user: demo._id, orderNumber: { $regex: `^${SAMPLE_PREFIX}` } })
    .lean(),
);

// One product from each of the first few categories, from the demo
// catalogue when it's there.
const demoCatalogue = { imageUrls: { $regex: `/${DEMO_FOLDER}/` } };
const pool = (await productModel.exists(demoCatalogue))
  ? await productModel.find(demoCatalogue, "name price category").sort({ createdAt: 1 }).lean()
  : await productModel.find({}, "name price category").sort({ createdAt: 1 }).lean();
const firstByCategory = [...new Set(pool.map((p) => p.category))].map((category) =>
  pool.find((p) => p.category === category),
);
const products = firstByCategory.length >= 4 ? firstByCategory : pool;

if (products.length < 4) {
  console.log(`Only ${products.length} product(s) in the catalogue, so no sample orders were added.`);
  await mongoose.disconnect();
  process.exit(0);
}

const now = Date.now();
for (const [i, sample] of SAMPLES.entries()) {
  const orderItems = sample.lines.map(([index, quantity]) => ({
    product: products[index]._id,
    quantity,
    name: products[index].name,
    price: products[index].price,
  }));
  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalPrice = subtotal + config.delivery_charge;
  const createdAt = new Date(now - sample.hoursAgo * HOUR);

  const payment = await paymentModel.create({
    method: PAYMENT_METHOD_COD,
    status: sample.paid ? PAYMENT_STATUS_COMPLETED : PAYMENT_STATUS_PENDING,
    amount: totalPrice,
    createdAt,
  });
  await orderModel.create({
    user: demo._id,
    status: sample.status,
    orderItems,
    shippingAddress: ADDRESS,
    deliveryCharge: config.delivery_charge,
    totalPrice,
    createdAt,
    orderNumber: `${SAMPLE_PREFIX}${String(i + 1).padStart(4, "0")}`,
    payment: payment._id,
  });
}
console.log(`Added ${SAMPLES.length} sample orders.`);
await mongoose.disconnect();
