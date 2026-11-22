import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findForeignImage, isHostedImageUrl } from "../src/utils/images.js";

const own = "https://res.cloudinary.com/nexora-cloud/image/upload/v1/Nexora/a.jpg";

describe("isHostedImageUrl", () => {
  it("accepts an https URL in our Cloudinary account", () => {
    assert.equal(isHostedImageUrl(own, "nexora-cloud"), true);
  });

  it("rejects other accounts, hosts and schemes", () => {
    assert.equal(isHostedImageUrl(own, "someone-else"), false);
    assert.equal(isHostedImageUrl("https://evil.example/a.jpg", "nexora-cloud"), false);
    assert.equal(isHostedImageUrl(own.replace("https", "http"), "nexora-cloud"), false);
    assert.equal(
      isHostedImageUrl("https://res.cloudinary.com.evil.example/nexora-cloud/a.jpg", "nexora-cloud"),
      false,
    );
    assert.equal(isHostedImageUrl("javascript:alert(1)", "nexora-cloud"), false);
    assert.equal(isHostedImageUrl("not a url", "nexora-cloud"), false);
  });

  it("rejects URLs with credentials", () => {
    assert.equal(
      isHostedImageUrl("https://user:pass@res.cloudinary.com/nexora-cloud/a.jpg", "nexora-cloud"),
      false,
    );
  });

  it("accepts any Cloudinary account when none is configured", () => {
    assert.equal(isHostedImageUrl(own, ""), true);
  });
});

describe("findForeignImage", () => {
  it("returns the first URL that isn't allowed", () => {
    const foreign = "https://example.com/b.jpg";
    assert.equal(findForeignImage([own, foreign], { cloudName: "nexora-cloud" }), foreign);
  });

  it("lets a product keep photos it already had", () => {
    const legacy = "http://res.cloudinary.com/nexora-cloud/old.jpg";
    assert.equal(
      findForeignImage([legacy, own], { cloudName: "nexora-cloud", known: [legacy] }),
      null,
    );
  });

  it("allows an empty list", () => {
    assert.equal(findForeignImage([], { cloudName: "nexora-cloud" }), null);
  });
});
