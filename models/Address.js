import mongoose from "mongoose";

export const addressSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  phone: String,
  streetAddress: String,
  city: String,
  state: String,
  zipCode: String,
  country: String,
  label: { type: String, default: "shippingAddress" }, // e.g. Home, Work, etc.
});

const Address = mongoose.model("Address", addressSchema);

export default Address;
