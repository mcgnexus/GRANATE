export type SourceMap = number[];

export function identitySourceMap(length: number, baseOffset = 0): SourceMap {
  return Array.from({ length: length + 1 }, (_, index) => baseOffset + index);
}

/** Aplica reemplazos de texto manteniendo el offset original de cada límite. */
export function transformWithSourceMap(
  source: string,
  sourceMap: SourceMap,
  pattern: RegExp,
  replace: (match: RegExpExecArray) => string,
): { text: string; sourceMap: SourceMap } {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  let text = "";
  const mappedOffsets: SourceMap = [sourceMap[0] ?? 0];
  let cursor = 0;
  let match: RegExpExecArray | null;

  const appendUnchanged = (end: number) => {
    text += source.slice(cursor, end);
    for (let index = cursor; index < end; index += 1) {
      mappedOffsets.push(sourceMap[index + 1] ?? sourceMap[index] ?? 0);
    }
    cursor = end;
  };

  while ((match = matcher.exec(source)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    appendUnchanged(start);

    const replacement = replace(match);
    text += replacement;
    if (replacement.length === 0) {
      mappedOffsets[mappedOffsets.length - 1] = sourceMap[end] ?? 0;
    } else {
      for (let index = 0; index < replacement.length; index += 1) {
        mappedOffsets.push(
          index === replacement.length - 1
            ? sourceMap[end] ?? 0
            : sourceMap[start] ?? 0,
        );
      }
    }
    cursor = end;
  }

  appendUnchanged(source.length);
  return { text, sourceMap: mappedOffsets };
}

export function replaceSourceRange(
  source: string,
  start: number,
  end: number,
  expected: string,
  replacement: string,
): string | null {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > source.length ||
    source.slice(start, end) !== expected
  ) {
    return null;
  }

  return source.slice(0, start) + replacement + source.slice(end);
}
