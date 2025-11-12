import express from "express";
import {
  addProductToCart,
  clearUserCart,
  createCheckoutSession,
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

//! import authenticate for protect routes
import authenticate from "../middlewares/authenticate.js";

const userRouter = express.Router();

//********** products **********
userRouter.route("/products").get(getProducts).post(
  authenticate,
  uploadFile,
  validateSchema(productSchema),

  createProduct
);
// userRouter.get("/products", getProducts);

userRouter.post("/products/:id", authenticate, updateProduct);
userRouter.delete("/products/:id", authenticate, deleteProduct);

//********** product categories **********

userRouter.get("/products/categories", getProductCategories);

//********** cart **********
userRouter
  .route("/cart")
  .get(authenticate, getCartProducts)
  .post(authenticate, addProductToCart);
userRouter
  .route("/cart/products/:id")
  .get(authenticate, getProductFromCart)
  .delete(authenticate, removeProductFromCart);

userRouter.delete("/cart/clear", authenticate, clearUserCart);

userRouter.route("/cart/create-checkout-session").post(createCheckoutSession);

export default userRouter;
