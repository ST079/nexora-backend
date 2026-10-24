import authService from "../services/auth.service.js";

import { generateJwt } from "../utils/token.js";

const TOKEN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  maxAge: 86400 * 1000,
};

const login = async (req, res, next) => {
  try {
    const payload = req.body;
    const user = await authService.login(payload);
    const token = generateJwt(user);

    //storing token in cookie key, value
    res.cookie("nexora_token", token, TOKEN_COOKIE_OPTIONS);
    res.json({ message: "Login successful", token: token, user: user });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const payload = req.body;
    const newUser = await authService.register(payload);
    const token = generateJwt(newUser);

    res.cookie("nexora_token", token, TOKEN_COOKIE_OPTIONS);

    // `user` matches the login response; `registeredUser` kept for old clients.
    res.status(201).json({
      message: "Registration successful",
      user: newUser,
      registeredUser: newUser,
      token: token,
    });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const data = await authService.forgotPassword(email);
    res.json(data);
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  const query = req.query;

  if (!query.token || !query.userId) {
    return res
      .status(400)
      .json({ message: "Invalid request. Missing token or userID." });
  }

  try {
    const { token, userId } = query;
    const data = await authService.resetPassword(
      userId,
      token,
      req.body.password,
    );
    res.json(data);
  } catch (error) {
    next(error);
  }
};

export default {
  login,
  register,
  forgotPassword,
  resetPassword,
};
