---
title: Add Docker container name to shell prompt
description: Don't confuse multiple terminal windows when running sh/bash/zsh in Docker containers.
image: /posts/2021/01/add-docker-container-name-to-shell-prompt/cover.png
date: 2021-01-21
tags:
  - Docker
  - Shell
  - Productivity
---

If you run multiple Docker container with interactive shells (sh, bash, zsh) in them, it always take a moment to distinguish one terminal window from the other.

It may help if you could see the docker container name right in the shell prompt. 
Below, `cognito-jwt-verifier` and `azure-functions-apim-aad-auth` are the names of 2 containers I'm running at the moment:

![Show Docker container name in shell prompt](/posts/2021/01/add-docker-container-name-to-shell-prompt/intro-preview.webp)

Here's how to do it for popular shells, via instructions in Dockerfile or alternatively by passing arguments to the `docker run` command.

## Prerequisites

You will only need Docker installed on your host machine to follow along.

I will be using the tiny `alpine` Linux as the base image in dockerfiles below.

## Formatting prompt: PS1 environment variable

To show the container name in the prompt, it is added to the `PS1` environment variable which is recognized by the shell to format the prompt.

Let's check an example format I'll be using below:

`PS1="🐳 \e[0;34m$DOCKER_CONTAINER_NAME\e[0m \w # "`

Format deconstructed:

`🐳` - add a bit of touch with the whale emoji
`\e[0;34m` - start coloring. `34` is the [color code](https://misc.flogisoft.com/bash/tip_colors_and_formatting#foreground_text) for blue
`$DOCKER_CONTAINER_NAME` - container name
`\e[0m` - reset color
`\w #` - add current path (`\w`) and `#` as a separator


## Passing Docker container name

There's no way to obtain the container's name from within the container (at least I couldn't find any) so it has to be passed from the host machine when the container is started.

You can pass the entire `PS1` variable as an argument to the `docker run ...` but that may look ugly.
Another way is to set the `PS1` variable in the Dockerfile and only pass the container name as an environment variable when the container is started.

## Pass PS1 with docker run

In its simplest form, starting a container with prompt modified looks like this:

```bash
docker run -it --rm -e PS1="🐳 \e[0;34mMY_CONTAINER_NAME\e[0m \w # " --name MY_CONTAINER_NAME alpine sh
```

![Pass PS1 environment variable with docker run](/posts/2021/01/add-docker-container-name-to-shell-prompt/docker-run-ps1.webp)


Command breakdown:

`docker run` - start a new container from existing image
`-it` - run container in interactive mode so that we can use the shell
`--rm` - remove the container after exit
`-e PS1="🐳 \e[0;34mMY_CONTAINER_NAME\e[0m \w # "` - pass the `PS1` environment variable
`--name MY_CONTAINER_NAME` - container name which you can see with `docker ps`
`alpine` - name of the Docker image to start the container from
`sh` - command to run in the container

_Note: zsh uses slightly different syntax, which we will see below._

## Configure PS1 in Dockerfile

Instructions will be a bit different per shell used.

### sh

```dockerfile
FROM alpine:latest

RUN echo 'export PS1="🐳 \e[0;34m$DOCKER_CONTAINER_NAME\e[0m \w # "' > ~/.profile

CMD [ "sh", "-l" ]
```

Usage:

```bash
docker build -t docker-name-in-sh - < Dockerfile-sh
docker run -it --rm -e DOCKER_CONTAINER_NAME=MY_CONTAINER_NAME --name MY_CONTAINER_NAME docker-name-in-sh
```

![sh shell with docker](/posts/2021/01/add-docker-container-name-to-shell-prompt/sh.webp)

### bash

```dockerfile
FROM alpine:latest

RUN apk add --no-cache bash
RUN echo 'export PS1="🐳 \e[0;34m$DOCKER_CONTAINER_NAME\e[0m \w # "' > ~/.profile

CMD [ "bash", "-l"]
```

Usage:

```bash
docker build -t docker-name-in-bash - < Dockerfile-bash
docker run -it --rm -e DOCKER_CONTAINER_NAME=MY_CONTAINER_NAME --name MY_CONTAINER_NAME docker-name-in-bash
```

![bash shell with docker](/posts/2021/01/add-docker-container-name-to-shell-prompt/bash.webp)

### zsh

```dockerfile
FROM alpine:latest

RUN apk add --no-cache zsh
RUN echo 'export PS1="🐳 %F{blue}$DOCKER_CONTAINER_NAME%f %~ # "' > ~/.zshrc

CMD [ "zsh"]
```

Usage:

```bash
docker build -t docker-name-in-zsh - < Dockerfile-zsh
docker run -it --rm -e DOCKER_CONTAINER_NAME=MY_CONTAINER_NAME --name MY_CONTAINER_NAME docker-name-in-zsh
```

![zsh shell with docker](/posts/2021/01/add-docker-container-name-to-shell-prompt/zsh.webp)

If you want to level up your zsh shell experience, consider installing [oh-my-zsh](https://github.com/ohmyzsh/ohmyzsh) and try one of the many available themes. 

Personally I like the [powerlevel10k](https://github.com/romkatv/powerlevel10k#manual) theme. It's that theme that is used on the very first screenshot above.

## ...

I think little enhancements to the process like this can make our day-to-day work more enjoyable.

One of the great things about Docker is that containers are disposable so it's very easy to experiment. 

I encourage you to challenge your setup from time to time and find ways to improve it. Then please share it with the community!