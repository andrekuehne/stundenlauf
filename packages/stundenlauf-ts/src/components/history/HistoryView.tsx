/**
 * History screen: import history + audit trail layout.
 */

import { STR } from "@/strings.ts";
import type { FoundationViewProps } from "@/components/foundation-view-props.ts";

export function HistoryView({ seasonLabel, reviewLabel }: FoundationViewProps) {
  return (
    <section className="foundation-view" aria-label={STR.views.history.title}>
      <h2>{STR.views.history.title}</h2>
      <p>{STR.views.history.placeholder}</p>
      <p className="foundation-view__meta">
        <span>{seasonLabel}</span>
        <span>{reviewLabel}</span>
      </p>
    </section>
  );
}
