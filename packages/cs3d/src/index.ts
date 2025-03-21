import * as cs3d from "@cornerstonejs/core"

console.error("Exporting cs3d=", cs3d)

const testExport = 123
export default { testExport, cs3d }
export { cs3d, testExport }
