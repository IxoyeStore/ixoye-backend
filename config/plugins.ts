export default ({ env }) => ({
  email: {
    config: {
      provider: "resend",
      providerOptions: {
        apiKey: env("re_BChdVrnn_QC8YS8La3uP4ZVSiChD9nuYp"),
      },
      settings: {
        defaultFrom: "soporte@refaccionesixoye.mx",
        defaultReplyTo: "soporte@refaccionesixoye.mx",
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
