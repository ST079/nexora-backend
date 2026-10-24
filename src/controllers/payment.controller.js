import paymentService from "../services/payment.service.js";

const checkPaymentStatus = async (req, res, next) => {
  try {
    const payment = await paymentService.checkPaymentStatus(
      req.params.id,
      req.user,
    );

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found",
      });
    }

    res.json(payment);
  } catch (error) {
    next(error);
  }
};

export default { checkPaymentStatus };
