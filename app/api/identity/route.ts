export function GET() {
  return new Response(JSON.stringify({ app: "kanbanflow" }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
