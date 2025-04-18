import babel from "@rollup/plugin-babel";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import json from "@rollup/plugin-json";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", { encoding: "utf8" }));

export default [
  // ESM configuration
  {
    external: [],
    input: pkg.src || "lib/index.js",
    output: [
      {
        dir: "dist/esm",
        format: "esm",
        sourcemap: true,
        preserveModules: true,
        preserveModulesRoot: "src",
      },
    ],
    plugins: [
      resolve({
        preferBuiltins: true,
        browser: true,
      }),
      typescript({
        rootDir: "src",
        outDir: "dist/esm",
        allowJs: true,
        checkJs: false,
        strict: false,
        declaration: true,
        emitDeclarationOnly: false,
        lib: ["ES2022", "dom"],
        target: "ES2022",
        module: "esnext",
        moduleResolution: "node",
        sourceMap: false,
        exclude: ["node_modules", "dist", "examples/", "old-examples"],
      }),
      babel({
        exclude: "node_modules/**",
        babelHelpers: "runtime",
        presets: ["@babel/preset-env"],
        plugins: ["@babel/plugin-transform-runtime"],
        extensions: [".js", ".ts", ".mjs"],
      }),
      json(),
    ],
  },
];
