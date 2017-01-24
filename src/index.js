#!/usr/bin/env node
import Promise from 'bluebird'
Promise.promisifyAll(require('fs'))
import glob from 'glob'
import path from 'path'
import fs from 'fs'
import _map from 'lodash/map'
import _forIn from 'lodash/forIn'
import _template from 'lodash/template'
import _merge from 'lodash/merge'
import colors from 'colors'
import {minify} from 'html-minifier'
import program from 'commander'
program
  .command('build <config> <source> <target>')
  .option('-i, --include <directory>', 'load additional includes from this directory')
  .option('-s, --svg <directory>', 'load svg files from this directory')
  .option('-m, --minify', 'minify the output')
  .option('-d, --debug', 'output debug information')
  .description('build the views in source and write to target')
  .action(
    (config, source, target, options) => fs.readFileAsync(path.normalize(path.join(process.cwd(), config)), 'utf8')
      .then(data => JSON.parse(data))
      .then(cfg => {
        let log = options.debug ? console.log : () => {}
        if (!cfg.environment) {
          throw new Error('You must return a value for environment')
        }
        let environment = cfg.environment
        let templatedata = _merge({}, cfg, {
          buildTime: +new Date()
        })

        let includes = {}
        let svgIncludes = {}
        source = path.resolve(source)
        const sourceDir = fs.statSync(source).isFile() ? path.dirname(source) : source
        target = path.resolve(target)
        const targetDir = path.dirname(target)

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
            includes,
            include
          })
        }

        // Build includes
        let globAsync = Promise.promisify(glob)
        let scanForIncludes = [
          globAsync(`${sourceDir}/includes/*.html`)
        ]
        if (options.include) {
          scanForIncludes.push(globAsync(`${options.include}/*.html`))
        }

        return Promise.join(
          Promise.all(scanForIncludes),
          globAsync(options.svg ? options.svg : `${sourceDir}/img/*.svg`)
        )
          .spread((includeTemplates, svgFiles) => Promise
            .map(svgFiles, (file) => {
              return fs.readFileAsync(file, 'utf8').then(data => {
                data = data.replace(/^<\?xml .+\?>/, '') // XML header
                data = data.replace(/(\r\n|\n|\r)/g, '') // newlines
                data = data.replace(/<[a-z-]+:[a-z-]+[^>]*>/gi, '') // XML namespaced tags
                data = data.replace(/<\/[a-z-]+:[a-z-]+>/gi, '') // XML namespaced closing tags
                data = data.replace(/[a-z-]+:[a-z-]+="[^"]*"/gi, '') // XML namespaced attributes
                data = data.replace(/ id="[^"]+"/gi, ' ') // IDs
                let trg = file.match(/([^/]+)\.svg$/)[1]
                svgIncludes[trg] = data
              })
            })
            .then(() => Promise.join(
              Promise.map(includeTemplates, (includesFound) => {
                return Promise.map(includesFound, (file) => {
                  let fileEnv = file.match(/@([a-z]+)\.[^.]+$/)
                  if (fileEnv) {
                    fileEnv = fileEnv[1]
                  }
                  return fs.readFileAsync(file, 'utf8').then((data) => {
                    let trg = file.replace(`${sourceDir}/includes/`, '')
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
                      includes[trg] = buildTemplate(template, {data: templatedata, includes, include, svg: svgIncludes})
                    })
                  })
              })
            ))
          )
          .then(() => {
            log()
            log(colors.yellow('Building template files …'))
            log(colors.yellow(' Settings:'))
            log('  -', options.minify ? colors.green('✓ minfication') : colors.red('✕ minfication'))
            log(colors.yellow(' data:'))
            _map(templatedata, (value, key) => {
              log('  -', colors.green(`<%= data['${key}'] %>`, colors.blue(`// ${value}`)))
            })
            log(colors.yellow('Includes:'))
            _forIn(includes, (template, trg) => {
              log('  -', colors.green(`<%= includes['${trg}'] %>`))
            })
            log(colors.yellow('SVGs:'))
            _forIn(svgIncludes, (file, trg) => {
              log('  -', colors.green(`<%= svg['${trg}'] %>`))
            })
            return globAsync(sourceDir === source ? `${sourceDir}/*.html` : source)
              .map((src) => {
                return fs.readFileAsync(src, 'utf8').then((data) => {
                  data = _template(data)({data: templatedata, includes, svg: svgIncludes})
                  if (options.minify) {
                    data = minify(data, {
                      removeAttributeQuotes: true,
                      decodeEntities: true,
                      removeComments: true,
                      removeEmptyAttributes: true,
                      collapseWhitespace: true,
                      conservativeCollapse: true,
                      collapseInlineTagWhitespace: true
                    })
                  }
                  const trg = path.join(targetDir, path.basename(src))
                  log(`${src} -> ${trg}`)
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
      })
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
