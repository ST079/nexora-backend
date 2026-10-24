import orderService from "../services/order.service.js";

const getAllOrders = async (req, res, next) => {
  try {
    const payload = req.query;
    const orders = await orderService.getAllOrders(payload);
    res.json(orders);
  } catch (error) {
    next(error);
  }
};

const getOrdersByUser = async (req, res, next) => {
  try {
    const orders = await orderService.getOrdersByUser(req.user._id);
    res.json(orders);
  } catch (error) {
    next(error);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const order = await orderService.getOrderById(req.params.id, req.user);
    res.json(order);
  } catch (error) {
    next(error);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const order = await orderService.createOrder(req.body, req.user._id);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
};

const cancelOrder = async (req, res, next) => {
  try {
    const order = await orderService.cancelOrder(req.params.id, req.user);
    res.status(200).json(order);
  } catch (error) {
    next(error);
  }
};

const deleteOrder = async (req, res, next) => {
  try {
    const order = await orderService.deleteOrder(req.params.id);
    res.status(200).json(order);
  } catch (error) {
    next(error);
  }
};

const updateOrderStatus = async (req, res, next) => {
  try {
    const order = await orderService.updateOrderStatus(
      req.params.id,
      req.body.status,
    );
    res.status(200).json(order);
  } catch (error) {
    next(error);
  }
};

const orderPaymentViaKhalti = async (req, res, next) => {
  try {
    const order = await orderService.orderPaymentViaKhalti(
      req.params.id,
      req.user,
    );
    res.status(200).json(order);
  } catch (error) {
    next(error);
  }
};

const orderPaymentViaStripe = async (req, res, next) => {
  try {
    const order = await orderService.orderPaymentViaStripe(
      req.params.id,
      req.user,
    );
    res.status(200).json(order);
  } catch (error) {
    next(error);
  }
};

const orderPaymentViaCash = async (req, res, next) => {
  try {
    const order = await orderService.orderPaymentViaCash(
      req.params.id,
      req.user,
    );
    res.status(200).json(order);
  } catch (error) {
    next(error);
  }
};

// The provider is asked directly, so only the Khalti pidx is read from the body.
const confirmOrderPayment = async (req, res, next) => {
  try {
    const order = await orderService.confirmOrderPayment(
      req.params.id,
      { pidx: req.body?.pidx },
      req.user,
    );
    res.status(200).json(order);
  } catch (error) {
    next(error);
  }
};

const getOrdersByMerchant = async (req, res, next) => {
  try {
    const orders = await orderService.getOrdersByMerchant(
      req.user._id,
      req.query,
    );
    res.json(orders);
  } catch (error) {
    next(error);
  }
};

const getTotalCount = async (req, res, next) => {
  try {
    const data = await orderService.getTotalCount(req.query, req.user);
    res.json({ totalCount: data });
  } catch (error) {
    next(error);
  }
};

const getStats = async (req, res, next) => {
  try {
    const data = await orderService.getStats(req.user);
    res.json(data);
  } catch (error) {
    next(error);
  }
};

export default {
  getAllOrders,
  getOrdersByUser,
  getOrderById,
  createOrder,
  cancelOrder,
  deleteOrder,
  updateOrderStatus,
  orderPaymentViaKhalti,
  orderPaymentViaStripe,
  orderPaymentViaCash,
  confirmOrderPayment,
  getOrdersByMerchant,
  getTotalCount,
  getStats,
};
