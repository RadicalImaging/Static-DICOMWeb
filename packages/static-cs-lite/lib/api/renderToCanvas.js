function renderTextToCanvas(canvas, text, pos) {
  // TODO check font size and style
  const [x, y] = pos;
  const ctx = canvas.getContext("2d");
  ctx.font = "16px serif";

  const { width, height = 16 } = ctx.measureText(text);
  ctx.fillText(text, x, y);

  return {
    width,
    height,
  };
}

function renderLinesToCanvas(canvas, points, size) {
  // TODO check font size and style
  const ctx = canvas.getContext("2d");

  if (!points.length || !ctx) {
    return;
  }

  const [[x, y], ...rest] = points;
  ctx.beginPath();
  ctx.moveTo(x, y);
  rest.forEach(([px, py]) => {
    ctx.lineTo(px, py);
  });

  ctx.lineWidth = size;
  ctx.stroke();
}

function renderHLineToCanvas(canvas, position, width, height) {
  const points = [
    [position[0], position[1]],
    [position[0] + width, position[1]],
  ];

  renderLinesToCanvas(canvas, points, height);
  return {
    width,
    height,
  };
}

function renderPointsToCanvas(canvas, points, strategy) {
  const size = 2;
  const ctx = canvas.getContext("2d");
  
  function renderCircle(canvas, point) {
    const [x, y] = point;
    ctx.beginPath();
    ctx.arc(x, y, size, 2 * Math.PI);
    ctx.stroke();
  }

  function renderCross(canvas, centerPoint) {
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
    renderLinesToCanvas(canvas, pointsH, size);
    renderLinesToCanvas(canvas, pointsV, size);
  }

  function renderSemiCross(canvas, centerPoint) {
    const lineLength = 5 * size;
    const [x, y] = centerPoint;
    const pointsH = [
      [x - lineLength, y],
      [x, y],
    ];
    const pointsV = [
      [x, y - lineLength],
      [x, y],
    ];
    renderLinesToCanvas(canvas, pointsH, size);
    renderLinesToCanvas(canvas, pointsV, size);
  }

  points.forEach((point) => {
    renderCircle(canvas, point);
    switch (strategy) {
      case "cross":
        renderCross(canvas, point);
        break;
      case "semicross":
        renderSemiCross(canvas, point);
        break;
    }
  });
  ctx.stroke();
}

function renderContentToCanvas(enabledElement, content) {
  if (!enabledElement || !enabledElement.canvas) {
    return;
  }

  let result;
  switch (content.type) {
    case "text":
      result = renderTextToCanvas(
        enabledElement.canvas,
        content.text,
        content.position
      );
      break;
    case "hLine":
      result = renderHLineToCanvas(
        enabledElement.canvas,
        content.position,
        content.width,
        content.height
      );
      break;
    case "points":
      result = renderPointsToCanvas(
        enabledElement.canvas,
        content.points,
        content.strategy
      );
      break;
  }

  return result;
}

module.exports = renderContentToCanvas;
