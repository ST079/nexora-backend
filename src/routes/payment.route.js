import express from "express";
import paymentController from "../controllers/payment.controller.js";

const router = express.Router();

/**
 * GET /api/v1/payments/:id/status
 * `auth` comes from app.js; the service checks the caller owns the order.
 */

router.get("/:id/status", paymentController.checkPaymentStatus);

export default router;
