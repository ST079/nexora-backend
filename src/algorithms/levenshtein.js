// Levenshtein edit distance + typo-tolerant search, written from scratch.
// When a search finds nothing ("samsng", "iphon"), we compare each word the
// shopper typed with each word of every product name and accept close ones.
//
//   d(i, 0) = i,  d(0, j) = j
//   d(i, j) = min( d(i−1, j) + 1,                   delete
//                  d(i, j−1) + 1,                   insert
//                  d(i−1, j−1) + (a_i ≠ b_j ? 1 : 0) )  substitute
//
// Only two rows of the table are kept, so memory is O(min(|a|, |b|)).

import { tokenize } from "./tfidf.js";

// `max` lets callers stop early: once every cell in a row is above it, the
// final distance can only be larger, so we return max + 1.
const levenshtein = (a = "", b = "", max = Infinity) => {
  if (a === b) return 0;
  // Keep the shorter word in the inner loop.
  if (a.length < b.length) [a, b] = [b, a];
  if (!b.length) return a.length;
  if (a.length - b.length > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
};

// Short words get less slack: "tv" → "pc" is not a typo, "samsng" → "samsung" is.
const allowedEdits = (word) => (word.length <= 3 ? 0 : word.length <= 5 ? 1 : 2);

// A typed word also matches the start of a longer word ("lap" → "laptop"),
// so half-typed searches still land.
const wordDistance = (typed, word) => {
  const max = allowedEdits(typed);
  if (word.startsWith(typed)) return 0;
  const whole = levenshtein(typed, word, max);
  const prefix =
    word.length > typed.length
      ? levenshtein(typed, word.slice(0, typed.length), max)
      : whole;
  return Math.min(whole, prefix);
};

// Returns the total distance when every typed word has a close match in
// `text`, or null when any word has none.
const matchScore = (query, text) => {
  const typedWords = tokenize(query);
  const words = tokenize(text);
  if (!typedWords.length || !words.length) return null;

  let total = 0;
  for (const typed of typedWords) {
    const best = Math.min(...words.map((word) => wordDistance(typed, word)));
    if (best > allowedEdits(typed)) return null;
    total += best;
  }
  return total;
};

// items: anything; textOf(item) gives the searchable text. Closest first,
// ties keep their original order (Array.sort is stable).
const fuzzySearch = (query, items, textOf) =>
  items
    .map((item) => ({ item, distance: matchScore(query, textOf(item)) }))
    .filter(({ distance }) => distance !== null)
    .sort((a, b) => a.distance - b.distance)
    .map(({ item }) => item);

// "Did you mean …": swap each typed word for the closest word in the
// vocabulary. Returns null when nothing would change.
const suggestCorrection = (query, vocabulary) => {
  const words = [...new Set(vocabulary)];
  let changed = false;

  const corrected = tokenize(query).map((typed) => {
    let best = { word: typed, distance: Infinity };
    for (const word of words) {
      const distance = levenshtein(typed, word, allowedEdits(typed));
      if (distance < best.distance) best = { word, distance };
    }
    if (best.distance > allowedEdits(typed) || best.word === typed) return typed;
    changed = true;
    return best.word;
  });

  return changed ? corrected.join(" ") : null;
};

export { levenshtein, allowedEdits, matchScore, fuzzySearch, suggestCorrection };
