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
  let filtroLinha = 'todos';

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
    montarChips();
    renderGrid();
    const vitrine = ativos().slice().sort((a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0)).slice(0, 3);
    $('#hero-art').innerHTML = vitrine.map((p) => RB.phoneSVG(p.corHex)).join('');
    renderDestaque();
    montarAvaliacaoPagina();
    $('#busca').addEventListener('input', renderGrid);
    $('#ordem').addEventListener('change', renderGrid);
    window.addEventListener('hashchange', rota);
    $$('[data-fechar]').forEach((el) => el.addEventListener('click', fecharSheet));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharSheet(); });
    document.addEventListener('click', (e) => {
      const o = e.target.closest('[data-origem]');
      if (o) origemClique = o.dataset.origem;
    }, true);
    $$('.js-whats').forEach((a) => a.addEventListener('click', () => RB.registrar(cat, 'whatsapp', { origem: a.dataset.origem || 'geral' })));
    $('#ajuda-btn').addEventListener('click', () => RB.registrar(cat, 'whatsapp', { origem: 'consultoria' }));
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
      try {
        sessionStorage.setItem(chave, '1');
        localStorage.setItem(chave, hoje);
      } catch (e) { /* ignora */ }
      RB.abrirPopup(cat, acaoPopup);
    }, Math.max(0, Number(pp.atraso) || 0) * 1000);
  }

  function acaoPopup(pp, fechar) {
    RB.registrar(cat, 'popup', { origem: pp.acao || 'fechar', detalhe: pp.titulo });
    fechar();
    if (pp.acao === 'whatsapp') {
      const msg = 'Olá! Vi a promoção "' + String(pp.titulo || '').replace(/\*/g, '') + '" no site' + (pp.cupom ? ' e quero usar o cupom ' + pp.cupom : '') + '.';
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
    $$('.footer-info p').forEach((p) => { if (!p.querySelector('[data-loja]:not([hidden])')) p.hidden = true; });
    $('#ajuda-btn').href = RB.linkWhats(cat, RB.texto(cat, 'consultaMsg'));
    $('#ano').textContent = new Date().getFullYear();
    document.title = l.nome + ' · ' + (l.slogan || 'iPhones com garantia').replace(/\*/g, '');
  }

  /* ---------- Vitrine ---------- */
  function linha(p) {
    const m = String(p.modelo).match(/iPhone\s*(\d+)/i);
    return m ? m[1] : 'outros';
  }

  function montarChips() {
    const linhas = Array.from(new Set(ativos().map(linha))).sort((a, b) => Number(a) - Number(b));
    const opts = [['todos', 'Todos'], ...linhas.map((n) => [n, n === 'outros' ? 'Outros' : 'iPhone ' + n])];
    $('#chips').innerHTML = opts.map(([v, t]) =>
      '<button class="chip' + (v === filtroLinha ? ' on' : '') + '" data-v="' + esc(v) + '" role="tab">' + esc(t) + '</button>'
    ).join('');
    $$('#chips .chip').forEach((b) => b.addEventListener('click', () => {
      filtroLinha = b.dataset.v;
      $$('#chips .chip').forEach((x) => x.classList.toggle('on', x === b));
      renderGrid();
    }));
  }

  const ativos = () => cat.produtos.filter((p) => p.disponivel !== false);

  function renderGrid() {
    const q = $('#busca').value.trim().toLowerCase();
    const ordem = $('#ordem').value;
    let lista = ativos().filter((p) => {
      if (filtroLinha !== 'todos' && linha(p) !== filtroLinha) return false;
      if (!q) return true;
      return [p.modelo, p.armazenamento, p.cor, p.condicao].join(' ').toLowerCase().includes(q);
    });
    const sorters = {
      destaque: (a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0),
      menor: (a, b) => a.preco - b.preco,
      maior: (a, b) => b.preco - a.preco,
      bateria: (a, b) => (b.bateria || 0) - (a.bateria || 0)
    };
    lista = lista.slice().sort(sorters[ordem]);
    $('#vazio').hidden = lista.length > 0;
    $('#grid').innerHTML = lista.map((p) => {
      const parc = RB.parcelas(cat, p.preco).slice(-1)[0];
      return (
        '<a class="card" data-origem="vitrine" href="#p/' + encodeURIComponent(p.id) + '">' +
          '<div class="card-media" style="--tint:' + esc(p.corHex || '#ccc') + '">' +
            (p.fotos && p.fotos[0] ? '<img src="' + esc(p.fotos[0]) + '" alt="' + esc(RB.nomeProduto(p)) + '" loading="lazy">' : RB.phoneSVG(p.corHex)) +
            '<span class="tag ' + (p.condicao === 'Seminovo' ? '' : 'tag-gold') + '">' + esc(p.condicao) + '</span>' +
            (p.destaque ? '<span class="tag tag-star">Destaque</span>' : '') +
          '</div>' +
          '<div class="card-body">' +
            '<h3>' + esc(p.modelo) + '</h3>' +
            '<p class="card-meta"><span class="dot" style="background:' + esc(p.corHex || '#ccc') + '"></span>' + esc(p.cor) + ' · ' + esc(p.armazenamento) + '</p>' +
            '<p class="card-batt">' + batteryIcon(p.bateria) + ' Bateria ' + esc(p.bateria) + '%</p>' +
            (p.precoAntigo > p.preco ? '<p class="old">' + money(p.precoAntigo) + '</p>' : '') +
            '<p class="price">' + money(RB.valorPix(cat, p.preco)) + ' <small>à vista</small></p>' +
            '<p class="installment">ou ' + parc.n + 'x de ' + money(parc.parcela) + '</p>' +
            '<span class="btn btn-gold btn-sm card-btn">Quero este</span>' +
          '</div>' +
        '</a>'
      );
    }).join('');
  }

  // Um aparelho em evidência, como a vitrine da Durah
  function renderDestaque() {
    const promo = cat.promocao || {};
    const auto = ativos().filter((p) => p.destaque)
      .sort((a, b) => (b.precoAntigo > b.preco ? 1 : 0) - (a.precoAntigo > a.preco ? 1 : 0))[0];
    const p = ativos().find((x) => x.id === promo.produtoId) || auto;
    if (!p) return;
    const ult = RB.parcelas(cat, p.preco).slice(-1)[0];
    const off = p.precoAntigo > p.preco ? Math.round((1 - p.preco / p.precoAntigo) * 100) : 0;
    const foto = p.fotos && p.fotos[0];
    $('#spotlight').innerHTML =
      '<div class="spot">' +
        '<a class="spot-media" data-origem="promocao" href="#p/' + encodeURIComponent(p.id) + '"><div class="arch" style="--tint:' + esc(p.corHex || '#ccc') + '">' +
          (foto ? '<img src="' + esc(foto) + '" alt="' + esc(RB.nomeProduto(p)) + '">' : RB.phoneSVG(p.corHex)) + '</div></a>' +
        '<div class="spot-info">' +
          '<span class="ribbon">' + esc(promo.faixa || (off ? 'Oferta da semana' : 'Destaque da semana')) + '</span>' +
          '<p class="eyebrow">' + esc(p.condicao) + ' · garantia ' + esc(p.garantia || cat.loja.garantiaPadrao) + '</p>' +
          '<h2 class="spot-title">' + esc(RB.nomeProduto(p)) + '</h2>' +
          (promo.texto ? '<p class="spot-text">' + esc(promo.texto) + '</p>' : '') +
          '<p class="spot-sub">' + esc(p.cor) + ' · bateria ' + esc(p.bateria) + '% · checklist completo</p>' +
          '<p class="spot-price">' + (off ? '<s>' + money(p.precoAntigo) + '</s> <small>por</small> ' : '') + '<strong>' + money(RB.valorPix(cat, p.preco)) + '</strong></p>' +
          (off ? '<span class="off-badge">−' + off + '% OFF</span>' : '') +
          '<p class="spot-parc">ou ' + ult.n + 'x de ' + money(ult.parcela) + ' no cartão · Pix, débito e crédito</p>' +
          '<div class="spot-cta"><a class="btn btn-gold" data-origem="promocao" href="#p/' + encodeURIComponent(p.id) + '">Quero o meu</a>' +
          '<a class="btn btn-ghost-light" data-origem="promocao" href="#p/' + encodeURIComponent(p.id) + '">Ver detalhes</a></div>' +
        '</div>' +
      '</div>';
    $('#destaque').hidden = false;
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
      '<a href="#vitrine" class="btn btn-outline btn-block" id="aval-go">Ver todos os iPhones</a>';
    const interesse = { modelo: '', arm: '' };

    const renderInteresse = () => {
      const r = avaliacaoAtual();
      const disp = ativos();
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
          '<small><span class="dot" style="background:' + esc(p.corHex || '#ccc') + '"></span> ' + esc(p.cor) + ' · ' + esc(p.condicao) + ' · bateria ' + esc(p.bateria) + '%</small>' +
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
            (fotos[0] ? '<img src="' + esc(fotos[0]) + '" alt="' + esc(RB.nomeProduto(p)) + '">' : RB.phoneSVG(p.corHex)) +
          '</div>' +
          (fotos.length > 1 ? '<div class="pd-thumbs">' + fotos.map((f, i) =>
            '<button class="' + (i === 0 ? 'on' : '') + '" data-i="' + i + '"><img src="' + esc(f) + '" alt="Foto ' + (i + 1) + '"></button>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="pd-info">' +
          '<p class="eyebrow eyebrow-dark">' + esc(p.condicao) + ' · Garantia ' + esc(p.garantia || cat.loja.garantiaPadrao) + '</p>' +
          '<h2 id="sheet-title" class="pd-title">' + esc(p.modelo) + '</h2>' +
          '<p class="card-meta"><span class="dot" style="background:' + esc(p.corHex || '#ccc') + '"></span>' + esc(p.cor) + ' · ' + esc(p.armazenamento) +
            ' · ' + batteryIcon(p.bateria) + ' ' + esc(p.bateria) + '%</p>' +
          (p.precoAntigo > p.preco ? '<p class="old">' + money(p.precoAntigo) + '</p>' : '') +
          '<p class="price price-lg">' + money(RB.valorPix(cat, p.preco)) + ' <small>à vista no Pix</small></p>' +
          '<h3 class="pd-h">Checklist do aparelho</h3>' +
          '<ul class="checklist">' + RB.CHECKLIST_ITENS.map((it) => {
            const c = (p.checklist || {})[it.id] || { status: 'ok', nota: '' };
            const st = RB.STATUS[c.status] || RB.STATUS.ok;
            return '<li class="ck ck-' + esc(c.status) + '"><span class="ck-ic">' + st.icon + '</span><div><strong>' + esc(it.label) + '</strong>' +
              '<small>' + esc(c.nota || st.label) + '</small></div></li>';
          }).join('') + '</ul>' +
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
    btn.href = RB.linkWhats(cat, mensagem(p, temEntrada || consultar ? r : null, aba, pag.parcela, valor, lista, pix));
    btn.addEventListener('click', () => {
      const forma = valor <= 0 ? 'sem pagamento' : pag.parcela === 0 ? 'à vista' : pag.parcela ? pag.parcela + 'x' : 'a definir';
      const ent = r && (temEntrada || consultar) ? 'entrada ' + r.modelo + ' · ' : 'sem entrada · ';
      RB.registrar(cat, 'whatsapp', { produto: p, origem: 'proposta', detalhe: ent + forma + ' · ' + money(valor) });
    });
  }

  function mensagem(p, r, aba, parcela, valor, lista, pix) {
    const linhas = ['Olá! Montei uma proposta pelo site:', ''];
    linhas.push('📱 *' + RB.nomeProduto(p) + '* · ' + p.cor + ' · ' + p.condicao + ' · bateria ' + p.bateria + '%');
    linhas.push('Valor: ' + money(p.preco));
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
    return linhas.join('\n');
  }
})();
