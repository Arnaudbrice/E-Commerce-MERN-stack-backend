const errorHandler = (error, req, res, next) => {
  const status = error.cause || 500;
  res
    .status(status)
    .json({ message: error.message || "Internal Server Error" });
};

export default errorHandler;
