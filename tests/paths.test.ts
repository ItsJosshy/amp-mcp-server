import { describe, expect, it } from "vitest";
import { validateInstancePath } from "../src/security/paths.js";

describe("instance path validation", () => {
  it.each(["../secret", "world/../../secret", "/etc/passwd", "C:/Windows", "~/.ssh", "a\\b", "a/./b"])("rejects %s", (path) => expect(() => validateInstancePath(path)).toThrow());
  it("normalizes an instance-relative path", () => expect(validateInstancePath("world//server.properties")).toBe("world/server.properties"));
  it("permits root only when requested", () => { expect(validateInstancePath("/")).toBe(""); expect(() => validateInstancePath("/", false)).toThrow(); });
});
