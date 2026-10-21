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

  function nomeProduto(p) {
    return [p.modelo, p.armazenamento].filter(Boolean).join(' ');
  }

  // Ilustração de iPhone usada quando o produto ainda não tem foto
  function phoneSVG(hex) {
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
      '<path d="M100 170c-6 0-9-4-14-4s-9 4-13 4c-8 0-14-13-14-24 0-12 7-18 14-18 5 0 9 3 13 3s7-3 13-3c5 0 10 2 13 7-4 3-7 7-7 12 0 6 4 11 9 13-3 6-7 10-14 10zm-6-46c0-6 5-11 10-11 1 6-5 12-10 11z" fill="#000" fill-opacity=".18"/>' +
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
    { grupo: 'Faixa de confiança (abaixo do topo)', itens: [
      ['conf1T', 'Item 1 · título', 'Aparelhos revisados'], ['conf1S', 'Item 1 · detalhe', 'Checklist completo em cada iPhone'],
      ['conf2T', 'Item 2 · título', 'Até {parcelas}x no cartão'], ['conf2S', 'Item 2 · detalhe', 'Pix, débito e crédito'],
      ['conf3T', 'Item 3 · título', 'Seu usado vale como entrada'], ['conf3S', 'Item 3 · detalhe', 'Pré-avaliação na hora'],
      ['conf4T', 'Item 4 · título', 'Atendimento personalizado'], ['conf4S', 'Item 4 · detalhe', 'Tire dúvidas pelo WhatsApp']
    ] },
    { grupo: 'Vitrine', itens: [
      ['vitrineT', 'Título', 'Escolha o seu iPhone'],
      ['vitrineS', 'Texto', 'Toque no aparelho para ver fotos, checklist e simular com o seu iPhone de entrada.']
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

  // tipo: visita | clique | whatsapp | popup
  function registrar(cat, tipo, dados) {
    const r = cat.rastreamento || {};
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
        headers: { apikey: r.supabaseChave, Authorization: 'Bearer ' + r.supabaseChave, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
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
          (pp.cupom ? '<div class="rbp-cupom"><span>Cupom</span><strong>' + esc(pp.cupom) + '</strong><button type="button" data-copiar>Copiar</button></div>' : '') +
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

  global.RB = {
    DRAFT_KEY, CHECKLIST_ITENS, STATUS,
    money, esc, lerRascunho, carregarCatalogo,
    TEXTOS, texto, formatar, registrar, campanhaVigente, abrirPopup,
    avaliar, fmtGB, parcelas, valorPix, linkWhats, nomeProduto, phoneSVG, sha256
  };
})(window);
