import { expect } from "chai";

import * as index from "../src/index";

describe("B suite", () => {
  it("index module loaded", () => {
    expect(index).exist;
  });
});
