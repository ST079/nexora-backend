import userService from "../services/user.service.js";

const getAllUser = async (req, res, next) => {
  try {
    const users = await userService.getAllUser(req.query);

    res.json(users);
  } catch (error) {
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const id = req.params.id;
    const user = await userService.getUserById(id);

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

const getLoggedInUser = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await userService.getUserById(userId);

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const newUser = await userService.createUser(req.body);

    res
      .status(201)
      .json({ message: "User Created Successfully.", userDetails: newUser });
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const payload = req.body;
    const id = req.params.id;
    const updatedUser = await userService.updateUser(id, payload, req.user);

    res.status(200).json(updatedUser);
  } catch (error) {
    next(error);
  }
};

const updateUserProfileImage = async (req, res, next) => {
  try {
    const id = req.user._id;
    const file = req.file;

    const updatedUser = await userService.updateUserProfileImage(id, file);
    res.status(200).json(updatedUser);
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const data = await userService.changePassword(req.user._id, req.body);
    res.status(200).json(data);
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const id = req.params.id;
    const deletedUser = await userService.deleteUser(id, req.user);
    res.status(200).json(deletedUser);
  } catch (error) {
    next(error);
  }
};

const updateUserRoles = async (req, res, next) => {
  try {
    const id = req.params.id;
    const roles = req.body.roles;

    const updatedUser = await userService.updateUserRoles(id, roles, req.user);
    res.status(200).json(updatedUser);
  } catch (error) {
    next(error);
  }
};

const getTotalCount = async (req, res, next) => {
  try {
    const data = await userService.getTotalCount(req.query);
    res.json({ totalCount: data });
  } catch (error) {
    next(error);
  }
};

const getStats = async (req, res, next) => {
  try {
    const data = await userService.getStats();
    res.json(data);
  } catch (error) {
    next(error);
  }
};

export default {
  createUser,
  getAllUser,
  getUserById,
  updateUser,
  updateUserProfileImage,
  changePassword,
  deleteUser,
  getLoggedInUser,
  updateUserRoles,
  getTotalCount,
  getStats,
};
