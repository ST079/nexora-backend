import dotenv from "dotenv";
dotenv.config();

import cors from "cors";

import express from "express";
import connectCloudinary from "./config/cloudinary.js";
import config from "./config/config.js";

import auth from "./middlewares/auth.js";
import authRoutes from "./routes/auth.route.js";
import bodyParser from "body-parser";
import connectDB from "./config/database.js";
import errorMiddleware from "./middlewares/errorMiddleware.js";
import logger from "./middlewares/logger.js";
import productRoutes from "./routes/product.route.js";
import userRoutes from "./routes/user.route.js";
import orderRoutes from "./routes/order.route.js";
import paymentRoutes from "./routes/payment.route.js";

//aaba yo aap le sabai kaam garnu milxa express ma,
// server banaune, route haru define garne, middleware haru use garne, etc.
const app = express();

// Behind Vercel's proxy req.ip must come from X-Forwarded-For, or every
// visitor shares one rate-limit bucket. Elsewhere set TRUST_PROXY only when
// a proxy really sits in front; otherwise clients could spoof the header.
if (process.env.VERCEL || process.env.TRUST_PROXY) app.set("trust proxy", 1);

app.use(
  cors({
    // Set CORS_ORIGINS (comma separated) in production so only the storefront
    // can send credentialed requests. Falls back to reflecting the origin.
    origin: config.cors_origins.length ? config.cors_origins : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.get("/", (req, res) => {
  res.send({
    name: config.name,
    version: config.version,
  });
});

// Configs
connectDB();
connectCloudinary();

app.use(bodyParser.json());

app.use(logger);

app.set("view engine", "hbs");

// Routes
app.use(config.version + "/products", productRoutes);

app.use(config.version + "/users", auth, userRoutes);

app.use(config.version + "/auth", authRoutes);
app.use(config.version + "/orders", auth, orderRoutes);
app.use(config.version + "/payments", auth, paymentRoutes);

//Middleware for handling errors
app.use(errorMiddleware);

// Server — Vercel imports the app, everywhere else we listen ourselves.
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}....`);
  });
}

export default app;
