/**
 * Array of elements to be rendered on image.
 * The array order matters for rendering process. So in case of any dependence, the dependent must come later.
 * There are 3 types of items as far as positioning is concerned:
 * - Dependends on other item =>  the item boundaries will be used on position calculation.
 * - Dependends on image =>  the image boundaries will  be used on position calculation.
 * - Do not dependeds on anyone => it must provide the position.
 */
const renderTemplate = [
  {
    name: "calibrationLength",
    x: 0,
    y: 20,
    reference: "image",
    referenceDirection: "bl",
  },
  {
    name: "zoomLength",
    x: 0,
    y: 20,
    reference: "calibrationLength",
    referenceDirection: "bl",
  },
  {
    name: "description",
    x: 0,
    y: 20,
    reference: "zoomLength",
    referenceDirection: "bl",
  },
  {
    name: "id",
    x: 0,
    y: 20,
    reference: "description",
    referenceDirection: "bl",
  },
  {
    name: "points",
    y: 0,
    x: 0,
    reference: null,
    referenceDirection: null,
  },
];

module.exports.renderTemplate = renderTemplate;
