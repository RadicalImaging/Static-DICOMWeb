const getNumberOfFrames = (dataSet) => {
    
    if(dataSet.elements.x00280008) {
        const numberOfFramesString = dataSet.string('x00280008')
        if(numberOfFramesString.length === 0) {
            return 1
        }
        const numberOfFrames = parseInt(numberOfFramesString)
        return numberOfFrames
    }
    return 1
}

module.exports = getNumberOfFrames