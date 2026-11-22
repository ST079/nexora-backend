// Turns the storefront's query string into a Mongo filter. Kept free of
// models and config so it can be unit tested on its own.
import { tokenize } from "../algorithms/tfidf.js";
import { escapeRegex } from "./query.js";

// A search word can match any of these, so "samsung phone" finds Samsung
// handsets filed under Smartphones even though "phone" isn't in the name.
const SEARCH_FIELDS = ["name", "brand", "category"];

// Cart sync asks for every product in the cart at once; more than this in
// one request isn't a real cart.
const MAX_IDS = 100;
const OBJECT_ID = /^[a-f\d]{24}$/i;

const contains = (text) => ({ $regex: escapeRegex(text), $options: "i" });

// The words worth matching on. "a" and "the" would match nearly everything,
// so they're dropped; a query made only of them is searched as typed.
const searchWords = (query = "") => {
  const words = tokenize(query);
  if (words.length) return [...new Set(words)];
  const raw = String(query).trim();
  return raw ? [raw] : [];
};

// Every word has to appear somewhere in the name, brand or category.
const searchClauses = (query) =>
  searchWords(query).map((word) => ({
    $or: SEARCH_FIELDS.map((field) => ({ [field]: contains(word) })),
  }));

// "id1,id2,…" → the valid ObjectIds, deduplicated and capped.
const parseIdList = (ids) =>
  [
    ...new Set(
      String(ids ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => OBJECT_ID.test(id)),
    ),
  ].slice(0, MAX_IDS);

const buildProductFilters = (payload = {}) => {
  const { category, brands, name, min, max, createdBy, stock, ids } = payload;
  const filters = {};
  const and = [];

  if (category) filters.category = contains(category);
  if (brands) {
    const brandList = String(brands)
      .split(",")
      .map((brand) => brand.trim())
      .filter(Boolean);
    if (brandList.length)
      and.push({
        $or: brandList.map((brand) => ({
          brand: { $regex: `^${escapeRegex(brand)}$`, $options: "i" },
        })),
      });
  }
  if (name) and.push(...searchClauses(name));
  if (min) filters.price = { $gte: Number(min) };
  if (max) filters.price = { ...filters.price, $lte: Number(max) };
  if (createdBy) filters.createdBy = createdBy;
  // Used by the dashboard: "out" = sold out, "low" = 1–5 left.
  if (stock === "out") filters.stock = { $lte: 0 };
  if (stock === "low") filters.stock = { $gt: 0, $lte: 5 };
  // An ids filter with nothing valid in it must match nothing, not everything.
  if (ids !== undefined) filters._id = { $in: parseIdList(ids) };

  if (and.length) filters.$and = and;
  return filters;
};

export { SEARCH_FIELDS, MAX_IDS, buildProductFilters, parseIdList, searchWords };
