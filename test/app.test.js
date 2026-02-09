const request = require('supertest')

// Mock http-client before requiring app
jest.mock('../app/http-client.js', () => ({
  got: jest.fn((url, options) => {
    const method = options?.method || 'GET'
    if (url === 'http://example.com/test.html') {
      if (method === 'POST') {
        return Promise.resolve({
          body: Buffer.from("Hi, allOrigins! It's a POST!"),
          url,
          headers: {},
          status: 200,
        })
      }
      if (method === 'HEAD') {
        return Promise.resolve({
          body: Buffer.from(''),
          url,
          headers: { 'content-type': 'text/html', 'content-length': 'invalid' },
          status: 204,
        })
      }
      return Promise.resolve({
        body: Buffer.from('Hi, allOrigins!'),
        url,
        headers: { 'content-type': 'text/html' },
        status: 200,
      })
    }
    if (url === 'http://example.com/test.txt') {
      return Promise.resolve({
        body: Buffer.from('Hello, allOrigins! 👽'),
        url,
        headers: { 'content-type': 'text/plain' },
        status: 200,
      })
    }
    if (url === 'http://example.com/cn.txt') {
      return Promise.resolve({
        body: Buffer.from(Buffer.from('C4E3BAC3CAC0BDE7A3A1', 'hex')),
        url,
        headers: { 'content-type': 'text/plain' },
        status: 200,
      })
    }
    if (url === 'http://example.com/not-found.html') {
      return Promise.resolve({
        body: Buffer.from('not found!'),
        url,
        headers: {},
        status: 404,
      })
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`))
  }),
  cache: {
    get: jest.fn(),
    set: jest.fn(),
  },
}))

const app = require('../app.js')
const getLogger = require('../app/logger.js')

test('global.AO_VERSION is defined', () => {
  expect(global.AO_VERSION).toBeDefined()
})

describe('Logger', () => {
  test('process.env.DEBUG is undefined', () => {
    const logger = getLogger((process.env['DEBUG'] = undefined))
    expect(logger.logger).toBeFalsy()
    expect(
      logger.requestProcessed({
        format: 'raw',
        headers: {
          host: '127.0.0.1:34841',
          'accept-encoding': 'gzip, deflate',
          connection: 'close',
        },
        status: { response_time: 3, url: 'http://example.com/test.html' },
      }),
    ).toBeFalsy()
    expect(logger.logger.log).toBeUndefined()
  })

  test('process.env.DEBUG is defined', () => {
    const logger = getLogger((process.env['DEBUG'] = '1'))
    logger.logger = {
      log: jest.fn(() => true),
      warn: jest.fn(() => true),
    }

    expect(logger.logger).not.toBe(false)
    expect(
      logger.requestProcessed({
        format: 'raw',
        headers: {
          host: '127.0.0.1:34841',
          'accept-encoding': 'gzip, deflate',
          connection: 'close',
        },
        status: { response_time: 3, url: 'http://example.com/test.html' },
      }),
    ).not.toBeFalsy()
    expect(logger.logger.log).toBeCalled()
  })
})

test('Test basic /get request', async () => {
  const res = await request(app).get('/get?url=http://example.com/test.html')

  expect(res.statusCode).toBe(200)

  expect(res.body.contents).toBeDefined()
  expect(res.body.status).toBeDefined()
  expect(res.body.status.content_length).toBe(15)
})

test('Test POST to /get endpoint', async () => {
  const res = await request(app).post('/get?url=http://example.com/test.html')

  expect(res.statusCode).toBe(200)

  expect(res.body.contents).toBeDefined()
  expect(res.body.contents).toBe("Hi, allOrigins! It's a POST!")
  expect(res.body.status).toBeDefined()
})

test('Test /get request to not found url', async () => {
  const res = await request(app).get(
    '/get?url=http://example.com/not-found.html',
  )

  expect(res.statusCode).toBe(200)

  expect(res.body.contents).toBeDefined()
  expect(res.body.contents).toBe('not found!')
  expect(res.body.status).toBeDefined()
  expect(res.body.status.http_code).toBe(404)
})

test('Test /raw request', async () => {
  const res = await request(app).get('/raw?url=http://example.com/test.html')

  expect(res.statusCode).toBe(200)

  expect(res.body.contents).toBeUndefined()
  expect(res.body.status).toBeUndefined()
  expect(res.text).toBe('Hi, allOrigins!')
})

test('Test /get request with charset param', async () => {
  const res = await request(app).get(
    '/get?url=http://example.com/test.txt&charset=utf-8',
  )

  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/json; charset=utf-8')

  expect(res.body.contents).toBe('Hello, allOrigins! 👽')
})

test('Test /get request with charset param (CN)', async () => {
  const res = await request(app).get(
    '/get?url=http://example.com/cn.txt&charset=gbk',
  )

  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('application/json; charset=gbk')

  expect(res.body.contents).toBe('你好世界！')
})

test('Test /get request with callback param', async () => {
  const res = await request(app).get(
    '/get?url=http://example.com/test.txt&callback=myFunc',
  )

  expect(res.statusCode).toBe(200)
  expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8')

  expect(res.text).toMatch(/myFunc\(\{.+\}\)/gi)
})

test('Test /info request', async () => {
  const res = await request(app).get('/info?url=http://example.com/test.html')

  expect(res.statusCode).toBe(200)

  expect(res.body.contents).toBeUndefined()
  expect(res.body.content_type).toBe('text/html')
  expect(res.body.content_length).toBe(-1)
  expect(res.body.http_code).toBe(204)
})

test('Test OPTIONS request', async () => {
  const RANDOM_ORIGIN = `https://${Math.random()}.random`

  const res = await request(app).options('/get').set('Origin', RANDOM_ORIGIN)

  expect(res.statusCode).toBe(200)
  // 'cause we accept requests from allOrigins :D
  expect(res.headers['access-control-allow-origin']).toBe(RANDOM_ORIGIN)
  expect(res.headers['access-control-allow-methods']).toBe(
    'OPTIONS, GET, POST, PATCH, PUT, DELETE',
  )

  expect(res.body.contents).toBeUndefined()
})

test('with disableCache', async () => {
  const res = await request(app).get(
    `/get?url=http://example.com/test.html&disableCache=true`,
  )

  expect(res.statusCode).toBe(200)
  expect(res.headers['cache-control']).toBe(
    `public, max-age=0, stale-if-error=600`,
  )

  expect(res.body.contents).toBeDefined()
  expect(res.body.status).toBeDefined()
  expect(res.body.status.content_length).toBe(15)
})

test('with disableCache and valid cacheMaxAge', async () => {
  const res = await request(app).get(
    `/get?url=http://example.com/test.html&disableCache=true&cacheMaxAge=1000`,
  )

  expect(res.statusCode).toBe(200)
  expect(res.headers['cache-control']).toBe(
    `public, max-age=0, stale-if-error=600`,
  )

  expect(res.body.contents).toBeDefined()
  expect(res.body.status).toBeDefined()
  expect(res.body.status.content_length).toBe(15)
})

describe.each([
  ['without cacheMaxAge', '', '3600'],
  ['with a valid cacheMaxAge', '342', '342'],
  ['with an invalid cacheMaxAge', 'not-valid', '3600'],
  ['with a cacheMaxAge < MIN_CACHE_TIME', '142', '300'],
])('%s', (_, param, expected) => {
  test('Test /raw request', async () => {
    const res = await request(app).get(
      `/raw?url=http://example.com/test.html&cacheMaxAge=${param}`,
    )

    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe(
      `public, max-age=${expected}, stale-if-error=600`,
    )

    expect(res.body.contents).toBeUndefined()
    expect(res.body.status).toBeUndefined()
    expect(res.text).toBe('Hi, allOrigins!')
  })

  test('Test /get request', async () => {
    const res = await request(app).get(
      `/get?url=http://example.com/test.html&cacheMaxAge=${param}`,
    )

    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe(
      `public, max-age=${expected}, stale-if-error=600`,
    )

    expect(res.body.contents).toBeDefined()
    expect(res.body.status).toBeDefined()
    expect(res.body.status.content_length).toBe(15)
  })

  test('Test POST to /json endpoint', async () => {
    const res = await request(app).post(
      `/json?url=http://example.com/test.html&cacheMaxAge=${param}`,
    )

    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBeUndefined()

    expect(res.body.contents).toBeDefined()
    expect(res.body.contents).toBe("Hi, allOrigins! It's a POST!")
    expect(res.body.status).toBeDefined()
  })
})
