const { spawn, execSync } = require('child_process')
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
        stdio: 'inherit'
      })
      handle.stdout.on('data', data => {
        console.log(data)
        resolve()
      })
      handle.stderr.on('data', data => {
        console.log(data)
        resolve()
      })
      handle.on('error', err => {
        reject(err)
      })
    })
  }

  this.start = async function() {
    await launch()
    handle.once('exit', (code, signal) => {
      console.log(`Frau exited with code ${code}: ${signal}`)
      await this.start()
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

app.post('/github/push', (request, response) => {
  if (!request.header('X-Hub-Signature')) {
    response.sendStatus(403)
  } else {
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
  }
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