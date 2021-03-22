---
title: "Github Actions: deploy to multiple environments from single workflow"
image: /posts/2021/03/github-actions-deploy-to-multiple-environments-from-single-workflow/thumb.png
image_dev: /posts/2021/03/github-actions-deploy-to-multiple-environments-from-single-workflow/thumb-dev.png
description: Github Action workflows do not support code reuse, here's a workaround.
date: 2021-03-21
tags:
  - Github
  - Github Actions
  - Productivity
---

Github Actions is awesome and you can automate so much with it. One lacking feature though is [support for code reuse](https://github.com/actions/starter-workflows/issues/245) in workflow yaml files.

One particular use case where it would be useful is continuous deployment workflow that **publishes latest code** to the remote system. Deployment target is dictated by the git branch that receives the update.

E.g. pushes to `dev` branch should deploy to the `staging` environment and pushes to `master` should publish the code to prod.

Here's a workaround to deploy to multiple environments from a single workflow yaml file.

## Example workflow file

As an example, I'll take a Github Action that deploys an Azure Function app. 

In order to publish code to Azure, it expects 2 variables: function app name and publish profile (deployment key).

Each environment has its own publish profile defined in an **individual Github Repository Secret**.

![github repository secrets](/posts/2021/03/github-actions-deploy-to-multiple-environments-from-single-workflow/github-repository-secrets.webp)

Below is the relevant parts of the workflow yaml. You can see it in full [here](https://github.com/maximivanov/azure-functions-cd-github-actions/blob/dev/.github/workflows/cd.yml).

First, we want to trigger the workflow **only on branches** that should be deployed on commit:

```yaml
on:
  push:
    branches:
      - dev
      - master
```

Next, in the very beginning of the workflow definition, we add **conditional steps** to set correct environment variables, depending on the **current branch**:

- Function app name
- Publish profile secret name

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Set env vars (dev)
        if: endsWith(github.ref, '/dev')
        run: |
          echo "AZURE_FUNCTIONAPP_NAME=azfunccdgh-dev-function-app" >> $GITHUB_ENV
          echo "PUBLISH_PROFILE_VAR_NAME=AZURE_FUNCTIONAPP_PUBLISH_PROFILE_DEV" >> $GITHUB_ENV
      - name: Set env vars (prod)
        if: endsWith(github.ref, '/master')
        run: |
          echo "AZURE_FUNCTIONAPP_NAME=azfunccdgh-prod-function-app" >> $GITHUB_ENV
          echo "PUBLISH_PROFILE_VAR_NAME=AZURE_FUNCTIONAPP_PUBLISH_PROFILE_PROD" >> $GITHUB_ENV
```

Following would be the steps that are shared between environments. These are not relevant to the multi-env deployment and are not listed here. In my case it's checking out the code, caching, installing dependencies and building the project.

Finally, the deployment step uses the environment variables set above to **publish the code** to the correct target environment.

```yaml
{% raw %}
      - name: Run Azure Functions action
        uses: Azure/functions-action@v1
        id: fa
        with:
          app-name: ${{ env.AZURE_FUNCTIONAPP_NAME }}
          package: ${{ env.AZURE_FUNCTIONAPP_PACKAGE_PATH }}
          publish-profile: ${{ secrets[env.PUBLISH_PROFILE_VAR_NAME] }}
          respect-funcignore: true
{% endraw %}
```

## References

- https://github.com/actions/starter-workflows/issues/245
- https://github.com/maximivanov/azure-functions-cd-github-actions

## ...

Still, this is a hack I'm not very happy about but I feel like it's better than having copies of the entire workflow file per environment. 

If you know a better way to deploy to multiple environments from Github Actions, let me know!