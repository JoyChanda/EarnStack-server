const verifyBuyer = (req, res, next) => {
  if (req.decoded?.role !== "buyer") {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

module.exports = verifyBuyer;
