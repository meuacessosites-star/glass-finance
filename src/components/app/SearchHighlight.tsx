import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

type MatchSegment = {
  text: string;
  highlighted: boolean;
};

const SEARCH_MATCH_SELECTOR = '[data-search-match-result="true"]';

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

function getSearchMatchElements(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll<HTMLElement>(SEARCH_MATCH_SELECTOR));
}

function scrollElementIntoView(element: HTMLElement | undefined): void {
  element?.scrollIntoView({ behavior: "smooth", block: "center" });
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
  scrollElementIntoView(result);
}

export function scrollToFirstSearchResult(): void {
  scrollElementIntoView(getSearchMatchElements()[0]);
}

export function useSearchNavigation(query?: string) {
  const normalizedQuery = query?.trim() ?? "";
  const [navigationState, setNavigationState] = useState({
    query: "",
    index: -1,
  });
  const activeIndex =
    navigationState.query === normalizedQuery ? navigationState.index : -1;

  const navigateResults = (direction: -1 | 1) => {
    const results = getSearchMatchElements();
    if (results.length === 0) return;

    const nextIndex =
      activeIndex < 0
        ? direction === 1
          ? 0
          : results.length - 1
        : (activeIndex + direction + results.length) % results.length;

    setNavigationState({ query: normalizedQuery, index: nextIndex });
    scrollElementIntoView(results[nextIndex]);
  };

  return {
    activeIndex,
    goToPrevious: () => navigateResults(-1),
    goToNext: () => navigateResults(1),
  };
}

export function SearchNavigationControls({
  query,
  resultCount,
  activeIndex,
  onPrevious,
  onNext,
  className,
}: {
  query?: string;
  resultCount: number;
  activeIndex: number;
  onPrevious: () => void;
  onNext: () => void;
  className?: string;
}) {
  if (!query?.trim()) return null;

  const hasResults = resultCount > 0;
  const visibleIndex = hasResults
    ? Math.min(activeIndex >= 0 ? activeIndex + 1 : 1, resultCount)
    : 0;

  return (
    <div className={cn("flex shrink-0 items-center gap-0.5", className)} aria-label="Navegação pelos resultados">
      <span className="mr-0.5 min-w-[2.75rem] text-center text-[10px] font-semibold tabular-nums text-glass-faint">
        {visibleIndex}/{resultCount}
      </span>
      <button
        type="button"
        aria-label="Resultado anterior"
        title="Resultado anterior"
        disabled={!hasResults}
        onClick={onPrevious}
        className="flex size-11 items-center justify-center rounded-lg text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-glass-ink active:scale-95 disabled:pointer-events-none disabled:opacity-35"
      >
        <ChevronUp className="size-3.5" strokeWidth={2.4} />
      </button>
      <button
        type="button"
        aria-label="Próximo resultado"
        title="Próximo resultado"
        disabled={!hasResults}
        onClick={onNext}
        className="flex size-11 items-center justify-center rounded-lg text-glass-sub transition-colors hover:bg-glass-ink/10 hover:text-glass-ink active:scale-95 disabled:pointer-events-none disabled:opacity-35"
      >
        <ChevronDown className="size-3.5" strokeWidth={2.4} />
      </button>
    </div>
  );
}

export function withSearchResultId(resultId: string): {
  "data-search-result-id": string;
} {
  return { "data-search-result-id": resultId };
}
