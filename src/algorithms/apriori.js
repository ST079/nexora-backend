// Apriori association-rule mining, written from scratch.
// Used for "Frequently bought together": each order is a basket of product
// ids, and we look for products that keep turning up in the same basket.
//
//   support(X)        = orders containing X / all orders
//   confidence(X → Y) = support(X ∪ Y) / support(X)    "of orders with X, how many had Y"
//   lift(X → Y)       = confidence(X → Y) / support(Y)  > 1 means X really raises the odds of Y
//
// Apriori property: every subset of a frequent itemset is frequent, so a
// size-k candidate is only worth counting if all its size-(k-1) subsets
// survived the previous pass. That pruning is what keeps it fast.

const keyOf = (items) => items.join("|");

// Ids are compared as strings so ObjectIds and plain strings both work.
const toBaskets = (transactions) =>
  transactions.map((items) => new Set(items.map(String)));

const countSupport = (candidates, baskets) =>
  candidates.map((items) => ({
    items,
    count: baskets.filter((basket) => items.every((item) => basket.has(item)))
      .length,
  }));

// Join step: two sorted (k-1)-itemsets that share their first k-2 items make
// one k-itemset. Prune step: drop it if any (k-1)-subset isn't frequent.
const generateCandidates = (previous) => {
  const frequent = new Set(previous.map(keyOf));
  const candidates = [];

  for (let i = 0; i < previous.length; i++) {
    for (let j = i + 1; j < previous.length; j++) {
      const a = previous[i];
      const b = previous[j];
      const prefix = a.slice(0, -1);
      if (keyOf(prefix) !== keyOf(b.slice(0, -1))) continue;

      const items = [...prefix, ...[a.at(-1), b.at(-1)].sort()];
      const allSubsetsFrequent = items.every((_, skip) =>
        frequent.has(keyOf(items.filter((__, k) => k !== skip))),
      );
      if (allSubsetsFrequent) candidates.push(items);
    }
  }
  return candidates;
};

// transactions: array of arrays of item ids.
// minSupport is a fraction of all orders; minCount is an absolute floor so a
// single order can never make a pair "frequent".
const frequentItemsets = (
  transactions,
  { minSupport = 0.01, minCount = 2, maxSize = 3 } = {},
) => {
  const baskets = toBaskets(transactions);
  const total = baskets.length;
  if (!total) return [];

  const threshold = Math.max(minCount, Math.ceil(minSupport * total));
  const withSupport = ({ items, count }) => ({
    items,
    count,
    support: count / total,
  });

  const singles = [...new Set(baskets.flatMap((basket) => [...basket]))]
    .sort()
    .map((item) => [item]);

  let level = countSupport(singles, baskets).filter((s) => s.count >= threshold);
  const result = level.map(withSupport);

  for (let size = 2; size <= maxSize && level.length > 1; size++) {
    const candidates = generateCandidates(level.map((s) => s.items));
    level = countSupport(candidates, baskets).filter(
      (s) => s.count >= threshold,
    );
    result.push(...level.map(withSupport));
  }

  return result;
};

// Every non-empty proper subset of an itemset, as sorted arrays.
const properSubsets = (items) => {
  const subsets = [];
  for (let mask = 1; mask < (1 << items.length) - 1; mask++) {
    subsets.push(items.filter((_, i) => mask & (1 << i)));
  }
  return subsets;
};

// Turns frequent itemsets into rules X → Y and keeps the confident ones.
const associationRules = (itemsets, { minConfidence = 0.2 } = {}) => {
  const supportOf = new Map(itemsets.map((s) => [keyOf(s.items), s.support]));
  const rules = [];

  for (const { items, count, support } of itemsets) {
    if (items.length < 2) continue;

    for (const antecedent of properSubsets(items)) {
      const consequent = items.filter((item) => !antecedent.includes(item));
      const confidence = support / supportOf.get(keyOf(antecedent));
      if (confidence < minConfidence) continue;

      rules.push({
        antecedent,
        consequent,
        count,
        support,
        confidence,
        lift: confidence / supportOf.get(keyOf(consequent)),
      });
    }
  }

  return rules.sort((a, b) => b.lift - a.lift || b.confidence - a.confidence);
};

// The products to suggest next to `itemId`: rules "itemId → one product",
// most confident first. Rules with lift ≤ 1 are dropped; those pairs only
// show up together because both sell a lot, not because one leads to the other.
const recommendFor = (itemId, rules, { limit = 4 } = {}) => {
  const id = String(itemId);
  return rules
    .filter(
      (rule) =>
        rule.antecedent.length === 1 &&
        rule.antecedent[0] === id &&
        rule.consequent.length === 1 &&
        rule.lift > 1,
    )
    .sort((a, b) => b.confidence - a.confidence || b.lift - a.lift)
    .slice(0, limit)
    .map(({ consequent, count, support, confidence, lift }) => ({
      item: consequent[0],
      count,
      support,
      confidence,
      lift,
    }));
};

export {
  generateCandidates,
  frequentItemsets,
  associationRules,
  recommendFor,
};
