const readline = require("node:readline");
const {
  argv,
  argv0,
  exit,
  stdin: input,
  stdout: output,
} = require("node:process");

const StaticWado = require("./StaticWado");
const adaptProgramOpts = require("./util/adaptProgramOpts");

module.exports = async function createMain(options, program) {
  const rl = readline.createInterface({ input, output });
  for await (const line of rl) {
    if (!line) continue;
    if (line.startsWith("exit")) {
      exit(0);
    }
    argv.splice(2, argv.length - 2, ...line.split(" "));
    console.verbose("exec mkdicomweb", JSON.stringify(argv));

    // Configure program commander
    await StaticWado.configureProgram(StaticWado.mkdicomwebConfig);
    output.write("mkdicomweb server -->\n");
  }
};
