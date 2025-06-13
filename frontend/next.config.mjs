import { fileURLToPath } from "node:url";
import createJITI from "jiti";

const jiti = createJITI(fileURLToPath(import.meta.url));
jiti("./src/lib/env.ts");

const TerserPlugin = require('terser-webpack-plugin');


/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    esmExternals: "loose",
  },
  images: {
    remotePatterns: [
      {
        hostname: "**",
        protocol: "https",
      },
    ],
  },
  transpilePackages: [
    '@farcaster/frame-wagmi-connector', 
    '@farcaster/frame-sdk',
    '@farcaster/frame-core',
    '@farcaster/frame-node',
    '@farcaster/auth-client',
    '@xmtp/browser-sdk',
    '@wagmi/core',
    'wagmi',
    'viem',
    'uint8array-extras'
  ],
  webpack: (config, { dev , isServer }) => {
    // Add extensionAlias for .js
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };

    if (!dev && !isServer) {
      config.optimization.minimizer = [
        new TerserPlugin({
          exclude: /HeartbeatWorker\.js$/,
        }),
      ];
    }
    
    if (!isServer) {
      config.module.rules.push({
        test: /HeartbeatWorker\.js$/,
        type: 'asset/source',
      });
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };

      config.module.rules.push({
        test: /\.node$/,
        loader: "null-loader",
      });

      // Handle problematic ES6 modules
      config.module.rules.push({
        test: /\.(js|mjs)$/,
        include: /node_modules/,
        type: "javascript/auto",
        resolve: {
          fullySpecified: false,
        },
      });
    }

    return config;
  },
  typescript: {
    ignoreBuildErrors: true
  },
  eslint: {
    ignoreDuringBuilds: true
  }
};

export default nextConfig;
