import { describe, it } from "node:test";
import assert from "node:assert/strict";
import rateLimit from "../src/middlewares/rateLimit.js";

const fakeRes = () => ({ headers: {}, set(name, value) { this.headers[name] = value; } });

const hit = (limiter, req) => {
  let passed;
  limiter(req, fakeRes(), (error) => {
    passed = error ?? null;
  });
  return passed;
};

describe("rateLimit", () => {
  it("blocks a client once it goes over the limit", () => {
    const limiter = rateLimit({ name: "t", windowMs: 60_000, max: 2, message: "slow down" });
    const req = { ip: "1.1.1.1" };
    assert.equal(hit(limiter, req), null);
    assert.equal(hit(limiter, req), null);
    assert.deepEqual(hit(limiter, req), { status: 429, message: "slow down" });
    assert.equal(hit(limiter, { ip: "2.2.2.2" }), null);
  });

  it("can key by user so people on one network don't share a bucket", () => {
    const limiter = rateLimit({
      name: "t",
      windowMs: 60_000,
      max: 1,
      message: "slow down",
      key: (req) => req.user?._id,
    });
    assert.equal(hit(limiter, { ip: "3.3.3.3", user: { _id: "a" } }), null);
    assert.equal(hit(limiter, { ip: "3.3.3.3", user: { _id: "b" } }), null);
    assert.equal(hit(limiter, { ip: "3.3.3.3", user: { _id: "a" } }).status, 429);
  });

  it("falls back to the IP when the key function has nothing", () => {
    const limiter = rateLimit({ name: "t", windowMs: 60_000, max: 1, message: "m", key: () => undefined });
    assert.equal(hit(limiter, { ip: "4.4.4.4" }), null);
    assert.equal(hit(limiter, { ip: "4.4.4.4" }).status, 429);
  });
});
