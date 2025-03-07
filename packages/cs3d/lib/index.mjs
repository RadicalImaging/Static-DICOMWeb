import * as api from "./api/index.js"
import * as cs3d from "@cornerstonejs/core"

console.error("Exporting api=", api)
console.error("Exporting cs3d=", cs3d)

const { getRenderedBuffer, renderToCanvas } = api
const testExport = 123
export default { api, testExport, cs3d, getRenderedBuffer, renderToCanvas }
export { api, cs3d, getRenderedBuffer, renderToCanvas, testExport }
