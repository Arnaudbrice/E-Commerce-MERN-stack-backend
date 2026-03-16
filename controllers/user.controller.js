import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import User from "../models/User.js";

import chalk from "chalk";

import fs from "fs";
import path, { sep } from "path";
import PDFDocument from "pdfkit";
import Stripe from "stripe";
import { fileURLToPath } from "url";
import Order from "../models/Order.js";
import Review from "../models/Review.js";
import mongoose from "mongoose";
import { getPagination } from "../utils/pagination.js";

import sanitizeHtml from "sanitize-html";
import nodemailer from "nodemailer";

//! return a cross-platform valid absolute path to the current file (import.meta.url returns full url of the current file)-> /Users/Arnaud/Desktop/wdg23/Project-Mern-stack-e-commerce/E-Commerce-MERN-stack-backend/controllers/user.controller.js
const __filename = fileURLToPath(import.meta.url);
// return the directory name of the absolute path to the current file->/Users/Arnaud/Desktop/wdg23/Project-Mern-stack-e-commerce/E-Commerce-MERN-stack-backend/controllers
const __dirname = path.dirname(__filename);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const itemPerPage = 10; //display 10 products per page

/****************************************
 *           products
 ****************************************/

//********** POST /users/products **********
export const createProduct = async (req, res) => {
  const userId = req.user._id;
  /*    console.log("hello");
  console.log("req", req.body);
  console.log("req file", req.file); */
  const { title, price, weight, description, category, stock } = req.body;

  // get the secure url of the uploaded image from cloudinary storage (after successfully uploading the image to cloudinary storage)
  const imageUrl = req.file.secure_url;

  const product = await Product.create({
    title,
    price,
    weight,
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
  const { search, page } = req.query;

  const currentPageNumber = Number(page) || 1;

  console.log("currentPageNumber", currentPageNumber);

  let query = {};
  if (search) {
    // i means case insensitive
    // search in title or description fields using regex with i option for case insensitive ( to count only documents where the search term is present in the title or description field ) -> regex for partial matches
    query = {
      $or: [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ],
    };

    /* query = {
      $text: { $search: search }, //MongoDB's text indexes are case-insensitive by default and faster than $regex, but used for exact matches only
    }; */
  }

  const numberOfProducts = await Product.countDocuments(query);
  console.log("numberOfProducts", numberOfProducts);

  const numberOfPages = Math.ceil(numberOfProducts / itemPerPage);

  const paginationArray = getPagination(currentPageNumber, numberOfPages, 5);
  console.log("paginationArray", paginationArray);

  // get all products that match the search query (if search term is provided), if not provided, get all products
  const products = await Product.find(query);

  // get all products that match the search query (if search term is provided), if not provided, get all products
  const productsPerPage = await Product.find(query)
    .skip((currentPageNumber - 1) * itemPerPage)
    .limit(itemPerPage);

  // const products = await Product.find();
  console.log("products", products.length);

  res.json({
    products,
    productsPerPage,
    paginationArray,
    currentPageNumber,
  });
};

//********** GET /users/products/:id **********
export const getProduct = async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(id).populate("reviews");
  if (!product) {
    throw new Error("Product not found", { cause: 404 });
  }
  console.log(chalk.blue("product", product));
  res.json(product);
};

//********** DELETE /users/products/:id **********
export const deleteProduct = async (req, res) => {
  const { id } = req.params;

  const deletedProduct = await Product.findByIdAndDelete(id); //new:true not needed here, since the deleted product will be returned

  if (!deletedProduct) {
    throw new Error("Product not found", { cause: 404 });
  }

  // Delete all reviews associated with the deleted product
  await Review.deleteMany({ product: deletedProduct._id });

  // res.status(204).end();//204 means no content to be send back (nice for delete or update)
  res.status(200).json({ deletedProduct });
};

//********** PUT /users/products/:id **********

export const updateProduct = async (req, res) => {
  const { id } = req.params;

  console.log("req.body in updateProduct", req.body);
  let update = { ...req.body };
  console.log("update", update);

  /*  update.weight = parseFloat(update.weight);
  update.price = parseFloat(update.price);
     update.stock = parseInt(update.stock); */

  // get the secure url of the uploaded image from cloudinary storage (after successfully uploading the image to cloudinary storage)
  const imageUrl = req.file?.secure_url;

  if (imageUrl) {
    update.image = imageUrl;
  }

  const updatedProduct = await Product.findByIdAndUpdate(id, update, {
    new: true,
  });

  if (!updatedProduct) {
    throw new Error("Product not found", { cause: 404 });
  }

  console.log("updatedProduct", updatedProduct);

  res.status(200).json(updatedProduct);
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

    { new: true, runValidators: true }, // {new: true} returns the updated document
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

//********** handle rating **********
//********** PUT /users/products/:id/rating **********
export const updateProductRating = async (req, res) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { rating, comment } = req.body;
  // let isRatingExists = false;

  console.log("rating", rating);
  console.log("comment", comment);

  console.log("id", id);
  console.log("userId", userId);

  /*
MongoDB's dot notation allows querying fields within array subdocuments. For example, `{ userId: userId, "products.productId": id }` retrieves an order where any product in the `products` array has `productId` equal to `id`. The `$elemMatch` operator is only necessary when applying multiple conditions to the same array element, such as requiring both `productId === id` and `quantity > 1`. */
  const existOrderForUser = await Order.findOne({
    userId: userId,
    "products.productId": id,
  });
  if (!existOrderForUser) {
    throw new Error(
      "No Order Found, You Can Only Rate Products That You Have Purchased",
      { cause: 404 },
    );
  }

  const product = await Product.findById(id).populate("reviews");

  if (!product) {
    throw new Error("Product not found", { cause: 404 });
  }

  const review = {
    product: product._id,
    user: userId, // Passing a string, Mongoose will cast it to ObjectId
    rating,
    comment,
  };
  const existingReview = product.reviews.find(
    (review) => review.user.toString() === userId.toString(),
  );
  console.log("existingReview------------------", existingReview);

  if (existingReview) {
    /*  existingReview.rating = rating;
    existingReview.comment = comment; */
    // !The $[review] is a placeholder for the specific array element that matches the condition in arrayFilters.

    console.log("existingReview", existingReview);

    /*  await Product.findByIdAndUpdate(
      id,
      {
        $set: {
          "reviews.$[review].rating": rating,
          "reviews.$[review].comment": comment,
        },
      },
      {
        arrayFilters: [{ "review.user": userObjectId }],
      }
    ); */
    /*  await Review.findOneAndUpdate(
      { product: productObjectId, user: userObjectId },
      { $set: { rating, comment } }
    ); */

    const updatedReview = await Review.findByIdAndUpdate(
      existingReview._id,
      {
        $set: { rating, comment },
      },
      { new: true },
    );

    for (const review of product.reviews) {
      if (review._id.toString() === existingReview._id.toString()) {
        // object mutation
        review.rating = updatedReview.rating;
        review.comment = updatedReview.comment;
      }
    }

    // isRatingExists = true;
  } else {
    const newReview = await Review.create(review);

    console.log("newReview", newReview);

    // update the populated product object with the new review
    product.reviews.push(newReview);
    /* product.reviews.push(newReview);
    await product.save(); */
  }

  console.log(chalk.magenta("product.reviews", product.reviews));
  // recalculate average rating of the populated product object
  product.averageRating =
    Math.round(
      parseFloat(
        product?.reviews?.reduce(
          (accumulator, currentReview) => accumulator + currentReview.rating,
          0,
        ) / product.reviews.length,
      ).toFixed(1) * 2,
    ) / 2;
  console.log("product.averageRating", product.averageRating);

  const updatedProduct = await product.save();

  console.log(chalk.red("updatedProduct", updatedProduct));

  res.status(200).json(updatedProduct);
  // res.status(200).json({ updatedProduct, isRatingExists });
};

/****************************************
 *           order
 ****************************************/

//********** GET users/admin/orders **********
export const getAllOrders = async (req, res) => {
  // Optionally: Add admin authentication/authorization check here

  const numberOfOrders = await Order.countDocuments();

  const currentPageNumber = Number(req.query.page) || 1;
  const itemPerPage = 10;
  const numberOfPages = Math.ceil(numberOfOrders / itemPerPage);

  const paginationArray = getPagination(currentPageNumber, numberOfPages, 5);

  /*   const ordersForCurrentPage = await Order.find()
    .populate("products.productId")
    .populate("userId", "email defaultAddress") // Optionally populate user info
    .skip((currentPageNumber - 1) * itemPerPage)
    .limit(itemPerPage);
 */

  const ordersForCurrentPage = await Order.find()
    .populate("products.productId")
    .populate({
      path: "userId",
      select: "email defaultAddress",
      populate: { path: "defaultAddress" },
    }) // Optionally populate user info
    .skip((currentPageNumber - 1) * itemPerPage)
    .limit(itemPerPage);

  console.log("ordersForCurrentPage", ordersForCurrentPage);
  res.status(200).json({
    orders: ordersForCurrentPage,
    paginationArray,
    currentPageNumber,
    numberOfPages,
  });
};

//********** GET /users/orders **********
export const getOrders = async (req, res) => {
  const userId = req.user._id;

  // counts the number of orders for the current user
  const numberOfOrders = await Order.countDocuments({ userId });

  console.log("numberOfOrders", numberOfOrders);

  const currentPageNumber = Number(req.query.page) || 1;
  const numberOfPages = Math.ceil(numberOfOrders / itemPerPage);

  const paginationArray = getPagination(currentPageNumber, numberOfPages, 5);
  console.log("paginationArray", paginationArray);

  const ordersForCurrentPage = await Order.find({ userId: userId })
    .populate("products.productId")
    .skip((currentPageNumber - 1) * itemPerPage)
    .limit(itemPerPage);

  const orders = await Order.find({ userId: userId }).populate(
    "products.productId",
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

  const ordersProductsForCurrentPage = ordersForCurrentPage.map((order) => {
    return {
      _id: order._id,
      products: order.products,
      status: order.status,
      createdAt: order.createdAt,
      shippingAddress: order.shippingAddress,
      userId: order.userId,
      shippingCosts: order.shippingCosts,
    };
  });

  console.log("ordersProducts", ordersProducts);

  res.json({
    ordersProducts,
    ordersProductsForCurrentPage,
    paginationArray,
    currentPageNumber,
  });
};

export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  console.log("id", id);
  console.log("status", status);

  const updatedOrder = await Order.findByIdAndUpdate(
    id,
    { status },
    { new: true, runValidators: true },
  );

  if (!updatedOrder) {
    throw new Error("Order not found", { cause: 404 });
  }

  res.status(200).json({
    message: "Order status updated successfully",
    status: updatedOrder.status,
  });
};

//********** POST /users/orders **********
export const createOrder = async (req, res) => {
  const userId = req.user._id;

  console.log("userId in createOrder", userId);
  const { shippingAddress, shippingCosts } = req.body;

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
  let order;
  if (user.role === "admin") {
    order = await Order.create({
      userId: userId,
      products: cartItems,
      shippingAddress,
      shippingCosts,
      isAdminOrder: true, // by setting this flag, It will ignore the shippingAddress field firstName and lastName for admin orders
    });
  } else {
    order = await Order.create({
      userId: userId,
      products: cartItems, // cartItems is a copy of the cart's products at order time
      shippingAddress,
      shippingCosts,
    });
  }

  console.log(chalk.green("Order created successfully:"), order);

  // Decrement stock of the successfully ordered products in parallel
  await Promise.all(
    order.products.map(
      async (item) =>
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: -item.quantity } },
          { new: true },
        ),
    ),
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
export const getOrderInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    const admin = await User.findOne({ role: "admin" }).populate(
      "defaultAddress",
    );
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    console.log("order in getOrderInvoice", order);

    let total = 0;
    const invoiceName = `invoice-${order._id}.pdf`;

    // Prepare PDF config before streaming
    /*  const fontPathTitle = path.join(__dirname, "..", "font", "Outfit-Bold.ttf");
    const fontPathText = path.join(
      __dirname,
      "..",
      "font",
      "Outfit-Regular.ttf"
    ); */

    //! pdf configuration (add content to the PDF)
    const fontPathTitle = path.join(process.cwd(), "font", "Outfit-Bold.ttf");
    const fontPathText = path.join(process.cwd(), "font", "Outfit-Regular.ttf");

    // Tell the client the response body is PDF content
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "filename=" + invoiceName);

    const pdf = new PDFDocument({ size: "A4", margin: 50 });

    // Avoid bubbling stream errors to the JSON error handler
    pdf.on("error", (err) => {
      console.error("PDF generation error:", err);
      // End the response to avoid incomplete chunked encoding
      if (!res.headersSent) {
        res.status(500).end();
      } else {
        res.end();
      }
    });

    pdf.pipe(res);

    addHeader(pdf, fontPathText, order._id, order.createdAt, order, admin);

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
      const rowHeight = 20;

      if (pdf.y + rowHeight >= pdf.page.height - pdf.page.margins.bottom) {
        pdf.addPage();
      }

      // Try to render image if URL present
      if (product.image) {
        try {
          const response = await fetch(product.image);
          if (!response.ok)
            throw new Error(`Failed to fetch image ${response.status}`);
          const arrayBuf = await response.arrayBuffer();
          const imgBuffer = Buffer.from(arrayBuf);

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
      total =
        total +
        parseFloat(product.price + order.shippingCosts) * product.quantity;
      pdf.moveDown();
    }

    pdf.text(
      `Shipping Costs: ${parseFloat(order.shippingCosts).toFixed(2) + " €"}`,
      {
        align: "center",
      },
    );
    pdf.moveDown();
    pdf
      .font(fontPathTitle)
      .fontSize(20)
      .text(`Total: ${total.toFixed(2)}${" €"}`, {
        align: "center",
      });

    // separate products with a line
    pdf
      .moveTo(50, pdf.y) // start x, current y
      .lineTo(550, pdf.y) // end x, same y
      .strokeColor("#cccccc") // light gray
      .lineWidth(1)
      .stroke();
    addFooter(pdf, fontPathText);

    pdf.end();
  } catch (err) {
    if (res.headersSent) {
      console.error("Invoice generation failed after streaming started:", err);
      res.end();
      return;
    }
    next(err);
  }
};

const addHeader = (doc, fontPath, invoiceId, invoiceDate, order, admin) => {
  doc.font(fontPath);
  // Company name / logo area
  doc
    .fontSize(10)
    .text(`${order?.shippingAddress?.companyName || ""}`, { align: "left" });

  doc.moveDown(0.2);

  doc
    .fontSize(10)
    .text(
      `${order?.shippingAddress?.firstName || ""} ${order?.shippingAddress?.lastName || ""}`,
      { align: "left" },
    );

  doc.moveDown(0.2);
  doc
    .fontSize(10)
    .text(`${order?.shippingAddress?.streetAddress || ""}`, { align: "left" })
    .text(
      `${order?.shippingAddress?.zipCode + " " || ""} ${order?.shippingAddress?.city || ""}`,
      { align: "left" },
    );

  doc.moveUp(4); // move cursor up to same line height as title
  // doc.fontSize(32).text("Order", {
  //   align: "right",
  // });

  doc
    .fontSize(10)
    .text(`${admin?.defaultAddress?.companyName || ""}`, { align: "right" });

  doc.moveDown(0.2);
  doc
    .fontSize(10)
    .text(`${admin?.defaultAddress?.streetAddress || ""}`, { align: "right" })
    .text(
      `${admin?.defaultAddress?.zipCode + " " || ""} ${admin?.defaultAddress?.city || ""}`,
      { align: "right" },
    )
    .text("support@yourcompany.com", { align: "right" });

  const orderDateText =
    invoiceDate ? new Date(invoiceDate).toLocaleString() : "Unknown";

  doc.moveDown(0.2);

  doc
    .fontSize(10)
    .text(`Order ID: ${invoiceId}`, { align: "right" })
    .text(`Order Date: ${orderDateText}`, { align: "right" });
  doc.moveDown(0.2);
};

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
    },
  );
}

/****************************************
 *           category
 ****************************************/

//********** GET /users/products/categories **********
export const getProductCategories = async (req, res) => {
  const categories = Product.schema.path("category").enumValues;

  // console.log("categories", categories);

  res.json(categories);
};

/****************************************
 *           favorite
 ****************************************/

export const updateProductFavorite = async (req, res) => {
  const { isFavorite } = req.body;
  const { id } = req.params;

  console.log("productId", id);

  const updatedProduct = await Product.findByIdAndUpdate(
    id,
    { $set: { isFavorite } },
    { new: true },
  ); //return the updated document
  if (!updatedProduct) {
    throw new Error("Product not found", { cause: 404 });
  }
  res.status(200).json(updatedProduct);
};

export const getFavoriteProducts = async (req, res) => {
  const favoriteProducts = await Product.find({ isFavorite: true });

  const numberOfFavoriteProducts = favoriteProducts.length;

  res.json({ favoriteProducts, numberOfFavoriteProducts });
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
    "products.productId",
  ); //Populating productId for each item within the products array

  if (!cart) {
    // throw new Error("Cart not found", { cause: 404 });
    res.json([]);
  }

  console.log("########cart########", cart);
  res.json(cart);
};

//********** GET /users/cart/products/:id **********
export const getProductFromCart = async (req, res) => {
  const userId = req.user._id;
  const productId = req.params.id;
  console.log("productId here again", productId);

  const cart = await Cart.findOne({ userId: userId }).populate(
    "products.productId",
  ); //Populating productId for each item within the products array

  if (!cart) {
    // throw new Error("Cart not found", { cause: 404 });
    res.json([]);
  }

  const product = cart.products.find(
    (item) => item.productId._id.toString() === productId.toString(),
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

  console.log("product in addProductToCart", product);
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
    (product) => product.productId.toString() === productId.toString(),
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
      weight: product.weight,
      description: product.description,
      image: product.image,
    });
  }

  await cart.save();

  //!populate product details before sending response(populate is always called on the mongoose document)
  const populatedCart = await Cart.findOne({ userId: userId }).populate(
    "products.productId",
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
    { new: true },
  );

  if (!updatedCart) {
    throw new Error("Product cannot be removed from cart", { cause: 404 });
  }

  console.log(
    chalk.yellow("Product removed from cart successfully!"),
    updatedCart,
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
    { new: true },
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
  const { cartList, shippingCosts } = req.body;
  console.log("cartList", cartList);
  const userId = req.user._id;

  // Create line items from cart products
  const lineItems = cartList.products.map((item) => {
    return {
      price_data: {
        currency: "eur",
        product_data: {
          name: item.productId.title,
          images: [item.productId.image],
          description: item.productId.description,
        },
        unit_amount: Math.round(item.productId.price * 100), // convert to cents
      },
      quantity: item.quantity,
    };
  });

  // Add shipping costs as a separate line item
  if (shippingCosts && shippingCosts > 0) {
    lineItems.push({
      price_data: {
        currency: "eur",
        product_data: {
          name: "Shipping Costs",
          description: "Delivery fee",
        },
        unit_amount: Math.round(shippingCosts * 100), // convert to cents
      },
      quantity: 1,
    });
  }
  // const user = await User.findById(userId);
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card", "klarna", "sepa_debit", "sofort", "paypal"],

    mode: "payment",
    /*     customer_email: user?.email || "", // Fill in for Klarna/PayPal */
    // important: Metadata for the  Webhook
    metadata: {
      userId: userId.toString(),
      cartId: cartList._id, // If we have a cart ID in the DB
    },
    line_items: lineItems,

    // Billing Address Collection for Klarna often required
    // billing_address_collection: "required",
    success_url: `${process.env.FRONTEND_BASE_URL}/cart?success=true`, // Redirect to cart page after payment
    cancel_url: `${process.env.FRONTEND_BASE_URL}/cart?canceled=true`, // Redirect to cart page after payment
  });

  res.status(200).json({ url: session.url });
};

//********** Contact Messages **********
/**
 * @desc Handles contact message creation and sends formatted email
 * @route POST /users/contact-messages
 * @access Public
 */
export const createContactMessage = async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    throw new Error("Please fill in all required fields.", { cause: 400 });
  }

  // Sanitize user input to prevent XSS
  const cleanName = sanitizeHtml(name, {
    allowedTags: [],
    allowedAttributes: {},
  });
  const cleanMessage = sanitizeHtml(message, {
    allowedTags: ["p", "br", "b", "i"],
    allowedAttributes: {},
  });
  const cleanSubject = sanitizeHtml(subject, {
    allowedTags: [],
    allowedAttributes: {},
  });

  const transporter = nodemailer.createTransport({
    service: "gmail",
    port: 587,
    auth: {
      user: process.env.GMAIL_EMAIL,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const msg = {
    from: `Bon Marché <${process.env.GMAIL_EMAIL}>`,
    to: `Bon Marché <${process.env.GMAIL_EMAIL}>`,

    replyTo: email,
    subject: `Bon Marché - Contact Form: ${cleanSubject}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9f9f9;
            padding: 20px;
            margin: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            padding: 30px;
          }
          .header {
            border-bottom: 3px solid #ea580c;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .header h2 {
            margin: 0;
            color: #ea580c;
            font-size: 24px;
            font-weight: 700;
          }
          .field {
            margin-bottom: 20px;
          }
          .field-label {
            font-weight: 600;
            color: #555;
            margin-bottom: 5px;
            font-size: 14px;
          }
          .field-value {
            background-color: #f5f5f5;
            padding: 12px;
            border-radius: 4px;
            border-left: 3px solid #ea580c;
            color: #333;
            word-break: break-word;
            font-weight: 400;
          }
          .message-content {
            background-color: #f0f7ff;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #ea380c;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-weight: 400;
          }
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>📧 New Contact Message</h2>
          </div>

          <div class="field">
            <div class="field-label">From</div>
            <div class="field-value">${cleanName} &lt;${email}&gt;</div>
          </div>

          <div class="field">
            <div class="field-label">Subject</div>
            <div class="field-value">${cleanSubject}</div>
          </div>

          <div class="field">
            <div class="field-label">Message</div>
            <div class="message-content">${cleanMessage}</div>
          </div>

          <div class="footer">
            <p>This email was sent from the Bon Marché contact form.</p>
            <p>To reply, use the "Reply" button or email <strong>${email}</strong> directly.</p>
             <p>&copy;${new Date().getFullYear()} Bon Marché. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(msg);
  res.status(200).json({ message: "Contact message sent successfully" });
};

export const sendStatusUpdateEmail = async (req, res) => {
  const { newStatus } = req.body;
  const { id } = req.params;

  // find order with id and retrieves email of the user who made the order
  const order = await Order.findById(id)
    .populate("userId")
    .populate(
      "products.productId",
      "title price image description price quantity",
    )
    .populate("shippingAddress");
  const userEmail = order.userId.email;

  console.log("order in sendStatusUpdateEmail", order);
  const firstName =
    order?.shippingAddress?.firstName ||
    order?.shippingAddress?.companyName ||
    "" + " " + order?.defaultAddress?.firstName ||
    "";
  const lastName = order?.shippingAddress?.lastName || "";
  const name = `${firstName} ${lastName}`.trim(); // trim removes extra spaces

  const productTablerows = [];
  for (const product of order.products) {
    productTablerows.push(
      `<tr>
        <td>${product.productId.title}</td>
        <td>${product.quantity}</td>
        <td>
          ${parseFloat(product.price * product.quantity).toFixed(2) + " €"}
        </td>
      </tr>`,
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    port: 587,
    auth: {
      user: process.env.GMAIL_EMAIL,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const msg = {
    from: `Bon Marché <${process.env.GMAIL_EMAIL}>`,
    to: `${userEmail}`,
    replyTo: `${userEmail}`,
    subject: `Bon Marché - Order Status Update: ${newStatus}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f9f9f9;
            padding: 20px;
            margin: 0;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            padding: 30px;
          }
          .header {
            border-bottom: 3px solid #ea580c;
            padding-bottom: 15px;
            margin-bottom: 20px;
          }
          .header h2 {
            margin: 0;
            color: #ea580c;
            font-size: 24px;
            font-weight: 700;
          }
          .field {
            margin-bottom: 20px;
          }
          .field-label {
            font-weight: 600;
            color: #555;
            margin-bottom: 5px;
            font-size: 14px;
          }


          .field-value {
            background-color: #f5f5f5;
            padding: 12px;
            border-radius: 4px;
            border-left: 3px solid #ea580c;
            color: #333;
            word-break: break-word;
            font-weight: 400;
          }
          .message-content {
            background-color: #f0f7ff;
            padding: 15px;
            border-radius: 4px;
            border-left: 4px solid #ea380c;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-weight: 400;
          }
          .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
     <body>
        <div class="container">
          <div class="header">
            <h2>📦 Order Status Update</h2>
          </div>

          <div class="field">
            <div class="field-label">Hello ${name}</div>
            <div class="field-value">
              <p>We have great news! Your order status has been updated to <strong>${newStatus}</strong>.</p>
            </div>
          </div>

          <div class="field">
            <div class="field-label">Order Details</div>
            <table>
              <thead>
                <tr style="text-align:center;display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; place-items: center;" >
                  <th>Product</th>
                  <th>Quantity</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                ${productTablerows.join("")}
              </tbody>
            </table>
          </div>

          <div class="footer">

            <p>Thank you for your order! </p>
            <p>&copy;${new Date().getFullYear()} Bon Marché. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  await transporter.sendMail(msg);
  res.status(200).json({ message: "Status update email sent successfully" });
};
