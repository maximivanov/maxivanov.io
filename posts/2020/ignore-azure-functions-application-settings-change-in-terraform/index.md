---
title: Ignore Azure Functions application settings drift in Terraform
description: How to fix configuration drift in Terraform caused by Zip Deploy + Run from Package
date: 2020-12-18
tags:
  - Azure
  - Azure Functions
  - Terraform
  - CD
  - DevOps
---

**`<TLDR>`** Add application settings causing configuration drift to `ignore_changes` lifecycle hook in function app resource configuration in Terraform. **`</TLDR>`**

**The problem**

You define your cloud infrastructure as code with Terraform and provision all resources. One of the resources is a Function App, based on Linux running in Consumption plan.

You deploy your application code with Azure Functions Core Tools. It uses [external package url](https://docs.microsoft.com/en-us/azure/azure-functions/functions-deployment-technologies#external-package-url) deployment method behind the scenes. Essentially it will upload your code to Azure Blob storage account and will mount it as a read-only directory in the Function App at `/home/site/wwwroot`.

You run `terraform plan` or `terraform apply` and you see there are changes in the remote resource: `WEBSITE_RUN_FROM_PACKAGE` setting has now value similar to `https://storageaccname.blob.core.windows.net/function-releases/2020...long-list-of-arguments`. That's the value set by the depoyment tool.
There's no point in importing it to Terraform state since it will change with every application code deployment.

It would be great if we could set `WEBSITE_RUN_FROM_PACKAGE=1` application setting once and for all. It means deploy the package not to the remote storage, but to the [function app host](https://docs.microsoft.com/en-us/azure/azure-functions/run-functions-from-deployment-package#enabling-functions-to-run-from-a-package) itself, and mount it to (again, read-only)`/home/site/wwwroot`. But unfortunately it's [not yet supported](https://github.com/Azure/azure-functions-core-tools/issues/2356) by Linux in Consumption plan.

What else can we do?

**Solution**

In your function app resource in Terraform, set application setting `WEBSITE_RUN_FROM_PACKAGE=""` and tell Terraform to ignore any future changes of this setting in the remote state.

```hcl
...

resource "azurerm_function_app" "function_app" {
  ...

  app_settings               = {
    "WEBSITE_RUN_FROM_PACKAGE"       = "",
    ...
  }

  lifecycle {
    ignore_changes = [
      app_settings["WEBSITE_RUN_FROM_PACKAGE"], # prevent TF reporting configuration drift after app code is deployed
    ]
  }
}
```

That's it. Terraform will no longer warn you about the value of `WEBSITE_RUN_FROM_PACKAGE` being changed. Hopefully Function Apps in Linux Consumption plan will support `WEBSITE_RUN_FROM_PACKAGE=1` setting soon and we won't need this workaround.
