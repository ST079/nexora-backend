const checkRole = (...roles) => {
  return (req, res, next) => {
    const userRoles = req.user?.roles ?? [];
    const hasRole = userRoles.some((role) => {
      return roles.includes(role);
    });

    if (hasRole) {
      return next();
    }

    res.status(403).json({ message: "Access Denied." });
  };
};

export default checkRole;
