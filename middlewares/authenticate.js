import jwt from "jsonwebtoken";
import User from "../models/User.js";

//********** GET /user/me **********

const authenticate = async (req, res, next) => {
  const { token } = req.cookies;

  if (!token) {
    throw new Error("Not Authenticated,\nPlease Login First", { cause: 401 });
  }

  // checks if the token is valid and decodes it
  const payload = jwt.verify(token, process.env.JWT_SECRET);

  console.log("payload", payload);
  const user = await User.findById(payload.id).lean();
  if (!user) {
    throw new Error("User not found", { cause: 401 });
  }

  // delete the password from the user object before sending the response back to the client
  delete user.password;
  req.user = user;

  next();
};

export default authenticate;
