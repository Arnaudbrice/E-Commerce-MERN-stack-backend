import chalk from "chalk";
import mongoose from "mongoose";
// import User from "../models/User.js";
// import Cart from "../models/Cart.js";

try {
  const mongo = await mongoose.connect(process.env.MONGODB_URI, {
    dbName: "ecommerceFullstackDB",
  });
  console.log(
    chalk.green(`DB CONNECTION to: ${mongo.connection.name} successfully!`),
  );
  /*  migration add cardId to user who don't have it yet (we added it recently and some users may not have it) and create a cart for them
  const users = await User.find({ cartId: { $exists: false } });

  for (const user of users) {
    const cart = await Cart.create({ userId: user._id, products: [] });
    user.cartId = cart._id;
    await user.save({ validateBeforeSave: false });
    console.log(`Cart created for user ${user.email}`);
  } */
} catch (error) {
  console.log(chalk.red(`DB CONNECTION ERROR: ${error}`));
  process.exit(1); // non‑zero exit code signals failure
}
