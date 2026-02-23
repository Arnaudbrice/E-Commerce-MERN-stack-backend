import mongoose from "mongoose";

import address from "./Address.js";

/* const addressSchema = new mongoose.Schema({
  label: { type: String, default: "shippingAddress" }, // e.g. Home, Work, etc.
  firstName: { type: String },
  lastName: String,
  streetAddress: { type: String, required: true },
  zipCode: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String },
  country: { type: String, required: true },
  phone: { type: String },
});
 */
const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
    select: false, // Exclude password from queries by default
  },
  cartId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cart",
    required: true,
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  /*  firstName: String,
  lastName: String,
  phone: String,
  streetAddress: String,
  city: String,
  state: String,
  zipCode: String,
  country: String, */
  addresses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Address" }],
  defaultAddress: { type: mongoose.Schema.Types.ObjectId, ref: "Address" }, //address id
  resetToken: String,
  resetTokenExpiration: Date,
});

const User = mongoose.model("User", userSchema);

// define a mongoose instance method to clear the user cart

/* userSchema.methods.clearCart = async () => {
  this.cartId = null;
  await this.save();
}; */

export default User;
