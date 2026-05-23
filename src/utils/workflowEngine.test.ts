import { describe, expect, it } from "vitest";
import {
	aggregateLoopResultsForTest,
	resolveVariables,
	testIndexPlusOneResolution,
} from "./workflowEngine";

describe("workflowEngine helpers", () => {
	it("resolves {{index+1}} arithmetic placeholders", () => {
		const resolved = testIndexPlusOneResolution(0);
		expect(resolved.textResolved).toBe("1");
	});

	it("substitutes workflow context variables", () => {
		const text = resolveVariables("status={{status}} body={{body.name}}", {
			variables: {},
			nodeOutputs: {},
			lastResponse: {
				status: 200,
				body: { name: "mandy" },
				headers: {},
				cookies: [],
			},
			currentNodeId: null,
		});
		expect(text).toBe("status=200 body=mandy");
	});

	it("aggregates loop iteration outputs for tests", () => {
		const aggregated = aggregateLoopResultsForTest([
			{ status: 200, body: { n: 1 } },
			{ status: 200, body: { n: 2 } },
		]);
		expect(aggregated.body).toEqual([{ n: 1 }, { n: 2 }]);
		expect(aggregated.iterationOutputs).toHaveLength(2);
	});
});
