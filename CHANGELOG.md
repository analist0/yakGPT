# Changelog

## 2026-10 — Tools in realtime voice

- **עברית:** בשיחה הקולית עם Grok אפשר עכשיו להשתמש באותם כלים כמו בצ'אט: הכלים המובנים, שרתי MCP וסקילים. כל קריאה לכלי מוצגת בצ'אט ככרטיס, והמודל עונה בקול עם התוצאה.
- `stores/XaiRealtime.ts`:
  - sends the active tools in `session.update` (`tools`) and adds the skills list and a short tool hint to the instructions;
  - runs `response.function_call_arguments.done` calls through `runTool` and returns `function_call_output` items;
  - sends a single `response.create` once the response is done and all of its calls have outputs, and none after an interrupted (cancelled) response;
  - falls back to `function_call` items in `response.done`, deduplicated by `call_id`;
  - stores calls and results as `toolCalls` on the assistant message, so they render like text-chat tool calls.
