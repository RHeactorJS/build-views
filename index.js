#!/usr/bin/env node
'use strict'

const Promise = require('bluebird')
Promise.promisifyAll(require('fs'))
const glob = require('glob')
const path = require('path')
const fs = require('fs')
const _map = require('lodash/map')
const _forIn = require('lodash/forIn')
const _template = require('lodash/template')
const _merge = require('lodash/merge')
const colors = require('colors')
const minify = require('html-minifier').minify;

const program = require('commander')
program
  .command('build <config> <source> <target>')
  .option('-i, --include <directory>', 'load additional includes from this directory')
  .option('-m, --minify', 'minify the output')
  .description('build the views in source and write to target')
  .action(
    (config, source, target, options) => {
      let cfg = require(path.join(process.cwd(), config))
      let environment = cfg.get('environment')
      let templatedata = {
        version: cfg.get('version'),
        deployVersion: +new Date(),
        appName: cfg.get('appName'),
        name: cfg.get('app'),
        description: cfg.get('description'),
        apiIndex: cfg.get('api_host') + '/api',
        baseHref: cfg.get('base_href'),
        mimeType: cfg.get('mime_type'),
        environment: environment
      }

      let includes = {}
      let svgIncludes = {}
      let directives = {}

      /**
       * This function can be called from a template to add additional static data
       *
       * @param {String} includeName
       * @param {Object} scope to be merged onto the template data
       */
      let include = (includeName, scope) => {
        scope = scope || {}
        return buildTemplate(includes[includeName], {
          data: _merge({}, scope, templatedata),
          includes: includes,
          include
        })
      }

      // Build includes
      let globAsync = Promise.promisify(glob)
      let scanForIncludes = [
        globAsync(source + '/includes/*.html')
      ]
      if (options.include) {
        scanForIncludes.push(globAsync(options.include + '/*.html'))
      }

      return Promise.join(Promise.all(scanForIncludes), globAsync(source + '/js/directives/*.html'), globAsync(source + '/img/*.svg'))
        .spread((includeTemplates, directiveTemplates, svgFiles) => Promise
          .map(svgFiles, (file) => {
            return fs.readFileAsync(file, 'utf8').then(data => {
              let trg = file.match(/([^\/]+)\.svg$/)[1]
              svgIncludes[trg] = data
            })
          })
          .then(() => Promise.join(
            Promise.map(includeTemplates, (includesFound) => {
              return Promise.map(includesFound, (file) => {
                let fileEnv = file.match(/@([a-z]+)\.[^\.]+$/)
                if (fileEnv) {
                  fileEnv = fileEnv[1]
                }
                return fs.readFileAsync(file, 'utf8').then((data) => {
                  let trg = file.replace(source + '/includes/', '')
                  if (options.include) {
                    trg = trg.replace(options.include, '')
                  }
                  trg = trg.replace(/\.html$/, '')
                  trg = trg.replace(/\//, '.')
                  trg = trg.replace(/@([a-z]+)$/, '')
                  if (!fileEnv || fileEnv === environment) {
                    includes[trg] = data
                  }
                })
              })
                .then(() => {
                  _forIn(includes, (template, trg) => {
                    includes[trg] = buildTemplate(template, {data: templatedata, includes: includes, include, svg: svgIncludes})
                  })
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
          ))
        )
        .then(() => {
          console.log()
          console.log(colors.yellow('Building template files …'))
          console.log(colors.yellow(' Settings:'))
          console.log('  - Minify: ', options.minify ? colors.green('enabled') : colors.red('disabled'))
          console.log(colors.yellow(' data:'))
          _map(templatedata, (value, key) => {
            console.log('  -', colors.green('<%= data[\'' + key + '\'] %>', colors.blue('// ' + value)))
          })

          console.log(colors.yellow('Includes:'))
          _forIn(includes, (template, trg) => {
            console.log('  -', colors.green('<%= includes[\'' + trg + '\'] %>'))
          })
          console.log(colors.yellow('SVGs:'))
          _forIn(svgIncludes, (file, trg) => {
            console.log('  -', colors.green('<%= svg[\'' + trg + '\'] %>'))
          })
          return globAsync(source + '/*.html')
            .map((src) => {
              return fs.readFileAsync(src, 'utf8').then((data) => {
                data = _template(data)({data: templatedata, includes: includes, directives: directives, svg: svgIncludes})
                if (options.minify) {
                  data = minify(data, {
                    removeAttributeQuotes: true,
                    decodeEntities: true,
                    removeComments: true,
                    removeEmptyAttributes: true,
                    collapseWhitespace: true,
                    collapseInlineTagWhitespace: true
                  })
                }
                let trg = target + '/' + src.replace(source + '/', '')
                console.log(src + ' -> ' + trg)
                return fs.writeFileAsync(trg, data)
              })
            })
        })
        .then(() => {
          process.exit(0)
        })
        .catch((err) => {
          console.error(err)
          process.exit(1)
        })
    }
  )

/**
 * Recursively build the template, this allows for includes to contain includes …
 *
 * @param template
 * @param data
 * @param step
 */
let buildTemplate = (template, data, step) => {
  step = step || 1
  if (step >= 10) {
    console.error('Reached maximum nesting level', step)
    return template
  }
  let previousResult = template
  let result = _template(template)(data)
  if (result === previousResult) {
    return result
  }
  return buildTemplate(result, data, ++step)
}

program.parse(process.argv)
