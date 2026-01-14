export default ({ env }) => ({
  "users-permissions": {
    enabled: true,
  },
  email: {
    config: {
      provider: "nodemailer",
      providerOptions: {
        host: "smtp.ethereal.email",
        port: 587,
        auth: {
          user: "jordan.flatley@ethereal.email",
          pass: "6UP7QxSQ4Mfc2zHXnY",
        },
      },
      settings: {
        defaultFrom: "ventas@ixoye-store.com",
        defaultReplyTo: "soporte@ixoye-store.com",
      },
    },
  },
});
