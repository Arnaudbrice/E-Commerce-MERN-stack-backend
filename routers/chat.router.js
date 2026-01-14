import express from "express";
import { createChatMessage } from "../controllers/chat.controller.js";
import authenticate from "../middlewares/authenticate.js";



const chatRouter = express.Router();

chatRouter.route("/message").post(authenticate,createChatMessage)

export default chatRouter;