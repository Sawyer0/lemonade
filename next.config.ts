import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
      allowedOrigins: [
        'b6cc9d4864869d.lhr.life',
        'localhost:3000',
        '10.0.2.2'
      ],
    },
  },
  // Explicitly allow development origins as per the error message
  allowedDevOrigins: [
    'b6cc9d4864869d.lhr.life',
    'localhost:3000',
    '10.0.2.2'
  ],
  // Silence Next.js 16 Turbopack warning (next-pwa uses webpack internally)
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
  },
};

export default withPWA({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
})(nextConfig);

