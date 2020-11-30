---
title: Deploy Azure Functions with Terraform
description: A practical, step by step guide on how to deploy an Azure Function with Terraform.
date: 2020-11-30
image: /posts/2020/deploy-azure-functions-with-terraform/deploy-azure-functions-with-terraform.png
tags:
  - Azure
  - Azure Functions
  - Terraform
  - DevOps
---

**`<TLDR>`** A practical, step by step guide on how to deploy an Azure Function with Terraform. No prior experience is required. Final code is in the [tutorial repo](https://github.com/maximivanov/deploy-azure-functions-with-terraform). **`</TLDR>`**

I love how quickly you can log in to a cloud provider UI and create a few resources for some random test. But unfortunately this approach is neither scalable nor reproducible. Unless I know this is going to be a one-time experiment I'd prefer to define the resources with _Infrastructure-as-Code_. This way I can easily and consistently replicate the setup in multiple environments. Being able to track changes in git and reuse modules like in a programming language is another big advantage.

Though cloud providers have their own IaC solutions (ARM in Azure, CloudFormation in AWS) I recently switched to Terraform for a unified experience across all platforms.

## 1. Who is this tutorial for?

Below is a practical, step by step guide on how to deploy an Azure Function with Terraform. No prior experience with TF is required.

You may find this guide useful if you are:

- a frontend developer looking to build something in the backend and curious about best practices to manage cloud resources
- a backend developer who mostly manages cloud infrastructure with provider's UI portal
- a devops engineer getting familiar with Azure looking for a reference on function app deployment

## 2. What we will build

Since the focus of this post is on Terraform, we will create a basic hello-world function in TypeScript to serve as our deployment unit but otherwise it can be in any language.

We will provision Azure resources required to host and monitor the function in the Linux-based Consumption (serverless) environment with Terraform, one resource at a time.

Finally we will deploy the function code and execute it in the cloud.

_What's not included:_

- Remote Terraform state storage. By default remote infrastructure state (resource IDs and metadata) is stored in a local file in Terraform module directory. This is not ideal for team work. Best practice is to store state files in a [remote backend](https://www.terraform.io/docs/state/remote.html).

## 3. Prerequisites

I won't go over the installation of the tools since the process for of them is well documented. In order to follow along this tutorial you will need:

- Node.js (you can choose another runtime when you create the function).
- [Azure Functions Core Tools v3](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local?tabs=macos%2Ccsharp%2Cbash#v2) to run and deploy Functions code.
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) 2.4+. You must be [logged in](https://docs.microsoft.com/en-us/cli/azure/authenticate-azure-cli#sign-in-interactively) to the CLI.
- [Terraform](https://www.terraform.io/downloads.html) to manage infrastructure in the cloud.
- Azure account. You can [start for free](https://azure.microsoft.com/en-us/free/).

## 4. Function to be deployed

Here's a condensed version of the [official quickstart](https://docs.microsoft.com/en-us/azure/azure-functions/create-first-function-cli-typescript?tabs=azure-cli%2Cbrowser) to create a hello world function. We're going to use TypeScript and node.js here, reference the quickstart for other options.

Create a new function app project:

```bash
func init deploy-azure-functions-with-terraform --typescript
```

Function app may consist of one or multiple functions. It is the unit of scale in Azure Functions (all of the functions run in the same container). Functions within one functions app can have different triggers (e.g. one is http-triggered and the other is triggered on a CRON schedule).

Add a new HTTP-triggered function to the project:

```bash
cd deploy-azure-functions-with-terraform/

func new --name hello-world --template "HTTP trigger" --authlevel "anonymous"
```

Run the function locally:

```bash
npm install
npm start
curl http://localhost:7071/api/hello-world?name=Terraform

Hello, Terraform. This HTTP triggered function executed successfully.
```

## 5. Terraform module

Following the standard naming convention in Terraform, we will define our infrastructure module within 4 files:

```bash
find .terraform
.terraform
.terraform/outputs.tf
.terraform/main.tf
.terraform/terraform.tfvars
.terraform/variables.tf
```

`main.tf` is where the cloud resources and their configuration will be defined.
`variables.tf` is for definitions of variables used in `main.tf`.
`terraform.tfvars` is for actual values of variables from `varaibles.tf`.
`outputs.tf` lists the values that `main.tf` should report back to the user.

### 5.1. Define module variables

To make our module reusable, we can define a list of variables (you can think about them as of input arguments) it supports. Later we will reference them within the module. Each variable declaration consists of a name at minimum, but also can specify variable type, description and default value. Let's add 3 variables:

```hcl
# .terraform/variables.tf

variable "project" {
  type = string
  description = "Project name"
}

variable "environment" {
  type = string
  description = "Environment (dev / stage / prod)"
}

variable "location" {
  type = string
  description = "Azure region to deploy module to"
}
```

### 5.2. Set module variables' values

Terraform will automatically load all `.tf` and `.tfvars` files in the module's directory. Latter is to specify values for module variables defined in the previous step. Alternatively you can pass them as command line arguments or with environment variables.

```hcl
# .terraform/terraform.tfvars

project = "azuretf"
environment = "dev"
location = "East US"
```

### 5.3. Configure provider

You deploy Terraform module to a _provider_. Obvious provider examples are cloud providers like AWS/GCP/Azure but there are many more. You can manage resources and configuration in Digital Ocean, Heroku, Github and Netlfy. See the full list of providers in the [Terraform Registry](https://registry.terraform.io/browse/providers).

```hcl
# .terraform/main.tf

terraform {
  required_providers {
    azurerm = {
      source = "hashicorp/azurerm"
      # Root module should specify the maximum provider version
      # The ~> operator is a convenient shorthand for allowing only patch releases within a specific minor release.
      version = "~> 2.26"
    }
  }
}

provider "azurerm" {
  features {}
}
```

### 5.4. Create resource group

Resource Group is a logical container to organize resources together and manage permissions in Azure. Each resource must belong to a single resource group.

Something to note here as we're about to add the first resource definition.
Terraform resource declaration follows this format:

```text
resource "[terraform resource type]" "[logical resource name]" {
  [resource property] = [value]
  [resource property] = [value]
  ...
}
```

You really want to stick to some naming convention, both in Terraform resource names (`resource_group` below) and with cloud resource names (`${var.project}-${var.environment}-resource-group` below). It's so much easier when you can easily and consistently come up with a resource name without guessing or referencing the sources.

```hcl
# .terraform/main.tf

...

resource "azurerm_resource_group" "resource_group" {
  name = "${var.project}-${var.environment}-resource-group"
  location = var.location
}
```

### 5.5. Deploy the first resource

At this point we have everything we need to deploy the resource group defined in `main.tf` to Azure. Let's do that.

First, initialize Terraform so it downloads required provider dependencies. This has to be done once.
All `terraform ...` commands must be executed in the `.terraform` directory, where the module sources are.

```bash
terraform init
```

![tf-init](/posts/2020/deploy-azure-functions-with-terraform/tf-init.png)

Review changes to be deployed with `terraform plan`. It clearly states there will be 1 new resource created.

```bash
terraform plan
```

![tf-plan](/posts/2020/deploy-azure-functions-with-terraform/tf-plan.png)

Deploy the resource with `terraform apply`.
`plan` and `apply` are the commands you will use most often in Terraform. `apply` will once again show a preview of what will be deployed.

```bash
terraform apply
```

![tf-apply](/posts/2020/deploy-azure-functions-with-terraform/tf-apply.png)

### 5.6. Create storage account

Storage account is another resource required for our function app. It will host the file system of the container running our function app. This is where the code will be uploaded as well as where logs and any temporary files will be written to.

Couple notes:

- Storage account naming convention is an exception to the rule since Azure doesn't allow `-` in the name
- We reference the resource group created in the previous step. This also signals to Terraform in which order to create resources so that dependencies are properly resolved.
- `LRS` stands for "Locally redundant storage" where your data is replicated within a single region. A more advanced setting here is `ZRS` which is "Zone-redundant storage".

```hcl
# .terraform/main.tf

...

resource "azurerm_storage_account" "storage_account" {
  name = "${var.project}${var.environment}storage"
  resource_group_name = azurerm_resource_group.resource_group.name
  location = var.location
  account_tier = "Standard"
  account_replication_type = "LRS"
}
```

You can review and deploy the change right away or you can add all resources from the following steps and deploy them all at once.

### 5.7. Create Application Insights resource

Application Insights is a component of Azure Monitor which allows you to collect metrics and logs from your function app.

```hcl
# .terraform/main.tf

...

resource "azurerm_application_insights" "application_insights" {
  name                = "${var.project}-${var.environment}-application-insights"
  location            = var.location
  resource_group_name = azurerm_resource_group.resource_group.name
  application_type    = "Node.JS"
}
```

### 5.8. Create App Service Plan

A Function App must always be associated with an App Service Plan which defines the compute resources available to the FA and how it scales.

There are 3 plans available:

- **Consumption Plan.** Serverless, scales automatically with the number of events. No events => zero instances (you pay nothing).
- **Premium Plan.** You reserve a number of always-ready instances which run no matter if there are events or not. As load grows, new instances are added automatically.
- **Dedicated (App Service) Plan.** FAs will run on VMs managed by you. Doesn't scale automatically based on events.

Naming is a bit unfortunate here since the 3rd option has "App Service Plan" in it too. We want to go serverless thus we choose a Consumption App Service Plan. `sku` section below sets it.

```hcl
# .terraform/main.tf

...

resource "azurerm_app_service_plan" "app_service_plan" {
  name                = "${var.project}-${var.environment}-app-service-plan"
  resource_group_name = azurerm_resource_group.resource_group.name
  location            = var.location
  kind                = "FunctionApp"
  reserved = true # this has to be set to true for Linux. Not related to the Premium Plan
  sku {
    tier = "Dynamic"
    size = "Y1"
  }
}
```

### 5.9. Create Function App

The final resource we need to create is the function app itself. It references resources created earlier: App Service Plan, Application Insights instance and storage account. Version is set to 3, which is the latest version of Azure Functions at the moment.

`app_settings` is a key-value block with configuration options for all of the functions in the Function App. If you need to pass an environment variable to your code, add it here.

For CORS configuration, check the [cors parameter](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/function_app#cors) in the resource documentation.

```hcl
# .terraform/main.tf

...

resource "azurerm_function_app" "function_app" {
  name                       = "${var.project}-${var.environment}-function-app"
  resource_group_name        = azurerm_resource_group.resource_group.name
  location                   = var.location
  app_service_plan_id        = azurerm_app_service_plan.app_service_plan.id
  app_settings = {
    "APPINSIGHTS_INSTRUMENTATIONKEY" = azurerm_application_insights.application_insights.instrumentation_key,
  }
  os_type = "linux"
  storage_account_name       = azurerm_storage_account.storage_account.name
  storage_account_access_key = azurerm_storage_account.storage_account.primary_access_key
  version                    = "~3"
}
```

### 5.10. Add module output

We have all the components defined in Terraform now. Once we deploy the module we want to know the hostname of our function app to make a test call. We also need the Azure name of the function app for the next step where we deploy the function code.

Add output definitions:

```hcl
# .terraform/outputs.tf

output "function_app_name" {
  value = azurerm_function_app.function_app.name
  description = "Deployed function app name"
}

output "function_app_default_hostname" {
  value = azurerm_function_app.function_app.default_hostname
  description = "Deployed function app hostname"
}
```

Outputs will be listed after successful `terraform apply` or you can see all registered outputs with `terraform output`.

![tf-output](/posts/2020/deploy-azure-functions-with-terraform/tf-output.png)

### 5.11. Verify infrastructure is deployed

Open the function app hostname in the browser. You should see the success page:

![infra-ready](/posts/2020/deploy-azure-functions-with-terraform/infra-ready.png)

## 6. Deploy the code

We have a place in the cloud where the code will run, let's upload our code there.

By default Azure Functions Core Tools will upload full content of the current folder minus files matching patterns in `.funcignore`.
Make sure to add `.terraform/*` to that file, otherwise you will publish multi-megabyte terraform folder to your function app:

```bash
printf "\n.terraform/*" >> .funcignore
```

You may also want to exclude dev dependencies from your `node_modules` before code upload. There's a `npm run build:production` command which will prune non-production modules. It's supposed to be executed in the CI/CD environment. If you run it locally, remember to re-run `npm install` to restore your dev packages afterwards.

Publish the code (run the command in the root folder where the `package.json` file is). Replace the final argument with your function name (from Terraform `outputs`):

```bash
func azure functionapp publish azuretf-dev-function-app
```

### 6.1. Verify code is deployed

Open the hostname from the Terraform `outputs` to test our function works:

```bash
curl 'https://azuretf-dev-function-app.azurewebsites.net/api/hello-world?name=Terraform'

Hello, Terraform. This HTTP triggered function executed successfully.
```

### 6.2. Review function metrics

In the Azure Portal, find the App Insights instance we created. After making a few requests you should start seeing some stats around the requests made.

![app-insights](/posts/2020/deploy-azure-functions-with-terraform/app-insights.png)

## 7. Cleanup

To remove all Azure resources provisioned with Terraform run:

```bash
terraform destroy
```

## 8. Conclusion

Hopefully now you have an idea of what it takes to deploy a function app with Terraform, which Azure resources are involved and what are the steps to have your function running in the cloud.

You can find the final code in the [tutorial repo](https://github.com/maximivanov/deploy-azure-functions-with-terraform).

I tried to balance information completeness with manageable reading time, but this became quite big anyway.

Congratulations for making it to the end 😅 Happy terraforming!
