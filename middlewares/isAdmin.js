const isAdmin = async (req, res, next) => {
  console.log("req.user in isAdmin", req.user);

  if (req.user.role !== "admin") {
    throw new Error("Unauthorized", { cause: 403 });
  }

  next();
};

export default isAdmin;
