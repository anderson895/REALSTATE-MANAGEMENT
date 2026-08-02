import type { NextConfig } from 'next';
import { loadRootEnv } from '../../load-root-env.mjs';

// Both apps share one .env.local at the workspace root. Next reads .env files
// relative to the app directory, so load it explicitly before the config is
// evaluated.
loadRootEnv();

/**
 * Web-Based Real Estate Portal — buyer-facing, DEPLOYED PUBLICLY.
 * See Development Plan.md §5.7.
 */
const nextConfig: NextConfig = {
  // Workspace packages ship as TypeScript source, so Next must compile them.
  transpilePackages: ['@sfsr/domain', '@sfsr/infrastructure', '@sfsr/ui'],

  // firebase-admin pulls in google-gax and @grpc/grpc-js, which need Node
  // built-ins (fs, net, dns). Left to bundle, they break the build.
  serverExternalPackages: ['firebase-admin', 'google-gax', '@grpc/grpc-js', '@google-cloud/vision'],

  images: {
    // Project renders and floor plans are served from Cloudinary (§2.4).
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },

  typedRoutes: true,
};

export default nextConfig;
