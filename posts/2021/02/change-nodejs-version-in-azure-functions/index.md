---
title: How to change/upgrade Node.js version in Azure Functions
image: /posts/2021/02/change-nodejs-version-in-azure-functions/azure-functions-change-nodejs-version.png
description: Upgrade Node.js version in Linux and Windows function apps; in Premium and Consumption hosting plans.
date: 2021-02-25
tags:
  - Azure
  - Azure Functions
  - Node.js
  - Serverless
---

If you haven't touched your function app for a while there's a chance it's running an older version of Node.js. You may consider upgrading to benefit from new features, performance improvements and security fixes.
As we're approaching March 2021, Node.js 12 is the recommended version in Azure Functions and version 14 is in preview. You may want to upgrade when it reaches the GA status.

- How do you know which Node.js version is currently used?
- How to change/upgrade Node.js version for Linux and Windows function apps?
- Is there any difference when running in Consumption and Premium hosting plans?
- How to make the change with Azure Portal, CLI, ARM, Terraform?

I've tested all combinations of Linux/Windows, Consumption/Premium to verify the process of changing Node.js versions. Answers below.

## Azure Functions Runtime version

Before we get to Node.js versions, there's an important concept of **Azure Functions Runtime version**.

Node.js versions that are available to you depend on the OS and the Functions Runtime version used.
You can see runtime versions and their supported Node.js versions [here](https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2#node-version).

How to find out Azure Functions runtime version you use?

[Here](https://github.com/Azure/azure-functions-host/wiki/How-do-I-check-the-functions-runtime-version%3F) is the most reliable way to check the runtime version that I found. 

Get your function app's master key and make a request:

```bash
curl https://<functionappname>.azurewebsites.net/admin/host/status?code=<masterkey>
```

In the returned JSON, you will find the `"version"` property.

Note `FUNCTIONS_EXTENSION_VERSION` application setting (e.g. `~3`) is not a reliable indicator. 
There was a [platform upgrade for Azure Functions v2](https://github.com/Azure/app-service-announcements-discussions/issues/175), where this app setting could remain at `~2` while in reality the runtime became `3.x`. Confusing, I know.

If you find out the Node.js version you're aiming for is not supported, you will need to [upgrade the Functions runtime](https://docs.microsoft.com/en-us/azure/azure-functions/set-runtime-version?tabs=portal%2Cazurecli-linux).
If you develop and test functions locally, make sure to update Azure Functions Core Tools to the [latest version](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local?tabs=macos%2Ccsharp%2Cbash#core-tools-versions) as well.

## Find out what Node.js version is currently used

The process is a bit different on Windows and on Linux.

On Windows, Node.js version is dictated by the `WEBSITE_NODE_DEFAULT_VERSION` application setting of the function app. 

On Linux, `WEBSITE_NODE_DEFAULT_VERSION` has no effect. It is the `linuxFxVersion` config option on the function app resource that defines the Node.js version. 
Note there's a [bug](https://github.com/Azure/azure-cli/issues/15171) where `linuxFxVersion` may be reported as empty in Azure CLI.

The most reliable way to see the Node.js version you're running is to print or log it from a function.

```js
module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.')

    context.res = {
        body: `Node version: ${process.version}`
    }
}
```

Alternatively, you can see it in a shell session which you can open from your function app page in the the Azure Portal.

On Linux (Premium only, there's no such option in Consumption plan), launch *Development Tools* / *SSH*:

```bash
root@9eaec89e01d4:~# node --version
v10.23.1
```

On Windows (Premium & Consumption plans), go to *Development Tools* / *Console*:

```bash
C:\home\site\wwwroot> node --version
v12.18.0
```

One observation I made while doing tests: Windows function app without `WEBSITE_NODE_DEFAULT_VERSION` won't start at all. When triggered, the function will fail with the error: `502 - Web server received an invalid response while acting as a gateway or proxy server.`.


## Change Node.js version in Linux Function Apps

As mentioned above, `linuxFxVersion` config is what dictates the Node.js version. 
Not related to the version business, but make sure you also have `FUNCTIONS_WORKER_RUNTIME=node` application setting set.

**Azure Portal**

As of February 2021, you cannot change the language version for Linux Consumption through Portal. 

If you're on Linux Premium plan:
From your App Function page, go to the *Settings* / *Configuration* → *General settings*. Use the *Node.js Version* dropdown to change the version, then *Save*. 

![Change Node.js version in Linux Azure Functions in Portal](/posts/2021/02/change-nodejs-version-in-azure-functions/azure-functions-change-nodejs-version-linux-portal.webp)

**Azure CLI**

Out of curiosity, you may want to see the current `linuxFxVersion` value:

```bash
az functionapp config show --name <func app name> --resource-group <rg name> | jq '.linuxFxVersion'
```

- (if you don't have `jq` installed, just remove `| jq ...`)
- (result may be empty due to a bug, see the [github issue](https://github.com/Azure/azure-cli/issues/15171)).

Set the Node.js version:

```bash
az functionapp config set --name azfuncnodever-function-app-linux-premium --resource-group azfuncnodever-resource-group-linux-premium --linux-fx-version "node|14"
```

No manual function app restart required, give it a couple minutes and Node.js version will be switched.

You can provide a full (Microsoft managed) Docker image name if you want to explicitly set the Azure Functions runtime version.
Full list of supported Azure functions Docker tags can be found [here](https://mcr.microsoft.com/v2/azure-functions/node/tags/list).
But you can also simply use `node|<version>` as a shorthand. In this case, latest runtime version will be used. More on setting `LinuxFxVersion` [here](https://github.com/Azure/azure-functions-host/wiki/Using-LinuxFxVersion-for-Linux-Function-Apps).

If you provide an invalid value for the LinuxFxVersion argument, the command will fail with `Operation returned an invalid status code 'Bad Request'` error. (Only if target plan is Consumption though, if Premium, the CLI will eat it silently. Github issue [created](https://github.com/Azure/azure-cli/issues/17020).)

**ARM template**

```json
{
    "apiVersion": "2016-03-01",
    "type": "Microsoft.Web/sites",
    "kind": "functionapp",
    ...
    "properties": {
        ...
        "siteConfig": {
            ...
            "linuxFxVersion": "node|14"
        }
    }
}
```

**Terraform**

```hcl
resource "azurerm_function_app" "function_app" {
  ...
  site_config {
    ...
    linux_fx_version = "node|14"
  }
}
```

Another observation that I made with current Terraform v0.14.6 and `azurerm` provider v2.48.0. Linux function app without `linuxFxVersion` set explicitly defaults to Azure Functions runtime `~3` and Node.js 10. Here's the [discussion](https://github.com/Azure/azure-functions-host/issues/7176) around it.

## Change Node.js version in Windows Function Apps

In Windows function apps, you can control the Node.js version via the `WEBSITE_NODE_DEFAULT_VERSION` application setting. The value must be in the `~<major version>` format, e.g. `~14`.

**Azure Portal**

Unlike on Linux, you can change the version of both Premium and Consumption plans in the Portal.

From your App Function page, go to the *Settings* / *Configuration* → *General settings*. Use the *Node.js Version* dropdown to change the version, then *Save*.

![Change Node.js version in Windows Azure Functions in Portal](/posts/2021/02/change-nodejs-version-in-azure-functions/azure-functions-change-nodejs-version-windows-portal.webp)

**Azure CLI**

Before changing, if you wonder what's the current value of `WEBSITE_NODE_DEFAULT_VERSION`:

```bash
az functionapp config appsettings list --name <func app name> --resource-group <rg name> | jq '.[] | select(.name == "WEBSITE_NODE_DEFAULT_VERSION")'
```

(if you don't have `jq` installed, just remove `| jq ...`)

Set the Node.js version:

```bash
az functionapp config appsettings set --name <func app name> --resource-group <rg name> --settings "WEBSITE_NODE_DEFAULT_VERSION=~14"
```

No manual function app restart required, give it couple minutes and Node.js version will be switched.

You can provide a full (Microsoft managed) Docker image name if you want to explicitly set the Azure Functions runtime version, or you can simply use `node|<version>` as a shorthand. In the latter case, latest runtime version will be used. More on setting `LinuxFxVersion` [here](https://github.com/Azure/azure-functions-host/wiki/Using-LinuxFxVersion-for-Linux-Function-Apps).

**Powershell**

```powershell
Update-AzFunctionAppSetting -Name "<func app name>" -ResourceGroupName "<rg name>" -AppSetting @{"WEBSITE_NODE_DEFAULT_VERSION" = "~14"} -Force
```

**ARM template**

```json
{
    "apiVersion": "2016-03-01",
    "type": "Microsoft.Web/sites",
    "name": "[variables('functionAppName')]",
    "location": "[resourceGroup().location]",
    "kind": "functionapp",
    ...
    "properties": {
        ...
        "siteConfig": {
            ...
            "appSettings": [
                ...
                {
                    "name": "WEBSITE_NODE_DEFAULT_VERSION",
                    "value": "~14"
                }
            ],
        }
    }
}
```

**Terraform**

```hcl
resource "azurerm_function_app" "function_app" {
  ...
  app_settings = {
    ...
    "WEBSITE_NODE_DEFAULT_VERSION" = "~14",
  }
}
```

## References

- https://docs.microsoft.com/en-us/azure/azure-functions/functions-reference-node?tabs=v2#node-version
- https://docs.microsoft.com/en-us/azure/azure-functions/set-runtime-version?tabs=portal%2Cazurecli-linux
- https://github.com/Azure/azure-functions-nodejs-worker/issues/283
- https://docs.microsoft.com/en-us/azure/azure-functions/functions-infrastructure-as-code#create-a-function-app-2
- https://github.com/Azure/azure-functions-host/issues/3406
- https://github.com/Azure/azure-functions-host/wiki/Using-LinuxFxVersion-for-Linux-Function-Apps
- 

## ...

I wish working with Linux in Azure was simpler. There are a lot of inconsistencies between Linux and Windows plans and Linux offering often misses features. 

Yet I think Azure is a great platform with its vision and hopefully those issues will be sorted out soon.

You can find sources for my test lab consisting of 4 function apps in the [repo](https://github.com/maximivanov/azure-functions-set-nodejs-version).
