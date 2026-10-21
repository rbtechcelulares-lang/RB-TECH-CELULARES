/* RB Tech Celulares — vitrine, detalhe do produto e simulador */
(function () {
  'use strict';
  const { money, esc } = RB;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const preview = new URLSearchParams(location.search).has('preview');
  let cat = null;
  let filtroLinha = 'todos';

  // Entrada compartilhada entre a avaliação da página e o detalhe do produto
  const entrada = { usar: null, modeloId: '', armazenamento: '', bateriaId: '', defeitos: [] };

  init().catch((e) => {
    console.error(e);
    $('#grid').innerHTML = '<p class="empty">Não foi possível carregar os produtos. Atualize a página.</p>';
  });

  async function init() {
    cat = await RB.carregarCatalogo({ preferirRascunho: preview });
    if (preview && RB.lerRascunho()) $('#preview-bar').hidden = false;
    entrada.bateriaId = (cat.avaliacao.bateria[0] || {}).id || '';
    preencherLoja();
    montarChips();
    renderGrid();
    const vitrine = ativos().slice().sort((a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0)).slice(0, 3);
    $('#hero-art').innerHTML = vitrine.map((p) => RB.phoneSVG(p.corHex)).join('');
    montarAvaliacaoPagina();
    $('#busca').addEventListener('input', renderGrid);
    $('#ordem').addEventListener('change', renderGrid);
    window.addEventListener('hashchange', rota);
    $$('[data-fechar]').forEach((el) => el.addEventListener('click', fecharSheet));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharSheet(); });
    rota();
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
    const msg = 'Olá! Vim pelo site da ' + l.nome + ' e gostaria de atendimento.';
    $$('.js-whats').forEach((a) => (a.href = RB.linkWhats(cat, msg)));
    if (l.instagram) {
      const u = l.instagram.replace(/^@/, '');
      $('#f-insta').innerHTML = '<a href="https://instagram.com/' + esc(u) + '" target="_blank" rel="noopener">@' + esc(u) + '</a>';
    }
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
        '<a class="card" href="#p/' + encodeURIComponent(p.id) + '">' +
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
            '<span class="card-cta">Ver detalhes e simular troca →</span>' +
          '</div>' +
        '</a>'
      );
    }).join('');
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
        '<fieldset class="field"><legend>Saúde da bateria <small>(Ajustes › Bateria)</small></legend><div class="pills">' +
          av.bateria.map((b) =>
            '<label class="pill"><input type="radio" name="bat-' + container.id + '" value="' + esc(b.id) + '"' + (b.id === entrada.bateriaId ? ' checked' : '') + '>' +
            '<span>' + esc(b.label) + (b.desconto > 0 ? ' <em>−' + money(b.desconto) + '</em>' : '') + '</span></label>'
          ).join('') +
        '</div></fieldset>' +
        '<fieldset class="field"><legend>O aparelho tem algum desses itens?</legend><div class="defects">' +
          av.defeitos.map((d) =>
            '<label class="defect"><input type="checkbox" value="' + esc(d.id) + '"' + (entrada.defeitos.includes(d.id) ? ' checked' : '') + '>' +
            '<span class="defect-label">' + esc(d.label) + '</span>' +
            '<span class="defect-val">' + (d.recusa ? 'Não aceito' : '−' + money(d.desconto)) + '</span></label>'
          ).join('') +
        '</div><p class="hint">Se não marcar nada, consideramos o aparelho sem defeitos.</p></fieldset>' +
      '</div>';

    $('[data-k="modelo"]', container).addEventListener('change', (e) => {
      entrada.modeloId = e.target.value;
      entrada.armazenamento = '';
      formEntrada(container, onChange);
      onChange();
    });
    const selArm = $('[data-k="arm"]', container);
    selArm.addEventListener('change', (e) => { entrada.armazenamento = e.target.value; onChange(); });
    $$('input[type=radio]', container).forEach((r) => r.addEventListener('change', () => { entrada.bateriaId = r.value; onChange(); }));
    $$('.defects input', container).forEach((c) => c.addEventListener('change', () => {
      entrada.defeitos = $$('.defects input:checked', container).map((x) => x.value);
      onChange();
    }));
  }

  function resultadoEntradaHTML(r) {
    if (!r) return '<div class="eval eval-empty">Selecione o modelo para ver a pré-avaliação.</div>';
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
        '<div class="eval-row"><span>' + esc(r.modelo) + ' ' + esc(RB.fmtGB(r.armazenamento)) + '</span><span>' + money(r.base) + '</span></div>' +
        r.descontos.map((d) => '<div class="eval-row neg"><span>' + esc(d.label) + '</span><span>−' + money(d.valor) + '</span></div>').join('') +
        '<div class="eval-total"><span>Pré-avaliação do seu iPhone</span><strong>' + money(r.total) + '</strong></div>' +
        '<p class="hint">' + esc(cat.avaliacao.observacao) + '</p>' +
      '</div>'
    );
  }

  function avaliacaoAtual() {
    return entrada.modeloId ? RB.avaliar(cat, entrada) : null;
  }

  function montarAvaliacaoPagina() {
    const box = $('#avaliar-box');
    box.innerHTML = '<div id="aval-form"></div><div id="aval-res"></div>' +
      '<a href="#vitrine" class="btn btn-ink btn-block" id="aval-go">Usar como entrada e escolher meu iPhone</a>';
    const atualizar = () => {
      const r = avaliacaoAtual();
      $('#aval-res').innerHTML = resultadoEntradaHTML(r);
      $('#aval-go').classList.toggle('disabled', !r || !!r.recusado);
    };
    formEntrada($('#aval-form'), atualizar);
    atualizar();
    $('#aval-go').addEventListener('click', () => { if (avaliacaoAtual()) entrada.usar = true; });
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
      $('#sim-pay', body).hidden = entrada.usar === null;
      const r = entrada.usar ? avaliacaoAtual() : null;
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
