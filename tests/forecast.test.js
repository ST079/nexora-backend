import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bestAlpha,
  dailySeries,
  exponentialSmoothing,
  forecastDemand,
  restockPlan,
} from "../src/algorithms/forecast.js";

const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≉ ${expected}`);

const END = new Date("2026-10-25T12:00:00Z");
const hoursAgo = (h) => new Date(END.getTime() - h * 60 * 60 * 1000);

describe("dailySeries", () => {
  it("buckets sales into rolling days, oldest first", () => {
    const series = dailySeries(
      [
        { date: hoursAgo(1), quantity: 2 }, // today
        { date: hoursAgo(5), quantity: 1 }, // today
        { date: hoursAgo(30), quantity: 4 }, // yesterday
      ],
      { days: 3, end: END },
    );
    assert.deepEqual(series, [0, 4, 3]);
  });

  it("ignores sales outside the window or in the future", () => {
    const series = dailySeries(
      [
        { date: hoursAgo(24 * 10), quantity: 9 },
        { date: hoursAgo(-2), quantity: 9 },
      ],
      { days: 3, end: END },
    );
    assert.deepEqual(series, [0, 0, 0]);
  });
});

describe("exponentialSmoothing", () => {
  it("matches a hand-worked example (α = 0.5)", () => {
    // level: 10 -> 0.5·20 + 0.5·10 = 15 -> 0.5·10 + 0.5·15 = 12.5
    const { level, fitted, errors } = exponentialSmoothing([10, 20, 10], 0.5);
    assert.deepEqual(fitted, [10, 15, 12.5]);
    assert.deepEqual(errors, [10, -5]);
    assert.equal(level, 12.5);
  });

  it("forecasts a constant series exactly", () => {
    assert.equal(exponentialSmoothing([4, 4, 4, 4], 0.3).level, 4);
  });

  it("handles an empty series", () => {
    assert.equal(exponentialSmoothing([], 0.3).level, 0);
  });
});

describe("bestAlpha", () => {
  it("prefers a high α when demand steps up and stays there", () => {
    assert.ok(bestAlpha([0, 0, 0, 10, 10, 10, 10, 10]) >= 0.7);
  });

  it("prefers a low α when demand is noisy around a steady mean", () => {
    assert.ok(bestAlpha([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]) <= 0.3);
  });
});

describe("forecastDemand", () => {
  it("returns zero demand and zero error for no sales", () => {
    const { dailyDemand, rmse } = forecastDemand(new Array(30).fill(0));
    assert.equal(dailyDemand, 0);
    assert.equal(rmse, 0);
  });

  it("returns the RMSE of one-step errors", () => {
    const { rmse } = forecastDemand([2, 2, 2, 2]);
    assert.equal(rmse, 0);
  });
});

describe("restockPlan", () => {
  it("computes days left, reorder point and quantity", () => {
    // 2/day, 30 in stock, no noise, 7-day lead time, 30 days of cover.
    const plan = restockPlan({ stock: 30, dailyDemand: 2, leadTimeDays: 7, coverDays: 30 });
    assert.equal(plan.daysUntilStockout, 15);
    assert.equal(plan.reorderPoint, 14);
    assert.equal(plan.reorderQuantity, 2 * 37 - 30);
    assert.equal(plan.status, "ok");
  });

  it("flags reorder when stock won't last the lead time", () => {
    const plan = restockPlan({ stock: 10, dailyDemand: 2, leadTimeDays: 7 });
    assert.equal(plan.status, "reorder");
    assert.equal(plan.daysUntilStockout, 5);
  });

  it("adds safety stock for noisy demand", () => {
    const calm = restockPlan({ stock: 20, dailyDemand: 2, rmse: 0 });
    const noisy = restockPlan({ stock: 20, dailyDemand: 2, rmse: 2 });
    // 1.65 · 2 · √7 = 8.73 -> 9 extra units
    assert.equal(noisy.safetyStock, 9);
    assert.equal(noisy.reorderPoint, calm.reorderPoint + 9);
    assert.equal(noisy.status, "reorder");
  });

  it("marks sold-out products as out", () => {
    const plan = restockPlan({ stock: 0, dailyDemand: 1.5 });
    assert.equal(plan.status, "out");
    assert.equal(plan.daysUntilStockout, 0);
    assert.ok(plan.reorderQuantity > 0);
  });

  it("doesn't invent numbers when there is no demand", () => {
    const plan = restockPlan({ stock: 12, dailyDemand: 0 });
    assert.equal(plan.status, "idle");
    assert.equal(plan.daysUntilStockout, null);
    assert.equal(plan.reorderQuantity, null);
  });

  it("never asks for a negative reorder", () => {
    const plan = restockPlan({ stock: 500, dailyDemand: 1 });
    assert.equal(plan.reorderQuantity, 0);
    close(plan.daysUntilStockout, 500);
  });
});
