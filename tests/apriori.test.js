import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  associationRules,
  frequentItemsets,
  generateCandidates,
  recommendFor,
} from "../src/algorithms/apriori.js";

const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≉ ${expected}`);

// Five orders: phones are usually bought with a case, chargers sometimes.
const ORDERS = [
  ["phone", "case", "charger"],
  ["phone", "case"],
  ["phone", "case"],
  ["phone", "charger"],
  ["laptop", "mouse"],
];

const find = (itemsets, items) =>
  itemsets.find((s) => s.items.join() === [...items].sort().join());

describe("generateCandidates", () => {
  it("joins itemsets that share a prefix", () => {
    assert.deepEqual(generateCandidates([["a"], ["b"], ["c"]]), [
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
  });

  it("prunes a candidate whose subset is not frequent", () => {
    // {a,b,c} needs {b,c}, which is missing, so it is never counted.
    assert.deepEqual(generateCandidates([["a", "b"], ["a", "c"]]), []);
    assert.deepEqual(
      generateCandidates([["a", "b"], ["a", "c"], ["b", "c"]]),
      [["a", "b", "c"]],
    );
  });
});

describe("frequentItemsets", () => {
  const itemsets = frequentItemsets(ORDERS, { minSupport: 0.4, minCount: 1 });

  it("computes support as a share of all orders", () => {
    close(find(itemsets, ["phone"]).support, 4 / 5);
    close(find(itemsets, ["phone", "case"]).support, 3 / 5);
    assert.equal(find(itemsets, ["phone", "case"]).count, 3);
  });

  it("drops itemsets below the threshold", () => {
    // laptop appears once (0.2 < 0.4); {case, charger} once as well.
    assert.equal(find(itemsets, ["laptop"]), undefined);
    assert.equal(find(itemsets, ["case", "charger"]), undefined);
  });

  it("never treats a single order as frequent with minCount 2", () => {
    const strict = frequentItemsets([["x", "y"], ["z"]], { minSupport: 0, minCount: 2 });
    assert.deepEqual(strict, []);
  });

  it("ignores duplicate items inside one order", () => {
    const sets = frequentItemsets([["a", "a", "b"], ["a", "b"]], { minCount: 1 });
    assert.equal(find(sets, ["a"]).count, 2);
  });

  it("handles no orders", () => {
    assert.deepEqual(frequentItemsets([]), []);
  });

  it("finds 3-itemsets when maxSize allows", () => {
    const sets = frequentItemsets(
      [["a", "b", "c"], ["a", "b", "c"], ["a", "b"]],
      { minCount: 2, maxSize: 3 },
    );
    assert.equal(find(sets, ["a", "b", "c"]).count, 2);
  });
});

describe("associationRules", () => {
  const rules = associationRules(
    frequentItemsets(ORDERS, { minSupport: 0.4, minCount: 1 }),
    { minConfidence: 0 },
  );
  const rule = (from, to) =>
    rules.find((r) => r.antecedent.join() === from && r.consequent.join() === to);

  it("computes confidence and lift", () => {
    // case -> phone: every order with a case has a phone.
    close(rule("case", "phone").confidence, 1);
    close(rule("case", "phone").lift, 1 / (4 / 5));
    // phone -> case: 3 of 4 phone orders have a case.
    close(rule("phone", "case").confidence, 3 / 4);
    close(rule("phone", "case").lift, (3 / 4) / (3 / 5));
  });

  it("applies the confidence threshold", () => {
    const strict = associationRules(
      frequentItemsets(ORDERS, { minSupport: 0.4, minCount: 1 }),
      { minConfidence: 0.9 },
    );
    assert.ok(strict.every((r) => r.confidence >= 0.9));
    assert.equal(strict.find((r) => r.antecedent.join() === "phone"), undefined);
  });
});

describe("recommendFor", () => {
  const rules = associationRules(
    frequentItemsets(ORDERS, { minSupport: 0.2, minCount: 1 }),
    { minConfidence: 0 },
  );

  it("suggests products that raise the odds (lift > 1), most confident first", () => {
    const picks = recommendFor("phone", rules);
    assert.deepEqual(picks.map((p) => p.item), ["case", "charger"]);
    assert.ok(picks.every((p) => p.lift > 1));
  });

  it("returns nothing for a product with no history", () => {
    assert.deepEqual(recommendFor("tv", rules), []);
  });

  it("accepts ObjectId-like ids", () => {
    const id = { toString: () => "phone" };
    assert.equal(recommendFor(id, rules)[0].item, "case");
  });
});
