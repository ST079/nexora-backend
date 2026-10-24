import express from "express";
import userController from "../controllers/user.controller.js";
import { validate } from "../middlewares/validate.js";
import {
  changePasswordSchema,
  updateRolesSchema,
} from "../libs/schemas/user.schema.js";
import { createUserSchema } from "../libs/schemas/authSchema.js";
import checkRole from "../middlewares/checkRole.js";
import { ROLE_ADMIN } from "../constants/roles.js";
import upload from "../middlewares/upload.js";

const router = express.Router();


/**
 * GET /api/v1/users/
 */

router.get("/", checkRole(ROLE_ADMIN), userController.getAllUser);

/**
 * GET /api/v1/users/me
 */

router.get("/me", userController.getLoggedInUser);

/**
 * GET /api/v1/users/count
 */
router.get("/count", checkRole(ROLE_ADMIN), userController.getTotalCount);

/**
 * GET /api/v1/users/stats
 */
router.get("/stats", checkRole(ROLE_ADMIN), userController.getStats);

/**
 * GET /api/v1/users/:id
 */

router.get("/:id", checkRole(ROLE_ADMIN), userController.getUserById);

/**
 * Post /api/v1/users/
 */
router.post(
  "/",
  checkRole(ROLE_ADMIN),
  validate(createUserSchema),
  userController.createUser,
);

/**
 * Patch /api/v1/users/change-password
 */
router.patch(
  "/change-password",
  validate(changePasswordSchema),
  userController.changePassword,
);

/**
 * Put /api/v1/users/:id/update-profile
 */
router.put(
  "/:id/update-profile",
  upload.single("image"),
  userController.updateUser,
);

/**
 * Patch /api/v1/users/profile-image
 */
router.patch(
  "/profile-image",
  upload.single("image"),
  userController.updateUserProfileImage,
);

/**
 * Delete /api/v1/users/:id
 */
router.delete("/:id", checkRole(ROLE_ADMIN), userController.deleteUser);

/**
 * Patch /api/v1/users/:id/roles
 */
router.patch(
  "/:id/roles",
  checkRole(ROLE_ADMIN),
  validate(updateRolesSchema),
  userController.updateUserRoles,
);

export default router;
