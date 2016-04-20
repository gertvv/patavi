<img src="https://raw.github.com/joelkuiper/patavi/gh-pages/assets/img/patavi_small.png" alt="logo" align="right" width="250" />

**This is an alpha release.  We are using it internally in production,
  but the API and organizational structure are subject to change.
  Comments and suggestions are much appreciated.**

## Introduction
Patavi is a distributed system for exposing
R scripts as web services.
It was created out of the need to run
potentially very long running R scripts in a web browser while
providing an interface to see the status updates.

## Alternatives
If you are looking for just a web-based interactive R environment
checkout [RStudio Shiny](http://www.rstudio.com/shiny/). If you just
want to expose R scripts as HTTP see
[FastRWeb](https://www.rforge.net/FastRWeb/) or one of the [many other
options](http://cran.r-project.org/doc/FAQ/R-FAQ.html#R-Web-Interfaces).


## Usage

The following components need to be running:

 - RabbitMQ message broker
 - Postgres database (initialize using server/schema.sql)
 - The server - an HTTP API to queue jobs and fetch results (nodejs)
 - Any number of workers

Clients can queue jobs at the server if they present an SSL client certificate trusted by the server.

## Licence

See [LICENSE](LICENSE).
