import { PRODUCT_DESCRIPTION_PROMPT } from "../constants/prompt.js";
import { ROLE_ADMIN } from "../constants/roles.js";
import productModel from "../models/Product.js";
import promptAi from "../utils/ai.js";
import uploadFiles from "../utils/fileUploader.js";
import { escapeRegex, isSameId, parseSort, toInt } from "../utils/query.js";

const EDITABLE_FIELDS = [
  "name",
  "brand",
  "category",
  "description",
  "price",
  "stock",
];

const pick = (source = {}, keys) =>
  Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );

const buildProductFilters = (payload = {}) => {
  const { category, brands, name, min, max, createdBy, stock } = payload;
  const filters = {};

  if (category)
    filters.category = { $regex: escapeRegex(category), $options: "i" };
  if (brands) {
    filters.$or = brands
      .split(",")
      .map((brand) => brand.trim())
      .filter(Boolean)
      .map((brand) => ({
        brand: {
          $regex: `^${escapeRegex(brand)}$`,
          $options: "i",
        },
      }));
    if (!filters.$or.length) delete filters.$or;
  }
  if (name) filters.name = { $regex: escapeRegex(name), $options: "i" };
  if (min) filters.price = { $gte: Number(min) };
  if (max) filters.price = { ...filters.price, $lte: Number(max) };
  if (createdBy) filters.createdBy = createdBy;
  // Used by the dashboard: "out" = sold out, "low" = 1–5 left.
  if (stock === "out") filters.stock = { $lte: 0 };
  if (stock === "low") filters.stock = { $gt: 0, $lte: 5 };

  return filters;
};

const getAllProducts = async (payload) => {
  const { limit, offset } = payload;

  return await productModel
    .find(buildProductFilters(payload))
    .sort(parseSort(payload.sort))
    .limit(toInt(limit))
    .skip(toInt(offset));
};

const getProductById = async (id) => {
  const data = await productModel.findById(id);

  if (!data)
    throw {
      status: 404,
      message: "Product Not Found! ",
    };

  return { data: data, status: 200, message: "Product Found" };
};

// Merchants may only touch their own listings; admins can touch any.
const assertCanManage = (product, user) => {
  const isAdmin = user?.roles?.includes(ROLE_ADMIN);
  if (!isAdmin && !isSameId(product.createdBy, user?._id))
    throw {
      status: 403,
      message: "You can only manage products you created.",
    };
};

const generateDescription = async (payload) => {
  const promptMessage = PRODUCT_DESCRIPTION_PROMPT.replace("%s", payload.name)
    .replace("%s", payload.category)
    .replace("%s", payload.brand);

  try {
    return await promptAi(promptMessage);
  } catch (error) {
    // AI is a nice-to-have — never block a listing because Gemini is down.
    console.error("Description generation failed:", error.message);
    return "";
  }
};

const createProduct = async (payload, files, userId) => {
  const uploadedFiles = await uploadFiles(files);
  const imageUrls = uploadedFiles.map((item) => item.secure_url);

  const data = pick(payload, EDITABLE_FIELDS);
  const description = data.description?.trim()
    ? data.description
    : await generateDescription(data);

  return await productModel.create({
    ...data,
    description,
    imageUrls,
    createdBy: userId,
  });
};

const updateProduct = async (id, payload, files, user) => {
  const { data: product } = await getProductById(id);
  assertCanManage(product, user);

  const updateData = pick(payload, EDITABLE_FIELDS);

  // existingImages = the URLs the editor kept; new uploads are appended.
  const hasImageChanges =
    payload.existingImages !== undefined || (files && files.length > 0);

  if (hasImageChanges) {
    const kept =
      payload.existingImages === undefined
        ? product.imageUrls
        : [].concat(payload.existingImages).filter(Boolean);
    const uploadedFiles = await uploadFiles(files);
    updateData.imageUrls = [
      ...kept,
      ...uploadedFiles.map((item) => item.secure_url),
    ];
  }

  //{new:true}-> gives the latest updated payload
  return await productModel.findByIdAndUpdate(id, updateData, {
    returnDocument: "after",
    runValidators: true,
  });
};

const deleteProduct = async (id, user) => {
  const { data: product } = await getProductById(id);
  assertCanManage(product, user);
  await productModel.findByIdAndDelete(id);
};

const getBrands = async () => {
  return await productModel.distinct("brand");
};

const getCategories = async () => {
  return await productModel.distinct("category");
};

// Accepts the same filters as the list so pagination totals line up.
const getTotalCount = async (payload = {}) => {
  return await productModel.countDocuments(buildProductFilters(payload));
};

export default {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getBrands,
  getCategories,
  getTotalCount,
};
