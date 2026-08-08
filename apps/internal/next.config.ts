import type { NextConfig } from 'next';
import { loadRootEnv } from '../../load-root-env.mjs';

// Both apps share one .env.local at the workspace root. Next reads .env files
// relative to the app directory, so load it explicitly before the config is
// evaluated.
loadRootEnv();

/**
 * Internal Management System — employee-facing.
 *
 * RUNS LOCALLY on an office LAN server (one machine, `npm start`, reachable at
 * http://<office-ip>:3001). It is NOT deployed to the public internet. Staff
 * workstations are browser clients only; no Firebase Admin credentials live on
 * them. See Development Plan.md §5.7.
 */
const nextConfig: NextConfig = {
  transpilePackages: ['@sfsr/domain', '@sfsr/infrastructure', '@sfsr/ui'],

  // firebase-admin pulls in google-gax and @grpc/grpc-js, which need Node
  // built-ins (fs, net, dns). Left to bundle, they break the build.
  serverExternalPackages: ['firebase-admin', 'google-gax', '@grpc/grpc-js', '@google-cloud/vision'],

  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },

  typedRoutes: true,

  // The dev-only Next.js indicator sits bottom-left by default, directly on
  // top of the sidebar's "SECURE · EFFICIENT · INTEGRATED" badge — it clipped
  // the S and made a finished panel look broken. Nothing in the bottom-right
  // corner of these screens for it to cover.
  devIndicators: { position: 'bottom-right' },

  // This build is served over a trusted LAN, never through a CDN.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // If this build is ever exposed publicly by mistake, search engines
          // must not index it. Defence in depth, not the primary control.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
