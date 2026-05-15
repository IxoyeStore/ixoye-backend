export default [
  "strapi::logger",
  "strapi::errors",
  {
    name: "strapi::ratelimit",
    config: {
      enabled: true,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (ctx: any) => ctx.ip,
      max: 100,
      timeWindow: 60000, // 1 minuto
      allowList: (ctx: any) => ["/health", "/metrics"].includes(ctx.path),
    },
  },
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "connect-src": ["'self'", "https:"],
          "img-src": [
            "'self'",
            "data:",
            "blob:",
            "dl.airtable.com",
            "res.cloudinary.com",
          ],
          "media-src": [
            "'self'",
            "data:",
            "blob:",
            "dl.airtable.com",
            "res.cloudinary.com",
          ],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
  {
    name: "strapi::cors",
    config: {
      origin: [
        "http://localhost:3000",
        "https://www.refaccionesixoye.mx",
        "https://refaccionesixoye.mx",
        "https://ixoye-frontend.vercel.app",
      ],
    },
  },
  "strapi::poweredBy",
  "strapi::query",
  {
    name: "strapi::body",
    config: {
      patchKoa: true,
      multipart: true,
      includeUnparsed: true,
    },
  },
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
