import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/api", () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    ApiError,
    authenticate: vi.fn(),
    requireVault: vi.fn(),
  };
});

import { ApiError } from "@/lib/auth/api";
import { apiError } from "@/lib/http";

describe("apiError", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("propaga el mensaje y status de ApiError", async () => {
    const response = apiError(new ApiError("Bóveda no encontrada", 404));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Bóveda no encontrada" });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("en producción devuelve mensaje genérico para errores internos", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = apiError(new Error('syntax error at "and"'));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Error interno" });
    expect(console.error).toHaveBeenCalled();
  });

  it("en desarrollo conserva el mensaje del error para depurar", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = apiError(new Error("detalle interno de depuración"));
    await expect(response.json()).resolves.toEqual({ error: "detalle interno de depuración" });
  });

  it("en producción devuelve mensaje genérico también para valores no Error", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = apiError("fallo raro");
    await expect(response.json()).resolves.toEqual({ error: "Error interno" });
  });
});
