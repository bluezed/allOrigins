const QuickLRU = require('../vendor/quick-lru')

const DEFAULT_USER_AGENT = `Mozilla/5.0 (compatible; allOrigins/${global.AO_VERSION}; +http://allorigins.win/)`

module.exports = (function httpClient() {
  const storageAdapter = new QuickLRU({ maxSize: 1000 })

  async function got(url, options = {}) {
    const headers = {
      'user-agent': process.env.USER_AGENT || DEFAULT_USER_AGENT,
    }
    if (options.headers) {
      Object.assign(headers, options.headers)
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
    })

    const buffer = Buffer.from(await response.arrayBuffer())

    return {
      body: buffer,
      url: response.url,
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
    }
  }

  // Cache support
  const cache = {
    async get(key) {
      return storageAdapter.get(key)
    },
    async set(key, value, ttl) {
      storageAdapter.set(key, value, ttl)
    },
  }

  return { got, cache }
})()
