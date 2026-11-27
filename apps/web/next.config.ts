import type { NextConfig } from "next";

const MODEL_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/models/:path*", headers: [{ key: "Cache-Control", value: MODEL_CACHE }] }];
  },
};

export default nextConfig;
