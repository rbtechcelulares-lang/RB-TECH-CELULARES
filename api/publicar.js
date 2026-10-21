// Publicação pelo painel admin sem token no navegador.
// O token do GitHub fica só na Vercel (variável de ambiente GITHUB_TOKEN);
// o admin envia a senha do painel, conferida contra o hash do catálogo publicado.
const crypto = require('crypto');

const REPO = process.env.GITHUB_REPO || 'rbtechcelulares-lang/RB-TECH-CELULARES';
const BRANCH = process.env.GITHUB_BRANCH || ''; // vazio = branch principal do repositório
const CAMINHO_OK = /^(data\/catalogo\.json|img\/(produtos|promo)\/[\w.-]{1,120}\.(webp|jpg|jpeg|png))$/;

async function gh(caminho, metodo, corpo) {
  const ref = metodo === 'GET' && BRANCH ? '?ref=' + encodeURIComponent(BRANCH) : '';
  const r = await fetch('https://api.github.com/repos/' + REPO + '/contents/' + caminho + ref, {
    method: metodo,
    headers: {
      Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'rbtech-admin'
    },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  if (metodo === 'GET' && r.status === 404) return null;
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(dados.message || 'GitHub respondeu ' + r.status);
    e.status = r.status;
    throw e;
  }
  return dados;
}

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const configurado = !!process.env.GITHUB_TOKEN;
  if (req.method === 'GET') return res.status(200).json({ configurado });
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  if (!configurado) return res.status(501).json({ erro: 'GITHUB_TOKEN não está configurado na Vercel.' });

  const { senha, caminho, conteudo, mensagem } = req.body || {};
  if (typeof senha !== 'string' || typeof caminho !== 'string' || typeof conteudo !== 'string') {
    return res.status(400).json({ erro: 'Dados incompletos.' });
  }
  if (!CAMINHO_OK.test(caminho)) return res.status(400).json({ erro: 'Arquivo não permitido: ' + caminho });

  try {
    // a senha vale se bater com a do catálogo que está no ar
    const atual = await gh('data/catalogo.json', 'GET');
    if (!atual) return res.status(500).json({ erro: 'Catálogo não encontrado no repositório.' });
    const publicado = JSON.parse(Buffer.from(atual.content, 'base64').toString('utf8'));
    const hash = crypto.createHash('sha256').update('rbtech:' + senha).digest('hex');
    if (!publicado.loja || hash !== publicado.loja.senhaHash) {
      await espera(1000);
      return res.status(401).json({ erro: 'Senha do admin incorreta.' });
    }

    let sha;
    if (caminho === 'data/catalogo.json') {
      const novo = JSON.parse(Buffer.from(conteudo, 'base64').toString('utf8'));
      if (!novo || !Array.isArray(novo.produtos) || !novo.loja || !novo.pagamento || !novo.avaliacao) {
        return res.status(400).json({ erro: 'Catálogo inválido.' });
      }
      sha = atual.sha;
    } else {
      const existente = await gh(caminho, 'GET');
      sha = existente ? existente.sha : undefined;
    }

    await gh(caminho, 'PUT', {
      message: String(mensagem || 'Atualiza pelo painel admin').slice(0, 200),
      content: conteudo,
      sha,
      branch: BRANCH || undefined
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    const s = e.status === 401 || e.status === 403 ? 'O token configurado na Vercel não tem acesso ao repositório (' + e.message + ').' : e.message;
    return res.status(502).json({ erro: s });
  }
};
