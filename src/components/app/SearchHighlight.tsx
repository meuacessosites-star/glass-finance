import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MatchSegment = {
  text: string;
  highlighted: boolean;
};

function normalizeSearchValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function getMatchSegments(value: string, query: string): MatchSegment[] {
  const normalizedQuery = normalizeSearchValue(query.trim());
  if (!normalizedQuery) return [{ text: value, highlighted: false }];

  const characters = Array.from(value);
  const normalizedCharacters: string[] = [];
  const characterRanges: Array<{ start: number; end: number }> = [];
  let originalOffset = 0;

  for (const character of characters) {
    const normalizedCharacter = normalizeSearchValue(character);
    for (const normalizedUnit of Array.from(normalizedCharacter)) {
      normalizedCharacters.push(normalizedUnit);
      characterRanges.push({
        start: originalOffset,
        end: originalOffset + character.length,
      });
    }
    originalOffset += character.length;
  }

  const normalizedValue = normalizedCharacters.join("");
  const segments: MatchSegment[] = [];
  let normalizedOffset = 0;
  let originalOffsetForSegment = 0;

  while (normalizedOffset < normalizedValue.length) {
    const matchStart = normalizedValue.indexOf(normalizedQuery, normalizedOffset);
    if (matchStart === -1) break;

    const originalStart = characterRanges[matchStart]?.start ?? originalOffsetForSegment;
    const matchEnd = matchStart + normalizedQuery.length;
    const originalEnd = characterRanges[matchEnd - 1]?.end ?? originalStart;

    if (originalStart > originalOffsetForSegment) {
      segments.push({
        text: value.slice(originalOffsetForSegment, originalStart),
        highlighted: false,
      });
    }
    segments.push({
      text: value.slice(originalStart, originalEnd),
      highlighted: true,
    });

    originalOffsetForSegment = originalEnd;
    normalizedOffset = matchEnd;
  }

  if (originalOffsetForSegment < value.length) {
    segments.push({
      text: value.slice(originalOffsetForSegment),
      highlighted: false,
    });
  }

  return segments.length > 0 ? segments : [{ text: value, highlighted: false }];
}

export function SearchHighlight({
  children,
  query,
  className,
}: {
  children: ReactNode;
  query?: string;
  className?: string;
}) {
  const value = typeof children === "string" ? children : null;
  if (value === null || !query?.trim()) return <>{children}</>;

  return (
    <>
      {getMatchSegments(value, query).map((segment, index) =>
        segment.highlighted ? (
          <mark
            key={`${segment.text}-${index}`}
            className={cn(
              "rounded-[0.25rem] bg-[#FFE58F] px-0.5 text-inherit shadow-[0_0_0_1px_rgba(245,158,11,0.12)] dark:bg-[#F5C451]/35",
              className,
            )}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`${segment.text}-${index}`}>{segment.text}</span>
        ),
      )}
    </>
  );
}

export function scrollToSearchResult(resultId: string): void {
  if (typeof document === "undefined") return;
  const result = Array.from(
    document.querySelectorAll<HTMLElement>("[data-search-result-id]"),
  ).find((element) => element.dataset.searchResultId === resultId);
  result?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function scrollToFirstSearchResult(): void {
  if (typeof document === "undefined") return;
  document
    .querySelector<HTMLElement>("[data-search-result-id]")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function withSearchResultId(resultId: string): {
  "data-search-result-id": string;
} {
  return { "data-search-result-id": resultId };
}
