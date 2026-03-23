// Extract actual tool arguments from Retell's request body.
// Retell may wrap args in: {call: {...}, query: "bidet"} or {args: {query: "..."}}
// or send {query: "bidet"} directly. This normalizes all cases.
export function extractArgs(body: Record<string, any>): Record<string, any> {
  if (body.args && typeof body.args === 'object') return body.args;
  if (body.arguments && typeof body.arguments === 'object') return body.arguments;
  if (body.call && typeof body.call === 'object') {
    const { call, ...rest } = body;
    return rest;
  }
  return body;
}
