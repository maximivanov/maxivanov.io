---
title: Azure API Management visually explained
description: 'Visual overview of Azure API Management service: what it is, how it works and how it can be useful to you.'
image: /posts/2020/azure-api-management-visually-explained/cover.jpeg
date: 2020-12-08
tags:
  - Azure
  - Azure APIM
  - API Gateway
  - Visually explained
---

**`<TLDR>`** Visual overview of Azure API Management service: what it is, how it works and how it can be useful to you. **`</TLDR>`**

API Management (APIM for short) is a managed API Gateway service in Azure coming with a rich set of features. If you're not familiar with the concept you can think of an API Gateway as a middleman that operates between clients (web apps, mobile clients, other APIs) and your backend API.

![API Gateway](/posts/2020/azure-api-management-visually-explained/api-gateway.webp)

API Management can help protect backend services, improve performance, manage developer and partner subscriptions, enforce usage quotas and throttling. You get analytics, monitoring and alerts out of the box.

## 3 Components of APIM

![API Management Components](/posts/2020/azure-api-management-visually-explained/components.webp)

**Azure Admin Portal**

- Define or import API schema
- Add APIs to Products (we'll cover products below)
- Configure request/response transformations and usage quotas
- View analytics and logs
- Manage users and subscriptions

**Developer Portal**

- Automatically generated website with documentation of APIs
- If running an external/internal API program, this is the portal developers will use
- Try API in the interactive console
- Subscribe to Products and get API keys
- Developers can access analytics of their own usage
- Devs can sign up with social providers, Azure AD or regular login/passwords
- Can be customized with content, custom styles and branding (visual in-page editor for admins)
- Has to be published by admin for others to access

**API Gateway**

- Accepts API calls and routes them to the backend
- Verifies API keys, JWT tokens, certificates, credentials
- Enforces usage quotas and rate limits
- Transforms APIs on the fly
- Can cache backend responses
- Logs request traces
- Can be Azure-managed or deployed on-prem / to other clouds (Developer and Premium tiers only)
- Supports multi-region deployment (see below)
- Can scale up and out (see below)

## API Management use cases

Below are some of the common use cases for the API Management. Note there are many more.

### Modify backend requests

![Modify backend requests](/posts/2020/azure-api-management-visually-explained/modify-backend-request.webp)

Alter headers, add new fields to the request body or change the request format completely.

### Modify backend responses

![Modify backend responses](/posts/2020/azure-api-management-visually-explained/modify-backend-response.webp)

Example: Transform the backend response format from XML to JSON.

### Route requests to different backends

![Route requests to different backends](/posts/2020/azure-api-management-visually-explained/multiple-backends.webp)

With route mapping you can forward requests to different backends. Backend can be a HTTP service or another Azure service (e.g. Storage).

### Rate-limit requests

![Rate-limit requests](/posts/2020/azure-api-management-visually-explained/rate-limiting.webp)

Apply rate limits and quotas per subscription or dynamically computed key (visitor IP address, user ID from incoming JWT).

### Cache backend responses

![Cache backend responses](/posts/2020/azure-api-management-visually-explained/cache-backend.webp)

Apply cache policies with dynamic cache keys and configurable expire time.

### Verify JWT

![Verify JWT](/posts/2020/azure-api-management-visually-explained/verify-jwt.webp)

Restrict access to the API by validating JWT token in the request.

### Authorize requests with external authorizers

![Authorize requests with external authorizers](/posts/2020/azure-api-management-visually-explained/external-authorizer.webp)

You can make requests to external services (managed by you or by a 3rd party) to verify authentication status for the current request.

### Black- and whitelist IPs

![Black- and whitelist IPs](/posts/2020/azure-api-management-visually-explained/ip-filter.webp)

Protect your API by configuring which IPs can access the resources.

### Reduce potential attack surface

![Reduce potential attack surface](/posts/2020/azure-api-management-visually-explained/protect-backend.webp)

Protect you backend services by placing them behind (and securing access to) the APIM instance.

## APIs and Operations

![APIs and Operations](/posts/2020/azure-api-management-visually-explained/apis-operations.webp)

As an admin of the API Management instance, you create and expose APIs.

Each APIM API has reference to a backend API.

Each API has one or more Operations.

Operations configure path mapping between APIM and backend API.

You can define Operations manually or you can upload an OpenAPI specification file and they will be created automatically.

API can be public or it can require a subscription (see below).

## Products and Subscriptions

![Products and Subscriptions](/posts/2020/azure-api-management-visually-explained/products-subscriptions.webp)

Product is a way to logically group multiple APIs and provide access to those APIs for a developer.

You can assign usage quota to a product.

In order to use a product, a developer must have a subscription.

Subscription is a pair of access keys. Key must be sent in the request header to authenticate with API.

Developers can subscribe via Developer Portal or an admin can create a subscription for them.

Product is not available to developers before it's published.

Products can be further organized into Groups.

## API Revisions

![API Revisions](/posts/2020/azure-api-management-visually-explained/revisions.webp)

Create a new revision to introduce non-breaking changes to the existing API.

Multiple revisions can co-exist (they have different URLs).

When new revision is properly tested, make it Current so it's published to the primary URL.

Making revision current creates a change log in Developer Portal.

## API Versions

![API Versions](/posts/2020/azure-api-management-visually-explained/versions.webp)

Create a new version to introduce breaking changes to the API.

Each API version must have a unique name, since technically it's another API.

Multiple versions can co-exist (they have different URLs).

You can choose versioning scheme: _path_ (`api.com/v1`) or _header_ or _query_.

## Policies

Policies are a way to apply custom logic to requests and responses at different stages of their lifecycle.

Policies are defined in XML.

### Policy Scopes and Sections

![Policy Scopes and Sections](/posts/2020/azure-api-management-visually-explained/policy-scopes-sections.webp)

Each policies set contains 4 sections: `inbound`, `backend`, `outbound`, `on-error`.

Each section can contain multiple policies.

There are many policies available, full list [here](https://docs.microsoft.com/en-us/azure/api-management/api-management-policies).

You can apply policies in multiple scopes: _Global_ (all APIs), _Product_ scope, _API_ scope, _Operation_ scope.

There's a special `<base />` tag which references parent scope. E.g. policies declaration `<backend> <base /> </backend>` in the _Operation_ scope will trigger `<backend>` policies from the _API_ scope.

### Order of processing

![Order of processing](/posts/2020/azure-api-management-visually-explained/policies-order.webp)

When request arrives, policies are executed in order.

Rules from `<inbound>` section run when request is received from a client.

`<backend>` section is triggered before the request is forwarded to the backend.

`<outbound>` runs when response is received from the backend and before sending it to the client.

`<on-error>` is triggered whenever an error occurs.

## Pricing tiers

![Pricing tiers](/posts/2020/azure-api-management-visually-explained/pricing-tiers.webp)

5 pricing tiers are: _Consumption_, _Developer_, _Basic_, _Standard_, _Premium_.

A new tier was added recently: _Isolated_ (in preview now). It has the same performance characteristics as _Premium_ but guarantees compute isolation which may be required in highly regulated environments.

Serverless tier has lower SLA and is lacking many features: VNET integration, Developer Portal, internal cache, multi-region, and more.

You can find full comparison of pricing tiers [here](https://azure.microsoft.com/en-us/pricing/details/api-management/).

## Multi-region deployment

![Multi-region deployment](/posts/2020/azure-api-management-visually-explained/multi-regions.webp)

Multi-region deployment is available in _Premium_ and _Isolated_ tiers only.

Improve latency for end users.

Add failover support in case one of the regions becomes unavailable.

Only API Gateways can be deployed to multiple regions. Azure and Development Portals are hosted in the primary region.

## Scaling

![Scaling](/posts/2020/azure-api-management-visually-explained/scale.webp)

You can scale your API Management instance vertically (by upgrading to the next tier), horizontally (by adding scaling units), or both at the same time.

Both upgrading instance size and adding new unit take considerable time.

Good metric to use when deciding to scale is _Capacity_ - an abstraction over server resources like CPU, Memory and IO.

There's an Autoscaling feature (_Standard_ and _Premium_ tiers).

## Conclusion

API Management can be a good option if you're looking for a managed end-to-end solution to protect and control your APIs. As with many managed solutions it can get costly at scale though.

Hopefully this overview gives you some idea of how the service is organized and whether it can be useful to you. You may want to check the official [documentation](https://docs.microsoft.com/en-us/azure/api-management/) next.
