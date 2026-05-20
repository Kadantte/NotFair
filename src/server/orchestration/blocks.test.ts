import { describe, expect, it } from "vitest";

import {
  parseCreateTaskBlocks,
  parseTaskStatusBlocks,
  stripOrchestrationBlocks,
} from "./blocks";

describe("parseCreateTaskBlocks", () => {
  it("parses a single well-formed block", () => {
    const text = `
Here are the tasks I'm creating:

<create_task>
title: Install conversion tracking
assignee: google_ads
brief: Add the Google Ads conversion tag or import GA4 conversion events.
  Confirm the tag fires on the thank-you page; report the conversion type
  and value mapping.
success_criteria: One test conversion fires + appears in Google Ads within 24h.
</create_task>
`;
    const blocks = parseCreateTaskBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      title: "Install conversion tracking",
      assignee: "google_ads",
      brief:
        "Add the Google Ads conversion tag or import GA4 conversion events.\nConfirm the tag fires on the thank-you page; report the conversion type\nand value mapping.",
      success_criteria:
        "One test conversion fires + appears in Google Ads within 24h.",
    });
  });

  it("parses multiple blocks", () => {
    const text = `
<create_task>
title: A
assignee: google_ads
brief: Do A.
</create_task>
<create_task>
title: B
assignee: google_ads
brief: Do B.
</create_task>
`;
    expect(parseCreateTaskBlocks(text)).toHaveLength(2);
  });

  it("skips blocks missing required fields", () => {
    const text = `
<create_task>
title: incomplete
brief: no assignee
</create_task>
<create_task>
title: good
assignee: google_ads
brief: ok
</create_task>
`;
    const blocks = parseCreateTaskBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.title).toBe("good");
  });

  it("returns empty array when no blocks present", () => {
    expect(parseCreateTaskBlocks("hello world")).toEqual([]);
  });
});

describe("parseTaskStatusBlocks", () => {
  it("parses a done status block", () => {
    const text = `Working on it.

<task_status>
task_id: abc-123
status: done
summary: Conversion tag installed on /thanks; test conv fired at 14:02 PT.
</task_status>`;
    const blocks = parseTaskStatusBlocks(text);
    expect(blocks).toEqual([
      {
        task_id: "abc-123",
        status: "done",
        summary: "Conversion tag installed on /thanks; test conv fired at 14:02 PT.",
      },
    ]);
  });

  it("rejects unknown status values", () => {
    const text = `<task_status>
task_id: abc-123
status: maybe
</task_status>`;
    expect(parseTaskStatusBlocks(text)).toEqual([]);
  });

  it("rejects blocks without a task_id", () => {
    const text = `<task_status>
status: done
</task_status>`;
    expect(parseTaskStatusBlocks(text)).toEqual([]);
  });
});

describe("stripOrchestrationBlocks", () => {
  it("removes create_task blocks from the displayed text", () => {
    const text = `Greeting prose here.

<create_task>
title: A
assignee: google_ads
brief: x
</create_task>

More prose.`;
    const stripped = stripOrchestrationBlocks(text);
    expect(stripped).not.toContain("<create_task>");
    expect(stripped).toContain("Greeting prose here.");
    expect(stripped).toContain("More prose.");
  });

  it("removes task_status blocks", () => {
    const text = `Done.

<task_status>
task_id: abc
status: done
</task_status>`;
    expect(stripOrchestrationBlocks(text)).toBe("Done.");
  });

  it("collapses 3+ consecutive blank lines left behind by stripping", () => {
    const text = `Hi.



<create_task>
title: A
assignee: x
brief: y
</create_task>



Bye.`;
    const out = stripOrchestrationBlocks(text);
    // No more than one blank line between paragraphs.
    expect(/\n{3,}/.test(out)).toBe(false);
  });

  it("leaves prose unchanged when no blocks present", () => {
    expect(stripOrchestrationBlocks("just text")).toBe("just text");
  });
});
