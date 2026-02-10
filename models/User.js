import mongoose from "mongoose";

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
  firstName: String,
  lastName: String,
  phone: String,
  streetAddress: String,
  city: String,
  state: String,
  zipCode: String,
  country: String,
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
