/** Minimal preview-only sink for Powertools Metrics' one used Console method. */
export class Console {
  constructor({ stdout, stderr } = {}) {
    if (!stdout || typeof stdout.write !== 'function' || !stderr || typeof stderr.write !== 'function') {
      throw new TypeError('preview_console_streams_required');
    }
    this.stdout = stdout;
    this.stderr = stderr;
  }
  log(...args) {
    return this.stdout.write(`${args.map(String).join(' ')}\n`);
  }
}
