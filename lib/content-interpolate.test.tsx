import { describe, it, expect } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { interpolate, interpolateBidi } from "./content-interpolate";

describe("interpolateBidi", () => {
  it("wraps a single substituted token in <bdi>, leaving surrounding prose unwrapped", () => {
    const nodes = interpolateBidi("From {ePrice} per trip", { ePrice: "€185" });
    const html = renderToStaticMarkup(createElement(Fragment, null, nodes));
    expect(html).toBe("From <bdi>€185</bdi> per trip");
  });

  it("isolates multiple tokens, each in its own <bdi>", () => {
    const nodes = interpolateBidi("{a} to {b}", { a: "€185", b: "€220" });
    const html = renderToStaticMarkup(createElement(Fragment, null, nodes));
    expect(html).toBe("<bdi>€185</bdi> to <bdi>€220</bdi>");
  });

  it("leaves an unmatched token literally as {token}, not wrapped", () => {
    const nodes = interpolateBidi("From {ePrice} per trip", {});
    const html = renderToStaticMarkup(createElement(Fragment, null, nodes));
    expect(html).toBe("From {ePrice} per trip");
  });

  it("does not affect the existing string interpolate(), which still returns a plain string", () => {
    const result = interpolate("From {ePrice} per trip", { ePrice: "€185" });
    expect(typeof result).toBe("string");
    expect(result).toBe("From €185 per trip");
  });
});
