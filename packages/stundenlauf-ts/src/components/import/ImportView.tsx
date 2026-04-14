/**
 * Import screen: controls sidebar + review panel layout.
 */

import { STR } from "@/strings.ts";
import type { FoundationViewProps } from "@/components/foundation-view-props.ts";

export function ImportView({ seasonLabel, reviewLabel }: FoundationViewProps) {
  return (
    <section className="foundation-view" aria-label={STR.views.import.title}>
      <h2>{STR.views.import.title}</h2>
      <p>{STR.views.import.placeholder}</p>
      <p className="foundation-view__meta">
        <span>{seasonLabel}</span>
        <span>{reviewLabel}</span>
      </p>
    </section>
  );
}
