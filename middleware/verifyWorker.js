const verifyWorker = (req, res, next) => {
  if (req.decoded?.role !== "worker") {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

module.exports = verifyWorker;
