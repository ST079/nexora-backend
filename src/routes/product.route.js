import express from "express";
import productControllers from "../controllers/product.controller.js";
import auth from "../middlewares/auth.js";
import checkRole from "../middlewares/checkRole.js";
import { ROLE_ADMIN, ROLE_MERCHANT } from "../constants/roles.js";
import { validate } from "../middlewares/validate.js";
import {
  descriptionRequestSchema,
  productSchema,
  productUpdateSchema,
} from "../libs/schemas/productSchema.js";
import upload from "../middlewares/upload.js";
import {
  aiDescriptionLimiter,
  imageUploadLimiter,
} from "../middlewares/rateLimit.js";

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
 * GET /api/v1/products/merchants
 * Who has listed products and how many, for the admin's merchant filter.
 */
router.get(
  "/merchants",
  auth,
  checkRole(ROLE_ADMIN),
  productControllers.getMerchants,
);

/**
 * GET /api/v1/products/count
 */
router.get("/count", productControllers.getTotalCount);

/**
 * GET /api/v1/products/price-range
 * Cheapest and dearest price under the current filters (min/max ignored),
 * for the price slider's ends.
 */
router.get("/price-range", productControllers.getPriceRange);

/**
 * GET /api/v1/products/restock-forecast
 * Exponential-smoothing demand forecast and reorder plan (merchant: own products).
 */
router.get(
  "/restock-forecast",
  auth,
  checkRole(ROLE_MERCHANT, ROLE_ADMIN),
  productControllers.getRestockForecast,
);

/**
 * GET /api/v1/products/:id
 */
router.get("/:id", productControllers.getProductById);

/**
 * GET /api/v1/products/:id/similar
 * TF-IDF + cosine similarity over name, brand, category and description.
 */
router.get("/:id/similar", productControllers.getSimilarProducts);

/**
 * GET /api/v1/products/:id/bought-together
 * Apriori association rules mined from past orders.
 */
router.get("/:id/bought-together", productControllers.getBoughtTogether);

/**
 * POST /api/v1/products/images
 * One photo per request (field "image") -> { url, width, height, bytes }.
 * The product is then saved with the URLs in `imageUrls`.
 */
router.post(
  "/images",
  auth,
  checkRole(ROLE_MERCHANT, ROLE_ADMIN),
  imageUploadLimiter,
  upload.single("image"),
  productControllers.uploadProductImage,
);

/**
 * POST /api/v1/products/generate-description
 * Drafts a Markdown description with Gemini; nothing is saved.
 */
router.post(
  "/generate-description",
  auth,
  checkRole(ROLE_MERCHANT, ROLE_ADMIN),
  aiDescriptionLimiter,
  validate(descriptionRequestSchema),
  productControllers.generateDescription,
);

/**
 * POST /api/v1/products/
 * JSON with `imageUrls`, or multipart with "images" files (older clients).
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
