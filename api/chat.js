// RBChat: assistente do site, responde sobre preços, parcelas, trocas e garantia.
// A chave fica só na Vercel (variável ANTHROPIC_API_KEY); o catálogo é lido do próprio site,
// então o que o chat sabe é sempre o que está publicado.
const { Anthropic } = require('@anthropic-ai/sdk');

const MODELO = 'claude-haiku-5-5';
const MAX_MENSAGENS = 8; // só as últimas mensagens vão para a IA (nome, entrada e cupom ficam na memória)
const MAX_CARACTERES = 500; // tamanho máximo de cada mensagem
const MAX_SAIDA = 500; // respostas curtas
const LIMITE_DIA_PADRAO = 40; // mensagens por visitante por dia (dá para mudar no admin › IA)

const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nome = (p) => [p.modelo, p.armazenamento].filter(Boolean).join(' ');
const ehIphone = (p) => (p.categoria || 'iphone') === 'iphone' && !/macbook|ipad|xiaomi|redmi|poco/i.test(p.modelo || '');
const BENEFICIOS = 'Benefícios RB Tech\n\n✅ 6 meses de garantia\n✅ Capa e película\n✅ Carregador completo\n✅ Entrega gratuita!\n\nE celular reserva caso necessite acionar a garantia! 🔥🔥';
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
  const rep = cat.reparos || {};
  const bf = cat.blackfriday || {};
  // a data vem do admin sem fuso (horário de Brasília)
  const fimBf = bf.fim ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(bf.fim) ? bf.fim : bf.fim + '-03:00') : null;
  const bfAtiva = bf.ativo && (!fimBf || Date.now() < fimBf.getTime());
  const produtos = (cat.produtos || []).filter(ativo).map((p) =>
    nome(p) + '|' + (p.cor || '') + '|' + (/semi/i.test(p.condicao || '') ? 'semi' : 'novo') + '|' + (ehIphone(p) ? bateria(p, cat) : (p.specs || '')) +
    '|' + brl(p.preco) + (p.precoAntigo > p.preco ? ' (antes ' + brl(p.precoAntigo) + ')' : '') +
    '|' + garantia(p, l) + (p.encomenda ? '|ENCOMENDA' + (p.prazo ? ' ' + p.prazo : '') : '') +
    '|' + p.id).join('\n');
  const aceitos = ((cat.avaliacao || {}).modelos || []).map((m) => m.nome + (m.whatsapp ? ' (avaliação pelo WhatsApp)' : '')).join(', ');
  return [
    'Você é o ' + (ch.nome || 'RBChat') + ', atendente virtual da ' + (l.nome || 'RB Tech Celulares') + ' (' + (l.regiao || '') + ').',
    'Responda em português do Brasil, de forma curta, simpática e direta, como um vendedor experiente no WhatsApp: no máximo 60 palavras (até 100 só quando listar aparelhos ou parcelas), sem repetir o que o cliente disse e sem despedidas longas. Use *negrito* só para preços e modelos.',
    '',
    'REGRAS',
    '- Só fale de preços, aparelhos, prazos e condições que estão abaixo. Nunca invente modelo, cor, preço, estoque ou política. Se não souber, diga que confirma pelo WhatsApp.',
    '',
    'COMO NEGOCIAR (siga esta ordem)',
    '0. Veja a seção MEMÓRIA DO CLIENTE no fim. Se o iPhone de entrada já é conhecido (nesta conversa ou em uma anterior), NUNCA pergunte de novo se é só compra ou se vai dar entrada: quando ele perguntar por outro iPhone, use proposta_troca direto com esse mesmo iPhone de entrada e mande só a diferença.',
    '1. Quando o cliente perguntar se tem um iPhone (ou pedir preço de um iPhone) e ainda não sabemos se ele tem entrada, NÃO mande o preço ainda. Confirme se temos o modelo (memórias e cores disponíveis) e pergunte: "Você está procurando só a compra ou tem algum iPhone para dar de entrada?".',
    '2. Se for só compra: aí sim use a ferramenta proposta_compra e informe o valor à vista e as parcelas que ela devolver.',
    '- CUPOM: se a MEMÓRIA DO CLIENTE disser que ele tem cupom salvo, as ferramentas proposta_compra e proposta_troca já descontam o cupom e calculam as parcelas em cima do valor final com desconto. Use sempre esses valores e mostre o desconto do cupom na negociação, com o valor (ex.: "🎟️ Seu cupom BLACK 4.0 deu *R$ 100,00 de desconto*" e depois o valor final). Nunca recalcule de cabeça.',
    '- Se o cliente perguntar o valor diretamente (ex.: "qual valor?", "quanto é?") antes de responder sobre a entrada, NÃO enrole: informe o valor exato à vista de cada aparelho em questão e o parcelamento (calcular_parcelas), e depois pergunte se ele tem iPhone para dar de entrada.',
    '- VALORES SEMPRE EXATOS: escreva o preço exatamente como está na lista (ex.: R$ 2.199,00), sem arredondar, sem "a partir de", sem "cerca de" e sem faixa de valores.',
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
    '- Com a faixa escolhida, recomende o melhor aparelho da lista abaixo dentro do valor à vista da faixa (no máximo 2 opções; se não houver nenhum na faixa, ofereça o mais próximo e diga isso), SEMPRE com o valor exato à vista de cada um (como na lista), explicando em uma frase por que combina com ele (ex.: câmera tripla/zoom dos modelos Pro, chip mais novo para jogos, bateria maior dos modelos Plus/Pro Max). Se preferir Android, recomende os Xiaomi da lista.',
    '- Recomende só aparelhos que estão na lista. Ao recomendar um iPhone, siga COMO NEGOCIAR: pergunte se é só compra ou se tem iPhone de entrada antes de mandar valores (a não ser que a entrada já seja conhecida).',
    '- BRINDES NO FECHAMENTO: quando a negociação estiver quase finalizando (depois de mandar a proposta/diferença ou o valor final, ou quando o cliente mostrar que quer fechar), envie os benefícios abaixo, uma vez só na conversa, exatamente neste formato de lista. Na linha da garantia, use a garantia do aparelho escolhido (iPhone novo 1 ano; seminovo do 13 em diante 6 meses; abaixo do 13, 4 meses).',
    '  BENEFÍCIOS:\n' + (ch.beneficios || BENEFICIOS),
    rep.ativo !== false
      ? '- CONSERTO/REPARO: SIM, a loja faz conserto e assistência técnica' + (rep.servicos ? ' (' + rep.servicos + ')' : '') + '. Se o cliente perguntar sobre conserto, reparo, troca de tela/bateria, aparelho com defeito etc., responda que sim, que não passamos valor de reparo pelo chat, e que ele pede o orçamento pelo botão abaixo (descrevendo o problema, gera a ordem de serviço na hora). Termine a resposta com uma linha exatamente assim: [REPARO]'
      : '',
    '- LINKS: sempre que recomendar, oferecer ou passar valores de aparelhos específicos da lista, termine a resposta com uma linha exatamente assim: [VER: id1, id2] (os ids da lista, no máximo 3). O site transforma isso em botões que abrem cada aparelho. E logo abaixo, uma linha [WHATSAPP: <mensagem em primeira pessoa dizendo o interesse do cliente, ex.: Olá! Tenho interesse no iPhone 13 Pro 128GB, vi no chat do site.>]. O site mostra um botão verde do WhatsApp com essa mensagem.',
    '- Nunca escreva o número do WhatsApp nem links no texto: para fechar, diga para tocar no botão do aparelho (e depois em "Enviar proposta no WhatsApp") ou no botão verde do WhatsApp abaixo.',
    '- CONTATO DO CLIENTE: veja em MEMÓRIA DO CLIENTE se já sabemos o nome dele. Se ainda não sabemos, na sua PRIMEIRA resposta (depois de responder o que ele pediu, em uma frase) pergunte de forma leve, UMA ÚNICA VEZ na conversa, o nome dele e o WhatsApp, dizendo que é para mandar as melhores promoções. Se ele não responder ou não quiser passar, siga o atendimento normalmente e NUNCA peça de novo (a página da proposta pede nome e WhatsApp na hora de enviar).',
    '- Assim que o cliente informar o nome e o WhatsApp (ou só o nome), use a ferramenta salvar_contato. Depois disso, chame ele pelo nome e não peça de novo.',
    '- Fora nome e WhatsApp, não peça nem guarde dados pessoais (CPF, cartão, endereço, e-mail). Não discuta assuntos fora da loja.',
    '- Quando NÃO souber responder com as informações abaixo (estoque de cor específica, prazo de entrega, acessórios, assistência, qualquer coisa que não esteja aqui), diga que a equipe da loja confirma e termine a resposta com uma linha exatamente assim: [WHATSAPP: <mensagem curta, em primeira pessoa, que o cliente vai mandar para a loja com a pergunta específica dele>]. Ex.: [WHATSAPP: Olá! Vocês têm iPhone 15 Pro na cor azul?]. Use essa linha só quando não souber.',
    bfAtiva
      ? '- BLACK FRIDAY ATIVA' + (fimBf ? ' até ' + fimBf.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '') +
        '. Crie senso de urgência de forma honesta: as condições valem só até essa data e o estoque é limitado. Nunca invente quantidades em estoque nem vendas.'
      : '',
    '',
    'LOJA',
    'WhatsApp: ' + (l.whatsapp || '') + ' | Instagram: @' + String(l.instagram || '').replace(/^@/, '') + ' | Endereço: ' + (l.endereco || '') + ' | Horário: ' + (l.horario || ''),
    'Pagamento: Pix ou dinheiro à vista, débito, ou cartão de crédito parcelado (até ' + ((cat.pagamento || {}).maxParcelas || 12) + 'x). NÃO fazemos boleto (nem crediário/carnê).',
    'Sempre que passar valores ou falar de formas de pagamento, avise no fim, em uma frase curta: "Não trabalhamos com boleto."',
    '',
    'GARANTIA (regra fixa, vale mais que qualquer texto abaixo): iPhone novo lacrado 1 ano; iPhone seminovo do iPhone 13 em diante 6 meses; iPhone seminovo abaixo do 13 (11, 12, SE etc.) 4 meses. A garantia de cada aparelho já vem na lista.',
    '',
    'POLÍTICAS (garantia, trocas e outras)',
    ch.politicas || 'Lacrados com a garantia indicada em cada aparelho.',
    ch.informacoes ? '\nINFORMAÇÕES EXTRAS DA LOJA (escritas pelo dono, use nas respostas)\n' + ch.informacoes : '',
    '',
    'MODELOS ACEITOS COMO ENTRADA: ' + aceitos,
    '',
    'APARELHOS À VENDA (modelo|cor|semi=seminovo ou novo|bateria ou configuração|preço à vista|garantia|id)',
    produtos
  ].filter((x) => x !== '').join('\n');
}

// Cupom salvo pelo cliente (pop-up): o valor do desconto vem sempre do catálogo publicado, nunca do navegador
function cupomValido(cat, codigo) {
  const pp = cat.popup || {};
  if (!codigo || !pp.cupom || String(pp.cupom).trim().toUpperCase() !== String(codigo).trim().toUpperCase()) return null;
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // dia em Brasília
  if (pp.fim && hoje > pp.fim) return null;
  const v = Number(pp.desconto) || 0;
  if (v <= 0) return null;
  return { codigo: pp.cupom, valor: v, tipo: pp.descontoTipo === 'pct' ? 'pct' : 'reais', em: pp.descontoEm === 'todos' ? 'todos' : 'iphone' };
}
function descontoCupom(cupom, p) {
  if (!cupom || (cupom.em === 'iphone' && !ehIphone(p))) return 0;
  const d = cupom.tipo === 'pct' ? Math.round(Number(p.preco) * Math.min(cupom.valor, 90)) / 100 : cupom.valor;
  return Math.min(Math.round(d * 100) / 100, Number(p.preco) || 0);
}

function propostaCompra(cat, i, cupom) {
  const p = (cat.produtos || []).find((x) => x.id === i.produto_id);
  if (!p) return { erro: 'Aparelho não encontrado: use o id da lista de aparelhos à venda.' };
  const desc = descontoCupom(cupom, p);
  const final = Math.max(0, Math.round((Number(p.preco) - desc) * 100) / 100);
  return Object.assign({
    aparelho: nome(p) + ' ' + (p.cor || ''),
    valor_a_vista: brl(final),
    no_cartao: parcelas(cat, final)
  }, desc > 0 ? { cupom_aplicado: cupom.codigo + ' (−' + brl(desc) + ')', preco_sem_cupom: brl(p.preco) } : {});
}

function propostaTroca(cat, entrada, cupom) {
  const p = (cat.produtos || []).find((x) => x.id === entrada.produto_id);
  if (!p) return { erro: 'Aparelho não encontrado: use o id da lista de aparelhos à venda.' };
  if (!ehIphone(p)) return { erro: 'Troca só vale na compra de iPhone.' };
  const av = avaliar(cat, entrada);
  if (av.erro || av.recusado || !av.pre_avaliacao) return Object.assign({ aparelho: nome(p) }, av);
  const valorUsado = Number(String(av.pre_avaliacao).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
  const desc = descontoCupom(cupom, p);
  const dif = Math.max(0, Math.round((Number(p.preco) - desc - valorUsado) * 100) / 100);
  return Object.assign({
    aparelho: nome(p) + ' ' + (p.cor || ''),
    diferenca_a_vista: brl(dif),
    diferenca_no_cartao: parcelas(cat, dif)
  }, desc > 0 ? { cupom_aplicado: cupom.codigo + ' (−' + brl(desc) + ')' } : {}, {
    so_se_o_cliente_perguntar: { preco_cheio: brl(p.preco), avaliacao_do_usado: av.pre_avaliacao },
    observacao: av.observacao
  });
}

// Confere nome e WhatsApp; quem grava é o site (na lista de clientes do admin)
function salvarContato(i) {
  const nomeC = String(i.nome || '').replace(/[^\p{L}\p{M} '.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  let zap = String(i.whatsapp || '').replace(/\D/g, '');
  if (zap.length === 10 || zap.length === 11) zap = '55' + zap;
  if (!nomeC) return { erro: 'Nome vazio: pergunte o nome do cliente.' };
  if (zap && !/^55\d{10,11}$/.test(zap)) return { erro: 'WhatsApp inválido: peça o número com DDD (ex.: 48 99999-8888).' };
  return { ok: true, salvo: { nome: nomeC, whatsapp: zap } };
}

// Limite diário por visitante. Usa o Supabase (supabase/chat_limite.sql) quando configurado;
// sem ele, conta na memória do servidor (vale enquanto a função estiver ativa).
const contagem = new Map();
async function dentroDoLimite(req, cat, limite) {
  const ip = String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || 'sem-ip';
  const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const visitante = require('crypto').createHash('sha256').update('rbtech|' + dia + '|' + ip).digest('hex').slice(0, 32);
  const rs = cat.rastreamento || {};
  const url = (String(rs.supabaseUrl || '').match(/https:\/\/[a-z0-9-]+\.supabase\.co/i) || [])[0];
  const chave = String(rs.supabaseChave || '').trim();
  if (url && chave) {
    try {
      const h = { apikey: chave, 'Content-Type': 'application/json' };
      if (/^eyJ/.test(chave)) h.Authorization = 'Bearer ' + chave;
      const r = await fetch(url + '/rest/v1/rpc/chat_contar', { method: 'POST', headers: h, body: JSON.stringify({ p_visitante: visitante, p_limite: limite }) });
      if (r.ok) return (await r.json()) !== false;
    } catch (e) { /* cai na contagem em memória */ }
  }
  const k = dia + visitante;
  const n = (contagem.get(k) || 0) + 1;
  if (contagem.size > 5000) contagem.clear();
  contagem.set(k, n);
  return n <= limite;
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
    name: 'salvar_contato',
    description: 'Salva o nome e o WhatsApp do cliente para a loja mandar promoções. Use assim que ele informar.',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do cliente, ex.: João' },
        whatsapp: { type: 'string', description: 'WhatsApp com DDD, só números, ex.: 48999998888; vazio se ele não passou' }
      },
      required: ['nome', 'whatsapp'],
      additionalProperties: false
    },
    strict: true
  },
  {
    name: 'proposta_compra',
    description: 'Valor à vista e parcelas de um aparelho da lista para compra sem entrada, já com o cupom do cliente descontado (se ele tiver). Use sempre que for passar o valor de um aparelho.',
    input_schema: { type: 'object', properties: { produto_id: { type: 'string', description: 'id do aparelho na lista' } }, required: ['produto_id'], additionalProperties: false },
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
  // Proteção contra abuso: limite de mensagens por visitante (IP) por dia
  const limite = Math.max(5, Math.min(500, Number((cat.chat || {}).limiteDia) || LIMITE_DIA_PADRAO));
  if (!(await dentroDoLimite(req, cat, limite))) {
    return res.status(429).json({ erro: 'Você atingiu o limite de mensagens do chat por hoje.', limite: true });
  }

  const mem = (req.body || {}).memoria || {};
  const cupom = cupomValido(cat, mem.cupom && typeof mem.cupom === 'object' ? String(mem.cupom.codigo || '').slice(0, 40) : '');
  const e0 = mem.entrada && typeof mem.entrada === 'object' ? mem.entrada : null;
  const ent = e0 && typeof e0.modelo === 'string' ? {
    modelo: e0.modelo.slice(0, 40), armazenamento: String(e0.armazenamento || '').slice(0, 10),
    bateria_abaixo_de_80: !!e0.bateria_abaixo_de_80,
    defeitos: Array.isArray(e0.defeitos) ? e0.defeitos.slice(0, 8).map((d) => String(d).slice(0, 60)) : []
  } : null;
  const descricao = ent ? ent.modelo + ' ' + ent.armazenamento + ', bateria ' + (ent.bateria_abaixo_de_80 ? 'abaixo de 80%' : '80% ou mais') +
    ', ' + (ent.defeitos.length ? 'detalhes: ' + ent.defeitos.join(', ') : 'sem detalhes') : '';
  const c0 = mem.contato && typeof mem.contato === 'object' ? mem.contato : null;
  const nomeCliente = c0 && typeof c0.nome === 'string' ? c0.nome.replace(/[^\p{L}\p{M} '.-]/gu, '').slice(0, 40).trim() : '';
  const memContato = nomeCliente
    ? 'O nome do cliente é ' + nomeCliente + (c0.whatsapp ? ' e o WhatsApp dele já está salvo' : ' (ele não passou o WhatsApp)') + '. Chame ele pelo nome e NÃO peça nome nem WhatsApp de novo.'
    : 'Ainda não sabemos o nome nem o WhatsApp do cliente: peça na sua primeira resposta (veja CONTATO DO CLIENTE).';
  const memCupom = cupom
    ? 'O cliente tem o cupom ' + cupom.codigo + ' salvo: ' + (cupom.tipo === 'pct' ? cupom.valor + '% de desconto' : brl(cupom.valor) + ' de desconto') +
      (cupom.em === 'iphone' ? ' (só em iPhones)' : '') + '. As ferramentas proposta_compra e proposta_troca já aplicam esse desconto.'
    : 'O cliente não tem cupom de desconto salvo.';
  const memoria = 'MEMÓRIA DO CLIENTE\n' + memContato + '\n' + memCupom + '\n' + (!ent
    ? 'Primeira conversa: ainda não sabemos se ele tem iPhone de entrada. Siga o passo 1 quando ele perguntar por um iPhone.'
    : mem.anterior
      ? 'Em uma conversa anterior o cliente informou este iPhone de entrada: ' + descricao + '. O site já abriu esta conversa nova perguntando: "Da última vez você falou do seu ' + ent.modelo + ' ' + ent.armazenamento + ' para dar de entrada. Ainda tem interesse em dar ele de entrada?". A primeira mensagem do cliente pode ser a resposta a isso. Se confirmar, use proposta_troca com esse aparelho e mande só a diferença; se não, trate como compra direta (ou pegue o novo aparelho de entrada). Se ele não respondeu a isso e perguntou outra coisa, pergunte de forma natural se ainda vai dar esse aparelho de entrada antes de mandar valores.'
      : 'Nesta conversa o cliente já informou este iPhone de entrada: ' + descricao + '. Não pergunte de novo: para qualquer iPhone que ele perguntar, use proposta_troca com esse aparelho e mande só a diferença.');

  const client = new Anthropic();
  const conversa = mensagens.slice();
  let entradaNova = null; // devolvida ao site para guardar no celular do cliente
  let contatoNovo = null; // nome e WhatsApp que o cliente passou (o site salva na lista de clientes)
  let produtoProposta = null; // aparelho da última proposta: conta como interesse do cliente
  const uso = { entrada: 0, cache_lido: 0, cache_gravado: 0, saida: 0, rodadas: 0 };
  const registrarUso = () => console.log('rbchat uso', JSON.stringify(uso));
  try {
    for (let rodada = 0; rodada < 4; rodada++) {
      // Cache: ferramentas + instruções + catálogo (fixos) formam o prefixo cacheado;
      // a memória do cliente (muda a cada pessoa) vem depois do ponto de cache.
      const resp = await client.messages.create({
        model: MODELO,
        max_tokens: MAX_SAIDA,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        system: [{ type: 'text', text: sistema(cat), cache_control: { type: 'ephemeral' } }, { type: 'text', text: memoria }],
        tools: FERRAMENTAS,
        messages: conversa
      });
      const u = resp.usage || {};
      uso.entrada += u.input_tokens || 0; uso.cache_lido += u.cache_read_input_tokens || 0;
      uso.cache_gravado += u.cache_creation_input_tokens || 0; uso.saida += u.output_tokens || 0; uso.rodadas++;
      if (resp.stop_reason === 'refusal') {
        return res.status(200).json({ resposta: 'Sobre isso não consigo ajudar por aqui. Posso te ajudar com preços, parcelas, trocas e garantia, ou é só chamar a gente no WhatsApp! 😉' });
      }
      if (resp.stop_reason !== 'tool_use') {
        registrarUso();
        let texto = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        // passou do limite de tamanho: corta no fim da última frase completa
        if (resp.stop_reason === 'max_tokens') {
          texto = texto.replace(/\[[A-Z]+:?[^\]]*$/, '').trim();
          const fim = Math.max(texto.lastIndexOf('. '), texto.lastIndexOf('!'), texto.lastIndexOf('?'), texto.lastIndexOf('\n'));
          if (fim > 40) texto = texto.slice(0, fim + 1).trim();
        }
        // pedido de WhatsApp com a pergunta do cliente (vira um botão no chat)
        let whatsapp = null;
        texto = texto.replace(/\[WHATSAPP:\s*([^\]]{3,300})\]/i, (m, q) => { whatsapp = q.trim(); return ''; }).trim();
        // botões de resposta rápida no chat
        let sugestoes = null;
        texto = texto.replace(/\[FAIXAS\]/gi, () => { sugestoes = FAIXAS; return ''; })
          .replace(/\[PLATAFORMA\]/gi, () => { sugestoes = sugestoes || ['🍎 iPhone', '🤖 Android']; return ''; }).trim();
        // [REPARO] vira o botão do pedido de orçamento de conserto (sistema da loja)
        let reparo = null;
        texto = texto.replace(/\[REPARO\]/gi, () => { const r = cat.reparos || {}; if (r.ativo !== false && /^https:\/\//.test(r.link || '')) reparo = r.link; return ''; }).trim();
        // [VER: ids] vira botões que abrem os aparelhos no site
        let produtos = [];
        texto = texto.replace(/\[VER:\s*([^\]]{1,300})\]/gi, (m, ids) => {
          ids.split(/[,\s]+/).forEach((id) => {
            const p = (cat.produtos || []).find((x) => x.id === id.trim());
            if (p && produtos.length < 3 && !produtos.some((x) => x.id === p.id)) produtos.push({ id: p.id, nome: nome(p), cor: p.cor || '' });
          });
          return '';
        }).trim();
        // número solto no texto não é clicável: o botão do WhatsApp cobre isso
        const zapLoja = String((cat.loja || {}).whatsapp || '').replace(/\D/g, '');
        if (zapLoja) texto = texto.split(zapLoja).join('pelo botão abaixo');
        if (produtoProposta && !produtos.some((x) => x.id === produtoProposta.id) && produtos.length < 3) produtos.unshift(produtoProposta);
        if (produtos.length && !whatsapp) whatsapp = 'Olá! Vi no chat do site e tenho interesse no ' + produtos.map((p) => p.nome).join(' ou no ') + '.';
        // avaliação do iPhone de entrada para a página de proposta pronta (aberta pelos botões dos aparelhos)
        let avaliacao = null;
        const entAtual = entradaNova || ent;
        if (produtos.length && entAtual) {
          const av = avaliar(cat, entAtual);
          avaliacao = {
            descricao: entAtual.modelo + ' ' + entAtual.armazenamento + ' · bateria ' + (entAtual.bateria_abaixo_de_80 ? 'abaixo de 80%' : '80% ou mais') +
              ' · ' + ((entAtual.defeitos || []).length ? entAtual.defeitos.join(', ') : 'sem detalhes'),
            status: av.erro ? 'avaliar' : av.recusado ? 'recusado' : av.pre_avaliacao ? 'ok' : 'avaliar',
            valor: av.pre_avaliacao ? Number(String(av.pre_avaliacao).replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0
          };
        }
        return res.status(200).json({ resposta: texto || 'Pode repetir a pergunta?', entrada: entradaNova, whatsapp, sugestoes, produtos, contato: contatoNovo, avaliacao, reparo });
      }
      conversa.push({ role: 'assistant', content: resp.content });
      const resultados = resp.content.filter((b) => b.type === 'tool_use').map((b) => {
        let saida;
        try {
          saida = b.name === 'calcular_parcelas'
            ? { valor: brl(b.input.valor), a_vista: brl(b.input.valor), cartao: parcelas(cat, Number(b.input.valor) || 0) }
            : b.name === 'avaliar_entrada' ? avaliar(cat, b.input)
              : b.name === 'proposta_troca' ? propostaTroca(cat, b.input, cupom)
                : b.name === 'proposta_compra' ? propostaCompra(cat, b.input, cupom)
                : b.name === 'salvar_contato' ? salvarContato(b.input) : { erro: 'ferramenta desconhecida' };
        } catch (e) {
          return { type: 'tool_result', tool_use_id: b.id, content: 'erro: ' + e.message, is_error: true };
        }
        if (b.name === 'salvar_contato' && saida && saida.salvo) contatoNovo = saida.salvo;
        if ((b.name === 'proposta_troca' || b.name === 'proposta_compra') && saida && !saida.erro) {
          const p = (cat.produtos || []).find((x) => x.id === b.input.produto_id);
          if (p) produtoProposta = { id: p.id, nome: nome(p), cor: p.cor || '' };
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
