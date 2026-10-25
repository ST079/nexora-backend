// TF-IDF + cosine similarity, written from scratch (no NLP/ML library).
// Used for "More like this" on the product page: every product becomes a
// weighted word vector, and two products are similar when their vectors
// point the same way.
//
//   tf(t, d)    = count of t in d / number of terms in d
//   idf(t)      = ln((1 + N) / (1 + df(t))) + 1      (smoothed, never 0)
//   w(t, d)     = tf(t, d) * idf(t)
//   cos(a, b)   = (a · b) / (|a| * |b|)              (0 = unrelated, 1 = same)
//
// Rare words ("galaxy", "ultra") get a high idf and dominate the vector;
// words on every product ("new", "best") get a low idf and barely count.

// Words that say nothing about what a product is.
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "best", "by", "for", "from",
  "has", "have", "in", "is", "it", "its", "new", "of", "on", "or", "our",
  "that", "the", "this", "to", "with", "you", "your",
]);

// Lower-case, split on anything that isn't a letter or digit, drop stop
// words and single characters. Unicode-aware so Nepali names still split.
const tokenize = (text = "") =>
  String(text)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

// Raw counts divided by document length, so long descriptions don't win
// just by being long.
const termFrequency = (tokens) => {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const [token, count] of counts) counts.set(token, count / tokens.length);
  return counts;
};

// documents: array of token arrays. Each term is counted once per document.
const inverseDocumentFrequency = (documents) => {
  const documentFrequency = new Map();
  for (const tokens of documents) {
    for (const token of new Set(tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const total = documents.length;
  const idf = new Map();
  for (const [token, df] of documentFrequency) {
    idf.set(token, Math.log((1 + total) / (1 + df)) + 1);
  }
  return idf;
};

// Sparse vector as a Map term -> weight; terms with weight 0 are left out.
const tfidfVector = (tokens, idf) => {
  const vector = new Map();
  if (!tokens.length) return vector;
  for (const [token, tf] of termFrequency(tokens)) {
    vector.set(token, tf * (idf.get(token) ?? 0));
  }
  return vector;
};

const magnitude = (vector) => {
  let sum = 0;
  for (const weight of vector.values()) sum += weight * weight;
  return Math.sqrt(sum);
};

const cosineSimilarity = (a, b) => {
  const lengths = magnitude(a) * magnitude(b);
  if (lengths === 0) return 0;

  // Walk the smaller map; only shared terms add to the dot product.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [token, weight] of small) {
    const other = large.get(token);
    if (other) dot += weight * other;
  }
  return dot / lengths;
};

// Field weights by repetition: the category counts three times and the name
// twice, so they outweigh a long description. Bare numbers ("16" in
// "Iphone 16" and "Rod 16 mm") say nothing about the product and are dropped.
const productTokens = (product) =>
  tokenize(
    [
      product.name,
      product.name,
      product.brand,
      product.category,
      product.category,
      product.category,
      product.description,
    ]
      .filter(Boolean)
      .join(" "),
  ).filter((token) => !/^\d+$/.test(token));

const sameCategory = (a, b) =>
  Boolean(a.category) && String(a.category).toLowerCase() === String(b.category ?? "").toLowerCase();

// Scores every candidate against the target and returns the best matches.
// A category name sits on most of its products, so its idf is low and no
// amount of repetition lets it beat a rare shared word: "Samsung Galaxy
// Book" would outrank every other phone for "Samsung Galaxy S25". Products
// in the target's category therefore come first, the rest fill any spare
// places, and within each group the most similar is first. Products sharing
// no meaningful word are dropped.
const rankSimilar = (target, candidates, { limit = 4, minScore = 0.05 } = {}) => {
  const documents = [target, ...candidates].map(productTokens);
  const idf = inverseDocumentFrequency(documents);
  const targetVector = tfidfVector(documents[0], idf);

  return candidates
    .map((product, i) => ({
      product,
      score: cosineSimilarity(targetVector, tfidfVector(documents[i + 1], idf)),
      inCategory: sameCategory(target, product),
    }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.inCategory - a.inCategory || b.score - a.score)
    .slice(0, limit)
    .map(({ product, score }) => ({ product, score }));
};

export {
  tokenize,
  termFrequency,
  inverseDocumentFrequency,
  tfidfVector,
  cosineSimilarity,
  productTokens,
  rankSimilar,
};
