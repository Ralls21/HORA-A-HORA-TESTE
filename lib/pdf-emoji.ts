const EMOJI_PATTERN = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u200D|\u20E3)/u;
const MM_TO_CSS_PX = 96 / 25.4;

export type RasterizedPdfText = {
  dataUrl: string;
  widthMm: number;
  heightMm: number;
};

type RasterizeOptions = {
  maxWidthMm: number;
  fontSizePt: number;
  color: string;
  fontWeight?: "normal" | "bold";
  lineHeight?: number;
  singleLine?: boolean;
};

export function containsEmoji(value: string) {
  return EMOJI_PATTERN.test(value);
}

function graphemes(value: string) {
  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("pt-BR", { granularity: "grapheme" });
    return Array.from(segmenter.segment(value), (item) => item.segment);
  }
  return Array.from(value);
}

function splitLongWord(context: CanvasRenderingContext2D, word: string, maxWidth: number) {
  const parts: string[] = [];
  let current = "";

  for (const character of graphemes(word)) {
    const candidate = current + character;
    if (current && context.measureText(candidate).width > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function wrapText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  const lines: string[] = [];

  for (const paragraph of value.replace(/\r\n/g, "\n").split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
        current = "";
      }

      const wordParts = splitLongWord(context, word, maxWidth);
      if (wordParts.length > 1) lines.push(...wordParts.slice(0, -1));
      current = wordParts.at(-1) ?? "";
    }

    if (current) lines.push(current);
  }

  return lines.length ? lines : [""];
}

/**
 * Rasteriza apenas textos com emoji usando as fontes nativas do navegador.
 * O PNG fica incorporado no PDF, portanto o emoji continua visível mesmo em
 * leitores de PDF que não tenham a mesma fonte instalada.
 */
export function rasterizePdfText(value: string, options: RasterizeOptions): RasterizedPdfText | null {
  if (typeof document === "undefined") return null;

  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) return null;

  const maxWidthPx = options.maxWidthMm * MM_TO_CSS_PX;
  const fontFamily = 'Arial, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  let fontSizePx = options.fontSizePt * (96 / 72);
  const fontWeight = options.fontWeight ?? "normal";
  const setFont = () => {
    measureContext.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
  };
  setFont();

  if (options.singleLine) {
    const measuredWidth = measureContext.measureText(value).width;
    if (measuredWidth > maxWidthPx) {
      fontSizePx = Math.max(7, fontSizePx * (maxWidthPx / measuredWidth));
      setFont();
    }
  }

  const lines = options.singleLine ? [value.replace(/\s*\n\s*/g, " ")] : wrapText(measureContext, value, maxWidthPx);
  const measuredLineWidth = Math.max(...lines.map((line) => measureContext.measureText(line || " ").width));
  const logicalWidth = Math.max(1, Math.min(maxWidthPx, measuredLineWidth + 1));
  const lineHeightPx = fontSizePx * (options.lineHeight ?? 1.35);
  const logicalHeight = Math.max(1, lines.length * lineHeightPx);
  const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const pixelRatio = Math.max(2, Math.min(devicePixelRatio, 3));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(logicalWidth * pixelRatio);
  canvas.height = Math.ceil(logicalHeight * pixelRatio);

  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(pixelRatio, pixelRatio);
  context.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
  context.fillStyle = options.color;
  context.textBaseline = "middle";

  lines.forEach((line, index) => {
    context.fillText(line, 0, (index + 0.5) * lineHeightPx);
  });

  return {
    dataUrl: canvas.toDataURL("image/png"),
    widthMm: logicalWidth / MM_TO_CSS_PX,
    heightMm: logicalHeight / MM_TO_CSS_PX,
  };
}
