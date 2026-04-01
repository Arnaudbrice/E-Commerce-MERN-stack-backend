import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

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
        "Jewelry",
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
    /* isFavorite: {
      type: Boolean,
      default: false,
    }, */

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // multiple reviews stored here
    /*  reviews: {
    type: [reviewSchema],
    default: []  // IMPORTANT
  }, */
    reviews: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Review",
      default: [],
    },

    // store average rating for quick access
    averageRating: {
      type: Number,
    },
    weight: {
      type: Number,
      required: true,
      min: 0, // optional guard
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt
  },

  // adds createdAt & updatedAt
);

// Add a text index for title and description (MongoDB will use this index to perform text searches with the $text operator.-> $text: { $search: "query" } is equivalent to $or: [{ title: { $regex: "query", $options: "i" } }, { description: { $regex: "query", $options: "i" } }] but much faster)
productSchema.index({ title: "text", description: "text", category: "text" });

const Product = mongoose.model("Product", productSchema);

export default Product;
