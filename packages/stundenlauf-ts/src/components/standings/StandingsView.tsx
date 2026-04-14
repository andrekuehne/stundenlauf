/**
 * Standings screen: sidebar + content layout wrapper.
 */

import { STR } from "@/strings.ts";
import type { FoundationViewProps } from "@/components/foundation-view-props.ts";

export function StandingsView({ seasonLabel, reviewLabel }: FoundationViewProps) {
  return (
    <section className="foundation-view" aria-label={STR.views.standings.title}>
      <h2>{STR.views.standings.title}</h2>
      <p>{STR.views.standings.placeholder}</p>
      <p className="foundation-view__meta">
        <span>{seasonLabel}</span>
        <span>{reviewLabel}</span>
      </p>
    </section>
  );
}
