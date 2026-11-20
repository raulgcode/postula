import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  // Found late, these made Vite re-bundle and reload the first page opened after `pnpm dev`,
  // wiping what an action had just answered (the "we sent a link" on /login).
  optimizeDeps: {
    include: [
      "@conform-to/react",
      "@conform-to/zod/v4",
      "class-variance-authority",
      "clsx",
      "lucide-react",
      "radix-ui",
      "tailwind-merge",
      "zod/mini",
    ],
  },
  resolve: {
    tsconfigPaths: true,
  },
});
