// RBChat: assistente do site, responde sobre preços, parcelas, trocas e garantia.
// A chave fica só na Vercel (variável ANTHROPIC_API_KEY); o catálogo é lido do próprio site,
// então o que o chat sabe é sempre o que está publicado.
const { Anthropic } = require('@anthropic-ai/sdk');

const MODELO = 'claude-haiku-5-5';
const MAX_MENSAGENS = 16;
const MAX_CARACTERES = 1200;

const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nome = (p) => [p.modelo, p.armazenamento].filter(Boolean).join(' ');
const ehIphone = (p) => (p.categoria || 'iphone') === 'iphone' && !/macbook|ipad|xiaomi|redmi|poco/i.test(p.modelo || '');
const ativo = (p) => !!p.topo || (p.vitrine != null ? !!p.vitrine : !!p.destaque) || p.disponivel !== false;

function bateria(p, cat) {
  if (Number(p.bateria) > 0) return Number(p.bateria) + '%';
  if (/^novo|lacrad/i.test(p.condicao || '')) return '100%';
  const m = String(p.modelo || '').match(/iPhone\s*(\d+)/i);
  return (m && cat.bateriaLinha && cat.bateriaLinha[m[1]]) || 'revisada';
}

function parcelas(cat, valor) {
  const pg = cat.pagamento || {};
  const max = Math.max(1, Math.min(24, Number(pg.maxParcelas) || 12));
  const out = [];
  for (let n = 1; n <= max; n++) {
    const t = (pg.taxas || {})[n];
    if (t === undefined || t === null || t === '') continue;
    const total = Math.round(valor * (1 + Number(t) / 100) * 100) / 100;
    out.push({ parcelas: n, valor_parcela: brl(total / n), total: brl(total) });
  }
  return out;
}

function avaliar(cat, entrada) {
  const av = cat.avaliacao || {};
  const busca = String(entrada.modelo || '').toLowerCase().replace(/^iphone\s*/, '').trim();
  const modelo = (av.modelos || []).find((m) => m.nome.toLowerCase().replace(/^iphone\s*/, '').trim() === busca);
  if (!modelo) return { erro: 'Esse modelo não está na tabela de entrada. Peça para o cliente falar com a loja no WhatsApp.' };
  if (modelo.whatsapp) return { modelo: modelo.nome, avaliacao: 'feita pela loja no WhatsApp (sem valor fixo no site)' };
  const gb = String(entrada.armazenamento || '').replace(/\D/g, '');
  const base = Number(modelo.valores[gb]);
  if (!base) return { erro: 'Capacidades aceitas para ' + modelo.nome + ': ' + Object.keys(modelo.valores).map((x) => x + 'GB').join(', ') };
  let desconto = 0;
  if (entrada.bateria_abaixo_de_80) {
    const b = (av.bateria || []).find((x) => /abaixo/i.test(x.label));
    desconto += Number(b && b.desconto) || 0;
  }
  const defeitos = (entrada.defeitos || []).map((d) => String(d).toLowerCase());
  for (const d of av.defeitos || []) {
    if (!defeitos.some((x) => d.label.toLowerCase().includes(x) || x.includes(d.label.toLowerCase()))) continue;
    if (d.recusa) return { modelo: modelo.nome, recusado: true, motivo: d.label };
    desconto += Number(d.desconto) || 0;
  }
  return { modelo: modelo.nome + ' ' + gb + 'GB', pre_avaliacao: brl(Math.max(0, base - desconto)), observacao: av.observacao || 'Valor confirmado na loja após o teste.' };
}

function sistema(cat) {
  const l = cat.loja || {};
  const ch = cat.chat || {};
  const bf = cat.blackfriday || {};
  // a data vem do admin sem fuso (horário de Brasília)
  const fimBf = bf.fim ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(bf.fim) ? bf.fim : bf.fim + '-03:00') : null;
  const bfAtiva = bf.ativo && (!fimBf || Date.now() < fimBf.getTime());
  const produtos = (cat.produtos || []).filter(ativo).map((p) =>
    '- ' + nome(p) + ' | ' + (p.cor || '') + ' | ' + (p.condicao || '') + (ehIphone(p) ? ' | bateria ' + bateria(p, cat) : (p.specs ? ' | ' + p.specs : '')) +
    ' | ' + brl(p.preco) + ' à vista' + (p.precoAntigo > p.preco ? ' (antes ' + brl(p.precoAntigo) + ')' : '') +
    ' | garantia ' + (p.garantia || l.garantiaPadrao || '') + (p.encomenda ? ' | SOB ENCOMENDA' + (p.prazo ? ' (' + p.prazo + ')' : '') : '') +
    ' | id ' + p.id).join('\n');
  const aceitos = ((cat.avaliacao || {}).modelos || []).map((m) => m.nome + (m.whatsapp ? ' (avaliação pelo WhatsApp)' : '')).join(', ');
  return [
    'Você é o ' + (ch.nome || 'RBChat') + ', atendente virtual da ' + (l.nome || 'RB Tech Celulares') + ' (' + (l.regiao || '') + ').',
    'Responda em português do Brasil, de forma curta, simpática e direta, como um vendedor experiente no WhatsApp. Use no máximo 3 parágrafos curtos ou uma lista curta. Use *negrito* só para preços e modelos.',
    '',
    'REGRAS',
    '- Só fale de preços, aparelhos, prazos e condições que estão abaixo. Nunca invente modelo, cor, preço, estoque ou política. Se não souber, diga que confirma pelo WhatsApp.',
    '- Para parcelamento use sempre a ferramenta calcular_parcelas (a taxa da maquininha já está incluída); não faça a conta de cabeça.',
    '- Para avaliar o iPhone usado do cliente (troca/entrada) use a ferramenta avaliar_entrada. Pergunte modelo, armazenamento, se a bateria está abaixo de 80% e se tem algum detalhe (tela trincada, tampa trincada, Face ID, câmera etc.). Não revele o desconto de cada defeito, só a pré-avaliação final, e deixe claro que o valor é confirmado na loja.',
    '- A troca (dar o usado de entrada) vale só na compra de iPhones; MacBook, Xiaomi e iPad são sem entrada.',
    '- Com entrada, o cliente paga só a diferença (preço do aparelho menos a pré-avaliação), à vista ou parcelada.',
    '- Para fechar, oriente o cliente a abrir o aparelho no site e tocar em "Enviar proposta no WhatsApp", ou chamar no WhatsApp ' + (l.whatsapp || '') + '.',
    '- Não peça nem guarde dados pessoais (CPF, cartão). Não discuta assuntos fora da loja.',
    bfAtiva
      ? '- BLACK FRIDAY ATIVA' + (fimBf ? ' até ' + fimBf.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '') +
        '. Crie senso de urgência de forma honesta: as condições valem só até essa data e o estoque é limitado. Nunca invente quantidades em estoque nem vendas.'
      : '',
    '',
    'LOJA',
    'WhatsApp: ' + (l.whatsapp || '') + ' | Instagram: @' + String(l.instagram || '').replace(/^@/, '') + ' | Endereço: ' + (l.endereco || '') + ' | Horário: ' + (l.horario || ''),
    'Pagamento: Pix ou dinheiro à vista, débito, ou cartão de crédito parcelado (até ' + ((cat.pagamento || {}).maxParcelas || 12) + 'x).',
    '',
    'POLÍTICAS (garantia, trocas e outras)',
    ch.politicas || 'Seminovos com garantia de ' + (l.garantiaPadrao || '90 dias') + '; lacrados com a garantia indicada em cada aparelho.',
    '',
    'MODELOS ACEITOS COMO ENTRADA: ' + aceitos,
    '',
    'APARELHOS À VENDA (modelo | cor | condição | bateria/config | preço à vista | garantia | id)',
    produtos
  ].filter((x) => x !== '').join('\n');
}

const FERRAMENTAS = [
  {
    name: 'calcular_parcelas',
    description: 'Calcula as parcelas no cartão (com a taxa da maquininha) para um valor em reais. Use para o preço de um aparelho ou para a diferença depois da entrada.',
    input_schema: { type: 'object', properties: { valor: { type: 'number', description: 'Valor em reais, ex.: 2799' } }, required: ['valor'], additionalProperties: false },
    strict: true
  },
  {
    name: 'avaliar_entrada',
    description: 'Pré-avaliação do iPhone usado que o cliente quer dar de entrada.',
    input_schema: {
      type: 'object',
      properties: {
        modelo: { type: 'string', description: 'Ex.: iPhone 13 Pro' },
        armazenamento: { type: 'string', description: 'Ex.: 128GB' },
        bateria_abaixo_de_80: { type: 'boolean' },
        defeitos: { type: 'array', items: { type: 'string' }, description: 'Ex.: ["tela trincada"]; vazio se perfeito' }
      },
      required: ['modelo', 'armazenamento', 'bateria_abaixo_de_80', 'defeitos'],
      additionalProperties: false
    },
    strict: true
  }
];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ configurado: !!process.env.ANTHROPIC_API_KEY });
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ erro: 'Chat ainda não configurado.' });

  const entrada = Array.isArray((req.body || {}).mensagens) ? req.body.mensagens : [];
  const mensagens = entrada.slice(-MAX_MENSAGENS)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CARACTERES) }));
  while (mensagens.length && mensagens[0].role !== 'user') mensagens.shift();
  if (!mensagens.length || mensagens[mensagens.length - 1].role !== 'user') return res.status(400).json({ erro: 'Mensagem vazia.' });

  let cat;
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const r = await fetch(proto + '://' + req.headers.host + '/data/catalogo.json?v=' + Date.now(), { cache: 'no-store' });
    cat = await r.json();
  } catch (e) {
    return res.status(502).json({ erro: 'Não consegui carregar o catálogo.' });
  }
  if (!(cat.chat || {}).ativo) return res.status(403).json({ erro: 'Chat desligado.' });

  const client = new Anthropic();
  const conversa = mensagens.slice();
  try {
    for (let rodada = 0; rodada < 4; rodada++) {
      const resp = await client.messages.create({
        model: MODELO,
        max_tokens: 2048,
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: sistema(cat), cache_control: { type: 'ephemeral' } }],
        tools: FERRAMENTAS,
        messages: conversa
      });
      if (resp.stop_reason === 'refusal') {
        return res.status(200).json({ resposta: 'Sobre isso não consigo ajudar por aqui. Posso te ajudar com preços, parcelas, trocas e garantia, ou é só chamar a gente no WhatsApp! 😉' });
      }
      if (resp.stop_reason !== 'tool_use') {
        const texto = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        return res.status(200).json({ resposta: texto || 'Pode repetir a pergunta?' });
      }
      conversa.push({ role: 'assistant', content: resp.content });
      const resultados = resp.content.filter((b) => b.type === 'tool_use').map((b) => {
        let saida;
        try {
          saida = b.name === 'calcular_parcelas'
            ? { valor: brl(b.input.valor), a_vista: brl(b.input.valor), cartao: parcelas(cat, Number(b.input.valor) || 0) }
            : b.name === 'avaliar_entrada' ? avaliar(cat, b.input) : { erro: 'ferramenta desconhecida' };
        } catch (e) {
          return { type: 'tool_result', tool_use_id: b.id, content: 'erro: ' + e.message, is_error: true };
        }
        return { type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(saida) };
      });
      conversa.push({ role: 'user', content: resultados });
    }
    return res.status(200).json({ resposta: 'Vou te passar para um atendente: chama a gente no WhatsApp que a gente resolve rapidinho!' });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ erro: 'Muita gente perguntando agora. Tente de novo em instantes.' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(500).json({ erro: 'Chave do chat inválida.' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ erro: 'O chat está instável agora.' });
    return res.status(500).json({ erro: 'Erro no chat.' });
  }
};
