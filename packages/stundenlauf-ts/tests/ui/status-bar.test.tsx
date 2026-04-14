import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBar } from "@/components/shared/StatusBar.tsx";
import { STR } from "@/strings.ts";

describe("StatusBar", () => {
  it("renders ready state when no status exists", () => {
    render(<StatusBar current={null} />);
    expect(screen.getByText(STR.status.defaultReady)).toBeInTheDocument();
    expect(screen.getByText(STR.status.prefix)).toBeInTheDocument();
  });

  it("renders explicit status message and severity class", () => {
    const { container } = render(
      <StatusBar
        current={{
          message: "Import läuft...",
          severity: "warn",
          timestamp: "2026-04-14T12:00:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("Import läuft...")).toBeInTheDocument();
    expect(container.querySelector(".status-bar--warn")).toBeInTheDocument();
  });
});
