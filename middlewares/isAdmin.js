const isAdmin = async (req, res, next) => {
  if (req.user.role !== "admin") {
    throw new Error("Unauthorized", { cause: 403 });
  }

  next();
};

export default isAdmin;
