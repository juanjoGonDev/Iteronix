import { describe, expect, it } from "vitest";
import { createStore } from "./store";

describe("createStore", () => {
  it("notifies subscribers immediately and on updates", () => {
    const store = createStore("start");
    const values: string[] = [];
    const unsubscribe = store.subscribe((value) => {
      values.push(value);
    });
    store.set("next");
    unsubscribe();
    store.set("final");
    expect(values).toEqual(["start", "next"]);
  });
});
