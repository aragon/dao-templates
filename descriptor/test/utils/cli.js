const path = require('path')
const exec = require('child_process').exec

module.exports = function cli(script, ...args) {
  const cwd = '.'
  return new Promise(resolve => {
    exec(
      `node ./src/scripts/${script} ${args.join(' ')}`,
      { cwd },
      (error, stdout, stderr) => {
        const err = error || stderr
        resolve({
          code: err ? 1 : 0,
          error: err,
          stdout,
          stderr
        })
      }
    )
  })
}
