import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
