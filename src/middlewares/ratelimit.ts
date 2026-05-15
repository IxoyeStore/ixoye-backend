export const rateLimitMiddleware = (maxRequests: number, windowMs: number) => {
  const requestCounts = new Map<string, { count: number; resetTime: number }>();

  const cleanup = setInterval(
    () => {
      const now = Date.now();
      for (const [ip, record] of requestCounts.entries()) {
        if (now > record.resetTime) {
          requestCounts.delete(ip);
        }
      }
    },
    5 * 60 * 1000,
  );

  // Evitar que el interval mantenga el proceso vivo en tests
  if (cleanup.unref) cleanup.unref();

  return async (ctx: any, next: any) => {
    const ip = ctx.ip || ctx.request.ip || "unknown";
    const now = Date.now();

    let record = requestCounts.get(ip);

    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + windowMs };
      requestCounts.set(ip, record);
    }

    record.count++;

    ctx.set("X-RateLimit-Limit", maxRequests.toString());
    ctx.set(
      "X-RateLimit-Remaining",
      Math.max(0, maxRequests - record.count).toString(),
    );
    ctx.set("X-RateLimit-Reset", record.resetTime.toString());

    if (record.count > maxRequests) {
      ctx.status = 429;
      ctx.body = {
        error: "Demasiadas solicitudes. Intenta de nuevo en un momento.",
      };
      return;
    }

    await next();
  };
};
