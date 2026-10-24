// Helpers for turning raw query-string values into safe Mongo inputs.

// User text goes into $regex, so special characters must be literal.
const escapeRegex = (value = "") =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toInt = (value, fallback = 0) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
};

// sort arrives as JSON (e.g. {"price":1}); bad JSON falls back to no sort.
const parseSort = (sort) => {
  if (!sort) return {};
  try {
    const parsed = JSON.parse(sort);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const isSameId = (a, b) => a != null && b != null && String(a) === String(b);

export { escapeRegex, toInt, parseSort, isSameId };
