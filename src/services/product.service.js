import {
  associationRules,
  frequentItemsets,
  recommendFor,
} from "../algorithms/apriori.js";
import {
  dailySeries,
  forecastDemand,
  restockPlan,
} from "../algorithms/forecast.js";
import { fuzzySearch, suggestCorrection } from "../algorithms/levenshtein.js";
import { rankSimilar, tokenize } from "../algorithms/tfidf.js";
import { ORDER_STATUS_CANCELLED } from "../constants/orderStatuses.js";
import { PRODUCT_DESCRIPTION_PROMPT } from "../constants/prompt.js";
import { ROLE_ADMIN } from "../constants/roles.js";
import orderModel from "../models/Order.js";
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

// The algorithms below work in memory, so cap how many rows one call reads.
const PRODUCT_SCAN_LIMIT = 2000;
const ORDER_SCAN_LIMIT = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, places = 3) => Number(value.toFixed(places));

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

// Typo-tolerant fallback for a name search that matched nothing: keep every
// other filter, then rank what's left by Levenshtein distance to the query.
const fuzzyNameSearch = async (payload) => {
  const { name, ...rest } = payload;
  const candidates = await productModel
    .find(buildProductFilters(rest))
    .sort(parseSort(payload.sort))
    .limit(PRODUCT_SCAN_LIMIT);

  const textOf = (product) => `${product.name} ${product.brand ?? ""}`;
  const ranked = fuzzySearch(name, candidates, textOf);
  // Newest-first is every list's default, so it gives way to closeness; a
  // sort the shopper picked (price) keeps its order.
  const keepsSort = Object.keys(parseSort(payload.sort)).some((key) => key !== "createdAt");
  const kept = new Set(ranked);
  const matches = keepsSort
    ? candidates.filter((product) => kept.has(product))
    : ranked;

  return {
    matches,
    suggestion: suggestCorrection(name, candidates.flatMap((p) => tokenize(textOf(p)))),
  };
};

// Only fall back when the exact search has no results at all, not when a
// later page of them is empty.
const needsFuzzy = async (payload, filters) =>
  Boolean(payload.name) && !(await productModel.exists(filters));

const getAllProducts = async (payload) => {
  const { limit, offset } = payload;
  const filters = buildProductFilters(payload);

  const products = await productModel
    .find(filters)
    .sort(parseSort(payload.sort))
    .limit(toInt(limit))
    .skip(toInt(offset));

  if (products.length || !(await needsFuzzy(payload, filters))) return products;

  const { matches } = await fuzzyNameSearch(payload);
  const start = toInt(offset);
  return matches.slice(start, toInt(limit) ? start + toInt(limit) : undefined);
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

// Accepts the same filters as the list so pagination totals line up. When
// the list fell back to fuzzy matches, says so and offers a corrected query.
const getTotalCount = async (payload = {}) => {
  const filters = buildProductFilters(payload);
  const totalCount = await productModel.countDocuments(filters);
  if (totalCount || !(await needsFuzzy(payload, filters))) return { totalCount };

  const { matches, suggestion } = await fuzzyNameSearch(payload);
  return { totalCount: matches.length, fuzzy: true, suggestion };
};

// "More like this": TF-IDF vectors over name, brand, category and
// description, ranked by cosine similarity to the product being viewed.
const getSimilarProducts = async (id, { limit } = {}) => {
  const { data: product } = await getProductById(id);
  const candidates = await productModel
    .find({ _id: { $ne: product._id } })
    .sort({ createdAt: -1 })
    .limit(PRODUCT_SCAN_LIMIT)
    .lean();

  return rankSimilar(product, candidates, {
    limit: clamp(toInt(limit, 4), 1, 12),
  }).map(({ product: match, score }) => ({ ...match, similarity: round(score) }));
};

// Mining every order on each page view is wasteful and the rules change
// slowly, so they are reused for a few minutes per server instance.
const RULES_TTL_MS = 10 * 60 * 1000;
let rulesCache = { at: 0, rules: [] };

const purchaseRules = async () => {
  if (Date.now() - rulesCache.at < RULES_TTL_MS) return rulesCache.rules;

  const orders = await orderModel
    .find({ status: { $ne: ORDER_STATUS_CANCELLED } }, { "orderItems.product": 1 })
    .sort({ createdAt: -1 })
    .limit(ORDER_SCAN_LIMIT)
    .lean();
  const baskets = orders.map((order) => order.orderItems.map((item) => item.product));

  // The product page only needs pairs, so itemsets stop at size 2.
  const itemsets = frequentItemsets(baskets, { minSupport: 0.01, minCount: 2, maxSize: 2 });
  const rules = associationRules(itemsets, { minConfidence: 0.1 });

  rulesCache = { at: Date.now(), rules };
  return rules;
};

// "Frequently bought together": Apriori rules "this product → another" from
// past orders (cancelled ones excluded).
const getBoughtTogether = async (id, { limit } = {}) => {
  const { data: product } = await getProductById(id);
  const picks = recommendFor(product._id, await purchaseRules(), {
    limit: clamp(toInt(limit, 4), 1, 12),
  });
  if (!picks.length) return [];

  const products = await productModel
    .find({ _id: { $in: picks.map(({ item }) => item) } })
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  // A product deleted since the order was placed is skipped.
  return picks
    .filter(({ item }) => byId.has(item))
    .map(({ item, count, confidence, lift }) => ({
      ...byId.get(item),
      orders: count,
      confidence: round(confidence),
      lift: round(lift),
    }));
};

const RESTOCK_ORDER = { out: 0, reorder: 1, ok: 2, idle: 3 };

// Restock forecast for the merchant's own products (admins: all products).
// Daily sales over the window -> exponential smoothing -> days of stock left
// and how much to reorder to cover lead time plus a month.
const getRestockForecast = async (user, { days, leadTime, limit } = {}) => {
  const windowDays = clamp(toInt(days, 30), 7, 90);
  const leadTimeDays = clamp(toInt(leadTime, 7), 1, 60);
  const coverDays = 30;
  const isAdmin = user?.roles?.includes(ROLE_ADMIN);

  const products = await productModel
    .find(isAdmin ? {} : { createdBy: user?._id })
    .select("name brand category price stock imageUrls")
    .limit(PRODUCT_SCAN_LIMIT)
    .lean();

  const end = new Date();
  const productMatch = isAdmin
    ? {}
    : { "orderItems.product": { $in: products.map((p) => p._id) } };
  const sales = await orderModel.aggregate([
    {
      $match: {
        status: { $ne: ORDER_STATUS_CANCELLED },
        createdAt: { $gte: new Date(end.getTime() - windowDays * DAY_MS) },
        ...productMatch,
      },
    },
    { $unwind: "$orderItems" },
    ...(isAdmin ? [] : [{ $match: productMatch }]),
    {
      $project: {
        _id: 0,
        product: "$orderItems.product",
        quantity: "$orderItems.quantity",
        date: "$createdAt",
      },
    },
  ]);

  const salesByProduct = new Map();
  for (const sale of sales) {
    const key = String(sale.product);
    if (!salesByProduct.has(key)) salesByProduct.set(key, []);
    salesByProduct.get(key).push(sale);
  }

  const items = products.map((product) => {
    const series = dailySeries(salesByProduct.get(String(product._id)) ?? [], {
      days: windowDays,
      end,
    });
    const { alpha, dailyDemand, rmse } = forecastDemand(series);
    return {
      product,
      unitsSold: series.reduce((sum, qty) => sum + qty, 0),
      dailyDemand: round(dailyDemand, 2),
      alpha,
      ...restockPlan({ stock: product.stock, dailyDemand, rmse, leadTimeDays, coverDays }),
    };
  });

  // Most urgent first: sold out, then soonest to run out, then best sellers.
  items.sort(
    (a, b) =>
      RESTOCK_ORDER[a.status] - RESTOCK_ORDER[b.status] ||
      (a.daysUntilStockout ?? Infinity) - (b.daysUntilStockout ?? Infinity) ||
      b.unitsSold - a.unitsSold,
  );

  const summary = { out: 0, reorder: 0, ok: 0, idle: 0 };
  for (const item of items) summary[item.status] += 1;

  return {
    windowDays,
    leadTimeDays,
    coverDays,
    generatedAt: end,
    summary,
    items: items.slice(0, clamp(toInt(limit, 50), 1, 200)),
  };
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
  getSimilarProducts,
  getBoughtTogether,
  getRestockForecast,
};
