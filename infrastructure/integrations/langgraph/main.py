"""
LangGraph nabl Integration
FastAPI server that exposes LangGraph agents with nabl workflow tools
"""

import os
import httpx
from typing import TypedDict, Annotated, Literal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from langgraph.graph import StateGraph, END
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool

# Configuration
ICLAW_API_URL = os.getenv("ICLAW_API_URL", "https://api.iclaw.dev")
ICLAW_API_KEY = os.getenv("ICLAW_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

app = FastAPI(title="iClaw LangGraph Agent")

# Tools

@tool
async def nabl_audit(url: str) -> dict:
    """Run a comprehensive website audit. Use this when asked to check, audit, or analyze a website."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{ICLAW_API_URL}/api/v1/workflow",
            json={
                "workflow": "audit",
                "params": {"url": url},
                "iclaw_key": ICLAW_API_KEY
            },
            timeout=120.0
        )
        return response.json()


@tool
async def nabl_discovery(niche: str, location: str, limit: int = 50) -> dict:
    """Find businesses by niche and location. Use this when asked to find, discover, or search for businesses."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{ICLAW_API_URL}/api/v1/workflow",
            json={
                "workflow": "discovery",
                "params": {"niche": niche, "location": location, "limit": limit},
                "iclaw_key": ICLAW_API_KEY
            },
            timeout=120.0
        )
        return response.json()


# Agent State
class AgentState(TypedDict):
    messages: list
    tool_calls: list
    tool_results: list


# LLM
llm = ChatAnthropic(
    model="claude-sonnet-4-20250514",
    api_key=ANTHROPIC_API_KEY
).bind_tools([nabl_audit, nabl_discovery])


# Graph nodes
async def agent_node(state: AgentState) -> AgentState:
    """Main agent node that processes messages."""
    messages = state["messages"]
    
    response = await llm.ainvoke(messages)
    
    return {
        **state,
        "messages": messages + [response],
        "tool_calls": response.tool_calls if hasattr(response, 'tool_calls') else []
    }


async def tool_node(state: AgentState) -> AgentState:
    """Execute tool calls."""
    tool_results = []
    
    for tool_call in state.get("tool_calls", []):
        if tool_call["name"] == "nabl_audit":
            result = await nabl_audit.ainvoke(tool_call["args"])
        elif tool_call["name"] == "nabl_discovery":
            result = await nabl_discovery.ainvoke(tool_call["args"])
        else:
            result = {"error": f"Unknown tool: {tool_call['name']}"}
        
        tool_results.append({
            "tool_call_id": tool_call["id"],
            "result": result
        })
    
    return {
        **state,
        "tool_results": tool_results
    }


def should_continue(state: AgentState) -> Literal["tool", "end"]:
    """Determine if we should continue to tools or end."""
    if state.get("tool_calls"):
        return "tool"
    return "end"


# Build graph
def build_agent_graph():
    graph = StateGraph(AgentState)
    
    graph.add_node("agent", agent_node)
    graph.add_node("tool", tool_node)
    
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", should_continue, {"tool": "tool", "end": END})
    graph.add_edge("tool", "agent")
    
    return graph.compile()


agent = build_agent_graph()


# API Endpoints
class ChatRequest(BaseModel):
    message: str
    user_id: str | None = None


class ChatResponse(BaseModel):
    response: str
    tool_results: list = []


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Process a chat message through the agent."""
    initial_state: AgentState = {
        "messages": [
            SystemMessage(content="""You are iClaw, an AI assistant that can help with:
- Website audits (use nabl_audit tool)
- Finding businesses (use nabl_discovery tool)

Be concise and helpful. When using tools, explain what you're doing."""),
            HumanMessage(content=request.message)
        ],
        "tool_calls": [],
        "tool_results": []
    }
    
    result = await agent.ainvoke(initial_state)
    
    # Get the last AI message
    ai_messages = [m for m in result["messages"] if isinstance(m, AIMessage)]
    response_text = ai_messages[-1].content if ai_messages else "I couldn't process that request."
    
    return ChatResponse(
        response=response_text,
        tool_results=result.get("tool_results", [])
    )


@app.get("/health")
async def health():
    return {"status": "healthy", "framework": "langgraph"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
