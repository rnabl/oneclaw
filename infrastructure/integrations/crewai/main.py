"""
CrewAI nabl Integration
FastAPI server that exposes CrewAI agents with nabl workflow tools
"""

import os
import httpx
from fastapi import FastAPI
from pydantic import BaseModel
from crewai import Agent, Task, Crew, Process
from crewai_tools import BaseTool

# Configuration
ICLAW_API_URL = os.getenv("ICLAW_API_URL", "https://api.iclaw.dev")
ICLAW_API_KEY = os.getenv("ICLAW_API_KEY")

app = FastAPI(title="iClaw CrewAI Agent")


# Custom Tools

class NablAuditTool(BaseTool):
    name: str = "Website Audit"
    description: str = "Run a comprehensive website audit. Input should be a website URL."
    
    def _run(self, url: str) -> str:
        """Execute the audit synchronously."""
        import httpx
        with httpx.Client() as client:
            response = client.post(
                f"{ICLAW_API_URL}/api/v1/workflow",
                json={
                    "workflow": "audit",
                    "params": {"url": url},
                    "iclaw_key": ICLAW_API_KEY
                },
                timeout=120.0
            )
            result = response.json()
            
            if result.get("status") == "error":
                return f"Audit failed: {result.get('error')}"
            
            data = result.get("result", {})
            return f"""
Audit Results for {data.get('url')}:
- Overall Score: {data.get('score')}/100
- Critical Issues: {data.get('critical_issues')}
- Warnings: {data.get('warnings')}
- Passed: {data.get('passed')}
- Report: {data.get('report_url')}
"""


class NablDiscoveryTool(BaseTool):
    name: str = "Business Discovery"
    description: str = "Find businesses by niche and location. Input format: 'niche|location' (e.g., 'plumbers|Denver, CO')"
    
    def _run(self, query: str) -> str:
        """Execute discovery synchronously."""
        parts = query.split("|")
        if len(parts) != 2:
            return "Invalid format. Use: 'niche|location'"
        
        niche, location = parts[0].strip(), parts[1].strip()
        
        import httpx
        with httpx.Client() as client:
            response = client.post(
                f"{ICLAW_API_URL}/api/v1/workflow",
                json={
                    "workflow": "discovery",
                    "params": {"niche": niche, "location": location, "limit": 10},
                    "iclaw_key": ICLAW_API_KEY
                },
                timeout=120.0
            )
            result = response.json()
            
            if result.get("status") == "error":
                return f"Discovery failed: {result.get('error')}"
            
            data = result.get("result", {})
            businesses = data.get("businesses", [])
            
            output = f"Found {data.get('total_found')} {niche} businesses in {location}:\n\n"
            for i, biz in enumerate(businesses[:5], 1):
                output += f"{i}. {biz.get('name')}\n"
                if biz.get('phone'): output += f"   Phone: {biz.get('phone')}\n"
                if biz.get('website'): output += f"   Website: {biz.get('website')}\n"
            
            return output


# Create agents
def create_research_agent():
    return Agent(
        role="Research Assistant",
        goal="Help users find information about businesses and websites",
        backstory="""You are an expert at researching businesses and analyzing websites.
        You use specialized tools to gather accurate, real-time information.""",
        tools=[NablAuditTool(), NablDiscoveryTool()],
        verbose=True
    )


# API Endpoints
class ChatRequest(BaseModel):
    message: str
    user_id: str | None = None


class ChatResponse(BaseModel):
    response: str


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Process a chat message through the CrewAI agent."""
    
    agent = create_research_agent()
    
    task = Task(
        description=f"""
        User request: {request.message}
        
        Analyze the request and use your tools if needed.
        - For website analysis requests, use the Website Audit tool
        - For finding businesses, use the Business Discovery tool (format: niche|location)
        
        Provide a helpful, concise response.
        """,
        expected_output="A helpful response to the user's request",
        agent=agent
    )
    
    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=True
    )
    
    result = crew.kickoff()
    
    return ChatResponse(response=str(result))


@app.get("/health")
async def health():
    return {"status": "healthy", "framework": "crewai"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
