import dotenv from "dotenv";
dotenv.config();

const config = {
  name: process.env.NAME || "",
  port: process.env.PORT || 5000,
  // APP_URL is the storefront (Next.js) URL — used for Khalti + reset links.
  app_url: process.env.APP_URL || "http://localhost:3000",
  version: process.env.VERSION || "/api/v1",
  cors_origins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  delivery_charge: parseInt(process.env.DELIVERY_CHARGE) || 200,
  databaseURL: process.env.DBURL,
  salt_round: process.env.SALT_ROUND || "",
  jwt_secret: process.env.JWT_SECRET || "",
  feature: {
    admin: {
      enabled: parseInt(process.env.FEATURE_ADMIN_ENABLED) || false,
    },
  },
  khalti: {
    api_url: process.env.KHALTI_API_URL || "",
    api_key: process.env.KHALTI_API_KEY || "",
    return_url: process.env.KHALTI_RETURN_URL || "",
    lookup_url: process.env.KHALTI_LOOKUP_URL || "",
  },
  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
    api_key: process.env.CLOUDINARY_API_KEY || "",
    api_secret: process.env.CLOUDINARY_API_SECRET || "",
  },
  emailApiKey: process.env.EMAIL_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  stripe_Secret_Key: process.env.STRIPE_SECRET_KEY || "",
};

export default config;
