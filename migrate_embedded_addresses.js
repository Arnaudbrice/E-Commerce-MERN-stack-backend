// This script migrates embedded addresses in User documents to referenced Address documents.
// Run this with: node migrate_embedded_addresses.js

import mongoose from "mongoose";
import User from "./models/User.js";
import Address from "./models/Address.js";

const MONGO_URI = process.env.MONGODB_URI;

async function migrateAddresses() {
  await mongoose.connect(MONGO_URI);
  const users = await User.find({});
  for (const user of users) {
    // If user.addresses is not an array of ObjectIds, but embedded objects
    if (
      user.addresses &&
      user.addresses.length &&
      typeof user.addresses[0] === "object" &&
      !(user.addresses[0] instanceof mongoose.Types.ObjectId)
    ) {
      const addressIds = [];
      for (const addr of user.addresses) {
        const newAddr = await Address.create(addr);
        addressIds.push(newAddr._id);
      }
      user.addresses = addressIds;
      // If defaultAddress was an embedded object, set it to the first new address
      if (!user.defaultAddress || typeof user.defaultAddress === "object") {
        user.defaultAddress = addressIds[0];
      }
      await user.save();
      console.log(`Migrated addresses for user ${user.email}`);
    }
  }
  await mongoose.disconnect();
  console.log("Migration complete.");
}

migrateAddresses().catch(console.error);
