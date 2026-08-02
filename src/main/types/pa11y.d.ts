declare module 'pa11y' {
  interface Pa11yIssue {
    code?: string
    type?: string
    message?: string
    selector?: string
    context?: string
    runnerExtras?: { code?: string }
  }

  interface Pa11yResult {
    issues?: Pa11yIssue[]
  }

  interface Pa11yOptions {
    standard?: string
    runners?: string[]
    timeout?: number
    chromeLaunchConfig?: { args?: string[] }
    headers?: Record<string, string>
    includeNotices?: boolean
    includeWarnings?: boolean
  }

  export default function pa11y(url: string, options?: Pa11yOptions): Promise<Pa11yResult>
}
