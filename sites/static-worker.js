function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

async function fetchAsset(request, env, pathname) {
  return env.ASSETS.fetch(assetRequest(request, pathname));
}

async function withDeploymentOrigin(response, request, status = response.status) {
  const contentType = response.headers.get('content-type') ?? '';
  if (request.method === 'HEAD' || !/^(text\/|application\/(json|xml))/u.test(contentType)) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  const body = (await response.text()).replaceAll(
    'https://deployment.invalid',
    new URL(request.url).origin,
  );
  return new Response(body, { status, statusText: response.statusText, headers });
}

function isExtensionless(pathname) {
  const segment = pathname.split('/').filter(Boolean).at(-1) ?? '';
  return !segment.includes('.');
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    }

    const url = new URL(request.url);
    const direct = await env.ASSETS.fetch(request);
    if (direct.status !== 404) return withDeploymentOrigin(direct, request);

    if (url.pathname.endsWith('/')) {
      const index = await fetchAsset(request, env, `${url.pathname}index.html`);
      if (index.status !== 404) return withDeploymentOrigin(index, request);
    } else if (isExtensionless(url.pathname)) {
      const index = await fetchAsset(request, env, `${url.pathname}/index.html`);
      if (index.status !== 404) {
        url.pathname = `${url.pathname}/`;
        return Response.redirect(url, 308);
      }
    }

    const notFound = await fetchAsset(request, env, '/404.html');
    return withDeploymentOrigin(notFound, request, 404);
  },
};
