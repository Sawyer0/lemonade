import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    output: 'standalone',
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
            allowedOrigins: ['b6cc9d4864869d.lhr.life', 'localhost:3000', '10.0.2.2'],
        },
    },
    // Explicitly allow development origins as per the error message
    allowedDevOrigins: ['b6cc9d4864869d.lhr.life', 'localhost:3000', '10.0.2.2'],
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
    transpilePackages: ['konsta', '@lemonade/core'],
};

export default nextConfig;
