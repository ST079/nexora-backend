import express from "express";
import authController from "../controllers/auth.controller.js";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "../libs/schemas/authSchema.js";
import { validate } from "../middlewares/validate.js";
import {
  forgotPasswordLimiter,
  loginLimiter,
  registerLimiter,
  resetPasswordLimiter,
} from "../middlewares/rateLimit.js";

const router = express.Router();

// Limiters run before validation so malformed attempts count too.
router.post("/login", loginLimiter, validate(loginSchema), authController.login);

router.post("/register", registerLimiter, validate(registerSchema), authController.register);

router.post("/forgot-password", forgotPasswordLimiter, validate(forgotPasswordSchema), authController.forgotPassword);

router.post("/reset-password", resetPasswordLimiter, validate(resetPasswordSchema), authController.resetPassword);

export default router;
