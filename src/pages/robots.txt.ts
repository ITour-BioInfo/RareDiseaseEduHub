import type { APIRoute } from 'astro';
export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap-index.xml', site || 'http://localhost:4321/')}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
