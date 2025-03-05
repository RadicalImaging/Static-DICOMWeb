const api = require("../../lib/index.js")
const { createCanvas } = require("canvas")

describe("@radicalimaging/cs3d", () => {
  it("Should load cs3d", () => {
    expect(api.getRenderedBuffer).not.toBeUndefined()
    expect(api.renderToCanvas).not.toBeUndefined()
  })

  it("Canvas should work", () => {
    const canvas = createCanvas(200, 200)
    const ctx = canvas.getContext("2d")
    expect(ctx).not.toBeUndefined()
    ctx.rotate(0.1)
    ctx.fillText("Awesome!", 50, 100)

    // Draw line under text
    var text = ctx.measureText("Awesome!")
    ctx.strokeStyle = "rgba(0,0,0,0.5)"
    ctx.beginPath()
    ctx.lineTo(50, 102)
    ctx.lineTo(50 + text.width, 102)
    ctx.stroke()
    expect(canvas.toDataURL()).not.toBeUndefined()
  })
})
