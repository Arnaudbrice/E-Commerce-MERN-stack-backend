import User from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Product from "../models/Product.js";
import Cart from "../models/Cart.js";

import chalk from "chalk";

import Stripe from "stripe";
import Order from "../models/Order.js";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import axios from "axios";

//! return a cross-platform valid absolute path to the current file (import.meta.url returns full url of the current file)-> /Users/Arnaud/Desktop/wdg23/Project-Mern-stack-e-commerce/E-Commerce-MERN-stack-backend/controllers/user.controller.js
const __filename = fileURLToPath(import.meta.url);
// return the directory name of the absolute path to the current file->/Users/Arnaud/Desktop/wdg23/Project-Mern-stack-e-commerce/E-Commerce-MERN-stack-backend/controllers
const __dirname = path.dirname(__filename);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/****************************************
 *           products
 ****************************************/

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

  // res.status(204).end();//204 means no content to be send back (nice for delete or update)
  res.status(200).json(deletedProduct);
};

//********** PUT /users/products/:id/reduce-stock **********
export const updateProductStock = async (req, res) => {
  const { id } = req.params;
  const { quantity } = req.body;
  const userId = req.user._id;

  // const product = await Product.findOne({ _id: id });

  const product = await Product.findByIdAndUpdate(
    id,
    { $inc: { stock: -quantity } }, //! Use $inc to decrement 'stock' by 'quantity' and stock:quantity for incrementation

    { new: true, runValidators: true } // {new: true} returns the updated document
  );
  if (!product) {
    throw new Error("Product Not Found", { cause: 404 });
  }

  console.log(chalk.yellow("product after payment"), product);
  // decrease stock
  /* product.stock -= quantity;
  await product.save(); */
  res.status(200).json({ message: "Product Stock Updated", product }); //204 means no content to be send back (nice of delete and update)
  /*   res.status(201).json({ message: "Product Stock Updated", product }); */

  res.redirect("/orders");
};

/****************************************
 *           order
 ****************************************/

//********** GET /users/orders **********
export const getOrders = async (req, res) => {
  const userId = req.user._id;

  const orders = await Order.find({ userId: userId }).populate(
    "products.productId"
  ); //!populate every productId in the products array

  if (!orders.length) {
    /*   throw new Error("No orders found for this user", { cause: 404 }); */
    res.status(200).json([]);
    return;
  }

  // array of populated products arrays
  const ordersProducts = orders.map((order) => [
    { id: order._id, products: order.products },
  ]);

  console.log("ordersProducts", ordersProducts);

  res.json(ordersProducts);
};

//********** POST /users/orders **********
export const createOrder = async (req, res) => {
  const userId = req.user._id;

  console.log("userId in createOrder", userId);

  // !note: after populating cartId, cartId becomes a Cart document that can be save using user.cartId.save()

  /*   const userFound = await User.findOne({ _id: userId });

  const cart = await Cart.findOne({ userId: userId });
  userFound.cartId = cart._id;
  await userFound.save();
  console.log("userFound after populated cartId", userFound); */

  const user = await User.findById(userId).populate("cartId");

  let cart = user?.cartId;

  if (!cart) {
    cart = await Cart.findOne({ userId }); // fallback
    if (!cart) {
      throw new Error("User or cart not found", { cause: 404 });
    }
  }

  /* if (!user || !user.cartId) {
    throw new Error("User or cart not found", { cause: 404 });
  }
 */
  // const cart = user.cartId;

  if (!cart.products || cart.products.length === 0) {
    throw new Error("Cart is empty, cannot create order", { cause: 400 });
  }

  const cartItems = cart.products.map((item) => {
    return {
      productId: item.productId,
      image: item.image,
      title: item.title,
      description: item.description,
      price: item.price,
      quantity: item.quantity,
    };
  });

  // create order
  const order = await Order.create({
    userId: userId,
    products: cartItems, // cartItems is a copy of the cart's products at order time
  });

  console.log(chalk.green("Order created successfully:"), order);

  // Decrement stock of the successfully ordered products in parallel
  await Promise.all(
    order.products.map(
      async (item) =>
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: -item.quantity } },
          { new: true }
        )
    )
  );

  console.log("order.products after stock update", order.products);

  /*    //!solution1: Refetch cart right before clearing to avoid stale __v
  const freshCart = await Cart.findById(cart._id);
  freshCart.products = [];
  await freshCart.save();
 */
  // !solution2: Use updateOne/findByIdAndUpdate instead of save() to avoid stale __v (Verwenden Sie updateOne/findByIdAndUpdate statt save(), um veraltete document version number __v zu vermeiden)

  // Clear user cart after successful order creation and product stock update
  /*   await Cart.updateOne({ _id: cart._id }, { $set: { products: [] } }); */

  await Cart.findByIdAndUpdate(cart._id, { $set: { products: [] } });
  res.status(201).json(order);
};

//********** GET /users/orders/:id/invoice **********
export const getOrderInvoice = async (req, res) => {
  const { id } = req.params;
  const order = await Order.findById(id);
  if (!order) {
    throw new Error("Order not found", { cause: 404 });
  }

  const invoiceName = `invoice-${order._id}.pdf`;

  // !process.cwd() returns the directory your Node process was started from
  const invoiceDir = path.join(process.cwd(), "data", "invoices");
  const invoicePath = path.join(process.cwd(), "data", "invoices", invoiceName);

  // create invoice directory if it doesn't exist
  if (!fs.existsSync(invoiceDir)) {
    fs.mkdirSync(invoiceDir, { recursive: true });
  }

  // Tell the client the response body is PDF content
  res.setHeader("Content-Type", "application/pdf");

  // to download directly instead of just opening the file in a new tab (to open it in the browser replace attachment with inline)
  res.setHeader("Content-Disposition", "inline;filename=" + invoiceName);

  // create PDF document
  const pdf = new PDFDocument({ size: "A4", margin: 50 });

  const fileStream = fs.createWriteStream(invoicePath);
  // !Pipe the stream AFTER setting the response headers
  // send the generated PDF data as response back to the client
  pdf.pipe(fileStream);
  pdf.pipe(res);

  //! pdf configuration (add content to the PDF)
  const fontPathTitle = path.join(process.cwd(), "font", "Outfit-Bold.ttf");
  const fontPathText = path.join(process.cwd(), "font", "Outfit-Regular.ttf");

  addHeader(pdf, fontPathText, order._id, order.createdAt);

  // pdf.font(fontPath).fontSize(40).text("Invoice", { align: "center" });
  pdf
    .font(fontPathTitle)
    .fontSize(20)
    .text("Invoice", { align: "center", underline: true });
  pdf.moveDown();
  pdf.font(fontPathText).fontSize(12);

  pdf.moveDown();
  // separate products with a line
  pdf
    .moveTo(50, pdf.y) // start x, current y
    .lineTo(550, pdf.y) // end x, same y
    .strokeColor("#cccccc") // light gray
    .lineWidth(1)
    .stroke();
  pdf.moveDown();

  for (const product of order.products) {
    /* pdf.image(product.image, {
      width: 100,
      height: 100,
    });
 */
    //! add new page if the current row height exceeds the page height(if the current page is full)
    const rowHeight = 20;

    if (pdf.y + rowHeight >= pdf.page.height - pdf.page.margins.bottom) {
      pdf.addPage();
    }
    // Try to render image if URL present
    if (product.image) {
      try {
        const response = await axios.get(product.image, {
          responseType: "arraybuffer",
        });
        const imgBuffer = Buffer.from(response.data);

        pdf.image(imgBuffer, {
          width: 80,
          height: 80,
        });
        pdf.moveDown();
      } catch (err) {
        console.error("Failed to load product image:", product.image, err);
        pdf.fontSize(8).text("[Image unavailable]");
        pdf.moveDown();
      }
    }

    pdf.moveDown();
    pdf.text(`Product: ${product.title} `, {
      width: 410,
      align: "left",
    });
    pdf.moveDown();
    pdf.text(`Quantity: ${product.quantity}`, {
      width: 410,
      align: "left",
    });
    pdf.moveDown();
    pdf.text(`Price: ${parseFloat(product.price).toFixed(2) + " €"}`, {
      width: 410,
      align: "left",
    });
    pdf.moveDown();

    // separate products with a line
    pdf
      .moveTo(50, pdf.y) // start x, current y
      .lineTo(550, pdf.y) // end x, same y
      .strokeColor("#cccccc") // light gray
      .lineWidth(1)
      .stroke();
    pdf.moveDown();
  }

  addFooter(pdf, fontPathText);

  pdf.end();
};

function addHeader(doc, fontPath, invoiceId, invoiceDate) {
  doc.font(fontPath);
  // Company name / logo area
  doc.fontSize(24).text("Bon Marché", { align: "left" });

  doc.moveDown(0.2);
  doc
    .fontSize(10)
    .text("Street Address 123", { align: "left" })
    .text("12345 City, Country", { align: "left" })
    .text("support@yourcompany.com", { align: "left" });

  doc.moveUp(4); // move cursor up to same line height as title
  doc.fontSize(32).text("INVOICE", {
    align: "right",
  });
  doc
    .fontSize(10)
    .text(`Invoice ID: ${invoiceId}`, { align: "right" })
    .text(`Invoice Date: ${invoiceDate}`, { align: "right" });
  doc.moveDown(2);

  doc.moveDown();
}

function addFooter(doc, fontPath) {
  const bottom = doc.page.height - doc.page.margins.bottom;

  doc.font(fontPath).fontSize(8).fillColor("#888888");

  doc.text("Thank You For Your Payment!", doc.page.margins.left, bottom - 40, {
    align: "center",
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
  });

  doc.text(
    " Please contact us if you have any questions.",
    doc.page.margins.left,
    bottom - 25,
    {
      align: "center",
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    }
  );
}

/****************************************
 *           category
 ****************************************/

//********** GET /users/products/categories **********
export const getProductCategories = async (req, res) => {
  const categories = await Product.schema.path("category").enumValues;

  res.json(categories);
};

/****************************************
 *           cart
 ****************************************/
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
    cart = await Cart.create({
      userId,
      products: [],
    });
    // persist the cart reference on the user so late populates works
    await User.findByIdAndUpdate(userId, { cartId: cart._id });
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
      image: product.image,
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

//********** DELETE /users/cart/clear **********
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
  const userId = req.user._id;
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

    success_url: `${process.env.FRONTEND_BASE_URL}/cart?success=true`, // Redirect to cart page after payment
    cancel_url: `${process.env.FRONTEND_BASE_URL}/cart?canceled=true`, // Redirect to cart page after payment
  });

  res.status(200).json({ url: session.url });
};
