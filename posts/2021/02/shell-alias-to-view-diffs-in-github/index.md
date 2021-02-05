---
title: Shell alias to view diffs in Github
description: Quickly open a page in Github to compare branches and commits.
date: 2021-01-29
tags:
  - Git
  - Github
  - Productivity
  - Shell
---

You're viewing a project's code on your machine, and the code is hosted in Github. Imagine couple scenarios: 

1. You stumble upon a branch you don't recognize. You want to see how does this branch differ from the primary `main` branch.
2. You're about to merge a branch into your `main` branch without making a pull request. Once again you want to see the changes before merging.

The answer to both scenarios is `git diff`. 
I'm not sure about you, but I find viewing larger diffs (even colored ones) in terminal somewhat cumbersome.
There are GUI tools, like what we have in VSCode, but it takes time to click through menus to get to the correct screen and find relevant branches so it never sticked with me.

What I find awesome for viewing diffs is Github Compare page. 

![Github compare page](/posts/2021/02/shell-alias-to-view-diffs-in-github/compare-page.webp)

It's familiar, well organized and useful. Whenever I can, I prefer to view my git diffs there.
Crafting a url to get to the compare page is boring though.

Below is a quick tip on how to add a console alias to open the Github diff page to see changes between 2 branches or commits:

```bash
ghcmp main my-feature-branch # opens a browser window with Github compare of "main" and "my-feature-branch"
```

## Prerequisites

You only need `git` installed in the environment where you want to add the alias.

Note: you need to run the `ghcmp` command (or whatever you name the alias) in the directory with you git repository, so that it can find out the repo's Github url.

We will see how to add the alias to `zsh` and `bash` shells on Mac and Linux.

## Github compare page

Compare page url format:

`https://<REPO URL>/compare/<SOURCE BRANCH OR COMMIT>...<TARGET BRANCH OR COMMIT>`

Note the difference between `..` and `...` (2 and 3 dots).

2 dots: show all commits that TARGET has but SOURCE doesn't and commits that SOURCE has but TARGET doesn't.

3 dots: show all commits that TARGET has but SOURCE doesn't. You usually want this.

E.g. to see what was added in the `0.4-stable` branch compared to `0.3-stable` in `react` repo:

https://github.com/facebook/react/compare/0.3-stable...0.4-stable

## Command to open diff in Github

Assuming alias signature is `ghcmp [from branch-or-commit] [to branch-or-commit]`, the shell command is this:

Mac:

```bash
open "$(git config --get remote.origin.url | sed -E 's/:([^\/])/\/\1/g' | sed -e 's/git@/https:\/\//g' | sed -e 's/.git$//')/compare/$1...$2"
```

Linux:

```bash
xdg-open "$(git config --get remote.origin.url | sed -E 's/:([^\/])/\/\1/g' | sed -e 's/git@/https:\/\//g' | sed -e 's/.git$//')/compare/$1...$2"
```

Command deconstructed if you're curious:

`open` open the following url in the browser, replace with xdg-open for Linux
`"$(git config --get remote.origin.url` get the url of the repo from the git config file
`| sed -E 's/:([^\/])/\/\1/g' | sed -e 's/git@/https:\/\//g' | sed -e 's/.git$//')` convert the repo url to a canonical (https) form
`/compare/$1...$2"` the path in the Github compare url with 2 arguments passed

I've adapted the sed from this [SO answer](https://stackoverflow.com/a/63907839/2579733).

## Add shell alias

Now that we have the command, let's add the alias. It's the same for both `bash` and `zsh`, only the shell configuration file is different.

In bash, add to the end of `~/.bashrc`. In zsh, add to the end of `~.zshrc`:

```bash
ghcmp() {
	open "$(git config --get remote.origin.url | sed -E 's/:([^\/])/\/\1/g' | sed -e 's/git@/https:\/\//g' | sed -e 's/.git$//')/compare/$1...$2"
}
```

## ...

That was a little productivity trick to simplify your daily git process a bit.
