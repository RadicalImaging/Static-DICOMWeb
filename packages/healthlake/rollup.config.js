import babel from "@rollup/plugin-babel";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import pkg from "./package.json" assert { type: "json" };

export default {
  input: "lib/index.mjs",
  output: [
    {
      file: pkg.main,
      format: "umd",
      name: "@radicalimaging/healthlake",
      sourcemap: true
    },
    {
      file: pkg.module,
      format: "es",
      sourcemap: true
    }
  ],
  plugins: [
    resolve({
      browser: true
    }),
    commonjs(),
    babel({
      //babelHelpers: 'runtime',
      exclude: "node_modules/**"
    }),
    json()
  ]
};
