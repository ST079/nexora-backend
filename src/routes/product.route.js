import express from "express";
import productControllers from "../controllers/product.controller.js";
import auth from "../middlewares/auth.js";
import checkRole from "../middlewares/checkRole.js";
import { ROLE_ADMIN, ROLE_MERCHANT } from "../constants/roles.js";
import { validate } from "../middlewares/validate.js";
import {
  productSchema,
  productUpdateSchema,
} from "../libs/schemas/productSchema.js";
import upload from "../middlewares/upload.js";

const router = express.Router();


/**
 * GET /api/v1/products/
 */
router.get("/", productControllers.getAllProducts);

/**
 * GET /api/v1/brands
 */

router.get("/brands", productControllers.getBrands);

/**
 * GET /api/v1/categories
 */

router.get("/categories", productControllers.getCategories);

/**
 * GET /api/v1/products/count
 */
router.get("/count", productControllers.getTotalCount);

/**
 * GET /api/v1/products/:id
 */
router.get("/:id", productControllers.getProductById);

/**
 * Post /api/v1/products/
 */
router.post(
  "/",
  auth,
  checkRole(ROLE_MERCHANT, ROLE_ADMIN),
  upload.array("images"),
  validate(productSchema),
  productControllers.createProduct,
);

/**
 * Put /api/v1/products/:id
 */
router.put(
  "/:id",
  auth,
  checkRole(ROLE_MERCHANT, ROLE_ADMIN),
  upload.array("images"),
  validate(productUpdateSchema),
  productControllers.updateProduct,
);

/**
 * Delete /api/v1/products/:id
 */

router.delete(
  "/:id",
  auth,
  checkRole(ROLE_MERCHANT, ROLE_ADMIN),
  productControllers.deleteProduct,
);

export default router;
