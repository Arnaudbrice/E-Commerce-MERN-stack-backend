import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    price: {
      type: mongoose.Schema.Types.Decimal128, // ( Decimal128 supports up to 34 decimal digits of precision.)
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: [
        "electronics",
        "clothing",
        "books",
        "home",
        "beauty",
        "sports",
        "other",
      ],
      default: "other",
    },
    image: {
      type: String,
      required: true,
    },
    // Optional fields that are often useful in e‑commerce
    stock: {
      type: Number,
      default: 0,
      min: [0, "Stock cannot be negative"],
    },
    rating: {
      type: Number,
      min: [0, "Rating cannot be below 0"],
      max: [5, "Rating cannot exceed 5"],
      default: 0,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true } // adds createdAt & updatedAt
);

const Product = mongoose.model("Product", productSchema);

export default Product;
