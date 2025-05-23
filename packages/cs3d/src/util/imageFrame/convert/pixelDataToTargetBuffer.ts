export function pixelDataToTargetBuffer(imageFrame, targetBuffer) {
  if (targetBuffer) {
    // If we have a target buffer, write to that instead. This helps reduce memory duplication.
    let { offset = null, length = null } = targetBuffer
    const { arrayBuffer, type } = targetBuffer

    let TypedArrayConstructor

    if (length === null) {
      length = imageFrame.pixelDataLength
    }

    if (offset === null) {
      offset = 0
    }

    switch (type) {
      case "Uint8Array":
        TypedArrayConstructor = Uint8Array
        break
      case "Uint16Array":
        TypedArrayConstructor = Uint16Array
        break
      case "Float32Array":
        TypedArrayConstructor = Float32Array
        break
      default:
        throw new Error("target array for image does not have a valid type.")
    }

    if (length !== imageFrame.pixelDataLength) {
      throw new Error(
        "target array for image does not have the same length as the decoded image length."
      )
    }

    // TypedArray.Set is api level and ~50x faster than copying elements even for
    // Arrays of different types, which aren't simply memcpy ops.
    let typedArray

    if (arrayBuffer) {
      typedArray = new TypedArrayConstructor(arrayBuffer, offset, length)
    } else {
      typedArray = new TypedArrayConstructor(imageFrame.pixelData)
    }

    // If need to scale, need to scale correct array.
    imageFrame.pixelData = typedArray

    return true
  }

  return false
}

export default pixelDataToTargetBuffer
