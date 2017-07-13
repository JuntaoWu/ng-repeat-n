import { expect } from "chai";

import { repeatTimes } from "../src/index";

describe("A suite", () => {
  const name = repeatTimes.name;
  it("contains spec with an expectation", () => {
    expect(name).equals("orz.repeattimes");
  });
});
