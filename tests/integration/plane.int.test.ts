import { describe, it, expect } from "vitest"
import { PlaneClient } from "../../clients/plane"

describe("plane integration", () => {
  it("verifies that an [AI-generated] comment exists on the workitem and the workitem is unchanged", async () => {
    const client = new PlaneClient()
    
    // Workitem ID extracted from WELLBEINGT-7
    const workitemId = 7
    
    const comments = await client.getWorkItemComments(workitemId)
    const aiComment = comments.find((c: any) => c.content.includes("[AI-generated]"))
    
    expect(aiComment).toBeDefined()
    expect(aiComment.content).toContain("[AI-generated]")
    
    const workitem = await client.getWorkItem(workitemId)
    expect(workitem.status).toBe("OPEN")
  })
})