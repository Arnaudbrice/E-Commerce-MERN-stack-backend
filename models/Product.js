import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    /*  price: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      set: (value) =>
        mongoose.Types.Decimal128.fromString(parseFloat(value).toFixed(2)), // Convert to Decimal128
      get: (value) => parseFloat(value.toString()), // Convert Decimal128 to number
    } */

    price: {
      type: Number,
      required: true,
      min: 0, // optional guard
    },

    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: [
        "Electronics",
        "Jewerly",
        "Men's Clothing",
        "Women's Clothing",
        "Kids's Clothing",
        "Books",
        "Home",
        "Beauty",
        "Sports",
        "Other",
      ],
      default: "Other",
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
    isFavorite: {
      type: Boolean,
      default: false,
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
  {
    timestamps: true,
    toJSON: { getters: true }, // Enable getters when converting to JSON
    toObject: { getters: true }, // Enable getters when converting to Object
  }

  // adds createdAt & updatedAt
);

const Product = mongoose.model("Product", productSchema);

export default Product;
