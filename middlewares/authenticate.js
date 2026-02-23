import jwt from "jsonwebtoken";

//********** GET /user/me **********

const authenticate = async (req, res, next) => {
  const { token } = req.cookies;

  if (!token) {
    throw new Error("Not Authenticated,\nPlease Login First", { cause: 401 });
  }

  // checks if the token is valid and decodes it
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  req.user = { _id: payload.id, email: payload.email, role: payload.role };

  next();
};

export default authenticate;
