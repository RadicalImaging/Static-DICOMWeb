import { importPlugin } from "config-point";
import "@ohif/static-wado-plugins";

const importer = (name) => import(name);

export default (name) => importPlugin(name, importer);
