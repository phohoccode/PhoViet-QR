"""Validate documentation artifacts only. Uses Python stdlib and an existing tsc.

Creates a temporary TypeScript file inside docs/contracts and removes it in finally.
No package install, network, application code, migration or provider/DB connection.
This is NOT a runtime security/concurrency test of a backend that does not exist yet.
"""
from __future__ import annotations

import copy
import json
import re
import shutil
import subprocess
import tempfile
from datetime import date, datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SAFE_INTEGER = 2**53 - 1
REQUIRED = {
    "DOMAIN_MODEL.md", "STATE_MACHINES.md", "types.ts",
    "EXAMPLES.md", "OPEN_QUESTIONS.md", "API_CONTRACT_V1.md",
    "SECURITY_AND_CONCURRENCY.md", "UI_DATA_HANDOFF.md", "P0_C02_REVIEW.md",
}


def integer(value: object, minimum: int = 0) -> None:
    assert type(value) is int and minimum <= value <= SAFE_INTEGER, value


def walk(value: object, private_type: str = "", path: tuple = ()) -> None:
    if isinstance(value, list):
        for child in value:
            walk(child, private_type, path)
    if not isinstance(value, dict):
        return
    for key, child in value.items():
        child_path = path + (key,)
        assert not any(word in key.lower() for word in (
            "secret", "token", "password", "pickupcode", "sessioncodehash", "codehash",
        )), f"Sensitive field in example: {key}"
        if key == "sessionCode":
            assert private_type == "ApiSuccess<OwnerSessionOpenedView>"
            assert child_path == ("data", "sessionCredential", "sessionCode")
            assert isinstance(child, str) and re.fullmatch(r"[0-9]{6}", child)
        if key == "pickup" and child is not None:
            assert private_type == "ApiSuccess<PrivateOrderTrackingView>"
            assert child_path == ("data", "pickup")
            assert child["code"] == "DEMO-ONLY-NOT-A-REAL-CODE"
        if key.endswith("Vnd"):
            integer(child)
        if key.endswith("At") and child is not None:
            assert isinstance(child, str) and child.endswith("Z"), (key, child)
            datetime.fromisoformat(child.replace("Z", "+00:00"))
        if key == "serviceDate" and child is not None:
            date.fromisoformat(child)
        walk(child, private_type, child_path)


def order_check(order: dict, order_labels: dict, payment_labels: dict) -> None:
    mode, status = order["type"], order["status"]
    dine_in = mode == "dine_in"
    assert mode in ("dine_in", "takeaway")
    assert (order["tableSessionId"] is not None) == dine_in
    assert (order["table"] is not None) == dine_in
    assert order["statusLabel"] == order_labels[status]
    fields = [order["ticketNo"], order["serviceDate"], order["acceptedAt"]]
    if order["ticketNo"] is None:
        assert all(v is None for v in fields)
        assert not dine_in
        assert status in ("pending_payment", "payment_exception", "cancelled")
    else:
        assert all(v is not None for v in fields)
        integer(order["ticketNo"], 1)
    if status in ("accepted", "preparing", "ready", "completed"):
        assert order["ticketNo"] is not None
        if not dine_in:
            assert order["paymentStatus"] == "paid"
    if status == "cancelled" and not dine_in:
        assert (order["paymentStatus"] == "paid") == (order["ticketNo"] is not None)
    expected_fulfillment = {
        "pending_payment": "awaiting_preparation", "payment_exception": "awaiting_preparation",
        "accepted": "awaiting_preparation", "preparing": "preparing", "ready": "ready",
        "completed": "served" if dine_in else "collected", "cancelled": "cancelled",
    }
    assert order["fulfillmentStatus"] == expected_fulfillment[status]
    if "lines" in order:
        assert order["itemCount"] == sum(line["quantity"] for line in order["lines"])
        for line in order["lines"]:
            integer(line["quantity"], 1)
            assert line["unitPriceVnd"] == line["baseUnitPriceVnd"] + sum(
                option["priceDeltaVnd"] for option in line["options"]
            )
            assert line["lineTotalVnd"] == line["unitPriceVnd"] * line["quantity"]
        assert order["totalVnd"] == sum(line["lineTotalVnd"] for line in order["lines"])
        payment = order["payment"]
        assert payment["status"] == order["paymentStatus"]
        assert payment["amountVnd"] == order["totalVnd"]
        assert payment["statusLabel"] == payment_labels[payment["status"]]
        if dine_in:
            assert payment["tableSessionId"] == order["tableSessionId"]
            assert payment["kind"] == "table_session" and payment["intentStatus"] is None
        else:
            assert payment["kind"] == "takeaway"
            assert payment["intentStatus"] == {
                "pending": "pending", "paid": "succeeded", "failed": "failed",
                "expired": "expired", "exception": "exception",
            }[payment["status"]]


def main() -> None:
    assert all((ROOT / filename).is_file() for filename in REQUIRED)
    source = (ROOT / "types.ts").read_text(encoding="utf-8")
    examples = (ROOT / "EXAMPLES.md").read_text(encoding="utf-8")
    api = (ROOT / "API_CONTRACT_V1.md").read_text(encoding="utf-8")
    assert "\ufffd" not in examples and "\ufffd" not in source
    pattern = r"<!-- contract: (.*?) -->\s*```json\s*(.*?)\s*```"
    original_blocks = re.findall(pattern, examples, re.S)
    assert len(original_blocks) == len(re.findall(r"```json", examples)) >= 19
    api_blocks = re.findall(pattern, api, re.S)
    assert len(api_blocks) == len(re.findall(r"```json", api)) >= 22
    blocks = original_blocks + api_blocks
    values = [json.loads(raw) for _, raw in blocks]
    order_labels = dict(re.findall(r"(\w+): '([^']+)'", source.split("export const ORDER_STATUS_LABELS = {", 1)[1].split("} as const", 1)[0]))
    payment_labels = dict(re.findall(r"(\w+): '([^']+)'", source.split("export const PAYMENT_STATUS_LABELS = {", 1)[1].split("} as const", 1)[0]))
    assert set(order_labels) == {
        "pending_payment", "accepted", "preparing", "ready", "completed", "cancelled", "payment_exception",
    }
    def recursive_orders(value):
        if isinstance(value, list):
            for child in value:
                recursive_orders(child)
        if isinstance(value, dict):
            if "ticketNo" in value and value.get("type") in ("dine_in", "takeaway"):
                order_check(value, order_labels, payment_labels)
            for child in value.values():
                recursive_orders(child)

    for (typ, _), value in zip(blocks, values):
        walk(value, typ)
        recursive_orders(value)
        if "error" not in value:
            continue  # CreateOrderInput is not an API envelope.
        if value["error"] is not None:
            assert value["data"] is None
        else:
            assert typ.startswith("ApiSuccess<")
        data = value["data"]
        if not isinstance(data, dict):
            continue
        if "ticketNo" in data:
            order_check(data, order_labels, payment_labels)
        if "orders" in data:
            for order in data["orders"]:
                order_check(order, order_labels, payment_labels)
            if "session" in data:
                session = data["session"]
                assert all(o["tableSessionId"] == session["id"] for o in data["orders"])
                assert session["orderCount"] == len(data["orders"])
                assert session["totalVnd"] == sum(o["totalVnd"] for o in data["orders"] if o["status"] != "cancelled")
            else:
                orders = data["orders"]
                assert all(o["storeId"] == data["storeId"] for o in orders)
                assert all(o["status"] in ("accepted", "preparing", "ready") for o in orders)
                assert orders == sorted(orders, key=lambda o: (o["serviceDate"], o["ticketNo"], o["id"]))
                assert len({(o["storeId"], o["serviceDate"], o["ticketNo"]) for o in orders}) == len(orders)
    before, after = values[8]["data"], values[9]["data"]
    assert before["id"] == after["id"] and before["ticketNo"] is None and after["ticketNo"] == 29
    assert values[0]["data"]["session"] is None and values[0]["data"]["requiresSessionCode"]
    assert values[1]["data"]["session"]["id"] == "session-05"
    assert len(re.findall(r"^\| Q\d+ \|", (ROOT / "OPEN_QUESTIONS.md").read_text(encoding="utf-8"), re.M)) <= 8
    route_sections = re.findall(r"^## (R\d{2}) — ([^\n]+)\n(.*?)(?=^## |\Z)", api, re.M | re.S)
    assert [rid for rid, _, _ in route_sections] == [f"R{i:02}" for i in range(1, 22)]
    for rid, title, section in route_sections:
        assert re.search(r"\b(GET|POST|PATCH) /api/", title), rid
        assert re.search(pattern, section, re.S), f"{rid} missing typed complete response"
        assert any(word in section for word in ("Rate", "rate")), f"{rid} missing rate note"
    matrix = (ROOT / "SECURITY_AND_CONCURRENCY.md").read_text(encoding="utf-8")
    planned_cases = len(re.findall(r"^\| S\d{2} \|", matrix, re.M))
    assert planned_cases >= 15

    compiler = shutil.which("tsc.cmd") or shutil.which("tsc")
    assert compiler, "Existing TypeScript compiler (tsc) required; no packages are installed."
    imports = sorted({name for typ, _ in blocks for name in re.findall(r"\b[A-Z]\w*", typ)} | {"OrderSummary"})
    ts = ["import type { " + ", ".join(imports) + " } from './types';"]
    for index, ((typ, _), value) in enumerate(zip(blocks, values), 1):
        ts.append(f"const example{index} = {json.dumps(value, ensure_ascii=False)} satisfies {typ};")
    # Negative samples prove ticket/type/status constraints are effective, rather
    # than merely demonstrating that valid samples compile.
    invalid = copy.deepcopy(values[5]["data"])
    invalid.update(ticketNo=None, serviceDate=None, acceptedAt=None)
    ts.append("// @ts-expect-error accepted dine-in requires an issued ticket\nconst badTicket: OrderSummary = " + json.dumps(invalid, ensure_ascii=False) + ";")
    invalid = copy.deepcopy(before)
    invalid.pop("payment"); invalid.pop("lines"); invalid.pop("note")
    invalid.update(ticketNo=99, serviceDate="2026-10-23", acceptedAt="2026-10-23T03:00:00Z")
    ts.append("// @ts-expect-error pending takeaway cannot have a ticket\nconst badPending: OrderSummary = " + json.dumps(invalid, ensure_ascii=False) + ";")
    invalid = copy.deepcopy(after)
    invalid.pop("payment"); invalid.pop("lines"); invalid.pop("note")
    invalid["paymentStatus"] = "pending"
    ts.append("// @ts-expect-error accepted takeaway must be paid\nconst badPaid: OrderSummary = " + json.dumps(invalid, ensure_ascii=False) + ";")
    ts.append("// @ts-expect-error v1 creation requires menuRevision\nconst missingRevision: import('./types').CreateOrderV1Input = " + json.dumps(values[4], ensure_ascii=False) + ";")
    ts.append("// @ts-expect-error no pickup field belongs to the shared order DTO\nconst leakedPickup = { ...example6.data, pickupCode: 'DEMO' } satisfies OrderSummary;")
    ts.append("// @ts-expect-error unknown state not allowed\nconst unknownStatus: import('./types').OrderStatus = 'SESSION_CLOSED';")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".ts", prefix=".contract-check-", dir=ROOT, delete=False) as file:
            temporary = Path(file.name)
            file.write("\n".join(ts))
        completed = subprocess.run([compiler, "--strict", "--noEmit", "--target", "ES2020", "--module", "ESNext", "--moduleResolution", "bundler", str(temporary)], capture_output=True, text=True, encoding="utf-8")
        assert completed.returncode == 0, completed.stdout + completed.stderr
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)
    print(f"PASS: {len(original_blocks)} C01 + {len(api_blocks)} C02 typed JSON examples; strict TypeScript; 6 negative type checks; 21 route sections; {planned_cases} planned runtime cases.")
    print("PASS: ticket/state/money/scope references and private-only allowlisted demo credential fields.")
    print("Static contract checks only. Runtime implementation/verification is reported separately in docs/integration; this command does not verify backend authorization, webhook signatures or DB races.")


if __name__ == "__main__":
    main()
