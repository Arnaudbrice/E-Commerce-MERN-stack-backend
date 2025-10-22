import express from "express";
import {
  register,
  login,
  logout,
  getMe,
} from "../controllers/auth.controller.js";
import authenticate from "../middlewares/authenticate.js";

const authRouter = express.Router();

//********** register **********

authRouter.post("/register", register);

//********** login **********
authRouter.post("/login", login);

//********** logout **********
authRouter.delete("/logout", logout);

//********** me **********
authRouter.get("/me", authenticate, getMe);

export default authRouter;
