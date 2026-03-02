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
          type: Number,
          required: true,
          min: 0,
        },
        quantity: {
          type: Number,
          required: true,
        },
      },
    ],
    shippingAddress: {
      firstName: {
        type: String,
        required: function () {
          return !this.isAdminOrder; //admin orders do not require firstName
        },
      },
      lastName: {
        type: String,
        required: function () {
          return !this.isAdminOrder; //admin orders do not require lastName
        },
      },
      companyName: { type: String },
      streetAddress: { type: String, required: true },
      zipCode: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String },

      country: { type: String, required: true },
    },

    isAdminOrder: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "shipped", "delivered", "cancelled"],
      default: "pending",
    },
    shippingCosts: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
  // { timestamps: true }
  // add createdAt and updatedAt fields
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
