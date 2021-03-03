require('dotenv').config()

const matter = require('gray-matter')
const fetch = require('node-fetch')

const apiKey = process.env.DEV_TO_API_KEY
const apiUrl = 'https://dev.to/api/articles'
const siteUrl = 'https://www.maxivanov.io'
const autoPublish = false

;(async () => {
    const path = process.argv.slice(2)[0]
    const file = matter.read(path)
    
    const payload = getPayload(file)
    const article = await publish(payload)

    if (autoPublish) {
        console.log(`Article published: ${article.url}`)
    } else {
        console.log(`Article draft created: ${article.url}/edit`)
    }
})()

function getPayload(file) {
    return {
        article: {
            title: file.data.title.trim(),
            body_markdown: getBody(file),
            published: autoPublish,
            series: undefined,
            main_image: file.data.image_dev ? `${siteUrl}${file.data.image_dev}` : undefined,
            canonical_url: `${siteUrl}/${file.path.split('/').slice(-2, -1)[0]}`,
            description: file.data.description,
            tags: file.data.tags.slice(0, 4).map(tag => tag.toLowerCase().replace(/[^a-z0-9]/i, '')),
        }
    }
}

function getBody(file) {
    const ending = '*If you like this type of content you can [follow me](https://twitter.com/max_v_i) on Twitter for the latest updates.*'
    const body = file.content.trim().replace(/\]\(\/posts\//gm, `](${siteUrl}/posts/`)
    
    return `${body}\n\n${ending}`
}

async function publish(payload) {
    const response = await fetch(apiUrl, {
        method: 'post',
        body: JSON.stringify(payload),
        headers: {'Content-Type': 'application/json', 'api-key': apiKey}
    });
    
    const json = await response.json();
    if (json.error) {
        throw new Error(`API returned an error: ${json.error}`)
    }

    return json
}
