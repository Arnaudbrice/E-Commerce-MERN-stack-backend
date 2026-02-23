import express from "express";
import {
  addProductToCart,
  clearUserCart,
  createCheckoutSession,
  createProduct,
  deleteProduct,
  getCartProducts,
  createOrder,
  getProductCategories,
  getProductFromCart,
  getProducts,
  removeProductFromCart,
  updateProduct,
  updateProductStock,
  getOrders,
  getOrderInvoice,
  updateProductFavorite,
  getFavoriteProducts,
  updateProductRating,
  getProduct,
  getAllOrders,
  updateOrderStatus,
} from "../controllers/user.controller.js";
import uploadFile from "../middlewares/uploadFile.js";
import validateSchema from "../middlewares/validateSchema.js";
import { productSchema } from "../schemas/product.schema.js";

//! import authenticate for protect routes
import authenticate from "../middlewares/authenticate.js";
import isAdmin from "../middlewares/isAdmin.js";

const userRouter = express.Router();

//********** products **********
userRouter.route("/products").get(getProducts).post(
  authenticate,
  isAdmin,
  uploadFile,
  validateSchema(productSchema),

  createProduct
);
userRouter.get("/product", getProducts);

//********** product categories **********
//! keep this above the :id route so "categories" is not treated as an id
userRouter.get("/products/categories", getProductCategories);

//********** favorite product  **********

// ! keep this above the :id route so "favorite" is not treated as an id

userRouter.route("/products/favorite").get(authenticate, getFavoriteProducts);

/* userRouter.post("/products/:id", authenticate, updateProduct);
userRouter.delete("/products/:id", authenticate, deleteProduct);
userRouter.put("/products/:id", authenticate, updateProductRating);
 */
userRouter
  .route("/products/:id")
  .get(authenticate, getProduct)
  .delete(authenticate, deleteProduct)
  .put(authenticate, uploadFile, validateSchema(productSchema), updateProduct);

userRouter.route("/products/:id/rating").put(authenticate, updateProductRating);

userRouter.put("/products/:id/reduce-stock", authenticate, updateProductStock);

//********** favorite product  **********

// ! keep this above the :id route so "favorite" is not treated as an id

/* userRouter.route("/products/favorite").get(authenticate, getFavoriteProducts); */

userRouter
  .route("/products/:id/favorite")
  .put(authenticate, updateProductFavorite);

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

userRouter
  .route("/cart/create-checkout-session")
  .post(authenticate, createCheckoutSession);

//********** orders **********

userRouter
  .route("/orders")
  .get(authenticate, getOrders)
  .post(authenticate, createOrder);

userRouter.route("/admin/orders").get(authenticate, isAdmin, getAllOrders);

userRouter
  .route("/admin/orders/:id")
  .put(authenticate, isAdmin, updateOrderStatus);

userRouter.route("/orders/:id/invoice").get(authenticate, getOrderInvoice);

export default userRouter;
