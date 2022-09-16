import { JSONReader }  from "@radicalimaging/static-wado-util";
import mkdicomwebConfig from "./mkdicomwebConfig";
import StaticWado  from "./StaticWado";
import createMain from './createMain';
import deleteMain from './deleteMain';

StaticWado.mkdicomwebConfig = mkdicomwebConfig;
StaticWado.createMain = createMain;
StaticWado.deleteMain = deleteMain;

export default StaticWado;
export { mkdicomwebConfig, StaticWado, createMain, deleteMain, JSONReader };

