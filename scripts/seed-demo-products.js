// Fills the catalogue with ~80 demo products across the storefront
// categories, so the shop, search and recommendations have variety to show.
// Products and photos come from DummyJSON (a free demo catalogue); the photos
// are copied into Cloudinary because next/image only loads from there.
//
//   node scripts/seed-demo-products.js --merchant=<email> --yes   add them
//   node scripts/seed-demo-products.js --clean --yes              remove them
//
// Every photo goes into the "nexora-demo-products" Cloudinary folder, so a
// product is a demo product exactly when its imageUrls point there: --clean
// removes those products (whoever owns them) and deletes the photos.
// Products whose name is already in the catalogue are skipped, so re-running
// adds only what is missing. Run seed-demo-orders.js afterwards to give the
// new products sales history; clean the orders before the products.
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import config from "../src/config/config.js";
import connectCloudinary from "../src/config/cloudinary.js";
import productModel from "../src/models/Product.js";
import userModel from "../src/models/User.js";
import { ROLE_MERCHANT } from "../src/constants/roles.js";

const SOURCE_URL = "https://dummyjson.com/products?limit=0";
const DEMO_FOLDER = "nexora-demo-products";
const IMAGES_PER_PRODUCT = 3;
// DummyJSON prices are in US dollars; this is close enough for demo data.
const NPR_PER_USD = 140;

// DummyJSON titles, grouped by the storefront category they are listed under.
// There is no books category upstream, so Books stays empty.
const PICKS = {
  Smartphones: [
    "iPhone 13 Pro",
    "iPhone X",
    "Samsung Galaxy S10",
    "Samsung Galaxy S8",
    "Oppo F19 Pro Plus",
    "Oppo A57",
    "Realme XT",
    "Realme C35",
    "Vivo X21",
    "Vivo V9",
  ],
  "Tech & Electronics": [
    "Apple MacBook Pro 14 Inch Space Grey",
    "Asus Zenbook Pro Dual Screen Laptop",
    "New DELL XPS 13 9300 Laptop",
    "Lenovo Yoga 920",
    "Huawei Matebook X Pro",
    "iPad Mini 2021 Starlight",
    "Samsung Galaxy Tab S8 Plus Grey",
    "Apple Airpods",
    "Beats Flex Wireless Earphones",
    "Apple Watch Series 4 Gold",
    "Amazon Echo Plus",
    "Apple iPhone Charger",
  ],
  Clothing: [
    "Blue & Black Check Shirt",
    "Man Plaid Shirt",
    "Gigabyte Aorus Men Tshirt",
    "Blue Frock",
    "Gray Dress",
    "Tartan Dress",
    "Black Women's Gown",
    "Nike Air Jordan 1 Red And Black",
    "Puma Future Rider Trainers",
    "Sports Sneakers Off White & Red",
    "Calvin Klein Heel Shoes",
    "Golden Shoes Woman",
  ],
  Groceries: [
    "Rice",
    "Cooking Oil",
    "Eggs",
    "Milk",
    "Honey Jar",
    "Nescafe Coffee",
    "Juice",
    "Potatoes",
    "Red Onions",
    "Kiwi",
    "Strawberry",
    "Tissue Paper Box",
  ],
  "Home & Living": [
    "Annibale Colombo Sofa",
    "Bedside Table African Cherry",
    "Knoll Saarinen Executive Conference Chair",
    "Table Lamp",
    "Plant Pot",
    "Family Tree Photo Frame",
    "House Showpiece Plant",
    "Microwave Oven",
    "Boxed Blender",
    "Carbon Steel Wok",
    "Spice Rack",
    "Lunch Box",
  ],
  Beauty: [
    "Essence Mascara Lash Princess",
    "Eyeshadow Palette with Mirror",
    "Powder Canister",
    "Red Lipstick",
    "Red Nail Polish",
    "Olay Ultra Moisture Shea Butter Body Wash",
    "Vaseline Men Body and Face Lotion",
    "Attitude Super Leaves Hand Soap",
    "Calvin Klein CK One",
    "Dior J'adore",
    "Chanel Coco Noir Eau De",
    "Gucci Bloom Eau de",
  ],
  Sports: [
    "Cricket Bat",
    "Cricket Ball",
    "Cricket Helmet",
    "Cricket Wicket",
    "Football",
    "Basketball",
    "Basketball Rim",
    "Tennis Racket",
    "Tennis Ball",
    "Feather Shuttlecock",
    "Iron Golf",
    "Golf Ball",
  ],
};

const args = process.argv.slice(2);
const clean = args.includes("--clean");
const merchantEmail = args
  .find((arg) => arg.startsWith("--merchant="))
  ?.slice("--merchant=".length)
  .trim()
  .toLowerCase();

if (!args.includes("--yes")) {
  console.log(
    "Writes demo products to the database in DBURL and photos to Cloudinary. Re-run with --yes.",
  );
  process.exit(1);
}
if (!clean && !merchantEmail) {
  console.log("Pass --merchant=<email> of the merchant who will own the products.");
  process.exit(1);
}

connectCloudinary();
await mongoose.connect(config.databaseURL);
const { host, name: dbName } = mongoose.connection;
console.log(`Database: ${dbName} on ${host}`);

const demoImages = { imageUrls: { $regex: `/${DEMO_FOLDER}/` } };

if (clean) {
  const { deletedCount } = await productModel.deleteMany(demoImages);
  // Deletes at most 1000 photos per call and says when more are left.
  let photos = 0;
  for (let partial = true; partial; ) {
    const result = await cloudinary.api.delete_resources_by_tag(DEMO_FOLDER);
    photos += Object.keys(result.deleted ?? {}).length;
    partial = Boolean(result.partial);
  }
  await cloudinary.api.delete_folder(DEMO_FOLDER).catch(() => {});
  console.log(`Removed ${deletedCount} demo product(s) and ${photos} photo(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

const merchant = await userModel.findOne({ email: merchantEmail });
if (!merchant?.roles.includes(ROLE_MERCHANT)) {
  console.log(`No merchant account with the email ${merchantEmail}.`);
  await mongoose.disconnect();
  process.exit(1);
}

const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`DummyJSON answered ${response.status}.`);
const byTitle = new Map(
  (await response.json()).products.map((item) => [item.title, item]),
);

const existing = new Set(
  (await productModel.find({}, "name").lean()).map((p) => p.name.toLowerCase()),
);

// Round-robin over the categories, so sorting by newest shows a mix.
const queues = Object.entries(PICKS).map(([category, titles]) =>
  titles.map((title) => ({ category, title })),
);
const picks = [];
while (queues.some((queue) => queue.length)) {
  for (const queue of queues) if (queue.length) picks.push(queue.shift());
}

const missing = picks.filter(({ title }) => !byTitle.has(title));
missing.forEach(({ title }) => console.log(`Not on DummyJSON any more: ${title}`));
const todo = picks.filter(
  ({ title }) => byTitle.has(title) && !existing.has(title.toLowerCase()),
);
console.log(`${picks.length - missing.length - todo.length} already listed, ${todo.length} to add.`);
if (!todo.length) {
  await mongoose.disconnect();
  process.exit(0);
}

const slugify = (text) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Rounded the way shelf prices are: to Rs 10, or Rs 100 above Rs 10,000.
const toNPR = (usd) => {
  const npr = usd * NPR_PER_USD;
  const step = npr >= 10_000 ? 100 : 10;
  return Math.max(step, Math.round(npr / step) * step);
};

// A fixed public_id per photo makes re-runs reuse the copy already uploaded.
const copyPhotos = async ({ title }) => {
  const urls = [];
  for (const [i, url] of byTitle.get(title).images.slice(0, IMAGES_PER_PRODUCT).entries()) {
    try {
      const result = await cloudinary.uploader.upload(url, {
        folder: DEMO_FOLDER,
        public_id: `${slugify(title)}-${i + 1}`,
        tags: [DEMO_FOLDER],
        overwrite: false,
      });
      urls.push(result.secure_url);
    } catch (error) {
      console.log(`Photo ${i + 1} of ${title} failed: ${error.message ?? error}`);
    }
  }
  return urls;
};

// A few products at a time: quick, without hammering either service.
const BATCH_SIZE = 4;
const now = Date.now();
const docs = [];
for (let start = 0; start < todo.length; start += BATCH_SIZE) {
  const batch = todo.slice(start, start + BATCH_SIZE);
  const photos = await Promise.all(batch.map(copyPhotos));
  batch.forEach((pick, i) => {
    if (!photos[i].length) return console.log(`Skipped ${pick.title}: no photo copied.`);
    const item = byTitle.get(pick.title);
    docs.push({
      name: item.title,
      description: item.description,
      brand: item.brand,
      category: pick.category,
      price: toNPR(item.price),
      stock: Math.max(0, item.stock),
      imageUrls: photos[i],
      // A minute apart, in pick order, so "newest" is stable.
      createdAt: new Date(now - (start + i) * 60_000),
      createdBy: merchant._id,
    });
  });
  console.log(`Copied photos for ${Math.min(start + BATCH_SIZE, todo.length)}/${todo.length}`);
}

await productModel.insertMany(docs);
const perCategory = Object.keys(PICKS)
  .map((category) => `${category} ${docs.filter((d) => d.category === category).length}`)
  .join(", ");
console.log(`Added ${docs.length} demo products for ${merchant.name}: ${perCategory}.`);
await mongoose.disconnect();
