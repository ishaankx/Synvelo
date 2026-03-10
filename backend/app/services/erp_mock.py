"""
Mock ERP system for Pulse Sync demo.
In production, these would be real SAP/Oracle/NetSuite API calls.
"""
import openai
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List
from app.config import settings

client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

# ─── Mock ERP Data ────────────────────────────────────────

INVENTORY_DB = {
    "SKU-1001": {"name": "Industrial Pump Model A", "qty_available": 340, "qty_incoming": 200, "incoming_date": "2026-03-15", "unit_cost": 450.0},
    "SKU-1002": {"name": "Valve Assembly V2", "qty_available": 85, "qty_incoming": 150, "incoming_date": "2026-03-12", "unit_cost": 120.0},
    "SKU-1003": {"name": "Control Unit CU-400", "qty_available": 20, "qty_incoming": 80, "incoming_date": "2026-03-20", "unit_cost": 890.0},
}

SHIPPING_RATES = {
    "standard": {"per_unit": 8.0, "days": 7},
    "express": {"per_unit": 18.0, "days": 3},
    "overnight": {"per_unit": 35.0, "days": 1},
}

# ─── ERP Functions ────────────────────────────────────────

def check_inventory(sku: str, qty_requested: int) -> Dict:
    """Check if inventory is available for a SKU."""
    item = INVENTORY_DB.get(sku)
    if not item:
        return {"error": f"SKU {sku} not found", "available": 0}

    can_ship_now = min(item["qty_available"], qty_requested)
    remaining = qty_requested - can_ship_now

    return {
        "sku": sku,
        "product_name": item["name"],
        "qty_requested": qty_requested,
        "qty_available_now": item["qty_available"],
        "can_ship_immediately": can_ship_now,
        "remaining_needed": remaining,
        "qty_incoming": item["qty_incoming"],
        "incoming_date": item["incoming_date"],
        "unit_cost": item["unit_cost"],
        "can_fulfill_fully": can_ship_now >= qty_requested
    }

def calculate_shipping_cost(qty: int, method: str = "standard") -> Dict:
    """Calculate shipping cost for a quantity."""
    rate = SHIPPING_RATES.get(method, SHIPPING_RATES["standard"])
    cost = qty * rate["per_unit"]
    eta = (datetime.now() + timedelta(days=rate["days"])).strftime("%Y-%m-%d")
    return {
        "method": method,
        "qty": qty,
        "cost": cost,
        "eta": eta,
        "days": rate["days"]
    }

def generate_quote(sku: str, qty: int, customer: str, discount_pct: float = 0.0) -> Dict:
    """Generate a sales quote."""
    item = INVENTORY_DB.get(sku, {"name": "Unknown", "unit_cost": 0})
    unit_price = item["unit_cost"] * 1.35  # 35% margin
    unit_price_discounted = unit_price * (1 - discount_pct / 100)
    total = unit_price_discounted * qty
    margin = total - (item["unit_cost"] * qty)

    return {
        "quote_number": f"Q-{datetime.now().strftime('%Y%m%d')}-{hash(customer) % 10000:04d}",
        "customer": customer,
        "sku": sku,
        "product": item["name"],
        "qty": qty,
        "unit_price": round(unit_price_discounted, 2),
        "subtotal": round(total, 2),
        "gross_margin": round(margin, 2),
        "margin_pct": round((margin / total) * 100, 1),
        "valid_until": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
        "discount_applied": discount_pct
    }

# ─── GPT-4o Function Calling Agent ───────────────────────

ERP_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "check_inventory",
            "description": "Check available inventory for a product SKU",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku": {"type": "string", "description": "Product SKU code"},
                    "qty_requested": {"type": "integer", "description": "Quantity needed"}
                },
                "required": ["sku", "qty_requested"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_shipping_cost",
            "description": "Calculate shipping cost and ETA",
            "parameters": {
                "type": "object",
                "properties": {
                    "qty": {"type": "integer"},
                    "method": {"type": "string", "enum": ["standard", "express", "overnight"]}
                },
                "required": ["qty", "method"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_quote",
            "description": "Generate a sales quote for a customer",
            "parameters": {
                "type": "object",
                "properties": {
                    "sku": {"type": "string"},
                    "qty": {"type": "integer"},
                    "customer": {"type": "string"},
                    "discount_pct": {"type": "number", "description": "Discount percentage (0-30)"}
                },
                "required": ["sku", "qty", "customer"]
            }
        }
    }
]

TOOL_MAP = {
    "check_inventory": check_inventory,
    "calculate_shipping_cost": calculate_shipping_cost,
    "generate_quote": generate_quote,
}

async def run_pulse_sync(query: str, deal_context: str = "") -> Dict[str, Any]:
    """
    Main Pulse Sync agent. Takes a natural language query,
    uses GPT-4o to call ERP functions, and returns a proposal.
    """
    system = f"""You are Pulse Sync — the operational intelligence layer of Synvelo.
You help sales teams answer operational questions about orders, inventory, and logistics.
Use the provided ERP tools to answer the query accurately.
Always provide a clear, actionable proposal with cost and margin impact.
Deal context: {deal_context}"""

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": query}
    ]

    tool_results = []

    # Agentic loop — let GPT call tools until it has enough info
    for _ in range(5):  # max 5 tool calls
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=ERP_TOOLS,
            tool_choice="auto"
        )

        msg = response.choices[0].message
        messages.append(msg)

        if not msg.tool_calls:
            break  # Done, we have a final answer

        # Execute all tool calls
        for tool_call in msg.tool_calls:
            fn_name = tool_call.function.name
            fn_args = json.loads(tool_call.function.arguments)
            fn = TOOL_MAP.get(fn_name)
            if fn:
                result = fn(**fn_args)
                tool_results.append({"tool": fn_name, "args": fn_args, "result": result})
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result)
                })

    # Ask GPT to format a structured proposal
    messages.append({
        "role": "user",
        "content": """Based on your analysis, provide a JSON proposal with this exact structure:
{
  "summary": "one-line summary of what you found",
  "split_options": [{"qty": N, "eta": "YYYY-MM-DD", "cost": N.N}],
  "total_cost": N.N,
  "margin_impact": N.N,
  "margin_impact_pct": N.N,
  "recommended": "which option you recommend and why",
  "win_probability_impact": N.N (positive = helps deal, negative = hurts)
}
Respond with only valid JSON."""
    })

    final = await client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        response_format={"type": "json_object"}
    )

    proposal_raw = final.choices[0].message.content
    proposal = json.loads(proposal_raw)

    return {
        "proposal": proposal,
        "tool_calls": tool_results,
        "raw_answer": msg.content if msg.content else ""
    }