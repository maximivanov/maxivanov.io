---
title: 'Code and security checks in a TypeScript project with Github Actions'
description: Run tests and code quality checks on pull requests in Github.
date: 2020-11-23
tags:
  - Github Actions
  - CI
  - TypeScript
  - Code Quality
  - Testing
  - DevOps
---

**`<TLDR>`** CI pipelines are supported natively in Github Actions. Add a single workflow definition file to your repository and run automated tests, security and code style checks on every pull request. Full code and configuration in the [repo](https://github.com/maximivanov/github-actions-ci-typescript) **`</TLDR>`**

I encourage you to take a moment and appreciate the great time we live and work in.

Imagine what it would take to set up a Continuous Integration pipeline a few years ago. One of the most popular tools to host CI/CD jobs was (is) Jenkins, so you had to do the following at minimum:

- Provision a server and install an OS
- Install Jenkins
- Research and install needed Jenkins plugins
- Configure webhooks to trigger jobs on commits and new PRs and integrate with Git
- Make sure network access to webhooks is restricted to trusted clients only

Once everything is set up, you're not done. In fact, you're never done, because now you need to:

- Patch and upgrade the OS and software
- Patch and upgrade Jenkins and its plugins
- Deal with server hardware failures
- Monitor CPU, memory and disk usage to make sure the server is neither under- nor overutilized

Honestly, with such an investment required not every project's budget allowed for CI/CD workflows.

## What about now?

Thanks to the modern technology offered by cloud providers, serverless platforms and powerful tooling we can build and launch new products/projects in a matter of days and weeks.

**What hasn't changed is the requirement for the code to be performant, secure, bug-free, and consistently styled.**

If you're hosting your private or open source repositories on Github, you can build CI pipelines with Github Actions.
Every time you commit a change or make a pull request, Github will start a CI workflow consisting of jobs (checks) you defined.
Each job would do some useful task (run tests, perform code style check, etc) and report back the result.

Additionally to checking the changes in the code, PR reviewer will consult the output of the CI server before merging the code.

![successful workflow](/posts/2020/code-and-security-checks-in-a-typescript-project-with-github-actions/workflow-success.png)

Github Actions is free for public repositories and it has generous free tier for private repos. Details [here](https://docs.github.com/en/free-pro-team@latest/github/setting-up-and-managing-billing-and-payments-on-github/about-billing-for-github-actions).

## Real-world Github CI workflow

Let's create a CI workflow which will run multiple checks on every pull request created.

Specifically, we want workflow to perform these tasks:

- Run ESLint and TypeScript compiler to validate code syntax and formatting
- Run unit tests with Jest
- Run security check to make sure there are no known vulnerabilities in the dependencies used in the project
- Run spell check on documentation

As you can tell all of these checks apply to both backend and frontend projects.

Github expects workflow definitions to be under `.github/workflows` folder. Create a new file there. See the comments in the code below for description of what a respective section does.

```yaml
{% raw %}name: CI

on: [pull_request] # we want the workflow to trigger on commits to PRs only

jobs: # each workflow consists of 1+ jobs; by default, all jobs run in parallel
  lint: # job name
    runs-on: ubuntu-latest # host's operating system
    steps: # each job consists of 1+ steps
      - name: Checkout commit # download the code from triggering commit
        uses: actions/checkout@v2

      - name: Use Node.js
        uses: actions/setup-node@v1
        with:
          node-version: '12.x'

      - name: Cache NPM # leverage npm cache on repeated workflow runs if package.json didn't change
        uses: actions/cache@v1
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-

      - name: Install Dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

  security: # in this and following jobs, only the last step will be different
    runs-on: ubuntu-latest
    steps:
      - name: Checkout commit
        uses: actions/checkout@v2

      - name: Use Node.js
        uses: actions/setup-node@v1
        with:
          node-version: '12.x'

      - name: Cache NPM
        uses: actions/cache@v1
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-

      - name: Install Dependencies
        run: npm ci

      - name: Run security check
        run: npm run audit-security

  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout commit
        uses: actions/checkout@v2

      - name: Use Node.js
        uses: actions/setup-node@v1
        with:
          node-version: '12.x'

      - name: Cache NPM
        uses: actions/cache@v1
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-

      - name: Install Dependencies
        run: npm ci

      - name: Run tests
        run: npm run test

  copy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout commit
        uses: actions/checkout@v2

      - name: Use Node.js
        uses: actions/setup-node@v1
        with:
          node-version: '12.x'

      - name: Cache NPM
        uses: actions/cache@v1
        with:
          path: ~/.npm
          key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-

      - name: Install Dependencies
        run: npm ci

      - name: Run copy checks
        run: npm run check-copy
{% endraw %}
```

It's not really optimal in terms of step code duplication, but currently there's no way around it if we want jobs to report as separate items on the PR page. Workflow code sharing is a highly [awaited](https://github.community/t/reusing-sharing-inheriting-steps-between-jobs-declarations/16851/14) feature.

And here are the scripts referenced in the the workflow. Note some commands are grouped into a single call with `npm-run-all` package.

```json
  "scripts": {
    "lint:eslint": "eslint \"**/*.{ts,tsx}\" --max-warnings=0",
    "lint:tsc": "tsc --noemit",
    "lint:markdown": "markdownlint *.md",
    "lint": "run-p lint:*",
    "audit-security": "audit-ci --config ./audit-ci.json",
    "test": "jest --verbose",
    "check-copy:cspell": "cspell --config=.cspell.json **/*.md",
    "check-copy:language": "write-good *.md --no-passive",
    "check-copy": "run-p check-copy:*"
  },
```

And that's it! Commit and push workflow yml file to Git. Next time you create a pull request, it will run the workflow on commits from that PR. You may want to extend the list of checks. In practice anything you can run on the CI server or in a docker container, or by making a HTTP request can be a part of CI workflow. You may want to:

- Run functional tests with Cypress
- Run code coverage check and fail the build if percentage is below configured threshold value
- Run visual regression tests (via image overlays)
- Run [Lighthouse audit](https://github.com/GoogleChrome/lighthouse-ci)

You can find the code and configuration files in the [repo](https://github.com/maximivanov/github-actions-ci-typescript). Check the PR page, it has examples of pull requests failing on different checks.
