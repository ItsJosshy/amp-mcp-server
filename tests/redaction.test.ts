import { describe, expect, it } from "vitest";
import { redact } from "../src/logging/logger.js";

describe("audit redaction", () => {
  it("redacts direct secrets and file bodies", () => expect(redact({ password: "x", content: "file", okay: 1 })).toEqual({ password: "[REDACTED]", content: "[REDACTED]", okay: 1 }));
  it("redacts generic setting values when the node is sensitive", () => expect(redact({ node: "Core.Login.Password", value: "x" })).toEqual({ node: "Core.Login.Password", value: "[REDACTED]" }));
});
