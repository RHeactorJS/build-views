#!/usr/bin/env node
'use strict'

const Promise = require('bluebird')
Promise.promisifyAll(require('fs'))
const glob = require('glob')
const path = require('path')
const fs = require('fs')
const _map = require('lodash/map')
const _template = require('lodash/template')

const program = require('commander')
program
  .command('build <config> <source> <target>')
  .description('build the views in source and write to target')
  .action(
    (config, source, target) => {
      let cfg = require(path.join(process.cwd(), config))
      let environment = cfg.get('environment')
      let templatedata = {
        version: cfg.get('version'),
        deployVersion: +new Date(),
        appName: cfg.get('appName'),
        name: cfg.get('app'),
        description: cfg.get('description'),
        apiIndex: cfg.get('api_host') + '/api',
        environment: environment
      }

      let includes = {}
      let directives = {}

      console.log()
      console.log('Building template files …')
      console.log(' data:')
      _map(templatedata, (value, key) => {
        console.log('  ' + key + ': ' + value)
      })

      // Build includes
      let globAsync = Promise.promisify(glob)
      return Promise.join(globAsync(source + '/includes/*.html'), globAsync(source + '/js/directives/*.html'))
        .spread((includeTemplates, directiveTemplates) => {
          return Promise.join(
            Promise.map(includeTemplates, (file) => {
              let fileEnv = file.match(/@([a-z]+)\.[^\.]+$/)
              if (fileEnv) {
                fileEnv = fileEnv[1]
              }
              return fs.readFileAsync(file, 'utf8').then((data) => {
                let trg = file.replace(source + '/includes/', '')
                trg = trg.replace(/\.html$/, '')
                trg = trg.replace(/\//, '.')
                trg = trg.replace(/@([a-z]+)$/, '')
                if (fileEnv && fileEnv !== environment) {
                  data = false
                } else {
                  data = _template(data)({data: templatedata})
                  includes[trg] = data
                }
              })
            }),
            Promise.map(directiveTemplates, (file) => {
              return fs.readFileAsync(file, 'utf8').then((data) => {
                let trg = file.replace(source + '/js/directives/', '')
                trg = trg.replace(/\.html$/, '')
                trg = trg.replace(/\//, '.')
                data = _template(data)({data: templatedata})
                directives[trg] = data
              })
            })
          )
        })
        .then(() => {
          return globAsync(source + '/*.html')
            .map((src) => {
              return fs.readFileAsync(src, 'utf8').then((data) => {
                data = _template(data)({data: templatedata, includes: includes, directives: directives})
                let trg = target + '/' + src.replace(source + '/', '')
                console.log(src + ' -> ' + trg)
                return fs.writeFileAsync(trg, data)
              })
            })
        })
        .then(() => {
          process.exit(0)
        })
        .catch(() => {
          process.exit(1)
        })
    }
  )

program.parse(process.argv)
