// Fixed-window limiter keyed by client IP. Counts live in this process's
// memory, so on serverless (Vercel) each instance keeps its own counts:
// it slows brute force down but isn't a hard cap. Move the store to
// Redis/Upstash when that matters.
const SWEEP_AT = 5000;

const clientIp = (req) => req.ip ?? req.socket?.remoteAddress ?? "unknown";

// `key` picks the bucket; it defaults to the client's IP. Limiters that run
// after `auth` can key by user instead, so one office network isn't shared.
const rateLimit = ({ name, windowMs, max, message, key: keyOf = clientIp }) => {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();

    if (hits.size > SWEEP_AT)
      for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);

    const key = keyOf(req) ?? clientIp(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.set("RateLimit-Policy", `${max};w=${Math.round(windowMs / 1000)};name="${name}"`);
    res.set("RateLimit", `limit=${max}, remaining=${Math.max(0, max - entry.count)}, reset=${retryAfter}`);

    if (entry.count > max) {
      res.set("Retry-After", String(retryAfter));
      return next({ status: 429, message });
    }
    next();
  };
};

const MINUTE = 60 * 1000;

export const loginLimiter = rateLimit({
  name: "login",
  windowMs: 15 * MINUTE,
  max: 20,
  message: "Too many sign-in attempts. Please wait a few minutes and try again.",
});

export const registerLimiter = rateLimit({
  name: "register",
  windowMs: 60 * MINUTE,
  max: 10,
  message: "Too many accounts created from this network. Please try again later.",
});

// Each request sends an email, so this one is the tightest.
export const forgotPasswordLimiter = rateLimit({
  name: "forgot-password",
  windowMs: 15 * MINUTE,
  max: 5,
  message: "Too many reset requests. Please check your inbox or try again in a few minutes.",
});

export const resetPasswordLimiter = rateLimit({
  name: "reset-password",
  windowMs: 15 * MINUTE,
  max: 10,
  message: "Too many attempts. Please request a new reset link in a few minutes.",
});

// Both of these run after `auth`, so each seller gets their own allowance.
const byUser = (req) => (req.user?._id ? `user:${req.user._id}` : undefined);

// Every call is a paid model request.
export const aiDescriptionLimiter = rateLimit({
  name: "ai-description",
  windowMs: 15 * MINUTE,
  max: 20,
  key: byUser,
  message: "You've generated a lot of descriptions. Please wait a few minutes and try again.",
});

// Generous, since a listing can have any number of photos, but it stops a
// runaway script from filling the Cloudinary account.
export const imageUploadLimiter = rateLimit({
  name: "image-upload",
  windowMs: 15 * MINUTE,
  max: 200,
  key: byUser,
  message: "Too many uploads in a short time. Please wait a few minutes and try again.",
});

export default rateLimit;
