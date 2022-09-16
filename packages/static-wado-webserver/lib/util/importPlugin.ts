import { importPlugin as cpImportPlugin } from "config-point";

export default function importPlugin(name) {
  return cpImportPlugin(name, (moduleName) => import(moduleName));
}
