import { STR } from "@/strings.ts";
import type { CategoryOption } from "@/components/standings/adapters.ts";

interface CategoryGridProps {
  options: CategoryOption[];
  selectedKey: string | null;
  onSelect: (categoryKey: string) => void;
}

export function CategoryGrid({ options, selectedKey, onSelect }: CategoryGridProps) {
  if (options.length === 0) {
    return <p>{STR.views.standings.noCategory}</p>;
  }

  return (
    <div className="category-grid">
      {options.map((option) => {
        const isActive = option.key === selectedKey;
        return (
          <button
            key={option.key}
            type="button"
            className={`button ${isActive ? "button--primary" : ""}`}
            onClick={() => {
              onSelect(option.key);
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
