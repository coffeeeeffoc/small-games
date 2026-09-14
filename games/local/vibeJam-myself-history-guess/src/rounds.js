import { createCatalog, catalogCities } from "./catalog.js";
import { baseCities } from "./cities.js";

// Vite discovers every scene file. Adding content requires no registry edits.
const modules = import.meta.glob("./scenes/*.json", {
  eager: true,
  import: "default",
});
export const rounds = createCatalog(
  Object.values(modules),
  import.meta.env.BASE_URL,
);
export const cities = catalogCities(rounds, baseCities);
