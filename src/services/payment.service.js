import { ROLE_ADMIN } from "../constants/roles.js";
import orderModel from "../models/Order.js";
import paymentModel from "../models/Payment.js";
import { isSameId } from "../utils/query.js";

// Only the customer who owns the order (or an admin) can see its payment.
const checkPaymentStatus = async (paymentId, user) => {
  const payment = await paymentModel.findById(paymentId);
  if (!payment) return null;

  if (!user?.roles?.includes(ROLE_ADMIN)) {
    const order = await orderModel.findOne({ payment: paymentId }, "user");
    if (!isSameId(order?.user, user?._id))
      throw {
        status: 403,
        message: "Access Denied",
      };
  }

  return payment;
};

export default {
  checkPaymentStatus,
};
