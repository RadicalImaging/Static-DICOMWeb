import { createCanvas } from "canvas"
import * as cs3d from "@cornerstonejs/core"

function main() {
  console.log("Hello canvas", createCanvas(200, 200).width)
  console.log("cs3d=", !!cs3d)
}

main()
