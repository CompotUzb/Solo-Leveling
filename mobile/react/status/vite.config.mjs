import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const webNodeModules = path.resolve(repoRoot, "web/node_modules");
const outDir = path.resolve(
  repoRoot,
  "mobile/app/build/generated/assets/reactStatus/status-react",
);

export default {
  root: __dirname,
  base: "./",
  plugins: [
    {
      name: "android-webview-html",
      closeBundle() {
        const htmlPath = path.resolve(outDir, "index.html");
        if (!fs.existsSync(htmlPath)) return;
        const html = fs
          .readFileSync(htmlPath, "utf8")
          .replace(/\s+type="module"/g, " defer")
          .replace(/\s+crossorigin/g, "");
        fs.writeFileSync(htmlPath, html);
      },
    },
  ],
  resolve: {
    alias: {
      react: path.resolve(webNodeModules, "react/index.js"),
      "react-dom/client": path.resolve(webNodeModules, "react-dom/client.js"),
    },
  },
  esbuild: {
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
  },
  build: {
    outDir,
    emptyOutDir: true,
  },
};
