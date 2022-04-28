import { importPlugin } from "config-point";

const importer = (name) => import(name);

export default (name) => importPlugin(name, importer);
