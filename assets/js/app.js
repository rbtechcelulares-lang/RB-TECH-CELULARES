/* RB Tech Celulares — vitrine, detalhe do produto e simulador */
(function () {
  'use strict';
  const { money, esc } = RB;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const params = new URLSearchParams(location.search);
  const preview = params.has('preview');
  let cat = null;
  let origemClique = 'link'; // de onde veio o clique que abriu o aparelho
  let nomeCliente = '';
  try { nomeCliente = localStorage.getItem('rbtech_nome') || ''; } catch (e) { /* sem storage */ }

  // Cupom que o cliente salvou pelo pop-up (vale até a data final da campanha)
  function cupomSalvo() {
    try {
      const c = JSON.parse(localStorage.getItem('rbtech_cupom') || 'null');
      if (!c || !c.codigo) return null;
      const hoje = new Date().toISOString().slice(0, 10);
      if (c.fim && hoje > c.fim) return null;
      return c;
    } catch (e) { return null; }
  }

  const nomeValido = (n) => n.trim().split(/\s+/).filter((x) => x.length >= 2).length >= 2;
  const pagina = document.body.dataset.pagina || 'inicio';

  // Entrada compartilhada entre a avaliação da página e o detalhe do produto
  const entrada = { usar: null, modeloId: '', armazenamento: '', bateriaId: '', temDetalhe: null, defeitos: [] };

  init().catch((e) => {
    console.error(e);
    $('#grid').innerHTML = '<p class="empty">Não foi possível carregar os produtos. Atualize a página.</p>';
  });

  async function init() {
    cat = await RB.carregarCatalogo({ preferirRascunho: preview });
    if (preview && RB.lerRascunho()) $('#preview-bar').hidden = false;
    if (preview) RB.registrar.desligado = true; // pré-visualização do admin não conta clique
    entrada.bateriaId = (cat.avaliacao.bateria[0] || {}).id || '';
    preencherLoja();
    if (preview) $$('a[href^="catalogo.html"], a[href="index.html"], a[href^="index.html#"]').forEach((a) => { a.href = linkPagina(a.getAttribute('href').replace(/#.*$/, '')) + (a.getAttribute('href').match(/#.*$/) || [''])[0]; });
    if (pagina === 'catalogo') {
      montarCatalogo();
    } else {
      renderInicio();
      // topo: os 3 modelos Pro/Pro Max mais caros do site (um por modelo), o mais caro no centro
      const porModelo = {};
      todos().filter((p) => RB.ehIphone(p) && /pro/i.test(p.modelo) && RB.fotoModelo(p))
        .forEach((p) => { if (!porModelo[p.modelo] || p.preco > porModelo[p.modelo].preco) porModelo[p.modelo] = p; });
      const top = Object.values(porModelo).sort((a, b) => b.preco - a.preco).slice(0, 3);
      const vitrine = top.length === 3 ? [top[1], top[0], top[2]] : top;
      $('#hero-art').innerHTML = vitrine.map((p) => (RB.fotoModelo(p) ? '<img src="' + RB.fotoModelo(p) + '" alt="">' : RB.phoneSVG(p.corHex))).join('');
      renderDestaque();
      montarAvaliacaoPagina();
    }
    window.addEventListener('hashchange', rota);
    $$('[data-fechar]').forEach((el) => el.addEventListener('click', fecharSheet));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharSheet(); });
    document.addEventListener('click', (e) => {
      const o = e.target.closest('[data-origem]');
      if (o) origemClique = o.dataset.origem;
    }, true);
    $$('.js-whats').forEach((a) => a.addEventListener('click', () => RB.registrar(cat, 'whatsapp', { origem: a.dataset.origem || 'geral' })));
    if ($('#ajuda-btn')) $('#ajuda-btn').addEventListener('click', () => RB.registrar(cat, 'whatsapp', { origem: 'consultoria' }));
    registrarVisita();
    rota();
    agendarPopup();
  }

  function registrarVisita() {
    try {
      if (sessionStorage.getItem('rbtech_visita')) return;
      sessionStorage.setItem('rbtech_visita', '1');
    } catch (e) { /* sem storage: conta a cada carregamento */ }
    RB.registrar(cat, 'visita', { origem: document.referrer ? new URL(document.referrer).hostname : 'direto' });
  }

  /* ---------- Pop-up de campanha ---------- */
  function agendarPopup() {
    const pp = cat.popup || {};
    const forcar = params.has('popup');
    if (!forcar && !RB.campanhaVigente(pp)) return;
    // a chave muda quando a campanha muda, para a nova aparecer de novo
    const chave = 'rbtech_popup_' + [pp.titulo, pp.cupom, pp.texto].join('|').length + '_' + String(pp.titulo || '').slice(0, 20);
    const hoje = new Date().toDateString();
    try {
      if (!forcar && pp.frequencia === 'sessao' && sessionStorage.getItem(chave)) return;
      if (!forcar && pp.frequencia === 'dia' && localStorage.getItem(chave) === hoje) return;
      if (!forcar && pp.frequencia === 'uma' && localStorage.getItem(chave)) return;
    } catch (e) { /* sem storage: mostra */ }
    setTimeout(() => {
      // a pré-visualização do admin (?popup=1) não conta como "já visto"
      if (!forcar) {
        try {
          sessionStorage.setItem(chave, '1');
          localStorage.setItem(chave, hoje);
        } catch (e) { /* ignora */ }
      }
      RB.abrirPopup(cat, acaoPopup);
    }, Math.max(0, Number(pp.atraso) || 0) * 1000);
  }

  function acaoPopup(pp, fechar) {
    RB.registrar(cat, 'popup', { origem: pp.acao || 'fechar', detalhe: pp.titulo });
    fechar();
    const titulo = String(pp.titulo || '').replace(/\*/g, '');
    if (pp.cupom) {
      try { localStorage.setItem('rbtech_cupom', JSON.stringify({ codigo: pp.cupom, titulo, fim: pp.fim || '' })); } catch (e) { /* ignora */ }
      if (navigator.clipboard) navigator.clipboard.writeText(pp.cupom).catch(() => {});
    }
    if (pp.acao === 'whatsapp') {
      const modelo = pp.mensagem || (pp.cupom
        ? 'Olá! Quero ativar meu cupom *{cupom}* da promoção "{titulo}". 🎟️'
        : 'Olá! Vi a promoção "{titulo}" no site e quero saber mais.');
      const msg = modelo.replace(/\{cupom\}/g, pp.cupom || '').replace(/\{titulo\}/g, titulo);
      RB.registrar(cat, 'whatsapp', { origem: 'popup' });
      window.open(RB.linkWhats(cat, msg), '_blank', 'noopener');
    } else if (pp.acao === 'produto' && pp.produtoId) {
      origemClique = 'popup';
      location.hash = '#p/' + encodeURIComponent(pp.produtoId);
    } else if (pp.acao === 'link' && pp.link) {
      window.open(pp.link, '_blank', 'noopener');
    } else if (pp.acao === 'vitrine') {
      $('#vitrine').scrollIntoView({ behavior: 'smooth' });
    }
  }

  /* ---------- Loja ---------- */
  function preencherLoja() {
    const l = cat.loja;
    const num = String(l.whatsapp || '').replace(/\D/g, '');
    const whatsFmt = num.length >= 12
      ? '(' + num.slice(2, 4) + ') ' + num.slice(4, num.length - 4) + '-' + num.slice(-4)
      : num;
    const vals = Object.assign({}, l, { whatsFmt });
    $$('[data-loja]').forEach((el) => {
      const v = vals[el.dataset.loja];
      // *texto* no slogan fica destacado em amarelo no topo
      if (v && el.hasAttribute('data-destaque')) el.innerHTML = esc(v).replace(/\*([^*]+)\*/g, '<span class="hl">$1</span>');
      else if (v) el.textContent = String(v).replace(/\*/g, ''); else if (el.dataset.loja !== 'slogan' && el.dataset.loja !== 'nome') el.hidden = true;
    });
    $$('[data-pg="max"]').forEach((el) => (el.textContent = cat.pagamento.maxParcelas));
    $$('[data-txt]').forEach((el) => (el.innerHTML = RB.formatar(cat, RB.texto(cat, el.dataset.txt))));
    const msg = RB.texto(cat, 'msgGeral');
    $$('.js-whats').forEach((a) => (a.href = RB.linkWhats(cat, msg)));
    if (l.instagram) {
      const u = l.instagram.replace(/^@/, '');
      $('#f-insta').innerHTML = '<a href="https://instagram.com/' + esc(u) + '" target="_blank" rel="noopener">' +
        '<span class="fi"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/></svg></span>@' + esc(u) + '</a>';
    }
    const ic = (d) => '<span class="fi"><svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg></span>';
    const extras = [];
    if (l.email) extras.push('<a href="mailto:' + esc(l.email) + '">' + ic('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>') + esc(l.email) + '</a>');
    if (l.facebook) extras.push('<a href="' + esc(/^https?:/.test(l.facebook) ? l.facebook : 'https://facebook.com/' + l.facebook.replace(/^@/, '')) + '" target="_blank" rel="noopener">' + ic('<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>') + 'Facebook</a>');
    if (l.tiktok) extras.push('<a href="https://www.tiktok.com/@' + esc(l.tiktok.replace(/^@/, '')) + '" target="_blank" rel="noopener">' + ic('<path d="M14 3v11a3 3 0 1 1-3-3M14 3c.5 2.5 2.5 4.5 5 5"/>') + '@' + esc(l.tiktok.replace(/^@/, '')) + '</a>');
    if (l.mapsLink) extras.push('<a href="' + esc(l.mapsLink) + '" target="_blank" rel="noopener">' + ic('<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>') + 'Abrir no Google Maps</a>');
    $('#f-extra').innerHTML = extras.join('');
    // linhas do rodapé sem informação somem por inteiro
    $$('.footer-info p:not(.footer-h)').forEach((p) => { if (!p.querySelector('[data-loja]:not([hidden])')) p.hidden = true; });
    if ($('#ajuda-btn')) $('#ajuda-btn').href = RB.linkWhats(cat, RB.texto(cat, 'consultaMsg'));
    $('#ano').textContent = new Date().getFullYear();
    document.title = l.nome + ' · ' + (l.slogan || 'iPhones com garantia').replace(/\*/g, '');
  }

  /* ---------- Vitrine ---------- */
  const ativos = () => cat.produtos.filter(RB.noCatalogo); // o que aparece no catálogo
  const todos = () => cat.produtos.filter(RB.ativo); // tudo que aparece em algum lugar do site

  // Linha usada nos filtros: número do iPhone ("13") ou o nome do modelo nas outras categorias
  function linha(p) {
    if (!RB.ehIphone(p)) return p.modelo;
    const m = String(p.modelo).match(/iPhone\s*(\d+)/i);
    return m ? m[1] : p.modelo;
  }
  const rotuloLinha = (v) => (/^\d+$/.test(v) ? 'iPhone ' + v : v);

  function cardHTML(p) {
    const parc = RB.parcelas(cat, p.preco).slice(-1)[0];
    const extra = RB.ehIphone(p)
      ? '<p class="card-batt">' + (RB.batNumero(p, cat) ? batteryIcon(RB.batNumero(p, cat)) + ' ' : '🔋 ') + 'Bateria ' + esc(RB.batTexto(p, cat)) + '</p>'
      : '<p class="card-batt">' + ((RB.CATEGORIAS.find((c) => c.id === RB.categoria(p)) || {}).icone || '') + ' ' + esc(p.specs || p.condicao) + '</p>';
    return (
      '<a class="card" data-origem="' + (pagina === 'catalogo' ? 'catalogo' : 'vitrine') + '" href="#p/' + encodeURIComponent(p.id) + '">' +
        '<div class="card-media" style="--tint:' + esc(p.corHex || '#ccc') + '">' +
          RB.imagemProduto(p, true) +
          '<span class="tag ' + (p.condicao === 'Seminovo' ? '' : 'tag-gold') + '">' + esc(p.condicao) + '</span>' +
          (RB.emPromocao(p) ? '<span class="tag tag-star">Promoção</span>' : '') +
          (RB.sobEncomenda(p) ? '<span class="tag tag-enc">📦 Sob encomenda</span>' : '') +
        '</div>' +
        '<div class="card-body">' +
          '<h3>' + esc(p.modelo) + '</h3>' +
          '<p class="card-meta"><span class="dot" style="background:' + esc(p.corHex || '#ccc') + '"></span>' + esc(p.cor) + ' · ' + esc(p.armazenamento) + '</p>' +
          extra +
          (p.precoAntigo > p.preco ? '<p class="old">' + money(p.precoAntigo) + '</p>' : '') +
          '<p class="price">' + money(RB.valorPix(cat, p.preco)) + ' <small>à vista</small></p>' +
          '<p class="installment">ou ' + parc.n + 'x de ' + money(parc.parcela) + '</p>' +
          '<span class="btn btn-gold btn-sm card-btn">Quero este</span>' +
        '</div>' +
      '</a>'
    );
  }

  // Grupos mostrados como atalhos na página inicial e como abas no catálogo
  function grupos() {
    const a = ativos();
    const g = [
      { id: 'iphone-seminovos', cat: 'iphone', tipo: 'seminovos', nome: 'iPhones seminovos', itens: a.filter((p) => RB.ehIphone(p) && !RB.ehNovo(p)) },
      { id: 'iphone-novos', cat: 'iphone', tipo: 'novos', nome: 'iPhones novos lacrados', itens: a.filter((p) => RB.ehIphone(p) && RB.ehNovo(p)) }
    ];
    RB.CATEGORIAS.filter((c) => c.id !== 'iphone').forEach((c) =>
      g.push({ id: c.id, cat: c.id, tipo: '', nome: c.id === 'xiaomi' ? 'Xiaomi lacrados' : c.nome, itens: a.filter((p) => RB.categoria(p) === c.id) }));
    return g;
  }

  // Página inicial: só as promoções + atalhos para o catálogo
  function renderInicio() {
    const lista = todos().filter(RB.naVitrine);
    $('#vitrine').hidden = !lista.length && !grupos().some((g) => g.itens.length);
    $('#grid').innerHTML = lista.map(cardHTML).join('');
    // sem nada marcado como "Vitrine", some o bloco de promoções e ficam só as categorias
    $('#vitrine .section-head').hidden = !lista.length;
    $('#grid').hidden = !lista.length;
    $('#vazio').hidden = true;
    $('#cats').innerHTML = grupos().filter((g) => g.itens.length).map((g) => {
      const menor = Math.min(...g.itens.map((p) => p.preco));
      const amostra = g.itens.slice().sort((x, y) => y.preco - x.preco)[0];
      return '<a class="cat-tile" href="' + linkPagina('catalogo.html?cat=' + g.cat + (g.tipo ? '&tipo=' + g.tipo : '')) + '">' +
        '<span class="cat-art" style="--tint:' + esc(amostra.corHex || '#ccc') + '">' + RB.imagemProduto(amostra, true) + '</span>' +
        '<span class="cat-info"><strong>' + esc(g.nome) + '</strong>' +
        '<small>' + g.itens.length + (g.itens.length === 1 ? ' opção' : ' opções') + ' · a partir de ' + money(RB.valorPix(cat, menor)) + '</small></span>' +
        '<span class="cat-go">→</span></a>';
    }).join('');
  }

  // Página Catálogo: abas por categoria, subabas novos/seminovos nos iPhones e filtro por modelo
  const filtro = { cat: 'iphone', tipo: 'todos', linha: 'todos' };

  function montarCatalogo() {
    const q = new URLSearchParams(location.search);
    if (RB.CATEGORIAS.some((c) => c.id === q.get('cat'))) filtro.cat = q.get('cat');
    if (['novos', 'seminovos'].includes(q.get('tipo'))) filtro.tipo = q.get('tipo');
    $('#busca').addEventListener('input', renderGrid);
    $('#ordem').addEventListener('change', renderGrid);
    desenharAbas();
  }

  function desenharAbas() {
    const a = ativos();
    $('#cat-tabs').innerHTML = RB.CATEGORIAS.map((c) => {
      const n = a.filter((p) => RB.categoria(p) === c.id).length;
      return '<button role="tab" data-cat="' + c.id + '" class="' + (c.id === filtro.cat ? 'on' : '') + '" aria-selected="' + (c.id === filtro.cat) + '">' +
        '<span>' + c.icone + '</span>' + esc(c.id === 'xiaomi' ? 'Xiaomi' : c.nome) + ' <small>' + n + '</small></button>';
    }).join('');
    const iph = filtro.cat === 'iphone';
    $('#sub-tabs').hidden = !iph;
    if (iph) {
      const cont = (t) => a.filter((p) => RB.ehIphone(p) && (t === 'todos' || (t === 'novos') === RB.ehNovo(p))).length;
      $('#sub-tabs').innerHTML = [['todos', 'Todos'], ['seminovos', 'Seminovos'], ['novos', 'Novos lacrados']].map(([v, t]) =>
        '<button role="tab" data-tipo="' + v + '" class="' + (v === filtro.tipo ? 'on' : '') + '">' + t + ' <small>' + cont(v) + '</small></button>').join('');
    }
    $$('#cat-tabs button').forEach((b) => b.addEventListener('click', () => {
      filtro.cat = b.dataset.cat; filtro.tipo = 'todos'; filtro.linha = 'todos'; $('#busca').value = '';
      history.replaceState(null, '', location.pathname + linkQuery({ cat: filtro.cat }));
      desenharAbas();
    }));
    $$('#sub-tabs button').forEach((b) => b.addEventListener('click', () => {
      filtro.tipo = b.dataset.tipo; filtro.linha = 'todos';
      history.replaceState(null, '', location.pathname + linkQuery({ cat: filtro.cat, tipo: filtro.tipo === 'todos' ? '' : filtro.tipo }));
      desenharAbas();
    }));
    $('#ordem').querySelector('[value="bateria"]').hidden = !iph;
    if (!iph && $('#ordem').value === 'bateria') $('#ordem').value = 'destaque';
    montarChips();
    renderGrid();
  }

  function daAba() {
    return ativos().filter((p) => RB.categoria(p) === filtro.cat &&
      (filtro.cat !== 'iphone' || filtro.tipo === 'todos' || (filtro.tipo === 'novos') === RB.ehNovo(p)));
  }

  function montarChips() {
    const num = (v) => (/^\d+$/.test(v) ? Number(v) : 1000);
    const linhas = Array.from(new Set(daAba().map(linha))).sort((a, b) => num(a) - num(b) || a.localeCompare(b));
    if (!linhas.includes(filtro.linha)) filtro.linha = 'todos';
    $('#chips').hidden = linhas.length < 2;
    $('#chips').innerHTML = [['todos', 'Todos'], ...linhas.map((n) => [n, rotuloLinha(n)])].map(([v, t]) =>
      '<button class="chip' + (v === filtro.linha ? ' on' : '') + '" data-v="' + esc(v) + '" role="tab">' + esc(t) + '</button>'
    ).join('');
    $$('#chips .chip').forEach((b) => b.addEventListener('click', () => {
      filtro.linha = b.dataset.v;
      $$('#chips .chip').forEach((x) => x.classList.toggle('on', x === b));
      renderGrid();
    }));
  }

  function renderGrid() {
    const q = $('#busca').value.trim().toLowerCase();
    const ordem = $('#ordem').value;
    let lista = daAba().filter((p) => {
      if (filtro.linha !== 'todos' && linha(p) !== filtro.linha) return false;
      if (!q) return true;
      return [p.modelo, p.armazenamento, p.cor, p.condicao, p.specs].join(' ').toLowerCase().includes(q);
    });
    const sorters = {
      destaque: (a, b) => (RB.emPromocao(b) ? 1 : 0) - (RB.emPromocao(a) ? 1 : 0),
      menor: (a, b) => a.preco - b.preco,
      maior: (a, b) => b.preco - a.preco,
      bateria: (a, b) => RB.batNumero(b, cat) - RB.batNumero(a, cat)
    };
    lista = lista.slice().sort(sorters[ordem]);
    $('#vazio').hidden = lista.length > 0;
    if (!lista.length) {
      $('#vazio').innerHTML = esc(daAba().length ? 'Nenhum aparelho encontrado com esse filtro.' : RB.texto(cat, 'catalogoVazio')) +
        (daAba().length ? '' : '<br><a class="btn btn-gold btn-sm" target="_blank" rel="noopener" href="' +
          RB.linkWhats(cat, 'Olá! Vi no site que vocês trabalham com ' + (RB.CATEGORIAS.find((c) => c.id === filtro.cat) || {}).nome + '. Vocês têm algum disponível?') + '">Chamar no WhatsApp</a>');
    }
    $('#grid').innerHTML = lista.map(cardHTML).join('');
  }

  // Mantém ?preview=1 ao navegar entre as páginas na pré-visualização do admin
  function linkQuery(o) {
    const q = new URLSearchParams();
    Object.keys(o).forEach((k) => { if (o[k]) q.set(k, o[k]); });
    if (preview) q.set('preview', '1');
    const t = q.toString();
    return t ? '?' + t : '';
  }
  function linkPagina(href) {
    if (!preview) return href;
    return href + (href.includes('?') ? '&' : '?') + 'preview=1';
  }

  // Promoção do topo: os aparelhos marcados como "Promoção (topo)"; com mais de um, vira carrossel
  let timerSpot = null;
  function renderDestaque() {
    const promo = cat.promocao || {};
    let lista = todos().filter(RB.noTopo);
    if (!lista.length && promo.produtoId) lista = todos().filter((x) => x.id === promo.produtoId); // formato antigo
    if (!lista.length) { $('#destaque').hidden = true; return; }
    $('#spotlight').innerHTML = '<div class="spot-track" id="spot-track">' + lista.map((p) => slideSpot(p, promo)).join('') + '</div>' +
      (lista.length > 1 ? '<div class="spot-dots" role="tablist">' + lista.map((p, k) =>
        '<button data-k="' + k + '" class="' + (k ? '' : 'on') + '" aria-label="Promoção ' + (k + 1) + '"></button>').join('') + '</div>' : '');
    $('#destaque').hidden = false;
    if (lista.length < 2) return;
    const track = $('#spot-track');
    const dots = $$('.spot-dots button');
    const ir = (k) => track.scrollTo({ left: k * track.clientWidth, behavior: 'smooth' });
    dots.forEach((d) => d.addEventListener('click', () => { parar(); ir(Number(d.dataset.k)); }));
    track.addEventListener('scroll', () => {
      const k = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      dots.forEach((d, n) => d.classList.toggle('on', n === k));
    }, { passive: true });
    const parar = () => { clearInterval(timerSpot); timerSpot = null; };
    ['pointerdown', 'touchstart', 'wheel'].forEach((ev) => track.addEventListener(ev, parar, { passive: true }));
    timerSpot = setInterval(() => {
      const k = Math.round(track.scrollLeft / track.clientWidth);
      ir((k + 1) % lista.length);
    }, 6000);
  }

  function slideSpot(p, promo) {
    const ult = RB.parcelas(cat, p.preco).slice(-1)[0];
    const off = p.precoAntigo > p.preco ? Math.round((1 - p.preco / p.precoAntigo) * 100) : 0;
    const foto = p.fotos && p.fotos[0];
    const link = '#p/' + encodeURIComponent(p.id);
    return (
      '<div class="spot">' +
        '<a class="spot-media" data-origem="promocao" href="' + link + '"><div class="arch" style="--tint:' + esc(p.corHex || '#ccc') + '">' +
          RB.imagemProduto(p) + '</div></a>' +
        '<div class="spot-info">' +
          '<span class="ribbon">' + esc(promo.faixa || (off ? 'Oferta da semana' : 'Destaque da semana')) + '</span>' +
          '<p class="eyebrow">' + esc(p.condicao) + ' · garantia ' + esc(p.garantia || cat.loja.garantiaPadrao) + (RB.sobEncomenda(p) ? ' · sob encomenda' : '') + '</p>' +
          '<h2 class="spot-title">' + esc(RB.nomeProduto(p)) + '</h2>' +
          (promo.texto ? '<p class="spot-text">' + esc(promo.texto) + '</p>' : '') +
          '<p class="spot-sub">' + esc(p.cor) + (!RB.ehIphone(p) ? (p.specs ? ' · ' + esc(p.specs) : '') : ' · bateria ' + esc(RB.batTexto(p, cat)) + ' · checklist completo') + '</p>' +
          '<p class="spot-price">' + (off ? '<s>' + money(p.precoAntigo) + '</s> <small>por</small> ' : '') + '<strong>' + money(RB.valorPix(cat, p.preco)) + '</strong></p>' +
          (off ? '<span class="off-badge">−' + off + '% OFF</span>' : '') +
          '<p class="spot-parc">ou ' + ult.n + 'x de ' + money(ult.parcela) + ' no cartão · Pix, débito e crédito</p>' +
          '<div class="spot-cta"><a class="btn btn-gold" data-origem="promocao" href="' + link + '">Quero o meu</a>' +
          '<a class="btn btn-ghost-light" data-origem="promocao" href="' + link + '">Ver detalhes</a></div>' +
        '</div>' +
      '</div>'
    );
  }

  function batteryIcon(v) {
    const n = Math.max(0, Math.min(100, Number(v) || 0));
    const cor = n >= 85 ? 'var(--ok)' : n >= 80 ? 'var(--warn)' : 'var(--bad)';
    return '<svg class="batt" viewBox="0 0 26 12" aria-hidden="true"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity=".5"/>' +
      '<rect x="2" y="2" width="' + (19 * n / 100).toFixed(1) + '" height="8" rx="1.5" fill="' + cor + '"/><rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".5"/></svg>';
  }

  /* ---------- Formulário de entrada (reutilizado) ---------- */
  function formEntrada(container, onChange) {
    const av = cat.avaliacao;
    const modelo = av.modelos.find((m) => m.id === entrada.modeloId);
    const arms = modelo ? Object.keys(modelo.valores) : [];
    if (modelo && !arms.includes(entrada.armazenamento)) entrada.armazenamento = arms[0] || '';

    container.innerHTML =
      '<div class="trade">' +
        '<div class="field-row">' +
          '<label class="field"><span>Modelo do seu iPhone</span><select data-k="modelo">' +
            '<option value="">Selecione…</option>' +
            av.modelos.map((m) => '<option value="' + esc(m.id) + '"' + (m.id === entrada.modeloId ? ' selected' : '') + '>' + esc(m.nome) + '</option>').join('') +
          '</select></label>' +
          '<label class="field"><span>Armazenamento</span><select data-k="arm"' + (modelo ? '' : ' disabled') + '>' +
            arms.map((a) => '<option value="' + esc(a) + '"' + (a === entrada.armazenamento ? ' selected' : '') + '>' + esc(RB.fmtGB(a)) + '</option>').join('') +
          '</select></label>' +
        '</div>' +
        (modelo ?
          '<fieldset class="field"><legend>Seu iPhone tem algum detalhe ou defeito?</legend>' +
            '<div class="yesno">' +
              '<button type="button" data-det="0" class="' + (entrada.temDetalhe === false ? 'on' : '') + '">Não, está perfeito</button>' +
              '<button type="button" data-det="1" class="' + (entrada.temDetalhe === true ? 'on' : '') + '">Sim, tem detalhe</button>' +
            '</div>' +
            (entrada.temDetalhe ?
              '<div class="defects-box"><p class="defects-q">Quais detalhes? <small>Pode marcar mais de um.</small></p><div class="defects">' +
                av.defeitos.map((d) =>
                  '<label class="defect"><input type="checkbox" value="' + esc(d.id) + '"' + (entrada.defeitos.includes(d.id) ? ' checked' : '') + '>' +
                  '<span class="defect-label">' + esc(d.label) + '</span></label>'
                ).join('') +
              '</div></div>' : '') +
          '</fieldset>' +
          '<fieldset class="field"><legend>Saúde da bateria <small>(Ajustes › Bateria)</small></legend><div class="pills">' +
            av.bateria.map((b) =>
              '<label class="pill"><input type="radio" name="bat-' + container.id + '" value="' + esc(b.id) + '"' + (b.id === entrada.bateriaId ? ' checked' : '') + '>' +
              '<span>' + esc(b.label) + '</span></label>'
            ).join('') +
          '</div></fieldset>' : '') +
      '</div>';

    $('[data-k="modelo"]', container).addEventListener('change', (e) => {
      entrada.modeloId = e.target.value;
      entrada.armazenamento = '';
      formEntrada(container, onChange);
      onChange();
    });
    $$('[data-det]', container).forEach((b) => b.addEventListener('click', () => {
      entrada.temDetalhe = b.dataset.det === '1';
      if (!entrada.temDetalhe) entrada.defeitos = [];
      formEntrada(container, onChange);
      onChange();
    }));
    const selArm = $('[data-k="arm"]', container);
    selArm.addEventListener('change', (e) => { entrada.armazenamento = e.target.value; onChange(); });
    $$('input[type=radio]', container).forEach((r) => r.addEventListener('change', () => { entrada.bateriaId = r.value; onChange(); }));
    $$('.defects input', container).forEach((c) => c.addEventListener('change', () => {
      entrada.defeitos = $$('.defects input:checked', container).map((x) => x.value);
      onChange();
    }));
  }

  function resultadoEntradaHTML(r) {
    if (!r) {
      return '<div class="eval eval-empty">' + (entrada.modeloId
        ? 'Responda se o seu iPhone tem algum detalhe para ver a pré-avaliação.'
        : 'Selecione o modelo para ver a pré-avaliação.') + '</div>';
    }
    if (r.recusado) {
      return '<div class="eval eval-bad"><strong>Não conseguimos aceitar este aparelho.</strong><p>' + esc(r.recusado) +
        '. Fale com a gente no WhatsApp para entender outras opções.</p></div>';
    }
    if (r.consultar) {
      return '<div class="eval eval-whats"><span class="sim-step">Avaliação pelo WhatsApp</span>' +
        '<strong>' + esc(r.modelo) + ' ' + esc(RB.fmtGB(r.armazenamento)) + '</strong>' +
        '<p>Este modelo é avaliado individualmente. Envie a proposta e respondemos com o valor do seu aparelho.</p></div>';
    }
    return (
      '<div class="eval">' +
        '<div class="eval-row"><span>' + esc(r.modelo) + ' ' + esc(RB.fmtGB(r.armazenamento)) + '</span></div>' +
        (r.descontos.length ? '<p class="eval-itens">Considerado: ' + esc(r.descontos.map((d) => d.label).join(', ')) + '</p>' : '') +
        '<div class="eval-total"><span>Pré-avaliação do seu iPhone</span><strong>' + money(r.total) + '</strong></div>' +
        '<p class="hint">' + esc(cat.avaliacao.observacao) + '</p>' +
      '</div>'
    );
  }

  function avaliacaoAtual() {
    if (!entrada.modeloId || entrada.temDetalhe === null) return null;
    return RB.avaliar(cat, Object.assign({}, entrada, { defeitos: entrada.temDetalhe ? entrada.defeitos : [] }));
  }

  function montarAvaliacaoPagina() {
    const box = $('#avaliar-box');
    box.innerHTML = '<div id="aval-form"></div><div id="aval-res"></div>' +
      '<div class="interesse"><h4 class="sim-h"><span class="sim-step">Seu próximo iPhone</span> Qual iPhone você quer?</h4>' +
      '<div class="field-row">' +
        '<label class="field"><span>Modelo</span><select id="int-modelo"></select></label>' +
        '<label class="field"><span>Armazenamento</span><select id="int-arm"></select></label>' +
      '</div><div id="int-lista"></div></div>' +
      '<a href="catalogo.html" class="btn btn-outline btn-block" id="aval-go">Ver catálogo completo</a>';
    const interesse = { modelo: '', arm: '' };

    const renderInteresse = () => {
      const r = avaliacaoAtual();
      const disp = todos();
      const modelos = Array.from(new Set(disp.map((p) => p.modelo)))
        .sort((a, b) => Math.min(...disp.filter((p) => p.modelo === a).map((p) => p.preco)) - Math.min(...disp.filter((p) => p.modelo === b).map((p) => p.preco)));
      if (!modelos.includes(interesse.modelo)) interesse.modelo = '';
      const arms = Array.from(new Set(disp.filter((p) => p.modelo === interesse.modelo).map((p) => p.armazenamento)))
        .sort((a, b) => parseInt(a) * (/TB/i.test(a) ? 1024 : 1) - parseInt(b) * (/TB/i.test(b) ? 1024 : 1));
      if (!arms.includes(interesse.arm)) interesse.arm = arms[0] || '';

      $('#int-modelo').innerHTML = '<option value="">Selecione…</option>' +
        modelos.map((m) => '<option' + (m === interesse.modelo ? ' selected' : '') + '>' + esc(m) + '</option>').join('');
      $('#int-arm').innerHTML = arms.map((a) => '<option' + (a === interesse.arm ? ' selected' : '') + '>' + esc(a) + '</option>').join('');
      $('#int-arm').disabled = !interesse.modelo;

      if (!interesse.modelo) { $('#int-lista').innerHTML = ''; return; }
      const itens = disp.filter((p) => p.modelo === interesse.modelo && p.armazenamento === interesse.arm).sort((a, b) => a.preco - b.preco);
      const valEntrada = r && !r.recusado && !r.consultar ? r.total : 0;
      $('#int-lista').innerHTML = '<div class="int-lista">' + itens.map((p) => {
        const dif = Math.max(0, p.preco - valEntrada);
        const ult = RB.parcelas(cat, dif).slice(-1)[0];
        let linha;
        if (r && r.consultar) linha = '<span class="int-dif">' + money(p.preco) + '</span><small>Seu usado será avaliado pelo WhatsApp</small>';
        else if (valEntrada > 0) linha = '<small>Com seu iPhone de entrada, diferença de</small><span class="int-dif">' + money(dif) + '</span>' +
          (dif > 0 ? '<small>ou ' + ult.n + 'x de ' + money(ult.parcela) + '</small>' : '');
        else linha = '<span class="int-dif">' + money(RB.valorPix(cat, p.preco)) + '</span><small>ou ' + ult.n + 'x de ' + money(ult.parcela) + '</small>';
        return '<button type="button" class="int-item" data-id="' + esc(p.id) + '">' +
          '<span class="int-info"><strong>' + esc(RB.nomeProduto(p)) + '</strong>' +
          '<small><span class="dot" style="background:' + esc(p.corHex || '#ccc') + '"></span> ' + esc(p.cor) + ' · ' + esc(p.condicao) + (!RB.ehIphone(p) ? '' : ' · bateria ' + esc(RB.batTexto(p, cat))) + '</small>' +
          (valEntrada > 0 ? '<small>Valor do aparelho: ' + money(p.preco) + '</small>' : '') + '</span>' +
          '<span class="int-preco">' + linha + '</span>' +
          '<span class="int-cta">Ver e montar proposta →</span>' +
        '</button>';
      }).join('') + '</div>';
      $$('#int-lista .int-item').forEach((b) => b.addEventListener('click', () => {
        const rr = avaliacaoAtual();
        entrada.usar = rr && !rr.recusado ? true : null;
        origemClique = 'avaliacao';
        location.hash = '#p/' + encodeURIComponent(b.dataset.id);
      }));
    };

    const atualizar = () => {
      $('#aval-res').innerHTML = resultadoEntradaHTML(avaliacaoAtual());
      renderInteresse();
    };
    $('#int-modelo').addEventListener('change', (e) => { interesse.modelo = e.target.value; interesse.arm = ''; renderInteresse(); });
    $('#int-arm').addEventListener('change', (e) => { interesse.arm = e.target.value; renderInteresse(); });
    formEntrada($('#aval-form'), atualizar);
    atualizar();
  }

  /* ---------- Detalhe do produto ---------- */
  function rota() {
    const m = location.hash.match(/^#p\/(.+)$/);
    if (!m) { fecharSheet(true); return; }
    const p = cat.produtos.find((x) => x.id === decodeURIComponent(m[1]));
    if (p) abrirProduto(p);
  }

  function fecharSheet(semHistorico) {
    const s = $('#sheet');
    if (s.hidden) return;
    s.hidden = true;
    document.body.classList.remove('no-scroll');
    if (semHistorico !== true && location.hash.startsWith('#p/')) {
      history.pushState('', document.title, location.pathname + location.search + '#vitrine');
    }
  }

  function abrirProduto(p) {
    RB.registrar(cat, 'clique', { produto: p, origem: origemClique });
    origemClique = 'link';
    const s = $('#sheet');
    const fotos = (p.fotos || []).filter(Boolean);
    const body = $('#sheet-body');
    const pag = { aba: null, parcela: null };

    body.innerHTML =
      '<div class="pd">' +
        '<div class="pd-gallery">' +
          '<div class="pd-main" style="--tint:' + esc(p.corHex || '#ccc') + '">' +
            RB.imagemProduto(p) +
          '</div>' +
          (fotos.length > 1 ? '<div class="pd-thumbs">' + fotos.map((f, i) =>
            '<button class="' + (i === 0 ? 'on' : '') + '" data-i="' + i + '"><img src="' + esc(f) + '" alt="Foto ' + (i + 1) + '"></button>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="pd-info">' +
          '<p class="eyebrow eyebrow-dark">' + esc(p.condicao) + ' · Garantia ' + esc(p.garantia || cat.loja.garantiaPadrao) + (RB.sobEncomenda(p) ? ' · Sob encomenda' : '') + '</p>' +
          '<h2 id="sheet-title" class="pd-title">' + esc(p.modelo) + '</h2>' +
          '<p class="card-meta"><span class="dot" style="background:' + esc(p.corHex || '#ccc') + '"></span>' + esc(p.cor) + ' · ' + esc(p.armazenamento) +
            (!RB.ehIphone(p) ? (p.specs ? ' · ' + esc(p.specs) : '') : ' · ' + (RB.batNumero(p, cat) ? batteryIcon(RB.batNumero(p, cat)) + ' ' : '') + 'bateria ' + esc(RB.batTexto(p, cat))) + '</p>' +
          (p.precoAntigo > p.preco ? '<p class="old">' + money(p.precoAntigo) + '</p>' : '') +
          '<p class="price price-lg">' + money(RB.valorPix(cat, p.preco)) + ' <small>à vista no Pix</small></p>' +
          (!RB.ehIphone(p) ? specsFicha(p) :
          '<h3 class="pd-h">Checklist do aparelho</h3>' +
          '<ul class="checklist">' + RB.CHECKLIST_ITENS.map((it) => {
            const c = Object.assign({ status: 'ok', nota: '' }, (p.checklist || {})[it.id]);
            if (it.id === 'bateria' && (!c.nota || c.nota === 'Revisada')) c.nota = 'Saúde ' + RB.batTexto(p, cat);
            const st = RB.STATUS[c.status] || RB.STATUS.ok;
            return '<li class="ck ck-' + esc(c.status) + '"><span class="ck-ic">' + st.icon + '</span><div><strong>' + esc(it.label) + '</strong>' +
              '<small>' + esc(c.nota || st.label) + '</small></div></li>';
          }).join('') + '</ul>') +
          (RB.sobEncomenda(p) ? '<div class="enc-aviso"><span>📦</span><div><p>' + RB.formatar(cat, RB.texto(cat, 'encomendaAviso')) + '</p>' +
            '<small>Prazo de entrega: <b>' + esc(prazoEncomenda(p)) + '</b></small></div></div>' : '') +
          (p.observacoes ? '<p class="pd-obs">' + esc(p.observacoes) + '</p>' : '') +
        '</div>' +
      '</div>' +
      '<div class="sim">' +
        '<h3 class="sim-title">Monte sua proposta</h3>' +
        '<div class="sim-ask">' +
          '<span class="sim-step">Passo 1</span>' +
          '<p class="sim-q">Você quer dar o seu iPhone de entrada?</p>' +
          '<p class="sim-q-sub">Seu usado abate no valor deste aparelho.</p>' +
        '</div>' +
        '<div class="toggle" role="radiogroup" aria-label="Dar iPhone de entrada">' +
          '<button data-entrada="1" role="radio"><b>✓ Sim</b><small>Quero dar meu iPhone</small></button>' +
          '<button data-entrada="0" role="radio"><b>✕ Não</b><small>Comprar sem entrada</small></button>' +
        '</div>' +
        '<div id="sim-trade" hidden><h4 class="sim-h"><span class="sim-step">Passo 2</span> Conte como está o seu iPhone</h4>' +
          '<div id="sim-form"></div><div id="sim-eval"></div></div>' +
        '<div id="sim-pay" hidden></div>' +
      '</div>';

    $$('.pd-thumbs button', body).forEach((b) => b.addEventListener('click', () => {
      $('.pd-main', body).innerHTML = '<img src="' + esc(fotos[b.dataset.i]) + '" alt="">';
      $$('.pd-thumbs button', body).forEach((x) => x.classList.toggle('on', x === b));
    }));

    const atualizar = () => {
      $$('.toggle button', body).forEach((b) => {
        const on = entrada.usar !== null && (b.dataset.entrada === '1') === entrada.usar;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on);
      });
      $('#sim-trade', body).hidden = !entrada.usar;
      const r = entrada.usar ? avaliacaoAtual() : null;
      $('#sim-pay', body).hidden = entrada.usar === null || (entrada.usar && !r);
      if (entrada.usar) $('#sim-eval', body).innerHTML = resultadoEntradaHTML(r);
      renderPagamento(p, r, pag);
    };

    $$('.toggle button', body).forEach((b) => b.addEventListener('click', () => {
      entrada.usar = b.dataset.entrada === '1';
      pag.aba = null; pag.parcela = null;
      atualizar();
    }));
    formEntrada($('#sim-form', body), () => { pag.parcela = null; atualizar(); });
    atualizar();

    s.hidden = false;
    document.body.classList.add('no-scroll');
    $('.sheet-panel', s).scrollTop = 0;
  }

  function renderPagamento(p, r, pag) {
    const box = $('#sim-pay');
    const temEntrada = entrada.usar && r && !r.recusado && r.total > 0;
    const consultar = entrada.usar && r && r.consultar;
    const valEntrada = temEntrada ? r.total : 0;
    const diferenca = Math.max(0, p.preco - valEntrada);
    const sobra = Math.max(0, valEntrada - p.preco);
    const aba = temEntrada ? (pag.aba || 'diferenca') : 'total';

    const valor = aba === 'diferenca' ? diferenca : p.preco;
    const lista = valor > 0 ? RB.parcelas(cat, valor) : [];
    const pix = RB.valorPix(cat, valor);
    const desc = Number(cat.pagamento.descontoPix) || 0;

    let html = '';
    html += '<div class="pay"><h4 class="sim-h"><span class="sim-step">Passo ' + (entrada.usar ? 3 : 2) + '</span> Escolha como pagar</h4>';
    if (temEntrada) {
      html +=
        '<div class="summary">' +
          '<div><span>' + esc(RB.nomeProduto(p)) + '</span><span>' + money(p.preco) + '</span></div>' +
          '<div class="neg"><span>Seu ' + esc(r.modelo) + ' de entrada</span><span>−' + money(valEntrada) + '</span></div>' +
          '<div class="sum-total"><span>Diferença</span><strong>' + money(diferenca) + '</strong></div>' +
          (sobra > 0 ? '<p class="hint ok">Seu aparelho cobre o valor! Sobra ' + money(sobra) + ' a combinar com a loja.</p>' : '') +
        '</div>' +
        '<div class="tabs" role="tablist">' +
          '<button data-aba="diferenca" class="' + (aba === 'diferenca' ? 'on' : '') + '">Pagar a diferença<small>' + money(diferenca) + '</small></button>' +
          '<button data-aba="total" class="' + (aba === 'total' ? 'on' : '') + '">Valor total sem entrada<small>' + money(p.preco) + '</small></button>' +
        '</div>';
    } else if (consultar) {
      html += '<div class="summary"><div><span>' + esc(RB.nomeProduto(p)) + '</span><span>' + money(p.preco) + '</span></div>' +
        '<div class="neg"><span>Seu ' + esc(r.modelo) + ' de entrada</span><span>a avaliar</span></div>' +
        '<p class="hint ok">Abaixo, o valor total. O valor do seu iPhone será descontado após a avaliação pelo WhatsApp.</p></div>';
    }

    if (valor <= 0) {
      html += '<div class="eval eval-good"><strong>Nada a pagar.</strong> A entrada cobre o valor do aparelho.</div>';
    } else {
      html +=
        '<button class="opt opt-pix' + (pag.parcela === 0 ? ' on' : '') + '" data-n="0">' +
          '<span><strong>À vista · Pix ou dinheiro</strong>' + (desc > 0 ? '<small>' + desc + '% de desconto</small>' : '') + '</span>' +
          '<span class="opt-val">' + money(pix) + '</span>' +
        '</button>' +
        '<p class="pay-sub">Cartão de crédito <small>(taxa da maquininha já incluída)</small></p>' +
        '<div class="opts">' + lista.map((x) =>
          '<button class="opt' + (pag.parcela === x.n ? ' on' : '') + '" data-n="' + x.n + '">' +
            '<span><strong>' + x.n + 'x de ' + money(x.parcela) + '</strong><small>Total ' + money(x.total) + '</small></span>' +
          '</button>').join('') +
        '</div>';
    }

    const pode = !(entrada.usar && (!r || r.recusado));
    const cupom = cupomSalvo();
    if (cupom) html += '<div class="cupom-ativo">🎟️ Cupom <b>' + esc(cupom.codigo) + '</b> ativado · será aplicado no atendimento</div>';
    html += '<label class="field nome-cli"><span>Seu nome completo</span>' +
      '<input id="nome-cli" autocomplete="name" autocapitalize="words" placeholder="Ex.: Maria da Silva" value="' + esc(nomeCliente) + '"></label>' +
      '<p class="nome-err" id="nome-err" hidden>Digite seu nome e sobrenome para enviarmos a proposta.</p>';
    html += '<a class="btn btn-whats btn-block' + (pode ? '' : ' disabled') + '" id="enviar" target="_blank" rel="noopener" href="#">' +
      'Enviar proposta no WhatsApp</a>' +
      '<p class="hint center">' + (pag.parcela == null && valor > 0 ? 'Toque numa opção acima para incluí-la na proposta.' : 'Você será direcionado ao WhatsApp com a proposta pronta.') + '</p>' +
      '</div>';
    box.innerHTML = html;

    $$('.tabs button', box).forEach((b) => b.addEventListener('click', () => {
      pag.aba = b.dataset.aba; pag.parcela = null;
      renderPagamento(p, r, pag);
    }));
    $$('.opt', box).forEach((b) => b.addEventListener('click', () => {
      pag.parcela = Number(b.dataset.n);
      renderPagamento(p, r, pag);
    }));

    const btn = $('#enviar', box);
    if (!pode) { btn.removeAttribute('href'); return; }
    const montar = () => RB.linkWhats(cat, mensagem(p, temEntrada || consultar ? r : null, aba, pag.parcela, valor, lista, pix));
    btn.href = montar();
    const campoNome = $('#nome-cli', box);
    campoNome.addEventListener('input', () => {
      nomeCliente = campoNome.value;
      try { localStorage.setItem('rbtech_nome', nomeCliente); } catch (e) { /* ignora */ }
      if (nomeValido(nomeCliente)) { $('#nome-err', box).hidden = true; campoNome.classList.remove('erro'); }
      btn.href = montar();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!nomeValido(nomeCliente)) {
        $('#nome-err', box).hidden = false;
        campoNome.classList.add('erro');
        campoNome.focus();
        campoNome.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      const url = montar();
      const forma = valor <= 0 ? 'sem pagamento' : pag.parcela === 0 ? 'à vista' : pag.parcela ? pag.parcela + 'x' : 'a definir';
      const ent = r && (temEntrada || consultar) ? 'entrada ' + r.modelo + ' · ' : 'sem entrada · ';
      // aviso antes de ir para o WhatsApp: valores são simulação
      RB.abrirAviso({
        titulo: RB.formatar(cat, RB.texto(cat, 'avisoT')),
        texto: RB.formatar(cat, RB.texto(cat, 'avisoS')),
        botao: RB.texto(cat, 'avisoB'),
        onOk: () => {
          RB.registrar(cat, 'whatsapp', { produto: p, origem: 'proposta', detalhe: ent + forma + ' · ' + money(valor) });
          const w = window.open(url, '_blank');
          if (w) w.opener = null; else location.href = url;
        }
      });
    });
  }

  // Ficha de especificações (MacBook, Xiaomi, iPad) no lugar do checklist de iPhone
  function specsFicha(p) {
    const itens = [['Armazenamento', p.armazenamento], ['Configuração', p.specs], ['Cor', p.cor], ['Condição', p.condicao],
      ['Bateria', RB.batTexto(p, cat)],
      ['Garantia', p.garantia || cat.loja.garantiaPadrao]].filter((x) => x[1]);
    return '<h3 class="pd-h">Especificações</h3><ul class="checklist">' + itens.map(([k, v]) =>
      '<li class="ck ck-ok"><span class="ck-ic">✓</span><div><strong>' + esc(k) + '</strong><small>' + esc(v) + '</small></div></li>').join('') + '</ul>';
  }

  const prazoEncomenda = (p) => String(p.prazo || '').trim() || RB.texto(cat, 'encomendaPrazo');

  function mensagem(p, r, aba, parcela, valor, lista, pix) {
    const linhas = ['Olá! Sou *' + nomeCliente.trim() + '* e montei uma proposta pelo site:', ''];
    linhas.push(!RB.ehIphone(p)
      ? ((RB.CATEGORIAS.find((c) => c.id === RB.categoria(p)) || {}).icone || '📦') + ' *' + RB.nomeProduto(p) + '* · ' + p.cor + ' · ' + p.condicao + (p.specs ? ' · ' + p.specs : '')
      : '📱 *' + RB.nomeProduto(p) + '* · ' + p.cor + ' · ' + p.condicao + ' · bateria ' + RB.batTexto(p, cat));
    linhas.push('Valor: ' + money(p.preco));
    if (RB.sobEncomenda(p)) linhas.push('📦 *Sob encomenda* · prazo: ' + prazoEncomenda(p));
    if (r) {
      const bat = cat.avaliacao.bateria.find((b) => b.id === entrada.bateriaId);
      const defs = entrada.defeitos.map((id) => (cat.avaliacao.defeitos.find((d) => d.id === id) || {}).label).filter(Boolean);
      linhas.push('');
      linhas.push('🔁 *Entrada:* ' + r.modelo + ' ' + RB.fmtGB(r.armazenamento));
      if (bat) linhas.push('Bateria: ' + bat.label);
      linhas.push('Estado: ' + (defs.length ? defs.join(', ') : 'sem defeitos'));
      linhas.push(r.consultar ? 'Pré-avaliação: quero avaliar pelo WhatsApp' : 'Pré-avaliação: ' + money(r.total));
    }
    linhas.push('');
    const tipo = r && r.consultar ? 'Valor total (antes de descontar a entrada)' : r && aba === 'diferenca' ? 'Pagar a diferença' : 'Valor total';
    if (valor <= 0) {
      linhas.push('💳 ' + tipo + ': nada a pagar');
    } else if (parcela === 0) {
      linhas.push('💳 ' + tipo + ': ' + money(pix) + ' à vista (Pix/dinheiro)');
    } else if (parcela) {
      const x = lista.find((l) => l.n === parcela);
      linhas.push('💳 ' + tipo + ': ' + x.n + 'x de ' + money(x.parcela) + ' no cartão (total ' + money(x.total) + ')');
    } else {
      linhas.push('💳 ' + tipo + ': ' + money(valor) + ' · quero ver as formas de pagamento');
    }
    const cupom = cupomSalvo();
    if (cupom) linhas.push('', '🎟️ *Cupom:* ' + cupom.codigo + (cupom.titulo ? ' (' + cupom.titulo + ')' : ''));
    return linhas.join('\n');
  }
})();
