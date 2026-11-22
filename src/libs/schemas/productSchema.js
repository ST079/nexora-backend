import z from "zod";
import { DESCRIPTION_NOTES_MAX } from "../../constants/prompt.js";

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 8000;

// One URL or a list of them: multipart forms repeat a field instead of
// sending an array. Blank entries (an emptied list) are dropped.
const urlList = z.preprocess(
  (value) =>
    value === undefined
      ? undefined
      : [].concat(value).filter((url) => typeof url !== "string" || url.trim() !== ""),
  z.array(z.string().trim().max(2048)),
);

// Products may arrive as JSON or as multipart form data, where numbers come
// in as strings.
const productSchema = z.object({
  name: z.string({ error: "Product name is required." }).trim().min(3),
  brand: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  description: z
    .string({ error: "Description is required." })
    .trim()
    .min(DESCRIPTION_MIN, `Description should be at least ${DESCRIPTION_MIN} characters.`)
    .max(DESCRIPTION_MAX, `Keep the description under ${DESCRIPTION_MAX.toLocaleString("en")} characters.`),
  price: z.coerce
    .number({ error: "Price must be a number" })
    .min(1)
    .max(999999999),
  stock: z.coerce.number().int().min(0).optional(),
  // URLs returned by POST /products/images, in display order (first = cover).
  imageUrls: urlList.optional(),
});

// existingImages is the older multipart way of keeping photos on edit.
const productUpdateSchema = productSchema.partial().extend({
  existingImages: urlList.optional(),
});

const descriptionRequestSchema = z.object({
  name: z.string({ error: "Add a product name first." }).trim().min(3, "Add a product name first."),
  brand: z.string().trim().max(100).optional(),
  category: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(DESCRIPTION_NOTES_MAX).optional(),
});

export { productSchema, productUpdateSchema, descriptionRequestSchema };
