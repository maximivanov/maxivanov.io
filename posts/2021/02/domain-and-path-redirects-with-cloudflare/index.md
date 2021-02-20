---
title: Domain and path redirects with Cloudflare
description: How to forward with Cloudflare page rules and workers
date: 2021-02-19
tags:
  - Cloudflare
  - Cloudflare Workers
  - SEO
---

Below is a quick overview of common scenarios where you may need to redirect visitors to another domain/url and how you can implement such redirection with Cloudflare.

The answer to all of the scenarios is either Page Rules or Workers. Note both require the domain where you forward from to be proxied by Cloudflare (orange cloud enabled on the DNS tab). 

You can have up to 3 page rules and process up to 100k requests/day with the Cloudflare Free plan.

## Redirect all traffic for `source.com` to `target.com`

Make sure there's a proxied DNS record for the root `@` on the DNS tab of `source.com`. If missing, create one. *Target* can be anything, since forwarding page rule will execute before target is evaluated.

![Create DNS record for source domain](/posts/2021/02/domain-and-path-redirects-with-cloudflare/create-dns-record-for-source-domain.webp)

Create the redirect page rule. Set relevant HTTP redirection code:

- `302` if it's a temporary setup and source.com will start serving traffic directly in future
- `301` if forwarding is permanent and you expect source domain to be always used to redirect visitors

![Redirect domain page rule](/posts/2021/02/domain-and-path-redirects-with-cloudflare/redirect-domains-with-cloudflare.webp)

What if you want to preserve the path during forwarding, i.e. `source.com/login` must redirect to `target.com/login`?
In the *Destination URL* field of the page rule, append `$1` (value matched from the source), so that it reads `https://target.com/$1`.

## Redirect non-www to www

![Redirect non-www to www](/posts/2021/02/domain-and-path-redirects-with-cloudflare/non-www-to-www.webp)

## Redirect www to non-www

![Redirect www to non-www](/posts/2021/02/domain-and-path-redirects-with-cloudflare/www-to-non-www.webp)

## Redirect specific path to a URL

You may want to make a nice short link at your root domain forwarding to some file you want to share. 
Consider `mycompany.com/deck` pointing to a downloadable pdf file to share with investors.

![Path redirect with Cloudflare](/posts/2021/02/domain-and-path-redirects-with-cloudflare/path-redirect-with-cloudflare.webp)

## Redirect paths to subdomains

Let's say there's a requirement to redirect country/locale codes in in paths to subdomains:

`https://mycompany.com/fr` → `https://fr.mycompany.com`
`https://mycompany.com/de/some-page` → `https://de.mycompany.com/some-page`
...
but `https://mycompany.com/en` → `https://mycompany.com`

Page rules is not flexible enough to handle this scenario. Cloudflare Workers to the rescue!

Go to the *Workers* tab → *Manage Workers* → *Create a Worker*

Create a basic worker that will parse the path, see if it's a country code, rewrite and redirect the URL if needed.

```js
const redirectHttpCode = 301

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Respond to the request
 * @param {Request} request
 */
async function handleRequest(request) {
  const url = new URL(request.url)
  const { pathname } = url
  
  const pathParts = pathname.split('/')
  const pathPrefix = pathParts[1]
  if (pathPrefix.length === 2) { // country code, you may want to do an inclusion check instead
    if (pathPrefix !== 'en') {
      url.host = `${pathPrefix}.${url.host}` // prepend subdomain
    }
    pathParts.splice(1, 1) // remove country code from path
    url.pathname = pathParts.join('/')

    return Response.redirect(url.toString(), redirectHttpCode)
  }

  return fetch(request) // by default proxy request as usual
}
```

Go back to the *Workers* tab → *Add route*. 
Set *Route* to `mycompany.com/*`. Select the worker you created in previous step. *Save*.

In less than a minute, you can confirm forwarding scenarios work as expected.

## ...

Forwarding URL page rule covers basic use cases. If you need to apply custom logic with advanced mapping and url replacements, Cloudflare Workers should be used instead.