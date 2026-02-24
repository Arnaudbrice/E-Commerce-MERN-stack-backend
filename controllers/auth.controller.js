import User from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";
// nodejs built-in crypto module
import crypto from "crypto";
import mongoose from "mongoose";
import Address from "../models/Address.js";

//********** POST /auth/register **********

export const register = async (req, res) => {
  const { email, password } = req.body;

  //input validation is made by zod

  // check if the user already exists in the database
  const existingUser = await User.exists({ email });

  if (existingUser) {
    throw new Error("User already exists", { cause: 409 });
  }

  // hash the password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  // create a new user
  const user = await User.create({
    email: email,
    password: hashedPassword,
  });

  console.log("user", user);

  // convert the user document to an object to be able to delete the password property
  const newUser = user.toObject();

  // delete the password from the user object before sending the response back to the client
  delete newUser.password;

  console.log("newUser", newUser);

  res.json(newUser);
};

//********** POST /auth/login **********

export const login = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    throw new Error("Invalid Credentials", { cause: 400 });
  }

  // check if the password is correct
  const isValidPassword = await bcrypt.compare(password, user.password);

  if (!isValidPassword) {
    throw new Error("Invalid Password", { cause: 401 });
  }

  // define the payload
  const payload = {
    id: user._id,
    email: user.email,
  };

  // generate a JWT token based on the defined payload
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN + "d",
  });

  // convert the user document to an object to be able to delete the password property
  const userDoc = user.toObject();

  // delete the password from the user object before sending the response back to the client
  delete userDoc.password;

  //store the token in a cookie and set this cookie in the response header
  res.cookie("token", token, {
    httpOnly: true, //The cookie can’t be accessed by JavaScript (for security).
    secure: process.env.NODE_ENV === "production", //(in production) → The cookie is only sent over HTTPS.
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", //(in production) → Allows cross-site requests (needed if frontend and backend run on different domains).
  });

  // send the response back to the client including the cookie set in the response header
  res.json(userDoc);
};

//********** POST /auth/logout **********

export const logout = async (req, res) => {
  // clear the token within the cookie
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.status(204).json({ message: "Logged out successfully" });
};

/****************************************
 *           reset password
 ****************************************/

//********** POST /auth/mail-reset-password **********

export const sendMail = async (req, res) => {
  const { email } = req.body;

  console.log("email", email);

  if (!email) {
    throw new Error("Email is required", { cause: 400 });
  }

  //uses crypto module to create a random secured token consisting of 80 hexadecimal characters (Each byte is represented as two hexadecimal characters)
  const token = crypto.randomBytes(40).toString("hex");

  console.log("token", token);
  const user = await User.findOne({ email });

  if (!user) {
    throw new Error("User with the email address not found", { cause: 404 });
  }

  user.resetToken = token;
  user.resetTokenExpiration = new Date(Date.now() + 3600000); //3600000ms=3600s=60m=1h
  await user.save();

  // !api key should have full access in sendgrid
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // sgMail.setDataResidency("eu");
  // uncomment the above line if you are sending mail using a regional EU subuser

  const baseUrl = req.protocol + "://" + req.get("host");

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
    from: process.env.GMAIL_EMAIL, // Change to your recipient

    to: user.email,

    // cc: user.email,
    subject: "Fullstack E-commerce - Password reset request",

    html: `<p>Reset Your Password: <a href="${process.env.FRONTEND_BASE_URL}/reset-password/${token}"><strong>Click Here</strong></a></p>`, //html body
  };

  // await sgMail.send(msg);

  await transporter.sendMail(msg);
  res
    .status(200)
    .json({ message: "Email for resetting password sent successfully" });
};

//********** GET /auth/reset-password/:token **********
export const getResetPassword = async (req, res) => {
  const { token } = req.params;

  // ensure password reset page can be called only within the expiration time of the token
  const user = await User.findOne({
    resetToken: token,
    resetTokenExpiration: { $gt: new Date() },
  });

  if (!user) {
    throw new Error(
      "Invalid token, please send a new mail to reset your password",
      { cause: 404 }
    );
  }

  res.status(200).json(token);
};

//********** POST /auth/reset-password/:token **********
export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpiration: { $gt: new Date() },
  });

  // only reset the password if the token is valid
  if (!user) {
    throw new Error(
      "Invalid token, please send a new mail to reset your password",
      { cause: 404 }
    );
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  user.password = hashedPassword;
  user.resetToken = null;
  user.resetTokenExpiration = null;
  await user.save();

  res.status(201).json({ message: "Password reset successfully" });
};

/****************************************
 *           Profile
 ****************************************/
//********** Put /auth/profile **********

export const updateProfile = async (req, res) => {
  const userId = req.user._id;

  const {
    label,
    firstName,
    lastName,
    companyName,
    phone,
    streetAddress,
    city,
    state,
    zipCode,
    country,
  } = req.body;

  //  Get the user document (with addresses array)
  let user = await User.findById(userId)
    .populate("addresses")
    .populate("defaultAddress");

  //1- try to update the existing home address if the label is "Home" and if the user already has a home address, otherwise create a new address

  // !NOTE:$ allows US to update the fields of just that matched address.
  // Find the Address document for the user with label "Home" among user's addresses
  const address = await Address.findOne({
    _id: { $in: user.addresses },
    label: "Home",
  });
  // Update or create the address
  if (address) {
    address.firstName = firstName;
    address.lastName = lastName;
    address.companyName = companyName;
    address.phone = phone;
    address.streetAddress = streetAddress;
    address.city = city;
    address.state = state;
    address.zipCode = zipCode;
    address.country = country;
    await address.save();
  } else {
    // If not found, create a new Address and push its _id to the user

    const newAddress = await Address.create({
      label,
      firstName,
      lastName,
      companyName,
      phone,
      streetAddress,
      city,
      state,
      zipCode,
      country,
    });
    user = await User.findByIdAndUpdate(
      userId,
      {
        $push: { addresses: newAddress._id },
        $set: { defaultAddress: newAddress._id },
      },
      { new: true, runValidators: true }
    ).lean(); //to get a plain object instead of a mongoose document, so that we can delete the password property from the user object before sending the response back to the client
    if (!user) {
      // user not found
      throw new Error("User Not Found", { cause: 404 });
    }
    // remove password
    // const userWithoutPassword = user.toObject();
    delete user.password;
  }

  res.status(200).json({ user });
};

//********** POST /auth/shippingAddress **********
export const addShippingAddress = async (req, res) => {
  const userId = req.user._id;

  const { firstName, lastName, streetAddress, zipCode, city, state, country } =
    req.body;

  const newAddress = {
    firstName,
    lastName,
    streetAddress,
    zipCode,
    city,
    state,
    country,
  };

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $push: { addresses: newAddress },
    },
    {
      new: true,
      runValidators: true,
    }
  ).lean();

  if (!updatedUser) {
    throw new Error("User Not Found", { cause: 404 });
  }

  delete updatedUser.password;

  res.status(200).json({ user: updatedUser });
};

/****************************************
 *           auth me
 ****************************************/

//********** GET /auth/me **********
export const getMe = async (req, res) => {
  // from the authenticate middleware
  // we have access to the user object in the request object
  const { _id } = req.user;

  // populate addresses and defaultAddress
  const user = await User.findById(_id)
    .populate("addresses")
    .populate("defaultAddress")
    .lean();
  if (!user) {
    throw new Error("User Not Found", { cause: 404 });
  }

  res.json(user);
};
