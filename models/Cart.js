import mongoose from "mongoose";

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  products: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },

      quantity: {
        type: Number,
        default: 0,
      },
      //!ensure image,title, price, description are available,event if the product is deleted
      image: {
        type: String,
        required: true,
      },

      title: {
        type: String,
        required: true,
      },
      price: {
        type: Number,
        required: true,
        min: 0,
      },
      weight: {
        type: Number,
        // required: true,
        min: 0,
      },
      description: {
        type: String,
        required: true,
      },
    },
  ],
});

const Cart = mongoose.model("Cart", cartSchema);

export default Cart;
