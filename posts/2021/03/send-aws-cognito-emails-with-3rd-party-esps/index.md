---
title: Send AWS Cognito emails with 3rd party ESPs
image: /posts/2021/03/send-aws-cognito-emails-with-3rd-party-esps/thumb.png
image_dev: /posts/2021/03/send-aws-cognito-emails-with-3rd-party-esps/thumb-dev.png
description: You are now not limited in how you can send email and SMS notifications in Cognito.
date: 2021-03-09
tags:
  - AWS
  - Cognito
  - CloudFormation
  - Terraform
  - AWS Lambda
---

In AWS Cognito, the default method of sending emails and SMS messages is AWS' own services: SES and SNS correspondingly.

Usually it makes sense, you're already in the AWS ecosystem anyway... But what if you have a requirement to use a **3rd party ESP (Email Service Provider)**, like Twilio Sendgrid or Mailgun/Sendinblue/Mailchimp? Some of the reasons could be:

- Designers need easy access to the email templates in the ESP UI
- Users need a way to unsubscribe from the emails they receive (subscription status tracked by the ESP)
- Your company relies on analytics tools provided by ESPs which you wouldn't have with SES
- The email template is large (html and css-wise) and it doesn't fit into Cognito's 20k characters limit
- You do not want to (additionally) authenticate SES origin (SPF, DKIM, DMARC)
- You want to reuse high-reputation IP addresses managed by the ESP

There's a **Custom message Lambda trigger** (e.g. invoked by `CustomMessage_ForgotPassword` user action) but it will only allow you to customize the email subject and body, not change the underlying transport.

Sometime late 2020, AWS added a new type of Lambda trigger to Cognito: **Custom Sender Lambda Triggers**. 

Cognito documentation is a bit lacking... The code is not copypastable and some steps in the instructions are missing.
Furthermore it doesn't show how to configure custom email and SMS senders with infrastructure as code.

Below is a guide to deploying and using these new Cognito Lambda triggers. 
We will see how to deploy them with **Cloudformation and Terraform**.

## Custom sender Lambda triggers

More specifically, there are 2 new triggers:

- `CustomEmailSender` to override the default (SES) way of sending emails
- `CustomSMSSender` when you need to use an external service for text messages instead of SNS

In this post we will focus on the **custom email sender Lambda**, but the process for custom SMS sender is identical.

The parameters these Lambda triggers receive from Cognito are a bit different from what Custom Message Trigger gets. With `CustomMessage_*` triggers no secrets are passed to the code. Instead, you get a placeholder string that you put in the right place in the email or SMS to be sent. That placeholder gets replaced with the code by Cognito right before the notification is sent.

Custom sender triggers on the other hand receive **encrypted notification code**. Thus we will need to set up a KMS key - for Cognito to encrypt the codes and for us to decrypt them in the function code.

How are new triggers supported by the tooling?
- Cognito Console doesn't let you configure the triggers yet
- Cognito documentation suggests using AWS CLI to configure triggers
- CloudFormation docs say the feature is not yet supported. From my tests it worked, probably the docs are not updated yet
- Terraform does not yet support it but there's a workaround

## Send Cognito emails with Twilio Sendgrid

For the demo, we will register a new user in Cognito and will make sure the email is sent with Sendgrid.

Prerequisites to follow along:

- AWS account
- Sendgrid account (or whichever ESP you're using)
- Docker

That's right, no AWS CLI, no Node.js, Docker is the only dev dependency. What a beautiful time to be a developer in!

Since this is not a tutorial on how to deploy Cognito, I will focus only on parts relevant to the custom sender triggers.

You can find **full code with all resources** defined in CloudFormation and Terraform in the [demo repository](https://github.com/maximivanov/cognito-custom-email-sender-lambda).

## Create KMS key

As mentioned above we need a key to encrypt/decrypt the notification code. The key policy matches the default permissions for a new KMS key when it is created with AWS Console.

**CloudFormation**

```yaml
Parameters:
  ...
  CallingUserArn:
    Description: Calling user ARN
    Type: String

Resources:
  ...
  KmsKey:
    Type: AWS::KMS::Key
    Properties:
      Enabled: true
      KeyPolicy:
        Version: '2012-10-17'
        Statement:
        - Effect: Allow
          Principal:
            AWS: !Sub 'arn:aws:iam::${AWS::AccountId}:root'
          Action: 'kms:*'
          Resource: '*'
        - Effect: Allow
          Principal:
            AWS: !Ref CallingUserArn
          Action:
            - "kms:Create*"
            - "kms:Describe*"
            - "kms:Enable*"
            - "kms:List*"
            - "kms:Put*"
            - "kms:Update*"
            - "kms:Revoke*"
            - "kms:Disable*"
            - "kms:Get*"
            - "kms:Delete*"
            - "kms:TagResource"
            - "kms:UntagResource"
            - "kms:ScheduleKeyDeletion"
            - "kms:CancelKeyDeletion"
          Resource: '*'
```

`CallingUserArn` parameter is a little trick to **pass calling IAM user's ARN** to CloudFormation:

```bash
aws cloudformation deploy ... --parameter-overrides CallingUserArn="$(aws sts get-caller-identity --query Arn --output text)"
```

**Terraform**

```hcl
data "aws_caller_identity" "current" {}

resource "aws_kms_key" "kms_key" {
  description             = "KMS key for Cognito Lambda trigger"
  policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
            },
            "Action": "kms:*",
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Principal": {
                "AWS": "${data.aws_caller_identity.current.arn}"
            },
            "Action": [
                "kms:Create*",
                "kms:Describe*",
                "kms:Enable*",
                "kms:List*",
                "kms:Put*",
                "kms:Update*",
                "kms:Revoke*",
                "kms:Disable*",
                "kms:Get*",
                "kms:Delete*",
                "kms:TagResource",
                "kms:UntagResource",
                "kms:ScheduleKeyDeletion",
                "kms:CancelKeyDeletion"
            ],
            "Resource": "*"
        }
    ]
}
EOF
}
```

## Create Lambda IAM role

Besides the standard `AWSLambdaBasicExecutionRole` managed policy, we need to grant Lambda access to **decrypt our KMS key**.
*Note you probably want to replace `AWSLambdaBasicExecutionRole` with a fine-grained policy so that it has the least required privileges*.

For both CF and TF scripts, the outcome is the same: a **role for the Lambda trigger with 2 policies attached**.

**CloudFormation**

```yaml
Resources:
  ...
  LambdaTriggerRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Action: "sts:AssumeRole"
            Principal:
              Service: "lambda.amazonaws.com"
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

  LambdaTriggerRoleKmsPolicy:
    Type: AWS::IAM::Policy
    Properties:
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: "Allow"
            Action:
              - "kms:Decrypt"
            Resource: !GetAtt KmsKey.Arn
      PolicyName: "LambdaKmsPolicy"
      Roles:
        - !Ref LambdaTriggerRole
```

**Terraform**

```hcl
data "aws_iam_policy_document" "AWSLambdaTrustPolicy" {
  version = "2012-10-17"
  statement {
    actions    = ["sts:AssumeRole"]
    effect     = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "iam_role" {
  assume_role_policy = data.aws_iam_policy_document.AWSLambdaTrustPolicy.json
  name = "${var.project}-iam-role-lambda-trigger"
}

resource "aws_iam_role_policy_attachment" "iam_role_policy_attachment_lambda_basic_execution" {
  role       = aws_iam_role.iam_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "iam_policy_document_lambda_kms" {
  version = "2012-10-17"
  statement {
    actions    = ["kms:Decrypt"]
    effect     = "Allow"
    resources = [
        aws_kms_key.kms_key.arn
    ]
  }
}

resource "aws_iam_role_policy" "iam_role_policy_lambda_kms" {
  name   = "${var.project}-iam-role-policy-lambda-kms"
  role   = aws_iam_role.iam_role.name
  policy = data.aws_iam_policy_document.iam_policy_document_lambda_kms.json
}
```

## Create Lambda function (Node.js code)

Unlike the AWS SDK itself, `@aws-crypto/client-node` encryption library has to be **packaged and deployed** with the code. If you don't have Node.js installed locally, you can install dependencies with Docker. Assuming you're in the cloned repo:

```bash
cd lambda/

docker run -it --rm -v $(pwd):/var/app node:12 bash

npm i
```

The function code:

```js
const AWS = require('aws-sdk')
const b64 = require('base64-js')
const encryptionSdk = require('@aws-crypto/client-node')
const sgMail = require("@sendgrid/mail")

const { decrypt } = encryptionSdk.buildClient(encryptionSdk.CommitmentPolicy.REQUIRE_ENCRYPT_ALLOW_DECRYPT)
const keyIds = [process.env.KEY_ID];
const keyring = new encryptionSdk.KmsKeyringNode({ keyIds })

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

exports.handler = async(event) => {
  let plainTextCode
  if (event.request.code) {
    const { plaintext, messageHeader } = await decrypt(keyring, b64.toByteArray(event.request.code))
    plainTextCode = plaintext
  }

  const msg = {
    to: event.request.userAttributes.email,
    from: "cognito-test@maxivanov.io",
    subject: "Your Cognito code",
    text: `Your code: ${plainTextCode.toString()}`,
  }

  await sgMail.send(msg)      
}
```

It expects the KMS key ARN and ESP API key to be passed as environment variables. The notification code is decrypted and can be used in the message body sent to the email provider API for delivery.

**Example `event` object** passed to the function:

```json
{
    "version": "1",
    "triggerSource": "CustomEmailSender_ForgotPassword",
    "region": "us-east-1",
    "userPoolId": "us-east-1_LnS...",
    "userName": "54cf7eb7-0b96-4304-...",
    "callerContext": {
        "awsSdkVersion": "aws-sdk-nodejs-2.856.0",
        "clientId": "6u7c9vr3pkstoog..."
    },
    "request": {
        "type": "customEmailSenderRequestV1",
        "code": "AYADeILxywKhhaq8Ys4mh0aHutYAgQACABVhd3MtY3J5c...",
        "clientMetadata": null,
        "userAttributes": {
            "sub": "54cf7eb7-0b96-4304-8d6b-...",
            "email_verified": "true",
            "cognito:user_status": "CONFIRMED",
            "cognito:email_alias": "hello@maxivanov.io",
            "phone_number_verified": "false",
            "phone_number": "...",
            "given_name": "Max",
            "family_name": "Ivanov",
            "email": "hello@maxivanov.io"
        }
    }
}
```

## Create Lambda function (infra)

We will define a Node.js Lambda that will be triggered by Cognito each time an email should be sent. It's deployed as a ZIP file. The only part that is unique to the custom senders trigger is the environment variables.

We need a variable for the KMS key ID and another for the email provider API key.

**CloudFormation**

```yaml
Parameters:
  ...
  SendgridApiKey:
    Description: Sendgrid API key
    Type: String

Resources:
  ...
  LambdaTrigger:
    Type: AWS::Lambda::Function
    Properties:
      Code: "../lambda"
      Environment:
        Variables:
          KEY_ID: !GetAtt KmsKey.Arn
          SENDGRID_API_KEY: !Ref SendgridApiKey
      FunctionName: !Sub ${ProjectName}-lambda-custom-email-sender-trigger
      PackageType: Zip
      Role: !GetAtt LambdaTriggerRole.Arn
      Runtime: nodejs12.x
      Handler: index.handler
```

If you're familiar with CloudFormation, there shouldn't be any surprises.

**Terraform**

```hcl
data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "../lambda"
  output_path = "lambda.zip"
}

resource "aws_lambda_function" "lambda_function_trigger" {
  environment {
    variables = {
      KEY_ID = aws_kms_key.kms_key.arn
      SENDGRID_API_KEY = var.sendgrid_api_key
    }
  }
  code_signing_config_arn = ""
  description = ""
  filename         = data.archive_file.lambda.output_path
  function_name    = "${var.project}-lambda-function-trigger"
  role             = aws_iam_role.iam_role.arn
  handler          = "index.handler"
  runtime          = "nodejs12.x"
  source_code_hash = filebase64sha256(data.archive_file.lambda.output_path)
}
```

Thanks to the `source_code_hash`, each time the function code is modified, the resource will be marked as changed and the code will get redeployed.

## Create Cognito User Pool

This is the most confusing part. We need to set the `LambdaConfig` setting of the User Pool. It is an object storing **configuration of Lambda triggers** invoked by Cognito. 2 new options we're interested in are:

- `CustomEmailSender: { LambdaArn: "...", LambdaVersion: "..." }`
- `KMSKeyID: "..."`

The process is straightforward with CloudFormation but requires a workaround in Terraform. Details below.

**CloudFormation**

The official docs say setting the custom sender options is [Not currently supported by AWS CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cognito-userpool-lambdaconfig.html#cfn-cognito-userpool-lambdaconfig-customemailsender). But lucky we, that's not the case. It worked perfectly in multiple tests I ran.

```yaml
Resources:
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      AccountRecoverySetting:
        RecoveryMechanisms:
          - Name: verified_email
            Priority: 1
      AutoVerifiedAttributes:
        - email
      LambdaConfig:
        CustomEmailSender:
          LambdaArn: !GetAtt LambdaTrigger.Arn
          LambdaVersion: "V1_0"
        KMSKeyID: !GetAtt KmsKey.Arn
      UsernameConfiguration: 
        CaseSensitive: false
      UserPoolName: !Sub ${ProjectName}-user-pool
      UsernameAttributes:
        - email
      Policies:
        PasswordPolicy: 
          MinimumLength: 10
      Schema:
        - Name: name
          AttributeDataType: String
          Mutable: true
          Required: true
        - Name: email
          AttributeDataType: String
          Mutable: true
          Required: true
```

`LambdaConfig:` is the part of the most interest above.

**Terraform**

There's an [open issue](https://github.com/hashicorp/terraform-provider-aws/issues/16760) to track the feature status in Terraform. But what can we do now, before it's available? `null_resource` can help to pull this off, but still there are some gotchas.

Unlinke the CloudFormation definition, we don't add anything `CustomEmailSender`-related in the resource definition, so that's your good old Cognito User Pool in Terraform:

```hcl
resource "aws_cognito_user_pool" "cognito_user_pool" {
  name = "${var.project}-cognito-user-pool"
  
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  auto_verified_attributes = ["email"]
  
  password_policy {
    minimum_length                   = 10
    temporary_password_validity_days = 7
    require_lowercase                = false
    require_numbers                  = false
    require_symbols                  = false
    require_uppercase                = false
  }

  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "email"
    required                 = true
    
    string_attribute_constraints {
      max_length = "2048"
      min_length = "0"
    }
  }
  
  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "name"
    required                 = true

    string_attribute_constraints {
      max_length = "2048"
      min_length = "0"
    }
  }

  username_attributes = ["email"]
  username_configuration {
    case_sensitive = false
  }
}
```

In order to set the Lambda configuration in the user pool, we will use the `aws cognito-idp update-user-pool --lambda-config "CustomEmailSender={LambdaVersion=V1_0,LambdaArn=...` AWS CLI command. 

The problem is, if you don't pass all the other relevant pool options to this command, they will be **reset to the default values**. Suggested solution:

1\. Deploy Terraform stack **without setting the lambda config**

2\. Generate a **skeleton of the input variables** expected by the `update-user-pool` command:

```bash
aws cognito-idp update-user-pool --user-pool-id us-east-1_evzTb... --generate-cli-skeleton input
```

3\. Fetch the **current configuration** of the user pool:

```bash
aws cognito-idp describe-user-pool --user-pool-id us-east-1_evzTb... --query UserPool > input.json
```

4\. From the fetched config, **remove the keys** that are not listed in the skeleton. Only configuration options accepted by the `update-user-pool` must be left. One can probably come up with a script to do this automatically... but I edited it manually.

5\. Add and **deploy the new `null_resource`** with Terraform.

```hcl
locals {
    update_user_pool_command = "aws cognito-idp update-user-pool --user-pool-id ${aws_cognito_user_pool.cognito_user_pool.id} --cli-input-json file://${var.update_user_pool_config_file} --lambda-config \"CustomEmailSender={LambdaVersion=V1_0,LambdaArn=${aws_lambda_function.lambda_function_trigger.arn}},KMSKeyID=${aws_kms_key.kms_key.arn}\""
}

resource "null_resource" "cognito_user_pool_lambda_config" {
  provisioner "local-exec" {
    command = local.update_user_pool_command
  }
  depends_on = [local.update_user_pool_command]
  triggers = {
    input_json = filemd5(var.update_user_pool_config_file)
    update_user_pool_command = local.update_user_pool_command
  }
}
```

A quick comment on what's happenning here. We define a local value with the `update-user-pool` command. It accepts the user pool ID, the JSON file with current user pool configuration prepared in step `4.`, and the lambda config. Terraform `null` resource executes the command the first time you run `apply` and every time the **command or the config file are updated**.

If you get the *"Error parsing parameter 'cli-input-json': Invalid JSON received."* error, make sure the path to the input parameters json is correct and is prefixed with `file://`. I.e. `--cli-input-json file://${var.update_user_pool_config_file}`.

If you get the *"Parameter validation failed: Unknown parameter in input: "Id", ..."* error, make sure you removed all keys not supported by the `update-user-pool` from the parameters file.

If you get the *"An error occurred (InvalidParameterException) when calling the UpdateUserPool operation: Please use TemporaryPasswordValidityDays in PasswordPolicy instead of UnusedAccountValidityDays"* error, remove the `AdminCreateUserConfig.UnusedAccountValidityDays` setting. It is replaced by `Policies.PasswordPolicy.TemporaryPasswordValidityDays`.


## Make sure it works

Once all the resources are deployed we can register a new user to make sure the email with a **code is sent by the ESP**.

With CloudFormation you can find out the Cognito User Pool Client ID with 

```bash
aws cloudformation describe-stacks --stack-name cognito-custom-email-sender-cf-stack --query "Stacks[0].Outputs"
```

With Terraform, it will be listed in the outputs.

Register a new user:

```bash
aws cognito-idp sign-up --client-id <CLIENT_ID> --username hello@maxivanov.io --password <PASSOWORD> --user-attributes Name="name",Value="Max Ivanov"
{
    "UserConfirmed": false,
    "CodeDeliveryDetails": {
        "Destination": "h***@m***.io",
        "DeliveryMedium": "EMAIL",
        "AttributeName": "email"
    },
    "UserSub": "51c9045e-2f3e-4..."
}
```

It worked!

![email success](/posts/2021/03/send-aws-cognito-emails-with-3rd-party-esps/email-success.webp)

If you get *index.handler is undefined or not exported* error in CloudWatch, make sure you zipped only the function files, and not the containing folder.

If you get *KMS key arn must be a string.* or *Unable to decrypt data key and one or more KMS CMKs had an error.* error in CloudWatch, make sure you're passing the KMS key in the environment variables to the Lambda and the value is ARN of the KMS key and not its ID.



## Cleanup

At least destroying resources is much easier!

**CloudFormation**

```bash
aws cloudformation delete-stack --stack-name cognito-custom-email-sender-cf-stack
```

**Terraform**

```bash
terraform destroy
```

## References

- https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-custom-sender-triggers.html
- https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-cognito-userpool-lambdaconfig.html#cfn-cognito-userpool-lambdaconfig-customemailsender
- https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html
- https://awscli.amazonaws.com/v2/documentation/api/latest/reference/cognito-idp/update-user-pool.html
- https://github.com/hashicorp/terraform-provider-aws/issues/16760

## ...

You are now not limited in how you can send email and SMS notifications in Cognito. Use whichever notification service/provider fits your project needs better.