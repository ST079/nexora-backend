import userModel from "../models/User.js";
import { verifyJwt } from "../utils/token.js";

const TOKEN_COOKIE = "nexora_token";

// Reads one cookie by name instead of assuming it is the only cookie sent.
const readCookie = (cookieHeader = "", name) => {
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
};

const auth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else {
    token = readCookie(req.headers.cookie, TOKEN_COOKIE);
  }

  if (!token)
    return res.status(401).json({ message: "User not authenticated." });

  let data;
  try {
    data = await verifyJwt(token);
  } catch (error) {
    return res.status(401).json({ message: "Invalid Token." });
  }

  try {
    // The token is a snapshot from sign-in. Re-read the fields that gate
    // access so a deactivated or deleted account loses access right away
    // and role changes apply without signing out.
    const current = await userModel
      .findById(data._id)
      .select("roles isActive")
      .lean();

    // 401 for both, so the frontend treats the session as over and signs out.
    if (!current)
      return res.status(401).json({ message: "Account no longer exists." });
    if (current.isActive === false)
      return res.status(401).json({ message: "User Deactivated!" });

    req.user = { ...data, roles: current.roles, isActive: current.isActive };
    next();
  } catch (error) {
    next(error);
  }
};

export default auth;
