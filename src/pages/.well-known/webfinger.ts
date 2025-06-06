// Outputs: /builtwith.json
export async function GET({params, request}) {
  const localWebfinger = {
    "subject": "acct:pants_the_person@defcon.social",
    "aliases": [
      "https://defcon.social/@pants_the_person",
      "https://defcon.social/users/pants_the_person"
    ],
    "links": [
      {
        "rel": "http://openid.net/specs/connect/1.0/issuer",
        "href": "https://cloud.pants.place"
      },
      {
        "rel": "authorization_endpoint",
        "href": "https://cloud.pants.place/apps/oidc/authorize"
      },
      {
        "rel": "token_endpoint",
        "href": "https://cloud.pants.place/apps/oidc/token"
      },
      {
        "rel": "userinfo_endpoint",
        "href": "https://cloud.pants.place/apps/oidc/userinfo"
      },
      {
        "rel": "jwks_uri",
        "href": "https://cloud.pants.place/apps/oidc/jwks"
      },
      {
        "rel": "http://webfinger.net/rel/profile-page",
        "type": "text/html",
        "href": "https://defcon.social/@pants_the_person"
      },
      {
        "rel": "self",
        "type": "application/activity+json",
        "href": "https://defcon.social/users/pants_the_person"
      },
      {
        "rel": "http://ostatus.org/schema/1.0/subscribe",
        "template": "https://defcon.social/authorize_interaction?uri={uri}"
      }
    ]
  };

  try {
    const response = await fetch('https://cloud.pants.place/index.php/.well-known/webfinger');
    const remoteWebfinger = await response.json();

    // Combine the links arrays, removing duplicates
    const combinedLinks = [...new Map([...localWebfinger.links, ...remoteWebfinger.links].map(item => [item.href, item])).values()];

    const combinedWebfinger = {
      ...localWebfinger,
      links: combinedLinks,
    };

    return new Response(JSON.stringify(combinedWebfinger));

  } catch (error) {
    console.error("Error fetching remote webfinger:", error);
    return new Response(JSON.stringify(localWebfinger)); // Return local data on error
  }
}
