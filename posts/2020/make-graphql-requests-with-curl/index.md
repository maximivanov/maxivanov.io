---
title: Make GraphQL requests from command line with curl
description: Example curl requests to make GraphQL queries and mutations.
date: 2020-11-26
updateDate: 2021-02-09
tags:
  - GraphQL
  - curl
---

**`<TLDR>`** Use curl to make GraphQL queries and mutations in remote shells and to troubleshoot request problems **`</TLDR>`**

Do you know and use all of the best-for-the-job tools available to us developers? I certainly don't! I'm trying to stay up to date with multiple mailing lists, blog posts, tweets and press releases. I'm sure you know that feeling of drinking from a firehose. And I must admit, until mysterious pills from the Limitless movie become available, I might be missing some great advice.

But if I come across some useful tool or technique I'll try to add it to my toolbelt. If you mostly work with Postman and GraphQL Playground and use terminal mainly to run `npm install`, you may want to know a bit about curl, command line tool for making http requests.

![curl-graphql-query](/posts/2020/make-graphql-requests-with-curl/curl-graphql-query.webp)

## GraphQL, curl... what, why?

There's a very specific use case for that. Imagine you're a frontend developer. You're working with a GraphQL API developed by your team. Suddenly you're getting an error message and you have no idea what's happening. So you open Slack and dm your colleague Tim (sorry Tim you will be the one responsible today):

**You:** hey Tim! I have an issue with a GraphQL request in the dev environment. Is the API up and running?
**Tim:** yes it is. what's the query that's failing?
**You:** _copy pasting the query_
**Tim:** that looks good to me... let me try from my machine...
**Tim:** yep it works just fine. What endpoint url are you using?
**You:** dev-server.mycompany.com/graphql
**Tim:** right. weird...
**Tim:** oh, did you not forget to send the auth token in the Authorization header?
**You:** let me check... yes it's there
... another 5 minutes of Q and A
**Tim:** hey, do you remember we announced dev API requires HTTPS connection now? Are you connecting with http or https?
**You:** oops. Thanks Tim.

I can imagine an issue like this can easily take 10 minutes of your and Tim's time. Wouldn't it be easier if you could send Tim the full request with all the context right away?

**You:** hey Tim! I have an issue with a GraphQL request in the dev environment. Here's the curl version of it.
**You:** _copy pasting curl call_
**Tim:** Let me see... OK it's correct except for one thing - the url must be with https and not http.
**You:** oops. Thanks Tim.

To summarize, in the context we discuss here, curl can be useful when

- you need to make a request from a **shell session on another server** (I recently used it to test API response latency from VMs in different geographic locations)
- you need a way to send / post online an **easily reproducible request** (troubleshooting API issues with your team or asking questions on StackOverflow)

## Example requests

Below are some typical request variations.

### Make a GraphQL query request

```bash
curl 'https://countries.trevorblades.com/' \
  -X POST \
  -H 'content-type: application/json' \
  --data '{
    "query": "{ continents { code name } }"
  }'
```

### Make a mutation request

```bash
curl 'https://graphql-api-url' \
  -X POST \
  -H 'content-type: application/json' \
  --data '{
    "query":"mutation { createUser(name: \"John Doe\") }"
  }'
```

### Pass additional headers

If you need to pass authorization in a header, add another `-H` argument:

```bash
curl 'https://countries.trevorblades.com/' \
  -X POST \
  -H 'Authorization: Token xxxxx' \
  -H 'content-type: application/json' \
  --data '{
    "query": "{ continents { code name } }"
  }'
```

### Printing response headers

If you want to see response headers, add `-D -` (dump headers to stdout):

```bash
curl 'https://countries.trevorblades.com/' \
  -X POST \
  -D - \
  -H 'content-type: application/json' \
  --data '{
    "query": "{ continents { code name } }"
  }'
```

### Pretty printing response JSON

If you want to pretty print the output JSON, add `| python -m json.tool` in the end of the curl call.

```bash
curl 'https://countries.trevorblades.com/' \
  -X POST \
  -H 'content-type: application/json' \
  --data '{
    "query": "{ continents { code name } }"
  }' | python -m json.tool
```

Note pretty printing won't work if you also print headers, the error will be `No JSON object could be decoded`. That makes sense because, well, that's not a valid JSON anymore.
You may also see a progress bar appearing when you run the command, you can get rid of it with an extra `-sS` (silent) argument.

That's it for today. Thanks for assistance Tim!
