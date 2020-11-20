const { DateTime } = require('luxon')
const fs = require('fs')
const pluginRss = require('@11ty/eleventy-plugin-rss')
const pluginSyntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight')
const markdownIt = require('markdown-it')
const markdownItAnchor = require('markdown-it-anchor')
const readingTime = require('eleventy-plugin-reading-time')

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(pluginRss)
  eleventyConfig.addPlugin(pluginSyntaxHighlight)
  eleventyConfig.addPlugin(readingTime)

  eleventyConfig.setDataDeepMerge(true)

  eleventyConfig.addFilter('readableDate', (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: 'utc' }).toFormat('LLL d, yyyy')
  })

  eleventyConfig.addFilter('monthAndDay', (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: 'utc' }).toFormat('LLLL d')
  })

  eleventyConfig.addFilter('getYear', (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: 'utc' }).toFormat('yyyy')
  })

  // https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#valid-date-string
  eleventyConfig.addFilter('htmlDateString', (dateObj) => {
    return DateTime.fromJSDate(dateObj, { zone: 'utc' }).toFormat('yyyy-LL-dd')
  })

  // Get the first `n` elements of a collection.
  eleventyConfig.addFilter('head', (array, n) => {
    if (n < 0) {
      return array.slice(n)
    }

    return array.slice(0, n)
  })

  eleventyConfig.addFilter('min', (...numbers) => {
    return Math.min.apply(null, numbers)
  })

  eleventyConfig.addCollection('tagList', function (collection) {
    let tagSet = new Set()
    collection.getAll().forEach(function (item) {
      if ('tags' in item.data) {
        let tags = item.data.tags

        tags = tags.filter(function (item) {
          switch (item) {
            // this list should match the `filter` list in tags.njk
            case 'all':
            case 'post':
            case 'posts':
              return false
          }

          return true
        })

        for (const tag of tags) {
          tagSet.add(tag)
        }
      }
    })

    // returning an array in addCollection works in Eleventy 0.5.3
    return [...tagSet]
  })

  eleventyConfig.addPassthroughCopy('img')
  eleventyConfig.addPassthroughCopy('css')
  eleventyConfig.addPassthroughCopy('android-chrome-192x192.png')
  eleventyConfig.addPassthroughCopy('android-chrome-512x512.png')
  eleventyConfig.addPassthroughCopy('apple-touch-icon.png')
  eleventyConfig.addPassthroughCopy('browserconfig.xml')
  eleventyConfig.addPassthroughCopy('favicon-16x16.png')
  eleventyConfig.addPassthroughCopy('favicon-32x32.png')
  eleventyConfig.addPassthroughCopy('favicon.ico')
  eleventyConfig.addPassthroughCopy('mstile-150x150.png')
  eleventyConfig.addPassthroughCopy('site.webmanifest')
  // eleventyConfig.addPassthroughCopy('**/*.jpg')

  /* Markdown Overrides */
  let markdownLibrary = markdownIt({
    html: true,
    breaks: true,
    linkify: true,
  }).use(markdownItAnchor, {
    permalink: true,
    permalinkClass: 'direct-link',
    permalinkSymbol: '#',
  })
  eleventyConfig.setLibrary('md', markdownLibrary)

  // Browsersync Overrides
  eleventyConfig.setBrowserSyncConfig({
    callbacks: {
      ready: function (err, browserSync) {
        const content_404 = fs.readFileSync('_site/404.html')

        browserSync.addMiddleware('*', (req, res) => {
          // Provides the 404 content without redirect.
          res.write(content_404)
          res.end()
        })
      },
    },
    ui: false,
    ghostMode: false,
  })

  return {
    templateFormats: ['md', 'njk', 'html', 'liquid', 'jpg'],

    // If your site lives in a different subdirectory, change this.
    // Leading or trailing slashes are all normalized away, so don’t worry about those.

    // If you don’t have a subdirectory, use "" or "/" (they do the same thing)
    // This is only used for link URLs (it does not affect your file structure)
    // Best paired with the `url` filter: https://www.11ty.dev/docs/filters/url/

    // You can also pass this in on the command line using `--pathprefix`
    // pathPrefix: "/",

    markdownTemplateEngine: 'liquid',
    htmlTemplateEngine: 'njk',
    dataTemplateEngine: 'njk',

    // These are all optional, defaults are shown:
    dir: {
      input: '.',
      includes: '_includes',
      data: '_data',
      output: '_site',
    },
  }
}
