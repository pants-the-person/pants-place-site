// Outputs: /builtwith.json
export async function GET({params, request}) {
    return new Response(
      JSON.stringify({
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
      })
    )
  }