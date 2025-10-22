import mongoose from "mongoose";
// Helper to convert Decimal128 ↔︎ string for JSON output
export const decimalToString = (val) => {
  return val ? val.toString() : null;
};
export const stringToDecimal = (val) => {
  return val ? mongoose.Types.Decimal128.fromString(val) : null;
};
