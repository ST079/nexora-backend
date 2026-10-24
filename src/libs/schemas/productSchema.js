import z from "zod";

// Products arrive as multipart form data, so numbers come in as strings.
const productSchema = z.object({
  name: z.string({ error: "Product name is required." }).trim().min(3),
  brand: z.string().optional(),
  category: z.string().optional(),
  description: z.string().optional(),
  price: z.coerce
    .number({ error: "Price must be a number" })
    .min(1)
    .max(999999999),
  stock: z.coerce.number().int().min(0).optional(),
});

const productUpdateSchema = productSchema.partial().extend({
  existingImages: z.union([z.string(), z.array(z.string())]).optional(),
});

export { productSchema, productUpdateSchema };
