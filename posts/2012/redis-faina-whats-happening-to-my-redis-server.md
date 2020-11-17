---
title: "redis-faina: what's happening to my Redis server?"
description: This is literally the first blog post I published back in 2012.
date: 2012-08-08
tags:
  - redis
  - performance
---

_Edit 2020: I'm not sure this is even relevant anymore, looks like project's Github is dead. This is here for history purposes._

Following is about [redis-faina: a query analysis tool for Redis](http://instagram-engineering.tumblr.com/post/23132009381/redis-faina-a-query-analysis-tool-for-redis).

It's a tool from the team at Instagram to analyze commands coming to your Redis server.

You may have couple _(hundred (thousands))_ requests at your Redis server you completely forgot about. It will be nice to get to know them.

Thanks to Salvatore, Redis is blazing fast and you may never notcied those queries existed.

It works like this: a Python script parses the output of the `MONITOR` command. It watches, accumulates, aggregates and reports. In the end it will tell which commands (and how many times) consumed kilowatts on your server.

Example:

```bash
# reading from stdin
redis-cli -p 6490 MONITOR | head -n <NUMBER OF LINES TO ANALYZE> | ./redis-faina.py
```

```bash
# reading a file
redis-cli -p 6490 MONITOR | head -n <...> > /tmp/outfile.txt
./redis-faina.py /tmp/outfile.txt
```

Keep in mind that running `MONITOR` can reduce the server throughput by more than 50% so you should run `redis-faina` on a `slave` instance.
