#!/usr/bin/env node

import { Command } from 'commander'
import { didCommands } from './commands/did.commands'
import { credentialCommands } from './commands/credential.commands'
import { agentCommands } from './commands/agent.commands'
import { configCommands } from './commands/config.commands'
import { backupCommands } from './commands/backup.commands'

const program = new Command()

program
  .name('ai-identity')
  .description('AI Agent Identity System CLI')
  .version('1.0.0')

// Add command groups
program.addCommand(didCommands)
program.addCommand(credentialCommands)
program.addCommand(agentCommands)
program.addCommand(configCommands)
program.addCommand(backupCommands)

// Global options
program
  .option('-v, --verbose', 'Enable verbose output')
  .option('--api-url <url>', 'API base URL', 'http://localhost:3000')
  .option('--api-key <key>', 'API key for authentication')

// Parse and execute
program.parse(process.argv)

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp()
}
