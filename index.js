import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import "./db/index.js"; //!connect to mongodb database

import authRouter from "./routers/auth.router.js";

// import authenticate from "./middlewares/authenticate.js";
import userRouter from "./routers/user.router.js";
/***********************************************************/
import path from "path";
import { fileURLToPath } from "url";
import errorHandler from "./middlewares/errorHandler.js";

//! return a cross-platform valid absolute path string
const __filename = fileURLToPath(import.meta.url);
// return the directory name of a path string
const __dirname = path.dirname(__filename);

/***********************************************************/

const app = express();

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

app.use(express.json());

app.use(
  express.urlencoded({
    extended: false,
  })
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
app.use("/auth", authRouter);

// protected routes
// app.use(authenticate);

app.use("/users", userRouter);

app.use(errorHandler);
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is listening on port ${port}!`);
});
