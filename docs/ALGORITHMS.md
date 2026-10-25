# Nexora algorithms

Nexora has four algorithms written by hand, with no machine-learning or NLP library. Each one answers a question that plain create/read/update/delete code can't:

| Algorithm | Question it answers | Who sees it |
|---|---|---|
| TF-IDF + cosine similarity | Which products are most like the one being viewed? | Shoppers, under "Similar products" on a product page |
| Apriori association rules | Which products do people buy together with this one? | Shoppers, under "Often bought with this" on a product page |
| Simple exponential smoothing + reorder point | When will this product run out, and how many should be reordered? | Merchants and admins, in the "Restock planner" on the dashboard |
| Levenshtein edit distance | What did the shopper mean when they typed "samsng galxy"? | Shoppers, in shop search results |

The restock planner is the decision-support part. It turns order history into a recommendation the merchant acts on: reorder now, and how many.

This file gives what report section **3.3 (Algorithm details)** and section **4.2.1 (Unit test cases)** need: the formulas, steps, worked examples, complexity, and every unit test with its input and expected result.

---

## Where the code lives

**Backend (`nexora-backend/`)**

| File | Contents |
|---|---|
| `src/algorithms/tfidf.js` | Tokenizer, TF, IDF, TF-IDF vector, cosine similarity, `rankSimilar` |
| `src/algorithms/apriori.js` | Candidate generation with pruning, frequent itemsets, association rules, `recommendFor` |
| `src/algorithms/forecast.js` | Daily sales series, exponential smoothing, α grid search, `restockPlan` |
| `src/algorithms/levenshtein.js` | Edit distance, typo-tolerant matching, `fuzzySearch`, `suggestCorrection` |
| `src/services/product.service.js` | Loads products and orders from MongoDB and calls the algorithms |
| `src/routes/product.route.js` | The endpoints listed below |
| `tests/*.test.js` | 56 unit tests, one file per algorithm |
| `scripts/seed-demo-orders.js` | Adds a month of demo orders so the algorithms have history to learn from |

The algorithm files never touch the database. They take plain arrays and return plain objects, which is what makes them easy to unit test.

**Frontend (`nexora-frontend/src/`)**

| File | Shows |
|---|---|
| `components/SimilarProducts.js` | TF-IDF results. Falls back to the newest products in the same category if there are none. |
| `components/BoughtTogether.js` | Apriori results, with "In N orders with this item" under each card |
| `app/(client)/dashboard/page.js` | `RestockForecast`: status filters, lead-time picker, days left and reorder quantity per product |
| `app/(storeFront)/products/page.js` | The "No exact matches… Did you mean …?" notice when search falls back to fuzzy matching |
| `api/product.js` | `getSimilarProducts`, `getBoughtTogether`, `getRestockForecast` |

## Endpoints

| Method and path | Access | Query parameters | Returns |
|---|---|---|---|
| `GET /api/v1/products/:id/similar` | Public | `limit` (1–12, default 4) | Products, each with a `similarity` score from 0 to 1 |
| `GET /api/v1/products/:id/bought-together` | Public | `limit` (1–12, default 4) | Products, each with `orders`, `confidence` and `lift` |
| `GET /api/v1/products/restock-forecast` | Merchant (own products) or admin (all) | `leadTime` (1–60 days, default 7), `days` (history window, 7–90, default 30), `limit` (1–200, default 50) | `summary` counts per status, then `items` sorted most urgent first |
| `GET /api/v1/products?name=…` and `GET /api/v1/products/count?name=…` | Public | The usual list filters | When the exact search finds nothing, fuzzy matches; the count also returns `fuzzy: true` and a `suggestion` |

---

## 1. TF-IDF and cosine similarity: "Similar products"

### Idea

Each product becomes a vector of word weights. A word that appears on few products, such as "galaxy" or "pixel", gets a high weight. A word that appears on many, such as a category name, gets a low weight. Two products are similar when their vectors point the same way.

### Formulas

```
tf(t, d)   = (times term t appears in product d) / (number of terms in d)
idf(t)     = ln((1 + N) / (1 + df(t))) + 1          N = number of products, df(t) = products containing t
w(t, d)    = tf(t, d) × idf(t)
cos(a, b)  = (a · b) / (|a| × |b|)                   0 = nothing in common, 1 = identical
```

The `+ 1` terms smooth the IDF, so it is never zero and never divides by zero.

### Steps

1. **Build each product's text.** Join the name twice, the brand once, the category three times and the description once. Repeating a field is a simple way to weight it, so a long description can't drown out the name.
2. **Tokenize.**
   - Lower-case the text.
   - Split on anything that isn't a letter or digit. The split is Unicode-aware, so Nepali names also split.
   - Drop single characters and stop words ("the", "new", "best"…).
   - Drop bare numbers: the "16" in "Iphone 16" and "Rod 16 mm" says nothing about what the product is.
3. **Compute IDF** over the target product and every candidate. A term counts once per product.
4. **Build a sparse TF-IDF vector** (a `Map` of term → weight) for each product.
5. **Score each candidate** with cosine similarity against the target.
6. **Drop weak matches.** Candidates scoring below 0.05 share no meaningful word.
7. **Sort and return the top `limit`.** Products in the target's own category come first; within each group, sort by score, highest first.

### Why same-category products come first

A category name is on most products in that category, so its IDF is low. A rarer word shared with a product in another category can outweigh it, and no amount of repetition fixes that. The example below shows a laptop beating a phone for a phone. Ranking same-category products first fixes this, and products from other categories still fill any places left over.

### Worked example

Three products: Samsung Galaxy S25 (Smartphones), Samsung Galaxy Book (Laptops) and Google Pixel 10 (Smartphones). N = 3.

| Term | In how many products (df) | idf = ln(4 / (1 + df)) + 1 |
|---|---|---|
| samsung, galaxy, smartphones | 2 | ln(4/3) + 1 = 1.2877 |
| s25, book, laptops, google, pixel | 1 | ln(4/2) + 1 = 1.6931 |

S25 tokens (10): samsung ×3, galaxy ×2, s25 ×2, smartphones ×3. So:

```
w(samsung)     = 3/10 × 1.2877 = 0.3863
w(galaxy)      = 2/10 × 1.2877 = 0.2575
w(s25)         = 2/10 × 1.6931 = 0.3386
w(smartphones) = 3/10 × 1.2877 = 0.3863
```

| Pair | Shared terms | Cosine |
|---|---|---|
| S25 and Galaxy Book | samsung, galaxy | **0.4059** |
| S25 and Pixel 10 | smartphones | 0.2983 |

On text alone, the laptop wins. With the same-category rule, the result is Pixel 10 first, then Galaxy Book.

### Complexity

- T is the total number of tokens across N products, and V is the number of distinct terms in a vector.
- Building IDF and the vectors takes **O(T)**.
- Each cosine walks the smaller vector, so it takes **O(min(V_a, V_b))**.
- Sorting takes **O(N log N)**.
- Memory is **O(T)**.
- The service reads at most 2,000 products per request.

---

## 2. Apriori: "Often bought with this"

### Idea

Each order is a basket of product ids. Apriori finds groups of products that keep appearing in the same basket, then turns them into rules such as "orders with X also contain Y".

### Formulas

```
support(X)        = orders containing X / all orders
confidence(X → Y) = support(X ∪ Y) / support(X)        of the orders with X, the share that also had Y
lift(X → Y)       = confidence(X → Y) / support(Y)     > 1: X raises the chance of Y
```

**The Apriori property:** every subset of a frequent itemset is also frequent. So a size-k candidate is only worth counting if all its size-(k−1) subsets were frequent in the previous pass. This pruning is what keeps the search small.

### Steps

1. **Prepare the baskets.** Read non-cancelled orders, newest first, up to 5,000. Turn each into a set of product ids, so a product listed twice in one order counts once.
2. **Set the threshold.** threshold = max(`minCount`, ⌈`minSupport` × orders⌉). The service uses `minSupport` = 0.01 and `minCount` = 2. The count of 2 means a single order can never make a pair "frequent".
3. **Find frequent single products.** Count each product (L₁) and keep those that meet the threshold.
4. **Repeat for k = 2, 3, … up to `maxSize`:**
   - **Join:** two frequent (k−1)-itemsets that share their first k−2 items make one k-itemset candidate.
   - **Prune:** drop a candidate if any of its (k−1)-subsets is not frequent.
   - **Count:** count each remaining candidate across the baskets and keep those that meet the threshold.
5. **Generate rules.** For every frequent itemset, take each non-empty proper subset X and form X → (rest). Keep the rule if confidence ≥ `minConfidence` (0.1 in the service).
6. **Recommend for one product P.** Keep the rules P → one product with **lift > 1**. Sort them by confidence, then lift, and return the top `limit`.

Pairs with lift ≤ 1 appear together only because both sell a lot, not because one leads to the other.

The product page only needs pairs, so the service sets `maxSize` = 2. Mining every order on each page view would be wasteful, so the rules are cached for 10 minutes per server instance.

### Worked example

Five orders:

| Order | Items |
|---|---|
| 1 | phone, case, charger |
| 2 | phone, case |
| 3 | phone, case |
| 4 | phone, charger |
| 5 | laptop, mouse |

Supports: phone 4/5 = 0.8, case 3/5 = 0.6, charger 2/5 = 0.4, {phone, case} 3/5 = 0.6, {phone, charger} 2/5 = 0.4.

| Rule | Confidence | Lift | Recommended? |
|---|---|---|---|
| phone → case | 0.6 / 0.8 = **0.75** | 0.75 / 0.6 = **1.25** | Yes, first |
| phone → charger | 0.4 / 0.8 = 0.50 | 0.50 / 0.4 = 1.25 | Yes, second |
| charger → case | 0.2 / 0.4 = 0.50 | 0.50 / 0.6 = 0.83 | No: lift ≤ 1 |

So "Often bought with" a phone shows the case, then the charger.

Pruning example: with frequent pairs {a, b} and {a, c} but not {b, c}, the join step makes {a, b, c}, and pruning removes it before it is ever counted.

### Complexity

- M is the number of baskets and |C_k| is the number of candidates at size k.
- Each pass costs **O(|C_k| × M × k)**.
- In the worst case the number of candidates grows exponentially with the number of products. Pruning, the support threshold and `maxSize` = 2 keep it to at most |L₁|² / 2 pairs.
- Rule generation takes **O(2^k)** per itemset. That is 2 per itemset at size 2.

---

## 3. Demand forecast and restock plan: "Restock planner"

### Idea

For each product, the planner works through four questions:

1. How many units sold each day over the last 30 days?
2. What is a fair estimate of tomorrow's demand?
3. How many days of stock are left?
4. When should the merchant reorder, and how many?

The forecast uses **simple exponential smoothing (SES)**. It suits slow-moving retail items with no strong trend or season, and it needs only one number per product.

### Formulas

```
Daily series   x_0 … x_{n−1}         units sold in each 24-hour window, oldest first

level_0 = x_0
level_t = α · x_t + (1 − α) · level_{t−1}       forecast for day t + 1 = level_t
error_t = x_t − level_{t−1}                      how far yesterday's forecast missed

α        = the value in {0.1, 0.2, …, 0.9} with the lowest Σ error_t²   (grid search)
d        = level_{n−1}                            forecast daily demand
RMSE     = √( Σ error_t² / (n − 1) )

days left        = stock / d
safety stock     = ⌈ z · RMSE · √L ⌉                z = 1.65 (about a 95% service level), L = lead time in days
reorder point    = ⌈ d · L + safety stock ⌉
reorder quantity = max(0, ⌈ d · (L + C) + safety stock − stock ⌉)     C = 30 days of cover
```

A high α follows recent days closely. A low α averages out noise. The grid search lets each product's own history choose.

### Status rules

| Status | Rule | Badge on the dashboard |
|---|---|---|
| `out` | stock = 0 | Out of stock |
| `idle` | no sales in the window (d = 0) | No recent sales. Days left and reorder quantity are left blank, not guessed. |
| `reorder` | stock ≤ reorder point | Reorder now |
| `ok` | otherwise | On track |

The list is sorted with `out` first, then `reorder`, `ok` and `idle`. Within a status, the product that runs out soonest comes first, then the best seller.

### Steps

1. **Load products and sales.** Load the products: the merchant's own, or all of them for an admin. Aggregate their non-cancelled order lines from the last `days` days.
2. **Build the daily series.** Bucket each product's sales into rolling 24-hour windows that end now. Rolling windows avoid time-zone questions about where a day starts.
3. **Pick α.** Run SES once for each α in the grid and keep the α with the lowest sum of squared one-step errors.
4. **Compute the statistics.** Take d (the last level) and the RMSE of the errors.
5. **Plan the restock.** Apply the restock formulas with the lead time the merchant picked (3, 7 or 14 days on the dashboard).
6. **Sort and summarise.** Sort by urgency, count the products per status, and return.

### Worked examples

**Smoothing by hand (α = 0.5, series [10, 20, 10]):**

```
level_0 = 10
level_1 = 0.5 × 20 + 0.5 × 10 = 15        error = 20 − 10 = 10
level_2 = 0.5 × 10 + 0.5 × 15 = 12.5      error = 10 − 15 = −5
forecast = 12.5 per day;  SSE = 10² + 5² = 125;  RMSE = √(125 / 2) = 7.91
```

**A full plan.** Ten days of sales are [0, 2, 1, 3, 2, 2, 4, 3, 2, 3], with 10 in stock and a 7-day lead time.

| Step | Result |
|---|---|
| Best α (grid search) | 0.6 |
| Daily demand d | 2.77 |
| RMSE | 1.21 |
| Days left | 10 / 2.77 = **3.6** |
| Safety stock | ⌈1.65 × 1.21 × √7⌉ = ⌈5.28⌉ = 6 |
| Reorder point | ⌈2.77 × 7 + 6⌉ = 26 |
| Status | 10 ≤ 26, so **Reorder now** |
| Reorder quantity | ⌈2.77 × 37 + 6 − 10⌉ = **99** |

**Steady demand.** 2 per day, 30 in stock, 7-day lead time, no error:

- 15 days left
- reorder point 14
- status On track
- reorder quantity 2 × 37 − 30 = 44

### Complexity

- n is the number of days and P the number of products.
- SES takes **O(n)** per α, so the grid search takes **O(9n)** per product.
- The whole forecast takes **O(S + P · n)**, where S is the number of sale lines read.

### Limitations

These belong in the report's limitations section:

- SES has no trend or seasonality term. For products whose sales grow steadily or spike at festivals, Holt or Holt–Winters smoothing would forecast better.
- Lead time is set by the merchant, not learned from supplier history.
- The dashboard labels every figure as an estimate.

---

## 4. Levenshtein distance: typo-tolerant search

### Idea

The edit distance between two words is the smallest number of single-letter insertions, deletions or substitutions that turns one into the other. When a search finds nothing, each typed word is compared with each word of every product's name and brand, and close ones are accepted.

### Recurrence (dynamic programming)

```
d(i, 0) = i          d(0, j) = j
d(i, j) = min( d(i−1, j) + 1,                      delete
               d(i, j−1) + 1,                      insert
               d(i−1, j−1) + (a_i ≠ b_j ? 1 : 0) ) substitute or match
```

### Worked example: kitten → sitting = 3

```
      ε  s  i  t  t  i  n  g
  ε   0  1  2  3  4  5  6  7
  k   1  1  2  3  4  5  6  7
  i   2  2  1  2  3  4  5  6
  t   3  3  2  1  2  3  4  5
  t   4  4  3  2  1  2  3  4
  e   5  5  4  3  2  2  3  4
  n   6  6  5  4  3  3  2  3
```

The edits are: k→s, e→i, and insert g.

### How search uses it

1. **Exact search first.** The normal name search runs, and fuzzy matching runs only when it returns nothing at all.
2. **Allowed edits by word length.** Words of 3 letters or fewer get 0 edits, 4–5 letters get 1, and 6 or more get 2. So "tv" never matches "pc", but "samsng" matches "samsung".
3. **Prefixes count.** A typed word also matches the start of a longer word ("lap" matches "laptop"), so half-typed searches still land.
4. **Every word must match.** Every typed word must have a close word in the product's text. The product's score is the sum of the best distances, and the closest products come first.
5. **Sort order.** Newest-first is the default for every list, so it gives way to closeness. A sort the shopper picked, such as price, keeps its order.
6. **Suggestion.** Each typed word is replaced with the closest word from the matched products, giving "Did you mean …". For example, "samsng galxy" becomes "samsung galaxy", with a total distance of 1 + 1 = 2.

### Complexity

- Time is **O(|a| × |b|)** per pair of words.
- Only two rows of the table are kept, so memory is **O(min(|a|, |b|))**.
- The early exit returns as soon as a whole row exceeds the allowed edits, so most non-matches stop after a few rows.
- One search costs O(P × q × w × L²), where:
  - P is the number of products
  - q is the number of words typed
  - w is the number of words per product
  - L is the word length

---

## Unit test cases (for section 4.2.1)

### Running them

Run from `nexora-backend/`:

```bash
npm test
```

- The tests use Node's built-in test runner (`node:test` and `node:assert`), with no test library to install.
- The suite has 56 tests in 20 groups, and all pass.
- No test touches the database or the network.

### TF-IDF and cosine similarity (`tests/tfidf.test.js`)

| ID | Function | Input | Expected | Result |
|---|---|---|---|---|
| TF-01 | `tokenize` | "The NEW Samsung Galaxy-S25, for you!" | `[samsung, galaxy, s25]`: lower-cased, split on punctuation, stop words dropped | Pass |
| TF-02 | `tokenize` | "a b c 16 GB"; ""; `undefined` | `[16, gb]`; `[]`; `[]` | Pass |
| TF-03 | `termFrequency` | [phone, phone, case, blue] | phone = 0.5, case = 0.25 | Pass |
| TF-04 | `inverseDocumentFrequency` | phone in 3 of 3 products, samsung in 1 | idf(phone) = 1, idf(samsung) = ln 2 + 1, and samsung > phone | Pass |
| TF-05 | `inverseDocumentFrequency` | [tv, tv, tv], [laptop] | idf(tv) = ln(3/2) + 1: counted once per product | Pass |
| TF-06 | `cosineSimilarity` | Identical vectors; vectors with no shared term | 1; 0 | Pass |
| TF-07 | `cosineSimilarity` | (1, 1, 0) and (1, 0, 1) | 0.5 | Pass |
| TF-08 | `cosineSimilarity` | Empty vector | 0, not NaN | Pass |
| TF-09 | `cosineSimilarity` | cos(a, b) and cos(b, a) | Equal | Pass |
| TF-10 | `productTokens` | {Iphone 16, Apple, Phones} | iphone ×2, apple, phones ×3; "16" dropped | Pass |
| TF-11 | `rankSimilar` | S25 Ultra vs Dairy Milk, Galaxy S24, Pixel 10 Pro, Samsung TV | Galaxy S24 first; Dairy Milk left out | Pass |
| TF-12 | `rankSimilar` | Same catalogue | Every score in (0, 1], descending within each category group | Pass |
| TF-13 | `rankSimilar` | Galaxy S25 vs Galaxy Book (laptop) and four phones | The laptop scores above the Pixel, yet is listed after every phone | Pass |
| TF-14 | `rankSimilar` | `limit` = 1; empty catalogue | 1 result; `[]` | Pass |

### Apriori (`tests/apriori.test.js`)

The fixture is the five orders from the worked example above.

| ID | Function | Input | Expected | Result |
|---|---|---|---|---|
| AP-01 | `generateCandidates` | [a], [b], [c] | [a, b], [a, c], [b, c] | Pass |
| AP-02 | `generateCandidates` | [a, b], [a, c] (no [b, c]); then with [b, c] | `[]`, because {a, b, c} is pruned; then [[a, b, c]] | Pass |
| AP-03 | `frequentItemsets` | Five orders, minSupport 0.4 | support(phone) = 0.8; support({phone, case}) = 0.6, count 3 | Pass |
| AP-04 | `frequentItemsets` | Same | laptop (0.2) and {case, charger} (0.2) are excluded | Pass |
| AP-05 | `frequentItemsets` | [[x, y], [z]], minCount 2 | `[]`: one order is never "frequent" | Pass |
| AP-06 | `frequentItemsets` | [[a, a, b], [a, b]] | count(a) = 2: duplicates in one order count once | Pass |
| AP-07 | `frequentItemsets` | No orders | `[]` | Pass |
| AP-08 | `frequentItemsets` | [[a, b, c], [a, b, c], [a, b]], maxSize 3 | {a, b, c} found with count 2 | Pass |
| AP-09 | `associationRules` | Five orders | case → phone: confidence 1, lift 1.25; phone → case: confidence 0.75, lift 1.25 | Pass |
| AP-10 | `associationRules` | minConfidence 0.9 | Every rule ≥ 0.9; no rule starts from phone | Pass |
| AP-11 | `recommendFor` | "phone" | [case, charger], all with lift > 1 | Pass |
| AP-12 | `recommendFor` | "tv" (never ordered) | `[]` | Pass |
| AP-13 | `recommendFor` | An ObjectId-like id object | Works the same as the string id | Pass |

### Forecast and restock (`tests/forecast.test.js`)

| ID | Function | Input | Expected | Result |
|---|---|---|---|---|
| FC-01 | `dailySeries` | Sales 1 h, 5 h and 30 h ago; 3 days | [0, 4, 3], oldest first | Pass |
| FC-02 | `dailySeries` | A sale 10 days ago; a sale in the future | [0, 0, 0] | Pass |
| FC-03 | `exponentialSmoothing` | [10, 20, 10], α = 0.5 | fitted [10, 15, 12.5], errors [10, −5], level 12.5 | Pass |
| FC-04 | `exponentialSmoothing` | [4, 4, 4, 4], α = 0.3 | level 4 | Pass |
| FC-05 | `exponentialSmoothing` | `[]` | level 0 | Pass |
| FC-06 | `bestAlpha` | Demand steps from 0 to 10 and stays | α ≥ 0.7 | Pass |
| FC-07 | `bestAlpha` | Alternating 5, 1, 5, 1… | α ≤ 0.3 | Pass |
| FC-08 | `forecastDemand` | 30 days of 0 | Demand 0, RMSE 0 | Pass |
| FC-09 | `forecastDemand` | [2, 2, 2, 2] | RMSE 0 | Pass |
| FC-10 | `restockPlan` | Stock 30, d = 2, L = 7, C = 30 | 15 days left, reorder point 14, quantity 44, status ok | Pass |
| FC-11 | `restockPlan` | Stock 10, d = 2, L = 7 | Status reorder, 5 days left | Pass |
| FC-12 | `restockPlan` | Stock 20, d = 2, RMSE 2 vs RMSE 0 | Safety stock 9 (1.65 × 2 × √7 = 8.73, rounded up); reorder point 9 higher | Pass |
| FC-13 | `restockPlan` | Stock 0, d = 1.5 | Status out, 0 days left, quantity > 0 | Pass |
| FC-14 | `restockPlan` | Stock 12, d = 0 | Status idle; days left and quantity are `null` | Pass |
| FC-15 | `restockPlan` | Stock 500, d = 1 | Quantity 0, never negative; 500 days left | Pass |

### Levenshtein and fuzzy search (`tests/levenshtein.test.js`)

| ID | Function | Input | Expected | Result |
|---|---|---|---|---|
| LV-01 | `levenshtein` | kitten/sitting, flaw/lawn, samsng/samsung, iphone/iphone | 3, 2, 1, 0 | Pass |
| LV-02 | `levenshtein` | ""/abc, abc/"", ""/"" | 3, 3, 0 | Pass |
| LV-03 | `levenshtein` | laptop/lpatop both ways | Equal | Pass |
| LV-04 | `levenshtein` | ab/ba | 2: a swap is two edits | Pass |
| LV-05 | `levenshtein` | chocolate/keyboard with max 2; a/abcdef with max 2 | 3 (max + 1, early exit); 3 | Pass |
| LV-06 | `allowedEdits` | tv, dell, samsung | 0, 1, 2 | Pass |
| LV-07 | `matchScore` | "samsng galaxy" vs "Samsung Galaxy S25 Ultra"; "samsng toaster" | 1; `null` (every word must match) | Pass |
| LV-08 | `matchScore` | "lap", "lapto" vs "Dell XPS 13 Laptop" | 0: a prefix match | Pass |
| LV-09 | `matchScore` | "tv" vs "Dell PC" | `null`: short words get no slack | Pass |
| LV-10 | `matchScore` | "galaxy samsung" vs "Samsung Galaxy S25" | 0: word order ignored | Pass |
| LV-11 | `fuzzySearch` | "iphnoe" over three products | [Iphone 16 pro max] | Pass |
| LV-12 | `fuzzySearch` | "qwxyz" | `[]` | Pass |
| LV-13 | `suggestCorrection` | "samsng galxy" | "samsung galaxy" | Pass |
| LV-14 | `suggestCorrection` | "iphone"; "qwxyz" | `null`; `null` | Pass |

### Checks through the API on demo data

These ran against a local demo database filled by the seed script. They are not unit tests, but they fit the report's system testing section (4.2.2).

| Check | Result |
|---|---|
| `/similar` for Samsung Galaxy S25 Ultra | Samsung M14 (0.395), Samsung A18 (0.317), Iphone 16 pro max (0.231), Google Pixel 10 Pro XL (0.183): phones only. Before the same-category rule was added, the Samsung Galaxy Book laptop came first. |
| `/bought-together` for the S25 | Google Pixel 10 Pro XL first (8 shared orders, confidence 0.4, lift 3.33), then Iphone 16 pro max, Kitkat and Samsung A18 |
| `/products/count?name=samsng galxy` | `totalCount: 2`, `fuzzy: true`, `suggestion: "samsung galaxy"` |
| `/restock-forecast` as a merchant | Only that merchant's 12 products. 5 are "Reorder now" at a 3- or 7-day lead time, and 8 at 14 days. |
| `/restock-forecast` without signing in | 401 |
| `/restock-forecast` as a customer | 403 |

---

## Demo order history

A fresh database has no orders, so "Often bought with this" stays hidden and every product shows "No recent sales". To demonstrate the algorithms, use the seed script, from `nexora-backend/`:

```bash
node scripts/seed-demo-orders.js --yes            # adds about 150 orders over the last 30 days
node scripts/seed-demo-orders.js --clean --yes    # removes exactly those orders
```

- **Database.** It writes to the database in `DBURL`. Point it at a demo or local database, never at one with real customers.
- **Marking.** Every order it creates has an order number starting with `DEMO-` and belongs to one demo customer, `demo.shopper@example.com`. That is how `--clean` finds them.
- **Repeatable.** It uses a seeded random generator, so every run gives the same history.
- **Stock unchanged.** It doesn't change stock: the orders are past history, not new sales.

## Limits worth stating in the report

- **In memory.** All four algorithms run in memory, on at most 2,000 products and 5,000 orders per request. That is enough for this project's size. A larger shop would precompute the TF-IDF vectors and Apriori rules in a background job.
- **Per-instance cache.** The Apriori rules are cached for 10 minutes on each server instance. A new order shows up in "Often bought with this" after the cache expires.
- **Cold start.** A brand-new product has no orders, so it gets no "Often bought with this" and is marked "No recent sales". TF-IDF still finds similar products for it from its text.
- **Forecast model.** The forecast has no trend or seasonality term, and the lead time is entered by the merchant (see section 3).
