import multer from "multer";

// Matches the limit the frontend dropzones enforce.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 10;

// Files are kept in memory only long enough to stream them to Cloudinary,
// so cap the size and count to keep one request from exhausting RAM.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (file.mimetype?.startsWith("image/")) return cb(null, true);
    cb({ status: 400, message: "Only image files can be uploaded." });
  },
});

export default upload;
