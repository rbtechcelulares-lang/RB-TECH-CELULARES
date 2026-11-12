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
const FAIXAS = ['Até R$ 1.000', 'Até R$ 1.800', 'Até R$ 2.500', 'Até R$ 3.000', 'Mais de R$ 3.000'];

function garantia(p, l) {
  if (ehIphone(p)) {
    if (/^novo|lacrad/i.test(p.condicao || '')) return '1 ano';
    const m = String(p.modelo || '').match(/iPhone\s*(\d+)/i);
    const n = m ? Number(m[1]) : /air/i.test(p.modelo || '') ? 99 : 0;
    return n >= 13 ? '6 meses' : '4 meses';
  }
  return p.garantia || (l && l.garantiaPadrao) || '';
}
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
    // só o valor de cada parcela: o total com juros não é passado ao cliente
    out.push({ parcelas: n, valor_parcela: brl(total / n) });
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
    ' | garantia ' + garantia(p, l) + (p.encomenda ? ' | SOB ENCOMENDA' + (p.prazo ? ' (' + p.prazo + ')' : '') : '') +
    ' | id ' + p.id).join('\n');
  const aceitos = ((cat.avaliacao || {}).modelos || []).map((m) => m.nome + (m.whatsapp ? ' (avaliação pelo WhatsApp)' : '')).join(', ');
  return [
    'Você é o ' + (ch.nome || 'RBChat') + ', atendente virtual da ' + (l.nome || 'RB Tech Celulares') + ' (' + (l.regiao || '') + ').',
    'Responda em português do Brasil, de forma curta, simpática e direta, como um vendedor experiente no WhatsApp. Use no máximo 3 parágrafos curtos ou uma lista curta. Use *negrito* só para preços e modelos.',
    '',
    'REGRAS',
    '- Só fale de preços, aparelhos, prazos e condições que estão abaixo. Nunca invente modelo, cor, preço, estoque ou política. Se não souber, diga que confirma pelo WhatsApp.',
    '',
    'COMO NEGOCIAR (siga esta ordem)',
    '0. Veja a seção MEMÓRIA DO CLIENTE no fim. Se o iPhone de entrada já é conhecido (nesta conversa ou em uma anterior), NUNCA pergunte de novo se é só compra ou se vai dar entrada: quando ele perguntar por outro iPhone, use proposta_troca direto com esse mesmo iPhone de entrada e mande só a diferença.',
    '1. Quando o cliente perguntar se tem um iPhone (ou pedir preço de um iPhone) e ainda não sabemos se ele tem entrada, NÃO mande o preço ainda. Confirme se temos o modelo (memórias e cores disponíveis) e pergunte: "Você está procurando só a compra ou tem algum iPhone para dar de entrada?".',
    '2. Se for só compra: aí sim informe o preço à vista e use calcular_parcelas para as parcelas no cartão.',
    '3. Se tiver iPhone de entrada: pergunte modelo, armazenamento, se a bateria está abaixo de 80% e se tem algum detalhe (tela ou tampa trincada, Face ID, câmera etc.). Com isso, use a ferramenta proposta_troca e responda SOMENTE com o valor da diferença a pagar (à vista e as parcelas da diferença). Não informe o preço cheio do aparelho, nem o valor da avaliação do usado, nem o desconto de cada defeito.',
    '4. Só informe o preço cheio do aparelho ou o valor da avaliação do usado se o cliente perguntar especificamente por eles depois da proposta.',
    '- Sempre diga que a avaliação do usado é confirmada na loja depois do teste do aparelho.',
    '- Para qualquer parcelamento use as ferramentas (a taxa da maquininha já está incluída); nunca faça a conta de cabeça.',
    '- Ao passar valores no cartão, diga só a quantidade e o valor de cada parcela (ex.: "12x de R$ 131,58"). NUNCA informe o total parcelado com juros, a taxa ou quanto fica a mais: a proposta termina no parcelamento.',
    '- A troca (dar o usado de entrada) vale só na compra de iPhones; MacBook, Xiaomi e iPad são sem entrada: nesses, informe o preço normalmente.',
    '',
    'AJUDAR A ESCOLHER',
    '- Quando o cliente pedir ajuda para escolher (ex.: "me ajude a escolher"), siga esta ordem, uma pergunta por vez:',
    '  a) O que ele mais valoriza no celular (câmera, desempenho/jogos, bateria, tela, custo-benefício).',
    '  b) Se ainda não disse, se prefere iPhone ou Android: pergunte e termine a resposta com uma linha exatamente assim: [PLATAFORMA]',
    '  c) Quando já souber o que ele precisa e se é iPhone ou Android, pergunte até quanto ele quer investir e termine a resposta com uma linha exatamente assim: [FAIXAS] (o site mostra os botões Até R$ 1.000, Até R$ 1.800, Até R$ 2.500, Até R$ 3.000 e Mais de R$ 3.000). Não liste as faixas no texto.',
    '- Com a faixa escolhida, recomende o melhor aparelho da lista abaixo dentro do valor à vista da faixa (no máximo 2 opções; se não houver nenhum na faixa, ofereça o mais próximo e diga isso), explicando em uma frase por que combina com ele (ex.: câmera tripla/zoom dos modelos Pro, chip mais novo para jogos, bateria maior dos modelos Plus/Pro Max). Se preferir Android, recomende os Xiaomi da lista.',
    '- Recomende só aparelhos que estão na lista. Ao recomendar um iPhone, siga COMO NEGOCIAR: pergunte se é só compra ou se tem iPhone de entrada antes de mandar valores (a não ser que a entrada já seja conhecida).',
    '- Para fechar, oriente o cliente a abrir o aparelho no site e tocar em "Enviar proposta no WhatsApp", ou chamar no WhatsApp ' + (l.whatsapp || '') + '.',
    '- Não peça nem guarde dados pessoais (CPF, cartão). Não discuta assuntos fora da loja.',
    '- Quando NÃO souber responder com as informações abaixo (estoque de cor específica, prazo de entrega, acessórios, assistência, qualquer coisa que não esteja aqui), diga que a equipe da loja confirma e termine a resposta com uma linha exatamente assim: [WHATSAPP: <mensagem curta, em primeira pessoa, que o cliente vai mandar para a loja com a pergunta específica dele>]. Ex.: [WHATSAPP: Olá! Vocês têm iPhone 15 Pro na cor azul?]. Use essa linha só quando não souber.',
    bfAtiva
      ? '- BLACK FRIDAY ATIVA' + (fimBf ? ' até ' + fimBf.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '') +
        '. Crie senso de urgência de forma honesta: as condições valem só até essa data e o estoque é limitado. Nunca invente quantidades em estoque nem vendas.'
      : '',
    '',
    'LOJA',
    'WhatsApp: ' + (l.whatsapp || '') + ' | Instagram: @' + String(l.instagram || '').replace(/^@/, '') + ' | Endereço: ' + (l.endereco || '') + ' | Horário: ' + (l.horario || ''),
    'Pagamento: Pix ou dinheiro à vista, débito, ou cartão de crédito parcelado (até ' + ((cat.pagamento || {}).maxParcelas || 12) + 'x).',
    '',
    'GARANTIA (regra fixa, vale mais que qualquer texto abaixo): iPhone novo lacrado 1 ano; iPhone seminovo do iPhone 13 em diante 6 meses; iPhone seminovo abaixo do 13 (11, 12, SE etc.) 4 meses. A garantia de cada aparelho já vem na lista.',
    '',
    'POLÍTICAS (garantia, trocas e outras)',
    ch.politicas || 'Lacrados com a garantia indicada em cada aparelho.',
    ch.informacoes ? '\nINFORMAÇÕES EXTRAS DA LOJA (escritas pelo dono, use nas respostas)\n' + ch.informacoes : '',
    '',
    'MODELOS ACEITOS COMO ENTRADA: ' + aceitos,
    '',
    'APARELHOS À VENDA (modelo | cor | condição | bateria/config | preço à vista | garantia | id)',
    produtos
  ].filter((x) => x !== '').join('\n');
}

function propostaTroca(cat, entrada) {
  const p = (cat.produtos || []).find((x) => x.id === entrada.produto_id);
  if (!p) return { erro: 'Aparelho não encontrado: use o id da lista de aparelhos à venda.' };
  if (!ehIphone(p)) return { erro: 'Troca só vale na compra de iPhone.' };
  const av = avaliar(cat, entrada);
  if (av.erro || av.recusado || !av.pre_avaliacao) return Object.assign({ aparelho: nome(p) }, av);
  const valorUsado = Number(String(av.pre_avaliacao).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  const dif = Math.max(0, Math.round((Number(p.preco) - valorUsado) * 100) / 100);
  return {
    aparelho: nome(p) + ' ' + (p.cor || ''),
    diferenca_a_vista: brl(dif),
    diferenca_no_cartao: parcelas(cat, dif),
    so_se_o_cliente_perguntar: { preco_cheio: brl(p.preco), avaliacao_do_usado: av.pre_avaliacao },
    observacao: av.observacao
  };
}

const FERRAMENTAS = [
  {
    name: 'proposta_troca',
    description: 'Monta a proposta com iPhone usado de entrada: devolve a diferença a pagar à vista e no cartão. Use quando o cliente informar o iPhone que vai dar de entrada.',
    input_schema: {
      type: 'object',
      properties: {
        produto_id: { type: 'string', description: 'id do aparelho à venda que o cliente quer (da lista)' },
        modelo: { type: 'string', description: 'Modelo do iPhone de entrada, ex.: iPhone 12' },
        armazenamento: { type: 'string', description: 'Ex.: 128GB' },
        bateria_abaixo_de_80: { type: 'boolean' },
        defeitos: { type: 'array', items: { type: 'string' }, description: 'Ex.: ["tela trincada"]; vazio se perfeito' }
      },
      required: ['produto_id', 'modelo', 'armazenamento', 'bateria_abaixo_de_80', 'defeitos'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'calcular_parcelas',
    description: 'Calcula as parcelas no cartão (com a taxa da maquininha) para um valor em reais. Use para o preço de um aparelho ou para a diferença depois da entrada.',
    input_schema: { type: 'object', properties: { valor: { type: 'number', description: 'Valor em reais, ex.: 2799' } }, required: ['valor'], additionalProperties: false },
    strict: true
  },
  {
    name: 'avaliar_entrada',
    description: 'Só a pré-avaliação do iPhone usado (quando o cliente ainda não escolheu o aparelho que quer comprar).',
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
  // junta mensagens seguidas do mesmo lado (ex.: pergunta do site + lembrete do WhatsApp)
  for (let i = mensagens.length - 1; i > 0; i--) {
    if (mensagens[i].role === mensagens[i - 1].role) { mensagens[i - 1].content += '\n\n' + mensagens[i].content; mensagens.splice(i, 1); }
  }
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

  // Memória guardada no celular do cliente: o iPhone que ele informou para dar de entrada
  const mem = (req.body || {}).memoria || {};
  const e0 = mem.entrada && typeof mem.entrada === 'object' ? mem.entrada : null;
  const ent = e0 && typeof e0.modelo === 'string' ? {
    modelo: e0.modelo.slice(0, 40), armazenamento: String(e0.armazenamento || '').slice(0, 10),
    bateria_abaixo_de_80: !!e0.bateria_abaixo_de_80,
    defeitos: Array.isArray(e0.defeitos) ? e0.defeitos.slice(0, 8).map((d) => String(d).slice(0, 60)) : []
  } : null;
  const descricao = ent ? ent.modelo + ' ' + ent.armazenamento + ', bateria ' + (ent.bateria_abaixo_de_80 ? 'abaixo de 80%' : '80% ou mais') +
    ', ' + (ent.defeitos.length ? 'detalhes: ' + ent.defeitos.join(', ') : 'sem detalhes') : '';
  const memoria = 'MEMÓRIA DO CLIENTE\n' + (!ent
    ? 'Primeira conversa: ainda não sabemos se ele tem iPhone de entrada. Siga o passo 1 quando ele perguntar por um iPhone.'
    : mem.anterior
      ? 'Em uma conversa anterior o cliente informou este iPhone de entrada: ' + descricao + '. O site já abriu esta conversa nova perguntando: "Da última vez você falou do seu ' + ent.modelo + ' ' + ent.armazenamento + ' para dar de entrada. Ainda tem interesse em dar ele de entrada?". A primeira mensagem do cliente pode ser a resposta a isso. Se confirmar, use proposta_troca com esse aparelho e mande só a diferença; se não, trate como compra direta (ou pegue o novo aparelho de entrada). Se ele não respondeu a isso e perguntou outra coisa, pergunte de forma natural se ainda vai dar esse aparelho de entrada antes de mandar valores.'
      : 'Nesta conversa o cliente já informou este iPhone de entrada: ' + descricao + '. Não pergunte de novo: para qualquer iPhone que ele perguntar, use proposta_troca com esse aparelho e mande só a diferença.');

  const client = new Anthropic();
  const conversa = mensagens.slice();
  let entradaNova = null; // devolvida ao site para guardar no celular do cliente
  try {
    for (let rodada = 0; rodada < 4; rodada++) {
      const resp = await client.messages.create({
        model: MODELO,
        max_tokens: 2048,
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: sistema(cat), cache_control: { type: 'ephemeral' } }, { type: 'text', text: memoria }],
        tools: FERRAMENTAS,
        messages: conversa
      });
      if (resp.stop_reason === 'refusal') {
        return res.status(200).json({ resposta: 'Sobre isso não consigo ajudar por aqui. Posso te ajudar com preços, parcelas, trocas e garantia, ou é só chamar a gente no WhatsApp! 😉' });
      }
      if (resp.stop_reason !== 'tool_use') {
        let texto = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        // pedido de WhatsApp com a pergunta do cliente (vira um botão no chat)
        let whatsapp = null;
        texto = texto.replace(/\[WHATSAPP:\s*([^\]]{3,300})\]/i, (m, q) => { whatsapp = q.trim(); return ''; }).trim();
        // botões de resposta rápida no chat
        let sugestoes = null;
        texto = texto.replace(/\[FAIXAS\]/gi, () => { sugestoes = FAIXAS; return ''; })
          .replace(/\[PLATAFORMA\]/gi, () => { sugestoes = sugestoes || ['🍎 iPhone', '🤖 Android']; return ''; }).trim();
        return res.status(200).json({ resposta: texto || 'Pode repetir a pergunta?', entrada: entradaNova, whatsapp, sugestoes });
      }
      conversa.push({ role: 'assistant', content: resp.content });
      const resultados = resp.content.filter((b) => b.type === 'tool_use').map((b) => {
        let saida;
        try {
          saida = b.name === 'calcular_parcelas'
            ? { valor: brl(b.input.valor), a_vista: brl(b.input.valor), cartao: parcelas(cat, Number(b.input.valor) || 0) }
            : b.name === 'avaliar_entrada' ? avaliar(cat, b.input)
              : b.name === 'proposta_troca' ? propostaTroca(cat, b.input) : { erro: 'ferramenta desconhecida' };
        } catch (e) {
          return { type: 'tool_result', tool_use_id: b.id, content: 'erro: ' + e.message, is_error: true };
        }
        if ((b.name === 'proposta_troca' || b.name === 'avaliar_entrada') && saida && !saida.erro && !saida.recusado) {
          const i = b.input;
          entradaNova = { modelo: i.modelo, armazenamento: i.armazenamento, bateria_abaixo_de_80: !!i.bateria_abaixo_de_80, defeitos: i.defeitos || [] };
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
