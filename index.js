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

  max: process.env.NODE_ENV === "production" ? 200 : 1000, // limit each IP to 150 requests per windowMs (1000 dev , 200 prod)

  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 50 : 150, // limit each IP to 50 requests per windowMs (150 dev , 50 prod)
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 100 : 500, // limit each IP to 150 requests per windowMs (500 dev , 100 prod)
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

app.set("trust proxy", 1); //! Trust first proxy (if behind a proxy like in production) to get the correct client IP for rate limiting and secure cookies ( without this setting, secure cookies would not be set in production because the app would see the connection as HTTP instead of HTTPS due to the proxy server)

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
