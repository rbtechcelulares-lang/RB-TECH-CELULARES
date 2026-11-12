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

  // Desconto do cupom no aparelho (0 quando o cupom é de brinde ou não vale para o aparelho)
  function descontoCupom(p) {
    const c = cupomSalvo();
    if (!c) return 0;
    const pp = cat.popup || {};
    const regra = pp.cupom && String(pp.cupom).trim().toUpperCase() === String(c.codigo).trim().toUpperCase()
      ? { valor: pp.desconto, tipo: pp.descontoTipo, em: pp.descontoEm } : { valor: c.desconto, tipo: c.tipo, em: c.em };
    const v = Number(regra.valor) || 0;
    if (v <= 0 || ((regra.em || 'iphone') === 'iphone' && !RB.ehIphone(p))) return 0;
    const d = regra.tipo === 'pct' ? Math.round(p.preco * Math.min(v, 90)) / 100 : v;
    return Math.min(Math.round(d * 100) / 100, p.preco);
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
    if ($('#ajuda-btn') && !(cat.chat || {}).ativo) $('#ajuda-btn').addEventListener('click', () => RB.registrar(cat, 'whatsapp', { origem: 'consultoria' }));
    registrarVisita();
    rota();
    boasVindas();
    agendarPopup();
    blackFriday();
    rbChat();
  }

  /* ---------- Boas-vindas: reparo ou ver celulares ---------- */
  function boasVindas() {
    const r = cat.reparos || {};
    if (r.ativo === false || !r.boasVindas || preview || location.hash.startsWith('#p/')) return;
    const chave = 'rbtech_bv';
    try {
      if (r.frequencia === 'dia' && localStorage.getItem(chave) === new Date().toDateString()) return;
      if (r.frequencia !== 'dia' && sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, '1'); localStorage.setItem(chave, new Date().toDateString());
    } catch (e) { /* sem storage: mostra */ }
    const el = document.createElement('div');
    el.className = 'rbp bv'; el.id = 'rb-bv';
    el.innerHTML = '<div class="rbp-back" data-x></div>' +
      '<div class="rbp-box bv-box" role="dialog" aria-modal="true" aria-label="Boas-vindas">' +
        '<button type="button" class="rbp-close" data-x aria-label="Fechar">×</button>' +
        '<div class="bv-logo"><img src="img/marca/logo-marca.webp" alt="' + esc(cat.loja.nome || 'RB Tech Celulares') + '"></div>' +
        '<div class="rbp-body">' +
          '<h2>' + RB.formatar(cat, r.titulo || 'Bem-vindo à *RB Tech Celulares*!') + '</h2>' +
          (r.texto ? '<p class="rbp-txt">' + RB.formatar(cat, r.texto) + '</p>' : '') +
          '<div class="bv-btns">' +
            '<button type="button" class="bv-op bv-rep" data-rep>' + esc(r.botaoReparo || '🔧 Preciso de reparo') + '<small>Conte o defeito e fale com um especialista</small></button>' +
            '<button type="button" class="bv-op bv-vit" data-vit>' + esc(r.botaoVitrine || '📱 Quero ver celulares disponíveis') + '<small>iPhones novos e seminovos com garantia</small></button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    document.body.classList.add('no-scroll');
    const fechar = () => { el.remove(); document.body.classList.remove('no-scroll'); };
    $$('[data-x]', el).forEach((b) => b.addEventListener('click', fechar));
    $('[data-rep]', el).addEventListener('click', () => {
      RB.registrar(cat, 'popup', { origem: 'reparo', detalhe: 'boas-vindas' });
      el.classList.add('bv-form');
      formReparo($('.rbp-body', el), fechar);
    });
    $('[data-vit]', el).addEventListener('click', () => {
      RB.registrar(cat, 'popup', { origem: 'vitrine', detalhe: 'boas-vindas' });
      fechar();
      const v = document.getElementById('vitrine');
      if (v) v.scrollIntoView({ behavior: 'smooth' });
    });
    document.addEventListener('keydown', function esc1(e) { if (e.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc1); } });
  }

  /* ---------- Reparo: o cliente conta o defeito e escolhe falar com especialista ou pedir orçamento ---------- */
  function abrirReparo(origem) {
    if (document.getElementById('rb-bv')) document.getElementById('rb-bv').remove();
    RB.registrar(cat, 'popup', { origem: 'reparo', detalhe: origem || 'site' });
    const el = document.createElement('div');
    el.className = 'rbp bv bv-form'; el.id = 'rb-bv';
    el.innerHTML = '<div class="rbp-back" data-x></div>' +
      '<div class="rbp-box bv-box" role="dialog" aria-modal="true" aria-label="Reparo">' +
        '<button type="button" class="rbp-close" data-x aria-label="Fechar">×</button>' +
        '<div class="bv-logo"><img src="img/marca/logo-marca.webp" alt="' + esc(cat.loja.nome || 'RB Tech Celulares') + '"></div>' +
        '<div class="rbp-body"></div>' +
      '</div>';
    document.body.appendChild(el);
    document.body.classList.add('no-scroll');
    const fechar = () => { el.remove(); document.body.classList.remove('no-scroll'); };
    $$('[data-x]', el).forEach((b) => b.addEventListener('click', fechar));
    formReparo($('.rbp-body', el), fechar);
  }

  function formReparo(box, fechar) {
    const r = cat.reparos || {};
    const temLink = /^https:\/\//.test(r.link || '');
    const MARCAS = ['Samsung', 'Motorola', 'Xiaomi', 'Realme', 'LG', 'Asus', 'Outra'];
    const DEFEITOS = ['Tela quebrada', 'Bateria', 'Não liga', 'Não carrega', 'Câmera', 'Som ou microfone', 'Face ID / biometria', 'Molhou', 'Outro'];
    // nome e WhatsApp: vêm do chat/proposta quando o cliente já passou; senão ficam em branco
    let ct = {};
    try { ct = (JSON.parse(localStorage.getItem('rbtech_chat_v2') || '{}') || {}).contato || {}; } catch (e) { ct = {}; }
    const foneFmt = (v) => {
      const d = String(v || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
      if (d.length <= 2) return d;
      if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length - 4) + '-' + d.slice(-4);
    };
    const f = { tipo: '', marca: '', outraMarca: '', modelo: '', defeitos: [], relato: '', nome: ct.nome || '', fone: foneFmt(ct.whatsapp) };
    box.innerHTML =
      '<h2 class="rep-h">Conte o que aconteceu 🔧</h2>' +
      '<p class="rbp-txt">Leva menos de 1 minuto. Um especialista já recebe tudo certinho.</p>' +
      '<div class="rep-form">' +
        '<span class="rep-lbl">Seu aparelho é</span>' +
        '<div class="rep-tipo"><button type="button" data-tipo="Apple">🍎 Apple (iPhone)</button><button type="button" data-tipo="Android">🤖 Android</button></div>' +
        '<label class="rep-marca" hidden><span class="rep-lbl">Marca</span><select id="rep-marca"><option value="">Selecione…</option>' +
          MARCAS.map((m) => '<option>' + m + '</option>').join('') + '</select></label>' +
        '<label class="rep-outra" hidden><span class="rep-lbl">Qual marca?</span><input id="rep-outra" maxlength="30" placeholder="Ex.: Nokia"></label>' +
        '<label><span class="rep-lbl">Modelo</span><input id="rep-modelo" maxlength="40" placeholder="Ex.: iPhone 13 Pro ou Galaxy A54"></label>' +
        '<span class="rep-lbl">Qual o defeito?</span>' +
        '<div class="rep-defs">' + DEFEITOS.map((d) => '<button type="button" data-def="' + esc(d) + '">' + esc(d) + '</button>').join('') + '</div>' +
        '<label><span class="rep-lbl">Conte com suas palavras</span><textarea id="rep-relato" rows="3" maxlength="500" placeholder="Ex.: caiu no chão, a tela trincou e o touch não funciona embaixo."></textarea></label>' +
        '<label><span class="rep-lbl">Seu nome completo</span><input id="rep-nome" maxlength="80" autocomplete="name" autocapitalize="words" placeholder="Ex.: Maria da Silva" value="' + esc(f.nome) + '"></label>' +
        '<label><span class="rep-lbl">Seu WhatsApp</span><input id="rep-fone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(48) 99999-8888" value="' + esc(f.fone) + '"></label>' +
        '<p class="rep-err" hidden>Preencha: Apple ou Android, modelo, defeito, seu nome completo e seu WhatsApp com DDD.</p>' +
        '<button type="button" class="bv-op rep-zap">💬 Conversar com um especialista<small>Abre o WhatsApp com tudo preenchido</small></button>' +
        (temLink ? '<button type="button" class="bv-op bv-rep rep-orc">📋 Solicitar orçamento<small>Gera sua ordem de serviço no nosso sistema</small></button>' : '') +
        '<p class="rep-dica" hidden>✅ Copiamos a descrição do seu defeito: é só colar no formulário do orçamento.</p>' +
      '</div>';
    const marcaFinal = () => f.tipo === 'Apple' ? 'Apple' : f.marca === 'Outra' ? f.outraMarca.trim() : f.marca;
    const resumo = () => {
      const l = ['📱 Aparelho: ' + [marcaFinal(), f.modelo.trim()].filter(Boolean).join(' · ') + (f.tipo ? ' (' + f.tipo + ')' : '')];
      if (f.defeitos.length) l.push('⚠️ Defeito: ' + f.defeitos.join(', '));
      if (f.relato.trim()) l.push('📝 Relato: ' + f.relato.trim());
      return l.join('\n');
    };
    const digitos = () => f.fone.replace(/\D/g, '');
    const valido = () => f.tipo && f.modelo.trim() && (f.defeitos.length || f.relato.trim()) && (f.tipo === 'Apple' || marcaFinal()) &&
      nomeValido(f.nome) && /^\d{10,11}$/.test(digitos());
    // salva o cliente na lista do admin (interesse: o reparo) e avisa o chat para não pedir de novo
    const salvarContato = () => {
      const nome = f.nome.trim().replace(/\s+/g, ' ');
      const zap = '55' + digitos();
      RB.salvarCliente(cat, { origem: 'reparo', nome, whatsapp: zap, interesse: ('🔧 Reparo: ' + [marcaFinal(), f.modelo.trim()].filter(Boolean).join(' ') + (f.defeitos.length ? ' · ' + f.defeitos.join(', ') : '')).slice(0, 300) });
      window.dispatchEvent(new CustomEvent('rbtech:contato', { detail: { nome, whatsapp: zap } }));
      try { // se o chat não estiver aberto nesta página, grava direto
        const est = JSON.parse(localStorage.getItem('rbtech_chat_v2') || '{}') || {};
        est.contato = Object.assign({}, est.contato, { nome, whatsapp: zap });
        localStorage.setItem('rbtech_chat_v2', JSON.stringify(est));
      } catch (e) { /* ignora */ }
      return { nome, zap };
    };
    $$('[data-tipo]', box).forEach((b) => b.addEventListener('click', () => {
      f.tipo = b.dataset.tipo;
      $$('[data-tipo]', box).forEach((x) => x.classList.toggle('on', x === b));
      $('.rep-marca', box).hidden = f.tipo !== 'Android';
      $('.rep-outra', box).hidden = !(f.tipo === 'Android' && f.marca === 'Outra');
      $('#rep-modelo', box).placeholder = f.tipo === 'Apple' ? 'Ex.: iPhone 13 Pro' : 'Ex.: Galaxy A54, Moto G84';
    }));
    $('#rep-marca', box).addEventListener('change', (e) => { f.marca = e.target.value; $('.rep-outra', box).hidden = f.marca !== 'Outra'; });
    $('#rep-outra', box).addEventListener('input', (e) => { f.outraMarca = e.target.value; });
    $('#rep-modelo', box).addEventListener('input', (e) => { f.modelo = e.target.value; });
    $('#rep-relato', box).addEventListener('input', (e) => { f.relato = e.target.value; });
    $('#rep-nome', box).addEventListener('input', (e) => { f.nome = e.target.value; });
    $('#rep-fone', box).addEventListener('input', (e) => { e.target.value = foneFmt(e.target.value); f.fone = e.target.value; });
    const mostrarErro = () => {
      $('.rep-err', box).hidden = false;
      const alvo = !f.tipo ? $('[data-tipo]', box) : !f.modelo.trim() ? $('#rep-modelo', box) : !(f.defeitos.length || f.relato.trim()) ? $('#rep-relato', box)
        : !nomeValido(f.nome) ? $('#rep-nome', box) : $('#rep-fone', box);
      if (alvo) { alvo.focus(); alvo.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    };
    $$('[data-def]', box).forEach((b) => b.addEventListener('click', () => {
      const d = b.dataset.def;
      f.defeitos = f.defeitos.includes(d) ? f.defeitos.filter((x) => x !== d) : f.defeitos.concat(d);
      b.classList.toggle('on', f.defeitos.includes(d));
    }));
    ['input', 'change', 'click'].forEach((ev) => box.addEventListener(ev, () => { if (valido()) $('.rep-err', box).hidden = true; }));
    $('.rep-zap', box).addEventListener('click', () => {
      if (!valido()) { mostrarErro(); return; }
      const c = salvarContato();
      const msg = 'Olá! Sou *' + c.nome + '*, vim pelo site e preciso de um reparo 🔧\n\n' + resumo() + '\n\nPode me ajudar?';
      RB.registrar(cat, 'whatsapp', { origem: 'reparo', detalhe: (marcaFinal() + ' ' + f.modelo + ' · ' + f.defeitos.join(', ')).slice(0, 190) });
      const url = RB.linkWhats(cat, msg);
      const w = window.open(url, '_blank');
      if (w) w.opener = null; else location.href = url;
      fechar();
    });
    const orc = $('.rep-orc', box);
    if (orc) orc.addEventListener('click', () => {
      if (!valido()) { mostrarErro(); return; }
      const c = salvarContato();
      RB.registrar(cat, 'popup', { origem: 'reparo-orcamento', detalhe: (marcaFinal() + ' ' + f.modelo).trim().slice(0, 190) || 'sem dados' });
      const texto = resumo();
      if ((f.modelo.trim() || f.defeitos.length || f.relato.trim()) && navigator.clipboard) navigator.clipboard.writeText(texto).then(() => { $('.rep-dica', box).hidden = false; }).catch(() => {});
      // leva o que o cliente já contou no link (o sistema de OS pode usar para pré-preencher o pedido)
      let link = r.link;
      try {
        const u = new URL(r.link);
        const dados = { nome: c.nome, whatsapp: c.zap, tipo: f.tipo, marca: marcaFinal(), modelo: f.modelo.trim(), defeito: f.defeitos.join(', '), relato: f.relato.trim(), origem: 'site' };
        Object.keys(dados).forEach((k) => { if (dados[k]) u.searchParams.set(k, String(dados[k]).slice(0, 300)); });
        link = u.toString();
      } catch (e) { /* link inválido: abre como está */ }
      const w = window.open(link, '_blank');
      if (w) w.opener = null; else location.href = link;
      fechar();
    });
  }

  /* ---------- RBChat: assistente virtual (Claude Haiku via api/chat) ---------- */
  function rbChat() {
    const ch = cat.chat || {};
    if (!ch.ativo) return;
    const nomeChat = ch.nome || 'RBChat';
    // A conversa fica salva no celular do cliente. Depois de 5 minutos parada, começa uma nova,
    // mas o iPhone de entrada que ele informou continua guardado para a próxima conversa.
    const CHAVE = 'rbtech_chat_v2';
    const INATIVO = 5 * 60 * 1000;
    let est = {};
    try { est = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch (e) { est = {}; }
    let msgs = Array.isArray(est.msgs) ? est.msgs : [];
    let entradaMem = est.entrada || null; // { modelo, armazenamento, bateria_abaixo_de_80, defeitos }
    let anterior = !!est.anterior; // true quando a entrada veio de uma conversa anterior
    let contato = est.contato || null; // { nome, whatsapp } que o cliente passou no chat (não zera)
    let interesse = est.interesse || ''; // último aparelho que a IA mandou para ele
    const guardar = () => {
      est.ultimo = Date.now();
      try { localStorage.setItem(CHAVE, JSON.stringify({ msgs: msgs.slice(-30), entrada: entradaMem, anterior, contato, interesse, ultimo: est.ultimo })); } catch (e) { /* ignora */ }
    };
    const zerarSeParado = () => {
      if (msgs.length && Date.now() - (Number(est.ultimo) || 0) > INATIVO) {
        msgs = [];
        if (entradaMem) anterior = true;
        guardar();
      }
    };
    zerarSeParado();
    const fmt = (t) => esc(t).replace(/\*\*?([^*\n]+)\*\*?/g, '<b>$1</b>').replace(/\n/g, '<br>');

    const botao = document.createElement('button');
    botao.className = 'rbc-btn'; botao.type = 'button';
    botao.innerHTML = '<span class="rbc-ic">💬</span><span>Fale com <b>' + esc(nomeChat) + '</b></span>';
    const painel = document.createElement('section');
    painel.className = 'rbc'; painel.hidden = true; painel.setAttribute('aria-label', nomeChat);
    painel.innerHTML =
      '<header class="rbc-top"><span class="rbc-av">RB</span><div><b>' + esc(nomeChat) + '</b><small>online · responde na hora</small></div>' +
        '<button type="button" class="rbc-x" aria-label="Fechar">×</button></header>' +
      '<div class="rbc-msgs" aria-live="polite"></div>' +
      '<div class="rbc-sug"></div>' +
      '<form class="rbc-form"><input maxlength="500" placeholder="Pergunte sobre preço, parcelas, troca…" aria-label="Sua mensagem">' +
        '<button type="submit" aria-label="Enviar">➤</button></form>' +
      '<a class="rbc-zap" target="_blank" rel="noopener">Prefere falar com uma pessoa? Chamar no WhatsApp</a>';
    document.body.append(botao, painel);
    $('.rbc-zap', painel).href = RB.linkWhats(cat, 'Olá! Vim pelo chat do site.');
    const lista = $('.rbc-msgs', painel), campo = $('.rbc-form input', painel), sug = $('.rbc-sug', painel);

    const desenhar = () => {
      const saud = entradaMem && anterior
        ? 'Oi de novo! 👋 Da última vez você falou do seu *' + entradaMem.modelo + ' ' + (entradaMem.armazenamento || '') + '* para dar de entrada. Ainda tem interesse em dar ele de entrada?'
        : ch.saudacao || 'Oi! 👋 Sou o ' + nomeChat + '. Posso te ajudar com preços, parcelas, avaliação do seu usado e garantia.';
      lista.innerHTML = '<div class="rbc-m ass">' + fmt(saud) + '</div>' +
        msgs.map((m, i) => '<div class="rbc-m ' + (m.role === 'user' ? 'eu' : 'ass') + '">' + fmt(m.content) +
          (m.produtos && m.produtos.length ? '<span class="rbc-ver">' + m.produtos.map((x) => '<a class="rbc-prod" href="#p/' + encodeURIComponent(x.id) + '" data-id="' + esc(x.id) + '" data-m="' + i + '" data-origem="chat">📱 Ver proposta: ' + esc(x.nome) + (x.cor && !/variad/i.test(x.cor) ? ' · ' + esc(x.cor) : '') + ' →</a>').join('') + '</span>' : '') +
          (m.mapa ? '<a class="rbc-mapa" target="_blank" rel="noopener" href="' + esc(m.mapa) + '">🗺️ Ver no mapa</a>' : '') +
          (m.reparoPedido ? botoesPedido(m.reparoPedido) : '') +
          (m.reparo ? '<a class="rbc-rep" target="_blank" rel="noopener" href="' + esc(m.reparo) + '">🔧 Contar o defeito / pedir orçamento</a>' : '') +
          (m.whatsapp ? '<a class="rbc-wa" target="_blank" rel="noopener" href="' + esc(RB.linkWhats(cat, m.whatsapp)) + '">💬 Falar no WhatsApp da loja</a>' : '') + '</div>').join('');
      const ult = msgs[msgs.length - 1];
      const opcoes = !msgs.length ? ['Me ajude a escolher', '📍 Endereço e horário', '💳 Formas de pagamento', '💬 Falar no WhatsApp', 'Quanto vale meu iPhone 12?']
        : ult && ult.sugestoes ? ult.sugestoes : [];
      const orcamento = opcoes.some((t) => /^(Até|Mais de) R\$/.test(t));
      sug.innerHTML = opcoes
        .map((t) => '<button type="button">' + esc(t) + '</button>').join('') +
        // faixas de preço: o cliente também pode digitar quanto tem em mãos
        (orcamento ? '<form class="rbc-orc"><span>Ou digite quanto você tem:</span><label>R$<input inputmode="numeric" placeholder="Ex.: 2.100" aria-label="Quanto você quer investir" maxlength="9"></label><button type="submit">OK</button></form>' : '');
      $$('.rbc-sug > button', painel).forEach((b) => b.addEventListener('click', () => enviar(b.textContent)));
      const orc = $('.rbc-orc', sug);
      if (orc) {
        const inp = $('input', orc);
        inp.addEventListener('input', () => {
          const n = inp.value.replace(/\D/g, '').slice(0, 7);
          inp.value = n ? Number(n).toLocaleString('pt-BR') : '';
        });
        orc.addEventListener('submit', (e) => {
          e.preventDefault();
          const n = Number(inp.value.replace(/\D/g, ''));
          if (!n) { inp.focus(); return; }
          enviar('Tenho até R$ ' + n.toLocaleString('pt-BR') + ' para investir');
        });
      }
      lista.scrollTop = lista.scrollHeight;
    };

    // "Me ajude a escolher": a IA entra perguntando o que o cliente mais procura.
    // Se ele demorar para responder, oferece o WhatsApp da loja com a mesma pergunta.
    const ESPERA = 60 * 1000;
    const FAIXAS = ['Até R$ 1.000', 'Até R$ 1.800', 'Até R$ 2.500', 'Até R$ 3.000', 'Mais de R$ 3.000'];
    let relogio = null, escolhendo = false;
    const pedeAjuda = (t) => /ajud\w*\s+(a\s+)?escolher/i.test(t);
    const esperarResposta = () => {
      clearTimeout(relogio);
      if (!escolhendo) return;
      relogio = setTimeout(() => {
        if (!escolhendo || ocupado) return;
        escolhendo = false;
        msgs.push({ role: 'assistant', content: 'Se preferir, a equipe da loja te ajuda a escolher direto no WhatsApp 👇', whatsapp: 'Olá! Me ajuda a escolher um celular?' });
        guardar(); desenhar();
      }, ESPERA);
    };
    function escolher() {
      zerarSeParado();
      msgs.push({ role: 'user', content: 'Me ajude a escolher' });
      msgs.push({
        role: 'assistant',
        content: 'Bora achar o celular ideal pra você! 😊 O que você *mais* procura num celular?\n\n📸 Câmera · ⚡ Desempenho/jogos · 🔋 Bateria · 📱 Tela grande · 💰 Custo-benefício\n\nE prefere *iPhone* ou *Android*?',
        sugestoes: ['📸 Câmera', '⚡ Desempenho e jogos', '🔋 Bateria que dura', '💰 Custo-benefício', '🤖 Prefiro Android']
      });
      escolhendo = true;
      guardar(); desenhar(); esperarResposta();
      RB.registrar(cat, 'popup', { origem: 'chat', detalhe: 'Me ajude a escolher' });
    }

    // Pedido de reparo montado pela IA: link do sistema de OS já preenchido + WhatsApp com especialista
    function linkPedido(rp) {
      const r = cat.reparos || {};
      if (!/^https:\/\//.test(r.link || '')) return '';
      try {
        const u = new URL(r.link);
        const d = { nome: contato && contato.nome, whatsapp: contato && contato.whatsapp, tipo: rp.tipo, marca: rp.marca, modelo: rp.modelo, defeito: rp.defeito, relato: rp.relato, origem: 'site' };
        Object.keys(d).forEach((k) => { if (d[k]) u.searchParams.set(k, String(d[k]).slice(0, 500)); });
        return u.toString();
      } catch (e) { return ''; }
    }
    function botoesPedido(rp) {
      const aparelho = [rp.marca !== 'Apple' ? rp.marca : '', rp.modelo].filter(Boolean).join(' ');
      const link = linkPedido(rp);
      const zapMsg = 'Olá!' + (contato && contato.nome ? ' Sou *' + contato.nome + '*.' : '') + ' Vim pelo chat do site e preciso de um reparo 🔧\n\n📱 Aparelho: ' + aparelho +
        '\n⚠️ Defeito: ' + rp.defeito + (rp.relato ? '\n📝 Relato: ' + rp.relato : '');
      return '<span class="rbc-ver">' +
        (link ? '<a class="rbc-os" target="_blank" rel="noopener" href="' + esc(link) + '" title="' + esc(aparelho) + '">📋 Pedir orçamento para o time RB<small>Em alguns minutos você recebe seu orçamento no WhatsApp</small></a>' : '') +
        '<a class="rbc-wa" target="_blank" rel="noopener" href="' + esc(RB.linkWhats(cat, zapMsg)) + '">💬 Falar com um especialista</a></span>';
    }

    // Endereço, horário, pagamento e WhatsApp: respostas prontas com os dados do admin (sem IA)
    function respostaFixa(t) {
      const s = t.toLowerCase();
      if (s.length > 70 || /iphone|xiaomi|redmi|poco|macbook|ipad|\d{2}\s*(pro|max|gb)/.test(s)) return null;
      const l = cat.loja || {};
      const pg = cat.pagamento || {};
      if (/endere[cç]o|onde fica|localiza|como cheg|hor[aá]rio|que horas|abre|fecha|funciona/.test(s)) {
        return { texto: (l.endereco ? '📍 *Endereço:* ' + l.endereco + '' : '📍 Atendemos em ' + (l.regiao || 'São José/SC') + '.') +
          (l.horario ? '\n🕒 *Horário:* ' + l.horario : '') + '\n\nQuer agendar uma visita? É só chamar no WhatsApp 👇', whatsapp: 'Olá! Quero agendar uma visita na loja.', mapa: /^https:\/\//.test(l.mapsLink || '') ? l.mapsLink : '' };
      }
      if (/forma(s)? de pagamento|pagamento|aceita(m)? (pix|cart|d[eé]bito)|boleto|credi[aá]rio/.test(s)) {
        return { texto: '💳 *Formas de pagamento:*\n• Pix ou dinheiro à vista\n• Débito\n• Cartão de crédito em até ' + (pg.maxParcelas || 12) + 'x (taxa da maquininha inclusa)\n\nNão trabalhamos com boleto. Quer simular as parcelas de algum aparelho? É só me dizer qual 😉' };
      }
      if (/whats|zap|telefone|n[uú]mero|contato|falar com (algu[eé]m|atendente|vendedor|pessoa)/.test(s)) {
        return { texto: '💬 Nosso WhatsApp é este, é só tocar no botão abaixo que a gente te responde por lá!', whatsapp: 'Olá! Vim pelo site e quero falar com um atendente.' };
      }
      return null;
    }

    let ocupado = false;
    async function enviar(texto) {
      texto = String(texto || '').trim();
      if (!texto || ocupado) return;
      campo.value = '';
      if (pedeAjuda(texto)) return escolher();
      const fixa = respostaFixa(texto);
      if (fixa) { // perguntas simples da loja: respondidas na hora, sem gastar IA
        zerarSeParado();
        msgs.push({ role: 'user', content: texto }, Object.assign({ role: 'assistant', content: fixa.texto }, fixa.whatsapp ? { whatsapp: fixa.whatsapp } : {}, fixa.mapa ? { mapa: fixa.mapa } : {}));
        guardar(); desenhar();
        RB.registrar(cat, 'popup', { origem: 'chat-fixo', detalhe: texto.slice(0, 190) });
        return;
      }
      ocupado = true; clearTimeout(relogio);
      zerarSeParado();
      msgs.push({ role: 'user', content: texto }); guardar(); desenhar();
      lista.insertAdjacentHTML('beforeend', '<div class="rbc-m ass rbc-dig"><i></i><i></i><i></i></div>');
      lista.scrollTop = lista.scrollHeight;
      let resposta, zap = '', dados = {};
      try {
        const r = await fetch('api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagens: msgs.slice(-8), memoria: { entrada: entradaMem, anterior, contato: contato ? { nome: contato.nome, whatsapp: !!contato.whatsapp } : null, cupom: cupomSalvo() ? { codigo: cupomSalvo().codigo } : null } }) });
        const d = await r.json().catch(() => ({}));
        dados = d;
        if (d.entrada && d.entrada.modelo) { entradaMem = d.entrada; anterior = false; }
        if (d.contato && d.contato.nome) contato = Object.assign({}, contato, d.contato, d.contato.whatsapp ? {} : { whatsapp: (contato || {}).whatsapp || '' });
        // lista de clientes do admin: salva nome/WhatsApp e o último aparelho que a IA mandou
        if (Array.isArray(d.produtos) && d.produtos.length) interesse = d.produtos.map((x) => x.nome + (x.cor && !/variad/i.test(x.cor) ? ' ' + x.cor : '')).join(' / ');
        if (contato && contato.whatsapp && (d.contato || (d.produtos && d.produtos.length) || d.entrada)) {
          RB.salvarCliente(cat, { nome: contato.nome, whatsapp: contato.whatsapp, interesse,
            entrada: entradaMem ? entradaMem.modelo + ' ' + (entradaMem.armazenamento || '') + (entradaMem.bateria_abaixo_de_80 ? ' · bateria < 80%' : '') + (entradaMem.defeitos && entradaMem.defeitos.length ? ' · ' + entradaMem.defeitos.join(', ') : '') : '' });
        }
        zap = d.whatsapp || (d.erro ? 'Olá! Vim pelo chat do site e tenho uma dúvida: ' + texto : '');
        resposta = d.resposta || (d.limite ? 'Por hoje o chat chegou ao limite de mensagens 😅 Continue com a gente pelo WhatsApp, é só tocar no botão abaixo!'
          : d.erro ? d.erro + ' Se preferir, chame a gente no WhatsApp.' : 'Não consegui responder agora. Chame a gente no WhatsApp!');
      } catch (e) {
        resposta = 'Sem conexão agora. Tente de novo ou chame a gente no WhatsApp!';
        zap = 'Olá! Vim pelo chat do site e tenho uma dúvida: ' + texto;
      }
      // botões rápidos: os que a IA mandou, ou as faixas de preço quando ela pergunta o orçamento
      let botoes = Array.isArray(dados.sugestoes) ? dados.sugestoes.slice(0, 6).map(String) : null;
      // (só quando a IA pergunta quanto o cliente quer gastar num aparelho; nunca em reparo)
      if (!botoes && !dados.reparo && !dados.reparoPedido && /quanto (você )?(quer|pretende|pode) (investir|gastar)|qual (é )?(o )?seu orçamento|faixa de (preço|valor)/i.test(resposta || '')) botoes = FAIXAS;
      msgs.push(Object.assign({ role: 'assistant', content: resposta }, zap ? { whatsapp: zap } : {}, botoes ? { sugestoes: botoes } : {}, Array.isArray(dados.produtos) && dados.produtos.length ? { produtos: dados.produtos.slice(0, 3), avaliacao: dados.avaliacao || null } : {},
        dados.reparo ? { reparo: String(dados.reparo) } : {},
        dados.reparoPedido && typeof dados.reparoPedido === 'object' ? { reparoPedido: dados.reparoPedido } : {})); guardar();
      if (dados.reparoPedido && contato && contato.whatsapp) { // cliente conhecido: já vai para a lista do admin
        const rp = dados.reparoPedido;
        RB.salvarCliente(cat, { origem: 'reparo', nome: contato.nome, whatsapp: contato.whatsapp, interesse: ('🔧 Reparo: ' + [rp.marca !== 'Apple' ? rp.marca : '', rp.modelo].filter(Boolean).join(' ') + ' · ' + rp.defeito).slice(0, 300) });
      }
      ocupado = false; desenhar();
      if (zap) escolhendo = false; // já ofereceu o WhatsApp nesta resposta
      esperarResposta();
      RB.registrar(cat, 'popup', { origem: 'chat', detalhe: texto.slice(0, 190) });
    }

    const abrir = (sim) => {
      if (sim) zerarSeParado();
      painel.hidden = !sim; botao.hidden = sim;
      document.body.classList.toggle('rbc-aberto', sim);
      if (sim) { desenhar(); setTimeout(() => campo.focus(), 50); }
    };
    botao.addEventListener('click', () => abrir(true));
    window.addEventListener('rbtech:contato', (e) => { contato = Object.assign({}, contato, e.detail); guardar(); });
    // botão "Me ajude a escolher" da página: abre o chat já no modo de escolha
    const ajuda = $('#ajuda-btn');
    if (ajuda) ajuda.addEventListener('click', (e) => {
      e.preventDefault();
      abrir(true); escolher();
    });
    $('.rbc-x', painel).addEventListener('click', () => abrir(false));
    // abrir um aparelho pelo chat: no celular fecha o chat para mostrar o aparelho
    lista.addEventListener('click', (e) => {
      if (e.target.closest('.rbc-os')) RB.registrar(cat, 'popup', { origem: 'reparo-orcamento', detalhe: 'chat' });
      if (e.target.closest('.rbc-rep')) { e.preventDefault(); if (innerWidth < 760) abrir(false); abrirReparo('chat'); return; }
      const a = e.target.closest('.rbc-prod');
      if (!a) return;
      const p = cat.produtos.find((x) => x.id === a.dataset.id);
      if (!p) return; // aparelho saiu do site: segue o link normal
      e.preventDefault();
      const m = msgs[Number(a.dataset.m)] || {};
      if (innerWidth < 760) abrir(false);
      abrirPropostaChat(p, { avaliacao: m.avaliacao || null, nome: (contato && contato.nome) || '', whatsapp: (contato && contato.whatsapp) || '', interesse });
    });
    $('.rbc-form', painel).addEventListener('submit', (e) => { e.preventDefault(); enviar(campo.value); });
  }

  /* ---------- Black Friday: tema, contagem regressiva e avisos de venda ---------- */
  function blackFriday() {
    const bf = cat.blackfriday || {};
    if (!bf.ativo) return;
    const fim = bf.fim ? new Date(bf.fim) : null;
    if (fim && Date.now() > fim.getTime()) return; // campanha acabou: site volta ao normal sozinho
    document.body.classList.add('bf');
    const bar = $('#bf-bar');
    bar.innerHTML = '<div class="wrap bf-in"><span class="bf-tag">BLACK FRIDAY</span>' +
      '<span class="bf-txt">' + RB.formatar(cat, bf.texto || '🔥 Ofertas *esgotando*') + '</span>' +
      (fim ? '<span class="bf-timer" id="bf-timer" aria-live="off"></span>' : '') + '</div>';
    bar.hidden = false;
    // selo no topo da página inicial
    const titulo = $('.hero-title');
    if (titulo && !$('.bf-hero')) titulo.insertAdjacentHTML('beforebegin', '<p class="bf-hero"><span>BLACK</span> FRIDAY</p>');
    if (fim) {
      const t = $('#bf-timer');
      const dois = (n) => String(n).padStart(2, '0');
      const tick = () => {
        let s = Math.max(0, Math.floor((fim.getTime() - Date.now()) / 1000));
        const d = Math.floor(s / 86400); s %= 86400;
        const h = Math.floor(s / 3600); s %= 3600;
        const m = Math.floor(s / 60); s %= 60;
        t.innerHTML = '<small>termina em</small>' + (d ? '<b>' + d + '</b><i>d</i>' : '') +
          '<b>' + dois(h) + '</b><i>h</i><b>' + dois(m) + '</b><i>m</i><b>' + dois(s) + '</b><i>s</i>';
      };
      tick(); setInterval(tick, 1000);
    }
    if (bf.vendas !== false && !preview) avisosDeVenda(bf);
  }

  function avisosDeVenda(bf) {
    const pool = todos().filter((p) => RB.ehIphone(p));
    if (!pool.length) return;
    const cidades = bf.cidades && bf.cidades.length ? bf.cidades : ['São José', 'Florianópolis', 'Palhoça', 'Biguaçu', 'Santo Amaro da Imperatriz'];
    const box = document.createElement('div');
    box.className = 'bf-venda'; box.setAttribute('role', 'status'); box.hidden = true;
    document.body.appendChild(box);
    const intervalo = Math.max(8, Number(bf.intervalo) || 18) * 1000;
    let timer;
    const mostrar = () => {
      if (!$('#sheet').hidden || document.getElementById('rb-popup') || document.getElementById('rb-aviso') || document.getElementById('rb-bv')) { timer = setTimeout(mostrar, 4000); return; }
      const p = pool[Math.floor(Math.random() * pool.length)];
      const min = 2 + Math.floor(Math.random() * 38);
      box.innerHTML = '<span class="bv-img">' + RB.imagemProduto(p, true) + '</span>' +
        '<span class="bv-txt"><b>🔥 Vendeu ' + esc(RB.nomeProduto(p)) + '</b>' +
        '<small>' + esc(cidades[Math.floor(Math.random() * cidades.length)]) + ' · há ' + min + ' min</small></span>' +
        '<button type="button" aria-label="Fechar">×</button>';
      box.onclick = (e) => {
        if (e.target.closest('button')) { box.hidden = true; return; }
        origemClique = 'venda'; location.hash = '#p/' + encodeURIComponent(p.id); box.hidden = true;
      };
      box.hidden = false; box.classList.remove('sai'); void box.offsetWidth; box.classList.add('entra');
      setTimeout(() => { box.classList.add('sai'); setTimeout(() => (box.hidden = true), 400); }, 5500);
      timer = setTimeout(mostrar, intervalo + Math.random() * intervalo * 0.6);
    };
    timer = setTimeout(mostrar, 7000);
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
    const mostrar = () => {
      // não cobre a conversa: espera o cliente fechar o chat
      // (nem a proposta pronta do chat)
      const propostaAberta = !$('#sheet').hidden && $('#sheet-body').classList.contains('pc-modo');
      if (document.body.classList.contains('rbc-aberto') || propostaAberta || document.getElementById('rb-bv')) return setTimeout(mostrar, 3000);
      // a pré-visualização do admin (?popup=1) não conta como "já visto"
      if (!forcar) {
        try {
          sessionStorage.setItem(chave, '1');
          localStorage.setItem(chave, hoje);
        } catch (e) { /* ignora */ }
      }
      RB.abrirPopup(cat, acaoPopup);
    };
    setTimeout(mostrar, Math.max(0, Number(pp.atraso) || 0) * 1000);
  }

  function acaoPopup(pp, fechar) {
    RB.registrar(cat, 'popup', { origem: pp.acao || 'fechar', detalhe: pp.titulo });
    fechar();
    const titulo = String(pp.titulo || '').replace(/\*/g, '');
    if (pp.cupom) {
      try { localStorage.setItem('rbtech_cupom', JSON.stringify({ codigo: pp.cupom, titulo, fim: pp.fim || '', desconto: Number(pp.desconto) || 0, tipo: pp.descontoTipo || 'reais', em: pp.descontoEm || 'iphone' })); } catch (e) { /* ignora */ }
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
          '<span class="btn btn-gold btn-sm card-btn">Simular upgrade</span>' +
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
          '<p class="eyebrow">' + esc(p.condicao) + ' · garantia ' + esc(RB.garantia(p, cat)) + (RB.sobEncomenda(p) ? ' · sob encomenda' : '') + '</p>' +
          '<h2 class="spot-title">' + esc(RB.nomeProduto(p)) + '</h2>' +
          (promo.texto ? '<p class="spot-text">' + esc(promo.texto) + '</p>' : '') +
          '<p class="spot-sub">' + esc(p.cor) + (!RB.ehIphone(p) ? (p.specs ? ' · ' + esc(p.specs) : '') : ' · bateria ' + esc(RB.batTexto(p, cat)) + ' · checklist completo') + '</p>' +
          '<p class="spot-price">' + (off ? '<s>' + money(p.precoAntigo) + '</s> <small>por</small> ' : '') + '<strong>' + money(RB.valorPix(cat, p.preco)) + '</strong></p>' +
          (off ? '<span class="off-badge">−' + off + '% OFF</span>' : '') +
          '<p class="spot-parc">ou ' + ult.n + 'x de ' + money(ult.parcela) + ' no cartão · Pix, débito e crédito</p>' +
          '<div class="spot-cta"><a class="btn btn-gold" data-origem="promocao" href="' + link + '">Simular upgrade</a>' +
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
              '<button type="button" data-det="0" class="' + (entrada.temDetalhe === false ? 'on' : '') + '">Está perfeito</button>' +
              '<button type="button" data-det="1" class="' + (entrada.temDetalhe === true ? 'on' : '') + '">Tem alguns detalhes</button>' +
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

  // Foto, título, preço e checklist/especificações do aparelho (página do aparelho e proposta do RBChat)
  function fichaProduto(p) {
    const fotos = (p.fotos || []).filter(Boolean);
    return (
      '<div class="pd">' +
        '<div class="pd-gallery">' +
          '<div class="pd-main" style="--tint:' + esc(p.corHex || '#ccc') + '">' +
            RB.imagemProduto(p) +
          '</div>' +
          (fotos.length > 1 ? '<div class="pd-thumbs">' + fotos.map((f, i) =>
            '<button class="' + (i === 0 ? 'on' : '') + '" data-i="' + i + '"><img src="' + esc(f) + '" alt="Foto ' + (i + 1) + '"></button>').join('') + '</div>' : '') +
        '</div>' +
        '<div class="pd-info">' +
          '<p class="eyebrow eyebrow-dark">' + esc(p.condicao) + ' · Garantia ' + esc(RB.garantia(p, cat)) + (RB.sobEncomenda(p) ? ' · Sob encomenda' : '') + '</p>' +
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
      '</div>');
  }

  function ligarFotos(body, p) {
    const fotos = (p.fotos || []).filter(Boolean);
    $$('.pd-thumbs button', body).forEach((b) => b.addEventListener('click', () => {
      $('.pd-main', body).innerHTML = '<img src="' + esc(fotos[b.dataset.i]) + '" alt="">';
      $$('.pd-thumbs button', body).forEach((x) => x.classList.toggle('on', x === b));
    }));
  }

  /* ---------- Proposta pronta (aberta pelos botões de aparelho do RBChat) ---------- */
  // info: { avaliacao: { descricao, status, valor } | null, nome }
  function abrirPropostaChat(p, info) {
    RB.registrar(cat, 'clique', { produto: p, origem: 'chat' });
    const s = $('#sheet');
    const body = $('#sheet-body');
    const av = RB.ehIphone(p) && info.avaliacao ? info.avaliacao : null;
    let nomeP = info.nome || '';
    let foneP = info.whatsapp ? String(info.whatsapp).replace(/^55(?=\d{10,11}$)/, '') : '';
    const foneFmt = (v) => {
      const d = String(v).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
      if (d.length <= 2) return d;
      if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, d.length - 4) + '-' + d.slice(-4);
    };
    const foneValido = (v) => /^\d{10,11}$/.test(String(v).replace(/\D/g, ''));
    const cupom = cupomSalvo();
    const descCupom = descontoCupom(p);
    const preco = Math.max(0, p.preco - descCupom);
    const valEntrada = av && av.status === 'ok' ? Number(av.valor) || 0 : 0;
    const valor = Math.max(0, preco - valEntrada);
    const lista = valor > 0 ? RB.parcelas(cat, valor) : [];
    const pix = RB.valorPix(cat, valor);
    const st = { parcela: 0 };
    body.classList.add('pc-modo');

    const pagamento = () => valor <= 0 ? '<div class="eval eval-good"><strong>Nada a pagar.</strong> Sua entrada cobre o valor do aparelho.</div>' :
      '<button class="opt opt-pix' + (st.parcela === 0 ? ' on' : '') + '" data-n="0"><span><strong>À vista · Pix ou dinheiro</strong></span><span class="opt-val">' + money(pix) + '</span></button>' +
      '<p class="pay-sub">Ou no cartão de crédito</p>' +
      '<div class="opts">' + lista.map((x) => '<button class="opt' + (st.parcela === x.n ? ' on' : '') + '" data-n="' + x.n + '"><span><strong>' + x.n + 'x</strong><small class="pc-parc">' + money(x.parcela) + '</small></span></button>').join('') + '</div>';

    body.innerHTML =
      '<div class="pc-top">✨ Proposta pronta · ' + esc((cat.chat || {}).nome || 'RBChat') + '</div>' +
      fichaProduto(p) +
      '<div class="sim pc">' +
        '<h3 class="sim-title">Sua proposta</h3>' +
        '<div class="summary">' +
          '<div><span>📱 ' + esc(RB.nomeProduto(p)) + (p.cor && !/variad/i.test(p.cor) ? ' · ' + esc(p.cor) : '') + '</span><span>' + esc(p.condicao) + '</span></div>' +
          '<div><span>🛡️ Garantia</span><span>' + esc(RB.garantia(p, cat)) + '</span></div>' +
          (av ? '<div class="pc-ent"><span>🔁 Seu iPhone de entrada</span><span>' + esc(av.descricao) + '</span></div>' : '') +
          (descCupom > 0
            ? '<div><span>💰 Valor do aparelho</span><span>' + money(p.preco) + '</span></div>' +
              '<div class="neg cupom-linha"><span>🎟️ Desconto do cupom ' + esc(cupom.codigo) + '</span><span>−' + money(descCupom) + '</span></div>' +
              '<div><span>Valor com cupom</span><span><b>' + money(preco) + '</b></span></div>'
            : cupom ? '<div class="cupom-linha"><span>🎟️ Cupom ' + esc(cupom.codigo) + '</span><span>será aplicado no atendimento</span></div>' : '') +
          '<div class="sum-total"><span>' + (av && av.status === 'ok' ? 'Você paga só a diferença' : av ? 'Valor do aparelho' : 'Valor') + '</span><strong>' + money(valor) + '</strong></div>' +
          (av && av.status === 'ok' ? '<p class="hint ok">A avaliação do seu iPhone é confirmada na loja depois do teste.</p>' : '') +
          (av && av.status !== 'ok' ? '<p class="hint ok">Seu ' + esc(av.descricao.split(' · ')[0]) + ' será avaliado pela loja no WhatsApp e descontado deste valor.</p>' : '') +
        '</div>' +
        '<div class="pay"><h4 class="sim-h">Como você quer pagar?</h4><div id="pc-pag">' + pagamento() + '</div>' +
          (descCupom > 0 ? '<div class="cupom-ativo">🎟️ Você economizou <b>' + money(descCupom) + '</b> com o cupom <b>' + esc(cupom.codigo) + '</b></div>' : '') +
          '<div class="pc-contato">' +
            '<label class="field nome-cli"><span>Seu nome completo</span><input id="nome-cli" autocomplete="name" autocapitalize="words" placeholder="Ex.: Maria da Silva" value="' + esc(nomeP) + '"></label>' +
            '<label class="field nome-cli"><span>Seu WhatsApp</span><input id="fone-cli" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(48) 99999-8888" value="' + esc(foneFmt(foneP)) + '"></label>' +
          '</div>' +
          '<p class="nome-err" id="nome-err" hidden>Preencha seu nome completo e seu WhatsApp com DDD para enviar a proposta.</p>' +
          '<a class="btn btn-whats btn-block" id="enviar" target="_blank" rel="noopener" href="#">Enviar proposta no WhatsApp</a>' +
          '<p class="hint center"><a href="#p/' + encodeURIComponent(p.id) + '" class="pc-editar">Quero mudar algo na proposta →</a></p>' +
        '</div>' +
      '</div>';
    ligarFotos(body, p);

    const msg = () => {
      const l = ['Olá! Sou *' + nomeP.trim() + '* e montei esta proposta pelo ' + ((cat.chat || {}).nome || 'RBChat') + ' do site:', ''];
      l.push('📱 *' + RB.nomeProduto(p) + '* · ' + p.cor + ' · ' + p.condicao + (RB.ehIphone(p) ? ' · bateria ' + RB.batTexto(p, cat) : p.specs ? ' · ' + p.specs : ''));
      l.push('🛡️ Garantia: ' + RB.garantia(p, cat));
      if (RB.sobEncomenda(p)) l.push('📦 *Sob encomenda* · prazo: ' + prazoEncomenda(p));
      if (descCupom > 0) l.push('Valor: ' + money(p.preco), '🎟️ *Cupom ' + cupom.codigo + ':* −' + money(descCupom), '*Valor com cupom: ' + money(preco) + '*');
      if (av) l.push('', '🔁 *Entrada:* ' + av.descricao + (av.status === 'ok' ? '' : ' (quero avaliar pelo WhatsApp)'));
      l.push('');
      const tipo = av && av.status === 'ok' ? 'Diferença' : 'Valor';
      if (valor <= 0) l.push('💳 ' + tipo + ': nada a pagar');
      else if (st.parcela === 0) l.push('💳 ' + tipo + ': ' + money(pix) + ' à vista (Pix/dinheiro)');
      else { const x = lista.find((y) => y.n === st.parcela); l.push('💳 ' + tipo + ': ' + x.n + 'x de ' + money(x.parcela) + ' no cartão'); }
      if (cupom && !(descCupom > 0)) l.push('', '🎟️ *Cupom:* ' + cupom.codigo);
      return l.join('\n');
    };
    const btn = $('#enviar', body), campo = $('#nome-cli', body), campoFone = $('#fone-cli', body);
    const pronto = () => nomeValido(nomeP) && foneValido(foneP);
    const marcar = () => {
      btn.classList.toggle('pc-off', !pronto());
      if (pronto()) $('#nome-err', body).hidden = true;
      campo.classList.toggle('erro', !$('#nome-err', body).hidden && !nomeValido(nomeP));
      campoFone.classList.toggle('erro', !$('#nome-err', body).hidden && !foneValido(foneP));
    };
    const ligarPag = () => $$('#pc-pag .opt', body).forEach((b) => b.addEventListener('click', () => {
      st.parcela = Number(b.dataset.n); $('#pc-pag', body).innerHTML = pagamento(); ligarPag(); btn.href = RB.linkWhats(cat, msg());
    }));
    ligarPag();
    btn.href = RB.linkWhats(cat, msg());
    campo.addEventListener('input', () => { nomeP = campo.value; marcar(); btn.href = RB.linkWhats(cat, msg()); });
    campoFone.addEventListener('input', () => {
      campoFone.value = foneFmt(campoFone.value);
      foneP = campoFone.value.replace(/\D/g, '');
      marcar();
    });
    marcar();
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!pronto()) {
        $('#nome-err', body).hidden = false; marcar();
        const alvo = !nomeValido(nomeP) ? campo : campoFone;
        alvo.focus(); alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      // salva o cliente na lista do admin e avisa o chat (não pede de novo)
      const zap = '55' + foneP.replace(/\D/g, '');
      const nome = nomeP.trim().replace(/\s+/g, ' ');
      RB.salvarCliente(cat, { origem: 'proposta', nome, whatsapp: zap, interesse: RB.nomeProduto(p) + (p.cor && !/variad/i.test(p.cor) ? ' ' + p.cor : ''), entrada: av ? av.descricao : '' });
      window.dispatchEvent(new CustomEvent('rbtech:contato', { detail: { nome, whatsapp: zap } }));
      const url = RB.linkWhats(cat, msg());
      RB.abrirAviso({
        titulo: RB.formatar(cat, RB.texto(cat, 'avisoT')), texto: RB.formatar(cat, RB.texto(cat, 'avisoS')), botao: RB.texto(cat, 'avisoB'),
        onOk: () => {
          RB.registrar(cat, 'whatsapp', { produto: p, origem: 'chat-proposta', detalhe: (av ? 'entrada ' + av.descricao.split(' · ')[0] + ' · ' : 'sem entrada · ') + (st.parcela ? st.parcela + 'x' : 'à vista') + ' · ' + money(valor) });
          const w = window.open(url, '_blank');
          if (w) w.opener = null; else location.href = url;
        }
      });
    });

    s.hidden = false;
    document.body.classList.add('no-scroll');
    $('.sheet-panel', s).scrollTop = 0;
  }

  let entradaGuardada; // escolha de entrada do cliente, preservada ao abrir um aparelho sem troca
  function fecharSheet(semHistorico) {
    const s = $('#sheet');
    if (s.hidden) return;
    s.hidden = true;
    if (entradaGuardada !== undefined) { entrada.usar = entradaGuardada; entradaGuardada = undefined; }
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
    body.classList.remove('pc-modo');

    body.innerHTML =
      fichaProduto(p) +
      '<div class="sim">' +
        '<h3 class="sim-title">Monte sua proposta</h3>' +
        (!RB.ehIphone(p) ? '<div id="sim-pay"></div></div>' :
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
      '</div>');

    ligarFotos(body, p);

    // MacBook, Xiaomi e iPad: sem aparelho de entrada, vai direto para o pagamento
    if (!RB.ehIphone(p)) {
      entradaGuardada = entrada.usar;
      entrada.usar = false;
    }
    const atualizar = () => {
      if (!RB.ehIphone(p)) { renderPagamento(p, null, pag); return; }
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
    if (RB.ehIphone(p)) formEntrada($('#sim-form', body), () => { pag.parcela = null; atualizar(); });
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
    const cupom = cupomSalvo();
    const descCupom = descontoCupom(p);
    const preco = Math.max(0, p.preco - descCupom); // valor do aparelho já com o cupom
    const diferenca = Math.max(0, preco - valEntrada);
    const sobra = Math.max(0, valEntrada - preco);
    const aba = temEntrada ? (pag.aba || 'diferenca') : 'total';
    const linhaCupom = descCupom > 0 ? '<div class="neg cupom-linha"><span>🎟️ Cupom ' + esc(cupom.codigo) + '</span><span>−' + money(descCupom) + '</span></div>' : '';

    const valor = aba === 'diferenca' ? diferenca : preco;
    const lista = valor > 0 ? RB.parcelas(cat, valor) : [];
    const pix = RB.valorPix(cat, valor);
    const desc = Number(cat.pagamento.descontoPix) || 0;

    let html = '';
    html += '<div class="pay"><h4 class="sim-h"><span class="sim-step">Passo ' + (!RB.ehIphone(p) ? 1 : entrada.usar ? 3 : 2) + '</span> Escolha como pagar</h4>';
    if (temEntrada) {
      html +=
        '<div class="summary">' +
          '<div><span>' + esc(RB.nomeProduto(p)) + '</span><span>' + money(p.preco) + '</span></div>' + linhaCupom +
          '<div class="neg"><span>Seu ' + esc(r.modelo) + ' de entrada</span><span>−' + money(valEntrada) + '</span></div>' +
          '<div class="sum-total"><span>Diferença</span><strong>' + money(diferenca) + '</strong></div>' +
          (sobra > 0 ? '<p class="hint ok">Seu aparelho cobre o valor! Sobra ' + money(sobra) + ' a combinar com a loja.</p>' : '') +
        '</div>' +
        '<div class="tabs" role="tablist">' +
          '<button data-aba="diferenca" class="' + (aba === 'diferenca' ? 'on' : '') + '">Pagar a diferença<small>' + money(diferenca) + '</small></button>' +
          '<button data-aba="total" class="' + (aba === 'total' ? 'on' : '') + '">Valor total sem entrada<small>' + money(preco) + '</small></button>' +
        '</div>';
    } else if (consultar) {
      html += '<div class="summary"><div><span>' + esc(RB.nomeProduto(p)) + '</span><span>' + money(p.preco) + '</span></div>' + linhaCupom +
        '<div class="neg"><span>Seu ' + esc(r.modelo) + ' de entrada</span><span>a avaliar</span></div>' +
        '<p class="hint ok">Abaixo, o valor total. O valor do seu iPhone será descontado após a avaliação pelo WhatsApp.</p></div>';
    } else if (descCupom > 0) {
      html += '<div class="summary"><div><span>' + esc(RB.nomeProduto(p)) + '</span><span>' + money(p.preco) + '</span></div>' + linhaCupom +
        '<div class="sum-total"><span>Valor com cupom</span><strong>' + money(preco) + '</strong></div></div>';
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
    if (cupom) html += '<div class="cupom-ativo">🎟️ Cupom <b>' + esc(cupom.codigo) + '</b> ativado · ' +
      (descCupom > 0 ? 'desconto de <b>' + money(descCupom) + '</b> já aplicado nos valores acima' : 'será aplicado no atendimento') + '</div>';
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
    const montar = () => RB.linkWhats(cat, mensagem(p, temEntrada || consultar ? r : null, aba, pag.parcela, valor, lista, pix, descCupom));
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
      ['Garantia', RB.garantia(p, cat)]].filter((x) => x[1]);
    return '<h3 class="pd-h">Especificações</h3><ul class="checklist">' + itens.map(([k, v]) =>
      '<li class="ck ck-ok"><span class="ck-ic">✓</span><div><strong>' + esc(k) + '</strong><small>' + esc(v) + '</small></div></li>').join('') + '</ul>';
  }

  const prazoEncomenda = (p) => String(p.prazo || '').trim() || RB.texto(cat, 'encomendaPrazo');

  function mensagem(p, r, aba, parcela, valor, lista, pix, descCupom) {
    const linhas = ['Olá! Sou *' + nomeCliente.trim() + '* e montei uma proposta pelo site:', ''];
    linhas.push(!RB.ehIphone(p)
      ? ((RB.CATEGORIAS.find((c) => c.id === RB.categoria(p)) || {}).icone || '📦') + ' *' + RB.nomeProduto(p) + '* · ' + p.cor + ' · ' + p.condicao + (p.specs ? ' · ' + p.specs : '')
      : '📱 *' + RB.nomeProduto(p) + '* · ' + p.cor + ' · ' + p.condicao + ' · bateria ' + RB.batTexto(p, cat));
    linhas.push('Valor: ' + money(p.preco));
    const cupom = cupomSalvo();
    if (cupom && descCupom > 0) {
      linhas.push('🎟️ *Cupom ' + cupom.codigo + ':* −' + money(descCupom));
      linhas.push('*Valor com cupom: ' + money(p.preco - descCupom) + '*');
    }
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
    if (cupom && !(descCupom > 0)) linhas.push('', '🎟️ *Cupom:* ' + cupom.codigo + (cupom.titulo ? ' (' + cupom.titulo + ')' : ''));
    return linhas.join('\n');
  }
})();
