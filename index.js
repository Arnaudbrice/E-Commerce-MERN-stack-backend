import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

import "./db/index.js"; //!connect to mongodb database

import authRouter from "./routers/auth.router.js";
import chatRouter from "./routers/chat.router.js";

// import authenticate from "./middlewares/authenticate.js";
import userRouter from "./routers/user.router.js";
/***********************************************************/
import path from "path";
import { fileURLToPath } from "url";
import errorHandler from "./middlewares/errorHandler.js";

//! return a cross-platform valid absolute path to the current file (import.meta.url returns full url of the current file)
const __filename = fileURLToPath(import.meta.url);
// return the directory name of the absolute path to the current file
const __dirname = path.dirname(__filename);

/***********************************************************/

const app = express();

//********** order: security middlewares (helmet), cors, rate limiting(express-rate-limit), body parsing, routes, error handling middleware **********

app.use(helmet()); //activate all security headers

//CORS middleware to allow cross-origin requests from the frontend application and other trusted origins (like Stripe for payment processing)
// An array that lists the origins that are allowed to make cross‑origin requests to our API.
const allowOrigins = [
  "https://e-commerce-mern-stack-frontend-q5j0.onrender.com",
  "http://localhost:5173",
  "https://stripe.com",
];

// CORS configuration options
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests or Server‑to‑server calls (e.g., micro‑services, cron jobs))
    if (!origin) {
      return callback(null, true); // allow requests with no origin (like mobile apps or curl requests)
    }

    // Allow any localhost origin in development
    if (
      process.env.NODE_ENV === "development" &&
      origin.startsWith("http://localhost")
    ) {
      return callback(null, true);
    }

    // Allow requests from the specified origins
    if (!allowOrigins.includes(origin)) {
      const msg =
        "The CORS policy for this site does not allow access from the specified Origin.";
      return callback(new Error(msg), false); //reject requests from other origins
    } else {
      //! null tells the CORS middleware that no error occurred
      return callback(null, true); // allow requests from the specified origins
    }
  },
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  allowedHeaders: "Content-Type,Authorization",
};

app.use(cors(corsOptions));

// Apply rate limiting to all requests to prevent abuse and protect against brute-force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 150, // limit each IP to 50 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing middleware to parse incoming request bodies in a middleware before our handlers, available under the req.body property.
app.use(express.json());

app.use(
  express.urlencoded({
    extended: true, //to be able to parse also nested objects
  }),
);
app.use(cookieParser());

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, "public")));

// Health check endpoint
app.get("/health", async (req, res) => {
  res.json({ message: "Running" });
});

//****** Routes specific middleware setting ******
// public routes
app.use("/auth", authLimiter, authRouter);

// protected routes
// app.use(authenticate);

app.use("/chat", chatLimiter, chatRouter);

app.use("/users", userRouter);

//********** Error handling middleware **********
// Error handling middleware should be the last middleware added with app.use() after all routes and other middleware, so it can catch errors from them
app.use(errorHandler);
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is listening on port ${port}!`);
});
