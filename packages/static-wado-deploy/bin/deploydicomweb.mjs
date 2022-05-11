import configureProgram from "../lib/program/index.mjs";
import { deployConfig } from "../lib/index.mjs";

// Configure program commander
configureProgram(deployConfig).then((program) =>
  program.main().then((val) => {
    console.log("Done deploy", val);
  })
);
