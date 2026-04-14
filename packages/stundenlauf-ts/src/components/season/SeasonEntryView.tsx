/**
 * Season management screen: list, create, open, delete, reset, import, export.
 */

import { STR } from "@/strings.ts";
import type { FoundationViewProps } from "@/components/foundation-view-props.ts";

export function SeasonEntryView({ seasonLabel, reviewLabel }: FoundationViewProps) {
  return (
    <section className="foundation-view" aria-label={STR.views.season.title}>
      <h2>{STR.views.season.title}</h2>
      <p>{STR.views.season.placeholder}</p>
      <p className="foundation-view__meta">
        <span>{seasonLabel}</span>
        <span>{reviewLabel}</span>
      </p>
    </section>
  );
}
