/* RB Tech Celulares — funções compartilhadas entre a loja e o admin */
(function (global) {
  'use strict';

  const DRAFT_KEY = 'rbtech_rascunho_v1';
  const CHECKLIST_ITENS = [
    { id: 'faceid', label: 'Face ID' },
    { id: 'bateria', label: 'Bateria' },
    { id: 'sistema', label: 'Sistema' },
    { id: 'cameras', label: 'Câmeras' },
    { id: 'tela', label: 'Tela' },
    { id: 'tampa', label: 'Tampa traseira' }
  ];
  const STATUS = {
    ok: { label: 'Perfeito', icon: '✓' },
    obs: { label: 'Observação', icon: '!' },
    ruim: { label: 'Com defeito', icon: '✕' }
  };

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (v) => brl.format(Math.round((Number(v) || 0) * 100) / 100);
  const round2 = (v) => Math.round(v * 100) / 100;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function lerRascunho() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Carrega o catálogo publicado. Com ?preview=1 usa o rascunho do admin neste navegador.
  async function carregarCatalogo({ preferirRascunho = false } = {}) {
    if (preferirRascunho) {
      const d = lerRascunho();
      if (d) return d;
    }
    const res = await fetch('data/catalogo.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Não foi possível carregar o catálogo');
    return res.json();
  }

  /* ---------- Avaliação do aparelho de entrada ---------- */
  // sel = { modeloId, armazenamento, bateriaId, defeitos: [ids] }
  function avaliar(cat, sel) {
    const av = cat.avaliacao;
    const modelo = av.modelos.find((m) => m.id === sel.modeloId);
    if (!modelo) return null;
    const base = Number(modelo.valores[sel.armazenamento]) || 0;
    const descontos = [];
    const bat = av.bateria.find((b) => b.id === sel.bateriaId);
    if (bat && Number(bat.desconto) > 0) descontos.push({ label: 'Bateria ' + bat.label, valor: Number(bat.desconto) });
    let recusado = null;
    (sel.defeitos || []).forEach((id) => {
      const d = av.defeitos.find((x) => x.id === id);
      if (!d) return;
      if (d.recusa) recusado = d.label;
      else if (Number(d.desconto) > 0) descontos.push({ label: d.label, valor: Number(d.desconto) });
    });
    const totalDesc = descontos.reduce((s, d) => s + d.valor, 0);
    return {
      modelo: modelo.nome,
      armazenamento: sel.armazenamento,
      base,
      descontos,
      recusado,
      consultar: !!modelo.whatsapp && !recusado, // sem valor fixo: a loja avalia pelo WhatsApp
      total: recusado || modelo.whatsapp ? 0 : Math.max(0, base - totalDesc)
    };
  }

  // '256' → '256GB', '1024' → '1TB'
  function fmtGB(gb) {
    const n = Number(gb);
    return n >= 1024 && n % 1024 === 0 ? n / 1024 + 'TB' : gb + 'GB';
  }

  /* ---------- Pagamento ---------- */
  // Acréscimo da maquininha aplicado sobre o valor: total = valor × (1 + taxa%).
  // Parcelas sem taxa cadastrada não são oferecidas.
  function parcelas(cat, valor) {
    const pg = cat.pagamento;
    const max = Math.max(1, Math.min(24, Number(pg.maxParcelas) || 12));
    const lista = [];
    for (let n = 1; n <= max; n++) {
      const t = pg.taxas[n];
      if (t === undefined || t === null || t === '') continue;
      const taxa = Number(t) || 0;
      const total = round2(valor * (1 + taxa / 100));
      lista.push({ n, taxa, total, parcela: round2(total / n) });
    }
    if (!lista.length) lista.push({ n: 1, taxa: 0, total: round2(valor), parcela: round2(valor) });
    return lista;
  }

  function valorPix(cat, valor) {
    const d = Number(cat.pagamento.descontoPix) || 0;
    return round2(valor * (1 - d / 100));
  }

  function linkWhats(cat, texto) {
    const num = String(cat.loja.whatsapp || '').replace(/\D/g, '');
    return 'https://wa.me/' + num + (texto ? '?text=' + encodeURIComponent(texto) : '');
  }

  /* ---------- Categorias ---------- */
  const CATEGORIAS = [
    { id: 'iphone', nome: 'iPhones', icone: '📱' },
    { id: 'macbook', nome: 'MacBooks', icone: '💻' },
    { id: 'xiaomi', nome: 'Xiaomi', icone: '📱' },
    { id: 'ipad', nome: 'iPads', icone: '📲' }
  ];
  function categoria(p) {
    if (p.categoria) return p.categoria;
    const m = String(p.modelo || '');
    if (/macbook/i.test(m)) return 'macbook';
    if (/ipad/i.test(m)) return 'ipad';
    if (/xiaomi|redmi|poco/i.test(m)) return 'xiaomi';
    return 'iphone';
  }
  const ehIphone = (p) => categoria(p) === 'iphone';
  const ehMac = (p) => categoria(p) === 'macbook';
  const ehNovo = (p) => /^novo|lacrad/i.test(p.condicao || '');

  // Onde o aparelho aparece: promoção do topo, vitrine da página inicial e catálogo
  const noTopo = (p) => !!p.topo;
  const naVitrine = (p) => (p.vitrine != null ? !!p.vitrine : !!p.destaque);
  const noCatalogo = (p) => p.disponivel !== false;
  const ativo = (p) => noTopo(p) || naVitrine(p) || noCatalogo(p);
  const emPromocao = (p) => noTopo(p) || naVitrine(p);

  // Saúde da bateria: % informada; aparelho novo = 100%; senão a faixa da linha
  // (Admin › iPhones, ex.: "80% a 83%"); sem nada disso, "revisada"
  function batTexto(p, cat) {
    if (!ehIphone(p)) return Number(p.bateria) > 0 ? Number(p.bateria) + '%' : '';
    if (Number(p.bateria) > 0) return Number(p.bateria) + '%';
    if (/^novo|lacrad/i.test(p.condicao || '')) return '100%';
    const m = String(p.modelo || '').match(/iPhone\s*(\d+)/i);
    const faixa = m && cat && cat.bateriaLinha ? String(cat.bateriaLinha[m[1]] || '').trim() : '';
    return faixa || 'revisada';
  }

  // Número usado no ícone e na ordenação (o maior da faixa)
  function batNumero(p, cat) {
    const ns = (batTexto(p, cat).match(/\d+/g) || []).map(Number);
    return ns.length ? Math.max(...ns) : 0;
  }

  function nomeProduto(p) {
    return [p.modelo, p.armazenamento].filter(Boolean).join(' ');
  }

  // Ilustração de iPhone usada quando o produto ainda não tem foto
  // Ilustração de MacBook usada quando o produto ainda não tem foto
  function laptopSVG(hex) {
    const c = hex || '#d9dadc';
    return (
      '<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="svg-mac">' +
      '<rect x="48" y="26" width="204" height="132" rx="10" fill="' + c + '"/>' +
      '<rect x="56" y="34" width="188" height="116" rx="4" fill="#0d0d0d"/>' +
      '<rect x="56" y="34" width="188" height="116" rx="4" fill="url(#mg)" opacity=".5"/>' +
      '<defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
      '<rect x="138" y="36" width="24" height="5" rx="2.5" fill="#000"/>' +
      '<path d="M22 160h256l-10 14H32z" fill="' + c + '"/>' +
      '<path d="M22 160h256l-10 14H32z" fill="#000" fill-opacity=".12"/>' +
      '<rect x="128" y="160" width="44" height="4" rx="2" fill="#000" fill-opacity=".2"/>' +
      '</svg>'
    );
  }

  // Ilustração de iPad
  function tabletSVG(hex) {
    const c = hex || '#d9dadc';
    return (
      '<svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" class="svg-tab">' +
      '<rect x="30" y="20" width="180" height="260" rx="16" fill="' + c + '"/>' +
      '<rect x="30" y="20" width="180" height="260" rx="16" fill="#000" fill-opacity=".08"/>' +
      '<rect x="44" y="34" width="34" height="34" rx="9" fill="#000" fill-opacity=".22"/>' +
      '<circle cx="61" cy="51" r="9" fill="#111"/><circle cx="61" cy="51" r="5" fill="#2b3240"/>' +
      '<path d="M120 172c-6 0-9-4-14-4s-9 4-13 4c-8 0-14-13-14-24 0-12 7-18 14-18 5 0 9 3 13 3s7-3 13-3c5 0 10 2 13 7-4 3-7 7-7 12 0 6 4 11 9 13-3 6-7 10-14 10zm-6-46c0-6 5-11 10-11 1 6-5 12-10 11z" fill="#000" fill-opacity=".16"/>' +
      '</svg>'
    );
  }

  // Fotos dos modelos (img/modelos), recortadas com fundo transparente
  const FOTOS_MODELO = ['11', '11-pro', '11-pro-max', '12', '12-pro', '12-pro-max', '13', '13-pro', '13-pro-max',
    '14', '14-plus', '14-pro', '14-pro-max', '15', '15-plus', '15-pro', '15-pro-max', '16', '16-plus', '16-pro', '16-pro-max',
    '17', 'air', '17-pro', '17-pro-max', '18-pro', '18-pro-max'];
  function fotoModelo(p) {
    if (!ehIphone(p)) return '';
    const s = String(p.modelo || '').toLowerCase().replace(/^iphone\s*/, '').trim().replace(/\s+/g, '-');
    return FOTOS_MODELO.includes(s) ? 'img/modelos/iphone-' + s + '.webp' : '';
  }

  // Imagem do produto: foto própria > foto do modelo > ilustração
  function imagemProduto(p, lazy) {
    const alt = esc(nomeProduto(p));
    if (p.fotos && p.fotos[0]) return '<img class="img-foto" src="' + esc(p.fotos[0]) + '" alt="' + alt + '"' + (lazy ? ' loading="lazy"' : '') + '>';
    const m = fotoModelo(p);
    if (m) return '<img class="img-modelo" src="' + m + '" alt="' + alt + '"' + (lazy ? ' loading="lazy"' : '') + '>';
    return produtoSVG(p);
  }

  function produtoSVG(p) {
    const c = categoria(p);
    if (c === 'macbook') return laptopSVG(p.corHex);
    if (c === 'ipad') return tabletSVG(p.corHex);
    return phoneSVG(p.corHex, c === 'iphone');
  }

  function phoneSVG(hex, comLogo) {
    const c = hex || '#2a2a2a';
    return (
      '<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><linearGradient id="g' + c.replace('#', '') + '" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>' +
      '<rect x="45" y="20" width="110" height="260" rx="22" fill="' + c + '"/>' +
      '<rect x="45" y="20" width="110" height="260" rx="22" fill="url(#g' + c.replace('#', '') + ')"/>' +
      '<rect x="56" y="31" width="58" height="62" rx="16" fill="#000" fill-opacity=".22"/>' +
      '<circle cx="72" cy="48" r="11" fill="#111"/><circle cx="72" cy="48" r="6" fill="#2b3240"/>' +
      '<circle cx="97" cy="76" r="11" fill="#111"/><circle cx="97" cy="76" r="6" fill="#2b3240"/>' +
      '<circle cx="100" cy="62" r="3" fill="#ddd" fill-opacity=".6"/>' +
      (comLogo === false ? '' : '<path d="M100 170c-6 0-9-4-14-4s-9 4-13 4c-8 0-14-13-14-24 0-12 7-18 14-18 5 0 9 3 13 3s7-3 13-3c5 0 10 2 13 7-4 3-7 7-7 12 0 6 4 11 9 13-3 6-7 10-14 10zm-6-46c0-6 5-11 10-11 1 6-5 12-10 11z" fill="#000" fill-opacity=".18"/>') +
      '</svg>'
    );
  }

  async function sha256(texto) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- Textos editáveis do site ---------- */
  // *trecho* fica em amarelo; {parcelas} vira o máximo de parcelas.
  const TEXTOS = [
    { grupo: 'Topo do site', itens: [
      ['topoSlogan', 'Frase ao lado da logo', 'Procedência e *garantia* de verdade.']
    ] },
    { grupo: 'Faixa de confiança (abaixo do topo)', itens: [
      ['conf1T', 'Item 1 · título', 'Aparelhos revisados'], ['conf1S', 'Item 1 · detalhe', 'Checklist completo em cada iPhone'],
      ['conf2T', 'Item 2 · título', 'Até {parcelas}x no cartão'], ['conf2S', 'Item 2 · detalhe', 'Pix, débito e crédito'],
      ['conf3T', 'Item 3 · título', 'Seu usado vale como entrada'], ['conf3S', 'Item 3 · detalhe', 'Pré-avaliação na hora'],
      ['conf4T', 'Item 4 · título', 'Atendimento personalizado'], ['conf4S', 'Item 4 · detalhe', 'Tire dúvidas pelo WhatsApp']
    ] },
    { grupo: 'Página inicial · promoções e categorias', itens: [
      ['vitrineT', 'Título das promoções', 'Promoções da *semana*'],
      ['vitrineS', 'Texto das promoções', 'Toque no aparelho para ver fotos, checklist e simular com o seu iPhone de entrada.'],
      ['categoriasT', 'Título das categorias', 'Navegue por *categoria*']
    ] },
    { grupo: 'Página Catálogo', itens: [
      ['catalogoT', 'Título', 'Catálogo *completo*'],
      ['catalogoS', 'Texto', 'iPhones novos e seminovos, MacBooks, Xiaomi e iPads. Toque no aparelho para simular a troca e as parcelas.'],
      ['catalogoVazio', 'Categoria sem aparelhos', 'Em breve novidades nesta categoria. Chame no WhatsApp que a gente procura para você!']
    ] },
    { grupo: 'Consultoria ("Não sabe qual escolher?")', itens: [
      ['consultaT', 'Título', 'Não sabe qual *escolher?*'],
      ['consultaS', 'Texto', 'Diga como você usa o celular — fotos, jogos, trabalho, bateria — e a gente indica o iPhone ideal para o seu bolso.'],
      ['consultaB', 'Botão', 'Me ajude a escolher'],
      ['consultaMsg', 'Mensagem enviada no WhatsApp', 'Olá! Não sei qual iPhone escolher. Pode me ajudar?']
    ] },
    { grupo: 'Avaliação do usado', itens: [
      ['avaliarT', 'Título', 'Quanto vale o seu iPhone?'],
      ['avaliarS', 'Texto', 'Responda em 30 segundos e veja quanto o seu aparelho abate no próximo. Depois é só escolher o iPhone na vitrine.']
    ] },
    { grupo: 'Por que escolher', itens: [
      ['porqueT', 'Título', 'Por que escolher a *RB Tech*'],
      ['porque1T', 'Item 1 · título', 'Aparelhos revisados'], ['porque1S', 'Item 1 · texto', 'Cada iPhone passa por checklist de Face ID, bateria, sistema, câmeras, tela e tampa traseira.'],
      ['porque2T', 'Item 2 · título', 'Atendimento personalizado'], ['porque2S', 'Item 2 · texto', 'Ajudamos você a escolher o modelo certo e tiramos todas as dúvidas pelo WhatsApp.'],
      ['porque3T', 'Item 3 · título', 'Seu usado na troca'], ['porque3S', 'Item 3 · texto', 'Pré-avaliação online do seu iPhone na hora, abatendo do valor do próximo.'],
      ['porque4T', 'Item 4 · título', 'Pagamento facilitado'], ['porque4S', 'Item 4 · texto', 'Pix, débito ou crédito em até {parcelas}x, com as parcelas já calculadas no site.']
    ] },
    { grupo: 'Chamada final (bloco amarelo)', itens: [
      ['ctaT', 'Título', 'Seu próximo iPhone pode estar a uma mensagem de distância.'],
      ['ctaS', 'Texto', 'Encontre o modelo ideal para você.'],
      ['ctaB', 'Botão', 'Falar no WhatsApp']
    ] },
    { grupo: 'Aviso ao enviar a proposta', itens: [
      ['avisoT', 'Título', 'Nos vemos no *WhatsApp* ❤️'],
      ['avisoS', 'Texto', 'Os valores da proposta são apenas simulações.\nA avaliação do seu usado pode mudar conforme a avaliação do consultor!'],
      ['avisoB', 'Botão', 'Continuar para o WhatsApp']
    ] },
    { grupo: 'Mensagens de WhatsApp', itens: [
      ['msgGeral', 'Botões gerais de WhatsApp', 'Olá! Vim pelo site e gostaria de atendimento.']
    ] }
  ];

  function texto(cat, chave) {
    const t = (cat.textos || {})[chave];
    if (t != null && String(t).trim() !== '') return String(t);
    for (const g of TEXTOS) for (const it of g.itens) if (it[0] === chave) return it[2];
    return '';
  }

  // Escapa, aplica *destaque* e {parcelas}
  function formatar(cat, str) {
    return esc(str)
      .replace(/\{parcelas\}/g, String(cat.pagamento.maxParcelas))
      .replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>')
      .replace(/\n/g, '<br>');
  }

  /* ---------- Registro de cliques (Supabase) ---------- */
  function sessao() {
    try {
      let id = sessionStorage.getItem('rbtech_sessao');
      if (!id) { id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('rbtech_sessao', id); }
      return id;
    } catch (e) { return ''; }
  }

  // Chave antiga (JWT "eyJ…") vai também no Authorization; a nova "sb_publishable_…" só no apikey
  function cabecalhosSupabase(chave) {
    const h = { apikey: chave, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(chave)) h.Authorization = 'Bearer ' + chave;
    return h;
  }

  // Aceita o que vier colado da tela do Supabase (ex.: NEXT_PUBLIC_SUPABASE_URL=https://…, aspas, espaços)
  function limparSupabase(url, chave) {
    const semPrefixo = (v) => String(v || '').trim().replace(/^[A-Z0-9_]+\s*=\s*/, '').replace(/^["']|["';]$/g, '').trim();
    const m = String(url || '').match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    return { url: m ? m[0] : semPrefixo(url).replace(/\/+$/, ''), chave: semPrefixo(chave) };
  }

  // tipo: visita | clique | whatsapp | popup
  function registrar(cat, tipo, dados) {
    const r0 = cat.rastreamento || {};
    const lim = limparSupabase(r0.supabaseUrl, r0.supabaseChave);
    const r = { supabaseUrl: lim.url, supabaseChave: lim.chave };
    if (!r.supabaseUrl || !r.supabaseChave || registrar.desligado) return;
    const d = dados || {};
    const corpo = {
      tipo,
      produto_id: d.produto ? d.produto.id : null,
      produto_nome: d.produto ? nomeProduto(d.produto) + ' ' + (d.produto.cor || '') : null,
      origem: (d.origem || '').slice(0, 39) || null,
      detalhe: (d.detalhe || '').slice(0, 199) || null,
      sessao: sessao()
    };
    try {
      fetch(r.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/eventos', {
        method: 'POST',
        keepalive: true,
        headers: Object.assign(cabecalhosSupabase(r.supabaseChave), { Prefer: 'return=minimal' }),
        body: JSON.stringify(corpo)
      }).catch(() => {});
    } catch (e) { /* registro nunca atrapalha o cliente */ }
  }

  /* ---------- Pop-up de campanha ---------- */
  function campanhaVigente(pp) {
    if (!pp || !pp.ativo) return false;
    const hoje = new Date();
    const dia = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
    if (pp.inicio && dia < pp.inicio) return false;
    if (pp.fim && dia > pp.fim) return false;
    return true;
  }

  // Monta o pop-up na tela. onAcao(popup) é chamado no botão principal.
  function abrirPopup(cat, onAcao) {
    const pp = cat.popup || {};
    const antigo = document.getElementById('rb-popup');
    if (antigo) antigo.remove();
    const el = document.createElement('div');
    el.id = 'rb-popup';
    el.className = 'rbp';
    el.innerHTML =
      '<div class="rbp-back" data-x></div>' +
      '<div class="rbp-box" role="dialog" aria-modal="true" aria-labelledby="rbp-t">' +
        '<button class="rbp-close" data-x aria-label="Fechar">×</button>' +
        (pp.imagem ? '<img class="rbp-img" src="' + esc(pp.imagem) + '" alt="">' : '') +
        '<div class="rbp-body">' +
          (pp.selo ? '<span class="rbp-selo">' + esc(pp.selo) + '</span>' : '') +
          '<h2 id="rbp-t">' + formatar(cat, pp.titulo || '') + '</h2>' +
          (pp.texto ? '<p class="rbp-txt">' + formatar(cat, pp.texto) + '</p>' : '') +
          (pp.cupom ? '<div class="rbp-cupom"><span>Cupom</span><strong>' + esc(pp.cupom) + '</strong><button type="button" data-copiar>Copiar código</button></div>' : '') +
          (pp.botaoTexto ? '<button type="button" class="rbp-btn" data-acao>' + esc(pp.botaoTexto) + '</button>' : '') +
          '<button type="button" class="rbp-no" data-x>Agora não</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    const fechar = () => { el.remove(); document.removeEventListener('keydown', esc_); };
    const esc_ = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc_);
    el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', fechar));
    const cp = el.querySelector('[data-copiar]');
    if (cp) cp.addEventListener('click', () => {
      const ok = () => { cp.textContent = 'Copiado!'; };
      if (navigator.clipboard) navigator.clipboard.writeText(pp.cupom).then(ok, ok); else ok();
    });
    const ac = el.querySelector('[data-acao]');
    if (ac) ac.addEventListener('click', () => { if (onAcao) onAcao(pp, fechar); else fechar(); });
    return el;
  }

  // Aviso simples com confirmação (usa o mesmo visual do pop-up). titulo/texto já formatados.
  function abrirAviso(o) {
    const antigo = document.getElementById('rb-aviso');
    if (antigo) antigo.remove();
    const el = document.createElement('div');
    el.id = 'rb-aviso';
    el.className = 'rbp';
    el.innerHTML =
      '<div class="rbp-back" data-x></div>' +
      '<div class="rbp-box" role="dialog" aria-modal="true" aria-labelledby="rba-t">' +
        '<button class="rbp-close" data-x aria-label="Fechar">×</button>' +
        '<div class="rbp-body">' +
          '<span class="rbp-ic" aria-hidden="true">!</span>' +
          '<h2 id="rba-t">' + o.titulo + '</h2>' +
          (o.texto ? '<p class="rbp-txt">' + o.texto + '</p>' : '') +
          '<button type="button" class="rbp-btn" data-ok>' + esc(o.botao || 'Continuar') + '</button>' +
          '<button type="button" class="rbp-no" data-x>Voltar e revisar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    const fechar = () => { el.remove(); document.removeEventListener('keydown', tecla); };
    const tecla = (e) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', fechar));
    el.querySelector('[data-ok]').addEventListener('click', () => { fechar(); if (o.onOk) o.onOk(); });
    el.querySelector('[data-ok]').focus();
  }

  global.RB = {
    DRAFT_KEY, CHECKLIST_ITENS, STATUS,
    money, esc, lerRascunho, carregarCatalogo,
    TEXTOS, texto, formatar, registrar, limparSupabase, abrirAviso, cabecalhosSupabase, campanhaVigente, abrirPopup,
    avaliar, fmtGB, parcelas, valorPix, linkWhats, batTexto, batNumero, CATEGORIAS, categoria, ehIphone, ehMac, ehNovo, noTopo, naVitrine, noCatalogo, ativo, emPromocao, nomeProduto, phoneSVG, produtoSVG, fotoModelo, imagemProduto, sha256
  };
})(window);
