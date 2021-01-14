---
title: Restrict Azure Functions to API Management with Terraform
description: Prevent access to a Function App from unauthorized sources and restrict it to an API Management instance.
date: 2021-01-11
tags:
  - Azure
  - Azure Functions
  - Azure APIM
  - Azure AAD
  - Authentication
  - Terraform
---

Recently I had a task of enforcing a usage quota on an API hosted in Azure Functions.
API Management was a natural choice in the Azure ecosystem as it supports quota management natively.
APIM instance was configured to make sure clients meet the quota requirements before requests are forwarded to the function app.
But the function app was still open to the Internet and anyone could make requests to it if they knew its HTTP endpoint.

How do we prevent access to a Function app (or to an App Service app) from unauthorized sources and restrict it to an API Management instance?
How do we define it as Infrastructure as Code with Terraform?

After some research and experimentation I've got a working solution using Azure Active Directory authentication.
There are articles on the Internet on how to set it up via Azure Portal, but I couldn't find any advice regarding Terraform implementation.

If you have a similar task you probably want to know:

- Brief intro to Azure Active Directory concepts involved
- How does protection work on a high level
- How to implement Azure AD auth in Azure Functions with Terraform
- Alternative security mechanisms

In this post we will go over all of these points.
We will start with an unprotected stack and add AAD auth on top of it with Terraform.
There's a link to a Github repository with code below.

## Prerequisites

If you want to follow along with the code you will need the following:

- Azure account. You can [start for free](https://azure.microsoft.com/en-us/free/)
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) 2.4+. You must be [logged in](https://docs.microsoft.com/en-us/cli/azure/authenticate-azure-cli#sign-in-interactively) to the CLI
- [Terraform](https://www.terraform.io/downloads.html) to manage infrastructure in the cloud
- [Azure Functions Core Tools v3](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local?tabs=macos%2Ccsharp%2Cbash#v2) to run and deploy Functions code

_Note that as of January 2021 Function Apps based on Linux Consumption plan do not support AAD authentication._

## Base (unprotected) setup

At a minimum we need these resources in Azure:

- Resource group
- Storage account
- App Service plan
- Function App
- APIM instance
- APIM API and Operation mapping to the FA

[Code for the unprotected setup in Github](https://github.com/maximivanov/azure-functions-apim-aad-auth/tree/setup-no-auth).
Related tutorial: [How to Deploy Azure Functions with Terraform](https://www.maxivanov.io/deploy-azure-functions-with-terraform/).

Deploy infra:

```bash
cd terraform
terraform init
terraform apply
```

Deploy code:

```bash
func azure functionapp publish adauthfaapim-dev-function-app
```

After infrastructure and code are deployed to Azure, let's make sure APIM integration works:

```bash
$ curl -D - https://adauthfaapim-dev-api-management.azure-api.net/hello-world?name=apim
HTTP/1.1 200 OK
Transfer-Encoding: chunked
Content-Type: text/plain; charset=utf-8
Date: Sun, 10 Jan 2021 18:56:01 GMT

Hello, apim. This HTTP triggered function executed successfully.
```

Confirm FA is accessible from the Internet:

```bash
$ curl -D - https://adauthfaapim-dev-function-app.azurewebsites.net/api/hello-world?name=func-app
HTTP/1.1 200 OK
Transfer-Encoding: chunked
Content-Type: text/plain; charset=utf-8
Server: Kestrel
Date: Sun, 10 Jan 2021 18:54:42 GMT

Hello, func-app. This HTTP triggered function executed successfully.
```

Here's the diagram for our setup so far.

![Unprotected Azure Functions App behind APIM](/posts/2021/01/restrict-azure-functions-to-api-management-with-terraform/unprotected-setup.webp)

## Protected setup: overview

On the receiving side (function app), we will enable AAD authentication to validate tokens on the incoming requests.
For this, we need to create an **AAD Application** for the function app (more on this below).

On the requesting side (APIM), we will instruct the gateway to obtain an AAD access token and send it along with proxied client requests.
For this, we need to enable an **AAD Managed Identity** on the APIM.

Here's the updated diagram.

![Protected Azure Functions App behind APIM, overview](/posts/2021/01/restrict-azure-functions-to-api-management-with-terraform/protected-overview.webp)

## Related AAD concepts 101

Now that we have a high level overview of the desired configuration, let's take a closer look at the AAD concepts involved.

### Receiving side

When enabled on the FA, authentication module intercepts incoming requests and validates access tokens issued by AAD.
If access token is valid, the request is forwarded to the Function App.

For this to work, the FA must integrate with AAD. We need to create an object representing the identity of our application within the AD. Such object is called an (AAD) Application Object.

### Application Object

An Application Object (AO) or simply an Application is a definition of your application/code within the identity platform.

Usually it comes hand in hand with another important concept, **Service Principal**, which is an instance of the application within a specific AAD instance (tenant). An AO can have 1 or many SPs, one per AD tenant where the AO is installed. A SP defines permissions that corresponding AO will get in a specific AAD.

In our case, there are no permissions associated with the function app's identity.
Its only task is to validate incoming tokens by making sure 2 things:
a) tokens are issued in the same AAD as the function app and
b) tokens are issued to be used by that function app specifically

Application Objects have an **Application ID** (appId, sometimes referred to as Client ID), a globally unique ID of an AAD Application.

### Requesting side

The APIM must obtain an access token from the AAD and send it in a header with the request to the function app.
For this, the APIM must authenticate itself with the AAD. Thus there must be a corresponding identity in the AAD.

Manual (nonoptimal) way for APIM to authenticate with AAD:

1. Create an Application Object and a corresponding Service Principal for the APIM.
2. For that SP, create a secret or a certificate.
3. Whenever the APIM instance forwards a request to the FA, obtain an access token from the AAD.
4. To obtain that token, APIM makes an authenticated request to the AAD.

Token request parameters would be:

- AAD tenant ID
- audience ID (client ID of the Application Object associated with the FA)
- client ID (client ID of the Application Object associated with the APIM)
- client secret or certificate (credentials of the Service Principal associated with the APIM)

Some important questions to ask here:

- How do I safely store the AAD client secret in the APIM?
- How do I rotate the secret when expiration time approaches?
- How do I even remember secrets expire and must be rotated?

Is there a better solution? Yes, and it's called a Managed Identity.

### Managed Identity

Whenever you create a Managed Identity (MI) a Service Principal is also created and we already know SP is an identity for an application in AAD.
What's good about MI is that you don't need to worry about secrets or certificates, they are managed by the platform automatically.

Managed (optimal) way for APIM to authenticate with AAD:

1. Enable a Managed Identity on the APIM.
2. Whenever the APIM instance forwards a request to the FA, obtain an access token from the AAD.
3. To obtain that token, APIM makes an authenticated request to the AAD.

Token requests parameters will be:

- audience ID (client ID of the Application Object associated with the FA)

See the benefits? It's impossible to mess up AAD secrets because we're not passing them around anymore.

In APIM, AAD token is obtained with a special <authentication-managed-identity> policy in Inbound rules.

Here's the updated diagram of the configuration.

![Protected Azure Functions App behind APIM, details](/posts/2021/01/restrict-azure-functions-to-api-management-with-terraform/protected-detailed.webp)

## Terraform implementation

Azure AD provider is different from Resource Manager provider in Terraform and must be enabled separately.

```hcl
terraform {
  required_providers {
    ...

    azuread = {
      source = "hashicorp/azuread"
      version = "~>1.1.1"
    }
  }
}

provider "azuread" {
}
```

Create an Application Object for the function app.

```hcl
resource "azuread_application" "ad_application_function_app" {
    name                     = "${var.project}-${var.environment}-ad-application-function-app"
    type                     = "webapp/api"
    prevent_duplicate_names  = true
}
```

Enable AAD authentication on the function app.

```hcl
auth_settings {
  enabled = true
  issuer = "https://login.microsoftonline.com/${data.azurerm_client_config.current.tenant_id}"
  default_provider = "AzureActiveDirectory"
  active_directory {
    client_id = azuread_application.ad_application_function_app.application_id
  }
  unauthenticated_client_action = "RedirectToLoginPage"
}
```

Quick note on the `issuer` parameter. It will be used by the function app authentication module to validate incoming tokens.
More specifically, the `iss` claim in the token (which is a JWT), must match.

You want to make sure issuer URL matches the configuration of the target AAD application (function app in our case). I may share my observations which led me to the issuer value above in a later post.

Let's deploy these changes and make sure we get expected results.

Requests to the function app must be authenticated so we should get 401 errors no matter if we query the function app directly or through APIM.

```bash
$ curl -D - https://adauthfaapim-dev-function-app.azurewebsites.net/api/hello-world?name=func-app
HTTP/1.1 401 Unauthorized
Server: Kestrel
WWW-Authenticate: Bearer realm="adauthfaapim-dev-function-app.azurewebsites.net" authorization_uri="https://login.microsoftonline.com/bb19fab2-.../oauth2/v2.0/authorize" resource_id="67ff3941-3536-4feb-b69d-e179a06ce195"
Date: Sun, 10 Jan 2021 18:57:07 GMT
Content-Length: 0

$ curl -D - https://adauthfaapim-dev-api-management.azure-api.net/hello-world?name=apim
HTTP/1.1 401 Unauthorized
Content-Length: 0
WWW-Authenticate: Bearer realm="adauthfaapim-dev-function-app.azurewebsites.net" authorization_uri="https://login.microsoftonline.com/bb19fab2-.../oauth2/v2.0/authorize" resource_id="67ff3941-3536-4feb-b69d-e179a06ce195"
Date: Sun, 10 Jan 2021 18:57:43 GMT
```

It fails and that's expected.

Next, enable Managed Identity on the APIM instance.

```hcl
resource "azurerm_api_management" "api_management" {
  ...

  identity {
    type = "SystemAssigned"
  }
}
```

Add an inbound policy to the APIM instance instructing it to obtain AAD access tokens intended to access the function app.

```hcl
resource "azurerm_api_management_api_policy" "api_management_api_policy_api_public" {
  api_name            = azurerm_api_management_api.api_management_api_public.name
  api_management_name = azurerm_api_management.api_management.name
  resource_group_name = azurerm_resource_group.resource_group.name

  xml_content = <<XML
<policies>
  <inbound>
    <base />
    <authentication-managed-identity resource="${azuread_application.ad_application_function_app.application_id}" ignore-error="false" />
  </inbound>
</policies>
XML
}
```

Let's deploy the final changes and confirm that direct access to the FA is not allowed but APIM can reach it.

```bash
$ curl -D - https://adauthfaapim-dev-function-app.azurewebsites.net/api/hello-world?name=func-app
HTTP/1.1 401 Unauthorized
Server: Kestrel
WWW-Authenticate: Bearer realm="adauthfaapim-dev-function-app.azurewebsites.net" authorization_uri="https://login.windows.net/common/oauth2/authorize" resource_id="67ff3941-3536-4feb-b69d-e179a06ce195"
Date: Sun, 10 Jan 2021 19:06:23 GMT
Content-Length: 0

curl -D - https://adauthfaapim-dev-api-management.azure-api.net/hello-world?name=apim
HTTP/1.1 200 OK
Transfer-Encoding: chunked
Content-Type: text/plain; charset=utf-8
Date: Sun, 10 Jan 2021 19:05:48 GMT

Hello, apim. This HTTP triggered function executed successfully.
```

## Alternative security mechanisms

Enabling AAD authentication is not the only way to protect a backend API behind an APIM instance. Other options would be:

- whitelist APIM public IP on the function app
- put both the FA and the APIM in a VNET and whitelist APIM private IP
- make APIM send FA's access key in requests
- mTLS auth (client certificate)

For a detailed overview of these methods and their pros/cons, check this comparison by Vincent-Philippe Lauzon: [API Management exclusive access to Azure Function](https://vincentlauzon.com//2019/03/28/api-management-exclusive-access-to-azure-function/).

## ...

Here you go. Keep your Azure Functions warm and safe.
Use your favorite infrastructure as code tool to apply and track changes consistently.

You can find the final app code [here](https://github.com/maximivanov/azure-functions-apim-aad-auth/tree/setup-fa-apim-auth).
