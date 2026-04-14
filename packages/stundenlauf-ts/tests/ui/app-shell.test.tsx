import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "@/App.tsx";
import { STR } from "@/strings.ts";

describe("App shell", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("renders all top-level tabs in German", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: STR.shell.appTitle })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: STR.shell.tabs.standings })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: STR.shell.tabs.import })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: STR.shell.tabs.history })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: STR.shell.tabs.season })).toBeInTheDocument();
  });

  it("switches the active view when clicking tabs", () => {
    render(<App />);
    expect(screen.getByText(STR.views.standings.placeholder)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: STR.shell.tabs.import }));
    expect(screen.getByText(STR.views.import.placeholder)).toBeInTheDocument();
  });
});
