export default ({ env }) => ({
  email: {
    config: {
      provider: "nodemailer",
      providerOptions: {
        host: env("SMTP_HOST"),
        port: env.int("SMTP_PORT", 465),
        auth: {
          user: env("SMTP_USERNAME"),
          pass: env("SMTP_PASSWORD"),
        },
        secure: true,
        tls: {
          rejectUnauthorized: false,
          ciphers: "SSLv3",
        },
      },
      settings: {
        defaultFrom: env("SMTP_FROM", "soporte@refaccionesixoye.mx"),
        defaultReplyTo: env("SMTP_REPLY_TO", "soporte@refaccionesixoye.mx"),
      },
    },
  },
  upload: {
    config: {
      provider: "cloudinary",
      providerOptions: {
        cloud_name: env("CLOUDINARY_NAME"),
        api_key: env("CLOUDINARY_KEY"),
        api_secret: env("CLOUDINARY_SECRET"),
      },
      actionOptions: {
        upload: {},
        delete: {},
      },
    },
  },
});
