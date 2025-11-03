import express from "express";
import {
  addProductToCart,
  createProduct,
  deleteProduct,
  getCartProducts,
  getProductCategories,
  getProductFromCart,
  getProducts,
  removeProductFromCart,
  updateProduct,
} from "../controllers/user.controller.js";
import uploadFile from "../middlewares/uploadFile.js";
import validateSchema from "../middlewares/validateSchema.js";
import { productSchema } from "../schemas/product.schema.js";

const userRouter = express.Router();

//********** products **********
userRouter.route("/products").get(getProducts).post(
  uploadFile,
  validateSchema(productSchema),

  createProduct
);
// userRouter.get("/products", getProducts);

userRouter.post("/products/:id", updateProduct);
userRouter.delete("/products/:id", deleteProduct);

//********** product categories **********

userRouter.get("/products/categories", getProductCategories);

//********** cart **********
userRouter.route("/cart").get(getCartProducts).post(addProductToCart);
userRouter
  .route("/cart/products/:id")
  .get(getProductFromCart)
  .delete(removeProductFromCart);

export default userRouter;
