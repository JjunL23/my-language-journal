import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const qaRoot = path.resolve(projectRoot, '.qa')
const appPath = '/my-language-journal/'
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/**
 * Build real production assets twice, then switch one origin between versions.
 * The injected module is test-only: Vite compiles it into the JavaScript bundle,
 * changing that bundle's hash, index revision, and generated service worker.
 */
export async function startUpdateServer() {
  await mkdir(qaRoot, { recursive: true })
  const temporaryRoot = await mkdtemp(path.join(qaRoot, 'update-fixture-'))
  const directories = {
    v1: path.join(temporaryRoot, 'v1'),
    v2: path.join(temporaryRoot, 'v2'),
  }
  let activeVersion = 'v1'
  let server

  async function removeTemporaryBuilds() {
    const resolved = path.resolve(temporaryRoot)
    if (path.dirname(resolved) !== qaRoot || !path.basename(resolved).startsWith('update-fixture-')) {
      throw new Error('Refusing to remove a path outside the generated update fixtures.')
    }
    await rm(resolved, { recursive: true, force: true })
  }

  try {
    for (const version of ['v1', 'v2']) {
      await build({
        root: projectRoot,
        configFile: path.join(projectRoot, 'vite.config.ts'),
        base: appPath,
        logLevel: 'error',
        plugins: [{
          name: 'journal-update-test-build-marker',
          transformIndexHtml: {
            order: 'pre',
            handler: () => [{
              tag: 'script',
              attrs: { type: 'module' },
              children: `document.documentElement.dataset.updateBuild = ${JSON.stringify(version)};`,
              injectTo: 'head',
            }],
          },
        }],
        build: { outDir: directories[version], emptyOutDir: true },
      })
    }

    const scripts = {}
    for (const version of ['v1', 'v2']) {
      const html = await readFile(path.join(directories[version], 'index.html'), 'utf8')
      scripts[version] = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1])
    }
    const workers = await Promise.all(Object.values(directories).map((directory) => readFile(path.join(directory, 'sw.js'), 'utf8')))
    if (workers[0] === workers[1] || JSON.stringify(scripts.v1) === JSON.stringify(scripts.v2)) {
      throw new Error('Update fixtures must have distinct application JavaScript and service workers.')
    }

    server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url || '/', 'http://localhost')
        if (!url.pathname.startsWith(appPath)) {
          response.writeHead(404).end()
          return
        }
        const directory = directories[activeVersion]
        const relativePath = decodeURIComponent(url.pathname.slice(appPath.length)) || 'index.html'
        const filePath = path.resolve(directory, relativePath)
        if (!filePath.startsWith(`${directory}${path.sep}`)) {
          response.writeHead(403).end()
          return
        }
        const contents = await readFile(filePath)
        response.writeHead(200, {
          'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        })
        response.end(contents)
      } catch {
        response.writeHead(404).end()
      }
    })
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Update test server did not bind a TCP port.')
    const origin = `http://127.0.0.1:${address.port}`

    return {
      origin,
      url: `${origin}${appPath}`,
      scripts,
      activate(version) {
        if (!(version in directories)) throw new Error(`Unknown update fixture: ${version}`)
        activeVersion = version
      },
      async close() {
        server.closeAllConnections()
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
        await removeTemporaryBuilds()
      },
    }
  } catch (error) {
    if (server?.listening) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
    await removeTemporaryBuilds()
    throw error
  }
}
