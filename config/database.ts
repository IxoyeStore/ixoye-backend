import path from "path";

export default ({ env }) => {
  const client = env("DATABASE_CLIENT", "postgres");

  const connections = {
    postgres: {
      connection: {
        connectionString: env("DATABASE_URL"),
        host: env("DATABASE_HOST") || env("PGHOST") || "localhost",
        port: env.int("DATABASE_PORT") || env.int("PGPORT") || 5432,
        database: env("DATABASE_NAME") || env("PGDATABASE") || "ixoye-store",
        user: env("DATABASE_USERNAME") || env("PGUSER") || "",
        password: env("DATABASE_PASSWORD") || env("PGPASSWORD") || "",
        ssl: env.bool("DATABASE_SSL", false)
          ? {
              rejectUnauthorized: env.bool(
                "DATABASE_SSL_REJECT_UNAUTHORIZED",
                false,
              ),
            }
          : false,
        schema: env("DATABASE_SCHEMA", "public"),
      },
      pool: {
        min: env.int("DATABASE_POOL_MIN", 2),
        max: env.int("DATABASE_POOL_MAX", 10),
      },
    },
    sqlite: {
      connection: {
        filename: path.join(
          __dirname,
          "..",
          "..",
          env("DATABASE_FILENAME", ".tmp/data.db"),
        ),
      },
      useNullAsDefault: true,
    },
  };

  return {
    connection: {
      client,
      ...connections[client],
      acquireConnectionTimeout: env.int("DATABASE_CONNECTION_TIMEOUT", 60000),
    },
  };
};
