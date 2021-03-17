---
title: How to make a copy of AWS IAM role
image: /posts/2021/03/copy-aws-iam-role/thumb.png
image_dev: /posts/2021/03/copy-aws-iam-role/thumb-dev.png
description: Avoid the chore of copying policy JSON manually.
date: 2021-03-15
updateDate: 2021-03-17
tags:
  - AWS
  - AWS IAM
  - Node.js
  - Productivity
---

It may happen that you need to make a **copy of an IAM role** in AWS. Maybe you want to experiment with changing role's permission scope but you don't want to touch the role that is currently in use.

One way to approach it is to duplicate the existing role along with **all its policies**, make the needed change on the new role and run your tests.

There's no `aws iam copy-role` command though... So your only option is to duplicate the role and its associated policies manually or to script the process.

Here's an implementation of such a script in Node.js. It will make a copy of the role with its trust relationship policy, inline policies and managed polcies (both AWS- and customer-managed).

You can find the code in the [repository](https://github.com/maximivanov/aws-iam-copy-role).

## Why Node.js? Shouldn't we use AWS CDK nowadays?

Node.js was my choice because I'm comfortable with the language. The util could very well be written in any language as long as you can access AWS SDK.

Now, AWS is pushing CDK as the tool to deploy infrastructure in the cloud. Can we use it to make a copy of an IAM role?

I'm not an expert in CDK, but from a quick experiment I ran copying a role is not very convenient with CDK.

```js
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';

const sourceRoleArn = 'arn:aws:iam::115863491284:role/copy-role-poc'

export class CdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sourceRole = <iam.Role>iam.Role.fromRoleArn(this, 'SourceRole', sourceRoleArn, {
      mutable: false,
    });

    // const targetRole = new iam.Role(this, 'TargetRole', {
    //   // assumedBy: sourceRole.??
    // })
  }
}
```

While it's very easy to **create new** resources in CDK, I didn't find a way to extract details about an existing role: trust relationship policy, inline and managed policies. There are simply no such properties in the [`Role` construct](https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-iam.Role.html). If you know a way to fetch that information from a role, please let me know!

## Prerequisites

You need Node.js to run the script.

```bash
node --version
v14.15.5 # also tested with v12.21.0
```

If you don't have Node installed locally, you can run the script in Docker:

```bash
docker run -it --rm -v $(pwd):/var/app -w /var/app node:14-alpine sh

export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

## Usage

```bash
npm install
```

To copy a role, pass source and target role names (not ARNs) to the script:

```bash
node copy-role.js SOURCE_ROLE_NAME TARGET_ROLE_NAME
```

Example output:

```bash
/var/app # node copy-role.js copy-role-poc copy-role-poc-target-role

--> Parsing arguments from command line...
<-- Arguments loaded. Source role name: copy-role-poc, target role name: copy-role-poc-target-role

--> Checking if AWS credentials are loaded...
<-- Credentials found.

--> Fetching source role...
<-- Source role loaded.

--> Fetching inline policies for the role...
<-- Loaded 2 inline policy names.
--> Fetching inline policies...
<-- Loaded inline policies.

--> Fetching managed policies for the role...
<-- Loaded 2 managed policies.

--> Creating a new role copy-role-poc-target-role...
<-- Created role copy-role-poc-target-role.

--> Adding inline policies to copy-role-poc-target-role...
<-- Added 2 inline policies.

--> Adding managed policies to copy-role-poc-target-role...
<-- Added 2 managed policies.
```

## Implementation details

You can inspect the code in the repository if you wish. In a nutshell it uses AWS JavaScript SDK to do the following:

1. Fetch the source role along with its trust relationship policy
2. Fetch inline policies of the source role
3. Fetch managed policies of the source role (both AWS- and customer-created)
4. Create a new role copying over all relevant properties (`Path`, `AssumeRolePolicyDocument`, `Description`, `MaxSessionDuration`, `PermissionsBoundary`, `Tags`)
5. Add all inline policies found in the source role to the new role
6. Attach all managed policies from the source role

The process is quite straightforward... The only interesting detail is steps 2 and 3 require recursive fetch to accomodate the fact that policies response can be paginated.

[AWS SDK APIs](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/IAM.html) used:

- `getRole()`
- `listRolePolicies()`
- `getRolePolicy()`
- `listAttachedRolePolicies()`
- `createRole()`
- `putRolePolicy()`
- `attachRolePolicy()`

Finally, it was a chance to add some [ASCII art](https://textart.sh/):

![error message](/posts/2021/03/copy-aws-iam-role/error-message.webp)

## References

- https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/IAM.html
- https://stackoverflow.com/questions/61221952/need-to-make-an-identical-copy-of-aws-iam-role-including-policies-and-trust-rel
- https://github.com/maximivanov/aws-iam-copy-role

## ...

*Automate once and use forever* they say. Honestly I only needed to use it once so far... 🙃 

Can I put it as *automate once and share for everyone to use*? That makes more sense hopefully!