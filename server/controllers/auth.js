const User = require("../models/user");
require("dotenv").config();
const _ = require("lodash");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { expressjwt: ejwt } = require("express-jwt");
const { OAuth2Client } = require("google-auth-library");

const sendActivationEmail = async (email, token) => {
  const transporter = nodemailer.createTransport({
    service: process.env.SERVICE,
    host: process.env.HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.SECURE === "true",
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.PASS,
    },
  });

  const emailParams = {
    from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: "Account activation link",
    html: `
      <h1>Please use the following link to activate your account</h1>
      <p>${process.env.CLIENT_URL}/auth/activate/${token}</p>
      <hr />
      <p>This email may contain sensitive information</p>
      <p>${process.env.CLIENT_URL}</p>
    `,
  };

  try {
    const info = await transporter.sendMail(emailParams);
    console.log("Email sent: " + info.response);
    return info.response;
  } catch (error) {
    console.error("SEND EMAIL ERROR", error);
    throw new Error(error.message || "Failed to send email");
  }
};

exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({
        error: "Email is taken",
      });
    }

    const token = jwt.sign(
      { name, email, password },
      process.env.JWT_ACCOUNT_ACTIVATION,
      { expiresIn: "10m" }
    );

    await sendActivationEmail(email, token);

    return res.json({
      message: `Email has been sent to ${email}. Follow the instructions to activate your account`,
    });
  } catch (error) {
    console.log("REGISTER ERROR", error);
    return res.status(500).json({
      error: error.message || "Failed to register user",
    });
  }
};

exports.accountActivation = async (req, res) => {
  const { token } = req.body;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCOUNT_ACTIVATION);
      const { name, email, password } = jwt.decode(token);

      const user = new User({ name, email, password });

      await user.save();

      return res.json({
        message: "Registration successful. Please log in.",
      });
    } catch (error) {
      console.log("JWT VERIFY IN ACCOUNT ACTIVATION ERROR", error);
      return res.status(401).json({
        error: "Expired link, register again",
      });
    }
  } else {
    return res.json({
      message: "Something went wrong! Try again",
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // check if user exists
    const user = await User.findOne({ email }).exec();

    if (!user) {
      return res.status(400).json({
        error: "User with that email does not exist. Please signup",
      });
    }

    // authenticate
    if (!user.authenticate(password)) {
      return res.status(400).json({
        error: "Looks like the password or email didn't match our records. Give it another shot!",
      });
    }

    // generate a token and send to client
    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    const { _id, name, role } = user;

    return res.json({
      token,
      user: { _id, name, email, role },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.requireSignin = ejwt({
  secret: process.env.JWT_SECRET,
  algorithms: ["HS256"],
});

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email }).exec();
    if (!user) {
      return res.status(400).json({
        error: "User with that email does not exist",
      });
    }

    const token = jwt.sign(
      { _id: user._id, name: user.name },
      process.env.JWT_RESET_PASSWORD,
      {
        expiresIn: "10m",
      }
    );

    const transporter = nodemailer.createTransport({
      service: process.env.SERVICE,
      host: process.env.HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.SECURE === "true",
      auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.PASS,
      },
    });

    const emailParams = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: "Password Reset link",
      html: `
        <h1>Please use the following link to reset your password</h1>
        <p>${process.env.CLIENT_URL}/auth/password/reset/${token}</p>
        <hr />
        <p>This email may contain sensitive information</p>
        <p>${process.env.CLIENT_URL}</p>
      `,
    };

    await user.updateOne({ resetPasswordLink: token });

    transporter.sendMail(emailParams, (error, info) => {
      if (error) {
        console.error("SEND EMAIL ERROR", error);
        return res.json({
          message: error.message || "Failed to send email",
        });
      } else {
        console.log("Email sent: " + info.response);
        return res.json({
          message: `Email has been sent to ${email}. Follow the instructions to reset your password`,
        });
      }
    });
  } catch (error) {
    console.error("Mongoose Query Error", error);
    return res.status(500).json({
      error: "Failed to find user",
    });
  }
};

exports.resetPassword = async (req, res) => {
  const { resetPasswordLink, newPassword } = req.body;

  if (resetPasswordLink) {
    try {
      const decoded = jwt.verify(
        resetPasswordLink,
        process.env.JWT_RESET_PASSWORD
      );

      const user = await User.findOne({ resetPasswordLink }).exec();

      if (!user) {
        return res.status(400).json({
          error: "Something went wrong. Try later",
        });
      }

      user.password = newPassword;
      user.resetPasswordLink = "";

      await user.save();

      res.json({
        message: "Great! Now you can login with your new password",
      });
    } catch (err) {
      return res.status(400).json({
        error: "Expired link. Try again",
      });
    }
  }
};