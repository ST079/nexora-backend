import z from "zod";
import {
  ORDER_STATUS_CANCELLED,
  ORDER_STATUS_CONFIRMED,
  ORDER_STATUS_DELIVERED,
  ORDER_STATUS_PENDING,
  ORDER_STATUS_SHIPPED,
} from "../../constants/orderStatuses.js";

// Status, totals and payment are decided by the server, so the client can
// only send what it wants to buy and where to ship it.
const orderSchema = z.object({
  orderItems: z
    .array(
      z.object({
        product: z.string({ error: "Product is required" }),
        quantity: z.coerce.number().int().min(1).default(1),
      }),
    )
    .min(1, "Order must contain at least one item."),
  shippingAddress: z.object({
    country: z.string().default("Nepal"),
    province: z.string().optional(),
    city: z.string({ error: "Shipping Address City is required." }).min(1),
    street: z.string({ error: "Shipping Address Street is required." }).min(1),
  }),
});

const orderStatusSchema = z.object({
  status: z.enum(
    [
      ORDER_STATUS_CANCELLED,
      ORDER_STATUS_CONFIRMED,
      ORDER_STATUS_DELIVERED,
      ORDER_STATUS_PENDING,
      ORDER_STATUS_SHIPPED,
    ],
    { error: "Invalid order status" },
  ),
});

export { orderSchema, orderStatusSchema };
