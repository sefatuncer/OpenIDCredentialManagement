import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { output, success, error } from '../utils/output'

const CONFIG_DIR = path.join(os.homedir(), '.ai-identity')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export interface CliConfig {
  apiUrl: string
  apiKey?: string
  defaultOutput: 'json' | 'pretty' | 'yaml'
  verbose: boolean
}

const defaultConfig: CliConfig = {
  apiUrl: 'http://localhost:3000',
  defaultOutput: 'pretty',
  verbose: false,
}

export const configCommands = new Command('config')
  .description('CLI configuration commands')

// Initialize config
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
}

// Load config
export function loadConfig(): CliConfig {
  ensureConfigDir()

  if (!fs.existsSync(CONFIG_FILE)) {
    return defaultConfig
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8')
    return { ...defaultConfig, ...JSON.parse(content) }
  } catch {
    return defaultConfig
  }
}

// Save config
function saveConfig(config: CliConfig): void {
  ensureConfigDir()
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

// Show current config
configCommands
  .command('show')
  .description('Show current configuration')
  .action(() => {
    const config = loadConfig()

    output('\nCurrent Configuration:\n')
    output(`  API URL: ${config.apiUrl}`)
    output(`  API Key: ${config.apiKey ? '****' + config.apiKey.slice(-4) : 'Not set'}`)
    output(`  Default Output: ${config.defaultOutput}`)
    output(`  Verbose: ${config.verbose}`)
    output(`\n  Config File: ${CONFIG_FILE}`)
  })

// Set API URL
configCommands
  .command('set-url <url>')
  .description('Set API base URL')
  .action((url: string) => {
    const config = loadConfig()
    config.apiUrl = url
    saveConfig(config)
    success(`API URL set to: ${url}`)
  })

// Set API key
configCommands
  .command('set-key <key>')
  .description('Set API key')
  .action((key: string) => {
    const config = loadConfig()
    config.apiKey = key
    saveConfig(config)
    success('API key saved')
  })

// Set output format
configCommands
  .command('set-output <format>')
  .description('Set default output format (json, pretty, yaml)')
  .action((format: string) => {
    if (!['json', 'pretty', 'yaml'].includes(format)) {
      error('Invalid format. Use: json, pretty, or yaml')
      return
    }

    const config = loadConfig()
    config.defaultOutput = format as CliConfig['defaultOutput']
    saveConfig(config)
    success(`Default output format set to: ${format}`)
  })

// Toggle verbose mode
configCommands
  .command('verbose <on|off>')
  .description('Enable or disable verbose mode')
  .action((value: string) => {
    const config = loadConfig()
    config.verbose = value === 'on'
    saveConfig(config)
    success(`Verbose mode: ${config.verbose ? 'enabled' : 'disabled'}`)
  })

// Reset config
configCommands
  .command('reset')
  .description('Reset configuration to defaults')
  .action(() => {
    saveConfig(defaultConfig)
    success('Configuration reset to defaults')
  })

// Init/setup
configCommands
  .command('init')
  .description('Initialize CLI configuration')
  .option('-u, --url <url>', 'API URL', 'http://localhost:3000')
  .option('-k, --key <key>', 'API key')
  .action((options) => {
    const config: CliConfig = {
      ...defaultConfig,
      apiUrl: options.url,
      apiKey: options.key,
    }

    saveConfig(config)

    success('Configuration initialized')
    output(`\n  API URL: ${config.apiUrl}`)
    output(`  API Key: ${config.apiKey ? 'Set' : 'Not set'}`)
    output(`\n  Config saved to: ${CONFIG_FILE}`)
  })
