import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The e2e run points the client at its own API port, and NEXT_PUBLIC_* values are inlined at
  // compile time — sharing a build directory with the dev server would serve it a bundle compiled
  // against the wrong backend.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  async redirects() {
    return [
      // BUILD_PLAN.md names this URL for a scored batch; Phase 4 shipped it nested under the
      // scoring flow, where it has a parent page that lists scored files. The spec'd URL keeps
      // working rather than 404ing for anyone who followed the plan (see DECISIONS.md).
      {
        source: "/predictions/:batchId",
        destination: "/predict/batches/:batchId",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
