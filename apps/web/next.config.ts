import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The @opes/shared workspace package ships TypeScript source; Next compiles it.
  transpilePackages: ['@opes/shared'],
};

export default nextConfig;
