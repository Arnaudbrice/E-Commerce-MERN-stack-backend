import User from "../models/User.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import sgMail from "@sendgrid/mail";
// nodejs built-in crypto module
import crypto from "crypto";

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
    expiresIn: process.env.JWT_REXPIRES_IN + "d",
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

  if (!email) {
    throw new Error("Email is required", { cause: 400 });
  }

  //uses crypto module to create a random secured token consisting of 80 hexadecimal characters (Each byte is represented as two hexadecimal characters)
  const token = crypto.randomBytes(40).toString("hex");

  const user = await User.findOne({ email });

  if (!user) {
    throw new Error("User with the email address not found", { cause: 404 });
  }

  user.resetToken = token;
  user.resetTokenExpiration = new Date(Date.now() + 3600000); //3600000ms=3600s=60m=1h
  await user.save();

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // sgMail.setDataResidency("eu");
  // uncomment the above line if you are sending mail using a regional EU subuser

  const baseUrl = req.protocol + "://" + req.get("host");

  const msg = {
    from: "Fullstack E-commerce <arnonono@hotmail.de>", // Change to your recipient
    to: "arnonono@hotmail.de",
    cc: email,
    subject: "Fullstack E-commerce - Password reset request",

    html: `<p> <a href="${baseUrl}/reset-password/${token}"><strong>Reset Your Password Here:</strong></a></p>`,
  };

  await sgMail.send(msg);
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
 *           auth me
 ****************************************/

//********** GET /auth/me **********
export const getMe = async (req, res) => {
  // from the authenticate middleware
  // we have access to the user object in the request object
  const { _id } = req.user;

  const user = await User.findById(_id).lean();
  if (!user) {
    throw new Error("User Not Found", { cause: 404 });
  }

  res.json(user);
};
