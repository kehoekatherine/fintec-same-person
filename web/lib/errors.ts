export class DeskError extends Error {
  readonly status: number;
  readonly code: "missing" | "failed";
  readonly detail?: string;

  constructor(
    message: string,
    options?: { status?: number; detail?: string; code?: "missing" | "failed" },
  ) {
    super(message);
    this.name = "DeskError";
    this.status = options?.status ?? 500;
    this.code = options?.code ?? "failed";
    this.detail = options?.detail;
  }
}
