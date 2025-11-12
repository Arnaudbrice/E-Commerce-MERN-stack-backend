import User from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Product from "../models/Product.js";
import Cart from "../models/Cart.js";

import chalk from "chalk";

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

//********** POST /users/products **********
export const createProduct = async (req, res) => {
  const userId = req.user._id;
  /*    console.log("hello");
  console.log("req", req.body);
  console.log("req file", req.file); */
  const { title, price, description, category, stock } = req.body;

  // get the secure url of the uploaded image from cloudinary storage
  const imageUrl = req.file.secure_url;

  const product = await Product.create({
    title,
    price,
    description,
    category,
    image: imageUrl,
    stock,
    userId,
  });

  res.status(201).json(product);
};

//********** GET /users/products **********
export const getProducts = async (req, res) => {
  const products = await Product.find();
  res.json(products);
};

//********** GET /users/products/:id **********
export const getProduct = async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(id);
  if (!product) {
    throw new Error("Product not found", { cause: 404 });
  }
  res.json(product);
};
//********** POST /users/products/:id **********
export const updateProduct = async (req, res) => {
  const { id } = req.params;

  const updatedProduct = await Product.findByIdAndUpdate(id, req.body, {
    new: true, //return the updated document
    runValidators: true, //runs mongoose validators
  });

  if (updatedProduct) {
    throw new Error("Product not found", { cause: 404 });
  }
  res.status(204).json(updatedProduct);
};

//********** DELETE /users/products/:id **********
export const deleteProduct = async (req, res) => {
  const { id } = req.params;

  const deletedProduct = await Product.findByIdAndDelete(id); //new:true not needed here, since the deleted product will be returned

  if (!deletedProduct) {
    throw new Error("Product not found", { cause: 404 });
  }

  res.status(204).json(deletedProduct);
};

//********** GET /users/products/categories **********
export const getProductCategories = async (req, res) => {
  const categories = await Product.schema.path("category").enumValues;

  res.json(categories);
};

// ################cart##################
//********** GET /users/cart **********
export const getCartProducts = async (req, res) => {
  const userId = req.user._id;
  /* const cart = await Cart.findOne({ userId: userId })
    .populate({
      path: 'products.productId',
      select: 'title price image' // Only populate title, price, and image fields of the product
    }) */

  const cart = await Cart.findOne({ userId: userId }).populate(
    "products.productId"
  ); //Populating productId for each item within the products array

  if (!cart) {
    // throw new Error("Cart not found", { cause: 404 });
    res.json([]);
  }
  res.json(cart);
};

//********** GET /users/cart/products/:id **********
export const getProductFromCart = async (req, res) => {
  const userId = req.user._id;
  const productId = req.params.id;
  console.log("productId here again", productId);

  const cart = await Cart.findOne({ userId: userId }).populate(
    "products.productId"
  ); //Populating productId for each item within the products array

  if (!cart) {
    // throw new Error("Cart not found", { cause: 404 });
    res.json([]);
  }

  const product = cart.products.find(
    (item) => item.productId._id.toString() === productId.toString()
  );

  if (!product) {
    throw new Error("Product not found", { cause: 404 });
  }

  console.log("founded product here", product);

  res.json(product);
};

//********** POST /users/cart **********
export const addProductToCart = async (req, res) => {
  const userId = req.user._id;
  const { productId, quantity } = req.body;

  if (!productId || !quantity || quantity < 1) {
    throw new Error("Product ID and valid quantity are required.", {
      cause: 400,
    });
  }

  //  Verify if the product exists
  const product = await Product.findById(productId);
  if (!product) {
    throw new Error("Product not found.", { cause: 404 });
  }

  let cart = await Cart.findOne({ userId: userId });

  if (!cart) {
    // Create a new cart if one doesn't exist for the user
    cart = new Cart({
      userId,
      products: [],
    });
  }

  // Check if product already in cart
  const productIndex = cart.products.findIndex(
    (product) => product.productId.toString() === productId.toString()
  );

  if (productIndex > -1) {
    // Update quantity if product already exists
    cart.products[productIndex].quantity = quantity;
  } else {
    cart.products.push({
      productId,
      quantity,
      title: product.title, // Snapshot product details
      price: product.price,
      description: product.description,
    });
  }

  await cart.save();

  //!populate product details before sending response(populate is always called on the mongoose document)
  const populatedCart = await Cart.findOne({ userId: userId }).populate(
    "products.productId"
  );

  console.log("populatedCart", populatedCart);

  res.status(201).json(populatedCart);
};

//********** DELETE /users/cart/products/:id **********
export const removeProductFromCart = async (req, res) => {
  const userId = req.user._id;
  const productId = req.params.id;
  const updatedCart = await Cart.findOneAndUpdate(
    { userId: userId },
    {
      $pull: { products: { productId } },
    },
    { new: true }
  );

  if (!updatedCart) {
    throw new Error("Product cannot be removed from cart", { cause: 404 });
  }

  console.log(
    chalk.yellow("Product removed from cart successfully!"),
    updatedCart
  );
  // console.log("updatedCart", updatedCart);

  // Populate product details before sending response
  // !note:populate is a method of the Mongoose Document class
  const populatedCart = await updatedCart.populate("products.productId");

  //! should return 200 OK with the updated cart
  res.status(200).json(populatedCart);
};

export const clearUserCart = async (req, res) => {
  const userId = req.user._id;

  const result = await Cart.findOneAndUpdate(
    { userId: userId },
    { $set: { products: [] } },
    { new: true }
  );

  if (!result) {
    throw new Error("Cart not found for this user.", { cause: 404 });
  }

  res.status(200).json({ message: "Cart cleared successfully!", cart: result });
};

/****************************************
 *           payment
 ****************************************/

//********** POST /users/cart/create-checkout-session **********

export const createCheckoutSession = async (req, res) => {
  const { cartList } = req.body;
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: cartList.products.map((item) => {
      return {
        price_data: {
          currency: "eur",
          product_data: {
            name: item.productId.title,
            images: [item.productId.image],
            description: item.productId.description,
          },
          unit_amount: Math.round(item.productId.price * 100), //convert to cents (e.g. 49.99 EUR = 4999 cents)
        },

        quantity: item.quantity,
      };
    }),

    success_url: `${process.env.FRONTEND_BASE_URL}?success=true`, // Redirect to cart page after payment
    cancel_url: `${process.env.FRONTEND_BASE_URL}?canceled=true`, // Redirect to cart page after payment
  });

  res.status(200).json({ url: session.url });
};
