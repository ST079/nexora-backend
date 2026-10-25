import { ROLE_ADMIN, ROLE_MERCHANT, ROLE_USER } from "../constants/roles.js";
import userModel from "../models/User.js";
import { comparePassword, hashPassword } from "../utils/bcrypt.js";
import uploadFiles from "../utils/fileUploader.js";
import { escapeRegex, isSameId, parseSort, toInt } from "../utils/query.js";
import authService from "./auth.service.js";

const ADDRESS_FIELDS = ["country", "province", "city", "street"];

// Everyone signs in to the demo account with the same public password, so
// one visitor mustn't be able to rename it or lock the next one out.
const demoLocked = () => ({
  status: 403,
  message: "The demo account can't be changed. Create your own account to try this.",
});

// Used by admins; register() ignores roles, so they're applied afterwards.
const createUser = async (payload) => {
  const newUser = await authService.register(payload);
  if (!payload.roles?.length) return newUser;

  return await userModel.findByIdAndUpdate(
    newUser._id,
    { roles: [...new Set(payload.roles)] },
    { returnDocument: "after" },
  );
};

const buildUserFilters = ({ name, role, status } = {}) => {
  const filters = {};
  if (name) {
    const pattern = { $regex: escapeRegex(name), $options: "i" };
    filters.$or = [{ name: pattern }, { email: pattern }];
  }
  if ([ROLE_ADMIN, ROLE_MERCHANT, ROLE_USER].includes(role))
    filters.roles = role;
  if (status === "active") filters.isActive = true;
  if (status === "inactive") filters.isActive = false;
  return filters;
};

const getAllUser = async (query) => {
  const { limit, offset } = query;

  return await userModel
    .find(buildUserFilters(query))
    .sort(parseSort(query.sort))
    .limit(toInt(limit))
    .skip(toInt(offset));
};

const getUserById = async (id) => {
  const data = await userModel.findById(id);
  if (!data)
    throw {
      status: 404,
      message: "User Not Found! ",
    };
  return { data: data, status: 200, message: "User Found" };
};

const updateUser = async (id, payload, currentUser) => {
  const { data: target } = await getUserById(id);

  const isAdmin = currentUser.roles?.includes(ROLE_ADMIN);

  // Check if the current user is the same as the user being updated or is an admin
  if (!isSameId(currentUser._id, id) && !isAdmin) {
    throw {
      status: 403,
      message: "Forbidden: You don't have permission to update this user.",
    };
  }

  // Admins can still edit or deactivate it.
  if (target.isDemo && !isAdmin) throw demoLocked();

  const update = {};
  if (payload?.name) update.name = payload.name;
  if (payload?.phone) update.phone = payload.phone;

  // Merge address fields one by one so a partial address doesn't wipe the rest.
  ADDRESS_FIELDS.forEach((field) => {
    if (payload?.address?.[field] !== undefined)
      update[`address.${field}`] = payload.address[field];
  });

  // Only admins can (de)activate accounts, and never their own: a
  // deactivated account can't sign in to switch itself back on.
  if (isAdmin && typeof payload?.isActive === "boolean") {
    if (!payload.isActive && isSameId(currentUser._id, id))
      throw { status: 400, message: "You can't deactivate your own account." };
    update.isActive = payload.isActive;
  }

  return await userModel.findByIdAndUpdate(
    id,
    { $set: update },
    { returnDocument: "after", runValidators: true },
  );
};

const updateUserProfileImage = async (id, file) => {
  if (!file) throw { status: 400, message: "Please choose an image." };

  const { data: user } = await getUserById(id);
  if (user.isDemo) throw demoLocked();

  const uploadedFile = await uploadFiles([file]);
  const imageUrl = uploadedFile[0].secure_url;
  return await userModel.findByIdAndUpdate(
    id,
    { profileImageUrl: imageUrl },
    { returnDocument: "after" },
  );
};

const changePassword = async (id, { currentPassword, newPassword }) => {
  const user = await userModel.findById(id).select("+password");
  if (!user) throw { status: 404, message: "User Not Found! " };
  if (user.isDemo) throw demoLocked();

  const isValid = await comparePassword(currentPassword, user.password);
  if (!isValid)
    throw { status: 400, message: "Current password is incorrect." };

  // findByIdAndUpdate (not save) so legacy docs missing other required
  // fields don't block a password change.
  await userModel.findByIdAndUpdate(id, {
    password: await hashPassword(newPassword),
  });

  return { message: "Password updated successfully." };
};

const deleteUser = async (id, currentUser) => {
  if (isSameId(currentUser?._id, id))
    throw { status: 400, message: "You can't delete your own account here." };

  await getUserById(id);

  await userModel.findByIdAndDelete(id);
  return { status: 200, message: "User Deleted Successfully" };
};

const updateUserRoles = async (id, roles, currentUser) => {
  // Stops an admin from locking themselves out of the admin panel.
  if (isSameId(currentUser?._id, id) && !roles.includes(ROLE_ADMIN))
    throw { status: 400, message: "You can't remove your own admin role." };

  const { data: target } = await getUserById(id);
  // Anyone can sign in to the demo account, so it never gets staff access.
  if (target.isDemo && roles.some((role) => role !== ROLE_USER))
    throw { status: 400, message: "The demo account can only be a customer." };

  return await userModel.findByIdAndUpdate(
    id,
    { roles: [...new Set(roles)] },
    { returnDocument: "after" },
  );
};

const getTotalCount = async (query = {}) => {
  return await userModel.countDocuments(buildUserFilters(query));
};

// Headline numbers for the user-management screen.
const getStats = async () => {
  const [total, active, admins, merchants] = await Promise.all([
    userModel.countDocuments(),
    userModel.countDocuments({ isActive: true }),
    userModel.countDocuments({ roles: ROLE_ADMIN }),
    userModel.countDocuments({ roles: ROLE_MERCHANT }),
  ]);
  return { total, active, inactive: total - active, admins, merchants };
};

export default {
  createUser,
  getAllUser,
  getUserById,
  updateUser,
  updateUserProfileImage,
  changePassword,
  deleteUser,
  updateUserRoles,
  getTotalCount,
  getStats,
};
