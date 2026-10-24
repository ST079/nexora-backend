import express from "express";
const router = express.Router();

import checkRole from "../middlewares/checkRole.js";
import orderController from "../controllers/order.controller.js";
import { ROLE_ADMIN, ROLE_MERCHANT } from "../constants/roles.js";
import { orderSchema, orderStatusSchema } from "../libs/schemas/orderSchema.js";
import { validate } from "../middlewares/validate.js";

// `auth` is applied to the whole router in app.js. Per-order access
// (owner / admin / merchant of an item) is checked in the service.

router.get("/", checkRole(ROLE_ADMIN), orderController.getAllOrders);

router.get("/my-orders", orderController.getOrdersByUser);

router.get(
  "/merchant",
  checkRole(ROLE_MERCHANT),
  orderController.getOrdersByMerchant,
);

// Both are scoped to the caller's role inside the service.
router.get("/count", orderController.getTotalCount);
router.get("/stats", orderController.getStats);

router.get("/:id", orderController.getOrderById);

router.post("/", validate(orderSchema), orderController.createOrder);

router.put("/:id/cancel", orderController.cancelOrder);

router.delete("/:id", checkRole(ROLE_ADMIN), orderController.deleteOrder);

router.put(
  "/:id/status",
  checkRole(ROLE_ADMIN),
  validate(orderStatusSchema),
  orderController.updateOrderStatus,
);

router.post("/:id/payment/khalti", orderController.orderPaymentViaKhalti);

router.post("/:id/payment/stripe", orderController.orderPaymentViaStripe);

router.put("/:id/confirm-payment", orderController.confirmOrderPayment);

router.post("/:id/payment/cash", orderController.orderPaymentViaCash);

export default router;
