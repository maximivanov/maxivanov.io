---
title: "Publish Azure Functions code with Terraform"
image: /posts/2021/03/publish-azure-functions-code-with-terraform/thumb.png
image_dev: /posts/2021/03/publish-azure-functions-code-with-terraform/thumb-dev.png
description: Single tool to manage both infrastructure and code pushes.
date: 2021-03-27
tags:
  - Azure
  - Azure Functions
  - DevOps
  - Terraform
---

For a step by step guide on **provisioning cloud resources** needed to run Azure Functions, check [Deploy Azure Functions with Terraform](/deploy-azure-functions-with-terraform/).

This post focuses on how you can **publish code to a function app** with Terraform. Here, the deployed app is a hello-world Node.js function, but the process is language-agnostic.

Using a package file is the [recommended way](https://docs.microsoft.com/en-us/azure/azure-functions/run-functions-from-deployment-package#benefits-of-running-from-a-package-file) to run Azure Functions. When new code is uploaded, the switch is **atomic** (i.e. safe). Performance is better and cold starts are **faster**. It's **easy to rollback** to a previous deployment by pointing to the corresponding package.

There are **2 modes** of package deployment: url and app service. We will see the benefits and limitations of both as well as how to implement them with Terraform. 

Code for Linux/Windows + Consumption/Premium configurations in [Github](https://github.com/maximivanov/publish-az-func-code-with-terraform).

## Deploy from Package

In a nutshell, deploying from package means taking a package (zip file) and mounting its content to the read-only `/home/site/wwwroot` directory. 

Source package can be stored in a remote storage or be uploaded to the app service, in the `/home/data/SitePackages` directory.

Deployment mode is dictated by the `WEBSITE_RUN_FROM_PACKAGE` app setting.

### Package in a remote storage

Storage can be anything, as long as the package can be downloaded by the app service at runtime. That highlights a downside of this option - whenever the app is restarted, its zip has to be **re-downloaded** from the storage.

The most common approach is to host the package in a Blob Storage and generate a **SAS URL**, granting limited access to the package via the function app configuration:

```text
WEBSITE_RUN_FROM_PACKAGE = URL with SAS
```

That's another inconvenince of this deployment method: 

- there's now a **secret** in the app settings to manage (can leak through configuration/state/app code) AND 
- the SAS token may **expire** (the app won't be able to download the package and will fail to start)

Also documentation states: 

> When running a function app on Windows, the external URL option yields worse cold-start performance. When deploying your function app to Windows, you should set WEBSITE_RUN_FROM_PACKAGE to 1 and publish with zip deployment.

On a good side, running from a package URL is **well-supported** by both Linux and Windows environments in both Consumption and Premium plans.

### Package in app service

At deployment time, the package is uploaded to the `/home/data/SitePackages` directory. This directory also has a `packagename.txt` file which contains nothing but the name of the package that's currently in use. You can update the file manually to point to a different package and the function app will restart shortly and will use that package's code.

To upload the package to app service, you should use the [Zip Deployment](https://docs.microsoft.com/en-us/azure/azure-functions/deployment-zip-push) strategy combined with the app setting:

```text
WEBSITE_RUN_FROM_PACKAGE = 1
```

Without the app setting, zip deploy will simply extract the package to the `/home/site/wwwroot` directory loosing all benefits of run-from-package deployment.

Since there's no need to download the package over the network when the function app starts, it should result in **faster cold starts**.

Note that as of March 2021, `WEBSITE_RUN_FROM_PACKAGE = 1` is still not supported in **Linux Consumption**. Windows hosts and Linux Premium work fine with it though.

## Deploy code with Terraform

To keep the post short I assume you have the basic Azure Functions Terraform script ready (as per this [post](/deploy-azure-functions-with-terraform/)).

Alternatively, refer to this post's [companion repository](https://github.com/maximivanov/publish-az-func-code-with-terraform) for full configuration example in different environments.

Now we can focus on what it takes to publish/upload the code to Azure.

### `WEBSITE_RUN_FROM_PACKAGE = <url>`

There's a great article by [Adrian Hall](https://adrianhall.github.io/typescript/2019/10/23/terraform-functions/) which describes the process of deploying the code from Azure Storage.

I wanted to revisit the solution to highlight newer `azurerm_storage_account_blob_container_sas` Terraform resource as well as suggest compressing the code with Terraform without relying on npm. Simpler functions may not even use external modules, so it's good to **not have Node.js and NPM as dependencies** in the deployment environment.

For both deployment modes, we need to **compress the function code** for it to be uploaded. For this, we can use the `archive_file` data type.

```hcl
data "archive_file" "file_function_app" {
  type        = "zip"
  source_dir  = "../function-app"
  output_path = "function-app.zip"
}
```

**Upload the archive** to the Azure Storage Blob:

```hcl
resource "azurerm_storage_blob" "storage_blob" {
  name = "${filesha256(var.archive_file.output_path)}.zip"
  storage_account_name = azurerm_storage_account.storage_account.name
  storage_container_name = azurerm_storage_container.storage_container.name
  type = "Block"
  source = var.archive_file.output_path
}
```

Create a **read-only SAS** for the Blob. Mind the **expiration date** - past the date the function app scale out/restart operations will fail as the packge link won't work anymore. Using the [Service SAS](https://docs.microsoft.com/en-us/azure/storage/common/storage-sas-overview#service-sas) is optimal here, as it provides limited access compared to the Account SAS generated by `azurerm_storage_account_sas`.

```hcl
data "azurerm_storage_account_blob_container_sas" "storage_account_blob_container_sas" {
  connection_string = azurerm_storage_account.storage_account.primary_connection_string
  container_name    = azurerm_storage_container.storage_container.name

  start = "2021-01-01T00:00:00Z"
  expiry = "2022-01-01T00:00:00Z"

  permissions {
    read   = true
    add    = false
    create = false
    write  = false
    delete = false
    list   = false
  }
}
```

Finally, provide full package URL in the `WEBSITE_RUN_FROM_PACKAGE` app setting:

```hcl
resource "azurerm_function_app" "function_app" {
  name                       = "${var.project}-function-app"
  resource_group_name        = azurerm_resource_group.resource_group.name
  location                   = var.location
  app_service_plan_id        = azurerm_app_service_plan.app_service_plan.id
  app_settings = {
    "WEBSITE_RUN_FROM_PACKAGE"    = "https://${azurerm_storage_account.storage_account.name}.blob.core.windows.net/${azurerm_storage_container.storage_container.name}/${azurerm_storage_blob.storage_blob.name}${data.azurerm_storage_account_blob_container_sas.storage_account_blob_container_sas.sas}",
    "FUNCTIONS_WORKER_RUNTIME" = "node",
    "AzureWebJobsDisableHomepage" = "true",
  }
  os_type = "linux"
  site_config {
    linux_fx_version          = "node|14"
    use_32_bit_worker_process = false
  }
  storage_account_name       = azurerm_storage_account.storage_account.name
  storage_account_access_key = azurerm_storage_account.storage_account.primary_access_key
  version                    = "~3"
}
```

That's it. Once you run `terraform apply`, it will prepare the package, upload it to the storage, generate the link and put it to the app setting. The function app will restart and in a few seconds your app will run the new code.

### `WEBSITE_RUN_FROM_PACKAGE = 1`

Prepare the package zip:

```hcl
data "archive_file" "file_function_app" {
  type        = "zip"
  source_dir  = "../function-app"
  output_path = "function-app.zip"
}
```

Configure function app using the `WEBSITE_RUN_FROM_PACKAGE` setting to expect the package in the file system:

```hcl
resource "azurerm_function_app" "function_app" {
  name                       = "${var.project}-function-app"
  resource_group_name        = azurerm_resource_group.resource_group.name
  location                   = var.location
  app_service_plan_id        = azurerm_app_service_plan.app_service_plan.id
  app_settings = {
    "WEBSITE_RUN_FROM_PACKAGE" = "1",
    "FUNCTIONS_WORKER_RUNTIME" = "node",
    "AzureWebJobsDisableHomepage" = "true",
  }
  os_type = "linux"
  site_config {
    linux_fx_version          = "node|14"
    use_32_bit_worker_process = false
  }
  storage_account_name       = azurerm_storage_account.storage_account.name
  storage_account_access_key = azurerm_storage_account.storage_account.primary_access_key
  version                    = "~3"
}
```

The code will be pushed to the function app with Azure CLI command:

```hcl
locals {
    publish_code_command = "az webapp deployment source config-zip --resource-group ${azurerm_resource_group.resource_group.name} --name ${azurerm_function_app.function_app.name} --src ${var.archive_file.output_path}"
}
```

We use `null_resource` to run the publish command. Note it will be triggered every time the contents of the package file changes. If there's no change, the code won't be uploaded (makes sense!).

```hcl
resource "null_resource" "function_app_publish" {
  provisioner "local-exec" {
    command = local.publish_code_command
  }
  depends_on = [local.publish_code_command]
  triggers = {
    input_json = filemd5(var.archive_file.output_path)
    publish_code_command = local.publish_code_command
  }
}
```

As you can see this method is simpler and as we discussed earlier it results in faster cold starts. So if you're not running on Linux Consumption, use this approach.


## References

- https://docs.microsoft.com/en-us/azure/azure-functions/run-functions-from-deployment-package
- https://docs.microsoft.com/en-us/azure/azure-functions/deployment-zip-push
- https://github.com/Azure/app-service-announcements/issues/84
- https://github.com/Azure/app-service-announcements-discussions/issues/32
- https://adrianhall.github.io/typescript/2019/10/23/terraform-functions/
- https://github.com/maximivanov/publish-az-func-code-with-terraform

## ...

Deploy Azure Functions resources as well as code with Terraform when you don't want extra dependencies used just for publishing.