---
title: Cross-post from your blog to DEV.to (Node.js script)
description: A little helper npm script to automate creating a post at DEV.
date: 2021-02-13
tags:
  - Node.js
  - Productivity
  - Blog
---

[DEV.to](https://dev.to/) is a great place for a technical blog. The website feels lightweight and easy to navigate and the community is welcoming. 
Still, you may want to publish your content under your own domain first which you have full control of. You then may want to cross-post to DEV with a link to the canonical URL.

When I started writing initially my workflow was like this:
- Write a blog post in the comfort of my text editor locally
- Publish to my personal blog
- Cross-post to DEV manually

Last part definitely called for automation. There's a way to *Publish from RSS* but I realized some tweaks had to be made to the content before it could be published on DEV.

Another approach is to use the DEV API. My blog is built with [Eleventy](https://www.11ty.dev/) and I've added a little helper npm script to help with cross-posting. It loads a blog post from the markdown file, publishes a draft at DEV and returns a URL of the draft. There you can make sure it looks alright (occasionally I may need to adjust tags) and hit *Publish*.

Workflow now looks like this:
- Write a blog post in the comfort of my text editor locally
- Publish to my personal blog
- Run `npm run <path-to-md-file>` → follow the draft link to review → *Publish*

If it sounds useful, below is a (beginner-friendly) guide of how to add such script to your own blog.

## Create a DEV API key

In your DEV profile, go to *Settings* → *Account* → *DEV Community API Keys*

Give the key a name (e.g. `publish-to-dev`) and generate it.

Copy the key and put it in the `.env` file in the root of your blog. Make sure this file is listed in `.gitignore` as we don't want secrets to land in a git repository.

*.env*
```text
DEV_TO_API_KEY=your-api-key
```

## npm script to publish to DEV

If not installed, you will need to add these packages to dev dependencies:

```bash
npm i --save-dev dotenv gray-matter node-fetch
```

*You can find the entire script here: https://github.com/maximivanov/maxivanov.io/blob/main/scripts/publish-to-devto.js* 

To start, we load the `.env` file, include dependencies and configure some settings.

*./scripts/publish-to-devto.js*
```js
require('dotenv').config() // make the API key available as an environment variable

const matter = require('gray-matter') // library to parse front-matter and content from posts' markdown files
const fetch = require('node-fetch')

const apiKey = process.env.DEV_TO_API_KEY
const apiUrl = 'https://dev.to/api/articles'
const siteUrl = 'https://www.maxivanov.io' // hostname of the blog
const autoPublish = false // whether we want to publish or create drafts
```

Main body of the script, which fetches the data, sends the API request and prints the draft URL:

*./scripts/publish-to-devto.js*
```js
...

;(async () => {
    const path = process.argv.slice(2)[0] // read file name from command line arguments
    const file = matter.read(path)
    
    const payload = getPayload(file) // get payload to publish to DEV API (see below)
    const article = await publish(payload)

    if (autoPublish) {
        console.log(`Article published: ${article.url}`)
    } else {
        console.log(`Article draft created: ${article.url}/edit`)
    }
})()
```

Function to prepare data to post to the API:

*./scripts/publish-to-devto.js*
```js
...

function getPayload(file) {
    return {
        article: {
            title: file.data.title.trim(),
            // replace relative paths with absolute URLs
            body_markdown: file.content.trim().replace(/\]\(\/posts\//gm, `](${siteUrl}/posts/`),
            published: autoPublish,
            // if you want blog post to be a part of Series on DEV
            series: undefined,
            // cover image URL
            main_image: file.data.image ? `${siteUrl}${file.data.image}` : undefined,
            // generate the canonical url (file name minus .md in my case)
            canonical_url: `${siteUrl}/${file.path.split('/').slice(-2, -1)[0]}`,
            description: file.data.description,
            // DEV allows only 4 tags and they cannot have whitespace in them
            tags: file.data.tags.slice(0, 4).map(tag => tag.toLowerCase().replace(' ', '')),
        }
    }
}
```

And finally a function to publish the prepared payload to the API:

*./scripts/publish-to-devto.js*
```js
...

async function publish(payload) {
    const response = await fetch(apiUrl, {
        method: 'post',
        body: JSON.stringify(payload),
        headers: {'Content-Type': 'application/json', 'api-key': apiKey}
    });
    
    const json = await response.json();

    return json
}
```

Add a new script to the `package.json`:

*./package.json*
```json
{
  ...
  "scripts": {
    ...
    "publish-to-devto": "node ./scripts/publish-to-devto.js"
  }
}
```

And call it from the command line:

```bash
npm run publish-to-devto posts/2021/01/add-docker-container-name-to-shell-prompt.md
```

## ...

Alright! We just got rid of some boring manual work which is always good.