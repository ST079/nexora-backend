// Product photos are uploaded one at a time (POST /products/images) and the
// product is then saved with their URLs. Only URLs that point into our own
// Cloudinary account are accepted, so a listing can't hotlink, or track
// shoppers with, an image hosted somewhere else.
const CLOUDINARY_HOST = "res.cloudinary.com";

const isHostedImageUrl = (value, cloudName) => {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.hostname !== CLOUDINARY_HOST) return false;
  if (url.username || url.password) return false;
  // Without a cloud name configured (local dev) any Cloudinary URL will do.
  return !cloudName || url.pathname.startsWith(`/${cloudName}/`);
};

// Returns the first URL that isn't allowed, or null. `known` holds URLs the
// product already has: older records may predate the rule and stay valid.
const findForeignImage = (urls = [], { cloudName, known = [] } = {}) => {
  const allowed = new Set(known);
  return urls.find((url) => !allowed.has(url) && !isHostedImageUrl(url, cloudName)) ?? null;
};

export { CLOUDINARY_HOST, isHostedImageUrl, findForeignImage };
