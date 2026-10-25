import crypto from "crypto";
import config from "../config/config.js";
import resetPasswordModel from "../models/ResetPassword.js";
import userModel from "../models/User.js";
import { passwordResetTemplate } from "../templates/passwordResetTemplate.js";
import { hashPassword, comparePassword } from "../utils/bcrypt.js";
import sendEmail from "../utils/email.js";

// Shape of the user we hand back to clients (and put inside the JWT).
const toPublicUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  address: user.address,
  roles: user.roles,
  phone: user.phone,
  isActive: user.isActive,
  profileImageUrl: user.profileImageUrl,
  isDemo: Boolean(user.isDemo),
});

const login = async (payload) => {
  const lookup = payload?.email
    ? { email: payload.email.toLowerCase() }
    : { phone: payload?.phone };

  const user = await userModel.findOne(lookup).select("+password");

  // Same message for "no user" and "wrong password" so emails can't be probed.
  if (!user) throw { status: 400, message: "Invalid Credentials" };

  if (!user.isActive) throw { status: 400, message: "User Deactivated!" };

  const isValidPassword = await comparePassword(
    payload.password,
    user.password,
  );
  if (!isValidPassword) throw { status: 400, message: "Invalid Credentials" };

  return toPublicUser(user);
};

const register = async (payload) => {
  const user = await userModel.findOne({
    $or: [{ email: payload?.email?.toLowerCase() }, { phone: payload?.phone }],
  });

  if (user) throw { status: 409, message: "User already exists" };

  const newUser = await userModel.create({
    name: payload.name,
    email: payload.email,
    phone: payload.phone,
    address: payload.address,
    password: await hashPassword(payload.password),
  });

  return toPublicUser(newUser);
};

const RESET_LINK_SENT = {
  message:
    "If an account exists for that email, a reset link is on its way. Please check your inbox.",
};

const forgotPassword = async (email) => {
  const user = await userModel.findOne({ email: email.toLowerCase() });

  //never send message saying if user is found.
  // The demo account's password is public and fixed, so it never gets a link.
  if (!user || user.isDemo) return RESET_LINK_SENT;

  const token = crypto.randomUUID();

  await resetPasswordModel.create({
    userId: user._id,
    token,
  });

  // The link opens the storefront's reset page, which posts back to the API.
  const resetLink = `${config.app_url}/reset-password?userId=${user._id}&token=${token}`;

  //send email
  await sendEmail(user.email, {
    subject: "Reset Password",
    body: passwordResetTemplate(resetLink),
  });

  return RESET_LINK_SENT;
};

const resetPassword = async (userId, token, password) => {
  // verify user and token
  const data = await resetPasswordModel
    .findOne({
      userId,
      expireAt: { $gt: new Date() },
    })
    .sort({ createdAt: -1 });

  if (!data || data.token !== token)
    throw {
      status: 400,
      message: "Invalid or expired password reset token.",
    };

  if (data.isUsed)
    throw { status: 400, message: "Link has already been used." };

  //reset password
  const hashedPassword = await hashPassword(password);
  await userModel.findByIdAndUpdate(userId, { password: hashedPassword });

  await resetPasswordModel.findByIdAndUpdate(data._id, { isUsed: true });

  return {
    message:
      "Password reset successful. You can now log in with your new password.",
  };
};

export { toPublicUser };

export default {
  register,
  login,
  forgotPassword,
  resetPassword,
};
