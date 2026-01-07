const verifyAdmin = (req, res, next) => {
  if (req.decoded?.role !== "admin") {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

module.exports = verifyAdmin;
