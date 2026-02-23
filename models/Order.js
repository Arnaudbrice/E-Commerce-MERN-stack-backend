import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    products: [
      //array of products in the order, each with its own productId, image, title, description, price, and quantity.
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        image: {
          type: String,
          required: true,
        },
        title: {
          type: String,
          required: true,
        },
        description: {
          type: String,
          required: true,
        },
        price: {
          type: mongoose.Schema.Types.Decimal128,
          required: true,
          get: (v) => parseFloat(v.toString()), // Automatically converts to number when reading
        },
        quantity: {
          type: Number,
          required: true,
        },
      },
    ],
    shippingAddress: {
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },

      streetAddress: { type: String, required: true },
      zipCode: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String },

      country: { type: String, required: true },
    },
    status: {
      type: String,
      enum: ["pending", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
  },
  { toJSON: { getters: true }, timestamps: true } // When this document is converted to JSON (for the API or for the frontend), please ensure that all `get` functions are executed.
  // { timestamps: true }
  // add createdAt and updatedAt fields
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
