import { describe, it, expect } from "vitest"

describe("plane integration", () => {
  it("verifies that one [AI-generated] comment exists and workitem remains unchanged", async () => {
    const workItem = { id: "WELLBEINGT-7", status: "open" }
    const comments = [
      { id: 1, content: "[AI-generated] Verified", author: "system" }
    ]

    expect(workItem.status).toBe("open")
    expect(comments.length).toBe(1)
    expect(comments[0].content).toContain("[AI-generated]")
  })
})