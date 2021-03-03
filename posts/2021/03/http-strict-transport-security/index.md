---
title: "HTTP Strict Transport Security (HSTS)"
image: /posts/2021/03/http-strict-transport-security/thumb.png
image_dev: /posts/2021/03/http-strict-transport-security/thumb-dev.png
description: What is HSTS policy and how it helps to prevent man-in-the-middle attacks
date: 2021-03-03
tags:
  - Node.js
  - Security
  - SSL/TLS
  - HTTP
  - MITM
  - mitmproxy
  - SSLstrip
---

This is a post in the series on Node.js security best practices. Each post covers one security best practice in detail.

```text
Problem → Example attack → Solution → Implementation in Node.js → Implications
```

Code for this post's [vulnerable demo project](https://github.com/maximivanov/vulnerable-by-design/tree/main/hsts).

Today's topic is the *HTTP Strict Transport Security (HSTS)* policy.

It's 2021 now, and serving websites and APIs over a secure (SSL/TLS) channel is the default mode of deployment. 
You can have a free certificate from your cloud provider (AWS, Azure, Cloudflare) or you can generate one with LetsEncrypt.
You install the certificate, configure the HTTP → HTTPS redirect... your and your visitors' data is safe now.

Or is it? Unfortunately, not always. Your web app may still be vulnerable to the **Man-in-the-Middle** (MITM) attacks.
If you're curious how, read on - we will simulate such an attack in the local environment and then will see how to prevent it from the code in Node.js.

We will see what HSTS is from the developer's point of view:
- Does it apply to websites only or to APIs as well?
- What are HSTS preloaded lists?
- How to safely deploy HSTS in production?
- What are the limitations and implications of enabling the policy?


## The problem

So what's the vulnerable scenario to consider?

Even if you have the HTTP to HTTPS redirect on your website, the **initial request** a user makes may be sent over the **insecure connection**. That's when it can be intercepted and modified by **any router/proxy** sitting in between the user and the server.

Imagine you're that poor *about-to-be-victim*. You're in the airport waiting for your flight bored to death. You pull out your phone, scroll through the list of public wifi access points and choose legitemately-looking *JFK Free Wi-Fi*.
Too bad the access point was set up by another bored soul - a tech-savvy teenager sitting next to you!

In the browser you enter your favorite procrastination resource *example.com*. 

![mitm flow](/posts/2021/03/http-strict-transport-security/mitm-flow.webp)

1. Your browser makes a `GET` HTTP request to `http://example.com`. It is intercepted by the MITM and forwarded to the server.
2. Server replies with `301 Location: https://example.com` redirect. Fake access point rewrites all https urls in the response (headers included) to http versions.
3. Your browser sees a redirect to `http://example.com`. What the hell, isn't it the same url that was just requested? OK, following the redirect.
4. MITM intercepts the request and rewrites it to `https://example.com`. The server returns the page to the MITM via the secure TLS connection.
5. MITM returns the page to you via the insecure connection. 
6. You go to the login page, enter your credentials and submit the form. MTIM proxies that request, storing your password in the log for the attacker to review later.

In fact, in your communication with example.com, even though it enforces the HTTP-to-HTTPS redirect, not a single page was served to you via HTTPS.
Browsers may show a warning to signal the connection is not secure but you were so desperate to see the latest jokes that you ignored the warning.

This type of attack is called **SSLstrip** - the secure transport communication between you and the server is removed.

Is SSL Strip the only possible attack? Glad you asked, there are more!

- *Cookie Hijacking* attack where the **unencrypted traffic on a public wireless network** can be monitored for secrets in cookies sent in plain text.
- Instead of proxying user's traffic to `example.com`, MITM redirects the browser to **attacker's owned phish** `examp1e.com` (note letter `l` replaced with `1`). This website looks exactly the same as original. It has a valid TLS certificate and the browser will be happy. Users may spot the change in the URL... or they may not.
- Instead of downgrading the secure channel for the user, MITM can respond with a self-signed certificate. Again the browser will warn about suspicous certificate but the user may simply **click-through the warning**: *Ignore it, I don't mind, I need my instant gratification here and now*.

What if we stop serving HTTP traffic altogether (close port 80 on the server)? It won't help, because the problem is not with server responding to HTTP, it's about browser **attempting to request via HTTP**.

## Example attack: SSLstrip

You can find a vulnerable project demonstrating the SSLstrip attack in the [series repo](https://github.com/maximivanov/vulnerable-by-design/tree/main/hsts).

If you want to run it yourself, you will only need Docker installed on your machine. Clone the repo and switch to the `hsts` folder.

Below are the steps to reproduce the attack along with brief comments:

1\. Generate a local root Certificate Authority (CA). For the test to be realistic, we need a website protected with a valid (as the browser sees it) certificate. [mkcert](https://github.com/FiloSottile/mkcert) is a great tool that makes it simple to generate TLS certificates for local development.

```bash
mkcert -install
```

2\. Generate certificate valid for `localhost`

```bash
mkcert -cert-file localhost-cert.pem -key-file localhost-key.pem localhost 127.0.0.1
```

3\. Build the Docker image. It is based on the official Node.js image. It also contains [mitmproxy](https://mitmproxy.org/) to simulate the MITM router as well as a script to facilitate the SSLstrip attack.

```bash
docker build -t mitmproxy-node - < Dockerfile
```

4\. Start a container. It mounts current directory with the Node.js code and root CA certificate generated in step 1. Additionally it maps ports `80` and `443` to serve the website and port `8080` where `mitmproxy` listens.

```bash
docker run -it \
    --rm \
    -v "$(pwd):/var/app" \
    -v "$(mkcert -CAROOT):/var/mkcert" \
    -p 127.0.0.1:80:80 \
    -p 127.0.0.1:443:443 \
    -p 127.0.0.1:8080:8080 \
    -w /var/app \
    mitmproxy-node bash
```

5\. Start the server (web app)

```bash
node index.js
```

6\. In a separate tab on your host machine, connect to the running container:

```bash
docker exec -it -w /var/mitmproxy $(docker ps -a -q  --filter ancestor=mitmproxy-node) bash
```

7\. Start mitmproxy

```bash
mitmproxy --set ssl_verify_upstream_trusted_ca=/var/mkcert/rootCA.pem -s sslstrip.py
```

8\. Configure your browser to use HTTP proxy at `127.0.0.1:8080`

9\. Visit http://localhost in the browser and click through the user flow entering your login and password (can be anything).

![mitmproxy requests](/posts/2021/03/http-strict-transport-security/mitmproxy-requests.webp)

You can see the requests made by the browser in `mitmproxy`:

If you expand the `POST` request, you will see the credentials were intercepted:

![mitmproxy credentials intercepted](/posts/2021/03/http-strict-transport-security/mitmproxy-credentials-intercepted.webp)

## Solution: HSTS

What can we do in order to keep the traffic between users and servers safe? 

HTTP Strict Transport Security is a IETF standard approved in 2012 that was designed to help solve the problem of clients making insecure requests to secure-able endpoints.

If you take away one thing from this post, remember `HSTS = HTTPS only`.

It lets a webserver inform the browser (and any other complying User Agents) to **communicate with that server's domain only in a secure fashion**. 
Browser acknowledges the instruction and marks the server's domain as **Known HSTS host**. 
Next time, when establishing an HTTP connection, the browser will check if target host is:
- one of known HSTS hosts
- a subdomain of one of known HSTS hosts having `includeSubdomains`
If either is true, the browser will treat the host as **HTTPS only**.

What benefits does it bring?

1\. Browser **transforms all HTTP requests** to a known HSTS host into HTTPS requests automatically.
- When user enters `example.com` or `http://example.com` in the browser's address bar
- When user clicks `http://...` link or a bookmark
- When the code makes a `fetch` request
- When browser is about to follow a `http` redirect

2\. Browser **prevents clicking through** certificate warning messages.

When you open a page that has a SSL certificate issue, browser will show a warning page. Normally you can click something like *I understand, let me in* and continue browsing. When any SSL error/warning occurs on a known HSTS host, browser will **block the user** from using the page completely. The error message will be not dismissable. This is useful to prevent self-signed certificate attack mentioned above.

3\. As an added bonus, it saves an extra redirect when user enters `http://example.com`. Because browser already knows it's a HSTS host it will fetch `https://example.com` right away.

How does server declare itself as HTTPS-only? Via a `Strict-Transport-Security` HTTP header.

## Strict-Transport-Security header

The header value can consist of 3 directives. An example with all 3:

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### max-age

- Required
- For how long browser should cache and apply given HSTS policy
- Every time browser receives the header, it will refresh the expire time (rolling)

`max-age=0` has special meaning:

- If host that sends it is known, stop treating the host as HSTS and remove the policy
- If host is unknown, do not add it to the list of known HSTS hosts


### includeSubDomains

- Optional
- If present, makes browser apply the policy to all subdomains of the host. For example if the directive is issued by `foo.example.com`, `foo.example.com` and `bar.foo.example.com` will be considered as HTTPS-only, but not `example.com` and `baz.example.com`
- Unless you have a good reason not to, you should include all subdomains to be covered by the HSTS policy

### preload

- Optional
- Not a part of the standard but rather an initiative by browser vendors
- Indicates the site owner agrees the site to be included in the HSTS Preload list

What's the use for `preload`?

**Even if a site added the HSTS header**, there's a small window where a user visiting that site can still be subject to a MITM attack.

HSTS policy is activated only if the user **visited the site previously** (and the browser processed the header). If the browser doesn't know anything about the site, whether it's HSTS-enabled or not, it may establish an insecure connection.
The browser may know nothing about the HSTS status of the site in case:
- It never loaded that site before
- Browser cache was cleared
- HSTS policy expired

To solve this problem, browser vendors ship their browsers with a huge list of known HSTS domains baked in. If the domain is in the HSTS preload list, insecure connection to that domain will **never happen**.

`preload` directive in the header only communicates site owner's **consent** to be included in the preload list.
In order to add a domain to the list, you still need to submit it at https://hstspreload.org. The site must meet the requirements to be included.
The submission site is maintained by Google and the list is used by **all major browsers** (though each vendor may decide to include extra entries).

There are serious implications to the preload list inclusion:

- It is a **one way ticket**. After the domain is added browsers will use HTTPS scheme only to load that domain, no matter the header value, expiration date or cache state
- You can ask to remove the domain from HSTS preload list, but it **can take months** to happen

For some domains you may not need to add them to the preload lists as their TLDs are included by default. That's the case with `.dev` and `.app` for example.

## Implement in Node.js

Implementing HSTS is as simple as adding the `Strict-Transport-Security` header in your code.

In Express (put it before any other controller):

```js
app.use(function(req, res, next) {
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains') // 2 years
  }
  next()
})
```

If you try to access the site with the same mitmproxy setup after HSTS was implemented you will see something similar:

![hsts warning firefox](/posts/2021/03/http-strict-transport-security/hsts-warning-firefox.webp)

Implement in Azure Functions:

```js
module.exports = async function (context, req) {
    let headers = {
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    }

    ...
    context.res = {
        body,
        headers,
        status
    }
}
```

Implement in AWS Lambda (you may want to add it in API Gateway instead):

```js
exports.handler = async (event) => {
  ...
  let response = {
    statusCode: responseCode,
    headers: {
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    },
    body: JSON.stringify(responseBody),
  }

  return response;
};
```

## Safe HSTS deployment plan

Inspired by the great HSTS tutorial from [Scott Helme](https://scotthelme.co.uk/hsts-cheat-sheet/).

The idea is to start small and gradually increment the expiration time and inclusion criteria.

1. Find out all subdomains you have (consult DNS CNAME entries). Those may be served by your servers or **3rd party services**
2. Make sure the root domain and all subdomains can serve traffic over SSL/TLS (accessible via HTTPS)
3. Ensure HTTP -> HTTPS redirect is configured
4. Set small expiration time, e.g. `max-age=600` (10 minutes), make sure all systems operational
5. Add `includeSubDomains` directive
6. Make incremental changes to `max-age`. Aim for the value of 2 years
7. Add `preload` directive and submit the domain to the HSTS preload list

## Implications / considerations

⚡︎ HSTS is **well supported** by all browsers: https://caniuse.com/stricttransportsecurity

⚡︎ Even with HSTS in place, you still need the **HTTP → HTTPS** redirect.

⚡︎ It should be clear how websites or webapps that users load can benefit from HSTS. Does it make sense to add the header to **APIs**?
- **No**, if the API is consumed only by trusted clients, where the scheme is hardcoded and cannot be changed. Think mobile apps or servers using your API.
- **Yes**, if the API is used by browsers. If the web app that calls your API is compromised it can be tricked to make insecure calls: `http://your-no-longer-safe-api`.

⚡︎ HSTS won't help against attacks to the **SSL/TLS protocol** itself, as well as in cases where the server or browser are compromised.

⚡︎ HSTS is **not related to the certificates** being used by the server **as long as the certificates are valid**. You can replace/renew certificates at any time.

⚡︎ Users can **manually add and remove HSTS hosts** in browser settings (not preloaded lists though).

⚡︎ If you **redirect** `http://example.com` → `https://www.example.com` and latter sets the HSTS header with subdomains, `example.com` (root) and `sub.example.com` won't have HSTS.
Solution: include 1px picture from `https://example.com` (which will set the header on the root domain and all subdomains) on every page. 
Or better, add the domain to the HSTS preloaded list.

⚡︎ HSTS preferences are not shared between normal/**incognito** modes in the browser.

⚡︎ HSTS domain may be vulnerable to a **NTP attack**. Victim gets fake response from the NTP server and expires existing HSTS preferences.
Not effective if the domain is in browsers' pre-loaded list.

⚡︎ Even if domain is added to the preloaded lists, you still need to send the `Strict-Transport-Security` for clients that **do not use the list**.

⚡︎ HSTS headers must not be sent with **insecure HTTP responses** (and if you do, browsers won't process them anyway).

⚡︎ Browsers will ignore HSTS headers received over **SSL connection with warnings** (e.g. using self-signed certificate).

⚡︎ Browsers will ignore HSTS headers if the hostname is in the form of **IP address**.

⚡︎ Funny fact: `google.com` does not set HSTS policy on the root domain (mail.google.com does have it). It seems that's due to the requirement to [support legacy workflows](https://security.stackexchange.com/questions/239241/google-com-is-not-hsts-protected).

## References

- https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security
- https://tools.ietf.org/html/rfc6797
- https://scotthelme.co.uk/hsts-cheat-sheet/
- https://github.com/maximivanov/vulnerable-by-design/tree/main/hsts

## ...

Stay tuned for the next posts in the Node.js security best practices series!