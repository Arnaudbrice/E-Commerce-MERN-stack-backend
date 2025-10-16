import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import mongoose from "mongoose";

/***********************************************************/
import path from "path";
import { fileURLToPath } from "url";

//! return a cross-platform valid absolute path string
const __filename = fileURLToPath(import.meta.url);
// return the directory name of a path string
const __dirname = path.dirname(__filename);

/***********************************************************/

const app = express();

// An array that lists the origins that are allowed to make cross‑origin requests to our API.
const allowOrigins = ["http://localhost:5173"];

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

// connect to mongodb database
mongoose.connect("mongodb://localhost:27017/databaseName");
app.get("/", (req, res) => {
  res.send("Hello World!");
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is listening on port port!`);
});
