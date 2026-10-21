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

  global.RB = {
    DRAFT_KEY, CHECKLIST_ITENS, STATUS,
    money, esc, lerRascunho, carregarCatalogo,
    avaliar, fmtGB, parcelas, valorPix, linkWhats, nomeProduto, phoneSVG, sha256
  };
})(window);
