// Mongoose/JSON errors are caused by bad input, anything else is on us.
const CLIENT_ERRORS = ["ValidationError", "CastError", "SyntaxError", "MulterError"];

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: "Each image must be 5 MB or smaller.",
  LIMIT_FILE_COUNT: "Too many files in one upload.",
};

const errorMiddleware = (err, req, res, next) => {
  const status =
    err.status || (CLIENT_ERRORS.includes(err.name) ? 400 : 500);
  const message =
    (err.name === "MulterError" && MULTER_MESSAGES[err.code]) ||
    err.message ||
    "Backend Error.";
  const extraDetails = err.extraDetails || "Error from backend.";

  if (status >= 500) console.error(err);

  return res.status(status).json({ message, extraDetails });
};

export default errorMiddleware;
