import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  outputFileTracingExcludes: {
    "/api/aion": [
      "./node_modules/onnxruntime-node/**/*",
      "./node_modules/@huggingface/transformers/**/*",
      "./node_modules/@xenova/transformers/**/*"
    ],
    "/api/aion/stream": [
      "./node_modules/onnxruntime-node/**/*",
      "./node_modules/@huggingface/transformers/**/*",
      "./node_modules/@xenova/transformers/**/*"
    ],
    "/api/cortex": [
      "./node_modules/onnxruntime-node/**/*",
      "./node_modules/@huggingface/transformers/**/*",
      "./node_modules/@xenova/transformers/**/*"
    ],
    "/api/cortex/stream": [
      "./node_modules/onnxruntime-node/**/*",
      "./node_modules/@huggingface/transformers/**/*",
      "./node_modules/@xenova/transformers/**/*"
    ]
  },
  transpilePackages: ['motion'],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
