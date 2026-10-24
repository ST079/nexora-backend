import axios from "axios";
import config from "../config/config.js";
import Stripe from "stripe";

// Khalti and Stripe both take the amount in the smallest unit (paisa).
const toPaisa = (amount) => Math.round(Number(amount) * 100);

const khaltiHeaders = () => ({
  headers: {
    Authorization: "Key " + config.khalti.api_key,
  },
});

const providerError = (provider, error) => ({
  status: 502,
  message: `${provider} request failed.`,
  extraDetails: error.response?.data ?? error.message,
});

const payViaKhalti = async (data) => {
  const body = {
    return_url: `${config.app_url}/${config.khalti.return_url}`,
    website_url: config.app_url,
    amount: toPaisa(data.amount),
    purchase_order_id: data.purchase_order_id,
    purchase_order_name: data.purchase_order_name,
    customer_info: {
      name: data.customer_info.name,
      email: data.customer_info.email,
      phone: data.customer_info.phone,
    },
  };

  try {
    const response = await axios.post(
      config.khalti.api_url,
      body,
      khaltiHeaders(),
    );
    return response.data;
  } catch (error) {
    throw providerError("Khalti", error);
  }
};

// Server-side check of a Khalti payment — the callback query string alone
// can be forged, the lookup API cannot.
const lookupKhaltiPayment = async (pidx) => {
  const lookupUrl =
    config.khalti.lookup_url ||
    config.khalti.api_url.replace("initiate", "lookup");

  try {
    const response = await axios.post(lookupUrl, { pidx }, khaltiHeaders());
    return response.data;
  } catch (error) {
    throw providerError("Khalti", error);
  }
};

let stripeClient;
const stripe = () => {
  if (!stripeClient) stripeClient = new Stripe(config.stripe_Secret_Key);
  return stripeClient;
};

const payViaStripe = async (data) => {
  try {
    return await stripe().paymentIntents.create({
      amount: toPaisa(data.amount),
      currency: data.currency || "npr",
      metadata: {
        name: data.customer_info.name,
        email: data.customer_info.email,
        phone: data.customer_info.phone,
        purchase_order_id: data.purchase_order_id,
        purchase_order_name: data.purchase_order_name,
      },
    });
  } catch (error) {
    throw providerError("Stripe", error);
  }
};

const retrieveStripePayment = async (paymentIntentId) => {
  try {
    return await stripe().paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    throw providerError("Stripe", error);
  }
};

export {
  payViaKhalti,
  lookupKhaltiPayment,
  payViaStripe,
  retrieveStripePayment,
  toPaisa,
};
