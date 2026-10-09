import { checkCatalog } from "./scripts/check-catalog.mjs";

export default {
  plugins: [{ name: "validate-history-scenes", buildStart: checkCatalog }],
  server: {
    proxy: { "/api/history": "http://127.0.0.1:4185" },
    fs: { deny: [".env", ".env.*", "**/*.{crt,pem}", "**/.git/**", "**/server/**", "**/*.sqlite*"] },
  },
  preview: { proxy: { "/api/history": "http://127.0.0.1:4185" } },
};
