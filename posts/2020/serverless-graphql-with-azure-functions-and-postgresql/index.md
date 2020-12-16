---
title: Serverless GraphQL with Azure Functions and PostgreSQL
description: Starter kit + guide for a Serverless GraphQL API backed by PostgreSQL and external APIs with migrations, infrastructure-as-code, CI and tests.
image: /posts/2020/serverless-graphql-with-azure-functions-and-postgresql/cover.png
date: 2020-12-16
tags:
  - Azure
  - Azure Functions
  - TypeScript
  - PostgreSQL
  - GraphQL
  - Jest
---

**`<TLDR>`** Starter kit + guide for a Serverless GraphQL API on top of PostgreSQL and external APIs; with migrations, infrastructure-as-code, CI and tests. [Github repo with code](https://github.com/maximivanov/azure-function-graphql-typescript-starter). **`</TLDR>`**

GraphQL and Serverless became big trends in the last few years. Let's see how we can combine them!

The stack idea evolved on what was originally inspired by Ben Awad's comprehensive [Fullstack React GraphQL TypeScript Tutorial](https://github.com/benawad/lireddit) - check it out.

**TOC**

- [How to use this](#how-to-use-this)
- [What we will build](#what-we-will-build)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Entities](#entities)
- [Migrations](#migrations)
- [Local resolvers](#local-resolvers)
- [Remote resolvers](#remote-resolvers)
- [Tests](#tests)
- [Running locally](#running-locally)
- [CI](#ci)
- [Deploy infrastructure](#deploy-infrastructure)
- [Deploy code](#deploy-code)
- [Cleanup](#cleanup)

## How to use this

You can clone the repository and run the server locally. With an Azure account, you can deploy it to the cloud as well. From there you can extend it by adding new models, resolvers and tests.

This post is quite big. You can read it in its entirety or bookmark and refer to individual sections when you need to.
To not make it a huge monster some components were implemented in a minimal fashion. I will add notes along the way with suggestions on how to improve those.

## What we will build

![serverless-graphql](/posts/2020/serverless-graphql-with-azure-functions-and-postgresql/serverless-graphql.webp)

We'll build a GraphQL server that can fetch and store data in a database as well as integrate with external APIs.
We will define infrastructure as code and deploy everything to Azure with couple shell commands.
To ensure the quality and correctness of code we will add Jest tests and a Continuous Integration workflow.

## Tech stack

- Azure Functions as Serverless compute environment
- Node.js as execution runtime
- TypeScript
- PostgreSQL as persistence layer\*
- Apollo Server for base GraphQL functionality
- TypeGraphQL to make developing GraphQL APIs simple and fun
- TypeORM for database migrations and handy DB abstractions (Repository pattern)
- Docker for local development
- Jest to test our function
- Github Actions for CI workflow
- Terraform for cloud infrastructure management

\* _In this starter kit we will deploy a managed PostgreSQL instance in Azure. It means you don't need to worry about the hardware and OS it runs on, or apply patches or make manual backups. It's not really a serverless offering though since it doesn't scale with the load automatically. You will need to scale up to a bigger instance manually if required._

## Prerequisites

In order to develop the server locally you will need:

- Node.js 12+. It may very well work with earlier versions but I targeted the latest version supported by Azure at the moment
- Docker to start a Postgres server locally
- [Azure Functions Core Tools v3](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local?tabs=macos%2Ccsharp%2Cbash#v2) to run and deploy Functions code

To deploy infrastructure to Azure you will also need

- Azure account. You can [start for free](https://azure.microsoft.com/en-us/free/)
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli) 2.4+. You must be [logged in](https://docs.microsoft.com/en-us/cli/azure/authenticate-azure-cli#sign-in-interactively) to the CLI
- [Terraform](https://www.terraform.io/downloads.html) to manage infrastructure in the cloud

## Local setup

Clone the [Github repo](https://github.com/maximivanov/azure-function-graphql-typescript-starter).

Copy `.env.example` file to `.env`.

Define database connection details as environment variables in `.env` file (change the port if you already have another Postgres instance running on 5432).

Start a local Postgres instance:

```bash
docker-compose up -d
```

Install npm dependencies:

```bash
npm i
```

Run migrations (see below):

```bash
npm run migrations:run
```

## Entities

Create your entities and define GraphqQL- and persistence-specific bits with Typescript decorators.

[Entities in TypeGraphQL](https://typegraphql.com/docs/types-and-fields.html) | [Entities in TypeORM](https://typeorm.io/#/entities)

Starter kit includes an entity to begin with, a good old Post:

```typescript
// graphql/entities/Post.ts

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm'
import { ObjectType, Field } from 'type-graphql'

@ObjectType()
@Entity({ name: 'posts' })
export class Post {
  @Field(() => Int) // @Field decorator is to declare a property as a GraphQL-enabled field
  @PrimaryGeneratedColumn() // @*Column is to define database schema properties
  id: number

  @Field()
  @Column()
  title: string

  @Field()
  @Column()
  description: string

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date
}
```

## Migrations

Whenever you create new or update an existing entity, generate a migration file with SQL queries needed to take your database structure from its current state to the new state (as defined by updated entities).
This way you can track and apply changes to the database consistently across all environments.

[TypeORM Migrations](https://typeorm.io/#/migrations)

To generate a migration:

```bash
npm run migrations:generate -- 'your-migration-name'
```

If you didn't make any changes in the code, you don't need to run it for now.
Starter code already has a migration included which creates a table for the Post entity:

```typescript
// graphql/migrations/1604267700406-posts.ts

import { MigrationInterface, QueryRunner } from 'typeorm'

export class posts1604267700406 implements MigrationInterface {
  name = 'posts1604267700406'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "posts" ( "id" SERIAL NOT NULL, "title" character varying NOT NULL, "description" character varying NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_2829ac61eff60fcec60d7274b9e" PRIMARY KEY ("id") )`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "posts"`)
  }
}
```

Review your migration at `graphql/migrations/xxxx-your-migration-name.ts` and run it:

```bash
npm run migrations:run
```

![npm-run-migrations](/posts/2020/serverless-graphql-with-azure-functions-and-postgresql/npm-run-migrations.webp)

## Local Resolvers

Create resolvers supporting the logic of your application.
Get inputs from a request, do the processing and database fetches/updates and return some data.

[Resolvers in TypeGraphQL](https://typegraphql.com/docs/resolvers.html)

Starter kit has a resolver which implements basic CRUD operations on our Post model:

```typescript
// graphql/resolvers/PostResolver.ts

import { Arg, Ctx, Int, Mutation, Query, Resolver } from 'type-graphql'
import { Post } from '../entities/Post'
import { AppContext } from '../util/azure'

@Resolver()
export class PostResolver {
  @Mutation(() => Post) // it's a mutation that returns a Post object
  // name of the mutation (as seen in GraphQL schema)
  async createPost(
    @Arg('title') title: string, // it accepts 2 arguments, both are required
    @Arg('description') description: string,
    @Ctx() { conn }: AppContext,
  ): Promise<Post> {
    const repo = conn.getRepository(Post)

    const post = repo.create()
    post.title = title
    post.description = description

    await repo.save(post)

    return post
  }

  @Query(() => [Post])
  async posts(@Ctx() { conn }: AppContext): Promise<Post[]> {
    return conn.getRepository(Post).find()
  }

  @Query(() => Post, { nullable: true })
  async post(
    @Arg('id', () => Int) id: number, // generally TypeGraphQL can infer types but here we tell explicitly it's Int and not Float
    @Ctx() ctx: AppContext,
  ): Promise<Post | undefined> {
    return ctx.conn.getRepository(Post).findOne(id)
  }

  @Mutation(() => Boolean)
  async deletePost(
    @Arg('id', () => Int) id: number,
    @Ctx() { conn }: AppContext,
  ): Promise<boolean> {
    const repo = conn.getRepository(Post)
    await repo.delete({ id })

    return true
  }
}
```

## Remote resolvers

You may want to keep your GraphQL server as a thin layer proxying requests to other APIs:

- other Azure Functions (microservice architecture)
- existing REST APIs in your organization
- 3rd party APIs

Here's an example integration with 3rd party GeoIP API which will return the city of a given IP address:

```typescript
// graphql/resolvers/IpCityResolver.ts

import { Arg, Query, Resolver } from 'type-graphql'
import { getIpInfo } from '../util/ipinfo'

@Resolver()
export class IpCityResolver {
  @Query(() => String)
  async ipCity(@Arg('ip') ip: string): Promise<string> {
    const ipInfo = await getIpInfo(ip)

    return ipInfo.city
  }
}
```

## Tests

I have a blog post on [how to test azure functions](https://www.maxivanov.io/unit-testing-azure-function-with-jest-typescript/) but here's a quick example of testing a resolver endpoint.

```typescript
// graphql/__tests__/integration/PostResolver.test.ts

it('creates post', async () => {
  const title = 'My first post'
  const description = 'Summary of the post'

  const res = await invokeFunction(
    functionUnderTest,
    functionConfig,
    `mutation {
      createPost(title: "${title}", description: "${description}") {
        id
        title
      }
    }`,
  )

  const db = await getConnection()
  const post = await db.getRepository(Post).findOne()

  expect(post).toBeTruthy()
  expect(post!.title).toEqual(title)
  expect(post!.description).toEqual(description)

  expect(res.status).toEqual(200)
  expect(res.headers['Content-Type']).toEqual('application/json')

  const body = JSON.parse(res.body)
  expect(body.data.createPost.id).toEqual(post!.id)
  expect(body.data.createPost.title).toEqual(title)
})
```

Run the tests with

```bash
npm run test
```

![npm-run-test](/posts/2020/serverless-graphql-with-azure-functions-and-postgresql/npm-run-test.webp)

## Running locally

Start your application:

```bash
npm run start
```

It will start a local Azure Functions emulator (check the console output for some useful debugging information).
It will also watch for changes in your Typescript files and reload the server automatically.

![npm-run-start](/posts/2020/serverless-graphql-with-azure-functions-and-postgresql/npm-run-start.webp)

Alternatively you can run/debug the function in VS Code, for that you need to install [Azure Functions for Visual Studio Code](https://github.com/Microsoft/vscode-azurefunctions).

Let's make some requests to verify the server is working correctly.

You can either use a built-in GraphQL Playground (http://localhost:7071/graphql):

![graphql-playground](/posts/2020/serverless-graphql-with-azure-functions-and-postgresql/graphql-playground.webp)

Or use command line `curl`:

```bash
# Create new post
 ~ $ curl 'http://localhost:7071/graphql' \
  -H 'content-type: application/json' \
  --data '{"query":"mutation { createPost(title: \"My first post\", description: \"Lorem ipsum\") { id title } }"}'

{"data":{"createPost":{"id":1,"title":"My first post"}}}

# Get all posts
 ~ $ curl 'http://localhost:7071/graphql' \
  -H "Content-Type: application/json" \
  --data '{ "query": "{ posts { id title } }" }'

{"data":{"posts":[{"id":1,"title":"My first post"}]}}
```

More examples in [How to make GrapqhQL requests with curl](https://www.maxivanov.io/make-graphql-requests-with-curl/).

## CI

On every pull request made on the repo we want a number of checks to run to make sure:

- There are no syntax errors in the code
- Code is formatted and styled according to the standard adopted by the team
- Tests pass
- There are no known vulnerabilities in the packages used in the project

I find Github Actions to be the easiest way to add a CI pipeline to the project.
All you need to do is drop a single workflow definition file in the `.github` folder and it will be picked by Github automatically.

Mode details on this topic in [Code quality and security checks in TS projects with Github Actions](https://www.maxivanov.io/code-and-security-checks-in-typescript-projects-with-github-actions/).

## Deploy infrastructure

I love how quickly you can log in to a cloud provider's UI and create a few resources for some random test.
But this way of infrastructure management is neither scalable nor reproducible. Unless I know this is a one-time experiment I'd prefer to define the resources with Infrastructure-as-Code. Terraform is my tool of choice for IaC.

To keep the post short (not sure I suceed with this 😅) I won't include the TF template here, you can find it in the starter kit repo. Also [How to deploy Azure Functions with Terraform](https://www.maxivanov.io/deploy-azure-functions-with-terraform/) goes in more detail on the topic.

If DevOps and cloud resource management is not your thing, just know it contains definitions of a few resources in the cloud needed to run our GraphQL server:

- Azure Resource Group
- Storage Account
- Function App with application settings containing database details among others
- PostgreSQL server

Deployed PostgreSQL server allows connections from Azure IPs only via a firewall rule. This is a quick way to add some protection to the database, but a better way is to place your function app in a VNet and enable service endpoint on it ([learn more](https://docs.microsoft.com/en-us/azure/postgresql/howto-manage-vnet-using-portal)).

Before running Terraform scripts, change project name in `.terraform/terraform.tfvars` to avoid cloud resource name collision (resource names must be unique across Azure).

To execute the Terraform template, run the following:

```bash
# all terraform ... commands must be executed in the .terraform directory, where the .tf files are
terraform init
terraform apply -var postgresql_password=dljk32j23lk_sa # we don't want to commit secrets to git
```

Make sure to remove cloud resources (see below) when you no longer need them to not incur unnecessary costs.

There's so much more to Terraform, like storing the state on remote machines and keeping the code DRY. But that's definitely out of scope of this tutorial.

## Deploy code

To deploy code we will use Azure Functions Core Tools (same piece of software that is used to run functions locally).

It will upload the code for your server into the Function App created in the previous step.
Important thing to note here is the `.funcignore` file - it lists all of the files to be excluded from uploading to the serverless function.

You should deploy only what's necessary as bigger functions may result in [slower cold starts](https://mikhail.io/serverless/coldstarts/azure/#does-package-size-matter) when they're invoked for the first time or after a period of inactivity.

You may also want to exclude dev dependencies from your `node_modules` before code upload. There's a `npm run build:production` command which will prune non-production modules. It's supposed to be executed in the CI/CD environment. If you run it locally, remember to re-run npm install to restore your dev packages afterwards.

Publish the code. Replace the final argument with your function name (from Terraform outputs):

```bash
# run this in the root folder where the package.json file is
func azure functionapp publish azgraphql-dev-function-app
```

An alternative approach to deploy the code is to have a build and release pipeline on an Integration Server. Again, Github Actions can be useful here or you may want to use [Azure Devops](https://azure.microsoft.com/en-us/services/devops/).

Note the output of the `func publish` - it will have the endpoint of your deployed function. You won't have the GraphQL Playground there so you can run a quick test with curl.

## Cleanup

Delete cloud resources:

```bash
terraform destroy
```

Stop and delete PostgreSQL Docker container and data:

```bash
docker-compose down --volumes
```

## ...

Here you go. That's one of the ways to deploy and run a GraphQL API on a serverless platform. I hope some parts of the starter kit can be useful to you.

If you spot any issue or have an idea of how to improve the code please let me know (in comments, twitter or via email). I'm new to this blogging thing and would appreciate your feedback.
