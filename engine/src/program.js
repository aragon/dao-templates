#!/usr/bin/env node

const program = require('commander');
const { version, bin } = require('../package.json');

const name = Object.keys(bin)[0]

// Require all commands.
const commandPaths = [
  './commands/permissions.js',
]
const commands = commandPaths.map(commandPath => {
  return require(commandPath)
})

// Register each command in the program.
commands.forEach(command => command.register(program))

// Program definition.
program
  .name(name)
  .usage('<command> [options]')
  .version(version, '-v, --version')
  .on('--help', displayHelp) // Show custon help with the --help option.
  // Display an error when an unsupported command is entered.
  .on('command:*', function () {
    console.error(`Invalid command: %s\nUse ${name} --help for a list of available commands.`, program.args.join(' '))
    process.exit(1)
  })

// Parse program.
program.parse(process.argv)

// Show custom help if no command is entered.
if(process.argv.length === 2) displayHelp()

// Custon main help.
function displayHelp() {
  program.help(() => {

    // Commands list with short description.
    commands.forEach(command => {
      if(command.signature) {
        console.log(`- ${command.signature} - ${command.description}`)
      }
    })
    console.log(`\n`)
    process.exit(0)
  })
}
