import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4000),
  nextInternalApiUrl: process.env.NEXT_INTERNAL_API_URL || "http://localhost:3000",
  internalSecret: process.env.REALTIME_SERVER_INTERNAL_SECRET || "dev-only-shared-secret",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
};
