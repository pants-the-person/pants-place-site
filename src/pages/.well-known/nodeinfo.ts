export async function GET() {
  try {
    const response = await fetch('https://cloud.pants.place/index.php/.well-known/nodeinfo');
    const nodeInfo = await response.json();
    return new Response(JSON.stringify(nodeInfo));
  } catch (error) {
    console.error("Error fetching remote nodeinfo:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch nodeinfo" })); // Return error on failure
  }
}
