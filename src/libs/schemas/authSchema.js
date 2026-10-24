import z from "zod";
import { userSchema } from "./user.schema.js";

const loginSchema = z
  .object({
    email: z.email().optional(),
    phone: z.string().optional(),
    password: z.string().min(6),
  })
  .refine((data) => data.email || data.phone, {
    message: "Either email or phone must be provided.",
    path: ["email"],
  });

// Roles and account state are never chosen by the person signing up.
const registerSchema = userSchema
  .omit({ roles: true, isActive: true, profileImageUrl: true })
  .extend({
    address: z.object({
      country: z.string().default("Nepal"),
      province: z.string().min(1, "Province is required."),
      city: z.string().min(1, "City is required."),
      street: z.string().optional(),
    }),
  });

// Accounts an admin creates may start with any roles.
const createUserSchema = registerSchema.extend({
  roles: userSchema.shape.roles,
});

const forgotPasswordSchema = z.object({
  email: z.email(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6, "Password must be at least 6 characters long."),
});

export {
  loginSchema,
  registerSchema,
  createUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
