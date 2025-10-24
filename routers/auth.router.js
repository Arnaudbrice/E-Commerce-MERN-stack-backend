import express from "express";
import {
  register,
  login,
  logout,
  getMe,
} from "../controllers/auth.controller.js";
import authenticate from "../middlewares/authenticate.js";
import validateSchema from "../middlewares/validateSchema.js";
import { loginSchema, registerSchema } from "../schemas/auth.schema.js";

const authRouter = express.Router();

//********** register **********

authRouter.post("/register", validateSchema(registerSchema), register);

//********** login **********
authRouter.post("/login", validateSchema(loginSchema), login);

//********** logout **********
authRouter.delete("/logout", logout);

//********** me **********
authRouter.get("/me", authenticate, getMe);

export default authRouter;
