import { readFileSync, readdirSync, statSync } from "node:fs";
import { createCatalog } from "../src/catalog.js";

export function readScenes() {
  return readdirSync(new URL("../src/scenes/", import.meta.url))
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      try {
        return JSON.parse(
          readFileSync(
            new URL(`../src/scenes/${file}`, import.meta.url),
            "utf8",
          ),
        );
      } catch (error) {
        throw new Error(`${file}: ${error.message}`);
      }
    });
}

export function checkCatalog() {
  const scenes = createCatalog(readScenes(), "");
  if (!scenes.length) throw new Error("场景目录为空");
  for (const scene of scenes) {
    const file = new URL(`../public/${scene.image}`, import.meta.url);
    if (!statSync(file).isFile() || statSync(file).size === 0)
      throw new Error(`${scene.id}: 图片为空`);
  }
  console.log(
    `场景校验通过：${scenes.length} 幕，中国 ${scenes.filter((s) => s.region === "china").length} 幕，世界 ${scenes.filter((s) => s.region === "world").length} 幕`,
  );
  return scenes;
}
