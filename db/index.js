import chalk from "chalk";
import mongoose from "mongoose";

try {
  const mongo = await mongoose.connect(process.env.MONGODB_URI, {
    dbName: "ecommerceFullstackDB",
  });
  console.log(
    chalk.green(`DB CONNECTION to: ${mongo.connection.name} successfully!`)
  );
} catch (error) {
  console.log(chalk.red(`DB CONNECTION ERROR: ${error}`));
  process.exit(1); // non‑zero exit code signals failure
}
