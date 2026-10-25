import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cosineSimilarity,
  inverseDocumentFrequency,
  productTokens,
  rankSimilar,
  termFrequency,
  tfidfVector,
  tokenize,
} from "../src/algorithms/tfidf.js";

const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≉ ${expected}`);

describe("tokenize", () => {
  it("lower-cases, splits on punctuation and drops stop words", () => {
    assert.deepEqual(tokenize("The NEW Samsung Galaxy-S25, for you!"), [
      "samsung",
      "galaxy",
      "s25",
    ]);
  });

  it("drops single characters and handles empty input", () => {
    assert.deepEqual(tokenize("a b c 16 GB"), ["16", "gb"]);
    assert.deepEqual(tokenize(""), []);
    assert.deepEqual(tokenize(undefined), []);
  });
});

describe("termFrequency", () => {
  it("divides each count by the number of terms", () => {
    const tf = termFrequency(["phone", "phone", "case", "blue"]);
    assert.equal(tf.get("phone"), 0.5);
    assert.equal(tf.get("case"), 0.25);
  });
});

describe("inverseDocumentFrequency", () => {
  it("gives rarer terms a higher weight", () => {
    const idf = inverseDocumentFrequency([
      ["phone", "samsung"],
      ["phone", "apple"],
      ["phone", "nokia"],
    ]);
    // phone is in all 3: ln(4/4) + 1 = 1. samsung in 1: ln(4/2) + 1.
    close(idf.get("phone"), 1);
    close(idf.get("samsung"), Math.log(2) + 1);
    assert.ok(idf.get("samsung") > idf.get("phone"));
  });

  it("counts a term once per document", () => {
    const idf = inverseDocumentFrequency([["tv", "tv", "tv"], ["laptop"]]);
    close(idf.get("tv"), Math.log(3 / 2) + 1);
  });
});

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors and 0 for vectors with no shared term", () => {
    const a = new Map([["phone", 2], ["samsung", 1]]);
    close(cosineSimilarity(a, new Map(a)), 1);
    assert.equal(cosineSimilarity(a, new Map([["laptop", 3]])), 0);
  });

  it("matches the textbook value for a worked example", () => {
    // a = (1, 1, 0), b = (1, 0, 1) -> 1 / (√2 · √2) = 0.5
    const a = new Map([["x", 1], ["y", 1]]);
    const b = new Map([["x", 1], ["z", 1]]);
    close(cosineSimilarity(a, b), 0.5);
  });

  it("returns 0 instead of NaN for an empty vector", () => {
    assert.equal(cosineSimilarity(new Map(), new Map([["x", 1]])), 0);
  });

  it("is symmetric", () => {
    const idf = inverseDocumentFrequency([["a1", "b1"], ["b1", "c1"]]);
    const a = tfidfVector(["a1", "b1"], idf);
    const b = tfidfVector(["b1", "c1"], idf);
    close(cosineSimilarity(a, b), cosineSimilarity(b, a));
  });
});

describe("productTokens", () => {
  it("repeats name and category words and drops bare numbers", () => {
    const tokens = productTokens({ name: "Iphone 16", brand: "Apple", category: "Phones" });
    assert.deepEqual(tokens, ["iphone", "iphone", "apple", "phones", "phones", "phones"]);
  });
});

describe("rankSimilar", () => {
  const target = { _id: "1", name: "Samsung Galaxy S25 Ultra", brand: "Samsung", category: "Smartphones" };
  const catalog = [
    { _id: "2", name: "Dairy Milk Silk", brand: "Cadbury", category: "Chocolate" },
    { _id: "3", name: "Samsung Galaxy S24", brand: "Samsung", category: "Smartphones" },
    { _id: "4", name: "Google Pixel 10 Pro", brand: "Google", category: "Smartphones" },
    { _id: "5", name: "Samsung 55 inch TV", brand: "Samsung", category: "Electronics" },
  ];

  it("puts the closest product first and drops unrelated ones", () => {
    const ranked = rankSimilar(target, catalog);
    assert.equal(ranked[0].product._id, "3");
    assert.ok(!ranked.some(({ product }) => product._id === "2"));
  });

  it("returns scores between 0 and 1, descending within each category group", () => {
    const ranked = rankSimilar(target, catalog);
    assert.ok(ranked.every(({ score }) => score > 0 && score <= 1));
    for (const inCategory of [true, false]) {
      const scores = ranked
        .filter(({ product }) => (product.category === target.category) === inCategory)
        .map(({ score }) => score);
      assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
    }
  });

  it("ranks the target's category first even when another shares a rarer word", () => {
    const phone = { _id: "s25", name: "Samsung Galaxy S25", brand: "Samsung", category: "Smartphones" };
    const ranked = rankSimilar(
      phone,
      [
        { _id: "book", name: "Samsung Galaxy Book", brand: "Samsung", category: "Laptops" },
        { _id: "m14", name: "Samsung M14", brand: "Samsung", category: "Smartphones" },
        { _id: "pixel", name: "Google Pixel 10", brand: "Google", category: "Smartphones" },
        { _id: "iphone", name: "Iphone 16", brand: "Apple", category: "Smartphones" },
        { _id: "nokia", name: "Nokia G42", brand: "Nokia", category: "Smartphones" },
      ],
      { limit: 10 },
    );
    const scoreOf = (id) => ranked.find(({ product }) => product._id === id).score;
    // On text alone the laptop beats the Pixel ("galaxy" is rare, "smartphones" is not)...
    assert.ok(scoreOf("book") > scoreOf("pixel"));
    // ...but every phone is listed before it.
    assert.deepEqual(
      ranked.map(({ product }) => product._id),
      ["m14", "iphone", "pixel", "nokia", "book"],
    );
  });

  it("respects the limit and copes with an empty catalog", () => {
    assert.equal(rankSimilar(target, catalog, { limit: 1 }).length, 1);
    assert.deepEqual(rankSimilar(target, []), []);
  });
});
