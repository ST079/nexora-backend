import crypto from "crypto";
import mongoose from "mongoose";
import config from "../config/config.js";
import {
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_CONFIRMED,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_PENDING,
  ORDER_STATUS_SHIPPED,
} from "../constants/orderStatuses.js";
import {
  PAYMENT_METHOD_CARD,
  PAYMENT_METHOD_COD,
  PAYMENT_METHOD_ONLINE,
} from "../constants/paymentMethods.js";
import {
  PAYMENT_STATUS_COMPLETED,
  PAYMENT_STATUS_FAILED,
  PAYMENT_STATUS_PENDING,
} from "../constants/paymentStatuses.js";
import { ROLE_ADMIN, ROLE_MERCHANT } from "../constants/roles.js";
import orderModel from "../models/Order.js";
import paymentModel from "../models/Payment.js";
import productModel from "../models/Product.js";
import {
  lookupKhaltiPayment,
  payViaKhalti,
  payViaStripe,
  retrieveStripePayment,
  toPaisa,
} from "../utils/payment.js";
import { escapeRegex, isSameId, toInt } from "../utils/query.js";

const ORDER_STATUSES = [
  ORDER_STATUS_PENDING,
  ORDER_STATUS_CONFIRMED,
  ORDER_STATUS_SHIPPED,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_CANCELLED,
];

// Customers may cancel until the parcel leaves; admins until it is delivered.
const CUSTOMER_CANCELLABLE = [ORDER_STATUS_PENDING, ORDER_STATUS_CONFIRMED];

const KHALTI_WAITING = ["Pending", "Initiated"];
const STRIPE_WAITING = ["processing", "requires_action", "requires_confirmation"];

const isAdmin = (user) => Boolean(user?.roles?.includes(ROLE_ADMIN));
const isMerchant = (user) => Boolean(user?.roles?.includes(ROLE_MERCHANT));
const isOwner = (order, user) =>
  isSameId(order.user?._id ?? order.user, user?._id);
const sellsInOrder = (order, user) =>
  isMerchant(user) &&
  order.orderItems.some((item) => isSameId(item.product?.createdBy, user._id));

const populateOrder = (query) =>
  query
    .populate("user", "name email phone")
    .populate(
      "orderItems.product",
      "name brand category price imageUrls createdBy",
    )
    .populate("payment", "method status transactionId amount");

const buildOrderFilters = ({ status, search, user } = {}) => {
  const filters = {};
  if (ORDER_STATUSES.includes(status)) filters.status = status;
  if (user) filters.user = user;
  if (search)
    filters.orderNumber = { $regex: escapeRegex(search), $options: "i" };
  return filters;
};

const merchantProductIds = (merchantId) =>
  productModel.distinct("_id", { createdBy: merchantId });

// Admins see everything, merchants see orders containing their products,
// everyone else sees their own orders.
const scopeFilters = async (user) => {
  if (isAdmin(user)) return {};
  if (isMerchant(user))
    return {
      "orderItems.product": { $in: await merchantProductIds(user._id) },
    };
  return { user: new mongoose.Types.ObjectId(String(user._id)) };
};

const findOrder = async (orderId) => {
  const order = await populateOrder(orderModel.findById(orderId));

  if (!order)
    throw {
      status: 404,
      message: "Order Not Found! ",
    };

  return order;
};

// Skips lines whose product was deleted — an undefined _id in a filter
// would otherwise match an arbitrary product.
const restock = (items) =>
  Promise.all(
    items
      .map((item) => ({
        id: item.product?._id ?? item.product,
        quantity: item.quantity,
      }))
      .filter(({ id }) => id)
      .map(({ id, quantity }) =>
        productModel.updateOne({ _id: id }, { $inc: { stock: quantity } }),
      ),
  );

const getAllOrders = async (payload) => {
  const { limit, offset } = payload;

  return await populateOrder(
    orderModel
      .find(buildOrderFilters(payload))
      .sort({ createdAt: -1 })
      .limit(toInt(limit))
      .skip(toInt(offset)),
  );
};

const getOrdersByUser = async (userId) => {
  return await populateOrder(
    orderModel.find({ user: userId }).sort({ createdAt: -1 }),
  );
};

const getOrderById = async (orderId, user) => {
  const order = await findOrder(orderId);

  if (!isAdmin(user) && !isOwner(order, user) && !sellsInOrder(order, user))
    throw {
      status: 403,
      message: "Access Denied",
    };

  return order;
};

const createOrder = async (payload, userId) => {
  // Merge repeated lines so stock is checked against the real quantity.
  const quantities = new Map();
  payload.orderItems.forEach(({ product, quantity }) => {
    quantities.set(product, (quantities.get(product) ?? 0) + quantity);
  });

  const products = await productModel.find({
    _id: { $in: [...quantities.keys()] },
  });
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  // Name and price come from the database, never from the cart.
  const orderItems = [...quantities].map(([productId, quantity]) => {
    const product = productsById.get(productId);
    if (!product)
      throw {
        status: 404,
        message: "An item in your cart is no longer available.",
      };
    if (product.stock < quantity)
      throw {
        status: 400,
        message: `Only ${product.stock} left of ${product.name}.`,
      };
    return {
      product: product._id,
      quantity,
      name: product.name,
      price: product.price,
    };
  });

  // The $gte guard makes each decrement atomic, so two shoppers can't both
  // buy the last unit. Anything taken is handed back if a later step fails.
  const reserved = [];
  try {
    for (const item of orderItems) {
      const updated = await productModel.findOneAndUpdate(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
      );
      if (!updated)
        throw {
          status: 409,
          message: `${item.name} just sold out. Please update your cart.`,
        };
      reserved.push(item);
    }

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    return await orderModel.create({
      user: userId,
      orderItems,
      shippingAddress: payload.shippingAddress,
      deliveryCharge: config.delivery_charge,
      totalPrice: subtotal + config.delivery_charge,
      orderNumber: crypto.randomUUID(),
      stockReserved: true,
    });
  } catch (error) {
    await restock(reserved);
    throw error;
  }
};

const markCancelled = async (order) => {
  // Conditional update so a double click can't restock twice.
  const updated = await orderModel.findOneAndUpdate(
    { _id: order._id, status: { $ne: ORDER_STATUS_CANCELLED } },
    { status: ORDER_STATUS_CANCELLED, stockReserved: false },
  );

  if (!updated)
    throw {
      status: 400,
      message: "Order is already cancelled",
    };

  if (updated.stockReserved) await restock(updated.orderItems);

  return await findOrder(order._id);
};

const cancelOrder = async (orderId, user) => {
  const order = await findOrder(orderId);
  const admin = isAdmin(user);

  if (!admin && !isOwner(order, user))
    throw {
      status: 403,
      message: "Access Denied",
    };

  if (order.status === ORDER_STATUS_CANCELLED)
    throw {
      status: 400,
      message: "Order is already cancelled",
    };

  if (order.status === ORDER_STATUS_DELIVERED)
    throw {
      status: 400,
      message: "Delivered orders can't be cancelled.",
    };

  if (!admin && !CUSTOMER_CANCELLABLE.includes(order.status))
    throw {
      status: 400,
      message: "This order has already shipped and can't be cancelled.",
    };

  return await markCancelled(order);
};

const deleteOrder = async (orderId) => {
  const order = await findOrder(orderId);

  // Deleting an open order shouldn't swallow the stock it was holding.
  if (order.stockReserved && order.status !== ORDER_STATUS_DELIVERED)
    await restock(order.orderItems);

  return await orderModel.findByIdAndDelete(orderId);
};

const updateOrderStatus = async (orderId, status) => {
  const order = await findOrder(orderId);

  if (order.status === ORDER_STATUS_CANCELLED)
    throw {
      status: 400,
      message: "Cannot update status of a cancelled order",
    };

  if (order.status === ORDER_STATUS_DELIVERED)
    throw {
      status: 400,
      message: "Delivered orders are final.",
    };

  if (status === order.status) return order;

  if (status === ORDER_STATUS_CANCELLED) return await markCancelled(order);

  await orderModel.findByIdAndUpdate(orderId, { status });

  // Cash is collected at the door, so delivery is when COD gets paid.
  if (
    status === ORDER_STATUS_DELIVERED &&
    order.payment?.method === PAYMENT_METHOD_COD
  )
    await paymentModel.findByIdAndUpdate(order.payment._id, {
      status: PAYMENT_STATUS_COMPLETED,
    });

  return await findOrder(orderId);
};

const getPayableOrder = async (orderId, user) => {
  const order = await findOrder(orderId);

  if (!isOwner(order, user))
    throw {
      status: 403,
      message: "Only the customer who placed this order can pay for it.",
    };

  if (order.payment?.status === PAYMENT_STATUS_COMPLETED)
    throw {
      status: 400,
      message: "This order is already paid.",
    };

  if (order.status !== ORDER_STATUS_PENDING)
    throw {
      status: 400,
      message: "This order is no longer awaiting payment.",
    };

  return order;
};

// One payment record per order: retrying or switching method reuses it.
const attachPayment = async (order, method, transactionId = null) => {
  const fields = {
    method,
    transactionId,
    amount: order.totalPrice,
    status: PAYMENT_STATUS_PENDING,
  };

  if (order.payment)
    return await paymentModel.findByIdAndUpdate(order.payment._id, fields, {
      returnDocument: "after",
    });

  const payment = await paymentModel.create(fields);
  await orderModel.findByIdAndUpdate(order._id, { payment: payment._id });
  return payment;
};

const describeOrder = (order) => ({
  amount: order.totalPrice,
  purchase_order_id: String(order._id),
  purchase_order_name:
    order.orderItems[0]?.name ||
    order.orderItems[0]?.product?.name ||
    "Nexora order",
  customer_info: {
    name: order.user?.name,
    email: order.user?.email,
    phone: order.user?.phone,
  },
});

const orderPaymentViaKhalti = async (orderId, user) => {
  const order = await getPayableOrder(orderId, user);
  const khalti = await payViaKhalti(describeOrder(order));

  // pidx is what we look the payment up by when Khalti redirects back.
  await attachPayment(order, PAYMENT_METHOD_ONLINE, khalti.pidx);

  return khalti;
};

const orderPaymentViaStripe = async (orderId, user) => {
  const order = await getPayableOrder(orderId, user);
  const paymentIntent = await payViaStripe(describeOrder(order));

  await attachPayment(order, PAYMENT_METHOD_CARD, paymentIntent.id);

  return paymentIntent;
};

const orderPaymentViaCash = async (orderId, user) => {
  const order = await getPayableOrder(orderId, user);

  await attachPayment(order, PAYMENT_METHOD_COD);
  await orderModel.findByIdAndUpdate(orderId, {
    status: ORDER_STATUS_CONFIRMED,
  });

  return await findOrder(orderId);
};

// Ask the provider what really happened; the client's word isn't enough.
const verifyWithProvider = async (payment) => {
  const expectedAmount = toPaisa(payment.amount);

  if (payment.method === PAYMENT_METHOD_ONLINE) {
    const lookup = await lookupKhaltiPayment(payment.transactionId);
    if (lookup.status === "Completed" && lookup.total_amount === expectedAmount)
      return PAYMENT_STATUS_COMPLETED;
    if (KHALTI_WAITING.includes(lookup.status)) return PAYMENT_STATUS_PENDING;
    return PAYMENT_STATUS_FAILED;
  }

  const intent = await retrieveStripePayment(payment.transactionId);
  if (intent.status === "succeeded" && intent.amount === expectedAmount)
    return PAYMENT_STATUS_COMPLETED;
  if (STRIPE_WAITING.includes(intent.status)) return PAYMENT_STATUS_PENDING;
  return PAYMENT_STATUS_FAILED;
};

const confirmOrderPayment = async (orderId, { pidx } = {}, user) => {
  const order = await findOrder(orderId);

  if (!isOwner(order, user) && !isAdmin(user))
    throw {
      status: 403,
      message: "Access Denied",
    };

  const payment = order.payment;

  if (!payment)
    throw {
      status: 400,
      message: "No payment has been started for this order.",
    };

  // The callback page can be refreshed; confirming twice is fine.
  if (payment.status === PAYMENT_STATUS_COMPLETED) return order;

  if (payment.method === PAYMENT_METHOD_COD)
    throw {
      status: 400,
      message: "Cash on delivery is settled when the order is delivered.",
    };

  if (order.status === ORDER_STATUS_CANCELLED)
    throw {
      status: 400,
      message: "This order was cancelled.",
    };

  if (!payment.transactionId || (pidx && pidx !== payment.transactionId))
    throw {
      status: 400,
      message: "Payment reference doesn't match. Please start the payment again.",
    };

  const result = await verifyWithProvider(payment);

  if (result === PAYMENT_STATUS_PENDING)
    throw {
      status: 400,
      message:
        "Your payment hasn't gone through yet. If you finished paying, refresh in a moment.",
    };

  if (result === PAYMENT_STATUS_FAILED) {
    await paymentModel.findByIdAndUpdate(payment._id, {
      status: PAYMENT_STATUS_FAILED,
    });
    throw {
      status: 400,
      message: "Payment failed.",
    };
  }

  await paymentModel.findByIdAndUpdate(payment._id, {
    status: PAYMENT_STATUS_COMPLETED,
  });
  await orderModel.findByIdAndUpdate(orderId, {
    status: ORDER_STATUS_CONFIRMED,
  });

  return await findOrder(orderId);
};

// Orders that contain at least one of the merchant's products. Items from
// other sellers are left out, and merchantTotal is this merchant's share.
const getOrdersByMerchant = async (merchantId, query = {}) => {
  const productIds = await merchantProductIds(merchantId);
  const ownProducts = new Set(productIds.map(String));

  const orders = await populateOrder(
    orderModel
      .find({
        ...buildOrderFilters(query),
        "orderItems.product": { $in: productIds },
      })
      .sort({ createdAt: -1 })
      .limit(toInt(query.limit))
      .skip(toInt(query.offset)),
  ).lean();

  return orders.map((order) => {
    const orderItems = order.orderItems.filter((item) =>
      ownProducts.has(String(item.product?._id)),
    );
    const merchantTotal = orderItems.reduce(
      (sum, item) =>
        sum + (item.price ?? item.product?.price ?? 0) * item.quantity,
      0,
    );
    return { ...order, orderItems, merchantTotal };
  });
};

const getTotalCount = async (query = {}, user) => {
  return await orderModel.countDocuments({
    ...buildOrderFilters(query),
    ...(await scopeFilters(user)),
  });
};

// Dashboard numbers in one round trip instead of fetching every order.
// Revenue counts paid orders plus delivered ones (COD is paid on delivery).
const getStats = async (user) => {
  const scope = await scopeFilters(user);
  const merchantOnly = !isAdmin(user) && isMerchant(user);

  const revenuePipeline = [
    { $match: { ...scope, status: { $ne: ORDER_STATUS_CANCELLED } } },
    {
      $lookup: {
        from: "payments",
        localField: "payment",
        foreignField: "_id",
        as: "paymentDoc",
      },
    },
    {
      $match: {
        $or: [
          { "paymentDoc.status": PAYMENT_STATUS_COMPLETED },
          { status: ORDER_STATUS_DELIVERED },
        ],
      },
    },
  ];

  if (merchantOnly) {
    // A merchant earns their own lines, not the whole basket or delivery.
    revenuePipeline.push(
      { $unwind: "$orderItems" },
      { $match: scope },
      {
        $lookup: {
          from: "products",
          localField: "orderItems.product",
          foreignField: "_id",
          as: "productDoc",
        },
      },
      {
        $group: {
          _id: null,
          revenue: {
            $sum: {
              $multiply: [
                {
                  $ifNull: [
                    "$orderItems.price",
                    { $first: "$productDoc.price" },
                    0,
                  ],
                },
                "$orderItems.quantity",
              ],
            },
          },
        },
      },
    );
  } else {
    revenuePipeline.push({
      $group: { _id: null, revenue: { $sum: "$totalPrice" } },
    });
  }

  const [statusCounts, revenueResult] = await Promise.all([
    orderModel.aggregate([
      { $match: scope },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    orderModel.aggregate(revenuePipeline),
  ]);

  const byStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  statusCounts.forEach(({ _id, count }) => {
    if (_id in byStatus) byStatus[_id] = count;
  });

  return {
    total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
    byStatus,
    revenue: revenueResult[0]?.revenue ?? 0,
  };
};

export default {
  getAllOrders,
  getOrdersByUser,
  getOrderById,
  createOrder,
  deleteOrder,
  cancelOrder,
  updateOrderStatus,
  orderPaymentViaKhalti,
  orderPaymentViaStripe,
  orderPaymentViaCash,
  confirmOrderPayment,
  getOrdersByMerchant,
  getTotalCount,
  getStats,
};
