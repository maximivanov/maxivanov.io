---
title: How to move resources and modules in Terragrunt
description: Migrate individual resources and/or whole modules between state in Terragrunt without having to recreate infrastructure.
date: 2021-01-29
tags:
  - Terraform
  - Terragrunt
  - Refactoring
---

If you're reading this, probably you manage your infrastructure with Terraform.
Or even better, to keep resource definitions DRY you use [Terragrunt](https://terragrunt.gruntwork.io/).

One day you realize one of the Terragrunt modules you maintain became too large. 
Plan and apply operations are slow. 
It's hard to navigate within the module and it's easy to make a mistake.
You want to refactor the module and extract some resources to a separate module.

Or maybe you decide to change how your modules are organized on the file system. 
You want to rename some folders, add or remove nested directories - whatever is required to reflect the infrastructure change.

What happens if you just move a resource between files or a module between folders?
`terragrunt plan` will report resources to be destroyed in the old location and resources to create in the new location.

Probably not something you want as there are no changes in the managed infrastructure really.
Read below on how to migrate individual resources and/or whole modules in Terragrunt without having to recreate them.

I assume you're using remote state backend but the process is very similar when local state files are used.

## Prerequisites

Scenarios below were tested with 

- Terraform v0.14.5
- Terragrunt version v0.27.1

## Terragrunt module == Terraform state file

Each module in Terragrunt represents a group of Terraform resources.
Each module is tracked in [its own Terraform state file](https://terragrunt.gruntwork.io/docs/features/keep-your-remote-state-configuration-dry/#filling-in-remote-state-settings-with-terragrunt).

Thus moving resources and modules in Terragrunt boils down to keeping Terraform state files in sync.
When you move entire Terragrunt module, Terraform state file must be moved too (unfortunately it doesn't happen automatically).
When you move resources between modules, source and target state files have to be updated accordingly.

**Important:** steps below will not create/destroy any of the provisioned resources. 
You only alter Terraform state.
If you see changes in the `terragrunt plan` (except for `outputs` maybe), something is wrong and you should review the steps that got you there.

## Use case: move/rename Terragrunt module folder

Let's say we have an `api` module definition (Terraform files) in the `infrastructure-modules` folder.
There's an instance of that module in the `infrastructure-live/staging`, also named `api`. 

There will be new APIs deployed soon and to not confuse them we want to rename that instance to `api-analytics`. 
If you want to move the module around in the directory hierarchy, the steps will be the same.

Before:

```text
infrastructure-modules/
├── api/
    ├── main.tf

infrastructure-live/
├── staging/
    ├── terragrunt.hcl # shared config
    ├── api/
        ├── terragrunt.hcl # module config
```

After:

```text
infrastructure-modules/
├── api/
    ├── main.tf

infrastructure-live/
├── staging/
    ├── terragrunt.hcl
    ├── api-analytics/ # module folder renamed
        ├── terragrunt.hcl
```

**1\. Backup source state:**
```bash
# infrastructure-live/staging/api/
terragrunt state pull > /var/app/staging-api-backup.tfstate
```

Always make a backup and copy it to a safe place before you proceed. 
Yes, Terraform creates backup files with every `terraform state *` command but:
a) It won't backup source state if it's in a remote backend
b) I managed to lose a backup file created by Terraform in an ephemeral Docker container

**2\. Move/rename the module folder:**
```bash
# infrastructure-live/staging/
mv api api-analytics
```

**3\. Install provider plugins and initialize empty state in the new module location:**
```bash
# infrastructure-live/staging/api-analytics/
terragrunt init
```

**4\. Restore state at new remote location from the backup:**
```bash
# infrastructure-live/staging/api-analytics/
terragrunt state push /var/app/staging-api-backup.tfstate
```

**5\. Make sure there are no changes:**
```bash
# infrastructure-live/staging/api-analytics/
terragrunt plan
```

Note the original state file was never removed from the remote backend.
You may go ahead and remove it manually (AFAIK there's no Terraform command to remove the entire remote state file).

Alternatively, instead of pulling the remote state file, you *could* move the resources from the source state to a local file and restore from that file.

I found this little trick to iterate Terraform resources [here](https://gist.github.com/ukayani/1200499e9edd957d5a34afb815c30bc5).
It will move all resources, one by one, to the target state file:
```bash
terragrunt state list 2>/dev/null | xargs -n1 -I{} terragrunt state mv -state-out=/var/app/moved-resources.tfstate {} {}
```

But then the outputs are still kept in the source state file and it's never removed... So I find it easier to not bother with moving individual resources here. 
Migrate the entire state and remove the source state file from the backend manually.

## Use case: move individual resources between modules

Let's say we have an `api` module definition (Terraform files) in the `infrastructure-modules` folder.
It configures all resources required to run an API: storage, network, database, compute.
It started small but over time became hard to maintain.
There's an instance of that module in the `infrastructure-live/staging`, also named `api`.

We want to take a part of that module, e.g. database and extract it to its own module `database`.
Database depends on the network module which is still in the api module. 
We will need to export the network ID in the `api` module and import it in the `database` module.

Before:

```text
infrastructure-modules/
├── api/
    ├── main.tf # has way too many resources; we want to refactor it

infrastructure-live/
├── staging/
    ├── terragrunt.hcl # shared config
    ├── api/
        ├── terragrunt.hcl # module config
```

After:

```text
infrastructure-modules/
├── api/
    ├── main.tf # still holds storage, network, compute resources
    ├── outputs.tf # exports network ID
├── database/
    ├── main.tf # extracted database resources
    ├── variables.tf # to import network ID

infrastructure-live/
├── staging/
    ├── terragrunt.hcl
    ├── api/
        ├── terragrunt.hcl
    ├── database/
        ├── terragrunt.hcl
```

**1\. Backup source state:**
```bash
# infrastructure-live/staging/api/
terragrunt state pull > /var/app/staging-api-backup.tfstate
```

**2\. Add outputs to the original module so that extracted module can use them:**

```hcl
# infrastructure-modules/api/outputs.tf
output "network_id" {
  value = vnet.my_vnet.network_id
}
```

```bash
# infrastructure-live/staging/api/
terragrunt apply
```

**3\. Create Terraform module for the database:**

Move relevant resources from `infrastructure-modules/api/main.tf` to `infrastructure-modules/database/main.tf`

```hcl
# infrastructure-modules/database/main.tf
resource "database" "my_db" {
  ...
}
```

```hcl
# infrastructure-modules/database/variables.tf
variable "network_id" {
  type = string
  description = "Network ID"
}
```

**4\. Create Terragrunt module for the database and declare its dependencies and inputs:**

```hcl
# infrastructure-live/staging/database/terragrunt.hcl
include {
  path = find_in_parent_folders()
}

dependency "api" {
  config_path = "../api"
}

terraform {
  source = "../../modules//database"
}

inputs = {
  network_id = dependency.api.outputs.network_id
}
```

**5\. Initialize the database module and create (empty) local state file:**

```bash
# infrastructure-live/staging/database/
terragrunt init
terragrunt state pull > /var/app/database.tfstate
```

**6\. Move resources one by one from `api`'s remote state to `database`'s local state.**

Make sure to use absolute paths, otherwise generated state file will end up somewhere in the Terragrunt cache directory:

```bash
# infrastructure-live/staging/api/
terragrunt state mv -state-out=/var/app/database.tfstate database.my_db database.my_db
terragrunt state mv -state-out=/var/app/database.tfstate database_firewall_rule.my_rule database_firewall_rule.my_rule
...
```

**7\. Push database local state to the remote backend:**

```bash
# infrastructure-live/staging/database/
terragrunt state push /var/app/database.tfstate
```

**8\. Verify there are no changes:**

```bash
# infrastructure-live/staging/database/
terragrunt plan
```

```bash
# infrastructure-live/staging/api/
terragrunt plan
```

If you want to migrate resources to an existing module, steps will be the same. 
Make sure to backup target state too in this case!

References:
- https://www.terraform.io/docs/cli/commands/state/mv.html
- https://community.gruntwork.io/t/terraform-state-is-messed-up-after-moving-folders/448/4

## ...

Moving Terraform state is no fun but hopefully this tutorial helps to make it a bit less painful.

Make backups of the source and target state before you start a migration.
Review Terraform plan output carefully when you're done refactoring to make sure there are no unexpected changes.