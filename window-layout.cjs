function normalizeWindowSize(value, minimumWidth, minimumHeight) {
  if (!value || typeof value !== 'object') return null;
  const width = Math.round(Number(value.width));
  const height = Math.round(Number(value.height));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return {
    width: Math.min(8192, Math.max(minimumWidth, width)),
    height: Math.min(8192, Math.max(minimumHeight, height))
  };
}

function fitWindowBoundsToWorkArea({
  bounds,
  workArea,
  margin = 0,
  minimumWidth = 1,
  minimumHeight = 1,
  center = false
}) {
  const workX = Number.isFinite(Number(workArea?.x)) ? Math.round(Number(workArea.x)) : 0;
  const workY = Number.isFinite(Number(workArea?.y)) ? Math.round(Number(workArea.y)) : 0;
  const workWidth = Math.max(1, Math.round(Number(workArea?.width) || 1));
  const workHeight = Math.max(1, Math.round(Number(workArea?.height) || 1));
  const requestedMargin = Math.max(0, Math.round(Number(margin) || 0));
  const horizontalInset = Math.min(workWidth - 1, requestedMargin * 2);
  const verticalInset = Math.min(workHeight - 1, requestedMargin * 2);
  const safeX = workX + Math.floor(horizontalInset / 2);
  const safeY = workY + Math.floor(verticalInset / 2);
  const availableWidth = workWidth - horizontalInset;
  const availableHeight = workHeight - verticalInset;
  const effectiveMinimumWidth = Math.min(
    availableWidth,
    Math.max(1, Math.round(Number(minimumWidth) || 1))
  );
  const effectiveMinimumHeight = Math.min(
    availableHeight,
    Math.max(1, Math.round(Number(minimumHeight) || 1))
  );
  const requestedWidth = Number.isFinite(Number(bounds?.width)) && Number(bounds.width) > 0
    ? Math.round(Number(bounds.width))
    : effectiveMinimumWidth;
  const requestedHeight = Number.isFinite(Number(bounds?.height)) && Number(bounds.height) > 0
    ? Math.round(Number(bounds.height))
    : effectiveMinimumHeight;
  const width = Math.min(availableWidth, Math.max(effectiveMinimumWidth, requestedWidth));
  const height = Math.min(availableHeight, Math.max(effectiveMinimumHeight, requestedHeight));
  const maximumX = safeX + availableWidth - width;
  const maximumY = safeY + availableHeight - height;
  const preferredX = Number.isFinite(Number(bounds?.x)) ? Math.round(Number(bounds.x)) : safeX;
  const preferredY = Number.isFinite(Number(bounds?.y)) ? Math.round(Number(bounds.y)) : safeY;

  return {
    x: center ? Math.round(safeX + (availableWidth - width) / 2) : Math.min(maximumX, Math.max(safeX, preferredX)),
    y: center ? Math.round(safeY + (availableHeight - height) / 2) : Math.min(maximumY, Math.max(safeY, preferredY)),
    width,
    height
  };
}

function calculateHighlightWindowBounds({
  workArea,
  preferredSize,
  content = '',
  margin = 24,
  minimumWidth = 680,
  minimumHeight = 520,
  defaultWidth = 1080,
  defaultHeight = 560,
  maximumContentHeight = 780
}) {
  const preferredWidth = Number.isFinite(Number(preferredSize?.width)) && Number(preferredSize.width) > 0
    ? Number(preferredSize.width)
    : defaultWidth;
  const preferredHeight = Number.isFinite(Number(preferredSize?.height)) && Number(preferredSize.height) > 0
    ? Number(preferredSize.height)
    : defaultHeight;
  const baseBounds = fitWindowBoundsToWorkArea({
    bounds: {
      x: Number(workArea?.x) || 0,
      y: Number(workArea?.y) || 0,
      width: preferredWidth,
      height: preferredHeight
    },
    workArea,
    margin,
    minimumWidth,
    minimumHeight,
    center: true
  });
  const text = String(content || '');
  if (!text) return baseBounds;

  // The visual reserves roughly 320px for the avatar and chrome. Count explicit
  // line breaks as well as wrapping so a saved short window cannot crop a long
  // comment. This expansion is per-item and is deliberately not persisted.
  const charactersPerLine = Math.max(14, Math.floor((baseBounds.width - 320) / 34));
  const estimatedLineCount = text.split(/\r\n|\r|\n/).reduce((total, line) => (
    total + Math.max(1, Math.ceil(Array.from(line).length / charactersPerLine))
  ), 0);
  const contentHeightLimit = Math.max(
    minimumHeight,
    Math.round(Number(maximumContentHeight) || minimumHeight)
  );
  const estimatedContentHeight = Math.min(contentHeightLimit, 360 + estimatedLineCount * 54);

  return fitWindowBoundsToWorkArea({
    bounds: {
      ...baseBounds,
      height: Math.max(baseBounds.height, estimatedContentHeight)
    },
    workArea,
    margin,
    minimumWidth,
    minimumHeight,
    center: true
  });
}

function calculateAspectRatioSize({
  preferredWidth,
  maximumWidth,
  maximumHeight,
  minimumWidth,
  minimumHeight,
  aspectRatio
}) {
  const ratio = Number(aspectRatio);
  if (!Number.isFinite(ratio) || ratio <= 0) return null;

  const maxWidth = Math.max(1, Math.floor(Math.min(maximumWidth, maximumHeight * ratio)));
  const requestedMinimumWidth = Math.ceil(Math.max(minimumWidth, minimumHeight * ratio));
  const effectiveMinimumWidth = Math.min(maxWidth, requestedMinimumWidth);
  const width = Math.max(
    effectiveMinimumWidth,
    Math.min(maxWidth, Math.round(preferredWidth))
  );
  const height = Math.max(1, Math.min(Math.floor(maximumHeight), Math.round(width / ratio)));
  return { width, height };
}

function fitAspectRatioBounds({
  bounds,
  workArea,
  aspectRatio,
  minimumWidth = 1,
  minimumHeight = 1
}) {
  const size = calculateAspectRatioSize({
    preferredWidth: Number(bounds?.width) || minimumWidth,
    maximumWidth: Math.max(1, Number(workArea?.width) || 1),
    maximumHeight: Math.max(1, Number(workArea?.height) || 1),
    minimumWidth,
    minimumHeight,
    aspectRatio
  });
  if (!size) return null;

  const workX = Math.round(Number(workArea?.x) || 0);
  const workY = Math.round(Number(workArea?.y) || 0);
  const maximumX = workX + Math.max(1, Math.round(Number(workArea?.width) || 1)) - size.width;
  const maximumY = workY + Math.max(1, Math.round(Number(workArea?.height) || 1)) - size.height;
  const preferredX = Number.isFinite(Number(bounds?.x)) ? Math.round(Number(bounds.x)) : workX;
  const preferredY = Number.isFinite(Number(bounds?.y)) ? Math.round(Number(bounds.y)) : workY;

  return {
    x: Math.min(maximumX, Math.max(workX, preferredX)),
    y: Math.min(maximumY, Math.max(workY, preferredY)),
    ...size
  };
}

function calculateResizeBounds({
  bounds,
  workArea,
  minimumWidth,
  minimumHeight,
  edge,
  deltaX,
  deltaY,
  aspectRatio
}) {
  const right = bounds.x + bounds.width;
  const maximumWidth = edge === 'bottom-left'
    ? right - workArea.x
    : workArea.x + workArea.width - bounds.x;
  const maximumHeight = workArea.y + workArea.height - bounds.y;
  const desiredWidth = edge === 'bottom-left'
    ? bounds.width - deltaX
    : bounds.width + deltaX;
  const ratio = Number(aspectRatio);
  if (Number.isFinite(ratio) && ratio > 0) {
    const desiredWidthFromHeight = (bounds.height + deltaY) * ratio;
    const horizontalChange = desiredWidth - bounds.width;
    const verticalChange = desiredWidthFromHeight - bounds.width;
    const preferredWidth = Math.abs(horizontalChange) >= Math.abs(verticalChange)
      ? desiredWidth
      : desiredWidthFromHeight;
    const size = calculateAspectRatioSize({
      preferredWidth,
      maximumWidth,
      maximumHeight,
      minimumWidth,
      minimumHeight,
      aspectRatio: ratio
    });
    return {
      x: edge === 'bottom-left' ? right - size.width : bounds.x,
      y: bounds.y,
      ...size
    };
  }
  const width = Math.round(Math.max(Math.min(minimumWidth, maximumWidth), Math.min(maximumWidth, desiredWidth)));
  const height = Math.round(Math.max(
    Math.min(minimumHeight, maximumHeight),
    Math.min(maximumHeight, bounds.height + deltaY)
  ));
  return {
    x: edge === 'bottom-left' ? right - width : bounds.x,
    y: bounds.y,
    width,
    height
  };
}

module.exports = {
  calculateHighlightWindowBounds,
  calculateResizeBounds,
  fitAspectRatioBounds,
  fitWindowBoundsToWorkArea,
  normalizeWindowSize
};
