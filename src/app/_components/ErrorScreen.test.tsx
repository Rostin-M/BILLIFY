// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ErrorScreen } from "./ErrorScreen";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span role="img" aria-label={props.alt} /> }));

const secretError = Object.assign(new Error("relation \"sales\" does not exist"), { digest: "abc123" });

afterEach(() => {
  cleanup();
  refresh.mockClear();
  vi.restoreAllMocks();
});

describe("ErrorScreen", () => {
  it("muestra el código de referencia pero nunca el mensaje técnico fuera de desarrollo", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<ErrorScreen variant="fullscreen" title="Algo salió mal" description="Inténtalo de nuevo." error={secretError} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Algo salió mal")).toBeTruthy();
    expect(screen.getByText("abc123")).toBeTruthy();
    expect(screen.queryByText(/does not exist/)).toBeNull();
    expect(screen.getByRole("img", { name: "BILLIFY" })).toBeTruthy();
    expect(console.error).toHaveBeenCalledWith("[BILLIFY] error de interfaz:", secretError);
  });

  it("reintentar refresca los datos del servidor y reinicia el boundary", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reset = vi.fn();

    render(<ErrorScreen variant="inline" title="Falló" description="x" error={secretError} reset={reset} />);
    fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("img", { name: "BILLIFY" })).toBeNull();
  });

  it("sin reset solo ofrece volver al inicio", () => {
    render(<ErrorScreen variant="fullscreen" title="Página no encontrada" description="x" homeHref="/ventas" homeLabel="Ir a ventas" />);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("link", { name: /Ir a ventas/ }).getAttribute("href")).toBe("/ventas");
    expect(screen.queryByText(/Código de referencia/)).toBeNull();
  });
});
