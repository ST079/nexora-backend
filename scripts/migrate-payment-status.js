// One-off fix for payments saved by the old confirm-payment code, which wrote
// status "SUCCESS" (not in the Payment enum). Rewrites them to "COMPLETED".
//
//   node scripts/migrate-payment-status.js
import mongoose from "mongoose";
import config from "../src/config/config.js";
import { PAYMENT_STATUS_COMPLETED } from "../src/constants/paymentStatuses.js";

await mongoose.connect(config.databaseURL);

const result = await mongoose.connection
  .collection("payments")
  .updateMany({ status: "SUCCESS" }, { $set: { status: PAYMENT_STATUS_COMPLETED } });

console.log(`Updated ${result.modifiedCount} payment(s).`);
await mongoose.disconnect();
