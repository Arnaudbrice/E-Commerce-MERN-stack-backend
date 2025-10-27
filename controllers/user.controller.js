import User from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Product from "../models/Product.js";

//********** POST /user/products **********
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

//********** GET /user/products **********
export const getProducts = async (req, res) => {};
//********** POST /user/products/:id **********
export const updateProduct = async (req, res) => {};

//********** DELETE /user/products/:id **********
export const deleteProduct = async (req, res) => {};
