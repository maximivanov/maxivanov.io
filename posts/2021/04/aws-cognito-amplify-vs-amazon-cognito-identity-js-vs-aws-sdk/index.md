---
title: "AWS Cognito: Amplify vs amazon-cognito-identity-js vs AWS SDK"
image: /posts/2021/04/aws-cognito-amplify-vs-amazon-cognito-identity-js-vs-aws-sdk/thumb.png
image_dev: /posts/2021/04/aws-cognito-amplify-vs-amazon-cognito-identity-js-vs-aws-sdk/thumb-dev.png
description: Which of the libraries to use when to integrate Cognito in JavaScript projects.
date: 2021-04-03
tags:
  - AWS
  - Cognito
  - Node.js
  - JavaScript
  - Authentication
---

Imagine you're starting a new project. You want to leverage existing solutions and cloud infrastructure to move fast. Users should be able to create accounts in the application you're about to build, so you're thinking about a **managed user directory**. It has to be reliable, secure and scalable. Not something you can build yourself overnight! AWS Cognito is a great service that can help you push the burden to the service provider.

After the first round of planning, you have a good idea of the architecture of the application, including what languages and frameworks will be used. Now you need to decide how you're going to **integrate Cognito with your app**. There's not one or two ways to do it, there are 3 official code libraries that you can use: 

- [Amplify](https://docs.amplify.aws/lib/auth/getting-started/q/platform/js)
- [amazon-cognito-identity-js](https://github.com/aws-amplify/amplify-js/tree/main/packages/amazon-cognito-identity-js)
- [AWS SDK](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html)

Read on to see how these options compare, what are the limitations and when to use which.

## Comparing options

How do you decide which library/package to use? It depends on a few factors:

- Are you going to use it in the **frontend** or in the **backend**?
- On the frontend, will you be using one of the popular **frameworks** (React/Next.js, Vue.js/Nuxt.js, Angular) or is it something custom / vanilla JS?
- Will you need to use **secret-enabled** app client in Cognito?
- Are you going to call Cognito APIs that require AWS developer **credentials**? E.g. `adminCreateUser`

We will go through all the options describing their pros/cons. For each library I'll provide a short example of how to use it in the code, both in the frontend and backend. All examples below make an unathenticated `signUp` Cognito API call.
Additionally, you'll find examples of requests and responses (HTTP headers and bodies as well as data returned in the code). I feel like when you can see all of the details in one place it makes it easier to understand the API.

All code examples use ES6 modules and are written with async/await for asynchronous calls. Callbacks are promisified where necessary. Requests are made against this Cognito User Pool which has 2 app clients: one is public (client secret disabled) and one is private (client secret enabled).

![Cognito configuration](/posts/2021/04/aws-cognito-amplify-vs-amazon-cognito-identity-js-vs-aws-sdk/cognito-settings.webp)

## Amplify

Amplify is an umbrella project for a bunch of services, one of them is authentication (Cognito). 

- Does Amplify work in the backend? It's a client library, and it's supposed to be used in the browser and mobile applications. Having said that it can work on the backend too, when used in the context of a SSR framework (Next.js/Nuxt.js). But outside of the universal rendering mode you're probably better off using the other 2 options.
- On the frontend, it integrates well with major frameworks. It has ready-made, customizeable UI components which make implementing auth-related flows a breeze.
- It doesn't support secret-enabled Cognito app clients. *"Generate client secret"* must be unchecked in the app client settings.
- You can use admin-level Cognito APIs, but only inderectly via [Admin Actions](https://docs.amplify.aws/cli/auth/admin). The way it works is you'd use Amplify to deploy an API Gateway and a Lambda that implements (essentially proxies) Cognito admin APIs. To limit access, you can restrict access to that Lambda to a specific Cognito group.

**When to use Amplify:** whenever you're building a client-side application and you need other tools from the Amplify ecosystem (APIs, analytics, storage, etc.). Also it can help you start quickly with premade UI components.

### Use Amplify in browser

Here's a basic form that accepts an email and a password and creates a new user in Cognito:

![Amplify example](/posts/2021/04/aws-cognito-amplify-vs-amazon-cognito-identity-js-vs-aws-sdk/amplify-browser.webp)

Corresponding JS code (Parcel-bundled):

```js
import Amplify, { Auth } from 'aws-amplify'

Amplify.configure({
  Auth: {
    region: 'us-east-1',
    userPoolId: 'us-east-1_ZPwVcZizN',
    userPoolWebClientId: '658l7npr63jq5ohbk2gl2jvf6',
  },
})

;(async () => {
  const form = document.querySelector('.form')
  const email = document.querySelector('.email')
  const password = document.querySelector('.password')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    try {
      const res = await signUp(email.value, password.value)
      console.log('Signup success. Result: ', res)
    } catch (e) {
      console.log('Signup fail. Error: ', e)
    }
  })
})()

async function signUp(email, password) {
  return Auth.signUp({
    username: email,
    password,
    attributes: {
      email,
    },
  })
}
```

On success, response will be as following (`res` variable in the code above):

```json
{
  "user": {
    "username": "max@maxivanov.io",
    "pool": {
      "userPoolId": "us-east-1_ZPwVcZizN",
      "clientId": "658l7npr63jq5ohbk2gl2jvf6",
      "client": {
        "endpoint": "https://cognito-idp.us-east-1.amazonaws.com/",
        "fetchOptions": {}
      },
      "advancedSecurityDataCollectionFlag": true,
      "storage": {}
    },
    "Session": null,
    "client": {
      "endpoint": "https://cognito-idp.us-east-1.amazonaws.com/",
      "fetchOptions": {}
    },
    "signInUserSession": null,
    "authenticationFlowType": "USER_SRP_AUTH",
    "storage": {},
    "keyPrefix": "CognitoIdentityServiceProvider.658l7npr63jq5ohbk2gl2jvf6",
    "userDataKey": "CognitoIdentityServiceProvider.658l7npr63jq5ohbk2gl2jvf6.max@maxivanov.io.userData"
  },
  "userConfirmed": false,
  "userSub": "68afb047-37d1-4efc-bc11-26056d1657c8",
  "codeDeliveryDetails": {
    "AttributeName": "email",
    "DeliveryMedium": "EMAIL",
    "Destination": "m***@m***.io"
  }
}
```

Amplify HTTP request and response headers:

![Amplify http request and response](/posts/2021/04/aws-cognito-amplify-vs-amazon-cognito-identity-js-vs-aws-sdk/amplify-http-request.webp)

HTTP request body:

```json
{
  "ClientId": "658l7npr63jq5ohbk2gl2jvf6",
  "Username": "max@maxivanov.io",
  "Password": "12345678",
  "UserAttributes": [
    {
      "Name": "email",
      "Value": "max@maxivanov.io"
    }
  ],
  "ValidationData": null
}
```

HTTP response body:

```json
{
  "CodeDeliveryDetails": {
    "AttributeName": "email",
    "DeliveryMedium": "EMAIL",
    "Destination": "m***@m***.io"
  },
  "UserConfirmed": false,
  "UserSub": "341eeb82-bcf8-4453-aac3-a0f323a7b7dc"
}
```

## amazon-cognito-identity-js

It used to be a standalone library but eventually it migrated to the Amplify project. It is now hosted as a package in the Amplify monorepo. In fact Amplify uses this package to make Cognito API requests. But you can use it without Amplify just fine. It is essentially a nice wrapper around lower-level AWS SDK (note it does not use `aws-sdk` package, it makes HTTP calls to AWS directly).

- Does it work in the backend? Yes, it can work in the Node.js environment.
- When used on the frontend, it provides lower level (compared to Amplify) API to make Cognito calls. It won't help with UI scaffolding, it only facilitates communication with the server.
- It doesn't support secret-enabled Cognito app clients. *"Generate client secret"* must be unchecked in the app client settings.
- You cannot use admin-level Cognito APIs (those that require AWS credentials) with `amazon-cognito-identity-js`.

**When to use `amazon-cognito-identity-js`:** when you do not need any of the extra features provided by Amplify and you only need to integrate Cognito within your app's custom UI. As a bonus you will probably get a much smaller bundle. You can also use it in the backend but you'd be limited to public Cognito APIs only.

### Use amazon-cognito-identity-js in browser

It's the same basic signup form as in the Amplify example.

Corresponding JS code (Parcel-bundled):

```js
import {
  CognitoUserPool,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js'

import { promisify } from 'util'

;(async () => {
  const form = document.querySelector('.form')
  const email = document.querySelector('.email')
  const password = document.querySelector('.password')

  const userPool = new CognitoUserPool({
    UserPoolId: 'us-east-1_ZPwVcZizN',
    ClientId: '658l7npr63jq5ohbk2gl2jvf6',
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    try {
      const res = await signUp(userPool, email.value, password.value)
      console.log('Signup success. Result: ', res)
    } catch (e) {
      console.log('Signup fail. Error: ', e)
    }
  })
})()

async function signUp(userPool, email, password) {
  const emailAttribute = new CognitoUserAttribute({
    Name: 'email',
    Value: email,
  })

  let attributes = [emailAttribute]

  const promisifiedSignUp = promisify(userPool.signUp).bind(userPool)

  return promisifiedSignUp(email, password, attributes, null)
}
```

Result returned by the `userPool.signUp` as well as HTTP request/response headers and bodies will be the same as in the Amplify example above.

### Use amazon-cognito-identity-js on the server

Again, the script will make a call to the signUp Cognito API. The code uses ES6 modules so Node.js 14+ is required.

```js
import {
  CognitoUserPool,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js'

import { promisify } from 'util'

const userPoolId = 'us-east-1_ZPwVcZizN'
const clientId = '658l7npr63jq5ohbk2gl2jvf6'
const email = 'max@maxivanov.io'
const password = '12345678'

;(async () => {
  const userPool = new CognitoUserPool({
    UserPoolId: userPoolId,
    ClientId: clientId,
  })

  try {
    const res = await signUp(userPool, email, password)
    console.log('Signup success. Result: ', res)
  } catch (e) {
    console.log('Signup fail. Error: ', e)
  }
})()

async function signUp(userPool, email, password) {
  const emailAttribute = new CognitoUserAttribute({
    Name: 'email',
    Value: email,
  })

  let attributes = [emailAttribute]

  const promisifiedSignUp = promisify(userPool.signUp).bind(userPool)

  return promisifiedSignUp(email, password, attributes, null)
}
```

See the example `res` variable value in the Amplify section above.

If you try to use `amazon-cognito-identity-js` with an app client that has *Generate client secret* enabled, you will get this error:

```json
{
  code: 'NotAuthorizedException',
  name: 'NotAuthorizedException',
  message: 'Unable to verify secret hash for client 5cdgugg1eko9cm7u1u3spnaf37'
}
```

## Cognito AWS SDK

AWS SDK is as close to the cloud resources as you can get. It exposes all of the operations you can run in AWS. There are 2 versions of the AWS SDK in use currently: v2 and v3, and the way you import and use these differs. Examples below use v3 since it's already generally available.

- Does it work in the backend? Absolutely.
- On the frontend, you're probably better off using higher-level Amplify or `amazon-cognito-identity-js` since they provide better developer experience.
- Unlike 2 libraries above, AWS SDK supports secret-enabled Cognito app clients. *"Generate client secret"* can be checked in the app client settings.
- You can use admin-level Cognito APIs. Make sure AWS credentials (access key ID and secret key) are [available](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials.html) in the code.

**When to use AWS SDK:** when you need to access protected Cognito APIs that require developer credentials. AWS SDK is the way to go if you need communicate with a secret-enabled Cognito app client.

### Use AWS SDK v3 on the server

The code below features an example usage of AWS SDK to create a new Cognito user with a request signed with the client secret. 

```js
import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider'

import crypto from 'crypto'

const clientId = '5cdgugg1eko9cm7u1u3spnaf37'
const clientSecret = '7j3v7ag5avt2pegj45lad3f7f0lpdikhm2o6oiae9arii1pbqn0'
const email = 'max@maxivanov.io'
const password = '12345678'

;(async () => {
  var params = {
    ClientId: clientId,
    Password: password,
    Username: email,
    SecretHash: hashSecret(clientSecret, email, clientId),
    UserAttributes: [
      {
        Name: 'email',
        Value: email,
      },
    ],
  }

  const provider = new CognitoIdentityProvider({ region: 'us-east-1' })

  try {
    const res = await provider.signUp(params)
    console.log('Signup success. Result: ', res)
  } catch (e) {
    console.log('Signup fail. Error: ', e)
  }
})()

function hashSecret(clientSecret, username, clientId) {
  return crypto
    .createHmac('SHA256', clientSecret)
    .update(username + clientId)
    .digest('base64')
}
```

API response example (`res` variable in the code above):

```json
{
  "$metadata": {
    "httpStatusCode": 200,
    "requestId": "64abc24c-1ff6-451e-a335-a61f89813acd",
    "attempts": 1,
    "totalRetryDelay": 0
  },
  "CodeDeliveryDetails": {
    "AttributeName": "email",
    "DeliveryMedium": "EMAIL",
    "Destination": "m***@m***.io"
  },
  "UserConfirmed": false,
  "UserSub": "3c434ca4-14f9-4549-97f9-88b549a9b1e7"
}
```

### Use AWS SDK v3 in the browser

```js
import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider'

const region = 'us-east-1'
const clientId = '658l7npr63jq5ohbk2gl2jvf6'

;(async () => {
  const form = document.querySelector('.form')
  const email = document.querySelector('.email')
  const password = document.querySelector('.password')
  const provider = new CognitoIdentityProvider({ region })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    var params = {
      ClientId: clientId,
      Password: password.value,
      Username: email.value,
      UserAttributes: [
        {
          Name: 'email',
          Value: email.value,
        },
      ],
    }

    try {
      const res = await provider.signUp(params)
      console.log('Signup success. Result: ', res)
    } catch (e) {
      console.log('Signup fail. Error: ', e)
    }
  })
})()
```

API response will be identical to the one for requests originating from the server.

AWS SDK HTTP request and response headers:

![AWS SDK HTTP request and response](/posts/2021/04/aws-cognito-amplify-vs-amazon-cognito-identity-js-vs-aws-sdk/aws-sdk-browser-http-headers.webp)

HTTP request body:

```json
{
  "ClientId": "658l7npr63jq5ohbk2gl2jvf6",
  "Password": "12345678",
  "UserAttributes": [
    {
      "Name": "email",
      "Value": "max@maxivanov.io"
    }
  ],
  "Username": "max@maxivanov.io"
}
```

HTTP response body:

```json
{
  "CodeDeliveryDetails": {
    "AttributeName": "email",
    "DeliveryMedium": "EMAIL",
    "Destination": "m***@m***.io"
  },
  "UserConfirmed": false,
  "UserSub": "25f09095-ac18-4f1f-ac26-4c4039841cc1"
}
```

You can see the JSON passed in the HTTP request and response is identical to those in the Amplify example. Which makes sense, since in the end all of the tools communicate with the AWS HTTP API.

## References

- https://docs.amplify.aws/lib/auth/getting-started/q/platform/js
- https://github.com/aws-amplify/amplify-js/tree/main/packages/amazon-cognito-identity-js
- https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html
- https://github.com/maximivanov/cognito-js-usage

## ...

You have 3 tools to work with Cognito in JavaScript. Assess the requirements and make the right choice!