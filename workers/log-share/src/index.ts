interface Env {
  LOG_SHARE: KVNamespace
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // POST /share - Upload log data
    if (request.method === 'POST' && url.pathname === '/share') {
      try {
        const body = await request.json() as { data: string; metadata?: any }
        
        if (!body.data) {
          return new Response(JSON.stringify({ error: 'Missing data field' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        // Check size (max 25MB in KV)
        const dataSize = new Blob([body.data]).size
        if (dataSize > 25 * 1024 * 1024) {
          return new Response(JSON.stringify({ error: 'Data too large (max 25MB)' }), {
            status: 413,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }

        const id = generateId()
        const shareData = {
          data: body.data,
          metadata: body.metadata || {},
          createdAt: new Date().toISOString(),
          size: dataSize
        }

        // Store in KV with 30 days expiration
        await env.LOG_SHARE.put(id, JSON.stringify(shareData), {
          expirationTtl: 30 * 24 * 60 * 60 // 30 days
        })

        return new Response(JSON.stringify({ 
          id, 
          url: `https://oracle-plan-visualizer.vercel.app/log-analyzer?share=${id}`,
          expiresIn: '30 days'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // GET /share/:id - Fetch log data
    if (request.method === 'GET' && url.pathname.startsWith('/share/')) {
      const id = url.pathname.split('/')[2]
      
      if (!id) {
        return new Response(JSON.stringify({ error: 'Missing share ID' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const data = await env.LOG_SHARE.get(id)
      
      if (!data) {
        return new Response(JSON.stringify({ error: 'Share not found or expired' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(data, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response('Log Share API', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    })
  }
}
