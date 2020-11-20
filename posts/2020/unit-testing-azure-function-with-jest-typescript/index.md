---
title: 'Unit testing Azure Functions with Jest and TypeScript'
description: Minimal setup to get you started with unit-testing HTTP-triggered Azure Functions.
date: 2020-11-19
tags:
  - Azure
  - Azure Functions
  - TypeScript
  - Testing
  - Jest
---

**`<TLDR>`** Testing an Azure Function is no different than testing any Javascript module exporting an async function. Passing a mocked Azure context is tricky so use an npm module for that. Mock parts of your code making network calls.
Function app [full code before tests](https://github.com/maximivanov/azure-function-http-typescript-jest-quickstart/tree/function-app-without-tests)
Function app [full code with tests](https://github.com/maximivanov/azure-function-http-typescript-jest-quickstart)
Diff with [only Jest config and tests](https://github.com/maximivanov/azure-function-http-typescript-jest-quickstart/compare/function-app-without-tests...main)
Below is a step by step guide on how to add Jest tests to an existing Azure function.**`</TLDR>`**

When I first started using Azure a few months ago I was surprised with how little information there was online, compared to the abundance of resources for AWS.

With AWS whenever you have a question chances are high someone on the Internet already had a similar problem. With Azure I found myself resolving roadblocks by trial and error again and again.

This post should provide you with enough information to start unit testing your HTTP-triggered TypeScript functions with Jest.

## Function under test

We won't go into the details of creating and running a function app locally, if you need some help with that I suggest checking the [official quickstart](https://docs.microsoft.com/en-us/azure/azure-functions/create-first-function-cli-typescript?tabs=azure-cli%2Cbrowser).

To start, we have a HTTP-triggered function called `testable-http-triggered-function` which accepts GET requests and expects a single parameter `ip`.

It will fetch the information about that IP from the [IpInfo public API](https://ipinfo.io/) and return a JSON with a single field - the city of the IP:

```bash
$ curl -XGET 'http://localhost:7071/api/testable-http-triggered-function?ip=161.185.160.93'
{"city":"New York City"}
```

We don't want to bring side effects of network calls into our tests so we will mock the API call.

Let's check the function code quickly.

An entry point for the Function App runtime. It verifies the IP query parameter is set, makes the IpInfo API call, and returns the city as a response.

```typescript
// testable-http-triggered-function/index.ts

import { AzureFunction, Context } from '@azure/functions'
import { getIpInfo } from './ipinfo'
import { responseFactory, FunctionResponse } from './util/responseFactory'

const httpTrigger: AzureFunction = async function (
  context: Context,
): Promise<FunctionResponse> {
  const ip = context.req.query.ip
  if (!ip) {
    return responseFactory({ code: 'inputValidationFailed' }, 400)
  }

  const ipInfo = await getIpInfo(ip)

  return responseFactory({ city: ipInfo.city })
}

export default httpTrigger
```

Wrapper for the IpInfo fetching code. It also defines the interface of what the external API response looks like.

```typescript
// testable-http-triggered-function/ipinfo.ts

import fetch from 'node-fetch'

interface IpInfoResponse {
  ip: string
  city: string
  region: string
  country: string
  loc: string
  postal: string
  timezone: string
  readme: string
}

export async function getIpInfo(ip: string): Promise<IpInfoResponse> {
  const url = `https://ipinfo.io/${ip}/geo`

  const res = await fetch(url)
  const json = res.json()

  return json
}
```

Utility function to standardize the function response format.

```typescript
// testable-http-triggered-function/utils/responseFactory.ts

export interface FunctionResponse {
  statusCode: number
  body: string
  headers: Record<string, string>
}

export function responseFactory(body: any, httpCode = 200): FunctionResponse {
  return {
    statusCode: httpCode,
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  }
}
```

## Tests

We will install and configure Jest first.

Then we will add tests for the successful and error scenarios.

### Install and configure Jest

We install Jest itself, its typings, and `ts-jest` to be able to execute tests in TypeScript, without compiling to Javascript first.

```bash
npm i --save-dev jest @types/jest ts-jest
```

Azure function handler expects `context` object passed as the first parameter. It encapsulates request and response objects as well as information about function bindings. Normally it's prepared by the Azure runtime but in tests, we need to craft it ourselves. There are a lot of nested objects and duplicated bits of data in the `context` object so assembling it manually can be tedious. Luckily there's a carefully made [stub-azure-function-context](https://github.com/willmorgan/stub-azure-function-context) module which helps with stubbing the context.

```bash
npm i --save-dev stub-azure-function-context
```

Next, create `jest.config.js` in the root folder. It will tell Jest to use `ts-jest` to compile TypeScript test files.

```js
// jest.config.js

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
}
```

Finally, add a new script to run Jest:

```json
// package.json

"scripts": {
  ...
  "test": "jest --verbose"
}
```

### Add tests

**1\. Test for the input validation error scenario**

Let's add our first test to verify our function responds with a correct error code when the `ip` query parameter is missing.

The test itself should be trivial, `mockedRequestFactory` deserves a comment though. It may look scary but what it does is it configures the bindings in the same way the function expects them to be. If you check the function configuration at `testable-http-triggered-function/function.json` you will see it mostly matches the mocked request. A notable addition is the `createHttpTrigger` call - it's what defines the mocked request: hostname, path, parameters, headers, etc.

Here, we only care about the `ip` query parameter since it will be different among tests, thus we make it configurable.

```typescript
// testable-http-triggered-function/__tests__/index.test.ts

import httpTrigger from '../index'
import {
  runStubFunctionFromBindings,
  createHttpTrigger,
} from 'stub-azure-function-context'

describe('azure function handler', () => {
  it('fails on missing ip parameter', async () => {
    const res = await mockedRequestFactory('')

    expect(res.statusCode).toEqual(400)

    const body = JSON.parse(res.body)
    expect(body.code).toEqual('inputValidationFailed')
  })
})

async function mockedRequestFactory(ip: string) {
  return runStubFunctionFromBindings(
    httpTrigger,
    [
      {
        type: 'httpTrigger',
        name: 'req',
        direction: 'in',
        data: createHttpTrigger(
          'GET',
          'http://example.com',
          {},
          {},
          undefined,
          { ip },
        ),
      },
      { type: 'http', name: '$return', direction: 'out' },
    ],
    new Date(),
  )
}
```

Let's make sure it passes. Fire `npm run test`:

```bash
> jest --verbose

 PASS  testable-http-triggered-function/__tests__/index.test.ts
  azure function handler
    ✓ fails on missing ip parameter (7 ms)
```

**2\. Test for the success scenario**

Let's add a test where we pass the `ip` query parameter which triggers the branch of code where the external API is called.

We need to mock the actual network request, that is when `fetch()` is being called in our code. For that, we mock the `node-fetch` module.

```typescript
// testable-http-triggered-function/__tests__/index.test.ts

...
import fetch from 'node-fetch'
import { Response } from 'node-fetch'

jest.mock('node-fetch')
```

Let's add the test. We tell the mocked `fetch` to resolve with a given city response and call our function under test.
We verify the response HTTP code and body as well as make sure our mock was called once with the IP we provided.

```typescript
// testable-http-triggered-function/__tests__/index.test.ts

...
it('returns city', async () => {
  const ip = '127.0.0.1'
  const city = 'Los Angeles'

  const mock = (fetch as unknown) as jest.Mock
  mock.mockResolvedValue(new Response(JSON.stringify({ city })))

  const res = await mockedRequestFactory(ip)

  expect(res.statusCode).toEqual(200)

  const body = JSON.parse(res.body)
  expect(body.city).toEqual(city)

  expect(mock).toHaveBeenCalledTimes(1)
  expect(mock).toHaveBeenCalledWith(`https://ipinfo.io/${ip}/geo`)
})
```

Let's run the tests again...

```bash
> jest --verbose

 FAIL  testable-http-triggered-function/__tests__/index.test.ts
  azure function handler
    ✓ fails on missing ip parameter (9 ms)
    ✕ returns city (4 ms)

  ● azure function handler › returns city

    TypeError: res.json is not a function

      16 |
      17 |   const res = await fetch(url)
    > 18 |   const json = res.json()
```

How come `res.json` is not a function? We've mocked the entire `node-fetch` module, `Response` class included and the method is no longer there. What we want in this case is the `Response` object to be the real implementation, not a mock.

```typescript
// testable-http-triggered-function/__tests__/index.test.ts

// remove this
// import { Response } from 'node-fetch'

// and add this
const { Response } = jest.requireActual('node-fetch')
```

Running our tests again:

```bash
> jest --verbose

 PASS  testable-http-triggered-function/__tests__/index.test.ts
  azure function handler
    ✓ fails on missing ip parameter (6 ms)
    ✓ returns city (14 ms)
```

Great! We've covered a basic Azure function with unit tests. Hopefully, that gives you an idea of how to implement Jest tests for your functions.
