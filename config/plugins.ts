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
          user: "holly50@ethereal.email",
          pass: "C5zX7RsMCXHWgCkxDw",
        },
      },
      settings: {
        defaultFrom: "ventas@ixoye-store.com",
        defaultReplyTo: "soporte@ixoye-store.com",
      },
    },
  },
});
