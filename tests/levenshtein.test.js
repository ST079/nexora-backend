import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allowedEdits,
  fuzzySearch,
  levenshtein,
  matchScore,
  suggestCorrection,
} from "../src/algorithms/levenshtein.js";

describe("levenshtein", () => {
  it("matches textbook distances", () => {
    assert.equal(levenshtein("kitten", "sitting"), 3);
    assert.equal(levenshtein("flaw", "lawn"), 2);
    assert.equal(levenshtein("samsng", "samsung"), 1);
    assert.equal(levenshtein("iphone", "iphone"), 0);
  });

  it("handles empty strings", () => {
    assert.equal(levenshtein("", "abc"), 3);
    assert.equal(levenshtein("abc", ""), 3);
    assert.equal(levenshtein("", ""), 0);
  });

  it("is symmetric", () => {
    assert.equal(levenshtein("laptop", "lpatop"), levenshtein("lpatop", "laptop"));
  });

  it("counts a swap of neighbours as two edits", () => {
    assert.equal(levenshtein("ab", "ba"), 2);
  });

  it("stops early and returns max + 1 when the limit is passed", () => {
    assert.equal(levenshtein("chocolate", "keyboard", 2), 3);
    assert.equal(levenshtein("a", "abcdef", 2), 3);
    assert.equal(levenshtein("samsng", "samsung", 2), 1);
  });
});

describe("allowedEdits", () => {
  it("scales with word length", () => {
    assert.equal(allowedEdits("tv"), 0);
    assert.equal(allowedEdits("dell"), 1);
    assert.equal(allowedEdits("samsung"), 2);
  });
});

describe("matchScore", () => {
  it("needs every typed word to match", () => {
    assert.equal(matchScore("samsng galaxy", "Samsung Galaxy S25 Ultra"), 1);
    assert.equal(matchScore("samsng toaster", "Samsung Galaxy S25 Ultra"), null);
  });

  it("matches the start of a longer word", () => {
    assert.equal(matchScore("lap", "Dell XPS 13 Laptop"), 0);
    assert.equal(matchScore("lapto", "Dell XPS 13 Laptop"), 0);
  });

  it("doesn't treat short unrelated words as typos", () => {
    assert.equal(matchScore("tv", "Dell PC"), null);
  });

  it("ignores word order", () => {
    assert.equal(matchScore("galaxy samsung", "Samsung Galaxy S25"), 0);
  });
});

describe("fuzzySearch", () => {
  const products = [
    { name: "Iphone 16 pro max" },
    { name: "Samsung Galaxy S25 Ultra" },
    { name: "Dairy Milk Silk" },
  ];

  it("finds products despite a typo, closest first", () => {
    const hits = fuzzySearch("iphnoe", products, (p) => p.name);
    assert.deepEqual(hits.map((p) => p.name), ["Iphone 16 pro max"]);
  });

  it("returns nothing for gibberish", () => {
    assert.deepEqual(fuzzySearch("qwxyz", products, (p) => p.name), []);
  });
});

describe("suggestCorrection", () => {
  const vocabulary = ["samsung", "galaxy", "iphone", "laptop"];

  it("corrects each misspelt word", () => {
    assert.equal(suggestCorrection("samsng galxy", vocabulary), "samsung galaxy");
  });

  it("returns null when nothing changes", () => {
    assert.equal(suggestCorrection("iphone", vocabulary), null);
    assert.equal(suggestCorrection("qwxyz", vocabulary), null);
  });
});
