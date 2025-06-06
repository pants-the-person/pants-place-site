export async function GET() {
  const nodeInfo = {
    "version": "2.1",
    "software": {
      "name": "Astro",
      "version": "4.0"
    },
    "protocols": [
      "activitypub"
    ],
    "services": {
      "inbound": [],
      "outbound": []
    },
    "openRegistrations": false,
    "usage": {
      "users": {
        "total": 1
      }
    },
    "metadata": {}
  };

  return new Response(JSON.stringify(nodeInfo));
}
