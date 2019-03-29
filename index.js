const { spawn, execSync } = require('child_process')
const { createHmac } = require('crypto')
const express = require('express')
const { readFileSync } = require('fs')
const { parse } = require('json5')

let config
try {
  config = parse(readFileSync('./config.json'))
} catch (err) {
  console.log(`Failed to load config due to ${err}`)
}

function Frau() {
  let handle

  function launch() {
    return new Promise((resolve, reject) => {
      handle = spawn('node', ['.'], {
        cwd: config.cwd,
        stdio: 'pipe'
      })
      handle.on('error', err => {
        reject(err)
      })
      handle.stdout.setEncoding('utf8')
      handle.stdout.on('data', data => {
        console.log(data.substring(0, data.length - 1))
        resolve()
      })
      handle.stderr.setEncoding('utf8')
      handle.stderr.on('data', data => {
        console.log(data.substring(0, data.length - 1))
        resolve()
      })
    })
  }

  this.start = function() {
    launch()
    .then(() => {
      handle.once('exit', (code, signal) => {
        console.log(`Frau exited with code ${code}: ${signal}`)
        this.start()
      })
    })
    .catch(err => {
      console.log(`Failed to launch Frau due to ${err}`)
      this.start()
    })
  }

  this.stop = function() {
    return new Promise((resolve, reject) => {
      handle.removeAllListeners('exit')
      handle.removeAllListeners('error')
      handle.once('exit', resolve)
      handle.once('error', reject)
      handle.kill('SIGINT')
    })
  }
}

const app = express()
const frau = new Frau()

app.post('/minami/github/push', (request, response) => {
  if (!request.header('X-Hub-Signature')) {
    response.sendStatus(403)
    return
  }
  
  let hmac = createHmac('sha1', config.secret)

  request.once('readable', () => {
    hmac.update(request.read())
    
    if (hmac.digest('hex') !== request.header('X-Hub-Signature')) {
      response.sendStatus(403)
      return
    }

    frau.stop()
      .then(() => {
        execSync('git pull', {
          cwd: config.cwd,
          stdio: 'inherit'
        })
        frau.start()
      })
      .catch(err => {
        response.sendStatus(500)
        console.log(`Frau failed to restart due to ${err}`)
        process.exit(1)
      })
  })
})

process.once('SIGINT', () => {
  frau.stop()
    .then(() => process.exit(0))
    .catch(err => {
      console.log(`Failed to stop Frau due to ${err}`)
      process.exit(1)
    })
})

app.listen(8080, () => frau.start())