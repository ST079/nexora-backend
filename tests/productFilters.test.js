import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_IDS,
  buildProductFilters,
  parseIdList,
  searchWords,
} from "../src/utils/productFilters.js";

// Mongo $regex values here are plain strings, so a filter can be checked by
// running its regexes against a product like Mongo would.
const matchesField = (condition, value = "") =>
  new RegExp(condition.$regex, condition.$options).test(value);

const matches = (filters, product) =>
  filters.$and.every(({ $or }) =>
    $or.some((clause) => {
      const [field, condition] = Object.entries(clause)[0];
      return matchesField(condition, product[field]);
    }),
  );

const phone = { name: "Galaxy S24 Ultra", brand: "Samsung", category: "Smartphones" };
const hoodie = { name: "Everyday Hoodie", brand: "Goldstar", category: "Clothing" };

describe("searchWords", () => {
  it("splits a query into distinct, meaningful words", () => {
    assert.deepEqual(searchWords("Samsung  phone, samsung"), ["samsung", "phone"]);
  });

  it("drops stop words but keeps a query made only of them", () => {
    assert.deepEqual(searchWords("the best hoodie"), ["hoodie"]);
    assert.deepEqual(searchWords("a"), ["a"]);
    assert.deepEqual(searchWords("   "), []);
  });
});

describe("buildProductFilters: search", () => {
  it("matches a category word, not only the name", () => {
    const filters = buildProductFilters({ name: "smartphones" });
    assert.equal(matches(filters, phone), true);
    assert.equal(matches(filters, hoodie), false);
  });

  it("matches a brand word", () => {
    assert.equal(matches(buildProductFilters({ name: "goldstar" }), hoodie), true);
  });

  it("needs every word, each in any field", () => {
    assert.equal(matches(buildProductFilters({ name: "samsung phone" }), phone), true);
    assert.equal(matches(buildProductFilters({ name: "samsung hoodie" }), phone), false);
  });

  it("treats regex characters literally", () => {
    const filters = buildProductFilters({ name: "c++ (pro)" });
    assert.doesNotThrow(() => matches(filters, phone));
    assert.equal(matches(filters, { name: "C++ Pro Guide", brand: "", category: "Books" }), true);
  });

  it("keeps the brand filter alongside the search", () => {
    const filters = buildProductFilters({ name: "phone", brands: "Samsung, Apple" });
    assert.equal(filters.$and.length, 2);
    assert.deepEqual(
      filters.$and[0].$or.map(({ brand }) => brand.$regex),
      ["^Samsung$", "^Apple$"],
    );
    assert.equal(filters.$or, undefined);
  });

  it("adds nothing for an empty brand list or a blank search", () => {
    assert.deepEqual(buildProductFilters({ brands: " , ", name: "" }), {});
  });
});

describe("buildProductFilters: other filters", () => {
  it("builds a price range", () => {
    assert.deepEqual(buildProductFilters({ min: "500", max: "2000" }).price, {
      $gte: 500,
      $lte: 2000,
    });
    assert.deepEqual(buildProductFilters({ max: "2000" }).price, { $lte: 2000 });
  });

  it("filters by stock level", () => {
    assert.deepEqual(buildProductFilters({ stock: "out" }).stock, { $lte: 0 });
    assert.deepEqual(buildProductFilters({ stock: "low" }).stock, { $gt: 0, $lte: 5 });
  });

  it("filters by ids, and an ids filter with no valid id matches nothing", () => {
    const id = "6650c1f0a1b2c3d4e5f60718";
    assert.deepEqual(buildProductFilters({ ids: `${id},nope` })._id, { $in: [id] });
    assert.deepEqual(buildProductFilters({ ids: "" })._id, { $in: [] });
    assert.equal(buildProductFilters({})._id, undefined);
  });
});

describe("parseIdList", () => {
  it("keeps valid ObjectIds once each", () => {
    const a = "6650c1f0a1b2c3d4e5f60718";
    const b = "6650C1F0A1B2C3D4E5F60719";
    assert.deepEqual(parseIdList(` ${a},${b},${a},123,{"$gt":""}`), [a, b]);
  });

  it("caps the list", () => {
    const ids = Array.from({ length: MAX_IDS + 20 }, (_, i) =>
      i.toString(16).padStart(24, "0"),
    );
    assert.equal(parseIdList(ids.join(",")).length, MAX_IDS);
  });

  it("handles missing input", () => {
    assert.deepEqual(parseIdList(undefined), []);
  });
});
