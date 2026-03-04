/**
 * CLI output utilities
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

/**
 * Standard output
 */
export function output(message: any): void {
  if (typeof message === 'object') {
    console.log(JSON.stringify(message, null, 2))
  } else {
    console.log(message)
  }
}

/**
 * Success message (green)
 */
export function success(message: string): void {
  console.log(`${colors.green}✓${colors.reset} ${message}`)
}

/**
 * Error message (red)
 */
export function error(message: string): void {
  console.error(`${colors.red}✗${colors.reset} ${message}`)
}

/**
 * Warning message (yellow)
 */
export function warn(message: string): void {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`)
}

/**
 * Info message (blue)
 */
export function info(message: string): void {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`)
}

/**
 * Simple spinner for async operations
 */
export function spinner(message: string): { stop: () => void } {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  let stopped = false

  const interval = setInterval(() => {
    if (!stopped) {
      process.stdout.write(`\r${colors.cyan}${frames[i]}${colors.reset} ${message}`)
      i = (i + 1) % frames.length
    }
  }, 80)

  return {
    stop: () => {
      stopped = true
      clearInterval(interval)
      process.stdout.write('\r' + ' '.repeat(message.length + 3) + '\r')
    },
  }
}

/**
 * Simple prompt (requires readline)
 */
export async function prompt(question: string): Promise<string> {
  const readline = await import('readline')
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`${colors.cyan}?${colors.reset} ${question} `, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

/**
 * Confirm prompt
 */
export async function confirm(question: string): Promise<boolean> {
  const answer = await prompt(`${question} (y/n)`)
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes'
}

/**
 * Format table
 */
export function table(headers: string[], rows: string[][]): void {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const maxRow = Math.max(...rows.map((r) => (r[i] || '').length))
    return Math.max(h.length, maxRow)
  })

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(' | ')
  const separator = widths.map((w) => '-'.repeat(w)).join('-+-')

  output(headerLine)
  output(separator)

  // Print rows
  for (const row of rows) {
    const rowLine = row.map((cell, i) => (cell || '').padEnd(widths[i])).join(' | ')
    output(rowLine)
  }
}

/**
 * Format JSON with syntax highlighting (simplified)
 */
export function prettyJson(obj: any): string {
  const json = JSON.stringify(obj, null, 2)
  return json
    .replace(/"([^"]+)":/g, `${colors.cyan}"$1"${colors.reset}:`)
    .replace(/: "([^"]+)"/g, `: ${colors.green}"$1"${colors.reset}`)
    .replace(/: (\d+)/g, `: ${colors.yellow}$1${colors.reset}`)
    .replace(/: (true|false)/g, `: ${colors.magenta}$1${colors.reset}`)
    .replace(/: (null)/g, `: ${colors.dim}$1${colors.reset}`)
}
