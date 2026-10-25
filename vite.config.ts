import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Send any request starting with /api to the Express server
    proxy: {
      "/api": process.env.STUDYRAID_API_TARGET ?? "http://localhost:3001",
    },
  },
});
