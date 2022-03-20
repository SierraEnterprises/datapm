import { expect } from "chai";
import { describe, it } from "mocha";
import { DeconflictOptions, resolveConflict } from "../src/util/SchemaUtil";

describe("SchemaUtil", function () {
    it("Should resolve integer float conflicts", function () {
        expect(resolveConflict("379.000000", DeconflictOptions.CAST_TO_FLOAT)).to.equal("379.0");
    });

    it("Should resolve date conflicts", function () {
        const date = new Date().toISOString();
        expect(resolveConflict(date, DeconflictOptions.CAST_TO_DATE)).to.equal(date);
    });
});