import { checkCatalog } from "./scripts/check-catalog.mjs";

export default {
  plugins: [{ name: "validate-history-scenes", buildStart: checkCatalog }],
};
