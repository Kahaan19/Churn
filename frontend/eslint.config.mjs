import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      // The e2e run builds into its own directory so it can be compiled against a different API.
      ".next-e2e/**",
      "playwright-report/**",
      "test-results/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src/lib/api/generated.ts",
    ],
  },
];

export default eslintConfig;
