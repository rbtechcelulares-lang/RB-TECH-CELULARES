/* RB Tech Celulares — painel administrativo
 * As alterações ficam num rascunho neste navegador e são publicadas
 * gravando data/catalogo.json (e as fotos) no GitHub, o que dispara o deploy da Vercel. */
(function () {
  'use strict';
  const { money, esc } = RB;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const SESSION_KEY = 'rbtech_admin_ok';
  const GH_KEY = 'rbtech_github';
  const PUB_KEY = 'rbtech_ultimo_publicado';
  const ARMAZENAMENTOS = ['64GB', '128GB', '256GB', '512GB', '1TB'];
  const CONDICOES = ['Seminovo', 'Novo lacrado', 'Vitrine'];
  const CORES = [
    ['Preto', '#22201f'], ['Branco', '#f2efe9'], ['Meia-noite', '#1f2430'], ['Estelar', '#ece5da'],
    ['Azul', '#a7c1d9'], ['Azul-sierra', '#9bb5ce'], ['Verde', '#b9cdb5'], ['Roxo', '#cdbfdc'],
    ['Rosa', '#f1cfd4'], ['Amarelo', '#f3e3a5'], ['(PRODUCT)RED', '#c2283b'], ['Grafite', '#4a4845'],
    ['Dourado', '#ead9b9'], ['Prateado', '#e3e3e0'], ['Titânio natural', '#bdb7ab'], ['Titânio preto', '#3a3836'],
    ['Titânio branco', '#ecebe7'], ['Titânio azul', '#3f4a5c'], ['Titânio deserto', '#c8ae93'], ['Ultramarino', '#5c6fd6'],
    ['Verde-acinzentado', '#a9bfb6'], ['Laranja cósmico', '#d9793b'], ['Azul-intenso', '#2f3c5a'],
    ['Bordeaux', '#5b1a2a'], ['Silver', '#d9dadc'], ['Índigo', '#3a3f6b'], ['Citrus', '#d6d26a'], ['Sky Blue', '#a9c8e6']
  ];
  const MODELOS = [
    'iPhone 11', 'iPhone 11 Pro', 'iPhone 11 Pro Max', 'iPhone SE (2ª geração)', 'iPhone SE (3ª geração)',
    'iPhone 12', 'iPhone 12 mini', 'iPhone 12 Pro', 'iPhone 12 Pro Max',
    'iPhone 13', 'iPhone 13 mini', 'iPhone 13 Pro', 'iPhone 13 Pro Max',
    'iPhone 14', 'iPhone 14 Plus', 'iPhone 14 Pro', 'iPhone 14 Pro Max',
    'iPhone 15', 'iPhone 15 Plus', 'iPhone 15 Pro', 'iPhone 15 Pro Max',
    'iPhone 16e', 'iPhone 16', 'iPhone 16 Plus', 'iPhone 16 Pro', 'iPhone 16 Pro Max',
    'iPhone 17', 'iPhone Air', 'iPhone 17 Pro', 'iPhone 17 Pro Max', 'iPhone 18 Pro', 'iPhone 18 Pro Max',
    'MacBook Neo', 'MacBook Air M5', 'MacBook Air', 'MacBook Pro'
  ];

  let publicado = null; // catálogo que está no ar
  let cat = null; // rascunho em edição
  let aba = 'produtos';

  boot();

  async function boot() {
    try {
      publicado = await RB.carregarCatalogo();
    } catch (e) {
      publicado = null;
    }
    let rasc = RB.lerRascunho();
    // rascunho sem nada pendente (igual ao último publicado daqui) dá lugar à versão do site,
    // que pode ter mudado por outro aparelho ou por atualização do sistema
    let ultimo = null;
    try { ultimo = localStorage.getItem(PUB_KEY); } catch (e) { /* ignora */ }
    if (rasc && publicado && ultimo && JSON.stringify(rasc) === ultimo) {
      rasc = null;
      try { localStorage.removeItem(RB.DRAFT_KEY); localStorage.setItem(PUB_KEY, JSON.stringify(publicado)); } catch (e) { /* ignora */ }
    }
    cat = rasc || clone(publicado);
    if (!cat) { document.body.innerHTML = '<p style="padding:24px">Não foi possível carregar data/catalogo.json.</p>'; return; }

    $('#login-form').addEventListener('submit', entrar);
    if (sessionStorage.getItem(SESSION_KEY) === '1') abrirApp();
    else $('#senha').focus();
  }

  async function entrar(e) {
    e.preventDefault();
    const hash = await RB.sha256('rbtech:' + $('#senha').value);
    const alvo = (publicado || cat).loja.senhaHash;
    if (hash !== alvo && hash !== cat.loja.senhaHash) {
      $('#login-err').hidden = false;
      return;
    }
    sessionStorage.setItem(SESSION_KEY, '1');
    abrirApp();
  }

  function abrirApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    $$('#tabs button').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.tab)));
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.goto)));
    atualizarBarra();
    render();
  }

  function irPara(t) {
    aba = t;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== t));
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function render() {
    ({
      produtos: renderProdutos, promocoes: renderPromocoes, cliques: renderCliques, avaliacao: renderAvaliacao,
      pagamento: renderPagamento, loja: renderLoja, textos: renderTextos, publicar: renderPublicar
    })[aba]();
  }

  /* ---------- Rascunho ---------- */
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  function salvar() {
    try {
      localStorage.setItem(RB.DRAFT_KEY, JSON.stringify(cat));
    } catch (e) {
      toast('Sem espaço no navegador para guardar o rascunho. Publique agora ou use fotos menores.', true);
    }
    atualizarBarra();
  }

  function temAlteracoes() {
    const atual = JSON.stringify(cat);
    const ultimo = localStorage.getItem(PUB_KEY);
    if (ultimo) return atual !== ultimo;
    return atual !== JSON.stringify(publicado);
  }

  function atualizarBarra() {
    $('#draft-bar').hidden = !temAlteracoes();
  }

  function toast(msg, erro) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('bad', !!erro);
    t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(() => (t.hidden = true), erro ? 6000 : 2600);
  }

  // Liga inputs com data-bind="caminho.no.objeto" ao rascunho
  function bind(root, onChange) {
    $$('[data-bind]', root).forEach((el) => {
      const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (el.dataset.num !== undefined) v = v === '' ? 0 : Number(String(v).replace(',', '.'));
        setPath(cat, el.dataset.bind, v);
        salvar();
        if (onChange) onChange(el);
      });
    });
  }

  function setPath(obj, path, v) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      if (o[ks[i]] == null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = v;
  }

  const inp = (path, val, attrs = '') => '<input data-bind="' + path + '" value="' + esc(val) + '" ' + attrs + '>';
  const num = (path, val, attrs = '') => '<input data-bind="' + path + '" data-num type="number" inputmode="decimal" step="any" value="' + esc(val) + '" ' + attrs + '>';

  /* ---------- Produtos ---------- */
  function renderProdutos() {
    const el = $('[data-panel="produtos"]');
    const lista = cat.produtos;
    el.innerHTML =
      '<div class="a-head"><div><h2>iPhones à venda</h2><p class="muted">' + lista.length + ' cadastrados · ' +
      lista.filter((p) => p.disponivel !== false).length + ' visíveis no site</p></div>' +
      '<button class="btn btn-ink" id="novo">+ Cadastrar iPhone</button></div>' +
      '<details class="a-card bat-linha"><summary><h3>🔋 Saúde da bateria por linha</h3> <small class="hint">usada nos seminovos sem % informada</small></summary>' +
        '<div class="bl-grid">' + ['11', '12', '13', '14', '15', '16', '17'].map((n) =>
          '<label class="field"><span>iPhone ' + n + '</span>' + inp('bateriaLinha.' + n, (cat.bateriaLinha || {})[n] || '', 'placeholder="ex.: 80% a 83%"') + '</label>').join('') +
        '</div><p class="hint">Aparelhos "Novo lacrado" sempre mostram 100%. Se você informar a % no cadastro do aparelho, vale a do cadastro.</p>' +
      '</details>' +
      '<div class="a-search"><input type="search" id="a-busca" placeholder="Buscar…"></div>' +
      '<div class="plist" id="plist"></div>';

    const desenhar = () => {
      const q = $('#a-busca').value.toLowerCase();
      $('#plist').innerHTML = lista.map((p, i) => ({ p, i }))
        .filter(({ p }) => !q || [p.modelo, p.cor, p.armazenamento].join(' ').toLowerCase().includes(q))
        .map(({ p, i }) =>
          '<div class="prow' + (p.disponivel === false ? ' off' : '') + '">' +
            '<div class="prow-img" style="--tint:' + esc(p.corHex || '#ccc') + '">' +
              (p.fotos && p.fotos[0] ? '<img src="' + esc(p.fotos[0]) + '" alt="">' : RB.produtoSVG(p)) + '</div>' +
            '<div class="prow-info"><strong>' + esc(RB.nomeProduto(p)) + '</strong>' +
              '<span>' + esc(p.cor) + ' · ' + esc(p.condicao) + (RB.ehMac(p) ? (p.specs ? ' · ' + esc(p.specs) : '') : ' · 🔋 ' + esc(RB.batTexto(p, cat))) + (p.destaque ? ' · ★ promoção' : '') + '</span>' +
              '<span class="prow-price">' + money(p.preco) + '</span></div>' +
            '<label class="switch" title="Visível no site"><input type="checkbox" data-vis="' + i + '"' + (p.disponivel !== false ? ' checked' : '') + '><span></span></label>' +
            '<div class="prow-act">' +
              '<button class="btn btn-sm btn-outline" data-ed="' + i + '">Editar</button>' +
              '<button class="btn btn-sm btn-outline" data-dup="' + i + '" title="Duplicar">⧉</button>' +
              '<button class="btn btn-sm btn-danger" data-del="' + i + '" title="Excluir">🗑</button>' +
            '</div>' +
          '</div>'
        ).join('') || '<p class="empty">Nenhum iPhone.</p>';

      $$('[data-vis]').forEach((c) => c.addEventListener('change', () => {
        lista[c.dataset.vis].disponivel = c.checked; salvar(); desenhar();
      }));
      $$('[data-ed]').forEach((b) => b.addEventListener('click', () => abrirEditor(Number(b.dataset.ed))));
      $$('[data-dup]').forEach((b) => b.addEventListener('click', () => {
        const c = clone(lista[b.dataset.dup]);
        c.id = novoId(c);
        lista.splice(Number(b.dataset.dup) + 1, 0, c);
        salvar(); desenhar(); toast('Duplicado. Edite cor, bateria e fotos.');
      }));
      $$('[data-del]').forEach((b) => b.addEventListener('click', () => {
        const p = lista[b.dataset.del];
        if (!confirm('Excluir ' + RB.nomeProduto(p) + ' ' + p.cor + '?')) return;
        lista.splice(Number(b.dataset.del), 1); salvar(); renderProdutos();
      }));
    };
    bind($('.bat-linha', el), () => desenhar());
    $('#a-busca').addEventListener('input', desenhar);
    $('#novo').addEventListener('click', () => abrirEditor(-1));
    desenhar();
  }

  function novoId(p) {
    const slug = (RB.nomeProduto(p) + '-' + (p.cor || '')).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return 'p-' + slug + '-' + Date.now().toString(36).slice(-4);
  }

  function produtoVazio() {
    const ck = {};
    RB.CHECKLIST_ITENS.forEach((it) => (ck[it.id] = { status: 'ok', nota: '' }));
    return {
      id: '', modelo: 'iPhone 13', armazenamento: '128GB', cor: 'Meia-noite', corHex: '#1f2430', condicao: 'Seminovo',
      bateria: 90, preco: 0, precoAntigo: 0, garantia: cat.loja.garantiaPadrao || '90 dias',
      destaque: false, disponivel: true, fotos: [], observacoes: '', checklist: ck
    };
  }

  function abrirEditor(idx) {
    const novo = idx < 0;
    const p = novo ? produtoVazio() : clone(cat.produtos[idx]);
    p.checklist = p.checklist || {};
    RB.CHECKLIST_ITENS.forEach((it) => { if (!p.checklist[it.id]) p.checklist[it.id] = { status: 'ok', nota: '' }; });
    const ed = $('#editor');
    const f = $('#ed-form');

    const opt = (arr, v) => arr.map((x) => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    f.innerHTML =
      '<div class="ed-head"><h2>' + (novo ? 'Cadastrar iPhone' : 'Editar iPhone') + '</h2>' +
      '<button type="button" class="sheet-close" data-x aria-label="Fechar">×</button></div>' +

      '<div class="ed-sec"><h3>Fotos</h3>' +
        '<div class="photos" id="ed-fotos"></div>' +
        '<div class="photo-add">' +
          '<label class="btn btn-outline btn-sm">📷 Adicionar fotos<input type="file" accept="image/*" multiple id="ed-up" hidden></label>' +
          '<input id="ed-url" placeholder="ou cole o link de uma foto"><button type="button" class="btn btn-sm btn-outline" id="ed-url-add">Adicionar</button>' +
        '</div><p class="hint">A primeira foto é a capa. As fotos são reduzidas automaticamente.</p></div>' +

      '<div class="ed-sec"><h3>Aparelho</h3><div class="ed-grid">' +
        '<label class="field"><span>Modelo</span><input name="modelo" list="dl-modelos" value="' + esc(p.modelo) + '" required>' +
          '<datalist id="dl-modelos">' + MODELOS.map((m) => '<option value="' + esc(m) + '">').join('') + '</datalist></label>' +
        '<label class="field"><span>Armazenamento</span><select name="armazenamento">' + opt(ARMAZENAMENTOS, p.armazenamento) + '</select></label>' +
        '<label class="field"><span>Condição</span><select name="condicao">' + opt(CONDICOES, p.condicao) + '</select></label>' +
        '<label class="field"><span>Garantia</span><input name="garantia" value="' + esc(p.garantia) + '"></label>' +
        '<label class="field ed-mac"><span>Configuração (MacBook)</span><input name="specs" value="' + esc(p.specs || '') + '" placeholder="Ex.: 16 GB de RAM · chip M5"></label>' +
      '</div>' +
      '<div class="field"><span>Cor</span><div class="colors">' +
        CORES.map(([n, h]) => '<button type="button" class="sw' + (n === p.cor ? ' on' : '') + '" data-c="' + esc(n) + '" data-h="' + h + '" title="' + esc(n) + '" style="background:' + h + '"></button>').join('') +
      '</div><div class="ed-grid ed-grid-2">' +
        '<input name="cor" value="' + esc(p.cor) + '" placeholder="Nome da cor">' +
        '<input name="corHex" type="color" value="' + esc(p.corHex || '#cccccc') + '" title="Tom da cor">' +
      '</div></div>' +
      '<div class="ed-iphone"><label class="field"><span>Saúde da bateria: <b id="bat-v">' + esc(RB.batTexto(p, cat)) + '</b></span>' +
        '<input name="bateria" type="range" min="50" max="100" value="' + esc(Number(p.bateria) > 0 ? p.bateria : 90) + '"' + (Number(p.bateria) > 0 ? '' : ' disabled') + '></label>' +
      '<label class="check"><input type="checkbox" name="semBateria"' + (Number(p.bateria) > 0 ? '' : ' checked') + '> Não informar a porcentagem (usa a faixa da linha)</label></div>' +
      '</div>' +

      '<div class="ed-sec"><h3>Valores</h3><div class="ed-grid">' +
        '<label class="field"><span>Preço (R$)</span><input name="preco" type="number" inputmode="decimal" step="any" min="0" value="' + esc(p.preco || '') + '" required></label>' +
        '<label class="field"><span>Preço "de" riscado (opcional)</span><input name="precoAntigo" type="number" inputmode="decimal" step="any" min="0" value="' + esc(p.precoAntigo || '') + '"></label>' +
      '</div><div id="ed-sim" class="hint"></div></div>' +

      '<div class="ed-sec ed-iphone"><h3>Checklist</h3><div class="ck-ed">' +
        RB.CHECKLIST_ITENS.map((it) => {
          const c = p.checklist[it.id];
          return '<div class="ck-row"><strong>' + esc(it.label) + '</strong><div class="seg">' +
            Object.keys(RB.STATUS).map((s) =>
              '<label class="seg-' + s + '"><input type="radio" name="ck-' + it.id + '" value="' + s + '"' + (c.status === s ? ' checked' : '') + '><span>' + RB.STATUS[s].icon + ' ' + RB.STATUS[s].label + '</span></label>'
            ).join('') + '</div>' +
            '<input name="nota-' + it.id + '" value="' + esc(c.nota) + '" placeholder="Observação (opcional)"></div>';
        }).join('') +
      '</div></div>' +

      '<div class="ed-sec"><h3>Outros</h3>' +
        '<label class="field"><span>Observações para o cliente</span><textarea name="observacoes" rows="2">' + esc(p.observacoes) + '</textarea></label>' +
        '<div class="ed-checks">' +
          '<label class="check"><input type="checkbox" name="destaque"' + (p.destaque ? ' checked' : '') + '> Em promoção (selo "Promoção" na vitrine)</label>' +
          '<label class="check"><input type="checkbox" name="disponivel"' + (p.disponivel !== false ? ' checked' : '') + '> Visível no site</label>' +
        '</div></div>' +

      '<div class="ed-foot"><button type="button" class="btn btn-outline" data-x>Cancelar</button>' +
      '<button type="submit" class="btn btn-ink">Salvar</button></div>';

    const desenharFotos = () => {
      $('#ed-fotos').innerHTML = p.fotos.map((src, i) =>
        '<div class="ph"><img src="' + esc(src) + '" alt="">' +
          (i === 0 ? '<span class="ph-cap">Capa</span>' : '') +
          '<div class="ph-act">' +
            (i > 0 ? '<button type="button" data-l="' + i + '" title="Mover para a esquerda">←</button>' : '') +
            '<button type="button" data-r="' + i + '" title="Remover">×</button>' +
          '</div></div>'
      ).join('') || '<p class="hint">Sem fotos ainda — o site mostra uma ilustração na cor escolhida.</p>';
      $$('[data-l]', f).forEach((b) => b.addEventListener('click', () => {
        const i = Number(b.dataset.l); [p.fotos[i - 1], p.fotos[i]] = [p.fotos[i], p.fotos[i - 1]]; desenharFotos();
      }));
      $$('[data-r]', f).forEach((b) => b.addEventListener('click', () => { p.fotos.splice(Number(b.dataset.r), 1); desenharFotos(); }));
    };
    desenharFotos();

    $('#ed-up').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        try { p.fotos.push(await comprimir(file)); } catch (err) { toast('Não foi possível ler ' + file.name, true); }
      }
      e.target.value = '';
      desenharFotos();
    });
    $('#ed-url-add').addEventListener('click', () => {
      const u = $('#ed-url').value.trim();
      if (!u) return;
      p.fotos.push(u); $('#ed-url').value = ''; desenharFotos();
    });

    $$('.sw', f).forEach((b) => b.addEventListener('click', () => {
      f.cor.value = b.dataset.c; f.corHex.value = b.dataset.h;
      $$('.sw', f).forEach((x) => x.classList.toggle('on', x === b));
    }));
    const tipo = () => {
      const mac = /macbook/i.test(f.modelo.value);
      $$('.ed-iphone', f).forEach((x) => (x.hidden = mac));
      $$('.ed-mac', f).forEach((x) => (x.hidden = !mac));
    };
    f.modelo.addEventListener('input', tipo); tipo();
    f.bateria.addEventListener('input', () => ($('#bat-v').textContent = f.bateria.value + '%'));
    f.semBateria.addEventListener('change', () => {
      f.bateria.disabled = f.semBateria.checked;
      $('#bat-v').textContent = f.semBateria.checked ? RB.batTexto(Object.assign({}, p, { bateria: null, modelo: f.modelo.value, condicao: f.condicao.value }), cat) : f.bateria.value + '%';
    });
    const sim = () => {
      const v = Number(f.preco.value) || 0;
      const l = RB.parcelas(cat, v);
      const u = l[l.length - 1];
      $('#ed-sim').textContent = v ? 'No site: ' + money(RB.valorPix(cat, v)) + ' à vista ou ' + u.n + 'x de ' + money(u.parcela) + ' (total ' + money(u.total) + ')' : '';
    };
    f.preco.addEventListener('input', sim); sim();

    const fechar = () => { ed.hidden = true; document.body.classList.remove('no-scroll'); };
    $$('[data-x]', f).forEach((b) => b.addEventListener('click', fechar));
    $('.sheet-backdrop', ed).onclick = fechar;

    f.onsubmit = (e) => {
      e.preventDefault();
      Object.assign(p, {
        modelo: f.modelo.value.trim(),
        armazenamento: f.armazenamento.value,
        condicao: f.condicao.value,
        categoria: /macbook/i.test(f.modelo.value) ? 'macbook' : 'iphone',
        specs: f.specs.value.trim(),
        garantia: f.garantia.value.trim(),
        cor: f.cor.value.trim(),
        corHex: f.corHex.value,
        bateria: f.semBateria.checked ? null : Number(f.bateria.value),
        preco: Number(f.preco.value) || 0,
        precoAntigo: Number(f.precoAntigo.value) || 0,
        observacoes: f.observacoes.value.trim(),
        destaque: f.destaque.checked,
        disponivel: f.disponivel.checked
      });
      RB.CHECKLIST_ITENS.forEach((it) => {
        p.checklist[it.id] = { status: (f['ck-' + it.id].value || 'ok'), nota: f['nota-' + it.id].value.trim() };
      });
      if (novo) { p.id = novoId(p); cat.produtos.unshift(p); } else cat.produtos[idx] = p;
      salvar();
      fechar();
      renderProdutos();
      toast('Salvo no rascunho. Publique para o site atualizar.');
    };

    ed.hidden = false;
    document.body.classList.add('no-scroll');
    $('.sheet-panel', ed).scrollTop = 0;
  }

  // Reduz a foto para no máximo 1200px e converte para WebP (ou JPEG)
  function comprimir(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1200;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        let d = c.toDataURL('image/webp', 0.82);
        if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/jpeg', 0.85);
        resolve(d);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
      img.src = url;
    });
  }

  /* ---------- Avaliação de entrada ---------- */
  function renderAvaliacao() {
    const el = $('[data-panel="avaliacao"]');
    const av = cat.avaliacao;
    el.innerHTML =
      '<div class="a-head"><div><h2>Pré-avaliação dos aparelhos de entrada</h2>' +
      '<p class="muted">Valor base de cada iPhone aceito (em perfeito estado, bateria acima de 90%) e os descontos aplicados conforme o estado.</p></div></div>' +

      '<div class="a-card"><h3>iPhones aceitos e valor base</h3><div class="tbl">' +
        av.modelos.map((m, i) =>
          '<div class="tm"><div class="tm-name">' + inp('avaliacao.modelos.' + i + '.nome', m.nome, 'placeholder="Modelo"') +
          '<button class="icon-btn" data-delm="' + i + '" title="Remover modelo">🗑</button></div>' +
          '<label class="check sm"><input type="checkbox" data-bind="avaliacao.modelos.' + i + '.whatsapp"' + (m.whatsapp ? ' checked' : '') + '> Avaliar pelo WhatsApp (sem valor fixo no site)</label>' +
          '<div class="tm-vals">' + Object.keys(m.valores).map((a) =>
            '<label class="tv"><span>' + esc(RB.fmtGB(a)) + '</span>' + num('avaliacao.modelos.' + i + '.valores.' + a, m.valores[a], 'min="0"') +
            '<button class="icon-btn sm" data-dela="' + i + '|' + esc(a) + '" title="Remover">×</button></label>'
          ).join('') +
          '<button class="add-sm" data-adda="' + i + '">+ capacidade</button></div></div>'
        ).join('') +
      '</div><button class="btn btn-sm btn-outline" id="addm">+ Adicionar modelo aceito</button></div>' +

      '<div class="a-card"><h3>Saúde da bateria</h3><p class="hint">O cliente escolhe uma faixa. Use 0 para não descontar.</p><div class="rows">' +
        av.bateria.map((b, i) =>
          '<div class="r">' + inp('avaliacao.bateria.' + i + '.label', b.label, 'placeholder="Faixa"') +
          '<label class="money-in"><span>− R$</span>' + num('avaliacao.bateria.' + i + '.desconto', b.desconto, 'min="0"') + '</label>' +
          '<button class="icon-btn" data-delb="' + i + '">🗑</button></div>'
        ).join('') +
      '</div><button class="btn btn-sm btn-outline" id="addb">+ Adicionar faixa</button></div>' +

      '<div class="a-card"><h3>Itens que desvalorizam a avaliação</h3><p class="hint">Marque "recusar" para itens em que o aparelho não é aceito (ex.: bloqueio iCloud).</p><div class="rows">' +
        av.defeitos.map((d, i) =>
          '<div class="r">' + inp('avaliacao.defeitos.' + i + '.label', d.label, 'placeholder="Ex.: Tela trincada"') +
          '<label class="money-in"><span>− R$</span>' + num('avaliacao.defeitos.' + i + '.desconto', d.desconto, 'min="0"') + '</label>' +
          '<label class="check sm"><input type="checkbox" data-bind="avaliacao.defeitos.' + i + '.recusa"' + (d.recusa ? ' checked' : '') + '> recusar</label>' +
          '<button class="icon-btn" data-deld="' + i + '">🗑</button></div>'
        ).join('') +
      '</div><button class="btn btn-sm btn-outline" id="addd">+ Adicionar item</button></div>' +

      '<div class="a-card"><h3>Aviso exibido ao cliente</h3><label class="field">' +
        '<textarea data-bind="avaliacao.observacao" rows="2">' + esc(av.observacao) + '</textarea></label></div>';

    bind(el);
    const re = () => { salvar(); renderAvaliacao(); };
    $$('[data-delm]', el).forEach((b) => b.addEventListener('click', () => {
      if (confirm('Remover ' + av.modelos[b.dataset.delm].nome + '?')) { av.modelos.splice(Number(b.dataset.delm), 1); re(); }
    }));
    $$('[data-dela]', el).forEach((b) => b.addEventListener('click', () => {
      const [i, a] = b.dataset.dela.split('|'); delete av.modelos[i].valores[a]; re();
    }));
    $$('[data-adda]', el).forEach((b) => b.addEventListener('click', () => {
      const a = (prompt('Capacidade em GB (ex.: 128, 256, 512; 1TB = 1024, 2TB = 2048):') || '').replace(/\D/g, '');
      if (a) { av.modelos[b.dataset.adda].valores[a] = 0; re(); }
    }));
    $('#addm', el).addEventListener('click', () => {
      av.modelos.push({ id: 'm' + Date.now().toString(36), nome: 'iPhone ', valores: { 128: 0, 256: 0 } }); re();
    });
    $$('[data-delb]', el).forEach((b) => b.addEventListener('click', () => { av.bateria.splice(Number(b.dataset.delb), 1); re(); }));
    $('#addb', el).addEventListener('click', () => { av.bateria.push({ id: 'b' + Date.now().toString(36), label: '', desconto: 0 }); re(); });
    $$('[data-deld]', el).forEach((b) => b.addEventListener('click', () => { av.defeitos.splice(Number(b.dataset.deld), 1); re(); }));
    $('#addd', el).addEventListener('click', () => { av.defeitos.push({ id: 'd' + Date.now().toString(36), label: '', desconto: 0 }); re(); });
  }

  /* ---------- Pagamento ---------- */
  function renderPagamento() {
    const el = $('[data-panel="pagamento"]');
    const pg = cat.pagamento;
    el.innerHTML =
      '<div class="a-head"><div><h2>Parcelas e taxas da maquininha</h2>' +
      '<p class="muted">Informe o acréscimo (%) cobrado do cliente em cada número de parcelas. O site calcula: valor × (1 + taxa). Deixe em branco as parcelas que você não oferece.</p></div></div>' +
      '<div class="a-card"><div class="ed-grid">' +
        '<label class="field"><span>Desconto no Pix/dinheiro (%)</span>' + num('pagamento.descontoPix', pg.descontoPix, 'min="0" max="50"') + '</label>' +
        '<label class="field"><span>Máximo de parcelas</span><select data-bind="pagamento.maxParcelas" data-num>' +
          Array.from({ length: 24 }, (_, i) => i + 1).map((n) => '<option' + (n === Number(pg.maxParcelas) ? ' selected' : '') + '>' + n + '</option>').join('') +
        '</select></label>' +
        '<label class="field"><span>Simular com o valor (R$)</span><input id="sim-v" type="number" value="3000"></label>' +
      '</div></div>' +
      '<div class="a-card"><div class="taxas">' +
        Array.from({ length: Number(pg.maxParcelas) || 12 }, (_, i) => i + 1).map((n) =>
          '<label class="tx"><span>' + n + 'x</span><span class="pct"><input data-tx="' + n + '" type="number" inputmode="decimal" step="any" min="0" placeholder="não oferece" value="' + esc(pg.taxas[n] ?? '') + '"><i>%</i></span>' +
          '<small id="tx-' + n + '"></small></label>'
        ).join('') +
      '</div></div>';

    const sim = () => {
      const v = Number($('#sim-v').value) || 0;
      RB.parcelas(cat, v).forEach((x) => {
        const s = $('#tx-' + x.n);
        if (s) s.textContent = x.n + 'x ' + money(x.parcela) + ' = ' + money(x.total);
      });
      $$('[data-tx]', el).forEach((i) => { if (i.value === '') $('#tx-' + i.dataset.tx).textContent = 'Não aparece no site'; });
    };
    bind(el, (inpEl) => { if (inpEl.tagName === 'SELECT') renderPagamento(); else sim(); });
    $$('[data-tx]', el).forEach((i) => i.addEventListener('input', () => {
      const v = i.value.trim().replace(',', '.');
      if (v === '') delete pg.taxas[i.dataset.tx]; else pg.taxas[i.dataset.tx] = Number(v);
      salvar(); sim();
    }));
    $('#sim-v').addEventListener('input', sim);
    sim();
  }

  /* ---------- Loja ---------- */
  function renderLoja() {
    const el = $('[data-panel="loja"]');
    const l = cat.loja;
    const campo = (k, rotulo, extra = '', dica = '') =>
      '<label class="field"><span>' + rotulo + '</span>' + inp('loja.' + k, l[k] || '', extra) + (dica ? '<small class="hint">' + dica + '</small>' : '') + '</label>';
    el.innerHTML =
      '<div class="a-head"><div><h2>Loja e contatos</h2><p class="muted">Aparecem no topo, no rodapé e nas mensagens de WhatsApp.</p></div></div>' +
      '<div class="a-card"><div class="ed-grid">' +
        campo('nome', 'Nome da loja') +
        campo('whatsapp', 'WhatsApp (com DDI e DDD)', 'inputmode="tel" placeholder="5511999999999"', 'Apenas números. Ex.: 55 + DDD + número.') +
        campo('slogan', 'Slogan', '', 'Coloque *entre asteriscos* o trecho que fica em amarelo.') +
        campo('regiao', 'Região (aparece acima do slogan)') +
        campo('garantiaPadrao', 'Garantia padrão dos seminovos') +
      '</div><label class="field"><span>Texto de apresentação</span><textarea data-bind="loja.subtitulo" rows="2">' + esc(l.subtitulo) + '</textarea></label>' +
      '<p class="hint" id="wa-test"></p></div>' +
      '<div class="a-card"><h3>Contatos e redes</h3><p class="hint">Deixe em branco o que não quiser mostrar no rodapé.</p><div class="ed-grid">' +
        campo('instagram', 'Instagram', 'placeholder="@sualoja"') +
        campo('tiktok', 'TikTok', 'placeholder="@sualoja"') +
        campo('facebook', 'Facebook', 'placeholder="link ou @pagina"') +
        campo('email', 'E-mail', 'type="email" placeholder="contato@sualoja.com"') +
        campo('endereco', 'Endereço') +
        campo('mapsLink', 'Link do Google Maps', 'placeholder="https://maps.app.goo.gl/…"') +
        campo('horario', 'Horário de atendimento') +
      '</div></div>' +
      '<div class="a-card"><h3>Trocar senha do admin</h3><div class="ed-grid">' +
        '<label class="field"><span>Nova senha</span><input type="password" id="ns1" autocomplete="new-password"></label>' +
        '<label class="field"><span>Repita a nova senha</span><input type="password" id="ns2" autocomplete="new-password"></label>' +
      '</div><button class="btn btn-sm btn-ink" id="trocar">Trocar senha</button>' +
      '<p class="hint">A nova senha passa a valer depois de publicar.</p></div>';
    const wa = () => {
      const n = String(cat.loja.whatsapp || '').replace(/\D/g, '');
      $('#wa-test').innerHTML = n.length >= 12
        ? '<a href="' + RB.linkWhats(cat, 'Teste do site') + '" target="_blank" rel="noopener">Testar link do WhatsApp →</a>'
        : '⚠️ Informe o WhatsApp com 55 + DDD + número.';
    };
    bind(el, wa);
    wa();
    $('#trocar').addEventListener('click', async () => {
      const a = $('#ns1').value, b = $('#ns2').value;
      if (a.length < 6) return toast('Use pelo menos 6 caracteres.', true);
      if (a !== b) return toast('As senhas não conferem.', true);
      cat.loja.senhaHash = await RB.sha256('rbtech:' + a);
      salvar(); $('#ns1').value = $('#ns2').value = '';
      toast('Senha alterada no rascunho. Publique para valer.');
    });
  }


  /* ---------- Promoções: destaque do topo e pop-up ---------- */
  function renderPromocoes() {
    const el = $('[data-panel="promocoes"]');
    cat.promocao = cat.promocao || {};
    cat.popup = cat.popup || {};
    const pr = cat.promocao, pp = cat.popup;
    const optProdutos = (sel) => cat.produtos.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' +
      esc(RB.nomeProduto(p) + ' · ' + p.cor + ' · ' + money(p.preco)) + (p.disponivel === false ? ' (oculto)' : '') + '</option>').join('');
    const opt = (pares, v) => pares.map(([k, t]) => '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + t + '</option>').join('');
    el.innerHTML =
      '<div class="a-head"><div><h2>Promoções</h2><p class="muted">O destaque do início da página e o pop-up que abre quando o cliente entra no site.</p></div></div>' +

      '<div class="a-card"><h3>⭐ Promoção em evidência no início da página</h3>' +
        '<div class="ed-grid">' +
          '<label class="field"><span>iPhone da promoção</span><select data-bind="promocao.produtoId">' +
            '<option value="">Automático (um dos marcados como promoção)</option>' + optProdutos(pr.produtoId) + '</select></label>' +
          '<label class="field"><span>Texto da faixa</span>' + inp('promocao.faixa', pr.faixa || '', 'placeholder="Oferta da semana"') + '</label>' +
        '</div>' +
        '<label class="field"><span>Frase da promoção</span>' + inp('promocao.texto', pr.texto || '', 'placeholder="Ex.: Últimas unidades com 10% off"') + '</label>' +
        '<p class="hint">Para mostrar preço "de/por" e a % de desconto, preencha o "Preço de riscado" no cadastro do iPhone.</p>' +
      '</div>' +

      '<div class="a-card"><div class="pop-head"><h3>📣 Pop-up de campanha</h3>' +
        '<label class="switch" title="Ligar pop-up"><input type="checkbox" data-bind="popup.ativo"' + (pp.ativo ? ' checked' : '') + '><span></span></label></div>' +
        '<p class="hint" id="pop-status"></p>' +
        '<div class="ed-grid">' +
          '<label class="field"><span>Selo (opcional)</span>' + inp('popup.selo', pp.selo || '', 'placeholder="Ex.: Só esta semana"') + '</label>' +
          '<label class="field"><span>Cupom (opcional)</span>' + inp('popup.cupom', pp.cupom || '', 'placeholder="Ex.: RBTECH100"') + '</label>' +
        '</div>' +
        '<label class="field"><span>Título</span>' + inp('popup.titulo', pp.titulo || '', 'placeholder="Ex.: Ganhe *R$ 100 OFF* no seu iPhone"') +
          '<small class="hint">Coloque *entre asteriscos* o trecho que fica em amarelo.</small></label>' +
        '<label class="field"><span>Texto</span><textarea data-bind="popup.texto" rows="3" placeholder="Escreva aqui a promoção, as regras do cupom etc.">' + esc(pp.texto || '') + '</textarea></label>' +
        '<div class="ed-grid">' +
          '<label class="field"><span>Texto do botão</span>' + inp('popup.botaoTexto', pp.botaoTexto || '', 'placeholder="Ex.: Quero aproveitar"') + '</label>' +
          '<label class="field"><span>Ao clicar no botão</span><select data-bind="popup.acao" id="pop-acao">' +
            opt([['whatsapp', 'Abrir WhatsApp com a promoção'], ['produto', 'Abrir um iPhone'], ['vitrine', 'Ir para a vitrine'], ['link', 'Abrir um link'], ['fechar', 'Só fechar']], pp.acao || 'whatsapp') +
          '</select></label>' +
          '<label class="field" id="pop-prod"><span>iPhone</span><select data-bind="popup.produtoId"><option value="">Selecione…</option>' + optProdutos(pp.produtoId) + '</select></label>' +
          '<label class="field" id="pop-link"><span>Link</span>' + inp('popup.link', pp.link || '', 'placeholder="https://…"') + '</label>' +
        '</div>' +
        '<label class="field" id="pop-msg"><span>Mensagem que chega no seu WhatsApp</span>' +
          inp('popup.mensagem', pp.mensagem || '', 'placeholder="Olá! Quero ativar meu cupom *{cupom}* da promoção &quot;{titulo}&quot;. 🎟️"') +
          '<small class="hint">{cupom} vira o código do cupom e {titulo} o título da promoção. Em branco usa a mensagem padrão. ' +
          'Com cupom, o botão também copia o código e deixa o cupom ativo nas propostas do cliente.</small></label>' +
        '<div class="field"><span>Imagem (opcional)</span><div class="photo-add">' +
          '<span id="pop-img"></span>' +
          '<label class="btn btn-outline btn-sm">📷 Escolher imagem<input type="file" accept="image/*" id="pop-up" hidden></label>' +
          '<button type="button" class="btn btn-sm btn-outline" id="pop-img-x">Remover</button>' +
        '</div></div>' +
        '<div class="ed-grid">' +
          '<label class="field"><span>Mostrar para o cliente</span><select data-bind="popup.frequencia">' +
            opt([['sessao', 'Uma vez a cada visita'], ['dia', 'Uma vez por dia'], ['uma', 'Só uma vez'], ['sempre', 'Sempre que abrir a página']], pp.frequencia || 'sessao') +
          '</select></label>' +
          '<label class="field"><span>Abrir depois de (segundos)</span>' + num('popup.atraso', pp.atraso ?? 2, 'min="0" max="60"') + '</label>' +
          '<label class="field"><span>Começa em (opcional)</span><input type="date" data-bind="popup.inicio" value="' + esc(pp.inicio || '') + '"></label>' +
          '<label class="field"><span>Termina em (opcional)</span><input type="date" data-bind="popup.fim" value="' + esc(pp.fim || '') + '"></label>' +
        '</div>' +
        '<div class="pub-act"><button type="button" class="btn btn-ink" id="pop-ver">👁 Ver como fica</button>' +
        '<a class="btn btn-outline" href="index.html?preview=1&popup=1" target="_blank">Ver no site (pré-visualização)</a></div>' +
      '</div>';

    const ajustar = () => {
      $('#pop-prod').hidden = (cat.popup.acao || 'whatsapp') !== 'produto';
      $('#pop-link').hidden = cat.popup.acao !== 'link';
      $('#pop-msg').hidden = (cat.popup.acao || 'whatsapp') !== 'whatsapp';
      $('#pop-img').innerHTML = cat.popup.imagem ? '<img class="pop-thumb" src="' + esc(cat.popup.imagem) + '" alt="">' : '<small class="hint">Sem imagem</small>';
      $('#pop-img-x').hidden = !cat.popup.imagem;
      const vig = RB.campanhaVigente(cat.popup);
      $('#pop-status').innerHTML = !cat.popup.ativo ? '⚪ Pop-up desligado.'
        : vig ? '🟢 Ligado: aparece para os clientes depois de publicar.' : '🟡 Ligado, mas fora das datas escolhidas.';
    };
    bind(el, ajustar);
    ajustar();
    $('#pop-up').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { cat.popup.imagem = await comprimir(f); salvar(); ajustar(); } catch (err) { toast('Não foi possível ler a imagem.', true); }
      e.target.value = '';
    });
    $('#pop-img-x').addEventListener('click', () => { cat.popup.imagem = ''; salvar(); ajustar(); });
    $('#pop-ver').addEventListener('click', () => {
      if (!cat.popup.titulo) return toast('Escreva um título para o pop-up.', true);
      RB.abrirPopup(cat, (p, fechar) => { fechar(); toast('No site, o botão vai: ' + $('#pop-acao').selectedOptions[0].textContent.toLowerCase() + '.'); });
    });
  }

  /* ---------- Textos do site ---------- */
  function renderTextos() {
    const el = $('[data-panel="textos"]');
    cat.textos = cat.textos || {};
    el.innerHTML =
      '<div class="a-head"><div><h2>Textos do site</h2><p class="muted">Use *asteriscos* para destacar em amarelo e {parcelas} para o número máximo de parcelas. Campo vazio volta ao texto padrão.</p></div></div>' +
      RB.TEXTOS.map((g) =>
        '<div class="a-card"><h3>' + esc(g.grupo) + '</h3>' +
        g.itens.map(([k, rotulo, padrao]) => {
          const v = cat.textos[k] != null ? cat.textos[k] : padrao;
          const longo = padrao.length > 60;
          return '<label class="field"><span>' + esc(rotulo) + '</span>' +
            (longo ? '<textarea data-bind="textos.' + k + '" rows="2">' + esc(v) + '</textarea>' : inp('textos.' + k, v)) + '</label>';
        }).join('') + '</div>'
      ).join('');
    bind(el);
  }

  /* ---------- Cliques: painel de desempenho ---------- */
  const PAINEL_KEY = 'rbtech_painel_chave';
  let periodo = '30';

  function renderCliques() {
    const el = $('[data-panel="cliques"]');
    cat.rastreamento = cat.rastreamento || { supabaseUrl: '', supabaseChave: '' };
    const rs = cat.rastreamento;
    let chave = '';
    try { chave = localStorage.getItem(PAINEL_KEY) || ''; } catch (e) { /* ignora */ }
    const lim0 = RB.limparSupabase(rs.supabaseUrl, rs.supabaseChave);
    if (lim0.url !== (rs.supabaseUrl || '') || lim0.chave !== (rs.supabaseChave || '')) {
      rs.supabaseUrl = lim0.url; rs.supabaseChave = lim0.chave; salvar();
    }
    const pronto = rs.supabaseUrl && rs.supabaseChave;
    el.innerHTML =
      '<div class="a-head"><div><h2>Cliques e propostas</h2><p class="muted">Quantas vezes cada iPhone foi aberto e quantas propostas foram enviadas para o WhatsApp.</p></div>' +
      '<div class="periodo" role="tablist">' + [['1', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['0', 'Tudo']].map(([v, t]) =>
        '<button data-per="' + v + '" class="' + (v === periodo ? 'on' : '') + '">' + t + '</button>').join('') + '</div></div>' +
      '<div id="dash">' + (pronto && chave ? '<p class="hint">Carregando…</p>' : '') + '</div>' +
      '<details class="a-card" ' + (pronto && chave ? '' : 'open') + '><summary><h3>⚙️ Configuração do registro de cliques</h3></summary>' +
        '<ol class="steps-cfg">' +
          '<li>Crie uma conta grátis em <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a> e um projeto novo.</li>' +
          '<li>No projeto, abra <b>SQL Editor</b>, cole o conteúdo do arquivo <code>supabase/rastreamento.sql</code> do repositório, troque <code>TROQUE-ESTA-CHAVE</code> por uma senha sua e clique em <b>Run</b>.</li>' +
          '<li>Em <b>Project Settings › API Keys</b>, copie a chave pública (<b>anon</b> ou <b>publishable</b>); a <b>Project URL</b> fica em <b>Project Settings › Data API</b>. Cole as duas abaixo e publique o site.</li>' +
          '<li>Digite a senha que você escolheu no passo 2 em "Chave do painel".</li>' +
        '</ol>' +
        '<div class="ed-grid">' +
          '<label class="field"><span>Project URL</span>' + inp('rastreamento.supabaseUrl', rs.supabaseUrl || '', 'placeholder="https://xxxx.supabase.co"') + '</label>' +
          '<label class="field"><span>Chave pública (anon ou publishable)</span>' + inp('rastreamento.supabaseChave', rs.supabaseChave || '', 'placeholder="eyJhbGciOi… ou sb_publishable_…"') + '</label>' +
        '</div>' +
        '<label class="field"><span>Chave do painel (fica só neste navegador)</span><input type="password" id="painel-chave" value="' + esc(chave) + '" autocomplete="off"></label>' +
        '<button class="btn btn-sm btn-ink" id="painel-ok">Salvar e carregar</button>' +
      '</details>';
    bind(el, (campo) => {
      if (!/^rastreamento\./.test(campo.dataset.bind || '')) return;
      const lim = RB.limparSupabase(cat.rastreamento.supabaseUrl, cat.rastreamento.supabaseChave);
      if (lim.url !== cat.rastreamento.supabaseUrl || lim.chave !== cat.rastreamento.supabaseChave) {
        cat.rastreamento.supabaseUrl = lim.url;
        cat.rastreamento.supabaseChave = lim.chave;
        campo.value = campo.dataset.bind.endsWith('Url') ? lim.url : lim.chave;
        salvar();
        toast('Ajustei o que foi colado: deixei só o endereço/chave.');
      }
    });
    $$('[data-per]', el).forEach((b) => b.addEventListener('click', () => { periodo = b.dataset.per; renderCliques(); }));
    $('#painel-ok').addEventListener('click', () => {
      try { localStorage.setItem(PAINEL_KEY, $('#painel-chave').value.trim()); } catch (e) { /* ignora */ }
      renderCliques();
    });
    if (pronto && chave) carregarPainel(rs, chave);
  }

  async function carregarPainel(rs, chave) {
    const dash = $('#dash');
    let desde = null;
    if (periodo !== '0') {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (Number(periodo) - 1));
      desde = d.toISOString();
    }
    let dados;
    try {
      const res = await fetch(rs.supabaseUrl.replace(/\/+$/, '') + '/rest/v1/rpc/painel_resumo', {
        method: 'POST',
        headers: RB.cabecalhosSupabase(rs.supabaseChave),
        body: JSON.stringify({ chave, desde })
      });
      if (!res.ok) {
        const t = await res.json().catch(() => ({}));
        throw new Error(/chave/i.test(t.message || '') ? 'Chave do painel incorreta.' : (t.message || 'Erro ' + res.status));
      }
      dados = await res.json();
    } catch (e) {
      dash.innerHTML = '<div class="a-card err-card">Não foi possível carregar: ' + esc(e.message) + '</div>';
      $('[data-panel="cliques"] details').open = true;
      return;
    }
    const t = dados.totais || {};
    const nomes = {};
    cat.produtos.forEach((p) => (nomes[p.id] = RB.nomeProduto(p) + ' · ' + p.cor));
    const prods = (dados.produtos || []).map((x) => Object.assign({}, x, { nome: nomes[x.produto_id] || x.produto_nome || x.produto_id }));
    const max = Math.max(1, ...prods.map((x) => Math.max(x.cliques, x.whatsapp)));
    const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
    const tile = (rotulo, valor, sub) => '<div class="kpi"><span>' + rotulo + '</span><strong>' + valor + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    const bar = (v, cls) => '<div class="bar-cell" title="' + v + '"><div class="track"><div class="bar ' + cls + '" style="width:' + Math.max(v ? 3 : 0, (v / max) * 100) + '%"></div></div><span>' + v + '</span></div>';

    dash.innerHTML =
      '<div class="kpis">' +
        tile('Visitas', t.visitas || 0, 'pessoas que entraram no site') +
        tile('Cliques em iPhones', t.cliques || 0, 'aparelhos abertos') +
        tile('Propostas no WhatsApp', t.propostas || 0, pct(t.propostas || 0, t.cliques || 0) + ' dos cliques') +
        tile('Outros cliques no WhatsApp', t.whatsapp_geral || 0, 'botões gerais e consultoria') +
        tile('Cliques no pop-up', t.popup || 0, '') +
      '</div>' +
      '<div class="a-card"><h3>Por aparelho</h3>' +
        (prods.length
          ? '<div class="rank"><div class="rank-row rank-head"><span>iPhone</span><span>Cliques</span><span>Propostas WhatsApp</span><span>Conversão</span></div>' +
            prods.map((x) => '<div class="rank-row"><span class="rank-name">' + esc(x.nome) + '</span>' +
              bar(x.cliques, 'bar-c') + bar(x.whatsapp, 'bar-w') + '<span class="rank-pct">' + pct(x.whatsapp, x.cliques) + '</span></div>').join('') +
            '</div>'
          : '<p class="hint">Ainda não há cliques neste período.</p>') +
      '</div>' +
      (dados.ultimas && dados.ultimas.length
        ? '<div class="a-card"><h3>Últimas propostas enviadas</h3><div class="ult">' + dados.ultimas.map((u) =>
            '<div><b>' + esc(nomes[u.produto_id] || u.produto_nome || '') + '</b><span>' + esc(u.detalhe || '') + '</span><small>' +
            new Date(u.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + '</small></div>').join('') + '</div></div>'
        : '');
  }

  /* ---------- Publicar ---------- */
  function lerGH() {
    try { return JSON.parse(localStorage.getItem(GH_KEY)) || {}; } catch (e) { return {}; }
  }

  // Normaliza e confere a conexão antes de usar; devolve { cfg, erro }
  function validarGH(c) {
    const cfg = {
      repo: String(c.repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, ''),
      branch: String(c.branch || '').trim(),
      token: String(c.token || '').replace(/\s+/g, '')
    };
    // token colado no campo Branch: move para o lugar certo
    if (/^(github_pat_|ghp_)/.test(cfg.branch.replace(/\s+/g, '')) && !/^(github_pat_|ghp_)/.test(cfg.token)) {
      cfg.token = cfg.branch.replace(/\s+/g, '');
      cfg.branch = '';
    }
    if (!/^[\w.-]+\/[\w.-]+$/.test(cfg.repo)) return { cfg, erro: 'Repositório deve ficar como dono/nome, ex.: rbtechcelulares-lang/RB-TECH-CELULARES.' };
    if (/[:\s]|supabase|^https?/i.test(cfg.branch)) return { cfg, erro: 'O campo Branch deve ficar vazio (parece que foi colado outro texto nele).' };
    if (!cfg.token) return { cfg, erro: 'Cole o token do GitHub.' };
    if (/^(sb_|eyJ)/.test(cfg.token)) return { cfg, erro: 'Esse token é uma chave do Supabase. Aqui vai o token do GitHub (começa com github_pat_).' };
    if (!/^(github_pat_|ghp_)/.test(cfg.token)) return { cfg, erro: 'O token do GitHub começa com github_pat_. Apague o campo Token (o navegador pode ter colocado sua senha nele) e cole o token.' };
    return { cfg, erro: '' };
  }

  function renderPublicar() {
    const el = $('[data-panel="publicar"]');
    const gh = Object.assign({ repo: 'rbtechcelulares-lang/RB-TECH-CELULARES', branch: '', token: '' }, lerGH());
    if (/^(github_pat_|ghp_)/.test(gh.branch || '') && !/^(github_pat_|ghp_)/.test(gh.token || '')) { gh.token = gh.branch; gh.branch = ''; }
    if (/[:\s]|supabase|^(github_pat_|ghp_)/i.test(gh.branch || '')) gh.branch = ''; // corrige texto colado no lugar errado
    if (gh.token && !/^(github_pat_|ghp_)/.test(gh.token)) gh.token = ''; // senha preenchida pelo navegador
    el.innerHTML =
      '<div class="a-head"><div><h2>Publicar alterações</h2>' +
      '<p class="muted">Publicar grava o catálogo e as fotos no GitHub. A Vercel atualiza o site em cerca de 1 minuto.</p></div></div>' +
      '<div class="a-card pub">' +
        '<p class="pub-status">' + (temAlteracoes() ? '🟡 Há alterações não publicadas.' : '🟢 Tudo publicado.') + '</p>' +
        '<div class="pub-act"><a class="btn btn-outline" href="index.html?preview=1" target="_blank">Pré-visualizar</a>' +
        '<button class="btn btn-gold" id="pub">Publicar no site</button></div>' +
        '<div id="pub-log" class="pub-log" hidden></div>' +
      '</div>' +
      '<div class="a-card"><h3>Conexão com o GitHub</h3>' +
        '<p class="hint">Feito uma vez em cada computador ou celular. O token fica salvo só neste navegador.</p>' +
        '<ol class="steps-cfg">' +
          '<li>Abra <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com › criar token (fine-grained)</a>, logado na conta dona do repositório.</li>' +
          '<li><b>Token name</b>: "Admin site"; <b>Expiration</b>: o maior prazo disponível (ou "No expiration").</li>' +
          '<li><b>Repository access</b>: <i>Only select repositories</i> › <b>RB-TECH-CELULARES</b>.</li>' +
          '<li><b>Permissions › Repository permissions › Contents</b>: <b>Read and write</b>.</li>' +
          '<li>Clique em <b>Generate token</b>, copie o código que começa com <code>github_pat_</code> e cole abaixo.</li>' +
        '</ol>' +
        '<div class="ed-grid">' +
          '<label class="field"><span>Repositório</span><input id="gh-repo" value="' + esc(gh.repo) + '"></label>' +
          '<label class="field"><span>Branch (opcional)</span><input id="gh-branch" value="' + esc(gh.branch) + '" placeholder="em branco = branch principal do repositório"></label>' +
        '</div>' +
        '<label class="field"><span>Token do GitHub</span><input id="gh-token" class="mascarado" type="text" name="gh-token-rb" value="' + esc(gh.token) + '" placeholder="cole aqui o github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore></label>' +
        '<div class="pub-act"><button class="btn btn-sm btn-ink" id="gh-test">Testar conexão</button>' +
        '<button class="btn btn-sm btn-outline" id="gh-save">Salvar conexão</button></div>' +
        '<p class="hint" id="gh-res"></p>' +
      '</div>' +
      '<div class="a-card"><h3>Backup</h3><p class="hint">Baixe uma cópia do catálogo ou restaure um backup.</p>' +
        '<div class="pub-act"><button class="btn btn-sm btn-outline" id="exp">Baixar backup (.json)</button>' +
        '<label class="btn btn-sm btn-outline">Restaurar backup<input type="file" accept=".json,application/json" id="imp" hidden></label>' +
        '<button class="btn btn-sm btn-danger" id="desc">Descartar rascunho</button></div>' +
      '</div>';

    const pegarGH = () => ({ repo: $('#gh-repo').value.trim(), branch: $('#gh-branch').value.trim(), token: $('#gh-token').value.trim() });
    $('#gh-save').addEventListener('click', () => {
      const { cfg, erro } = validarGH(pegarGH());
      if (erro) return toast(erro, true);
      localStorage.setItem(GH_KEY, JSON.stringify(cfg));
      $('#gh-branch').value = cfg.branch; $('#gh-token').value = cfg.token;
      toast('Conexão salva neste navegador.');
    });
    $('#gh-test').addEventListener('click', async () => {
      const res = $('#gh-res');
      const { cfg, erro } = validarGH(pegarGH());
      $('#gh-branch').value = cfg.branch; $('#gh-token').value = cfg.token;
      if (erro) { res.innerHTML = '❌ ' + esc(erro); return; }
      res.textContent = 'Testando…';
      try {
        const r = await fetch('https://api.github.com/repos/' + cfg.repo, { headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json' } });
        if (r.status === 401) throw new Error('Token inválido ou expirado. Gere um novo token e cole de novo.');
        if (r.status === 404) throw new Error('O token não tem acesso a ' + cfg.repo + '. Em "Repository access", selecione esse repositório.');
        const d = await r.json();
        if (!d.permissions || !d.permissions.push) throw new Error('O token só lê o repositório. Em Permissions › Contents, escolha "Read and write".');
        localStorage.setItem(GH_KEY, JSON.stringify(cfg));
        $('#gh-repo').value = cfg.repo; $('#gh-branch').value = cfg.branch; $('#gh-token').value = cfg.token;
        res.innerHTML = '✅ Conexão funcionando. Publicando na branch <b>' + esc(cfg.branch || d.default_branch) + '</b>. Já pode publicar.';
      } catch (e) {
        res.innerHTML = '❌ ' + esc(e.message);
      }
    });
    $('#pub').addEventListener('click', () => publicar(pegarGH()));
    $('#exp').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(cat, null, 2)], { type: 'application/json' }));
      a.download = 'catalogo-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
    });
    $('#imp').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const d = JSON.parse(await file.text());
        if (!d.produtos || !d.avaliacao || !d.pagamento || !d.loja) throw new Error('formato');
        cat = d; salvar(); toast('Backup restaurado no rascunho.'); renderPublicar();
      } catch (err) { toast('Arquivo inválido.', true); }
    });
    $('#desc').addEventListener('click', () => {
      if (!confirm('Descartar todas as alterações não publicadas e voltar ao que está no ar?')) return;
      localStorage.removeItem(RB.DRAFT_KEY);
      localStorage.removeItem(PUB_KEY);
      cat = clone(publicado);
      atualizarBarra(); renderPublicar(); toast('Rascunho descartado.');
    });
  }

  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function gh(cfg, path, metodo, corpo) {
    const res = await fetch('https://api.github.com/repos/' + cfg.repo + '/contents/' + path + (metodo === 'GET' && cfg.branch ? '?ref=' + encodeURIComponent(cfg.branch) : ''), {
      method: metodo,
      headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    if (metodo === 'GET' && res.status === 404) return null;
    if (!res.ok) {
      const t = await res.json().catch(() => ({}));
      throw new Error((res.status === 401 ? 'Token inválido ou expirado. ' : res.status === 403 || res.status === 404 ? 'Sem permissão no repositório. ' : '') + (t.message || res.status));
    }
    return res.json();
  }

  async function publicar(cfg0) {
    const { cfg, erro } = validarGH(cfg0);
    if (erro) { toast(erro, true); const r = $('#gh-res'); if (r) r.innerHTML = '❌ ' + esc(erro); return; }
    localStorage.setItem(GH_KEY, JSON.stringify(cfg));
    const log = $('#pub-log');
    const btn = $('#pub');
    log.hidden = false; log.innerHTML = '';
    const linha = (t) => { log.innerHTML += '<div>' + esc(t) + '</div>'; };
    btn.classList.add('disabled');
    try {
      // 1) envia fotos novas (ainda em data URL)
      const pendentes = [];
      cat.produtos.forEach((p) => (p.fotos || []).forEach((f, i) => { if (String(f).startsWith('data:')) pendentes.push({ p, i }); }));
      for (let k = 0; k < pendentes.length; k++) {
        const { p, i } = pendentes[k];
        const data = p.fotos[i];
        const ext = data.startsWith('data:image/webp') ? 'webp' : 'jpg';
        const caminho = 'img/produtos/' + p.id + '-' + Date.now().toString(36) + k + '.' + ext;
        linha('Enviando foto ' + (k + 1) + ' de ' + pendentes.length + '…');
        await gh(cfg, caminho, 'PUT', { message: 'Foto: ' + RB.nomeProduto(p), content: data.split(',')[1], branch: cfg.branch || undefined });
        p.fotos[i] = caminho;
        salvar();
      }
      if (cat.popup && String(cat.popup.imagem || '').startsWith('data:')) {
        const data = cat.popup.imagem;
        const caminho = 'img/promo/popup-' + Date.now().toString(36) + '.' + (data.startsWith('data:image/webp') ? 'webp' : 'jpg');
        linha('Enviando imagem do pop-up…');
        await gh(cfg, caminho, 'PUT', { message: 'Imagem do pop-up', content: data.split(',')[1], branch: cfg.branch || undefined });
        cat.popup.imagem = caminho;
        salvar();
      }
      // 2) grava o catálogo
      linha('Gravando catálogo…');
      const atual = await gh(cfg, 'data/catalogo.json', 'GET');
      const texto = JSON.stringify(cat, null, 2) + '\n';
      await gh(cfg, 'data/catalogo.json', 'PUT', {
        message: 'Atualiza catálogo pelo painel admin', content: b64(texto), branch: cfg.branch || undefined, sha: atual ? atual.sha : undefined
      });
      localStorage.setItem(PUB_KEY, JSON.stringify(cat));
      publicado = clone(cat);
      linha('✅ Publicado! O site atualiza em cerca de 1 minuto.');
      toast('Publicado com sucesso!');
      atualizarBarra();
      $('.pub-status').textContent = '🟢 Tudo publicado.';
    } catch (e) {
      linha('❌ ' + e.message);
      toast('Falha ao publicar: ' + e.message, true);
    } finally {
      btn.classList.remove('disabled');
    }
  }
})();
