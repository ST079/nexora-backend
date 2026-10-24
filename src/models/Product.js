import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Product name is required."],
    minlength: [3, "Name must be at least 3 characters."],
  },
  description: String,
  brand: String,
  category: String,
  price: {
    type: Number,
    required: [true, "Product price is required."],
    min: [1, "Price must be at least 1."],
  },
  stock: { type: Number, default: 1, min: [0, "Stock cannot be negative."] },
  imageUrls: [String],
  createdAt: { type: Date, default: Date.now },
  createdBy: {
    type: mongoose.Schema.ObjectId,
    ref: "User",
    required: [true, "Product must have a creator!"],
  },
});

const productModel = mongoose.model("Product", productSchema);

export default productModel;
