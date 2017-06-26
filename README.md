# build-views

[![Build Status](https://travis-ci.org/RHeactorJS/build-views.svg?branch=master)](https://travis-ci.org/RHeactorJS/build-views)
[![monitored by greenkeeper.io](https://img.shields.io/badge/greenkeeper.io-monitored-brightgreen.svg)](http://greenkeeper.io/) 
[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)
[![semantic-release](https://img.shields.io/badge/semver-semantic%20release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Code Climate](https://codeclimate.com/github/RHeactorJS/build-views/badges/gpa.svg)](https://codeclimate.com/github/RHeactorJS/build-views)

[![NPM](https://nodei.co/npm/build-views.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/build-views/)

An utility to build static HTML views.

Uses [lodash template](https://lodash.com/docs/4.17.2#template) to compile a base template into a static, deployable file. See [`ResourcefulHumans/www`](https://github.com/ResourcefulHumans/www/blob/master/Makefile) for a concrete usage example.

## Features

- It reads *includes* from a directory and injects their source into the output. This allows to separate the building blocks of a website into smaller files
- It reads SVG files and injects them into the output.
- It has the ability to add variable names to the output.
