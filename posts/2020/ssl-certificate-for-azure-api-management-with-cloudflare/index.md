---
title: SSL certificate for Azure API Management with Cloudflare
description: Want to add a custom domain to your APIM instance? Using Cloudflare? Generate a free SSL certificate in minutes.
date: 2020-12-13
tags:
  - Cloudflare
  - Azure
  - Azure APIM
  - SSL/TLS
---

**`<TLDR>`** Want to add a custom domain to your APIM instance? Using Cloudflare? Generate a free SSL certificate in minutes. **`</TLDR>`**

When new API Management instance is created it's reachable with a default hostname from Azure: `your-apim-name.azure-api.net`.

If you add a `CNAME` record pointing to that hostname (e.g. `api.your-company.com`) and query the cname, you will get the `HTTP Error 503. The service is unavailable.` error. That's because APIM uses the hostname to route the request internally (to the gateway / developer portal / management portal). And at this point it doesn't know anything about `api.your-company.com`.

In order to add a custom domain to APIM you need to present a valid SSL certificate for that domain.

If you have the certificate (purchased or generated with LetsEncrypt) you can upload that (and you're done).

In case you don't have it yet, and in case you use Cloudflare as a caching/protection layer (orange cloud ON) on top of your API it's very easy to generate a SSL certificate for API Management.

It takes 3 steps.

## Generate origin certificate in Cloudflare

1. Log in to Cloudflare dashboard
2. Go to **SSL/TLS** tab
3. Go to **Origin Certificates** / **Create Certificate**
4. Check if you need to add anything to the hostnames list, otherwise keep the default settings. Click **Next**
5. Choose `PEM` key format. Save **Origin Certificate** to `api.your-company.com.pem` file and **Private Key** to `api.your-company.com.key` file

## Convert generated certificate from PEM to PFX

Cloudflare lets you export a certificate in `PEM` format (common file extensions are `.pem`, `.crt` and `.cer`).
Azure wants the binary `PKCS#12`/`PFX` certificate format (common file extensions are `.pfx` and `.p12`).
You can convert between these 2 formats using `openssl` command line tool (available in OS X and \*nix).

In the folder where you saved `.pem` and `.key` files run:

```bash
openssl pkcs12 -export -out api.your-company.com.pfx -inkey api.your-company.com.key -in api.your-company.com.pem
```

Optionally provide a password.

## Import PFX certificate to APIM

1. In Azure Portal, go to the API Management instance.
2. Go to **Custom Domains** / **Add**
3. Select the APIM component you're adding custom domain to (API Gateway / Management Portal / Developer Portal)
4. Provide the hostname: `api.your-company.com`
5. Certificate: Custom / Select the pfx file.
6. Add.

It will take a few minutes to process the upload. Confirm `api.your-company.com` no longer returns 503 but responds with valid APIM responses.
