import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmModal } from "@/components/shared/ConfirmModal.tsx";
import { STR } from "@/strings.ts";

describe("ConfirmModal", () => {
  it("does not render while closed", () => {
    render(
      <ConfirmModal
        isOpen={false}
        title="Test"
        body="Body"
        onConfirm={() => undefined}
        onCancel={() => undefined}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmModal
        isOpen
        title="Test"
        body="Body"
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("runs confirm callback on confirm click", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        isOpen
        title="Test"
        body="Body"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: STR.confirmModal.confirm }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes when backdrop is clicked", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmModal
        isOpen
        title="Test"
        body="Body"
        onConfirm={() => undefined}
        onCancel={onCancel}
      />,
    );

    const backdrop = container.querySelector(".confirm-modal__backdrop");
    expect(backdrop).toBeTruthy();
    if (!backdrop) throw new Error("Backdrop missing");
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
