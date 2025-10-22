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
      },
      quantity: {
        type: Number,
      },
      //!ensure title, price, description are available,event if the product is deleted
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
    },
  ],
});

const Cart = mongoose.model("Cart", cartSchema);

export default Cart;
