import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.PORT ?? 10000)
const apiOriginValue = process.env.TASKFLOW_API_ORIGIN

if (!apiOriginValue) {
  throw new Error('TASKFLOW_API_ORIGIN must be configured for the Render web service.')
}

const apiOrigin = new URL(apiOriginValue)
if (apiOrigin.protocol !== 'https:') {
  throw new Error('TASKFLOW_API_ORIGIN must use HTTPS.')
}

const publicDirectory = resolve(fileURLToPath(new URL('./dist/', import.meta.url)))
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function respond(res, status, contentType, body) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(body)
}

function proxyApiRequest(req, res, requestUrl) {
  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin)
  const headers = { ...req.headers }

  for (const headerName of Object.keys(headers)) {
    const lowerName = headerName.toLowerCase()
    if (
      lowerName === 'host' ||
      lowerName === 'connection' ||
      lowerName === 'keep-alive' ||
      lowerName === 'proxy-authenticate' ||
      lowerName === 'proxy-authorization' ||
      lowerName === 'te' ||
      lowerName === 'trailer' ||
      lowerName === 'transfer-encoding' ||
      lowerName === 'upgrade' ||
      lowerName === 'forwarded' ||
      lowerName.startsWith('x-forwarded-')
    ) {
      delete headers[headerName]
    }
  }

  headers.host = upstreamUrl.host
  // Keep the browser Origin unchanged so the backend can enforce its trusted-origin policy.
  const upstreamRequest = httpsRequest(
    upstreamUrl,
    { method: req.method, headers },
    (upstreamResponse) => {
      res.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
      upstreamResponse.pipe(res)
    },
  )

  upstreamRequest.setTimeout(30000, () => {
    upstreamRequest.destroy(new Error('TaskFlow API request timed out.'))
  })
  upstreamRequest.on('error', () => {
    if (res.headersSent) {
      res.destroy()
      return
    }
    respond(
      res,
      502,
      'application/json; charset=utf-8',
      JSON.stringify({
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'TaskFlow is temporarily unavailable.',
        },
      }),
    )
  })
  req.on('aborted', () => upstreamRequest.destroy())
  req.pipe(upstreamRequest)
}

async function serveStaticFile(req, res, requestUrl) {
  let pathname
  try {
    pathname = decodeURIComponent(requestUrl.pathname)
  } catch {
    respond(res, 400, 'text/plain; charset=utf-8', 'Invalid URL path.')
    return
  }

  const requestedFile = resolve(publicDirectory, `.${pathname}`)
  const relativePath = relative(publicDirectory, requestedFile)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    respond(res, 404, 'text/plain; charset=utf-8', 'Not found.')
    return
  }

  let filePath = requestedFile
  try {
    const fileInfo = await stat(filePath)
    if (!fileInfo.isFile()) filePath = join(publicDirectory, 'index.html')
  } catch {
    filePath = join(publicDirectory, 'index.html')
  }

  try {
    const fileInfo = await stat(filePath)
    if (!fileInfo.isFile()) {
      respond(res, 404, 'text/plain; charset=utf-8', 'Not found.')
      return
    }

    res.writeHead(200, {
      'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
      'Content-Length': fileInfo.size,
      'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    })
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const fileStream = createReadStream(filePath)
    fileStream.on('error', () => {
      if (res.headersSent) res.destroy()
      else respond(res, 404, 'text/plain; charset=utf-8', 'Not found.')
    })
    fileStream.pipe(res)
  } catch {
    respond(res, 404, 'text/plain; charset=utf-8', 'Not found.')
  }
}

const server = createServer((req, res) => {
  let requestUrl
  try {
    requestUrl = new URL(req.url ?? '/', 'http://localhost')
  } catch {
    respond(res, 400, 'text/plain; charset=utf-8', 'Invalid request URL.')
    return
  }

  if (requestUrl.pathname === '/healthz') {
    respond(res, 200, 'application/json; charset=utf-8', JSON.stringify({ status: 'ok' }))
    return
  }

  if (requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/')) {
    proxyApiRequest(req, res, requestUrl)
    return
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    respond(res, 405, 'text/plain; charset=utf-8', 'Method not allowed.')
    return
  }

  void serveStaticFile(req, res, requestUrl)
})

server.listen(port, '0.0.0.0')
