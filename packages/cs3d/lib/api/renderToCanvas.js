/**
 * Object that contains keys that maps to canvas properties.
 * Each render process will use the key at different moment to change style of drawing.
 * Value of each key property defines the canvas style object. But if its not a valid style property so it will just be ignored.
 */
const DEFAULT_STYLES = {
  textStyle: { font: "16px serif", fillStyle: "red" },
  lineStyle: { strokeStyle: "black" },
  pointStyle: { strokeStyle: "red", fillStyle: "red" },
};

function setContextProperty(ctx, property, value) {
  if (ctx[property]) {
    ctx[property] = value;
  }
}

function setContextStyles(ctx, styles, styleKeys) {
  styleKeys.forEach((styleKey) => {
    const styleObject = styles[styleKey];
    if (styleObject) {
      Object.keys(styleObject).forEach((key) => {
        setContextProperty(ctx, key, styleObject[key]);
      });
    }
  });
}
function renderTextToCanvas(
  canvas,
  text,
  pos,
  size,
  styles = { textStyle: DEFAULT_STYLES.textStyle },
) {
  const [x, y] = pos;
  const ctx = canvas.getContext("2d");
  setContextStyles(ctx, styles, ["textStyle"]);

  const { width, height = 16 } = ctx.measureText(text);
  ctx.fillText(text, x, y);

  return {
    width,
    height,
  };
}

function renderLinesToCanvas(
  canvas,
  points,
  size,
  styles = { lineStyle: DEFAULT_STYLES.lineStyle },
) {
  const ctx = canvas.getContext("2d");

  if (!points.length || !ctx) {
    return;
  }

  setContextStyles(ctx, styles, ["lineStyle"]);

  const [[x, y], ...rest] = points;
  ctx.beginPath();
  ctx.moveTo(x, y);
  rest.forEach(([px, py]) => {
    ctx.lineTo(px, py);
  });

  ctx.lineWidth = size;

  ctx.stroke();
}

function renderPointToCanvas(
  canvas,
  point,
  size,
  styles = { pointSyle: DEFAULT_STYLES.pointStyle },
) {
  const ctx = canvas.getContext("2d");

  if (!point || !ctx) {
    return;
  }

  setContextStyles(ctx, styles, ["pointStyle"]);

  const [x, y] = point;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, 2 * Math.PI);
  ctx.fill();
}

function renderHLineToCanvas(
  canvas,
  position,
  width,
  height,
  styles = { lineStyle: DEFAULT_STYLES.lineStyle },
) {
  const points = [
    [position[0], position[1]],
    [position[0] + width, position[1]],
  ];

  renderLinesToCanvas(canvas, points, height, styles);

  return {
    width,
    height,
  };
}

function renderCross(canvas, centerPoint, size, styles) {
  const lineLength = 5 * size;
  const [x, y] = centerPoint;
  const pointsH = [
    [x - lineLength, y],
    [x + lineLength, y],
  ];
  const pointsV = [
    [x, y - lineLength],
    [x, y + lineLength],
  ];
  renderLinesToCanvas(canvas, pointsH, size, styles);
  renderLinesToCanvas(canvas, pointsV, size, styles);
}

function renderSemiCross(_canvas, centerPoint, _size, _styles) {
  const lineLength = 5 * _size;
  const [x, y] = centerPoint;
  const pointsH = [
    [x - lineLength, y],
    [x, y],
  ];
  const pointsV = [
    [x, y - lineLength],
    [x, y],
  ];
  renderLinesToCanvas(_canvas, pointsH, _size, _styles);
  renderLinesToCanvas(_canvas, pointsV, _size, _styles);
}

function renderPointsToCanvas(
  canvas,
  points,
  strategy,
  size = 2,
  styles = {
    lineStyle: DEFAULT_STYLES.lineStyle,
    pointStyle: DEFAULT_STYLES.pointStyle,
  },
) {
  points.forEach((point, index) => {
    const useStyles = { ...styles };
    // Grab indexed values to allow assigning each point a different style.
    Object.keys(styles).forEach((key) => {
      const value = styles[key];
      if (Array.isArray(value)) useStyles[key] = value[index % value.length];
    });
    switch (strategy) {
      case "cross":
        renderCross(canvas, point, size, useStyles);
        break;
      case "semicross":
        renderSemiCross(canvas, point, size, useStyles);
        break;
      default:
        throw new Error(`Unknown strategy ${strategy}`);
    }
    renderPointToCanvas(canvas, point, 2 * size, useStyles);
  });
}

function renderContentToCanvas(enabledElement, content, styles) {
  if (!enabledElement || !enabledElement.canvas) {
    return;
  }

  let result;
  switch (content.type) {
    case "text":
      result = renderTextToCanvas(
        enabledElement.canvas,
        content.text,
        content.position,
        content.size,
        styles,
      );
      break;
    case "hLine":
      result = renderHLineToCanvas(
        enabledElement.canvas,
        content.position,
        content.width,
        content.height * content.size,
        styles,
      );
      break;
    case "points":
      result = renderPointsToCanvas(
        enabledElement.canvas,
        content.points,
        content.strategy,
        content.size,
        styles,
      );
      break;
    default:
      throw new Error(`Unknown type ${content.type} in ${content}`);
  }

  return result;
}

module.exports = renderContentToCanvas;
