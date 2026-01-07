const errorHandler = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  /*  const status = error.cause || 500;
  res
    .status(status)
    .json({ message: error.message || "Internal Server Error" });
 */

  const statusCode = error.cause || 500; // Use the 'cause' for status code, default to 500
  const message = error.message || "Something went wrong!";

  // For JWT errors, ensure a consistent message
  if (
    error.name === "TokenExpiredError" ||
    error.name === "JsonWebTokenError"
  ) {
    return res.status(401).json({ message: "Not Authenticated" });
  }

  res.status(statusCode).json({ message });
};

export default errorHandler;
