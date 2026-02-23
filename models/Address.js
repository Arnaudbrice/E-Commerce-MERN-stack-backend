import mongoose from "mongoose";
const addressSchema = new mongoose.Schema({
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

const Address = mongoose.model("Address", addressSchema);
export default Address;
