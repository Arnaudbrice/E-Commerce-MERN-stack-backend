import express from "express";
import {
  register,
  login,
  logout,
  getMe,
  sendMail,
  getResetPassword,
  resetPassword,
  createProfile,
} from "../controllers/auth.controller.js";
import authenticate from "../middlewares/authenticate.js";
import validateSchema from "../middlewares/validateSchema.js";
import { loginSchema, registerSchema } from "../schemas/auth.schema.js";

const authRouter = express.Router();

//********** register **********

authRouter.post("/register", validateSchema(registerSchema), register);

//********** login **********
authRouter.post("/login", validateSchema(loginSchema), login);

/****************************************
 *           reset password
 ****************************************/

authRouter.post("/mail-reset-password", sendMail);

authRouter
  .route("/reset-password/:token")
  .get(getResetPassword)
  .post(resetPassword);

//********** logout **********
authRouter.delete("/logout", logout);

//********** profile **********
authRouter.put("/profile", authenticate, createProfile);
//********** me **********
authRouter.get("/me", authenticate, getMe);

export default authRouter;
