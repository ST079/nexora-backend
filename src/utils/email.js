import { Resend } from "resend";
import config from "../config/config.js";

// Created on first use: `new Resend()` throws without a key, which used to
// crash the whole API on boot when EMAIL_API_KEY was unset.
let resend;

const sendEmail = async (recipient, { subject, body }) => {
  if (!resend) resend = new Resend(config.emailApiKey);

  const { error } = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: [recipient],
    subject: subject,
    html: body,
  });

  if (error) {
    console.error("Error sending email:", error);
    throw {
      status: 502,
      message: "We couldn't send the email right now. Please try again later.",
    };
  }
};

export default sendEmail;
