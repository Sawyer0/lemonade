import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
      allowedOrigins: [
        '774efe6bb84846.lhr.life',
        'localhost:3000',
        '*.lhr.life',
        '*.loca.lt'
      ],
    },
  },
  // Explicitly allow development origins as per the error message
  allowedDevOrigins: [
    '774efe6bb84846.lhr.life',
    'localhost:3000',
    '*.lhr.life',
    '*.loca.lt'
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

